import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/ks_session=([^;]+)/);
  return await verifyKsSession(match?.[1]);
}
import sql from "mssql";

export const movimentacoesEstoqueRouter = router({
  listar: publicProcedure
    .input(z.object({
      tipo:        z.string().optional(), // E, S, A ou vazio para todos
      guidProduto: z.string().optional(),
      dtInicio:    z.string().optional(),
      dtFim:       z.string().optional(),
      busca:       z.string().optional(),
      page:        z.number().int().min(1).default(1),
      pageSize:    z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conds = ["m.GUIDENTIDADE = @guidentidade"];
      if (input?.tipo) conds.push(`m.TIPO = '${input.tipo.replace(/'/g, "''")}'`);
      if (input?.guidProduto) conds.push("m.GUIDPRODUTO = @guidProduto");
      if (input?.dtInicio) conds.push("CONVERT(DATE, m.DTMOVIMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim) conds.push("CONVERT(DATE, m.DTMOVIMENTO) <= CONVERT(DATE, @dtFim)");
      if (input?.busca) conds.push("(m.NOMEPRODUTO LIKE @busca OR m.NUMERODOC LIKE @busca OR m.MOTIVO LIKE @busca)");
      const where = conds.join(" AND ");

      const guidEnt = session.guidEntidade;
      function addParams(req: ReturnType<typeof pool.request>) {
        req.input("guidentidade", sql.UniqueIdentifier, guidEnt);
        if (input?.guidProduto) req.input("guidProduto", sql.UniqueIdentifier, input.guidProduto);
        if (input?.dtInicio) req.input("dtInicio", sql.NVarChar(10), input.dtInicio);
        if (input?.dtFim)    req.input("dtFim",    sql.NVarChar(10), input.dtFim);
        if (input?.busca)    req.input("busca",    sql.NVarChar(200), `%${input.busca}%`);
        return req;
      }

      const countR = await addParams(pool.request())
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0004.KS00003 m WHERE ${where}`);
      const total = (countR.recordset[0] as { TOTAL: number }).TOTAL;

      const r = await addParams(pool.request())
        .input("offset",   sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
            CONVERT(NVARCHAR(10), m.DTMOVIMENTO, 23) AS dtMovimento,
            m.TIPO,
            CAST(m.GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
            m.NOMEPRODUTO,
            m.QUANTIDADE, m.VALORUNITARIO, m.VALORTOTAL,
            CAST(m.GUIDFORNECEDOR AS NVARCHAR(36)) AS guidFornecedor,
            m.NOMEFORNECEDOR, m.NUMERODOC, m.MOTIVO, m.OBSERVACAO,
            m.DATACADASTRO, m.ULTIMAALTERACAO
          FROM KS0004.KS00003 m
          WHERE ${where}
          ORDER BY m.DTMOVIMENTO DESC, m.DATACADASTRO DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: r.recordset, total };
    }),

  totais: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim:    z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { entradas: 0, saidas: 0, ajustes: 0, saldo: 0 };
      const pool = await getSqlPool();
      const conds = ["GUIDENTIDADE = @guidentidade"];
      if (input?.dtInicio) conds.push("CONVERT(DATE, DTMOVIMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim)    conds.push("CONVERT(DATE, DTMOVIMENTO) <= CONVERT(DATE, @dtFim)");
      const where = conds.join(" AND ");

      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input?.dtInicio ?? null)
        .input("dtFim",    sql.NVarChar(10), input?.dtFim ?? null)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN TIPO='E' THEN VALORTOTAL ELSE 0 END), 0) AS entradas,
            ISNULL(SUM(CASE WHEN TIPO='S' THEN VALORTOTAL ELSE 0 END), 0) AS saidas,
            ISNULL(SUM(CASE WHEN TIPO='A' THEN VALORTOTAL ELSE 0 END), 0) AS ajustes,
            ISNULL(SUM(CASE WHEN TIPO='E' THEN VALORTOTAL WHEN TIPO='S' THEN -VALORTOTAL ELSE 0 END), 0) AS saldo
          FROM KS0004.KS00003
          WHERE ${where}
        `);
      const row = r.recordset[0] as { entradas: number; saidas: number; ajustes: number; saldo: number };
      return row;
    }),

  criar: publicProcedure
    .input(z.object({
      dtMovimento:    z.string().min(10).max(10), // YYYY-MM-DD
      tipo:           z.enum(["E", "S", "A"]),
      guidProduto:    z.string().uuid(),
      nomeProduto:    z.string().min(1).max(100),
      quantidade:     z.number().positive(),
      valorUnitario:  z.number().min(0).default(0),
      guidFornecedor: z.string().uuid().optional(),
      nomeFornecedor: z.string().max(100).optional(),
      numerodoc:      z.string().max(30).optional(),
      motivo:         z.string().max(100).optional(),
      observacao:     z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      const guid = crypto.randomUUID();

      // Inserir movimentação
      await pool.request()
        .input("guidmovimento",  sql.UniqueIdentifier, guid)
        .input("dtmovimento",    sql.NVarChar(10),     input.dtMovimento)
        .input("tipo",           sql.Char(1),          input.tipo)
        .input("guidproduto",    sql.UniqueIdentifier, input.guidProduto)
        .input("nomeproduto",    sql.NVarChar(100),    input.nomeProduto.toUpperCase())
        .input("quantidade",     sql.Decimal(15,4),    input.quantidade)
        .input("valorunitario",  sql.Decimal(15,4),    input.valorUnitario)
        .input("guidfornecedor", sql.UniqueIdentifier, input.guidFornecedor ?? null)
        .input("nomefornecedor", sql.NVarChar(100),    input.nomeFornecedor?.toUpperCase() ?? null)
        .input("numerodoc",      sql.NVarChar(30),     input.numerodoc?.toUpperCase() ?? null)
        .input("motivo",         sql.NVarChar(100),    input.motivo?.toUpperCase() ?? null)
        .input("observacao",     sql.NVarChar(500),    input.observacao?.toUpperCase() ?? null)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0004.KS00003 (
            GUIDMOVIMENTO, DTMOVIMENTO, TIPO, GUIDPRODUTO, NOMEPRODUTO,
            QUANTIDADE, VALORUNITARIO, GUIDFORNECEDOR, NOMEFORNECEDOR,
            NUMERODOC, MOTIVO, OBSERVACAO, GUIDENTIDADE
          ) VALUES (
            @guidmovimento, CONVERT(DATE, @dtmovimento), @tipo, @guidproduto, @nomeproduto,
            @quantidade, @valorunitario, @guidfornecedor, @nomefornecedor,
            @numerodoc, @motivo, @observacao, @guidentidade
          )
        `);

      // Atualizar estoque do produto
      const delta = input.tipo === "E" ? input.quantidade : input.tipo === "S" ? -input.quantidade : 0;
      if (delta !== 0) {
        await pool.request()
          .input("guidproduto",  sql.UniqueIdentifier, input.guidProduto)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("delta",        sql.Decimal(15,4),    delta)
          .query(`
            UPDATE KS0004.KS00001
            SET ESTOQUE = ESTOQUE + @delta, ULTIMAALTERACAO = GETDATE()
            WHERE GUIDPRODUTO = @guidproduto AND GUIDENTIDADE = @guidentidade
          `);
      } else if (input.tipo === "A") {
        // Ajuste: setar estoque diretamente com a quantidade informada
        await pool.request()
          .input("guidproduto",  sql.UniqueIdentifier, input.guidProduto)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("quantidade",   sql.Decimal(15,4),    input.quantidade)
          .query(`
            UPDATE KS0004.KS00001
            SET ESTOQUE = @quantidade, ULTIMAALTERACAO = GETDATE()
            WHERE GUIDPRODUTO = @guidproduto AND GUIDENTIDADE = @guidentidade
          `);
      }

      return { guidMovimento: guid };
    }),

  excluir: publicProcedure
    .input(z.object({ guidMovimento: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();

      // Buscar movimentação para reverter estoque
      const movR = await pool.request()
        .input("guidmovimento", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TIPO, GUIDPRODUTO, QUANTIDADE
          FROM KS0004.KS00003
          WHERE GUIDMOVIMENTO=@guidmovimento AND GUIDENTIDADE=@guidentidade
        `);
      if (movR.recordset.length === 0) throw new Error("Movimentação não encontrada");
      const mov = movR.recordset[0] as { TIPO: string; GUIDPRODUTO: string; QUANTIDADE: number };

      // Reverter estoque
      const delta = mov.TIPO === "E" ? -mov.QUANTIDADE : mov.TIPO === "S" ? mov.QUANTIDADE : 0;
      if (delta !== 0) {
        await pool.request()
          .input("guidproduto",  sql.UniqueIdentifier, mov.GUIDPRODUTO)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("delta",        sql.Decimal(15,4),    delta)
          .query(`
            UPDATE KS0004.KS00001
            SET ESTOQUE = ESTOQUE + @delta, ULTIMAALTERACAO = GETDATE()
            WHERE GUIDPRODUTO = @guidproduto AND GUIDENTIDADE = @guidentidade
          `);
      }

      await pool.request()
        .input("guidmovimento", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`DELETE FROM KS0004.KS00003 WHERE GUIDMOVIMENTO=@guidmovimento AND GUIDENTIDADE=@guidentidade`);
      return { ok: true };
    }),

  movimentacoesPorProduto: publicProcedure
    .input(z.object({ guidProduto: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidproduto",  sql.UniqueIdentifier, input.guidProduto)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 50
            CAST(GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
            CONVERT(NVARCHAR(10), DTMOVIMENTO, 23) AS dtMovimento,
            TIPO, QUANTIDADE, VALORUNITARIO, VALORTOTAL,
            NOMEFORNECEDOR, NUMERODOC, MOTIVO, DATACADASTRO
          FROM KS0004.KS00003
          WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade
          ORDER BY DTMOVIMENTO DESC, DATACADASTRO DESC
        `);
      return r.recordset;
    }),
});

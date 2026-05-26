import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

export const lancamentosCaixaRouter = router({

  listar: publicProcedure
    .input(z.object({
      tipo:      z.enum(["E", "S", "todos"]).default("todos"),
      dtInicio:  z.string().optional(),
      dtFim:     z.string().optional(),
      guidConta: z.string().uuid().optional(),
      busca:     z.string().optional(),
      pagina:    z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(30),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const pagina = input?.pagina ?? 1;
      const porPagina = input?.porPagina ?? 30;
      const offset = (pagina - 1) * porPagina;

      const conditions: string[] = ["l.GUIDENTIDADE = @guidentidade"];
      if (input?.tipo && input.tipo !== "todos") conditions.push(`l.TIPO = '${input.tipo}'`);
      if (input?.dtInicio) conditions.push("l.DTLANCAMENTO >= @dtInicio");
      if (input?.dtFim)    conditions.push("l.DTLANCAMENTO <= @dtFim");
      if (input?.guidConta) conditions.push("l.GUIDCONTA = @guidConta");
      if (input?.busca)    conditions.push("(l.DESCRICAO LIKE @busca OR l.NUMERODOC LIKE @busca)");
      const where = conditions.join(" AND ");

      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("offset",       sql.Int,              offset)
        .input("limit",        sql.Int,              porPagina);
      if (input?.dtInicio) req2.input("dtInicio",  sql.Date,             input.dtInicio);
      if (input?.dtFim)    req2.input("dtFim",     sql.Date,             input.dtFim);
      if (input?.guidConta) req2.input("guidConta", sql.UniqueIdentifier, input.guidConta);
      if (input?.busca)    req2.input("busca",     sql.NVarChar(200),    `%${input.busca}%`);

      const rows = await req2.query(`
        SELECT
          CAST(l.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          l.DTLANCAMENTO, l.TIPO, l.VALOR, l.DESCRICAO, l.NUMERODOC, l.OBSERVACAO,
          CAST(l.GUIDCONTA    AS NVARCHAR(36)) AS guidConta,
          CAST(l.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
          CAST(l.GUIDCENTRO   AS NVARCHAR(36)) AS guidCentro,
          cb.CONTA AS nomeConta,
          n.NATUREZA AS nomeNatureza,
          cc.CENTRO AS nomeCentro,
          l.DATACADASTRO
        FROM KS0003.KS00010 l
        LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA    = l.GUIDCONTA
        LEFT JOIN KS0003.KS00002 n  ON n.GUIDNATUREZA  = l.GUIDNATUREZA
        LEFT JOIN KS0003.KS00007 cc ON cc.GUIDCENTRO   = l.GUIDCENTRO
        WHERE ${where}
        ORDER BY l.DTLANCAMENTO DESC, l.DATACADASTRO DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

      // Totalizadores do período filtrado
      const totReq = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      if (input?.dtInicio) totReq.input("dtInicio",  sql.Date,             input.dtInicio);
      if (input?.dtFim)    totReq.input("dtFim",     sql.Date,             input.dtFim);
      if (input?.guidConta) totReq.input("guidConta", sql.UniqueIdentifier, input.guidConta);
      if (input?.busca)    totReq.input("busca",     sql.NVarChar(200),    `%${input.busca}%`);

      const totR = await totReq.query(`
        SELECT
          COUNT(*) AS total,
          ISNULL(SUM(CASE WHEN l.TIPO='E' THEN l.VALOR ELSE 0 END),0) AS totalEntradas,
          ISNULL(SUM(CASE WHEN l.TIPO='S' THEN l.VALOR ELSE 0 END),0) AS totalSaidas
        FROM KS0003.KS00010 l
        WHERE ${where.replace("@offset","0").replace("@limit","99999")}
      `);

      return {
        dados: rows.recordset,
        total: totR.recordset[0]?.total ?? 0,
        totalEntradas: totR.recordset[0]?.totalEntradas ?? 0,
        totalSaidas:   totR.recordset[0]?.totalSaidas ?? 0,
        pagina,
        porPagina,
      };
    }),

  criar: publicProcedure
    .input(z.object({
      dtLancamento: z.string().min(1),
      tipo:         z.enum(["E", "S"]),
      valor:        z.number().positive(),
      descricao:    z.string().min(1).max(200),
      guidConta:    z.string().uuid().optional().nullable(),
      guidNatureza: z.string().uuid().optional().nullable(),
      guidCentro:   z.string().uuid().optional().nullable(),
      numerodoc:    z.string().max(30).optional().nullable(),
      observacao:   z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const guid = crypto.randomUUID();

      await pool.request()
        .input("guid",         sql.UniqueIdentifier, guid)
        .input("dtlancamento", sql.Date,             input.dtLancamento)
        .input("tipo",         sql.Char(1),          input.tipo)
        .input("valor",        sql.Decimal(15,2),    input.valor)
        .input("descricao",    sql.NVarChar(200),    input.descricao.toUpperCase())
        .input("guidconta",    sql.UniqueIdentifier, input.guidConta ?? null)
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza ?? null)
        .input("guidcentro",   sql.UniqueIdentifier, input.guidCentro ?? null)
        .input("numerodoc",    sql.NVarChar(30),     input.numerodoc ?? null)
        .input("observacao",   sql.NVarChar(500),    input.observacao ?? null)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00010
            (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
          VALUES
            (@guid,@dtlancamento,@tipo,@valor,@descricao,@guidconta,@guidnatureza,@guidcentro,@numerodoc,@observacao,@guidentidade)
        `);

      // Atualizar saldo da conta bancária se informada
      if (input.guidConta) {
        const delta = input.tipo === "E" ? input.valor : -input.valor;
        await pool.request()
          .input("delta",       sql.Decimal(15,2),    delta)
          .input("guidconta",   sql.UniqueIdentifier, input.guidConta)
          .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      }

      return { success: true, guidLancamento: guid };
    }),

  excluir: publicProcedure
    .input(z.object({ guidLancamento: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      // Buscar para reverter saldo
      const lR = await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TIPO, VALOR, GUIDCONTA FROM KS0003.KS00010 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      const l = lR.recordset[0];
      if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });

      await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("DELETE FROM KS0003.KS00010 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");

      // Reverter saldo da conta
      if (l.GUIDCONTA) {
        const delta = l.TIPO === "E" ? -l.VALOR : l.VALOR;
        await pool.request()
          .input("delta",       sql.Decimal(15,2),    delta)
          .input("guidconta",   sql.UniqueIdentifier, l.GUIDCONTA)
          .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      }

      return { success: true };
    }),

  /** Resumo por dia — usado no gráfico de extrato */
  resumoDiario: publicProcedure
    .input(z.object({
      dtInicio:  z.string(),
      dtFim:     z.string(),
      guidConta: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.Date,             input.dtInicio)
        .input("dtFim",        sql.Date,             input.dtFim);
      const contaFilter = input.guidConta
        ? (req2.input("guidconta", sql.UniqueIdentifier, input.guidConta), "AND GUIDCONTA=@guidconta")
        : "";

      const r = await req2.query(`
        SELECT
          CONVERT(NVARCHAR(10), DTLANCAMENTO, 23) AS dia,
          ISNULL(SUM(CASE WHEN TIPO='E' THEN VALOR ELSE 0 END),0) AS entradas,
          ISNULL(SUM(CASE WHEN TIPO='S' THEN VALOR ELSE 0 END),0) AS saidas
        FROM KS0003.KS00010
        WHERE GUIDENTIDADE=@guidentidade
          AND DTLANCAMENTO BETWEEN @dtInicio AND @dtFim
          ${contaFilter}
        GROUP BY DTLANCAMENTO
        ORDER BY DTLANCAMENTO
      `);
      return r.recordset;
    }),
});

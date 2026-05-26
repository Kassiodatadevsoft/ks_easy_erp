import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  return await verifyKsSession(match?.[1]);
}

const lancBase = z.object({
  guidLancamento: z.string().uuid().optional(), // pode vir do PDV offline
  descricao:      z.string().min(1).max(200),
  guidDevedor:    z.string().uuid().optional().nullable(),
  nomeDevedor:    z.string().max(100).optional().nullable(),
  valor:          z.number().min(0),
  dtLancamento:   z.string(),
  dtVencimento:   z.string(),
  guidNatureza:   z.string().uuid().optional().nullable(),
  guidConta:      z.string().uuid().optional().nullable(),
  guidCentro:     z.string().uuid().optional().nullable(),
  guidPagamento:  z.string().uuid().optional().nullable(),
  numeroDoc:      z.string().max(50).optional().nullable(),
  parcela:        z.number().int().min(1).default(1),
  totalParcelas:  z.number().int().min(1).default(1),
  observacao:     z.string().max(500).optional().nullable(),
  origem:         z.string().max(20).default("MANUAL"),
  guidOrigem:     z.string().uuid().optional().nullable(),
});

export const contasReceberRouter = router({
  listar: publicProcedure
    .input(z.object({
      busca:    z.string().optional(),
      status:   z.string().optional(),
      dtInicio: z.string().optional(),
      dtFim:    z.string().optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = ["cr.GUIDENTIDADE = @guidentidade"];
      if (input?.status) conditions.push(`cr.STATUS = '${input.status.replace(/'/g, "''")}' `);
      if (input?.dtInicio) conditions.push("CONVERT(DATE, cr.DTVENCIMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim) conditions.push("CONVERT(DATE, cr.DTVENCIMENTO) <= CONVERT(DATE, @dtFim)");
      if (input?.busca) conditions.push("(cr.DESCRICAO LIKE @busca OR cr.NOMEDEVEDOR LIKE @busca OR cr.NUMERODOC LIKE @busca)");
      const where = conditions.join(" AND ");

      const guidEnt = session.guidEntidade;
      function addParams(req: ReturnType<typeof pool.request>) {
        req.input("guidentidade", sql.UniqueIdentifier, guidEnt);
        if (input?.dtInicio) req.input("dtInicio", sql.NVarChar(10), input.dtInicio);
        if (input?.dtFim)    req.input("dtFim",    sql.NVarChar(10), input.dtFim);
        if (input?.busca)    req.input("busca",    sql.NVarChar(200), `%${input.busca}%`);
        return req;
      }

      const countR = await addParams(pool.request())
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0003.KS00005 cr WHERE ${where}`);
      const total = (countR.recordset[0] as { TOTAL: number }).TOTAL;

      const r = await addParams(pool.request())
        .input("offset",   sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
            cr.DESCRICAO, cr.NOMEDEVEDOR,
            CAST(cr.GUIDDEVEDOR AS NVARCHAR(36)) AS guidDevedor,
            cr.VALOR, cr.VALORRECEBIDO,
            CONVERT(NVARCHAR(10), cr.DTLANCAMENTO, 23)  AS dtLancamento,
            CONVERT(NVARCHAR(10), cr.DTVENCIMENTO, 23)  AS dtVencimento,
            CONVERT(NVARCHAR(10), cr.DTRECEBIMENTO, 23) AS dtRecebimento,
            CAST(cr.GUIDNATUREZA AS NVARCHAR(36))   AS guidNatureza,
            n.NATUREZA                               AS nomeNatureza,
            CAST(cr.GUIDCENTRO AS NVARCHAR(36))     AS guidCentro,
            cc.CENTRO                                AS nomeCentro,
            CAST(cr.GUIDPAGAMENTO AS NVARCHAR(36))  AS guidPagamento,
            fp.PAGAMENTO                             AS nomePagamento,
            cr.NUMERODOC, cr.PARCELA, cr.TOTALPARCELAS,
            cr.STATUS, cr.OBSERVACAO, cr.ORIGEM,
            cr.DATACADASTRO, cr.ULTIMAALTERACAO
          FROM KS0003.KS00005 cr
          LEFT JOIN KS0003.KS00003 n  ON n.GUIDNATUREZA   = cr.GUIDNATUREZA
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO    = cr.GUIDCENTRO
          LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = cr.GUIDPAGAMENTO
          WHERE ${where}
          ORDER BY cr.DTVENCIMENTO ASC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: r.recordset, total };
    }),

  totais: publicProcedure
    .input(z.object({ dtInicio: z.string().optional(), dtFim: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { aberto: 0, recebido: 0, vencido: 0, total: 0 };
      const pool = await getSqlPool();
      const conds2: string[] = ["GUIDENTIDADE = @guidentidade"];
      if (input?.dtInicio) conds2.push("CONVERT(DATE, DTVENCIMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim)    conds2.push("CONVERT(DATE, DTVENCIMENTO) <= CONVERT(DATE, @dtFim)");
      const where2 = conds2.join(" AND ");
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input?.dtInicio ?? null)
        .input("dtFim",    sql.NVarChar(10), input?.dtFim ?? null)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN STATUS IN ('ABERTO','PARCIAL') AND DTVENCIMENTO >= CAST(GETDATE() AS DATE) THEN VALOR - VALORRECEBIDO ELSE 0 END), 0) AS ABERTO,
            ISNULL(SUM(CASE WHEN STATUS = 'PAGO' THEN VALORRECEBIDO ELSE 0 END), 0) AS RECEBIDO,
            ISNULL(SUM(CASE WHEN STATUS IN ('ABERTO','PARCIAL') AND DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN VALOR - VALORRECEBIDO ELSE 0 END), 0) AS VENCIDO,
            ISNULL(SUM(VALOR), 0) AS TOTAL
          FROM KS0003.KS00005 WHERE ${where2}
        `);
      const row = r.recordset[0] as { ABERTO: number; RECEBIDO: number; VENCIDO: number; TOTAL: number };
      return { aberto: row.ABERTO, recebido: row.RECEBIDO, vencido: row.VENCIDO, total: row.TOTAL };
    }),

  criar: publicProcedure.input(lancBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const guid = input.guidLancamento ?? crypto.randomUUID();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, guid)
      .input("descricao",      sql.NVarChar(200),    input.descricao)
      .input("guiddevedor",    sql.UniqueIdentifier, input.guidDevedor ?? null)
      .input("nomedevedor",    sql.NVarChar(100),    input.nomeDevedor ?? null)
      .input("valor",          sql.Decimal(15, 2),   input.valor)
      .input("dtlancamento",   sql.NVarChar(10),             input.dtLancamento)
      .input("dtvencimento",   sql.NVarChar(10),             input.dtVencimento)
      .input("guidnatureza",   sql.UniqueIdentifier, input.guidNatureza ?? null)
      .input("guidconta",      sql.UniqueIdentifier, input.guidConta ?? null)
      .input("guidcentro",     sql.UniqueIdentifier, input.guidCentro ?? null)
      .input("guidpagamento",  sql.UniqueIdentifier, input.guidPagamento ?? null)
      .input("numerodoc",      sql.NVarChar(50),     input.numeroDoc ?? null)
      .input("parcela",        sql.SmallInt,         input.parcela)
      .input("totalparcelas",  sql.SmallInt,         input.totalParcelas)
      .input("observacao",     sql.NVarChar(500),    input.observacao ?? null)
      .input("origem",         sql.NVarChar(20),     input.origem)
      .input("guidorigem",     sql.UniqueIdentifier, input.guidOrigem ?? null)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00005
          (GUIDLANCAMENTO,DESCRICAO,GUIDDEVEDOR,NOMEDEVEDOR,VALOR,DTLANCAMENTO,DTVENCIMENTO,
           GUIDNATUREZA,GUIDCONTA,GUIDCENTRO,GUIDPAGAMENTO,NUMERODOC,PARCELA,TOTALPARCELAS,
           OBSERVACAO,ORIGEM,GUIDORIGEM,GUIDENTIDADE)
        VALUES
          (@guidlancamento,@descricao,@guiddevedor,@nomedevedor,@valor,@dtlancamento,@dtvencimento,
           @guidnatureza,@guidconta,@guidcentro,@guidpagamento,@numerodoc,@parcela,@totalparcelas,
           @observacao,@origem,@guidorigem,@guidentidade)
      `);
    return { success: true, guidLancamento: guid };
  }),

  atualizar: publicProcedure.input(lancBase.extend({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("descricao",      sql.NVarChar(200),    input.descricao)
      .input("guiddevedor",    sql.UniqueIdentifier, input.guidDevedor ?? null)
      .input("nomedevedor",    sql.NVarChar(100),    input.nomeDevedor ?? null)
      .input("valor",          sql.Decimal(15, 2),   input.valor)
      .input("dtlancamento",   sql.NVarChar(10),             input.dtLancamento)
      .input("dtvencimento",   sql.NVarChar(10),             input.dtVencimento)
      .input("guidnatureza",   sql.UniqueIdentifier, input.guidNatureza ?? null)
      .input("guidconta",      sql.UniqueIdentifier, input.guidConta ?? null)
      .input("guidcentro",     sql.UniqueIdentifier, input.guidCentro ?? null)
      .input("guidpagamento",  sql.UniqueIdentifier, input.guidPagamento ?? null)
      .input("numerodoc",      sql.NVarChar(50),     input.numeroDoc ?? null)
      .input("parcela",        sql.SmallInt,         input.parcela)
      .input("totalparcelas",  sql.SmallInt,         input.totalParcelas)
      .input("observacao",     sql.NVarChar(500),    input.observacao ?? null)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00005 SET
          DESCRICAO=@descricao, GUIDDEVEDOR=@guiddevedor, NOMEDEVEDOR=@nomedevedor,
          VALOR=@valor, DTLANCAMENTO=@dtlancamento, DTVENCIMENTO=@dtvencimento,
          GUIDNATUREZA=@guidnatureza, GUIDCONTA=@guidconta, GUIDCENTRO=@guidcentro,
          GUIDPAGAMENTO=@guidpagamento, NUMERODOC=@numerodoc, PARCELA=@parcela,
          TOTALPARCELAS=@totalparcelas, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS='ABERTO'
      `);
    return { success: true };
  }),

  baixar: publicProcedure
    .input(z.object({
      guidLancamento: z.string().uuid(),
      valorRecebido:  z.number().min(0),
      dtRecebimento:  z.string(),
      guidPagamento:  z.string().uuid().optional().nullable(),
      observacao:     z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      const lancR = await pool.request()
        .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`SELECT VALOR, VALORRECEBIDO, GUIDNATUREZA, GUIDCENTRO, DESCRICAO FROM KS0003.KS00005 WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade`);
      const lanc = lancR.recordset[0] as { VALOR: number; VALORRECEBIDO: number; GUIDNATUREZA: string; GUIDCENTRO: string; DESCRICAO: string } | undefined;
      if (!lanc) throw new Error("Lançamento não encontrado");
      const totalRecebido = Number(lanc.VALORRECEBIDO) + input.valorRecebido;
      const status = totalRecebido >= Number(lanc.VALOR) ? "PAGO" : "PARCIAL";
      await pool.request()
        .input("guidlancamento",  sql.UniqueIdentifier, input.guidLancamento)
        .input("valorrecebido",   sql.Decimal(15, 2),   totalRecebido)
        .input("dtrecebimento",   sql.NVarChar(10),             input.dtRecebimento)
        .input("guidpagamento",   sql.UniqueIdentifier, input.guidPagamento ?? null)
        .input("status",          sql.NVarChar(10),     status)
        .input("guidentidade",    sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00005 SET
            VALORRECEBIDO=@valorrecebido, DTRECEBIMENTO=@dtrecebimento,
            GUIDPAGAMENTO=@guidpagamento, STATUS=@status, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade
        `);
      // Registrar movimentação de caixa
      const guidMov = crypto.randomUUID();
      await pool.request()
        .input("guidmovimento",  sql.UniqueIdentifier, guidMov)
        .input("descricao",      sql.NVarChar(200),    `RECBT: ${lanc.DESCRICAO}`)
        .input("valor",          sql.Decimal(15, 2),   input.valorRecebido)
        .input("dtmov",          sql.NVarChar(10),             input.dtRecebimento)
        .input("guidnatureza",   sql.UniqueIdentifier, lanc.GUIDNATUREZA ?? null)
        .input("guidcentro",     sql.UniqueIdentifier, lanc.GUIDCENTRO ?? null)
        .input("guidpagamento",  sql.UniqueIdentifier, input.guidPagamento ?? null)
        .input("guidlancreceber",sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00007
            (GUIDMOVIMENTO,DATA,TIPO,DESCRICAO,VALOR,GUIDNATUREZA,GUIDCENTRO,GUIDPAGAMENTO,GUIDLANCRECEBER,ORIGEM,GUIDENTIDADE)
          VALUES
            (@guidmovimento,@dtmov,'R',@descricao,@valor,@guidnatureza,@guidcentro,@guidpagamento,@guidlancreceber,'BAIXA',@guidentidade)
        `);
      return { success: true, status };
    }),

  cancelar: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`UPDATE KS0003.KS00005 SET STATUS='CANCELADO', ULTIMAALTERACAO=GETDATE() WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade`);
    return { success: true };
  }),

  excluir: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`DELETE FROM KS0003.KS00005 WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS IN ('ABERTO','CANCELADO')`);
    return { success: true };
  }),

  // Buscar clientes para autocomplete do campo Devedor
  buscarClientes: publicProcedure
    .input(z.object({ busca: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const b = input.busca.replace(/'/g, "''");
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 10
            CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidPessoa,
            ISNULL(FANTASIA, NOME) AS nome,
            DOCUMENTO
          FROM KS0002.KS00001
          WHERE GUIDENTIDADE = @guidentidade
            AND CADCLIENTE = 1
            AND SITUACAO = 'A'
            AND (NOME LIKE '%${b}%' OR FANTASIA LIKE '%${b}%' OR DOCUMENTO LIKE '%${b}%')
          ORDER BY ISNULL(FANTASIA, NOME)
        `);
      return r.recordset as { guidPessoa: string; nome: string; documento: string }[];
    }),
});

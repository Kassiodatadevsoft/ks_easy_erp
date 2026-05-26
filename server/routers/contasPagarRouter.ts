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
  guidCredor:     z.string().uuid().optional().nullable(),
  nomeCredor:     z.string().max(100).optional().nullable(),
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

export const contasPagarRouter = router({
  listar: publicProcedure
    .input(z.object({
      busca:      z.string().optional(),
      status:     z.string().optional(),
      dtInicio:   z.string().optional(),
      dtFim:      z.string().optional(),
      page:       z.number().int().min(1).default(1),
      pageSize:   z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      let where = "cp.GUIDENTIDADE = @guidentidade";
      if (input?.status) where += ` AND cp.STATUS = '${input.status}'`;
      if (input?.dtInicio) where += ` AND cp.DTVENCIMENTO >= '${input.dtInicio}'`;
      if (input?.dtFim) where += ` AND cp.DTVENCIMENTO <= '${input.dtFim}'`;
      if (input?.busca) {
        const b = input.busca.replace(/'/g, "''");
        where += ` AND (cp.DESCRICAO LIKE '%${b}%' OR cp.NOMECREDOR LIKE '%${b}%' OR cp.NUMERODOC LIKE '%${b}%')`;
      }

      const countR = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0003.KS00004 cp WHERE ${where}`);
      const total = (countR.recordset[0] as { TOTAL: number }).TOTAL;

      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("offset",       sql.Int,              offset)
        .input("pageSize",     sql.Int,              pageSize)
        .query(`
          SELECT
            CAST(cp.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
            cp.DESCRICAO, cp.NOMECREDOR,
            CAST(cp.GUIDCREDOR AS NVARCHAR(36)) AS guidCredor,
            cp.VALOR, cp.VALORPAGO,
            CONVERT(NVARCHAR(10), cp.DTLANCAMENTO, 23)  AS dtLancamento,
            CONVERT(NVARCHAR(10), cp.DTVENCIMENTO, 23)  AS dtVencimento,
            CONVERT(NVARCHAR(10), cp.DTPAGAMENTO, 23)   AS dtPagamento,
            CAST(cp.GUIDNATUREZA AS NVARCHAR(36))   AS guidNatureza,
            n.NATUREZA                               AS nomeNatureza,
            CAST(cp.GUIDCENTRO AS NVARCHAR(36))     AS guidCentro,
            cc.CENTRO                                AS nomeCentro,
            CAST(cp.GUIDPAGAMENTO AS NVARCHAR(36))  AS guidPagamento,
            fp.PAGAMENTO                             AS nomePagamento,
            cp.NUMERODOC, cp.PARCELA, cp.TOTALPARCELAS,
            cp.STATUS, cp.OBSERVACAO, cp.ORIGEM,
            cp.DATACADASTRO, cp.ULTIMAALTERACAO
          FROM KS0003.KS00004 cp
          LEFT JOIN KS0003.KS00003 n  ON n.GUIDNATUREZA   = cp.GUIDNATUREZA
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO    = cp.GUIDCENTRO
          LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = cp.GUIDPAGAMENTO
          WHERE ${where}
          ORDER BY cp.DTVENCIMENTO ASC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: r.recordset, total };
    }),

  totais: publicProcedure
    .input(z.object({ dtInicio: z.string().optional(), dtFim: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { aberto: 0, pago: 0, vencido: 0, total: 0 };
      const pool = await getSqlPool();
      let where = "GUIDENTIDADE = @guidentidade";
      if (input?.dtInicio) where += ` AND DTVENCIMENTO >= '${input.dtInicio}'`;
      if (input?.dtFim) where += ` AND DTVENCIMENTO <= '${input.dtFim}'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN STATUS IN ('ABERTO','PARCIAL') AND DTVENCIMENTO >= CAST(GETDATE() AS DATE) THEN VALOR - VALORPAGO ELSE 0 END), 0) AS ABERTO,
            ISNULL(SUM(CASE WHEN STATUS = 'PAGO' THEN VALORPAGO ELSE 0 END), 0) AS PAGO,
            ISNULL(SUM(CASE WHEN STATUS IN ('ABERTO','PARCIAL') AND DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN VALOR - VALORPAGO ELSE 0 END), 0) AS VENCIDO,
            ISNULL(SUM(VALOR), 0) AS TOTAL
          FROM KS0003.KS00004 WHERE ${where}
        `);
      const row = r.recordset[0] as { ABERTO: number; PAGO: number; VENCIDO: number; TOTAL: number };
      return { aberto: row.ABERTO, pago: row.PAGO, vencido: row.VENCIDO, total: row.TOTAL };
    }),

  criar: publicProcedure.input(lancBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const guid = input.guidLancamento ?? crypto.randomUUID();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, guid)
      .input("descricao",      sql.NVarChar(200),    input.descricao)
      .input("guidcredor",     sql.UniqueIdentifier, input.guidCredor ?? null)
      .input("nomecredor",     sql.NVarChar(100),    input.nomeCredor ?? null)
      .input("valor",          sql.Decimal(15, 2),   input.valor)
      .input("dtlancamento",   sql.Date,             input.dtLancamento)
      .input("dtvencimento",   sql.Date,             input.dtVencimento)
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
        INSERT INTO KS0003.KS00004
          (GUIDLANCAMENTO,DESCRICAO,GUIDCREDOR,NOMECREDOR,VALOR,DTLANCAMENTO,DTVENCIMENTO,
           GUIDNATUREZA,GUIDCONTA,GUIDCENTRO,GUIDPAGAMENTO,NUMERODOC,PARCELA,TOTALPARCELAS,
           OBSERVACAO,ORIGEM,GUIDORIGEM,GUIDENTIDADE)
        VALUES
          (@guidlancamento,@descricao,@guidcredor,@nomecredor,@valor,@dtlancamento,@dtvencimento,
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
      .input("guidcredor",     sql.UniqueIdentifier, input.guidCredor ?? null)
      .input("nomecredor",     sql.NVarChar(100),    input.nomeCredor ?? null)
      .input("valor",          sql.Decimal(15, 2),   input.valor)
      .input("dtlancamento",   sql.Date,             input.dtLancamento)
      .input("dtvencimento",   sql.Date,             input.dtVencimento)
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
        UPDATE KS0003.KS00004 SET
          DESCRICAO=@descricao, GUIDCREDOR=@guidcredor, NOMECREDOR=@nomecredor,
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
      valorPago:      z.number().min(0),
      dtPagamento:    z.string(),
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
        .query(`SELECT VALOR, VALORPAGO, GUIDNATUREZA, GUIDCENTRO, DESCRICAO FROM KS0003.KS00004 WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade`);
      const lanc = lancR.recordset[0] as { VALOR: number; VALORPAGO: number; GUIDNATUREZA: string; GUIDCENTRO: string; DESCRICAO: string } | undefined;
      if (!lanc) throw new Error("Lançamento não encontrado");
      const totalPago = Number(lanc.VALORPAGO) + input.valorPago;
      const status = totalPago >= Number(lanc.VALOR) ? "PAGO" : "PARCIAL";
      await pool.request()
        .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
        .input("valorpago",      sql.Decimal(15, 2),   totalPago)
        .input("dtpagamento",    sql.Date,             input.dtPagamento)
        .input("guidpagamento",  sql.UniqueIdentifier, input.guidPagamento ?? null)
        .input("status",         sql.NVarChar(10),     status)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00004 SET
            VALORPAGO=@valorpago, DTPAGAMENTO=@dtpagamento,
            GUIDPAGAMENTO=@guidpagamento, STATUS=@status, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade
        `);
      // Registrar movimentação de caixa
      const guidMov = crypto.randomUUID();
      await pool.request()
        .input("guidmovimento",  sql.UniqueIdentifier, guidMov)
        .input("descricao",      sql.NVarChar(200),    `PAGTO: ${lanc.DESCRICAO}`)
        .input("valor",          sql.Decimal(15, 2),   input.valorPago)
        .input("dtmov",          sql.Date,             input.dtPagamento)
        .input("guidnatureza",   sql.UniqueIdentifier, lanc.GUIDNATUREZA ?? null)
        .input("guidcentro",     sql.UniqueIdentifier, lanc.GUIDCENTRO ?? null)
        .input("guidpagamento",  sql.UniqueIdentifier, input.guidPagamento ?? null)
        .input("guidlancpagar",  sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00007
            (GUIDMOVIMENTO,DATA,TIPO,DESCRICAO,VALOR,GUIDNATUREZA,GUIDCENTRO,GUIDPAGAMENTO,GUIDLANCPAGAR,ORIGEM,GUIDENTIDADE)
          VALUES
            (@guidmovimento,@dtmov,'D',@descricao,@valor,@guidnatureza,@guidcentro,@guidpagamento,@guidlancpagar,'BAIXA',@guidentidade)
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
      .query(`UPDATE KS0003.KS00004 SET STATUS='CANCELADO', ULTIMAALTERACAO=GETDATE() WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade`);
    return { success: true };
  }),

  excluir: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`DELETE FROM KS0003.KS00004 WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS IN ('ABERTO','CANCELADO')`);
    return { success: true };
  }),

  // Buscar fornecedores para autocomplete do campo Credor
  buscarFornecedores: publicProcedure
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
            AND CADFORNECEDOR = 1
            AND SITUACAO = 'A'
            AND (NOME LIKE '%${b}%' OR FANTASIA LIKE '%${b}%' OR DOCUMENTO LIKE '%${b}%')
          ORDER BY ISNULL(FANTASIA, NOME)
        `);
      return r.recordset as { guidPessoa: string; nome: string; documento: string }[];
    }),
});

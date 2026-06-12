import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import { getBoletoConfig, getBoletoProvider, type BoletoBanco, type BoletoStatus } from "../services/boletos";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
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
  guidNatureza:   z.string().uuid("Natureza de caixa obrigatoria"),
  guidConta:      z.string().uuid("Conta do plano de contas obrigatoria"),
  guidCentro:     z.string().uuid("Centro de custo obrigatorio"),
  guidPagamento:  z.string().uuid().optional().nullable(),
  numeroDoc:      z.string().max(50).optional().nullable(),
  parcela:        z.number().int().min(1).default(1),
  totalParcelas:  z.number().int().min(1).default(1),
  observacao:     z.string().max(500).optional().nullable(),
  origem:         z.string().max(20).default("MANUAL"),
  guidOrigem:     z.string().uuid().optional().nullable(),
});

const boletoBancoSchema = z.enum(["ITAU", "CORA"]);
const BOLETO_STATUS = [
  "NAO_EMITIDO",
  "PENDENTE",
  "REGISTRADO",
  "PAGO",
  "CANCELADO",
  "VENCIDO",
  "ERRO",
] as const;

async function garantirTabelasBoletos(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00011')
    CREATE TABLE KS0003.KS00011 (
      GUIDBOLETO      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDLANCAMENTO  UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      BANCO           NVARCHAR(20)     NOT NULL,
      VALOR           DECIMAL(15,2)    NOT NULL,
      VENCIMENTO      DATE             NOT NULL,
      STATUS          NVARCHAR(20)     NOT NULL DEFAULT 'PENDENTE',
      NOSSONUMERO     NVARCHAR(80)     NULL,
      LINHADIGITAVEL  NVARCHAR(160)    NULL,
      CODIGOBARRAS    NVARCHAR(120)    NULL,
      URLPDF          NVARCHAR(1000)   NULL,
      EXTERNALID      NVARCHAR(160)    NULL,
      MENSAGEMERRO    NVARCHAR(1000)   NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00011_LANCAMENTO' AND object_id=OBJECT_ID('KS0003.KS00011'))
      CREATE INDEX IX_KS00011_LANCAMENTO ON KS0003.KS00011 (GUIDENTIDADE, GUIDLANCAMENTO, ULTIMAALTERACAO)
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00012')
    CREATE TABLE KS0003.KS00012 (
      GUIDEVENTO      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDBOLETO      UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      TIPOEVENTO      NVARCHAR(40)     NOT NULL,
      DESCRICAO       NVARCHAR(500)    NULL,
      REQUESTJSON     NVARCHAR(MAX)    NULL,
      RESPONSEJSON    NVARCHAR(MAX)    NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00012_BOLETO' AND object_id=OBJECT_ID('KS0003.KS00012'))
      CREATE INDEX IX_KS00012_BOLETO ON KS0003.KS00012 (GUIDENTIDADE, GUIDBOLETO, DATACADASTRO)
  `);
}

async function registrarEventoBoleto(
  pool: Awaited<ReturnType<typeof getSqlPool>>,
  params: {
    guidBoleto: string;
    guidEntidade: string;
    tipo: string;
    descricao?: string | null;
    request?: unknown;
    response?: unknown;
  }
) {
  await pool.request()
    .input("guidevento", sql.UniqueIdentifier, crypto.randomUUID())
    .input("guidboleto", sql.UniqueIdentifier, params.guidBoleto)
    .input("guidentidade", sql.UniqueIdentifier, params.guidEntidade)
    .input("tipo", sql.NVarChar(40), params.tipo)
    .input("descricao", sql.NVarChar(500), params.descricao ?? null)
    .input("requestjson", sql.NVarChar(sql.MAX), params.request ? JSON.stringify(params.request) : null)
    .input("responsejson", sql.NVarChar(sql.MAX), params.response ? JSON.stringify(params.response) : null)
    .query(`
      INSERT INTO KS0003.KS00012
        (GUIDEVENTO, GUIDBOLETO, GUIDENTIDADE, TIPOEVENTO, DESCRICAO, REQUESTJSON, RESPONSEJSON)
      VALUES
        (@guidevento, @guidboleto, @guidentidade, @tipo, @descricao, @requestjson, @responsejson)
    `);
}

async function buscarBoletoAtual(
  pool: Awaited<ReturnType<typeof getSqlPool>>,
  guidLancamento: string,
  guidEntidade: string
) {
  const r = await pool.request()
    .input("guidlancamento", sql.UniqueIdentifier, guidLancamento)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT TOP 1
        CAST(GUIDBOLETO AS NVARCHAR(36)) AS guidBoleto,
        CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
        BANCO, VALOR, CONVERT(NVARCHAR(10), VENCIMENTO, 23) AS vencimento,
        STATUS, NOSSONUMERO, LINHADIGITAVEL, CODIGOBARRAS, URLPDF, EXTERNALID, MENSAGEMERRO
      FROM KS0003.KS00011
      WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade
      ORDER BY DATACADASTRO DESC
    `);
  return r.recordset[0] as {
    guidBoleto: string;
    guidLancamento: string;
    BANCO: BoletoBanco;
    VALOR: number;
    vencimento: string;
    STATUS: BoletoStatus;
    NOSSONUMERO: string | null;
    LINHADIGITAVEL: string | null;
    CODIGOBARRAS: string | null;
    URLPDF: string | null;
    EXTERNALID: string | null;
    MENSAGEMERRO: string | null;
  } | undefined;
}

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
      await garantirTabelasBoletos(pool);
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
            CAST(cr.GUIDCONTA AS NVARCHAR(36))      AS guidConta,
            n.NATUREZA                               AS nomeNatureza,
            CAST(cr.GUIDCENTRO AS NVARCHAR(36))     AS guidCentro,
            cc.CENTRO                                AS nomeCentro,
            CAST(cr.GUIDPAGAMENTO AS NVARCHAR(36))  AS guidPagamento,
            fp.PAGAMENTO                             AS nomePagamento,
            cr.NUMERODOC, cr.PARCELA, cr.TOTALPARCELAS,
            cr.STATUS, cr.OBSERVACAO, cr.ORIGEM, cr.MOTIVOCANCELAMENTO,
            b.STATUS AS boletoStatus,
            b.BANCO AS boletoBanco,
            CAST(b.GUIDBOLETO AS NVARCHAR(36)) AS guidBoleto,
            b.LINHADIGITAVEL AS boletoLinhaDigitavel,
            b.URLPDF AS boletoUrlPdf,
            b.MENSAGEMERRO AS boletoMensagemErro,
            cr.DATACADASTRO, cr.ULTIMAALTERACAO
          FROM KS0003.KS00005 cr
          LEFT JOIN KS0003.KS00003 n  ON n.GUIDNATUREZA   = cr.GUIDNATUREZA
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO    = cr.GUIDCENTRO
          LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = cr.GUIDPAGAMENTO
          OUTER APPLY (
            SELECT TOP 1 GUIDBOLETO, STATUS, BANCO, LINHADIGITAVEL, URLPDF, MENSAGEMERRO
            FROM KS0003.KS00011
            WHERE GUIDLANCAMENTO = cr.GUIDLANCAMENTO AND GUIDENTIDADE = cr.GUIDENTIDADE
            ORDER BY DATACADASTRO DESC
          ) b
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
      contaBancaria:  z.string().uuid("Conta/caixa do recebimento obrigatoria"),
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
        .input("guidconta",      sql.UniqueIdentifier, input.contaBancaria)
        .input("valor",          sql.Decimal(15, 2),   input.valorRecebido)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00008
          SET SALDOATUAL = SALDOATUAL + @valor, ULTIMAALTERACAO = GETDATE()
          WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
        `);
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

  cancelar: publicProcedure.input(z.object({
    guidLancamento: z.string().uuid(),
    motivo: z.string().min(3).max(500),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("motivo",         sql.NVarChar(500),    input.motivo.toUpperCase())
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00005
        SET STATUS='CANCELADO', MOTIVOCANCELAMENTO=@motivo, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS='ABERTO'
      `);
    return { success: true };
  }),

  excluir: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00005
        SET STATUS='CANCELADO', ULTIMAALTERACAO=GETDATE()
        WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS='ABERTO'
      `);
    return { success: true };
  }),

  emitirBoleto: publicProcedure
    .input(z.object({
      guidLancamento: z.string().uuid(),
      banco: boletoBancoSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await garantirTabelasBoletos(pool);

      const tituloR = await pool.request()
        .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 1
            CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
            cr.DESCRICAO, cr.VALOR, cr.VALORRECEBIDO,
            CONVERT(NVARCHAR(10), cr.DTVENCIMENTO, 23) AS dtVencimento,
            cr.NOMEDEVEDOR, cr.NUMERODOC, cr.STATUS,
            p.DOCUMENTO, p.EMAIL
          FROM KS0003.KS00005 cr
          LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA = cr.GUIDDEVEDOR
          WHERE cr.GUIDLANCAMENTO=@guidlancamento AND cr.GUIDENTIDADE=@guidentidade
        `);
      const titulo = tituloR.recordset[0] as {
        guidLancamento: string;
        DESCRICAO: string;
        VALOR: number;
        VALORRECEBIDO: number;
        dtVencimento: string;
        NOMEDEVEDOR: string | null;
        NUMERODOC: string | null;
        STATUS: string;
        DOCUMENTO: string | null;
        EMAIL: string | null;
      } | undefined;
      if (!titulo) throw new Error("Título não encontrado.");
      if (!["ABERTO", "PARCIAL"].includes(titulo.STATUS)) {
        throw new Error("Boleto só pode ser emitido para título aberto ou parcial.");
      }

      const boletoExistente = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      if (boletoExistente && !["ERRO", "CANCELADO"].includes(boletoExistente.STATUS)) {
        return { success: true, boleto: boletoExistente };
      }

      const guidBoleto = crypto.randomUUID();
      await pool.request()
        .input("guidboleto", sql.UniqueIdentifier, guidBoleto)
        .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("banco", sql.NVarChar(20), input.banco)
        .input("valor", sql.Decimal(15, 2), Number(titulo.VALOR) - Number(titulo.VALORRECEBIDO ?? 0))
        .input("vencimento", sql.NVarChar(10), titulo.dtVencimento)
        .query(`
          INSERT INTO KS0003.KS00011
            (GUIDBOLETO, GUIDLANCAMENTO, GUIDENTIDADE, BANCO, VALOR, VENCIMENTO, STATUS)
          VALUES
            (@guidboleto, @guidlancamento, @guidentidade, @banco, @valor, @vencimento, 'PENDENTE')
        `);

      try {
        const config = await getBoletoConfig(pool, session.guidEntidade, input.banco);
        if (!config) {
          throw new Error(`Nenhuma conta bancária ativa configurada para boletos ${input.banco}.`);
        }
        const provider = getBoletoProvider(input.banco, config);
        const result = await provider.emitir({
          guidLancamento: input.guidLancamento,
          descricao: titulo.DESCRICAO,
          valor: Number(titulo.VALOR) - Number(titulo.VALORRECEBIDO ?? 0),
          vencimento: titulo.dtVencimento,
          nomeDevedor: titulo.NOMEDEVEDOR,
          documentoDevedor: titulo.DOCUMENTO,
          emailDevedor: titulo.EMAIL,
          numeroDoc: titulo.NUMERODOC,
        });

        await pool.request()
          .input("guidboleto", sql.UniqueIdentifier, guidBoleto)
          .input("status", sql.NVarChar(20), result.status)
          .input("nossonumero", sql.NVarChar(80), result.nossoNumero ?? null)
          .input("linhadigitavel", sql.NVarChar(160), result.linhaDigitavel ?? null)
          .input("codigobarras", sql.NVarChar(120), result.codigoBarras ?? null)
          .input("urlpdf", sql.NVarChar(1000), result.urlPdf ?? null)
          .input("externalid", sql.NVarChar(160), result.externalId ?? null)
          .query(`
            UPDATE KS0003.KS00011 SET
              STATUS=@status, NOSSONUMERO=@nossonumero, LINHADIGITAVEL=@linhadigitavel,
              CODIGOBARRAS=@codigobarras, URLPDF=@urlpdf, EXTERNALID=@externalid,
              MENSAGEMERRO=NULL, ULTIMAALTERACAO=GETDATE()
            WHERE GUIDBOLETO=@guidboleto
          `);

        await registrarEventoBoleto(pool, {
          guidBoleto,
          guidEntidade: session.guidEntidade,
          tipo: "EMISSAO",
          descricao: "Boleto emitido pelo ERP",
          request: result.request,
          response: result.response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao emitir boleto.";
        await pool.request()
          .input("guidboleto", sql.UniqueIdentifier, guidBoleto)
          .input("mensagem", sql.NVarChar(1000), message)
          .query(`
            UPDATE KS0003.KS00011 SET STATUS='ERRO', MENSAGEMERRO=@mensagem, ULTIMAALTERACAO=GETDATE()
            WHERE GUIDBOLETO=@guidboleto
          `);
        await registrarEventoBoleto(pool, {
          guidBoleto,
          guidEntidade: session.guidEntidade,
          tipo: "ERRO_EMISSAO",
          descricao: message,
        });
        throw new Error(`Não foi possível emitir o boleto: ${message}`);
      }

      const boleto = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      return { success: true, boleto };
    }),

  consultarBoleto: publicProcedure
    .input(z.object({ guidLancamento: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await garantirTabelasBoletos(pool);
      const boleto = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      if (!boleto) throw new Error("Este título ainda não possui boleto.");
      if (!boleto.EXTERNALID) return { success: true, boleto };

      try {
        const config = await getBoletoConfig(pool, session.guidEntidade, boleto.BANCO);
        if (!config) {
          throw new Error(`Nenhuma conta bancária ativa configurada para boletos ${boleto.BANCO}.`);
        }
        const provider = getBoletoProvider(boleto.BANCO, config);
        const result = await provider.consultar(boleto.EXTERNALID);
        await pool.request()
          .input("guidboleto", sql.UniqueIdentifier, boleto.guidBoleto)
          .input("status", sql.NVarChar(20), result.status)
          .input("nossonumero", sql.NVarChar(80), result.nossoNumero ?? boleto.NOSSONUMERO)
          .input("linhadigitavel", sql.NVarChar(160), result.linhaDigitavel ?? boleto.LINHADIGITAVEL)
          .input("codigobarras", sql.NVarChar(120), result.codigoBarras ?? boleto.CODIGOBARRAS)
          .input("urlpdf", sql.NVarChar(1000), result.urlPdf ?? boleto.URLPDF)
          .input("externalid", sql.NVarChar(160), result.externalId ?? boleto.EXTERNALID)
          .query(`
            UPDATE KS0003.KS00011 SET
              STATUS=@status, NOSSONUMERO=@nossonumero, LINHADIGITAVEL=@linhadigitavel,
              CODIGOBARRAS=@codigobarras, URLPDF=@urlpdf, EXTERNALID=@externalid,
              MENSAGEMERRO=NULL, ULTIMAALTERACAO=GETDATE()
            WHERE GUIDBOLETO=@guidboleto
          `);
        await registrarEventoBoleto(pool, {
          guidBoleto: boleto.guidBoleto,
          guidEntidade: session.guidEntidade,
          tipo: "CONSULTA",
          descricao: `Consulta retornou status ${result.status}`,
          request: result.request,
          response: result.response,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao consultar boleto.";
        await registrarEventoBoleto(pool, {
          guidBoleto: boleto.guidBoleto,
          guidEntidade: session.guidEntidade,
          tipo: "ERRO_CONSULTA",
          descricao: message,
        });
        throw new Error(`Não foi possível consultar o boleto: ${message}`);
      }

      return { success: true, boleto: await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade) };
    }),

  cancelarBoleto: publicProcedure
    .input(z.object({
      guidLancamento: z.string().uuid(),
      motivo: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await garantirTabelasBoletos(pool);
      const boleto = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      if (!boleto) throw new Error("Este título ainda não possui boleto.");
      if (boleto.STATUS === "PAGO") throw new Error("Boleto pago não pode ser cancelado.");
      if (boleto.STATUS === "CANCELADO") return { success: true, boleto };

      try {
        if (boleto.EXTERNALID) {
          const config = await getBoletoConfig(pool, session.guidEntidade, boleto.BANCO);
          if (!config) {
            throw new Error(`Nenhuma conta bancária ativa configurada para boletos ${boleto.BANCO}.`);
          }
          const provider = getBoletoProvider(boleto.BANCO, config);
          const result = await provider.cancelar(boleto.EXTERNALID, input.motivo);
          await registrarEventoBoleto(pool, {
            guidBoleto: boleto.guidBoleto,
            guidEntidade: session.guidEntidade,
            tipo: "CANCELAMENTO",
            descricao: input.motivo ?? "Boleto cancelado pelo ERP",
            request: result.request,
            response: result.response,
          });
        }
        await pool.request()
          .input("guidboleto", sql.UniqueIdentifier, boleto.guidBoleto)
          .query(`
            UPDATE KS0003.KS00011 SET STATUS='CANCELADO', MENSAGEMERRO=NULL, ULTIMAALTERACAO=GETDATE()
            WHERE GUIDBOLETO=@guidboleto
          `);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao cancelar boleto.";
        await registrarEventoBoleto(pool, {
          guidBoleto: boleto.guidBoleto,
          guidEntidade: session.guidEntidade,
          tipo: "ERRO_CANCELAMENTO",
          descricao: message,
        });
        throw new Error(`Não foi possível cancelar o boleto: ${message}`);
      }

      return { success: true, boleto: await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade) };
    }),

  baixarPdfBoleto: publicProcedure
    .input(z.object({ guidLancamento: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await garantirTabelasBoletos(pool);
      const boleto = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      if (!boleto?.URLPDF) throw new Error("PDF do boleto ainda não está disponível.");
      return { urlPdf: boleto.URLPDF };
    }),

  eventosBoleto: publicProcedure
    .input(z.object({ guidLancamento: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      await garantirTabelasBoletos(pool);
      const boleto = await buscarBoletoAtual(pool, input.guidLancamento, session.guidEntidade);
      if (!boleto) return [];
      const r = await pool.request()
        .input("guidboleto", sql.UniqueIdentifier, boleto.guidBoleto)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDEVENTO AS NVARCHAR(36)) AS guidEvento,
            TIPOEVENTO, DESCRICAO,
            FORMAT(DATACADASTRO, 'yyyy-MM-ddTHH:mm:ss') AS createdAt
          FROM KS0003.KS00012
          WHERE GUIDBOLETO=@guidboleto AND GUIDENTIDADE=@guidentidade
          ORDER BY DATACADASTRO DESC
        `);
      return r.recordset;
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

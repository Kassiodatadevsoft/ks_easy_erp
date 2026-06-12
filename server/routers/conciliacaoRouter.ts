import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  return session;
}

const statusSchema = z.enum(["PENDENTE", "CONCILIADO", "DIVERGENTE", "CANCELADO"]);
const tipoSchema = z.enum(["CREDITO", "DEBITO", "PIX"]);
const motivoSchema = z.enum([
  "TAXA_DIFERENTE",
  "VALOR_RECEBIDO_MENOR",
  "VALOR_RECEBIDO_MAIOR",
  "VENDA_CANCELADA",
  "CHARGEBACK",
  "ERRO_OPERACIONAL",
  "OUTRO",
]);

export async function garantirTabelasConciliacao(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00013')
    CREATE TABLE KS0003.KS00013 (
      GUIDPAGAMENTO       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE        UNIQUEIDENTIFIER NOT NULL,
      GUIDVENDA           UNIQUEIDENTIFIER NULL,
      GUIDLANCAMENTO      UNIQUEIDENTIFIER NULL,
      GUIDPAGAMENTOFORMA  UNIQUEIDENTIFIER NULL,
      CODFILIAL           INT              NULL,
      FORMAPAGAMENTO      NVARCHAR(100)    NULL,
      CLIENTE             NVARCHAR(150)    NULL,
      NUMEROVENDA         NVARCHAR(60)     NULL,
      BANDEIRA            NVARCHAR(60)     NULL,
      TIPO                NVARCHAR(20)     NOT NULL,
      ADQUIRENTE          NVARCHAR(80)     NULL,
      NSU                 NVARCHAR(80)     NULL,
      AUTORIZACAO         NVARCHAR(80)     NULL,
      TID                 NVARCHAR(120)    NULL,
      TXID                NVARCHAR(120)    NULL,
      E2EID               NVARCHAR(120)    NULL,
      VALORBRUTO          DECIMAL(15,2)    NOT NULL,
      PARCELAS            INT              NOT NULL DEFAULT 1,
      DATAVENDA           DATETIME         NOT NULL,
      PREVISAORECEBIMENTO DATE             NOT NULL,
      STATUS              NVARCHAR(20)     NOT NULL DEFAULT 'PENDENTE',
      DATACADASTRO        DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO     DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF COL_LENGTH('KS0003.KS00013', 'CODFILIAL') IS NULL
      ALTER TABLE KS0003.KS00013 ADD CODFILIAL INT NULL
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00013_CONCILIACAO' AND object_id=OBJECT_ID('KS0003.KS00013'))
      CREATE INDEX IX_KS00013_CONCILIACAO ON KS0003.KS00013 (GUIDENTIDADE, STATUS, PREVISAORECEBIMENTO, DATAVENDA)
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00014')
    CREATE TABLE KS0003.KS00014 (
      GUIDPARCELA          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDPAGAMENTO        UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE         UNIQUEIDENTIFIER NOT NULL,
      NUMEROPARCELA        INT              NOT NULL,
      VALORBRUTO           DECIMAL(15,2)    NOT NULL,
      TAXA                 DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORLIQUIDOPREVISTO DECIMAL(15,2)    NOT NULL,
      VALORRECEBIDO        DECIMAL(15,2)    NULL,
      DIFERENCA            DECIMAL(15,2)    NULL,
      DTPREVISTA           DATE             NOT NULL,
      DTRECEBIMENTO        DATE             NULL,
      GUIDCONTABANCARIA    UNIQUEIDENTIFIER NULL,
      STATUS               NVARCHAR(20)     NOT NULL DEFAULT 'PENDENTE',
      MOTIVODIVERGENCIA    NVARCHAR(40)     NULL,
      OBSERVACAO           NVARCHAR(500)    NULL,
      GUIDUSUARIOCONCILIOU UNIQUEIDENTIFIER NULL,
      DATACONCILIACAO      DATETIME         NULL,
      DATACADASTRO         DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO      DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00014_PAGAMENTO' AND object_id=OBJECT_ID('KS0003.KS00014'))
      CREATE INDEX IX_KS00014_PAGAMENTO ON KS0003.KS00014 (GUIDENTIDADE, GUIDPAGAMENTO, NUMEROPARCELA)
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00015')
    CREATE TABLE KS0003.KS00015 (
      GUIDEVENTO       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDPAGAMENTO    UNIQUEIDENTIFIER NOT NULL,
      GUIDPARCELA      UNIQUEIDENTIFIER NULL,
      GUIDENTIDADE     UNIQUEIDENTIFIER NOT NULL,
      GUIDUSUARIO      UNIQUEIDENTIFIER NULL,
      TIPOEVENTO       NVARCHAR(40)     NOT NULL,
      STATUSANTERIOR   NVARCHAR(20)     NULL,
      STATUSNOVO       NVARCHAR(20)     NULL,
      DESCRICAO        NVARCHAR(500)    NULL,
      OBSERVACAO       NVARCHAR(500)    NULL,
      DATACADASTRO     DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO  DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
}

async function registrarEvento(
  pool: Awaited<ReturnType<typeof getSqlPool>>,
  params: {
    guidPagamento: string;
    guidParcela?: string | null;
    guidEntidade: string;
    guidUsuario?: string | null;
    tipo: string;
    statusAnterior?: string | null;
    statusNovo?: string | null;
    descricao?: string | null;
    observacao?: string | null;
  },
) {
  await pool.request()
    .input("guidevento", sql.UniqueIdentifier, crypto.randomUUID())
    .input("guidpagamento", sql.UniqueIdentifier, params.guidPagamento)
    .input("guidparcela", sql.UniqueIdentifier, params.guidParcela ?? null)
    .input("guidentidade", sql.UniqueIdentifier, params.guidEntidade)
    .input("guidusuario", sql.UniqueIdentifier, params.guidUsuario ?? null)
    .input("tipo", sql.NVarChar(40), params.tipo)
    .input("statusanterior", sql.NVarChar(20), params.statusAnterior ?? null)
    .input("statusnovo", sql.NVarChar(20), params.statusNovo ?? null)
    .input("descricao", sql.NVarChar(500), params.descricao ?? null)
    .input("observacao", sql.NVarChar(500), params.observacao ?? null)
    .query(`
      INSERT INTO KS0003.KS00015
        (GUIDEVENTO,GUIDPAGAMENTO,GUIDPARCELA,GUIDENTIDADE,GUIDUSUARIO,TIPOEVENTO,STATUSANTERIOR,STATUSNOVO,DESCRICAO,OBSERVACAO)
      VALUES
        (@guidevento,@guidpagamento,@guidparcela,@guidentidade,@guidusuario,@tipo,@statusanterior,@statusnovo,@descricao,@observacao)
    `);
}

async function atualizarStatusPagamento(pool: Awaited<ReturnType<typeof getSqlPool>>, guidPagamento: string, guidEntidade: string) {
  await pool.request()
    .input("guidpagamento", sql.UniqueIdentifier, guidPagamento)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      UPDATE p SET
        STATUS = CASE
          WHEN EXISTS (SELECT 1 FROM KS0003.KS00014 x WHERE x.GUIDPAGAMENTO=p.GUIDPAGAMENTO AND x.GUIDENTIDADE=p.GUIDENTIDADE AND x.STATUS='DIVERGENTE') THEN 'DIVERGENTE'
          WHEN EXISTS (SELECT 1 FROM KS0003.KS00014 x WHERE x.GUIDPAGAMENTO=p.GUIDPAGAMENTO AND x.GUIDENTIDADE=p.GUIDENTIDADE AND x.STATUS='CANCELADO') THEN 'CANCELADO'
          WHEN NOT EXISTS (SELECT 1 FROM KS0003.KS00014 x WHERE x.GUIDPAGAMENTO=p.GUIDPAGAMENTO AND x.GUIDENTIDADE=p.GUIDENTIDADE AND x.STATUS <> 'CONCILIADO') THEN 'CONCILIADO'
          ELSE 'PENDENTE'
        END,
        ULTIMAALTERACAO=GETDATE()
      FROM KS0003.KS00013 p
      WHERE p.GUIDPAGAMENTO=@guidpagamento AND p.GUIDENTIDADE=@guidentidade
    `);
}

const conciliarInput = z.object({
  guidParcela: z.string().uuid(),
  dtRecebimento: z.string().min(1),
  valorRecebido: z.number().min(0),
  taxa: z.number().min(0).default(0),
  valorLiquido: z.number().min(0),
  guidContaBancaria: z.string().uuid("Conta bancaria obrigatoria"),
  observacao: z.string().max(500).optional().nullable(),
});

export const conciliacaoRouter = router({
  listar: publicProcedure
    .input(z.object({
      dtVendaInicio: z.string().optional(),
      dtVendaFim: z.string().optional(),
      dtPrevInicio: z.string().optional(),
      dtPrevFim: z.string().optional(),
      guidPagamentoForma: z.string().uuid().optional(),
      adquirente: z.string().optional(),
      bandeira: z.string().optional(),
      status: statusSchema.or(z.literal("TODOS")).default("PENDENTE"),
      busca: z.string().optional(),
      codFilial: z.number().int().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacao(pool);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;
      const conditions = ["p.GUIDENTIDADE=@guidentidade"];
      if (input?.dtVendaInicio) conditions.push("CONVERT(DATE,p.DATAVENDA) >= CONVERT(DATE,@dtVendaInicio)");
      if (input?.dtVendaFim) conditions.push("CONVERT(DATE,p.DATAVENDA) <= CONVERT(DATE,@dtVendaFim)");
      if (input?.dtPrevInicio) conditions.push("pa.DTPREVISTA >= CONVERT(DATE,@dtPrevInicio)");
      if (input?.dtPrevFim) conditions.push("pa.DTPREVISTA <= CONVERT(DATE,@dtPrevFim)");
      if (input?.guidPagamentoForma) conditions.push("p.GUIDPAGAMENTOFORMA=@guidPagamentoForma");
      if (input?.adquirente) conditions.push("p.ADQUIRENTE LIKE @adquirente");
      if (input?.bandeira) conditions.push("p.BANDEIRA LIKE @bandeira");
      if (input?.status && input.status !== "TODOS") conditions.push("pa.STATUS=@status");
      if (input?.codFilial != null) conditions.push("p.CODFILIAL=@codFilial");
      if (input?.busca) conditions.push("(p.CLIENTE LIKE @busca OR p.NUMEROVENDA LIKE @busca OR p.NSU LIKE @busca OR p.AUTORIZACAO LIKE @busca OR p.TXID LIKE @busca OR p.E2EID LIKE @busca)");
      const where = conditions.join(" AND ");
      const addFilters = (req: ReturnType<typeof pool.request>) => {
        req.input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
        if (input?.dtVendaInicio) req.input("dtVendaInicio", sql.NVarChar(10), input.dtVendaInicio);
        if (input?.dtVendaFim) req.input("dtVendaFim", sql.NVarChar(10), input.dtVendaFim);
        if (input?.dtPrevInicio) req.input("dtPrevInicio", sql.NVarChar(10), input.dtPrevInicio);
        if (input?.dtPrevFim) req.input("dtPrevFim", sql.NVarChar(10), input.dtPrevFim);
        if (input?.guidPagamentoForma) req.input("guidPagamentoForma", sql.UniqueIdentifier, input.guidPagamentoForma);
        if (input?.adquirente) req.input("adquirente", sql.NVarChar(90), `%${input.adquirente}%`);
        if (input?.bandeira) req.input("bandeira", sql.NVarChar(70), `%${input.bandeira}%`);
        if (input?.status && input.status !== "TODOS") req.input("status", sql.NVarChar(20), input.status);
        if (input?.codFilial != null) req.input("codFilial", sql.Int, input.codFilial);
        if (input?.busca) req.input("busca", sql.NVarChar(180), `%${input.busca}%`);
        return req;
      };

      const totalR = await addFilters(pool.request()).query(`
        SELECT COUNT(*) AS total
        FROM KS0003.KS00014 pa
        INNER JOIN KS0003.KS00013 p ON p.GUIDPAGAMENTO=pa.GUIDPAGAMENTO AND p.GUIDENTIDADE=pa.GUIDENTIDADE
        WHERE ${where}
      `);
      const rows = await addFilters(pool.request())
        .input("offset", sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(p.GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
            CAST(pa.GUIDPARCELA AS NVARCHAR(36)) AS guidParcela,
            CAST(p.GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
            CAST(p.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
            CAST(p.GUIDPAGAMENTOFORMA AS NVARCHAR(36)) AS guidPagamentoForma,
            p.CODFILIAL AS codFilial,
            p.FORMAPAGAMENTO AS formaPagamento, p.CLIENTE AS cliente, p.NUMEROVENDA AS numeroVenda,
            p.TIPO AS tipo, p.ADQUIRENTE AS adquirente, p.BANDEIRA AS bandeira,
            p.NSU AS nsu, p.AUTORIZACAO AS autorizacao, p.TID AS tid, p.TXID AS txid, p.E2EID AS e2eId,
            p.VALORBRUTO AS valorBrutoTotal, p.PARCELAS AS parcelas,
            pa.NUMEROPARCELA AS numeroParcela, pa.VALORBRUTO AS valorBruto, pa.TAXA AS taxa,
            pa.VALORLIQUIDOPREVISTO AS valorLiquidoPrevisto, pa.VALORRECEBIDO AS valorRecebido,
            pa.DIFERENCA AS diferenca, pa.STATUS AS status, pa.MOTIVODIVERGENCIA AS motivoDivergencia,
            CONVERT(NVARCHAR(10), p.DATAVENDA, 23) AS dataVenda,
            CONVERT(NVARCHAR(10), pa.DTPREVISTA, 23) AS previsaoRecebimento,
            CONVERT(NVARCHAR(10), pa.DTRECEBIMENTO, 23) AS dataRecebimento,
            CAST(pa.GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria,
            cb.CONTA AS contaBancaria, pa.OBSERVACAO AS observacao
          FROM KS0003.KS00014 pa
          INNER JOIN KS0003.KS00013 p ON p.GUIDPAGAMENTO=pa.GUIDPAGAMENTO AND p.GUIDENTIDADE=pa.GUIDENTIDADE
          LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA=pa.GUIDCONTABANCARIA
          WHERE ${where}
          ORDER BY pa.DTPREVISTA ASC, p.DATAVENDA DESC, p.NUMEROVENDA
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: rows.recordset, total: totalR.recordset[0]?.total ?? 0, page, pageSize };
    }),

  totais: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasConciliacao(pool);
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN STATUS='PENDENTE' THEN VALORLIQUIDOPREVISTO ELSE 0 END),0) AS pendente,
          ISNULL(SUM(CASE WHEN STATUS='CONCILIADO' THEN VALORRECEBIDO ELSE 0 END),0) AS conciliado,
          ISNULL(SUM(CASE WHEN STATUS='DIVERGENTE' THEN ISNULL(DIFERENCA,0) ELSE 0 END),0) AS divergente,
          COUNT(CASE WHEN STATUS='PENDENTE' THEN 1 END) AS qtdPendente
        FROM KS0003.KS00014
        WHERE GUIDENTIDADE=@guidentidade
      `);
    return r.recordset[0] ?? { pendente: 0, conciliado: 0, divergente: 0, qtdPendente: 0 };
  }),

  conciliar: publicProcedure.input(conciliarInput).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasConciliacao(pool);
    const atualR = await pool.request()
      .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT TOP 1
          CAST(pa.GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
          pa.STATUS, pa.VALORLIQUIDOPREVISTO,
          CAST(p.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento
        FROM KS0003.KS00014 pa
        INNER JOIN KS0003.KS00013 p ON p.GUIDPAGAMENTO=pa.GUIDPAGAMENTO AND p.GUIDENTIDADE=pa.GUIDENTIDADE
        WHERE pa.GUIDPARCELA=@guidparcela AND pa.GUIDENTIDADE=@guidentidade
      `);
    const atual = atualR.recordset[0] as { guidPagamento: string; STATUS: string; VALORLIQUIDOPREVISTO: number; guidLancamento: string | null } | undefined;
    if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento nao encontrado." });
    const diferenca = Number((input.valorLiquido - Number(atual.VALORLIQUIDOPREVISTO)).toFixed(2));
    const statusNovo = Math.abs(diferenca) > 0.009 ? "DIVERGENTE" : "CONCILIADO";

    await pool.request()
      .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("dtrecebimento", sql.NVarChar(10), input.dtRecebimento)
      .input("valorrecebido", sql.Decimal(15,2), input.valorRecebido)
      .input("taxa", sql.Decimal(15,2), input.taxa)
      .input("valorliquido", sql.Decimal(15,2), input.valorLiquido)
      .input("diferenca", sql.Decimal(15,2), diferenca)
      .input("guidcontabancaria", sql.UniqueIdentifier, input.guidContaBancaria)
      .input("status", sql.NVarChar(20), statusNovo)
      .input("motivo", sql.NVarChar(40), statusNovo === "DIVERGENTE" ? "OUTRO" : null)
      .input("observacao", sql.NVarChar(500), input.observacao ?? null)
      .input("guidusuario", sql.UniqueIdentifier, session.guidPessoa ?? null)
      .query(`
        UPDATE KS0003.KS00014 SET
          DTRECEBIMENTO=CONVERT(DATE,@dtrecebimento), VALORRECEBIDO=@valorrecebido,
          TAXA=@taxa, VALORLIQUIDOPREVISTO=@valorliquido, DIFERENCA=@diferenca,
          GUIDCONTABANCARIA=@guidcontabancaria, STATUS=@status, MOTIVODIVERGENCIA=@motivo,
          OBSERVACAO=@observacao, GUIDUSUARIOCONCILIOU=@guidusuario, DATACONCILIACAO=GETDATE(),
          ULTIMAALTERACAO=GETDATE()
        WHERE GUIDPARCELA=@guidparcela AND GUIDENTIDADE=@guidentidade
      `);

    if (atual.STATUS !== "CONCILIADO") {
      await pool.request()
        .input("delta", sql.Decimal(15,2), input.valorLiquido)
        .input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
    }

    if (atual.guidLancamento) {
      await pool.request()
        .input("guidlancamento", sql.UniqueIdentifier, atual.guidLancamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("valor", sql.Decimal(15,2), input.valorRecebido)
        .input("dtrecebimento", sql.NVarChar(10), input.dtRecebimento)
        .input("guidpagamento", sql.UniqueIdentifier, null)
        .query(`
          UPDATE KS0003.KS00005 SET
            VALORRECEBIDO = ISNULL(VALORRECEBIDO,0) + @valor,
            DTRECEBIMENTO = CONVERT(DATE,@dtrecebimento),
            STATUS = CASE WHEN ISNULL(VALORRECEBIDO,0) + @valor >= VALOR THEN 'PAGO' ELSE 'PARCIAL' END,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade AND STATUS IN ('ABERTO','PARCIAL')
        `);
    }

    await atualizarStatusPagamento(pool, atual.guidPagamento, session.guidEntidade);
    await registrarEvento(pool, {
      guidPagamento: atual.guidPagamento,
      guidParcela: input.guidParcela,
      guidEntidade: session.guidEntidade,
      guidUsuario: session.guidPessoa ?? null,
      tipo: "CONCILIAR",
      statusAnterior: atual.STATUS,
      statusNovo,
      descricao: "Conciliação manual de cartão/PIX",
      observacao: input.observacao,
    });
    return { success: true, status: statusNovo, diferenca };
  }),

  marcarDivergencia: publicProcedure
    .input(z.object({
      guidParcela: z.string().uuid(),
      motivo: motivoSchema,
      observacao: z.string().min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacao(pool);
      const atualR = await pool.request()
        .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento, STATUS FROM KS0003.KS00014 WHERE GUIDPARCELA=@guidparcela AND GUIDENTIDADE=@guidentidade");
      const atual = atualR.recordset[0] as { guidPagamento: string; STATUS: string } | undefined;
      if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento nao encontrado." });
      await pool.request()
        .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("motivo", sql.NVarChar(40), input.motivo)
        .input("observacao", sql.NVarChar(500), input.observacao)
        .query(`
          UPDATE KS0003.KS00014 SET
            STATUS='DIVERGENTE', MOTIVODIVERGENCIA=@motivo, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDPARCELA=@guidparcela AND GUIDENTIDADE=@guidentidade
        `);
      await atualizarStatusPagamento(pool, atual.guidPagamento, session.guidEntidade);
      await registrarEvento(pool, {
        guidPagamento: atual.guidPagamento,
        guidParcela: input.guidParcela,
        guidEntidade: session.guidEntidade,
        guidUsuario: session.guidPessoa ?? null,
        tipo: "DIVERGENCIA",
        statusAnterior: atual.STATUS,
        statusNovo: "DIVERGENTE",
        descricao: input.motivo,
        observacao: input.observacao,
      });
      return { success: true };
    }),

  desfazer: publicProcedure.input(z.object({ guidParcela: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasConciliacao(pool);
    const atualR = await pool.request()
      .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(pa.GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento, pa.STATUS,
          pa.VALORLIQUIDOPREVISTO, pa.VALORRECEBIDO, CAST(pa.GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria,
          CAST(p.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento
        FROM KS0003.KS00014 pa
        INNER JOIN KS0003.KS00013 p ON p.GUIDPAGAMENTO=pa.GUIDPAGAMENTO AND p.GUIDENTIDADE=pa.GUIDENTIDADE
        WHERE pa.GUIDPARCELA=@guidparcela AND pa.GUIDENTIDADE=@guidentidade
      `);
    const atual = atualR.recordset[0] as {
      guidPagamento: string;
      STATUS: string;
      VALORRECEBIDO: number | null;
      guidContaBancaria: string | null;
      guidLancamento: string | null;
    } | undefined;
    if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento nao encontrado." });

    if (atual.STATUS === "CONCILIADO" && atual.guidContaBancaria && atual.VALORRECEBIDO) {
      await pool.request()
        .input("delta", sql.Decimal(15,2), -Number(atual.VALORRECEBIDO))
        .input("guidconta", sql.UniqueIdentifier, atual.guidContaBancaria)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
    }

    await pool.request()
      .input("guidparcela", sql.UniqueIdentifier, input.guidParcela)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00014 SET
          STATUS='PENDENTE', VALORRECEBIDO=NULL, DIFERENCA=NULL, DTRECEBIMENTO=NULL,
          GUIDCONTABANCARIA=NULL, MOTIVODIVERGENCIA=NULL, OBSERVACAO=NULL,
          GUIDUSUARIOCONCILIOU=NULL, DATACONCILIACAO=NULL, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDPARCELA=@guidparcela AND GUIDENTIDADE=@guidentidade
      `);

    if (atual.guidLancamento && atual.VALORRECEBIDO) {
      await pool.request()
        .input("guidlancamento", sql.UniqueIdentifier, atual.guidLancamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("valor", sql.Decimal(15,2), Number(atual.VALORRECEBIDO))
        .query(`
          UPDATE KS0003.KS00005 SET
            VALORRECEBIDO = CASE WHEN ISNULL(VALORRECEBIDO,0) - @valor < 0 THEN 0 ELSE ISNULL(VALORRECEBIDO,0) - @valor END,
            STATUS = CASE WHEN ISNULL(VALORRECEBIDO,0) - @valor <= 0 THEN 'ABERTO' ELSE 'PARCIAL' END,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade
        `);
    }

    await atualizarStatusPagamento(pool, atual.guidPagamento, session.guidEntidade);
    await registrarEvento(pool, {
      guidPagamento: atual.guidPagamento,
      guidParcela: input.guidParcela,
      guidEntidade: session.guidEntidade,
      guidUsuario: session.guidPessoa ?? null,
      tipo: "DESFAZER",
      statusAnterior: atual.STATUS,
      statusNovo: "PENDENTE",
      descricao: "Conciliação desfeita",
    });
    return { success: true };
  }),

  eventos: publicProcedure.input(z.object({ guidPagamento: z.string().uuid() })).query(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasConciliacao(pool);
    const r = await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, input.guidPagamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(GUIDEVENTO AS NVARCHAR(36)) AS guidEvento, CAST(GUIDPARCELA AS NVARCHAR(36)) AS guidParcela,
          TIPOEVENTO AS tipoEvento, STATUSANTERIOR AS statusAnterior, STATUSNOVO AS statusNovo,
          DESCRICAO AS descricao, OBSERVACAO AS observacao, DATACADASTRO AS dataCadastro
        FROM KS0003.KS00015
        WHERE GUIDPAGAMENTO=@guidpagamento AND GUIDENTIDADE=@guidentidade
        ORDER BY DATACADASTRO DESC
      `);
    return r.recordset;
  }),
});

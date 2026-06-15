import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getSqlPool, querySql, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida. Faca login novamente." });
  }
  return session;
}

async function ensureNfeAvulsaStructure() {
  await querySql(`
    IF OBJECT_ID('KS0005.KS00016', 'U') IS NULL
      THROW 51000, 'Tabela de vendas KS0005.KS00016 nao encontrada. A NF-e Avulsa usa a mesma estrutura do modulo de vendas.', 1;

    IF OBJECT_ID('KS0005.KS00017', 'U') IS NULL
      THROW 51000, 'Tabela de itens KS0005.KS00017 nao encontrada. A NF-e Avulsa usa a mesma estrutura do modulo de vendas.', 1;

    IF OBJECT_ID('KS0005.KS00018', 'U') IS NULL
      THROW 51000, 'Tabela financeira KS0005.KS00018 nao encontrada. A NF-e Avulsa usa a mesma estrutura do modulo de vendas.', 1;

    IF OBJECT_ID('dbo.NATUREZA_OPERACAO', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.NATUREZA_OPERACAO (
        GUIDNATUREZAOPERACAO char(36) NOT NULL PRIMARY KEY,
        GUIDENTIDADE char(36) NOT NULL,
        DESCRICAO varchar(100) NOT NULL,
        TIPOOPERACAO char(1) NOT NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_ULTIMAALTERACAO DEFAULT GETDATE(),
        CONSTRAINT CK_NATUREZA_OPERACAO_TIPO CHECK (TIPOOPERACAO IN ('E','S'))
      );
    END;

    IF COL_LENGTH('dbo.NATUREZA_OPERACAO','GUIDNATUREZAOPERACAO') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name='IX_NATUREZA_OPERACAO_ENTIDADE'
          AND object_id=OBJECT_ID('dbo.NATUREZA_OPERACAO')
      )
      CREATE INDEX IX_NATUREZA_OPERACAO_ENTIDADE ON dbo.NATUREZA_OPERACAO (GUIDENTIDADE, SITUACAO, DESCRICAO);

    IF COL_LENGTH('KS0005.KS00016','CODPREVENDA') IS NULL ALTER TABLE KS0005.KS00016 ADD CODPREVENDA int NULL;
    IF COL_LENGTH('KS0005.KS00016','ORIGEM') IS NULL ALTER TABLE KS0005.KS00016 ADD ORIGEM varchar(10) NULL;
    IF COL_LENGTH('KS0005.KS00016','GUIDNATUREZAOPERACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDNATUREZAOPERACAO uniqueidentifier NULL;
    IF COL_LENGTH('KS0005.KS00016','NATUREZAOPERACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD NATUREZAOPERACAO varchar(100) NULL;
    IF COL_LENGTH('KS0005.KS00016','TIPODOCUMENTOFISCAL') IS NULL ALTER TABLE KS0005.KS00016 ADD TIPODOCUMENTOFISCAL varchar(30) NULL;
    IF COL_LENGTH('KS0005.KS00016','MODELOFISCAL') IS NULL ALTER TABLE KS0005.KS00016 ADD MODELOFISCAL int NULL;
    IF COL_LENGTH('KS0005.KS00016','CHAVE') IS NULL ALTER TABLE KS0005.KS00016 ADD CHAVE varchar(44) NULL;
    IF COL_LENGTH('KS0005.KS00016','PROTOCOLO') IS NULL ALTER TABLE KS0005.KS00016 ADD PROTOCOLO varchar(60) NULL;
    IF COL_LENGTH('KS0005.KS00016','STATUSNFE') IS NULL ALTER TABLE KS0005.KS00016 ADD STATUSNFE varchar(30) NULL;
    IF COL_LENGTH('KS0005.KS00016','XMLNFE') IS NULL ALTER TABLE KS0005.KS00016 ADD XMLNFE nvarchar(max) NULL;
    IF COL_LENGTH('KS0005.KS00016','DATAEMISSAONFE') IS NULL ALTER TABLE KS0005.KS00016 ADD DATAEMISSAONFE datetime NULL;
    IF COL_LENGTH('KS0005.KS00016','MOTIVOCANCELAMENTO') IS NULL ALTER TABLE KS0005.KS00016 ADD MOTIVOCANCELAMENTO varchar(500) NULL;
    IF COL_LENGTH('KS0005.KS00016','TIPONFE') IS NULL ALTER TABLE KS0005.KS00016 ADD TIPONFE int NULL;
    IF COL_LENGTH('KS0005.KS00016','PRESENCACOMPRADOR') IS NULL ALTER TABLE KS0005.KS00016 ADD PRESENCACOMPRADOR int NULL;
    IF COL_LENGTH('KS0005.KS00016','ORDEMCOMPRA') IS NULL ALTER TABLE KS0005.KS00016 ADD ORDEMCOMPRA varchar(60) NULL;
    IF COL_LENGTH('KS0005.KS00016','COMPLEMENTOOBS') IS NULL ALTER TABLE KS0005.KS00016 ADD COMPLEMENTOOBS varchar(max) NULL;
    IF COL_LENGTH('KS0005.KS00016','MODALIDADEFRETE') IS NULL ALTER TABLE KS0005.KS00016 ADD MODALIDADEFRETE int NULL;
    IF COL_LENGTH('KS0005.KS00016','GUIDTRANSPORTADORA') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDTRANSPORTADORA uniqueidentifier NULL;
    IF COL_LENGTH('KS0005.KS00016','QUANTIDADEVOLUME') IS NULL ALTER TABLE KS0005.KS00016 ADD QUANTIDADEVOLUME numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00016','NUMERACAOVOLUME') IS NULL ALTER TABLE KS0005.KS00016 ADD NUMERACAOVOLUME varchar(60) NULL;
    IF COL_LENGTH('KS0005.KS00016','ESPECIEVOLUME') IS NULL ALTER TABLE KS0005.KS00016 ADD ESPECIEVOLUME varchar(60) NULL;
    IF COL_LENGTH('KS0005.KS00016','PESOLIQUIDO') IS NULL ALTER TABLE KS0005.KS00016 ADD PESOLIQUIDO numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00016','PESOBRUTO') IS NULL ALTER TABLE KS0005.KS00016 ADD PESOBRUTO numeric(18,4) NULL;

    IF EXISTS (
      SELECT 1 FROM sys.columns c
      JOIN sys.types t ON c.user_type_id=t.user_type_id
      WHERE c.object_id=OBJECT_ID('KS0005.KS00016') AND c.name='ORDEMCOMPRA' AND (t.name NOT IN ('varchar','nvarchar') OR c.max_length < 60)
    ) ALTER TABLE KS0005.KS00016 ALTER COLUMN ORDEMCOMPRA varchar(60) NULL;

    IF EXISTS (
      SELECT 1 FROM sys.columns c
      JOIN sys.types t ON c.user_type_id=t.user_type_id
      WHERE c.object_id=OBJECT_ID('KS0005.KS00016') AND c.name='OBSERVACAO' AND (t.name NOT IN ('varchar','nvarchar') OR c.max_length <> -1)
    ) ALTER TABLE KS0005.KS00016 ALTER COLUMN OBSERVACAO varchar(max) NULL;

    IF COL_LENGTH('KS0005.KS00018','GUIDCAIXA') IS NULL ALTER TABLE KS0005.KS00018 ADD GUIDCAIXA uniqueidentifier NULL;
    IF COL_LENGTH('KS0005.KS00018','GUIDPAGAMENTOVENDA') IS NULL ALTER TABLE KS0005.KS00018 ADD GUIDPAGAMENTOVENDA uniqueidentifier NULL;
    IF COL_LENGTH('KS0005.KS00018','CODFORMAPAGAMENTO') IS NULL ALTER TABLE KS0005.KS00018 ADD CODFORMAPAGAMENTO int NULL;
    IF COL_LENGTH('KS0005.KS00018','DESCRICAOFORMAPAGAMENTO') IS NULL ALTER TABLE KS0005.KS00018 ADD DESCRICAOFORMAPAGAMENTO varchar(100) NULL;
    IF COL_LENGTH('KS0005.KS00018','TROCO') IS NULL ALTER TABLE KS0005.KS00018 ADD TROCO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_TROCO_NTA DEFAULT 0;
    IF COL_LENGTH('KS0005.KS00018','PARCELAS') IS NULL ALTER TABLE KS0005.KS00018 ADD PARCELAS int NULL;
    IF COL_LENGTH('KS0005.KS00018','DATAHORA') IS NULL ALTER TABLE KS0005.KS00018 ADD DATAHORA datetime NULL;

    IF COL_LENGTH('KS0005.KS00017','NCM') IS NULL ALTER TABLE KS0005.KS00017 ADD NCM varchar(10) NULL;
    IF COL_LENGTH('KS0005.KS00017','CFOP') IS NULL ALTER TABLE KS0005.KS00017 ADD CFOP varchar(10) NULL;
    IF COL_LENGTH('KS0005.KS00017','ORIGEMPRODUTO') IS NULL ALTER TABLE KS0005.KS00017 ADD ORIGEMPRODUTO int NULL;
    IF COL_LENGTH('KS0005.KS00017','CSOSN') IS NULL ALTER TABLE KS0005.KS00017 ADD CSOSN varchar(5) NULL;
    IF COL_LENGTH('KS0005.KS00017','CSTICMS') IS NULL ALTER TABLE KS0005.KS00017 ADD CSTICMS varchar(5) NULL;
    IF COL_LENGTH('KS0005.KS00017','CSTPIS') IS NULL ALTER TABLE KS0005.KS00017 ADD CSTPIS varchar(5) NULL;
    IF COL_LENGTH('KS0005.KS00017','CSTCOFINS') IS NULL ALTER TABLE KS0005.KS00017 ADD CSTCOFINS varchar(5) NULL;
    IF COL_LENGTH('KS0005.KS00017','CSTIPI') IS NULL ALTER TABLE KS0005.KS00017 ADD CSTIPI varchar(5) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQICMS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQICMS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQPIS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQPIS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQCOFINS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQCOFINS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQIPI') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQIPI numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQIBS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQIBS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQCBS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQCBS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','ALIQIS') IS NULL ALTER TABLE KS0005.KS00017 ADD ALIQIS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','TOTALBRUTOITEM') IS NULL ALTER TABLE KS0005.KS00017 ADD TOTALBRUTOITEM numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','DESCONTOITEM') IS NULL ALTER TABLE KS0005.KS00017 ADD DESCONTOITEM numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','DESCONTOGERALRATEADO') IS NULL ALTER TABLE KS0005.KS00017 ADD DESCONTOGERALRATEADO numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','TOTALLIQUIDOITEM') IS NULL ALTER TABLE KS0005.KS00017 ADD TOTALLIQUIDOITEM numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','BASEICMS') IS NULL ALTER TABLE KS0005.KS00017 ADD BASEICMS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORICMS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORICMS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','BASEPIS') IS NULL ALTER TABLE KS0005.KS00017 ADD BASEPIS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORPIS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORPIS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','BASECOFINS') IS NULL ALTER TABLE KS0005.KS00017 ADD BASECOFINS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORCOFINS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORCOFINS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','BASEIPI') IS NULL ALTER TABLE KS0005.KS00017 ADD BASEIPI numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORIPI') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORIPI numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORIBS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORIBS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORCBS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORCBS numeric(18,4) NULL;
    IF COL_LENGTH('KS0005.KS00017','VALORIS') IS NULL ALTER TABLE KS0005.KS00017 ADD VALORIS numeric(18,4) NULL;

    IF EXISTS (
      SELECT 1 FROM sys.columns c
      JOIN sys.types t ON c.user_type_id=t.user_type_id
      WHERE c.object_id=OBJECT_ID('KS0005.KS00017') AND c.name='OBSERVACAO' AND (t.name NOT IN ('varchar','nvarchar') OR c.max_length <> -1)
    ) ALTER TABLE KS0005.KS00017 ALTER COLUMN OBSERVACAO varchar(max) NULL;
  `);
}

const itemInput = z.object({
  guidProduto: z.string().uuid(),
  codProduto: z.number().nullable().optional(),
  descricao: z.string().min(1),
  quantidade: z.number().positive(),
  precoCusto: z.number().default(0),
  precoVenda: z.number().min(0),
  descontoValor: z.number().min(0).default(0),
  ncm: z.string().max(10).optional().nullable(),
  cfop: z.string().max(10).optional().nullable(),
  origemProduto: z.number().int().min(0).max(8).optional().nullable(),
  csosn: z.string().max(5).optional().nullable(),
  cstIcms: z.string().max(5).optional().nullable(),
  cstPis: z.string().max(5).optional().nullable(),
  cstCofins: z.string().max(5).optional().nullable(),
  cstIpi: z.string().max(5).optional().nullable(),
  aliqIcms: z.number().min(0).max(100).default(0),
  aliqPis: z.number().min(0).max(100).default(0),
  aliqCofins: z.number().min(0).max(100).default(0),
  aliqIpi: z.number().min(0).max(100).default(0),
  aliqIbs: z.number().min(0).max(100).default(0),
  aliqCbs: z.number().min(0).max(100).default(0),
  aliqIs: z.number().min(0).max(100).default(0),
});

const pagamentoInput = z.object({
  guidFormaPagamento: z.string().uuid(),
  codFormaPagamento: z.number().nullable().optional(),
  descricaoFormaPagamento: z.string().min(1),
  valorPago: z.number().positive(),
  parcelas: z.number().int().positive().default(1),
});

const salvarInput = z.object({
  guidVenda: z.string().uuid().optional(),
  guidCliente: z.string().uuid(),
  codCliente: z.number().nullable().optional(),
  nomeCliente: z.string().min(1),
  guidNaturezaOperacao: z.string().uuid(),
  naturezaOperacao: z.string().min(1),
  tipoOperacao: z.enum(["E", "S"]),
  tipoNfe: z.number().int().refine((value) => [1, 2, 3, 4].includes(value)),
  presencaComprador: z.number().int().refine((value) => [0, 1, 2, 3, 4, 9].includes(value)),
  ordemCompra: z.string().max(60).optional().nullable(),
  complementoObs: z.string().optional().nullable(),
  modalidadeFrete: z.number().int().refine((value) => [0, 1, 2, 3, 4, 9].includes(value)),
  guidTransportadora: z.string().uuid().optional().nullable(),
  quantidadeVolume: z.number().min(0).optional().nullable(),
  numeracaoVolume: z.string().max(60).optional().nullable(),
  especieVolume: z.string().max(60).optional().nullable(),
  pesoLiquido: z.number().min(0).optional().nullable(),
  pesoBruto: z.number().min(0).optional().nullable(),
  descontoTotal: z.number().min(0).default(0),
  observacao: z.string().optional().nullable(),
  rascunho: z.boolean().default(true),
  itens: z.array(itemInput).min(1),
  pagamentos: z.array(pagamentoInput).min(1),
});

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function roundFiscal(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function textFiscal(value: unknown) {
  return String(value ?? "").trim();
}

function calcularFiscalItem(input: {
  quantidade: number;
  precoVenda: number;
  descontoValor: number;
  descontoGeralRateado: number;
  aliqIcms: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIpi: number;
  aliqIbs: number;
  aliqCbs: number;
  aliqIs: number;
}) {
  const totalBrutoItem = roundFiscal(input.quantidade * input.precoVenda);
  const descontoItem = roundFiscal(Math.min(input.descontoValor, input.precoVenda) * input.quantidade);
  const descontoGeralRateado = roundFiscal(input.descontoGeralRateado);
  const totalLiquidoItem = roundFiscal(Math.max(0, totalBrutoItem - descontoItem - descontoGeralRateado));
  const baseIcms = totalLiquidoItem;
  const basePis = totalLiquidoItem;
  const baseCofins = totalLiquidoItem;
  const baseIpi = totalLiquidoItem;
  return {
    totalBrutoItem,
    descontoItem,
    descontoGeralRateado,
    totalLiquidoItem,
    baseIcms,
    valorIcms: roundFiscal(baseIcms * (input.aliqIcms / 100)),
    basePis,
    valorPis: roundFiscal(basePis * (input.aliqPis / 100)),
    baseCofins,
    valorCofins: roundFiscal(baseCofins * (input.aliqCofins / 100)),
    baseIpi,
    valorIpi: roundFiscal(baseIpi * (input.aliqIpi / 100)),
    valorIbs: roundFiscal(totalLiquidoItem * (input.aliqIbs / 100)),
    valorCbs: roundFiscal(totalLiquidoItem * (input.aliqCbs / 100)),
    valorIs: roundFiscal(totalLiquidoItem * (input.aliqIs / 100)),
  };
}

function buildLocalXml(input: {
  guidVenda: string;
  numero: number;
  cliente: string;
  total: number;
  itens: Array<{
    descricao: string;
    quantidade: number;
    precoVenda: number;
    descontoValor: number;
    ncm?: string | null;
    cfop?: string | null;
    csosn?: string | null;
    cstIcms?: string | null;
    baseIcms?: number;
    valorIcms?: number;
    basePis?: number;
    valorPis?: number;
    baseCofins?: number;
    valorCofins?: number;
    baseIpi?: number;
    valorIpi?: number;
    valorIbs?: number;
    valorCbs?: number;
    valorIs?: number;
  }>;
}) {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<NFeAvulsa guidVenda="${escapeXml(input.guidVenda)}" numero="${input.numero}" modelo="55">`,
    `<cliente>${escapeXml(input.cliente)}</cliente>`,
    `<total>${input.total.toFixed(2)}</total>`,
    `<itens>`,
    ...input.itens.map((item, index) =>
      `<item n="${index + 1}"><descricao>${escapeXml(item.descricao)}</descricao><quantidade>${item.quantidade}</quantidade><valorUnitario>${item.precoVenda.toFixed(2)}</valorUnitario><desconto>${item.descontoValor.toFixed(2)}</desconto><ncm>${escapeXml(item.ncm)}</ncm><cfop>${escapeXml(item.cfop)}</cfop><csosn>${escapeXml(item.csosn)}</csosn><cstIcms>${escapeXml(item.cstIcms)}</cstIcms><icms base="${Number(item.baseIcms ?? 0).toFixed(2)}" valor="${Number(item.valorIcms ?? 0).toFixed(2)}" /><pis base="${Number(item.basePis ?? 0).toFixed(2)}" valor="${Number(item.valorPis ?? 0).toFixed(2)}" /><cofins base="${Number(item.baseCofins ?? 0).toFixed(2)}" valor="${Number(item.valorCofins ?? 0).toFixed(2)}" /><ipi base="${Number(item.baseIpi ?? 0).toFixed(2)}" valor="${Number(item.valorIpi ?? 0).toFixed(2)}" /><ibs valor="${Number(item.valorIbs ?? 0).toFixed(2)}" /><cbs valor="${Number(item.valorCbs ?? 0).toFixed(2)}" /><is valor="${Number(item.valorIs ?? 0).toFixed(2)}" /></item>`,
    ),
    `</itens>`,
    `</NFeAvulsa>`,
  ].join("");
}

async function assertNfeAvulsa(request: sql.Request, guidVenda: string, guidEntidade: string) {
  const venda = await request
    .input("guidvenda_check", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade_check", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT TOP 1 *
      FROM KS0005.KS00016
      WHERE GUIDVENDA=@guidvenda_check AND GUIDENTIDADE=@guidentidade_check AND ORIGEM='NTA'
    `);
  const row = venda.recordset[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "NF-e Avulsa nao encontrada." });
  return row;
}

export const nfeAvulsaRouter = router({
  listar: publicProcedure
    .input(z.object({ busca: z.string().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureNfeAvulsaStructure();
      const pool = await getSqlPool();
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      const where = ["v.GUIDENTIDADE=@guidentidade", "v.ORIGEM='NTA'"];
      if (input?.status && input.status !== "TODOS") {
        where.push("ISNULL(v.STATUSNFE, v.SITUACAO)=@status");
        req.input("status", sql.VarChar(30), input.status);
      }
      if (input?.busca?.trim()) {
        where.push("(p.NOME LIKE @busca OR CAST(v.NUMEROVENDA AS varchar(20)) LIKE @busca OR v.CHAVE LIKE @busca)");
        req.input("busca", sql.VarChar(120), `%${input.busca.trim()}%`);
      }
      const result = await req.query(`
        SELECT TOP 100
          CAST(v.GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
          v.NUMEROVENDA AS numeroVenda,
          v.CODPREVENDA AS codPreVenda,
          CONVERT(NVARCHAR(19), v.DATAVENDA, 120) AS dataVenda,
          v.TIPOOPERACAO AS tipoOperacao,
          v.SITUACAO AS situacao,
          v.STATUSNFE AS statusNfe,
          v.TOTALVENDA AS totalVenda,
          v.NATUREZAOPERACAO AS naturezaOperacao,
          p.NOME AS cliente,
          v.CHAVE AS chave,
          v.PROTOCOLO AS protocolo
        FROM KS0005.KS00016 v
        LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA=v.GUIDCLIENTE AND p.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE ${where.join(" AND ")}
        ORDER BY v.DATAVENDA DESC, v.NUMEROVENDA DESC
      `);
      return result.recordset;
    }),

  salvar: publicProcedure.input(salvarInput).mutation(async ({ ctx, input }) => {
    const session = await getKsSession(ctx.req);
    await ensureNfeAvulsaStructure();
    const pool = await getSqlPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const request = () => new sql.Request(tx);
      const guidVenda = input.guidVenda ?? crypto.randomUUID();
      const basesRateio = input.itens.map((item) => {
        const descontoValor = Math.min(item.descontoValor, item.precoVenda);
        return Math.max(0, item.quantidade * item.precoVenda - item.quantidade * descontoValor);
      });
      const subtotal = input.itens.reduce((sum, item) => sum + item.quantidade * item.precoVenda, 0);
      const descontoItens = input.itens.reduce((sum, item) => sum + item.quantidade * Math.min(item.descontoValor, item.precoVenda), 0);
      const baseRateio = basesRateio.reduce((sum, value) => sum + value, 0);
      const descontoGeralInformado = Math.min(input.descontoTotal, baseRateio);
      const descontoCabecalho = Math.min(descontoGeralInformado + descontoItens, subtotal);
      const totalVenda = Math.max(0, subtotal - descontoCabecalho);
      const valorPago = input.pagamentos.reduce((sum, pagamento) => sum + pagamento.valorPago, 0);

      const conflitoOrigem = await request()
        .input("guidvenda_conflito", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade_conflito", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 1 ORIGEM
          FROM KS0005.KS00016
          WHERE GUIDVENDA=@guidvenda_conflito AND GUIDENTIDADE=@guidentidade_conflito
        `);
      const origemExistente = conflitoOrigem.recordset[0]?.ORIGEM;
      if (origemExistente !== undefined && origemExistente !== "NTA") {
        throw new Error("GUIDVENDA ja pertence a uma venda normal. Crie uma nova NF-e Avulsa.");
      }

      const cliente = await request()
        .input("guidcliente", sql.UniqueIdentifier, input.guidCliente)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 CODIGO, NOME FROM KS0002.KS00001 WHERE GUIDPESSOA=@guidcliente AND GUIDENTIDADE=@guidentidade AND CADCLIENTE=1 AND SITUACAO='A'");
      if (!cliente.recordset[0]) throw new Error("Selecione um cliente cadastrado e ativo.");

      const empresaFiscal = await request()
        .input("guidentidade_empresa", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 1 ISNULL(CRT,1) AS CRT, CODENTIDADE
          FROM KS0002.KS00001
          WHERE GUIDENTIDADE=@guidentidade_empresa
            AND CADEMPRESA=1
            AND SITUACAO='A'
        `);
      const codEntidade = Number(empresaFiscal.recordset[0]?.CODENTIDADE ?? 0);
      if (!codEntidade) throw new Error("Empresa logada sem CODENTIDADE configurado.");
      const crt = Number(empresaFiscal.recordset[0]?.CRT ?? 1);
      const empresaSimples = crt === 1 || crt === 2 || crt === 4;
      const empresaNormal = crt === 3;

      const natureza = await request()
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNaturezaOperacao)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 1 DESCRICAO, TIPOOPERACAO
          FROM dbo.NATUREZA_OPERACAO
          WHERE GUIDNATUREZAOPERACAO=CONVERT(char(36), @guidnatureza)
            AND GUIDENTIDADE=CONVERT(char(36), @guidentidade)
            AND SITUACAO=1
        `);
      if (!natureza.recordset[0]) throw new Error("Selecione uma natureza da operacao ativa.");
      if (String(natureza.recordset[0].TIPOOPERACAO) !== input.tipoOperacao) {
        throw new Error("Tipo da operacao diferente da natureza selecionada.");
      }

      if (input.guidTransportadora) {
        const transportadora = await request()
          .input("guidtransportadora", sql.UniqueIdentifier, input.guidTransportadora)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query(`
            SELECT TOP 1 GUIDPESSOA
            FROM KS0002.KS00001
            WHERE GUIDPESSOA=@guidtransportadora
              AND GUIDENTIDADE=@guidentidade
              AND CADTRANSPORTADORA=1
              AND SITUACAO='A'
          `);
        if (!transportadora.recordset[0]) throw new Error("Transportadora invalida ou inativa para a empresa logada.");
      }

      for (const pagamento of input.pagamentos) {
        const forma = await request()
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("SELECT TOP 1 PAGAMENTO, SITUACAO FROM KS0003.KS00006 WHERE GUIDPAGAMENTO=@guidforma AND GUIDENTIDADE=@guidentidade");
        if (!forma.recordset[0] || forma.recordset[0].SITUACAO !== "A") {
          throw new Error("Forma de pagamento invalida ou inativa para a empresa logada.");
        }
      }

      const existing = await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 NUMEROVENDA FROM KS0005.KS00016 WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade AND ORIGEM='NTA'");
      let numeroVenda = Number(existing.recordset[0]?.NUMEROVENDA ?? 0);
      if (!numeroVenda) {
        const next = await request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("SELECT ISNULL(MAX(ISNULL(CODPREVENDA, NUMEROVENDA)),0)+1 AS NUMEROVENDA FROM KS0005.KS00016 WHERE GUIDENTIDADE=@guidentidade");
        numeroVenda = Number(next.recordset[0]?.NUMEROVENDA ?? 1);
      }
      const tipoOperacaoFiscal = input.tipoOperacao === "E" ? 0 : 1;

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("codentidade", sql.Int, codEntidade)
        .input("numerovenda", sql.Int, numeroVenda)
        .input("guidcliente", sql.UniqueIdentifier, input.guidCliente)
        .input("guidpessoas", sql.UniqueIdentifier, input.guidCliente)
        .input("codcliente", sql.Int, input.codCliente ?? cliente.recordset[0].CODIGO ?? null)
        .input("guidusuario", sql.UniqueIdentifier, session.guidPessoa)
        .input("guidcaixa", sql.UniqueIdentifier, ZERO_GUID)
        .input("codtransacao", sql.Int, numeroVenda)
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNaturezaOperacao)
        .input("natureza", sql.VarChar(100), String(natureza.recordset[0].DESCRICAO ?? input.naturezaOperacao))
        .input("tipooperacao", sql.Int, tipoOperacaoFiscal)
        .input("tiponfe", sql.Int, input.tipoNfe)
        .input("presencacomprador", sql.Int, input.presencaComprador)
        .input("ordemcompra", sql.VarChar(60), input.ordemCompra ?? null)
        .input("complementoobs", sql.VarChar(sql.MAX), input.complementoObs ?? null)
        .input("modalidadefrete", sql.Int, input.modalidadeFrete)
        .input("guidtransportadora", sql.UniqueIdentifier, input.guidTransportadora ?? null)
        .input("quantidadevolume", sql.Decimal(18, 4), input.quantidadeVolume ?? null)
        .input("numeracaovolume", sql.VarChar(60), input.numeracaoVolume ?? null)
        .input("especievolume", sql.VarChar(60), input.especieVolume ?? null)
        .input("pesoliquido", sql.Decimal(18, 4), input.pesoLiquido ?? null)
        .input("pesobruto", sql.Decimal(18, 4), input.pesoBruto ?? null)
        .input("situacao", sql.VarChar(1), input.rascunho ? "R" : "P")
        .input("totalprodutos", sql.Decimal(18, 4), subtotal)
        .input("descontovalor", sql.Decimal(18, 4), descontoCabecalho)
        .input("descontopercentual", sql.Decimal(18, 4), subtotal > 0 ? (descontoCabecalho / subtotal) * 100 : 0)
        .input("totalvenda", sql.Decimal(18, 4), totalVenda)
        .input("valorpago", sql.Decimal(18, 4), valorPago)
        .input("observacao", sql.VarChar(sql.MAX), input.observacao ?? null)
        .query(`
          MERGE KS0005.KS00016 AS t
          USING (SELECT @guidvenda AS GUIDVENDA) AS s
            ON t.GUIDVENDA=s.GUIDVENDA AND t.GUIDENTIDADE=@guidentidade AND t.ORIGEM='NTA'
          WHEN MATCHED THEN UPDATE SET
            GUIDCLIENTE=@guidcliente, CODCLIENTE=@codcliente, CLIENTEPADRAO=0,
            CODENTIDADE=@codentidade, GUIDPESSOAS=@guidpessoas, CODTRANSACAO=@codtransacao,
            GUIDCAIXA=@guidcaixa, GUIDVENDEDOR=@guidusuario, GUIDUSUARIOCAIXA=@guidusuario, DATAVENDA=GETDATE(),
            TIPOOPERACAO=@tipooperacao, SITUACAO=@situacao, TOTALPRODUTOS=@totalprodutos,
            DESCONTOVALOR=@descontovalor, DESCONTOPERCENTUAL=@descontopercentual,
            VALORPRODUTOS=@totalprodutos, DESCONTO=@descontovalor, VALORFINAL=@totalvenda,
            ACRESCIMOVALOR=0, TOTALVENDA=@totalvenda, VALORPAGO=@valorpago, TROCO=0,
            OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE(), SINCRONIZADO=0,
            CODPREVENDA=@numerovenda, ORIGEM='NTA', GUIDNATUREZAOPERACAO=@guidnatureza,
            NATUREZAOPERACAO=@natureza, TIPODOCUMENTOFISCAL='NFE_AVULSA', MODELOFISCAL=55,
            TIPONFE=@tiponfe, PRESENCACOMPRADOR=@presencacomprador, ORDEMCOMPRA=@ordemcompra,
            COMPLEMENTOOBS=@complementoobs, MODALIDADEFRETE=@modalidadefrete,
            GUIDTRANSPORTADORA=@guidtransportadora, QUANTIDADEVOLUME=@quantidadevolume,
            NUMERACAOVOLUME=@numeracaovolume, ESPECIEVOLUME=@especievolume,
            PESOLIQUIDO=@pesoliquido, PESOBRUTO=@pesobruto,
            STATUSNFE=CASE WHEN STATUSNFE IS NULL THEN 'RASCUNHO' ELSE STATUSNFE END
          WHEN NOT MATCHED THEN INSERT
            (CODENTIDADE,CODPREVENDA,GUIDVENDA,GUIDENTIDADE,GUIDPESSOAS,CODTRANSACAO,GUIDCAIXA,
             NUMEROVENDA,GUIDCLIENTE,CODCLIENTE,CLIENTEPADRAO,GUIDVENDEDOR,
             GUIDUSUARIOCAIXA,DATAVENDA,DATAEMISSAO,TIPOOPERACAO,SITUACAO,
             VALORPRODUTOS,VALORFRETE,OUTRASDESPESAS,VALORIPI,DESCONTO,VALORICMS,BASEICMS,VALORSEGURO,
             VALORICMSST,BASEICMSST,VALORFINAL,VALORPIS,VALORCOFINS,VALORFINANCEIRA,FATURAR,
             TOTALPRODUTOS,DESCONTOVALOR,DESCONTOPERCENTUAL,
             ACRESCIMOVALOR,TOTALVENDA,VALORPAGO,TROCO,OBSERVACAO,ULTIMAALTERACAO,SINCRONIZADO,ORIGEM,
             GUIDNATUREZAOPERACAO,NATUREZAOPERACAO,TIPODOCUMENTOFISCAL,MODELOFISCAL,TIPONFE,PRESENCACOMPRADOR,
             ORDEMCOMPRA,COMPLEMENTOOBS,MODALIDADEFRETE,GUIDTRANSPORTADORA,QUANTIDADEVOLUME,NUMERACAOVOLUME,
             ESPECIEVOLUME,PESOLIQUIDO,PESOBRUTO,STATUSNFE)
          VALUES
            (@codentidade,@numerovenda,@guidvenda,@guidentidade,@guidpessoas,@codtransacao,@guidcaixa,
             @numerovenda,@guidcliente,@codcliente,0,@guidusuario,
             @guidusuario,GETDATE(),GETDATE(),@tipooperacao,@situacao,
             @totalprodutos,0,0,0,@descontovalor,0,0,0,
             0,0,@totalvenda,0,0,0,0,
             @totalprodutos,@descontovalor,@descontopercentual,
             0,@totalvenda,@valorpago,0,@observacao,GETDATE(),0,'NTA',
             @guidnatureza,@natureza,'NFE_AVULSA',55,@tiponfe,@presencacomprador,
             @ordemcompra,@complementoobs,@modalidadefrete,@guidtransportadora,@quantidadevolume,@numeracaovolume,
             @especievolume,@pesoliquido,@pesobruto,'RASCUNHO');
        `);

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("DELETE FROM KS0005.KS00017 WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade");
      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("DELETE FROM KS0005.KS00018 WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade");

      for (let index = 0; index < input.itens.length; index += 1) {
        const item = input.itens[index];
        const produto = await request()
          .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query(`
            SELECT TOP 1
              CODPRODUTO, PRODUTO, SITUACAO, ISNULL(ESTOQUE,0) AS ESTOQUE, ISNULL(PRECOCUSTO,0) AS PRECOCUSTO,
              NCM, CFOP, CSOSN, CST, UNIDADE, ISNULL(ORIGEMPRODUTO,0) AS ORIGEMPRODUTO,
              ISNULL(ALIQICMS,0) AS ALIQICMS, ISNULL(ALIQPIS,0) AS ALIQPIS,
              ISNULL(ALIQCOFINS,0) AS ALIQCOFINS, ISNULL(ALIQIPI,0) AS ALIQIPI,
              ISNULL(ALIQIBS,0) AS ALIQIBS, ISNULL(ALIQCBS,0) AS ALIQCBS, ISNULL(ALIQIS,0) AS ALIQIS
            FROM KS0000.KS00009
            WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade
          `);
        const produtoRow = produto.recordset[0];
        if (!produtoRow || produtoRow.SITUACAO !== "A") throw new Error(`Produto inativo ou nao encontrado: ${item.descricao}`);
        if (!item.guidProduto) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} nao foi informado.`);
        if (item.quantidade <= 0) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta com quantidade zerada.`);
        if (item.precoVenda <= 0) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta com valor unitario zerado.`);

        const ncm = textFiscal(item.ncm || produtoRow.NCM);
        const cfop = textFiscal(item.cfop || produtoRow.CFOP);
        const origemProduto = item.origemProduto ?? Number(produtoRow.ORIGEMPRODUTO ?? 0);
        const csosn = textFiscal(item.csosn || produtoRow.CSOSN);
        const cstIcms = textFiscal(item.cstIcms || produtoRow.CST);
        const aliqIcms = Number(item.aliqIcms ?? produtoRow.ALIQICMS ?? 0);
        const aliqPis = Number(item.aliqPis ?? produtoRow.ALIQPIS ?? 0);
        const aliqCofins = Number(item.aliqCofins ?? produtoRow.ALIQCOFINS ?? 0);
        const aliqIpi = Number(item.aliqIpi ?? produtoRow.ALIQIPI ?? 0);
        const aliqIbs = Number(item.aliqIbs ?? produtoRow.ALIQIBS ?? 0);
        const aliqCbs = Number(item.aliqCbs ?? produtoRow.ALIQCBS ?? 0);
        const aliqIs = Number(item.aliqIs ?? produtoRow.ALIQIS ?? 0);
        const cstPis = textFiscal(item.cstPis || (aliqPis > 0 ? "01" : ""));
        const cstCofins = textFiscal(item.cstCofins || (aliqCofins > 0 ? "01" : ""));
        const cstIpi = textFiscal(item.cstIpi || (aliqIpi > 0 ? "99" : ""));
        const unidade = textFiscal(produtoRow.UNIDADE || "UN");

        if (!ncm) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem NCM informado.`);
        if (!cfop) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CFOP informado.`);
        if (origemProduto === null || origemProduto === undefined) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem origem da mercadoria informada.`);
        if (empresaSimples && !csosn) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CSOSN para empresa do Simples Nacional.`);
        if (empresaNormal && !cstIcms) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CST ICMS para empresa do Regime Normal.`);
        if (aliqPis > 0 && !cstPis) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CST PIS informado.`);
        if (aliqCofins > 0 && !cstCofins) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CST COFINS informado.`);
        if (aliqIpi > 0 && !cstIpi) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CST IPI informado.`);
        if (!unidade) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem unidade informada.`);

        const descontoValor = Math.min(item.descontoValor, item.precoVenda);
        const descontoGeralRateado = baseRateio > 0 ? descontoGeralInformado * (basesRateio[index] / baseRateio) : 0;
        const fiscal = calcularFiscalItem({
          quantidade: item.quantidade,
          precoVenda: item.precoVenda,
          descontoValor,
          descontoGeralRateado,
          aliqIcms,
          aliqPis,
          aliqCofins,
          aliqIpi,
          aliqIbs,
          aliqCbs,
          aliqIs,
        });
        if (fiscal.totalLiquidoItem <= 0) throw new Error(`Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem total do item calculado.`);

        await request()
          .input("guiditem", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidvenda", sql.UniqueIdentifier, guidVenda)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("codentidade", sql.Int, codEntidade)
          .input("codprevenda", sql.Int, numeroVenda)
          .input("guidvendedor", sql.UniqueIdentifier, session.guidPessoa)
          .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
          .input("codproduto", sql.Int, item.codProduto ?? produtoRow.CODPRODUTO ?? null)
          .input("item", sql.Int, index + 1)
          .input("quantidade", sql.Decimal(18, 4), item.quantidade)
          .input("precocusto", sql.Decimal(18, 4), item.precoCusto || Number(produtoRow.PRECOCUSTO ?? 0))
          .input("precovenda", sql.Decimal(18, 4), item.precoVenda)
          .input("precofinal", sql.Decimal(18, 4), fiscal.totalLiquidoItem / item.quantidade)
          .input("estoque", sql.Decimal(18, 4), Number(produtoRow.ESTOQUE ?? 0))
          .input("comissaozero", sql.Decimal(18, 4), 0)
          .input("descontopercentual", sql.Decimal(18, 4), item.precoVenda > 0 ? (item.descontoValor / item.precoVenda) * 100 : 0)
          .input("descontovalor", sql.Decimal(18, 4), descontoValor)
          .input("totalitem", sql.Decimal(18, 4), fiscal.totalLiquidoItem)
          .input("observacao", sql.VarChar(sql.MAX), item.descricao)
          .input("ncm", sql.VarChar(10), ncm)
          .input("cfop", sql.VarChar(10), cfop)
          .input("origemproduto", sql.Int, origemProduto)
          .input("csosn", sql.VarChar(5), csosn || null)
          .input("csticms", sql.VarChar(5), cstIcms || null)
          .input("cstpis", sql.VarChar(5), cstPis || null)
          .input("cstcofins", sql.VarChar(5), cstCofins || null)
          .input("cstipi", sql.VarChar(5), cstIpi || null)
          .input("aliqicms", sql.Decimal(18, 4), aliqIcms)
          .input("aliqpis", sql.Decimal(18, 4), aliqPis)
          .input("aliqcofins", sql.Decimal(18, 4), aliqCofins)
          .input("aliqipi", sql.Decimal(18, 4), aliqIpi)
          .input("aliqibs", sql.Decimal(18, 4), aliqIbs)
          .input("aliqcbs", sql.Decimal(18, 4), aliqCbs)
          .input("aliqis", sql.Decimal(18, 4), aliqIs)
          .input("totalbrutoitem", sql.Decimal(18, 4), fiscal.totalBrutoItem)
          .input("descontoitem", sql.Decimal(18, 4), fiscal.descontoItem)
          .input("descontogeralrateado", sql.Decimal(18, 4), fiscal.descontoGeralRateado)
          .input("totalliquidoitem", sql.Decimal(18, 4), fiscal.totalLiquidoItem)
          .input("baseicms", sql.Decimal(18, 4), fiscal.baseIcms)
          .input("valoricms", sql.Decimal(18, 4), fiscal.valorIcms)
          .input("basepis", sql.Decimal(18, 4), fiscal.basePis)
          .input("valorpis", sql.Decimal(18, 4), fiscal.valorPis)
          .input("basecofins", sql.Decimal(18, 4), fiscal.baseCofins)
          .input("valorcofins", sql.Decimal(18, 4), fiscal.valorCofins)
          .input("baseipi", sql.Decimal(18, 4), fiscal.baseIpi)
          .input("valoripi", sql.Decimal(18, 4), fiscal.valorIpi)
          .input("valoribs", sql.Decimal(18, 4), fiscal.valorIbs)
          .input("valorcbs", sql.Decimal(18, 4), fiscal.valorCbs)
          .input("valoris", sql.Decimal(18, 4), fiscal.valorIs)
          .query(`
            INSERT INTO KS0005.KS00017
              (CODENTIDADE,CODPREVENDA,GUIDITEMVENDA,GUIDVENDA,GUIDENTIDADE,GUIDVENDEDOR,GUIDPRODUTO,
               CODPRODUTO,ITEM,QUANTIDADE,ESTOQUE,PRECOCUSTO,PRECOVENDA,
               PRECOFINAL,PROMOCAO,PORCENTAGEMCOMISSAO,COMISSAO,COMISSAOPAGA,
               DESCONTOPERCENTUAL,DESCONTOVALOR,TOTALITEM,VALORTOTAL,OBSERVACAO,
               NCM,CFOP,ORIGEMPRODUTO,CSOSN,CSTICMS,CSTPIS,CSTCOFINS,CSTIPI,
               PORCICMS,PORCIPI,PORCPIS,VALORPISST,PORCPISST,PORCCOFINS,PORCMVA,REDBASEICMS,REDBASEICMSST,
               BASEICMSST,PORCICMSST,VALORICMSST,FATURAR,
               ALIQICMS,ALIQPIS,ALIQCOFINS,ALIQIPI,ALIQIBS,ALIQCBS,ALIQIS,
               TOTALBRUTOITEM,DESCONTOITEM,DESCONTOGERALRATEADO,TOTALLIQUIDOITEM,
               BASEICMS,VALORICMS,BASEPIS,VALORPIS,BASECOFINS,VALORCOFINS,BASEIPI,VALORIPI,
               VALORIBS,VALORCBS,VALORIS,ULTIMAALTERACAO,SINCRONIZADO)
            VALUES
              (@codentidade,@codprevenda,@guiditem,@guidvenda,@guidentidade,@guidvendedor,@guidproduto,
               @codproduto,@item,@quantidade,@estoque,@precocusto,@precovenda,
               @precofinal,0,@comissaozero,@comissaozero,0,
               @descontopercentual,@descontovalor,@totalitem,@totalitem,@observacao,
               @ncm,@cfop,@origemproduto,@csosn,@csticms,@cstpis,@cstcofins,@cstipi,
               @aliqicms,@aliqipi,@aliqpis,0,0,@aliqcofins,0,0,0,
               0,0,0,0,
               @aliqicms,@aliqpis,@aliqcofins,@aliqipi,@aliqibs,@aliqcbs,@aliqis,
               @totalbrutoitem,@descontoitem,@descontogeralrateado,@totalliquidoitem,
               @baseicms,@valoricms,@basepis,@valorpis,@basecofins,@valorcofins,@baseipi,@valoripi,
               @valoribs,@valorcbs,@valoris,GETDATE(),0)
          `);
      }

      for (const pagamento of input.pagamentos) {
        const guidPagamento = crypto.randomUUID();
        await request()
          .input("guidpagamento", sql.UniqueIdentifier, guidPagamento)
          .input("guidvenda", sql.UniqueIdentifier, guidVenda)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("codforma", sql.Int, pagamento.codFormaPagamento ?? null)
          .input("descricao", sql.VarChar(100), pagamento.descricaoFormaPagamento)
          .input("valorpago", sql.Decimal(18, 4), pagamento.valorPago)
          .input("parcelas", sql.Int, pagamento.parcelas)
          .query(`
            INSERT INTO KS0005.KS00018
              (GUIDPAGAMENTO,GUIDPAGAMENTOVENDA,GUIDVENDA,GUIDENTIDADE,GUIDFORMAPAGAMENTO,CODFORMAPAGAMENTO,DESCRICAOFORMAPAGAMENTO,VALORPAGO,TROCO,PARCELAS,DATAHORA,ULTIMAALTERACAO,SINCRONIZADO)
            VALUES
              (@guidpagamento,@guidpagamento,@guidvenda,@guidentidade,@guidforma,@codforma,@descricao,@valorpago,0,@parcelas,GETDATE(),GETDATE(),0)
          `);
      }

      await tx.commit();
      return { success: true, guidVenda, numeroVenda, codPreVenda: numeroVenda, totalVenda };
    } catch (error) {
      await tx.rollback();
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Nao foi possivel salvar a NF-e Avulsa.",
      });
    }
  }),

  emitir: publicProcedure.input(z.object({ guidVenda: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const session = await getKsSession(ctx.req);
    await ensureNfeAvulsaStructure();
    const pool = await getSqlPool();
    const req = pool.request();
    const venda = await assertNfeAvulsa(req, input.guidVenda, session.guidEntidade);
    if (venda.STATUSNFE === "CANCELADA") throw new TRPCError({ code: "BAD_REQUEST", message: "NF-e cancelada nao pode ser emitida." });
    const itens = await pool.request()
      .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          OBSERVACAO, QUANTIDADE, PRECOVENDA, DESCONTOVALOR,
          NCM, CFOP, CSOSN, CSTICMS, BASEICMS, VALORICMS,
          BASEPIS, VALORPIS, BASECOFINS, VALORCOFINS, BASEIPI, VALORIPI,
          VALORIBS, VALORCBS, VALORIS
        FROM KS0005.KS00017
        WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade
        ORDER BY ITEM
      `);
    const xml = buildLocalXml({
      guidVenda: input.guidVenda,
      numero: Number(venda.NUMEROVENDA ?? 0),
      cliente: String(venda.GUIDCLIENTE ?? ""),
      total: Number(venda.TOTALVENDA ?? 0),
      itens: itens.recordset.map((row) => ({
        descricao: String(row.OBSERVACAO ?? "Produto"),
        quantidade: Number(row.QUANTIDADE ?? 0),
        precoVenda: Number(row.PRECOVENDA ?? 0),
        descontoValor: Number(row.DESCONTOVALOR ?? 0),
        ncm: row.NCM ?? null,
        cfop: row.CFOP ?? null,
        csosn: row.CSOSN ?? null,
        cstIcms: row.CSTICMS ?? null,
        baseIcms: Number(row.BASEICMS ?? 0),
        valorIcms: Number(row.VALORICMS ?? 0),
        basePis: Number(row.BASEPIS ?? 0),
        valorPis: Number(row.VALORPIS ?? 0),
        baseCofins: Number(row.BASECOFINS ?? 0),
        valorCofins: Number(row.VALORCOFINS ?? 0),
        baseIpi: Number(row.BASEIPI ?? 0),
        valorIpi: Number(row.VALORIPI ?? 0),
        valorIbs: Number(row.VALORIBS ?? 0),
        valorCbs: Number(row.VALORCBS ?? 0),
        valorIs: Number(row.VALORIS ?? 0),
      })),
    });
    await pool.request()
      .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("xml", sql.NVarChar(sql.MAX), xml)
      .query(`
        UPDATE KS0005.KS00016 SET
          STATUSNFE='PENDENTE_ENVIO',
          DATAEMISSAONFE=GETDATE(),
          XMLNFE=@xml,
          ULTIMAALTERACAO=GETDATE(),
          SINCRONIZADO=0
        WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade AND ORIGEM='NTA'
      `);
    return { success: true, statusNfe: "PENDENTE_ENVIO", message: "NF-e Avulsa preparada para envio pela API fiscal." };
  }),

  consultar: publicProcedure.input(z.object({ guidVenda: z.string().uuid() })).query(async ({ ctx, input }) => {
    const session = await getKsSession(ctx.req);
    await ensureNfeAvulsaStructure();
    const pool = await getSqlPool();
    const venda = await assertNfeAvulsa(pool.request(), input.guidVenda, session.guidEntidade);
    return {
      statusNfe: venda.STATUSNFE ?? "RASCUNHO",
      chave: venda.CHAVE ?? null,
      protocolo: venda.PROTOCOLO ?? null,
      dataEmissaoNfe: venda.DATAEMISSAONFE ?? null,
      motivoCancelamento: venda.MOTIVOCANCELAMENTO ?? null,
    };
  }),

  cancelar: publicProcedure
    .input(z.object({ guidVenda: z.string().uuid(), motivo: z.string().min(15).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureNfeAvulsaStructure();
      const pool = await getSqlPool();
      await assertNfeAvulsa(pool.request(), input.guidVenda, session.guidEntidade);
      await pool.request()
        .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("motivo", sql.VarChar(500), input.motivo)
        .query(`
          UPDATE KS0005.KS00016 SET
            STATUSNFE='CANCELADA',
            SITUACAO='CANCELADA',
            MOTIVOCANCELAMENTO=@motivo,
            ULTIMAALTERACAO=GETDATE(),
            SINCRONIZADO=0
          WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade AND ORIGEM='NTA'
        `);
      return { success: true, statusNfe: "CANCELADA" };
    }),

  obterXml: publicProcedure.input(z.object({ guidVenda: z.string().uuid() })).query(async ({ ctx, input }) => {
    const session = await getKsSession(ctx.req);
    await ensureNfeAvulsaStructure();
    const pool = await getSqlPool();
    const venda = await assertNfeAvulsa(pool.request(), input.guidVenda, session.guidEntidade);
    return { xml: venda.XMLNFE ?? "", numeroVenda: Number(venda.NUMEROVENDA ?? 0) };
  }),
});

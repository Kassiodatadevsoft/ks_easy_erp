/**
 * syncDelphiRouter — API REST de sincronização bidirecional Delphi ↔ KS Easy ERP
 *
 * Autenticação: Bearer token via header Authorization: Bearer <API_KEY>
 * O API_KEY é o campo APIKEY da tabela KS0002.KS00001 (empresa).
 *
 * Endpoints (via tRPC publicProcedure com verificação manual de API Key):
 *   POST /api/trpc/syncDelphi.push  — Delphi envia lote de registros para o ERP
 *   GET  /api/trpc/syncDelphi.pull  — Delphi busca delta de alterações desde último sync
 *   POST /api/trpc/syncDelphi.ack   — Delphi confirma recebimento (atualiza lastSyncAt)
 *   GET  /api/trpc/syncDelphi.info  — Retorna metadados da empresa e timestamp do servidor
 *
 * Tabela de controle de sync: KS0002.KS00010 (criada automaticamente se não existir)
 *   GUIDSYNC, GUIDENTIDADE, DISPOSITIVO, LASTSYNC_AT, LASTSYNC_PUSH, LASTSYNC_PULL
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import crypto from "crypto";
import { garantirTabelasConciliacao } from "./conciliacaoRouter";
import { garantirTabelaProdutoUnidadePreco } from "../services/produtoUnidadePreco";

// ─── Autenticação via API Key ──────────────────────────────────────────────
async function autenticarApiKey(req: { headers: Record<string, string | string[] | undefined> }) {
  const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!apiKey) throw new TRPCError({ code: "UNAUTHORIZED", message: "API Key ausente. Use: Authorization: Bearer <API_KEY>" });

  const pool = await getSqlPool();
  const r = await pool.request()
    .input("apikey", sql.NVarChar(100), apiKey)
    .query(`
      SELECT TOP 1
        CAST(GUIDENTIDADE AS NVARCHAR(36)) AS guidEntidade,
        RAZAOSOCIAL, FANTASIA, CNPJ, SITUACAO
      FROM KS0002.KS00001
      WHERE APIKEY = @apikey AND SITUACAO = 'A'
    `);

  if (!r.recordset.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "API Key inválida ou empresa inativa." });
  return r.recordset[0] as { guidEntidade: string; RAZAOSOCIAL: string; FANTASIA: string; CNPJ: string; SITUACAO: string };
}

// ─── Garantir tabela de controle de sync ──────────────────────────────────
async function garantirTabelaSync(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await garantirTabelaProdutoUnidadePreco();

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00010')
    CREATE TABLE KS0002.KS00010 (
      GUIDSYNC        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DISPOSITIVO     NVARCHAR(100)    NOT NULL DEFAULT 'default',
      LASTSYNC_AT     DATETIME         NULL,
      LASTSYNC_PUSH   DATETIME         NULL,
      LASTSYNC_PULL   DATETIME         NULL,
      VERSAO_DELPHI   NVARCHAR(20)     NULL,
      CONSTRAINT FK_SYNC_ENTIDADE FOREIGN KEY (GUIDENTIDADE) REFERENCES KS0002.KS00001(GUIDENTIDADE)
    )
  `);

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

  await garantirTabelasConciliacao(pool);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00016')
    CREATE TABLE KS0003.KS00016 (
      GUIDVENDA       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      NUMEROVENDA     NVARCHAR(60)     NOT NULL,
      CODFILIAL       INT              NULL,
      GUIDCLIENTE     UNIQUEIDENTIFIER NULL,
      CLIENTE         NVARCHAR(150)    NULL,
      DOCUMENTO       NVARCHAR(20)     NULL,
      DATAVENDA       DATETIME         NOT NULL,
      STATUS          NVARCHAR(20)     NOT NULL DEFAULT 'ABERTA',
      VALORPRODUTOS   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORDESCONTO   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORACRESCIMO  DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORTOTAL      DECIMAL(15,2)    NOT NULL DEFAULT 0,
      NOTAMODELO      NVARCHAR(5)      NULL,
      NOTASERIE       NVARCHAR(10)     NULL,
      NOTANUMERO      NVARCHAR(20)     NULL,
      NOTACHAVE       NVARCHAR(44)     NULL,
      NOTAPROTOCOLO   NVARCHAR(60)     NULL,
      NOTASTATUS      NVARCHAR(30)     NULL,
      NOTADATAEMISSAO DATETIME         NULL,
      NOTAXML         NVARCHAR(MAX)    NULL,
      NOTADANFEURL    NVARCHAR(1000)   NULL,
      NOTAMENSAGEMSEFAZ NVARCHAR(1000) NULL,
      OBSERVACAO      NVARCHAR(500)    NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF COL_LENGTH('KS0003.KS00016','NOTAMODELO') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTAMODELO NVARCHAR(5) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTASERIE') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTASERIE NVARCHAR(10) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTANUMERO') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTANUMERO NVARCHAR(20) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTACHAVE') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTACHAVE NVARCHAR(44) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTAPROTOCOLO') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTAPROTOCOLO NVARCHAR(60) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTASTATUS') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTASTATUS NVARCHAR(30) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTADATAEMISSAO') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTADATAEMISSAO DATETIME NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTAXML') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTAXML NVARCHAR(MAX) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTADANFEURL') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTADANFEURL NVARCHAR(1000) NULL;
    IF COL_LENGTH('KS0003.KS00016','NOTAMENSAGEMSEFAZ') IS NULL ALTER TABLE KS0003.KS00016 ADD NOTAMENSAGEMSEFAZ NVARCHAR(1000) NULL;
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00017')
    CREATE TABLE KS0003.KS00017 (
      GUIDITEM        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDVENDA       UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      GUIDPRODUTO     UNIQUEIDENTIFIER NULL,
      CODPRODUTO      NVARCHAR(60)     NULL,
      PRODUTO         NVARCHAR(200)    NOT NULL,
      UNIDADE         NVARCHAR(6)      NULL,
      QUANTIDADE      DECIMAL(15,4)    NOT NULL,
      VALORUNITARIO   DECIMAL(15,4)    NOT NULL,
      VALORDESCONTO   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORTOTAL      DECIMAL(15,2)    NOT NULL,
      CFOP            NVARCHAR(10)     NULL,
      CST             NVARCHAR(10)     NULL,
      CSOSN           NVARCHAR(10)     NULL,
      NCM             NVARCHAR(10)     NULL,
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00018')
    CREATE TABLE KS0003.KS00018 (
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDVENDA       UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      GUIDFORMAPAGAMENTO UNIQUEIDENTIFIER NULL,
      FORMAPAGAMENTO  NVARCHAR(100)    NOT NULL,
      CODIGOSEFAZ     NVARCHAR(2)      NULL,
      VALOR           DECIMAL(15,2)    NOT NULL,
      PARCELAS        INT              NOT NULL DEFAULT 1,
      NSU             NVARCHAR(80)     NULL,
      AUTORIZACAO     NVARCHAR(80)     NULL,
      BANDEIRA        NVARCHAR(60)     NULL,
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00020')
    CREATE TABLE KS0003.KS00020 (
      GUIDEVENTO      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDVENDA       UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      TIPOEVENTO      NVARCHAR(40)     NOT NULL,
      SEQUENCIA       INT              NOT NULL DEFAULT 1,
      PROTOCOLO       NVARCHAR(60)     NULL,
      JUSTIFICATIVA   NVARCHAR(500)    NULL,
      XML             NVARCHAR(MAX)    NULL,
      STATUS          NVARCHAR(30)     NOT NULL DEFAULT 'REGISTRADO',
      MENSAGEMSEFAZ   NVARCHAR(1000)   NULL,
      DATAEVENTO      DATETIME         NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF COL_LENGTH('KS0003.KS00020','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00020 ADD GUIDVENDA UNIQUEIDENTIFIER NULL;
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00021')
    CREATE TABLE KS0003.KS00021 (
      GUIDFECHAMENTO  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DISPOSITIVO     NVARCHAR(100)    NOT NULL,
      OPERADOR        NVARCHAR(100)    NULL,
      DATAABERTURA    DATETIME         NULL,
      DATAFECHAMENTO  DATETIME         NOT NULL,
      STATUS          NVARCHAR(20)     NOT NULL DEFAULT 'FECHADO',
      VALORABERTURA   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      TOTALVENDAS     DECIMAL(15,2)    NOT NULL DEFAULT 0,
      TOTALSUPRIMENTO DECIMAL(15,2)    NOT NULL DEFAULT 0,
      TOTALSANGRIA    DECIMAL(15,2)    NOT NULL DEFAULT 0,
      TOTALINFORMADO  DECIMAL(15,2)    NOT NULL DEFAULT 0,
      TOTALDIFERENCA  DECIMAL(15,2)    NOT NULL DEFAULT 0,
      OBSERVACAO      NVARCHAR(500)    NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00022')
    CREATE TABLE KS0003.KS00022 (
      GUIDCONTROLE    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDFECHAMENTO  UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      GUIDFORMAPAGAMENTO UNIQUEIDENTIFIER NULL,
      FORMAPAGAMENTO  NVARCHAR(100)    NOT NULL,
      CODIGOSEFAZ     NVARCHAR(2)      NULL,
      VALORSISTEMA    DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORINFORMADO  DECIMAL(15,2)    NOT NULL DEFAULT 0,
      DIFERENCA       DECIMAL(15,2)    NOT NULL DEFAULT 0,
      QUANTIDADE      INT              NOT NULL DEFAULT 0,
      OBSERVACAO      NVARCHAR(500)    NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
}

// ─── Schemas Zod ──────────────────────────────────────────────────────────

const PessoaSchema = z.object({
  guidPessoa:    z.string().uuid().optional(),
  nome:          z.string().min(1),
  fantasia:      z.string().optional(),
  documento:     z.string().optional(),
  tipodoc:       z.number().int().optional(), // 1=CPF, 2=CNPJ
  telefone:      z.string().optional(),
  celular:       z.string().optional(),
  email:         z.string().optional(),
  cep:           z.string().optional(),
  endereco:      z.string().optional(),
  numero:        z.string().optional(),
  bairro:        z.string().optional(),
  complemento:   z.string().optional(),
  cidade:        z.string().optional(),
  uf:            z.string().max(2).optional(),
  cadCliente:    z.boolean().optional(),
  cadFornecedor: z.boolean().optional(),
  situacao:      z.enum(["A","I"]).optional(),
  ultimaAlteracao: z.string().optional(), // ISO datetime
});

const ContaReceberSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  descricao:       z.string().min(1),
  guidDevedor:     z.string().uuid().optional(),
  nomeDevedor:     z.string().min(1),
  valor:           z.number().positive(),
  valorRecebido:   z.number().min(0).optional(),
  dtLancamento:    z.string(), // YYYY-MM-DD
  dtVencimento:    z.string(), // YYYY-MM-DD
  dtRecebimento:   z.string().optional(),
  status:          z.enum(["ABERTO","PAGO","PARCIAL","CANCELADO"]).optional(),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const ContaPagarSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  descricao:       z.string().min(1),
  guidCredor:      z.string().uuid().optional(),
  nomeCredor:      z.string().min(1),
  valor:           z.number().positive(),
  valorPago:       z.number().min(0).optional(),
  dtLancamento:    z.string(),
  dtVencimento:    z.string(),
  dtPagamento:     z.string().optional(),
  status:          z.enum(["ABERTO","PAGO","PARCIAL","CANCELADO"]).optional(),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const ContaReceberBoletoSchema = z.object({
  guidBoleto:      z.string().uuid().optional(),
  guidLancamento:  z.string().uuid(),
  banco:           z.enum(["ITAU", "CORA"]),
  valor:           z.number().positive(),
  vencimento:      z.string(),
  status:          z.enum(["NAO_EMITIDO","PENDENTE","REGISTRADO","PAGO","CANCELADO","VENCIDO","ERRO"]).optional(),
  nossoNumero:     z.string().optional(),
  linhaDigitavel:  z.string().optional(),
  codigoBarras:    z.string().optional(),
  urlPdf:          z.string().optional(),
  externalId:      z.string().optional(),
  mensagemErro:    z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const ContaReceberBoletoEventoSchema = z.object({
  guidEvento:      z.string().uuid().optional(),
  guidBoleto:      z.string().uuid(),
  tipoEvento:      z.string().min(1).max(40),
  descricao:       z.string().optional(),
  requestJson:     z.string().optional(),
  responseJson:    z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const LancamentoCaixaSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  dtLancamento:    z.string(),
  tipo:            z.enum(["E","S"]),
  valor:           z.number().positive(),
  descricao:       z.string().min(1),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const ConciliacaoPagamentoSchema = z.object({
  guidPagamentoCartaoPix: z.string().uuid().optional(),
  guidVenda:             z.string().uuid().optional(),
  guidLancamento:        z.string().uuid().optional(),
  guidPagamentoForma:    z.string().uuid().optional(),
  codFilial:             z.number().int().optional(),
  formaPagamento:        z.string().optional(),
  cliente:               z.string().optional(),
  numeroVenda:           z.string().optional(),
  bandeira:              z.string().optional(),
  tipo:                  z.enum(["CREDITO","DEBITO","PIX"]),
  adquirente:            z.string().optional(),
  nsu:                   z.string().optional(),
  autorizacao:           z.string().optional(),
  tid:                   z.string().optional(),
  txid:                  z.string().optional(),
  e2eId:                 z.string().optional(),
  valorBruto:            z.number().positive(),
  parcelas:              z.number().int().min(1).default(1),
  dataVenda:             z.string(),
  previsaoRecebimento:   z.string(),
  status:                z.enum(["PENDENTE","CONCILIADO","DIVERGENTE","CANCELADO"]).optional(),
  ultimaAlteracao:       z.string().optional(),
});

const ConciliacaoParcelaSchema = z.object({
  guidParcela:           z.string().uuid().optional(),
  guidPagamentoCartaoPix:z.string().uuid(),
  numeroParcela:         z.number().int().min(1),
  valorBruto:            z.number().positive(),
  taxa:                  z.number().min(0).optional(),
  valorLiquidoPrevisto:  z.number().min(0),
  valorRecebido:         z.number().min(0).optional(),
  diferenca:             z.number().optional(),
  dtPrevista:            z.string(),
  dtRecebimento:         z.string().optional(),
  guidContaBancaria:    z.string().uuid().optional(),
  status:                z.enum(["PENDENTE","CONCILIADO","DIVERGENTE","CANCELADO"]).optional(),
  motivoDivergencia:     z.string().optional(),
  observacao:            z.string().optional(),
  ultimaAlteracao:       z.string().optional(),
});

const ConciliacaoEventoSchema = z.object({
  guidEvento:            z.string().uuid().optional(),
  guidPagamentoCartaoPix:z.string().uuid(),
  guidParcela:           z.string().uuid().optional(),
  tipoEvento:            z.string().min(1).max(40),
  statusAnterior:        z.string().optional(),
  statusNovo:            z.string().optional(),
  descricao:             z.string().optional(),
  observacao:            z.string().optional(),
  ultimaAlteracao:       z.string().optional(),
});

const VendaSchema = z.object({
  guidVenda:      z.string().uuid().optional(),
  numeroVenda:    z.string().min(1).max(60),
  codFilial:      z.number().int().optional(),
  guidCliente:    z.string().uuid().optional(),
  cliente:        z.string().optional(),
  documento:      z.string().optional(),
  dataVenda:      z.string(),
  status:         z.enum(["ABERTA","FECHADA","CANCELADA","DEVOLVIDA"]).optional(),
  valorProdutos:  z.number().min(0).default(0),
  valorDesconto:  z.number().min(0).optional(),
  valorAcrescimo: z.number().min(0).optional(),
  valorTotal:     z.number().min(0),
  notaModelo:     z.enum(["55","65","SAT","NFS"]).optional(),
  notaSerie:      z.string().optional(),
  notaNumero:     z.string().optional(),
  notaChave:      z.string().optional(),
  notaProtocolo:  z.string().optional(),
  notaStatus:     z.enum(["PENDENTE","AUTORIZADA","REJEITADA","CANCELADA","DENEGADA","INUTILIZADA"]).optional(),
  notaDataEmissao:z.string().optional(),
  notaXml:        z.string().optional(),
  notaDanfeUrl:   z.string().optional(),
  notaMensagemSefaz: z.string().optional(),
  observacao:     z.string().optional(),
  ultimaAlteracao:z.string().optional(),
});

const VendaItemSchema = z.object({
  guidItem:       z.string().uuid().optional(),
  guidVenda:      z.string().uuid(),
  guidProduto:    z.string().uuid().optional(),
  codProduto:     z.string().optional(),
  produto:        z.string().min(1),
  unidade:        z.string().optional(),
  quantidade:     z.number().positive(),
  valorUnitario:  z.number().min(0),
  valorDesconto:  z.number().min(0).optional(),
  valorTotal:     z.number().min(0),
  cfop:           z.string().optional(),
  cst:            z.string().optional(),
  csosn:          z.string().optional(),
  ncm:            z.string().optional(),
  ultimaAlteracao:z.string().optional(),
});

const VendaPagamentoSchema = z.object({
  guidPagamento:      z.string().uuid().optional(),
  guidVenda:          z.string().uuid(),
  guidFormaPagamento: z.string().uuid().optional(),
  formaPagamento:     z.string().min(1),
  codigoSefaz:        z.string().max(2).optional(),
  valor:              z.number().positive(),
  parcelas:           z.number().int().min(1).optional(),
  nsu:                z.string().optional(),
  autorizacao:        z.string().optional(),
  bandeira:           z.string().optional(),
  ultimaAlteracao:    z.string().optional(),
});

const NotaFiscalEventoSchema = z.object({
  guidEvento:     z.string().uuid().optional(),
  guidVenda:      z.string().uuid(),
  tipoEvento:     z.enum(["AUTORIZACAO","CANCELAMENTO","CARTA_CORRECAO","INUTILIZACAO","CONTINGENCIA","OUTRO"]),
  sequencia:      z.number().int().min(1).optional(),
  protocolo:      z.string().optional(),
  justificativa:  z.string().optional(),
  xml:            z.string().optional(),
  status:         z.string().optional(),
  mensagemSefaz:  z.string().optional(),
  dataEvento:     z.string().optional(),
  ultimaAlteracao:z.string().optional(),
});

const FechamentoCaixaSchema = z.object({
  guidFechamento: z.string().uuid().optional(),
  dispositivo:    z.string().min(1),
  operador:       z.string().optional(),
  dataAbertura:   z.string().optional(),
  dataFechamento: z.string(),
  status:         z.enum(["ABERTO","FECHADO","CONFERIDO","DIVERGENTE","CANCELADO"]).optional(),
  valorAbertura:  z.number().min(0).optional(),
  totalVendas:    z.number().min(0).optional(),
  totalSuprimento:z.number().min(0).optional(),
  totalSangria:   z.number().min(0).optional(),
  totalInformado: z.number().min(0).optional(),
  totalDiferenca: z.number().optional(),
  observacao:     z.string().optional(),
  ultimaAlteracao:z.string().optional(),
});

const FechamentoCaixaControleSchema = z.object({
  guidControle:       z.string().uuid().optional(),
  guidFechamento:     z.string().uuid(),
  guidFormaPagamento: z.string().uuid().optional(),
  formaPagamento:     z.string().min(1),
  codigoSefaz:        z.string().max(2).optional(),
  valorSistema:       z.number().min(0).optional(),
  valorInformado:     z.number().min(0).optional(),
  diferenca:          z.number().optional(),
  quantidade:         z.number().int().min(0).optional(),
  observacao:         z.string().optional(),
  ultimaAlteracao:    z.string().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────
export const syncDelphiRouter = router({

  /**
   * GET /api/trpc/syncDelphi.info
   * Retorna metadados da empresa e timestamp do servidor.
   * Usado pelo Delphi para verificar conectividade e sincronização.
   */
  info: publicProcedure.query(async ({ ctx }) => {
    const empresa = await autenticarApiKey(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelaSync(pool);

    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
      .query(`
        SELECT LASTSYNC_AT, LASTSYNC_PUSH, LASTSYNC_PULL, DISPOSITIVO, VERSAO_DELPHI
        FROM KS0002.KS00010
        WHERE GUIDENTIDADE = @guidentidade
      `);

    return {
      serverTime:     new Date().toISOString(),
      guidEntidade:   empresa.guidEntidade,
      razaoSocial:    empresa.RAZAOSOCIAL,
      fantasia:       empresa.FANTASIA,
      cnpj:           empresa.CNPJ,
      lastSyncAt:     r.recordset[0]?.LASTSYNC_AT ?? null,
      lastSyncPush:   r.recordset[0]?.LASTSYNC_PUSH ?? null,
      lastSyncPull:   r.recordset[0]?.LASTSYNC_PULL ?? null,
      versaoDelphi:   r.recordset[0]?.VERSAO_DELPHI ?? null,
    };
  }),

  /**
   * POST /api/trpc/syncDelphi.push
   * Delphi envia lote de registros para o ERP (upsert via MERGE).
   * Suporta: pessoas, contasReceber, contasPagar, lancamentosCaixa.
   */
  push: publicProcedure
    .input(z.object({
      dispositivo:    z.string().default("default"),
      versaoDelphi:   z.string().optional(),
      pessoas:        z.array(PessoaSchema).optional(),
      contasReceber:  z.array(ContaReceberSchema).optional(),
      contasReceberBoletos: z.array(ContaReceberBoletoSchema).optional(),
      contasReceberBoletoEventos: z.array(ContaReceberBoletoEventoSchema).optional(),
      contasPagar:    z.array(ContaPagarSchema).optional(),
      lancamentosCaixa: z.array(LancamentoCaixaSchema).optional(),
      conciliacaoPagamentos: z.array(ConciliacaoPagamentoSchema).optional(),
      conciliacaoParcelas: z.array(ConciliacaoParcelaSchema).optional(),
      conciliacaoEventos: z.array(ConciliacaoEventoSchema).optional(),
      vendas: z.array(VendaSchema).optional(),
      vendaItens: z.array(VendaItemSchema).optional(),
      vendaPagamentos: z.array(VendaPagamentoSchema).optional(),
      notaFiscalEventos: z.array(NotaFiscalEventoSchema).optional(),
      fechamentosCaixa: z.array(FechamentoCaixaSchema).optional(),
      fechamentosCaixaControle: z.array(FechamentoCaixaControleSchema).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      const resultado = {
        pessoas:          { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasReceber:    { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasReceberBoletos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasReceberBoletoEventos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasPagar:      { inseridos: 0, atualizados: 0, erros: [] as string[] },
        lancamentosCaixa: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        conciliacaoPagamentos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        conciliacaoParcelas: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        conciliacaoEventos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        vendas: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        vendaItens: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        vendaPagamentos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        notaFiscalEventos: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        fechamentosCaixa: { inseridos: 0, atualizados: 0, erros: [] as string[] },
        fechamentosCaixaControle: { inseridos: 0, atualizados: 0, erros: [] as string[] },
      };

      // ── Pessoas ──
      for (const p of input.pessoas ?? []) {
        try {
          const guid = p.guidPessoa ?? crypto.randomUUID();
          const r = await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("nome",         sql.NVarChar(150),    p.nome)
            .input("fantasia",     sql.NVarChar(100),    p.fantasia ?? null)
            .input("documento",    sql.NVarChar(20),     p.documento ?? null)
            .input("tipodoc",      sql.TinyInt,          p.tipodoc ?? null)
            .input("telefone",     sql.NVarChar(20),     p.telefone ?? null)
            .input("celular",      sql.NVarChar(20),     p.celular ?? null)
            .input("email",        sql.NVarChar(100),    p.email ?? null)
            .input("cep",          sql.NVarChar(9),      p.cep ?? null)
            .input("endereco",     sql.NVarChar(150),    p.endereco ?? null)
            .input("numero",       sql.NVarChar(10),     p.numero ?? null)
            .input("bairro",       sql.NVarChar(80),     p.bairro ?? null)
            .input("complemento",  sql.NVarChar(80),     p.complemento ?? null)
            .input("cidade",       sql.NVarChar(80),     p.cidade ?? null)
            .input("uf",           sql.Char(2),          p.uf ?? null)
            .input("cadCliente",   sql.Bit,              p.cadCliente ? 1 : 0)
            .input("cadFornecedor",sql.Bit,              p.cadFornecedor ? 1 : 0)
            .input("situacao",     sql.Char(1),          p.situacao ?? "A")
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0002.KS00001 AS t
              USING (SELECT @guid AS GUIDENTIDADE_PESSOA) AS s ON t.GUIDENTIDADE = @guid
              WHEN MATCHED THEN UPDATE SET
                NOME=@nome, FANTASIA=@fantasia, DOCUMENTO=@documento, CODTIPODOCUMENTO=@tipodoc,
                TELEFONE=@telefone, CELULAR=@celular, EMAIL=@email, CEP=@cep,
                ENDERECO=@endereco, NUMERO=@numero, BAIRRO=@bairro, COMPLEMENTO=@complemento,
                CIDADE=@cidade, UF=@uf, CADCLIENTE=@cadCliente, CADFORNECEDOR=@cadFornecedor,
                SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDENTIDADE,NOME,FANTASIA,DOCUMENTO,CODTIPODOCUMENTO,TELEFONE,CELULAR,EMAIL,
                 CEP,ENDERECO,NUMERO,BAIRRO,COMPLEMENTO,CIDADE,UF,CADCLIENTE,CADFORNECEDOR,
                 SITUACAO,CODENTIDADE,DATACADASTRO,ULTIMAALTERACAO)
              VALUES
                (@guid,@nome,@fantasia,@documento,@tipodoc,@telefone,@celular,@email,
                 @cep,@endereco,@numero,@bairro,@complemento,@cidade,@uf,@cadCliente,@cadFornecedor,
                 @situacao,@guidentidade,GETDATE(),GETDATE());
              SELECT @@ROWCOUNT AS affected, CASE WHEN EXISTS(SELECT 1 FROM KS0002.KS00001 WHERE GUIDENTIDADE=@guid AND DATACADASTRO=ULTIMAALTERACAO) THEN 'insert' ELSE 'update' END AS op
            `);
          const op = r.recordset[0]?.op;
          if (op === "insert") resultado.pessoas.inseridos++;
          else resultado.pessoas.atualizados++;
        } catch (e: any) {
          resultado.pessoas.erros.push(`${p.nome}: ${e.message}`);
        }
      }

      // ── Boletos de Contas a Receber ──
      for (const b of input.contasReceberBoletos ?? []) {
        try {
          const guid = b.guidBoleto ?? crypto.randomUUID();
          await pool.request()
            .input("guidBoleto", sql.UniqueIdentifier, guid)
            .input("guidLancamento", sql.UniqueIdentifier, b.guidLancamento)
            .input("banco", sql.NVarChar(20), b.banco)
            .input("valor", sql.Decimal(15,2), b.valor)
            .input("vencimento", sql.NVarChar(10), b.vencimento)
            .input("status", sql.NVarChar(20), b.status ?? "PENDENTE")
            .input("nossoNumero", sql.NVarChar(80), b.nossoNumero ?? null)
            .input("linhaDigitavel", sql.NVarChar(160), b.linhaDigitavel ?? null)
            .input("codigoBarras", sql.NVarChar(120), b.codigoBarras ?? null)
            .input("urlPdf", sql.NVarChar(1000), b.urlPdf ?? null)
            .input("externalId", sql.NVarChar(160), b.externalId ?? null)
            .input("mensagemErro", sql.NVarChar(1000), b.mensagemErro ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00011 AS t
              USING (SELECT @guidBoleto AS g) AS s ON t.GUIDBOLETO = @guidBoleto
              WHEN MATCHED THEN UPDATE SET
                GUIDLANCAMENTO=@guidLancamento, BANCO=@banco, VALOR=@valor,
                VENCIMENTO=CONVERT(DATE,@vencimento), STATUS=@status,
                NOSSONUMERO=@nossoNumero, LINHADIGITAVEL=@linhaDigitavel,
                CODIGOBARRAS=@codigoBarras, URLPDF=@urlPdf, EXTERNALID=@externalId,
                MENSAGEMERRO=@mensagemErro, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDBOLETO,GUIDLANCAMENTO,GUIDENTIDADE,BANCO,VALOR,VENCIMENTO,STATUS,
                 NOSSONUMERO,LINHADIGITAVEL,CODIGOBARRAS,URLPDF,EXTERNALID,MENSAGEMERRO)
              VALUES
                (@guidBoleto,@guidLancamento,@guidentidade,@banco,@valor,CONVERT(DATE,@vencimento),@status,
                 @nossoNumero,@linhaDigitavel,@codigoBarras,@urlPdf,@externalId,@mensagemErro)
            `);
          resultado.contasReceberBoletos.inseridos++;
        } catch (e: any) {
          resultado.contasReceberBoletos.erros.push(`${b.guidLancamento}: ${e.message}`);
        }
      }

      for (const ev of input.contasReceberBoletoEventos ?? []) {
        try {
          const guid = ev.guidEvento ?? crypto.randomUUID();
          await pool.request()
            .input("guidEvento", sql.UniqueIdentifier, guid)
            .input("guidBoleto", sql.UniqueIdentifier, ev.guidBoleto)
            .input("tipoEvento", sql.NVarChar(40), ev.tipoEvento)
            .input("descricao", sql.NVarChar(500), ev.descricao ?? null)
            .input("requestJson", sql.NVarChar(sql.MAX), ev.requestJson ?? null)
            .input("responseJson", sql.NVarChar(sql.MAX), ev.responseJson ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00012 AS t
              USING (SELECT @guidEvento AS g) AS s ON t.GUIDEVENTO = @guidEvento
              WHEN MATCHED THEN UPDATE SET
                GUIDBOLETO=@guidBoleto, TIPOEVENTO=@tipoEvento, DESCRICAO=@descricao,
                REQUESTJSON=@requestJson, RESPONSEJSON=@responseJson, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDEVENTO,GUIDBOLETO,GUIDENTIDADE,TIPOEVENTO,DESCRICAO,REQUESTJSON,RESPONSEJSON)
              VALUES
                (@guidEvento,@guidBoleto,@guidentidade,@tipoEvento,@descricao,@requestJson,@responseJson)
            `);
          resultado.contasReceberBoletoEventos.inseridos++;
        } catch (e: any) {
          resultado.contasReceberBoletoEventos.erros.push(`${ev.guidBoleto}: ${e.message}`);
        }
      }

      // ── Contas a Receber ──
      for (const cr of input.contasReceber ?? []) {
        try {
          const guid = cr.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",          sql.UniqueIdentifier, guid)
            .input("descricao",     sql.NVarChar(200),    cr.descricao)
            .input("guidDevedor",   sql.UniqueIdentifier, cr.guidDevedor ?? null)
            .input("nomeDevedor",   sql.NVarChar(150),    cr.nomeDevedor)
            .input("valor",         sql.Decimal(15,2),    cr.valor)
            .input("valorRecebido", sql.Decimal(15,2),    cr.valorRecebido ?? 0)
            .input("dtLancamento",  sql.NVarChar(10),     cr.dtLancamento)
            .input("dtVencimento",  sql.NVarChar(10),     cr.dtVencimento)
            .input("dtRecebimento", sql.NVarChar(10),     cr.dtRecebimento ?? null)
            .input("status",        sql.NVarChar(10),     cr.status ?? "ABERTO")
            .input("numerodoc",     sql.NVarChar(30),     cr.numerodoc ?? null)
            .input("observacao",    sql.NVarChar(500),    cr.observacao ?? null)
            .input("guidentidade",  sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00005 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                DESCRICAO=@descricao, NOMEDEVEDOR=@nomeDevedor, VALOR=@valor,
                VALORRECEBIDO=@valorRecebido, DTVENCIMENTO=CONVERT(DATE,@dtVencimento),
                DTRECEBIMENTO=CASE WHEN @dtRecebimento IS NULL THEN NULL ELSE CONVERT(DATE,@dtRecebimento) END,
                STATUS=@status, NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DESCRICAO,GUIDDEVEDOR,NOMEDEVEDOR,VALOR,VALORRECEBIDO,
                 DTLANCAMENTO,DTVENCIMENTO,STATUS,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,@descricao,@guidDevedor,@nomeDevedor,@valor,@valorRecebido,
                 CONVERT(DATE,@dtLancamento),CONVERT(DATE,@dtVencimento),@status,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.contasReceber.inseridos++;
        } catch (e: any) {
          resultado.contasReceber.erros.push(`${cr.descricao}: ${e.message}`);
        }
      }

      // ── Contas a Pagar ──
      for (const cp of input.contasPagar ?? []) {
        try {
          const guid = cp.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("descricao",    sql.NVarChar(200),    cp.descricao)
            .input("guidCredor",   sql.UniqueIdentifier, cp.guidCredor ?? null)
            .input("nomeCredor",   sql.NVarChar(150),    cp.nomeCredor)
            .input("valor",        sql.Decimal(15,2),    cp.valor)
            .input("valorPago",    sql.Decimal(15,2),    cp.valorPago ?? 0)
            .input("dtLancamento", sql.NVarChar(10),     cp.dtLancamento)
            .input("dtVencimento", sql.NVarChar(10),     cp.dtVencimento)
            .input("dtPagamento",  sql.NVarChar(10),     cp.dtPagamento ?? null)
            .input("status",       sql.NVarChar(10),     cp.status ?? "ABERTO")
            .input("numerodoc",    sql.NVarChar(30),     cp.numerodoc ?? null)
            .input("observacao",   sql.NVarChar(500),    cp.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00004 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                DESCRICAO=@descricao, NOMECREDOR=@nomeCredor, VALOR=@valor,
                VALORPAGO=@valorPago, DTVENCIMENTO=CONVERT(DATE,@dtVencimento),
                DTPAGAMENTO=CASE WHEN @dtPagamento IS NULL THEN NULL ELSE CONVERT(DATE,@dtPagamento) END,
                STATUS=@status, NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DESCRICAO,GUIDCREDOR,NOMECREDOR,VALOR,VALORPAGO,
                 DTLANCAMENTO,DTVENCIMENTO,STATUS,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,@descricao,@guidCredor,@nomeCredor,@valor,@valorPago,
                 CONVERT(DATE,@dtLancamento),CONVERT(DATE,@dtVencimento),@status,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.contasPagar.inseridos++;
        } catch (e: any) {
          resultado.contasPagar.erros.push(`${cp.descricao}: ${e.message}`);
        }
      }

      // ── Lançamentos de Caixa ──
      for (const lc of input.lancamentosCaixa ?? []) {
        try {
          const guid = lc.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("dtLancamento", sql.NVarChar(10),     lc.dtLancamento)
            .input("tipo",         sql.Char(1),          lc.tipo)
            .input("valor",        sql.Decimal(15,2),    lc.valor)
            .input("descricao",    sql.NVarChar(200),    lc.descricao)
            .input("numerodoc",    sql.NVarChar(30),     lc.numerodoc ?? null)
            .input("observacao",   sql.NVarChar(500),    lc.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00010 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                TIPO=@tipo, VALOR=@valor, DESCRICAO=@descricao,
                NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,CONVERT(DATE,@dtLancamento),@tipo,@valor,@descricao,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.lancamentosCaixa.inseridos++;
        } catch (e: any) {
          resultado.lancamentosCaixa.erros.push(`${lc.descricao}: ${e.message}`);
        }
      }

      // Conciliacao de cartoes/PIX - cabecalho
      for (const p of input.conciliacaoPagamentos ?? []) {
        try {
          const guid = p.guidPagamentoCartaoPix ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidVenda", sql.UniqueIdentifier, p.guidVenda ?? null)
            .input("guidLancamento", sql.UniqueIdentifier, p.guidLancamento ?? null)
            .input("guidPagamentoForma", sql.UniqueIdentifier, p.guidPagamentoForma ?? null)
            .input("codFilial", sql.Int, p.codFilial ?? null)
            .input("formaPagamento", sql.NVarChar(100), p.formaPagamento ?? null)
            .input("cliente", sql.NVarChar(150), p.cliente ?? null)
            .input("numeroVenda", sql.NVarChar(60), p.numeroVenda ?? null)
            .input("bandeira", sql.NVarChar(60), p.bandeira ?? null)
            .input("tipo", sql.NVarChar(20), p.tipo)
            .input("adquirente", sql.NVarChar(80), p.adquirente ?? null)
            .input("nsu", sql.NVarChar(80), p.nsu ?? null)
            .input("autorizacao", sql.NVarChar(80), p.autorizacao ?? null)
            .input("tid", sql.NVarChar(120), p.tid ?? null)
            .input("txid", sql.NVarChar(120), p.txid ?? null)
            .input("e2eId", sql.NVarChar(120), p.e2eId ?? null)
            .input("valorBruto", sql.Decimal(15,2), p.valorBruto)
            .input("parcelas", sql.Int, p.parcelas)
            .input("dataVenda", sql.NVarChar(30), p.dataVenda)
            .input("previsaoRecebimento", sql.NVarChar(10), p.previsaoRecebimento)
            .input("status", sql.NVarChar(20), p.status ?? "PENDENTE")
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00013 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDPAGAMENTO=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDVENDA=@guidVenda, GUIDLANCAMENTO=@guidLancamento, GUIDPAGAMENTOFORMA=@guidPagamentoForma,
                CODFILIAL=@codFilial,
                FORMAPAGAMENTO=@formaPagamento, CLIENTE=@cliente, NUMEROVENDA=@numeroVenda, BANDEIRA=@bandeira,
                TIPO=@tipo, ADQUIRENTE=@adquirente, NSU=@nsu, AUTORIZACAO=@autorizacao, TID=@tid,
                TXID=@txid, E2EID=@e2eId, VALORBRUTO=@valorBruto, PARCELAS=@parcelas,
                DATAVENDA=CONVERT(DATETIME,@dataVenda), PREVISAORECEBIMENTO=CONVERT(DATE,@previsaoRecebimento),
                STATUS=@status, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDPAGAMENTO,GUIDENTIDADE,GUIDVENDA,GUIDLANCAMENTO,GUIDPAGAMENTOFORMA,CODFILIAL,FORMAPAGAMENTO,CLIENTE,NUMEROVENDA,
                 BANDEIRA,TIPO,ADQUIRENTE,NSU,AUTORIZACAO,TID,TXID,E2EID,VALORBRUTO,PARCELAS,DATAVENDA,PREVISAORECEBIMENTO,STATUS)
              VALUES
                (@guid,@guidentidade,@guidVenda,@guidLancamento,@guidPagamentoForma,@codFilial,@formaPagamento,@cliente,@numeroVenda,
                 @bandeira,@tipo,@adquirente,@nsu,@autorizacao,@tid,@txid,@e2eId,@valorBruto,@parcelas,CONVERT(DATETIME,@dataVenda),CONVERT(DATE,@previsaoRecebimento),@status)
            `);
          resultado.conciliacaoPagamentos.inseridos++;
        } catch (e: any) {
          resultado.conciliacaoPagamentos.erros.push(`${p.numeroVenda ?? p.tipo}: ${e.message}`);
        }
      }

      // Conciliacao de cartoes/PIX - parcelas
      for (const pa of input.conciliacaoParcelas ?? []) {
        try {
          const guid = pa.guidParcela ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidPagamento", sql.UniqueIdentifier, pa.guidPagamentoCartaoPix)
            .input("numeroParcela", sql.Int, pa.numeroParcela)
            .input("valorBruto", sql.Decimal(15,2), pa.valorBruto)
            .input("taxa", sql.Decimal(15,2), pa.taxa ?? 0)
            .input("valorLiquidoPrevisto", sql.Decimal(15,2), pa.valorLiquidoPrevisto)
            .input("valorRecebido", sql.Decimal(15,2), pa.valorRecebido ?? null)
            .input("diferenca", sql.Decimal(15,2), pa.diferenca ?? null)
            .input("dtPrevista", sql.NVarChar(10), pa.dtPrevista)
            .input("dtRecebimento", sql.NVarChar(10), pa.dtRecebimento ?? null)
            .input("guidContaBancaria", sql.UniqueIdentifier, pa.guidContaBancaria ?? null)
            .input("status", sql.NVarChar(20), pa.status ?? "PENDENTE")
            .input("motivoDivergencia", sql.NVarChar(40), pa.motivoDivergencia ?? null)
            .input("observacao", sql.NVarChar(500), pa.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00014 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDPARCELA=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDPAGAMENTO=@guidPagamento, NUMEROPARCELA=@numeroParcela, VALORBRUTO=@valorBruto,
                TAXA=@taxa, VALORLIQUIDOPREVISTO=@valorLiquidoPrevisto, VALORRECEBIDO=@valorRecebido,
                DIFERENCA=@diferenca, DTPREVISTA=CONVERT(DATE,@dtPrevista),
                DTRECEBIMENTO=CASE WHEN @dtRecebimento IS NULL THEN NULL ELSE CONVERT(DATE,@dtRecebimento) END,
                GUIDCONTABANCARIA=@guidContaBancaria, STATUS=@status, MOTIVODIVERGENCIA=@motivoDivergencia,
                OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDPARCELA,GUIDPAGAMENTO,GUIDENTIDADE,NUMEROPARCELA,VALORBRUTO,TAXA,VALORLIQUIDOPREVISTO,
                 VALORRECEBIDO,DIFERENCA,DTPREVISTA,DTRECEBIMENTO,GUIDCONTABANCARIA,STATUS,MOTIVODIVERGENCIA,OBSERVACAO)
              VALUES
                (@guid,@guidPagamento,@guidentidade,@numeroParcela,@valorBruto,@taxa,@valorLiquidoPrevisto,
                 @valorRecebido,@diferenca,CONVERT(DATE,@dtPrevista),CASE WHEN @dtRecebimento IS NULL THEN NULL ELSE CONVERT(DATE,@dtRecebimento) END,
                 @guidContaBancaria,@status,@motivoDivergencia,@observacao)
            `);
          resultado.conciliacaoParcelas.inseridos++;
        } catch (e: any) {
          resultado.conciliacaoParcelas.erros.push(`${pa.guidPagamentoCartaoPix}: ${e.message}`);
        }
      }

      for (const ev of input.conciliacaoEventos ?? []) {
        try {
          const guid = ev.guidEvento ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidPagamento", sql.UniqueIdentifier, ev.guidPagamentoCartaoPix)
            .input("guidParcela", sql.UniqueIdentifier, ev.guidParcela ?? null)
            .input("tipoEvento", sql.NVarChar(40), ev.tipoEvento)
            .input("statusAnterior", sql.NVarChar(20), ev.statusAnterior ?? null)
            .input("statusNovo", sql.NVarChar(20), ev.statusNovo ?? null)
            .input("descricao", sql.NVarChar(500), ev.descricao ?? null)
            .input("observacao", sql.NVarChar(500), ev.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00015 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDEVENTO=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDPAGAMENTO=@guidPagamento, GUIDPARCELA=@guidParcela, TIPOEVENTO=@tipoEvento,
                STATUSANTERIOR=@statusAnterior, STATUSNOVO=@statusNovo, DESCRICAO=@descricao,
                OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDEVENTO,GUIDPAGAMENTO,GUIDPARCELA,GUIDENTIDADE,TIPOEVENTO,STATUSANTERIOR,STATUSNOVO,DESCRICAO,OBSERVACAO)
              VALUES
                (@guid,@guidPagamento,@guidParcela,@guidentidade,@tipoEvento,@statusAnterior,@statusNovo,@descricao,@observacao)
            `);
          resultado.conciliacaoEventos.inseridos++;
        } catch (e: any) {
          resultado.conciliacaoEventos.erros.push(`${ev.guidPagamentoCartaoPix}: ${e.message}`);
        }
      }

      for (const v of input.vendas ?? []) {
        try {
          const guid = v.guidVenda ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("numeroVenda", sql.NVarChar(60), v.numeroVenda)
            .input("codFilial", sql.Int, v.codFilial ?? null)
            .input("guidCliente", sql.UniqueIdentifier, v.guidCliente ?? null)
            .input("cliente", sql.NVarChar(150), v.cliente ?? null)
            .input("documento", sql.NVarChar(20), v.documento ?? null)
            .input("dataVenda", sql.NVarChar(30), v.dataVenda)
            .input("status", sql.NVarChar(20), v.status ?? "FECHADA")
            .input("valorProdutos", sql.Decimal(15,2), v.valorProdutos)
            .input("valorDesconto", sql.Decimal(15,2), v.valorDesconto ?? 0)
            .input("valorAcrescimo", sql.Decimal(15,2), v.valorAcrescimo ?? 0)
            .input("valorTotal", sql.Decimal(15,2), v.valorTotal)
            .input("notaModelo", sql.NVarChar(5), v.notaModelo ?? null)
            .input("notaSerie", sql.NVarChar(10), v.notaSerie ?? null)
            .input("notaNumero", sql.NVarChar(20), v.notaNumero ?? null)
            .input("notaChave", sql.NVarChar(44), v.notaChave ?? null)
            .input("notaProtocolo", sql.NVarChar(60), v.notaProtocolo ?? null)
            .input("notaStatus", sql.NVarChar(30), v.notaStatus ?? null)
            .input("notaDataEmissao", sql.NVarChar(30), v.notaDataEmissao ?? null)
            .input("notaXml", sql.NVarChar(sql.MAX), v.notaXml ?? null)
            .input("notaDanfeUrl", sql.NVarChar(1000), v.notaDanfeUrl ?? null)
            .input("notaMensagemSefaz", sql.NVarChar(1000), v.notaMensagemSefaz ?? null)
            .input("observacao", sql.NVarChar(500), v.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00016 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDVENDA=@guid
              WHEN MATCHED THEN UPDATE SET
                NUMEROVENDA=@numeroVenda, CODFILIAL=@codFilial, GUIDCLIENTE=@guidCliente,
                CLIENTE=@cliente, DOCUMENTO=@documento, DATAVENDA=CONVERT(DATETIME,@dataVenda),
                STATUS=@status, VALORPRODUTOS=@valorProdutos, VALORDESCONTO=@valorDesconto,
                VALORACRESCIMO=@valorAcrescimo, VALORTOTAL=@valorTotal,
                NOTAMODELO=@notaModelo, NOTASERIE=@notaSerie, NOTANUMERO=@notaNumero,
                NOTACHAVE=@notaChave, NOTAPROTOCOLO=@notaProtocolo, NOTASTATUS=@notaStatus,
                NOTADATAEMISSAO=CASE WHEN @notaDataEmissao IS NULL THEN NULL ELSE CONVERT(DATETIME,@notaDataEmissao) END,
                NOTAXML=@notaXml, NOTADANFEURL=@notaDanfeUrl, NOTAMENSAGEMSEFAZ=@notaMensagemSefaz,
                OBSERVACAO=@observacao,
                ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDVENDA,GUIDENTIDADE,NUMEROVENDA,CODFILIAL,GUIDCLIENTE,CLIENTE,DOCUMENTO,DATAVENDA,STATUS,
                 VALORPRODUTOS,VALORDESCONTO,VALORACRESCIMO,VALORTOTAL,NOTAMODELO,NOTASERIE,NOTANUMERO,
                 NOTACHAVE,NOTAPROTOCOLO,NOTASTATUS,NOTADATAEMISSAO,NOTAXML,NOTADANFEURL,NOTAMENSAGEMSEFAZ,OBSERVACAO)
              VALUES
                (@guid,@guidentidade,@numeroVenda,@codFilial,@guidCliente,@cliente,@documento,CONVERT(DATETIME,@dataVenda),@status,
                 @valorProdutos,@valorDesconto,@valorAcrescimo,@valorTotal,@notaModelo,@notaSerie,@notaNumero,
                 @notaChave,@notaProtocolo,@notaStatus,CASE WHEN @notaDataEmissao IS NULL THEN NULL ELSE CONVERT(DATETIME,@notaDataEmissao) END,
                 @notaXml,@notaDanfeUrl,@notaMensagemSefaz,@observacao)
            `);
          resultado.vendas.inseridos++;
        } catch (e: any) {
          resultado.vendas.erros.push(`${v.numeroVenda}: ${e.message}`);
        }
      }

      for (const item of input.vendaItens ?? []) {
        try {
          const guid = item.guidItem ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidVenda", sql.UniqueIdentifier, item.guidVenda)
            .input("guidProduto", sql.UniqueIdentifier, item.guidProduto ?? null)
            .input("codProduto", sql.NVarChar(60), item.codProduto ?? null)
            .input("produto", sql.NVarChar(200), item.produto)
            .input("unidade", sql.NVarChar(6), item.unidade ?? null)
            .input("quantidade", sql.Decimal(15,4), item.quantidade)
            .input("valorUnitario", sql.Decimal(15,4), item.valorUnitario)
            .input("valorDesconto", sql.Decimal(15,2), item.valorDesconto ?? 0)
            .input("valorTotal", sql.Decimal(15,2), item.valorTotal)
            .input("cfop", sql.NVarChar(10), item.cfop ?? null)
            .input("cst", sql.NVarChar(10), item.cst ?? null)
            .input("csosn", sql.NVarChar(10), item.csosn ?? null)
            .input("ncm", sql.NVarChar(10), item.ncm ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00017 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDITEM=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDVENDA=@guidVenda, GUIDPRODUTO=@guidProduto, CODPRODUTO=@codProduto, PRODUTO=@produto,
                UNIDADE=@unidade, QUANTIDADE=@quantidade, VALORUNITARIO=@valorUnitario,
                VALORDESCONTO=@valorDesconto, VALORTOTAL=@valorTotal, CFOP=@cfop, CST=@cst,
                CSOSN=@csosn, NCM=@ncm, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDITEM,GUIDVENDA,GUIDENTIDADE,GUIDPRODUTO,CODPRODUTO,PRODUTO,UNIDADE,QUANTIDADE,
                 VALORUNITARIO,VALORDESCONTO,VALORTOTAL,CFOP,CST,CSOSN,NCM)
              VALUES
                (@guid,@guidVenda,@guidentidade,@guidProduto,@codProduto,@produto,@unidade,@quantidade,
                 @valorUnitario,@valorDesconto,@valorTotal,@cfop,@cst,@csosn,@ncm)
            `);
          resultado.vendaItens.inseridos++;
        } catch (e: any) {
          resultado.vendaItens.erros.push(`${item.produto}: ${e.message}`);
        }
      }

      for (const pag of input.vendaPagamentos ?? []) {
        try {
          const guid = pag.guidPagamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidVenda", sql.UniqueIdentifier, pag.guidVenda)
            .input("guidFormaPagamento", sql.UniqueIdentifier, pag.guidFormaPagamento ?? null)
            .input("formaPagamento", sql.NVarChar(100), pag.formaPagamento)
            .input("codigoSefaz", sql.NVarChar(2), pag.codigoSefaz ?? null)
            .input("valor", sql.Decimal(15,2), pag.valor)
            .input("parcelas", sql.Int, pag.parcelas ?? 1)
            .input("nsu", sql.NVarChar(80), pag.nsu ?? null)
            .input("autorizacao", sql.NVarChar(80), pag.autorizacao ?? null)
            .input("bandeira", sql.NVarChar(60), pag.bandeira ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00018 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDPAGAMENTO=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDVENDA=@guidVenda, GUIDFORMAPAGAMENTO=@guidFormaPagamento,
                FORMAPAGAMENTO=@formaPagamento, CODIGOSEFAZ=@codigoSefaz, VALOR=@valor,
                PARCELAS=@parcelas, NSU=@nsu, AUTORIZACAO=@autorizacao, BANDEIRA=@bandeira,
                ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDPAGAMENTO,GUIDVENDA,GUIDENTIDADE,GUIDFORMAPAGAMENTO,FORMAPAGAMENTO,CODIGOSEFAZ,
                 VALOR,PARCELAS,NSU,AUTORIZACAO,BANDEIRA)
              VALUES
                (@guid,@guidVenda,@guidentidade,@guidFormaPagamento,@formaPagamento,@codigoSefaz,
                 @valor,@parcelas,@nsu,@autorizacao,@bandeira)
            `);
          resultado.vendaPagamentos.inseridos++;
        } catch (e: any) {
          resultado.vendaPagamentos.erros.push(`${pag.formaPagamento}: ${e.message}`);
        }
      }

      for (const ev of input.notaFiscalEventos ?? []) {
        try {
          const guid = ev.guidEvento ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidVenda", sql.UniqueIdentifier, ev.guidVenda)
            .input("tipoEvento", sql.NVarChar(40), ev.tipoEvento)
            .input("sequencia", sql.Int, ev.sequencia ?? 1)
            .input("protocolo", sql.NVarChar(60), ev.protocolo ?? null)
            .input("justificativa", sql.NVarChar(500), ev.justificativa ?? null)
            .input("xml", sql.NVarChar(sql.MAX), ev.xml ?? null)
            .input("status", sql.NVarChar(30), ev.status ?? "REGISTRADO")
            .input("mensagemSefaz", sql.NVarChar(1000), ev.mensagemSefaz ?? null)
            .input("dataEvento", sql.NVarChar(30), ev.dataEvento ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00020 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDEVENTO=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDVENDA=@guidVenda, TIPOEVENTO=@tipoEvento, SEQUENCIA=@sequencia, PROTOCOLO=@protocolo,
                JUSTIFICATIVA=@justificativa, XML=@xml, STATUS=@status, MENSAGEMSEFAZ=@mensagemSefaz,
                DATAEVENTO=CASE WHEN @dataEvento IS NULL THEN NULL ELSE CONVERT(DATETIME,@dataEvento) END,
                ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDEVENTO,GUIDVENDA,GUIDENTIDADE,TIPOEVENTO,SEQUENCIA,PROTOCOLO,JUSTIFICATIVA,XML,STATUS,MENSAGEMSEFAZ,DATAEVENTO)
              VALUES
                (@guid,@guidVenda,@guidentidade,@tipoEvento,@sequencia,@protocolo,@justificativa,@xml,@status,@mensagemSefaz,
                 CASE WHEN @dataEvento IS NULL THEN NULL ELSE CONVERT(DATETIME,@dataEvento) END)
            `);
          resultado.notaFiscalEventos.inseridos++;
        } catch (e: any) {
          resultado.notaFiscalEventos.erros.push(`${ev.tipoEvento}: ${e.message}`);
        }
      }

      for (const f of input.fechamentosCaixa ?? []) {
        try {
          const guid = f.guidFechamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("dispositivo", sql.NVarChar(100), f.dispositivo)
            .input("operador", sql.NVarChar(100), f.operador ?? null)
            .input("dataAbertura", sql.NVarChar(30), f.dataAbertura ?? null)
            .input("dataFechamento", sql.NVarChar(30), f.dataFechamento)
            .input("status", sql.NVarChar(20), f.status ?? "FECHADO")
            .input("valorAbertura", sql.Decimal(15,2), f.valorAbertura ?? 0)
            .input("totalVendas", sql.Decimal(15,2), f.totalVendas ?? 0)
            .input("totalSuprimento", sql.Decimal(15,2), f.totalSuprimento ?? 0)
            .input("totalSangria", sql.Decimal(15,2), f.totalSangria ?? 0)
            .input("totalInformado", sql.Decimal(15,2), f.totalInformado ?? 0)
            .input("totalDiferenca", sql.Decimal(15,2), f.totalDiferenca ?? 0)
            .input("observacao", sql.NVarChar(500), f.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00021 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDFECHAMENTO=@guid
              WHEN MATCHED THEN UPDATE SET
                DISPOSITIVO=@dispositivo, OPERADOR=@operador,
                DATAABERTURA=CASE WHEN @dataAbertura IS NULL THEN NULL ELSE CONVERT(DATETIME,@dataAbertura) END,
                DATAFECHAMENTO=CONVERT(DATETIME,@dataFechamento), STATUS=@status, VALORABERTURA=@valorAbertura,
                TOTALVENDAS=@totalVendas, TOTALSUPRIMENTO=@totalSuprimento, TOTALSANGRIA=@totalSangria,
                TOTALINFORMADO=@totalInformado, TOTALDIFERENCA=@totalDiferenca, OBSERVACAO=@observacao,
                ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDFECHAMENTO,GUIDENTIDADE,DISPOSITIVO,OPERADOR,DATAABERTURA,DATAFECHAMENTO,STATUS,
                 VALORABERTURA,TOTALVENDAS,TOTALSUPRIMENTO,TOTALSANGRIA,TOTALINFORMADO,TOTALDIFERENCA,OBSERVACAO)
              VALUES
                (@guid,@guidentidade,@dispositivo,@operador,
                 CASE WHEN @dataAbertura IS NULL THEN NULL ELSE CONVERT(DATETIME,@dataAbertura) END,
                 CONVERT(DATETIME,@dataFechamento),@status,@valorAbertura,@totalVendas,@totalSuprimento,
                 @totalSangria,@totalInformado,@totalDiferenca,@observacao)
            `);
          resultado.fechamentosCaixa.inseridos++;
        } catch (e: any) {
          resultado.fechamentosCaixa.erros.push(`${f.dispositivo}: ${e.message}`);
        }
      }

      for (const c of input.fechamentosCaixaControle ?? []) {
        try {
          const guid = c.guidControle ?? crypto.randomUUID();
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guid)
            .input("guidFechamento", sql.UniqueIdentifier, c.guidFechamento)
            .input("guidFormaPagamento", sql.UniqueIdentifier, c.guidFormaPagamento ?? null)
            .input("formaPagamento", sql.NVarChar(100), c.formaPagamento)
            .input("codigoSefaz", sql.NVarChar(2), c.codigoSefaz ?? null)
            .input("valorSistema", sql.Decimal(15,2), c.valorSistema ?? 0)
            .input("valorInformado", sql.Decimal(15,2), c.valorInformado ?? 0)
            .input("diferenca", sql.Decimal(15,2), c.diferenca ?? 0)
            .input("quantidade", sql.Int, c.quantidade ?? 0)
            .input("observacao", sql.NVarChar(500), c.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00022 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDCONTROLE=@guid
              WHEN MATCHED THEN UPDATE SET
                GUIDFECHAMENTO=@guidFechamento, GUIDFORMAPAGAMENTO=@guidFormaPagamento,
                FORMAPAGAMENTO=@formaPagamento, CODIGOSEFAZ=@codigoSefaz,
                VALORSISTEMA=@valorSistema, VALORINFORMADO=@valorInformado,
                DIFERENCA=@diferenca, QUANTIDADE=@quantidade, OBSERVACAO=@observacao,
                ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDCONTROLE,GUIDFECHAMENTO,GUIDENTIDADE,GUIDFORMAPAGAMENTO,FORMAPAGAMENTO,CODIGOSEFAZ,
                 VALORSISTEMA,VALORINFORMADO,DIFERENCA,QUANTIDADE,OBSERVACAO)
              VALUES
                (@guid,@guidFechamento,@guidentidade,@guidFormaPagamento,@formaPagamento,@codigoSefaz,
                 @valorSistema,@valorInformado,@diferenca,@quantidade,@observacao)
            `);
          resultado.fechamentosCaixaControle.inseridos++;
        } catch (e: any) {
          resultado.fechamentosCaixaControle.erros.push(`${c.formaPagamento}: ${e.message}`);
        }
      }

      // Atualizar timestamp de push
      await pool.request()
        .input("guidentidade",  sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",   sql.NVarChar(100),    input.dispositivo)
        .input("versaoDelphi",  sql.NVarChar(20),     input.versaoDelphi ?? null)
        .query(`
          MERGE KS0002.KS00010 AS t
          USING (SELECT @guidentidade AS g, @dispositivo AS d) AS s
            ON t.GUIDENTIDADE = @guidentidade AND t.DISPOSITIVO = @dispositivo
          WHEN MATCHED THEN UPDATE SET LASTSYNC_PUSH=GETDATE(), LASTSYNC_AT=GETDATE(), VERSAO_DELPHI=@versaoDelphi
          WHEN NOT MATCHED THEN INSERT (GUIDENTIDADE,DISPOSITIVO,LASTSYNC_PUSH,LASTSYNC_AT,VERSAO_DELPHI)
            VALUES (@guidentidade,@dispositivo,GETDATE(),GETDATE(),@versaoDelphi)
        `);

      return { success: true, resultado, syncedAt: new Date().toISOString() };
    }),

  /**
   * GET /api/trpc/syncDelphi.pull
   * Retorna delta de alterações desde o último sync (ou desde dtDesde).
   * Delphi usa para atualizar sua base local.
   */
  pull: publicProcedure
    .input(z.object({
      dispositivo: z.string().default("default"),
      dtDesde:     z.string().optional(), // ISO datetime, ex: "2026-05-01T00:00:00"
      entidades:   z.array(z.enum(["pessoas","clientes","funcionarios","produtos","produtoUnidadePrecos","contasReceber","contasReceberBoletos","contasReceberBoletoEventos","contasPagar","lancamentosCaixa","conciliacaoPagamentos","conciliacaoParcelas","conciliacaoEventos","vendas","vendaItens","vendaPagamentos","notaFiscalEventos","fechamentosCaixa","fechamentosCaixaControle","planoContas","centroCusto","naturezaCaixa","formasPagamento"])).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      // Buscar último sync deste dispositivo
      const dispositivo = input?.dispositivo ?? "default";
      const syncR = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    dispositivo)
        .query(`SELECT LASTSYNC_PULL FROM KS0002.KS00010 WHERE GUIDENTIDADE=@guidentidade AND DISPOSITIVO=@dispositivo`);

      const lastPull = input?.dtDesde ?? syncR.recordset[0]?.LASTSYNC_PULL ?? "2000-01-01T00:00:00";
      const entidades = input?.entidades ?? ["pessoas","clientes","funcionarios","produtos","produtoUnidadePrecos","contasReceber","contasReceberBoletos","contasReceberBoletoEventos","contasPagar","lancamentosCaixa","formasPagamento","planoContas","centroCusto","naturezaCaixa","conciliacaoPagamentos","conciliacaoParcelas","conciliacaoEventos","vendas","vendaItens","vendaPagamentos","notaFiscalEventos","fechamentosCaixa","fechamentosCaixaControle"];

      const delta: Record<string, unknown[]> = {};

      if (entidades.includes("pessoas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDENTIDADE AS NVARCHAR(36)) AS guidPessoa,
              NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO AS tipodoc,
              TELEFONE, CELULAR, EMAIL, CEP, ENDERECO, NUMERO, BAIRRO,
              COMPLEMENTO, CIDADE, UF, CADCLIENTE, CADFORNECEDOR, SITUACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0002.KS00001
            WHERE CODENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.pessoas = r.recordset;
      }

      if (entidades.includes("clientes")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 1000
              CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidPessoa,
              CODIGO AS codigo, NOME AS nome, FANTASIA AS fantasia, DOCUMENTO AS documento,
              CODTIPODOCUMENTO AS codTipoDocumento, TELEFONE AS telefone, CELULAR AS celular,
              WHATSAPP AS whatsapp, EMAIL AS email, IE AS ie, INDIEDEST AS indIeDest,
              FORMAT(DATANASCIMENTO,'yyyy-MM-dd') AS dataNascimento,
              CEP AS cep, ENDERECO AS endereco, NUMERO AS numero, COMPLEMENTO AS complemento,
              BAIRRO AS bairro, CODCIDADE AS codCidade, LIMITECOMPRA AS limiteCompra,
              DIAVENCIMENTO AS diaVencimento, SITUACAO AS situacao,
              CADCLIENTE AS cadCliente, CADFORNECEDOR AS cadFornecedor, CADUSUARIO AS cadUsuario,
              MANTERPROMOCOES AS manterPromocoes, CONSTASPC AS constaSpc, OBSERVACAO AS observacao,
              FORMAT(DATACADASTRO,'yyyy-MM-ddTHH:mm:ss') AS dataCadastro,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0002.KS00001
            WHERE GUIDENTIDADE = @guidentidade
              AND CADCLIENTE = 1
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.clientes = r.recordset;
      }

      if (entidades.includes("funcionarios")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 1000
              CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidPessoa,
              CODIGO AS codigo, NOME AS nome, FANTASIA AS fantasia, DOCUMENTO AS documento,
              CODTIPODOCUMENTO AS codTipoDocumento, TELEFONE AS telefone, CELULAR AS celular,
              WHATSAPP AS whatsapp, EMAIL AS email, IE AS ie, INDIEDEST AS indIeDest,
              FORMAT(DATANASCIMENTO,'yyyy-MM-dd') AS dataNascimento,
              CEP AS cep, ENDERECO AS endereco, NUMERO AS numero, COMPLEMENTO AS complemento,
              BAIRRO AS bairro, CODCIDADE AS codCidade, SITUACAO AS situacao,
              USUARIO AS usuario, CODCARGO AS codCargo, OBSERVACAO AS observacao,
              CADCLIENTE AS cadCliente, CADFORNECEDOR AS cadFornecedor, CADUSUARIO AS cadUsuario,
              FORMAT(DATACADASTRO,'yyyy-MM-ddTHH:mm:ss') AS dataCadastro,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0002.KS00001
            WHERE GUIDENTIDADE = @guidentidade
              AND CADUSUARIO = 1
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.funcionarios = r.recordset;
      }

      if (entidades.includes("produtos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 1000
              CAST(p.GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
              p.CODPRODUTO AS codProduto, p.PRODUTO AS produto, p.DESCRICAO AS descricao,
              CAST(p.GUIDCATEGORIA AS NVARCHAR(36)) AS guidCategoria,
              c.CATEGORIA AS categoria, p.UNIDADE AS unidade, p.UNIDADEFISCAL AS unidadeFiscal,
              p.CODBARRAS AS codBarras, p.REFERENCIA AS referencia,
              p.NCM AS ncm, p.CEST AS cest, p.CFOP AS cfop, p.CSOSN AS csosn,
              p.ALIQICMS AS aliqIcms, p.ALIQPIS AS aliqPis, p.ALIQCOFINS AS aliqCofins,
              p.PRECO AS preco, p.PRECOVENDA AS precoVenda, p.PRECOMINIMO AS precoMinimo,
              p.ESTOQUE AS estoque, p.ESTOQUEMINIMO AS estoqueMinimo,
              p.TAMANHO1 AS tamanho1, p.TAMANHO2 AS tamanho2, p.TAMANHO3 AS tamanho3,
              p.TAMANHO4 AS tamanho4, p.TAMANHO5 AS tamanho5, p.TAMANHO6 AS tamanho6,
              p.TAMANHO7 AS tamanho7, p.FRACIONADO AS fracionado, p.SITUACAO AS situacao,
              FORMAT(p.DATACADASTRO,'yyyy-MM-ddTHH:mm:ss') AS dataCadastro,
              FORMAT(p.ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0004.KS00001 p
            LEFT JOIN KS0004.KS00002 c ON c.GUIDCATEGORIA = p.GUIDCATEGORIA
            WHERE p.GUIDENTIDADE = @guidentidade
              AND p.ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY p.ULTIMAALTERACAO DESC
          `);
        delta.produtos = r.recordset;
      }

      if (entidades.includes("produtoUnidadePrecos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 1000
              ID AS id,
              CAST(GUIDPRECO AS NVARCHAR(36)) AS guidPreco,
              CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
              CODPRODUTO AS codProduto,
              UNIDADE AS unidade,
              FATORCONVERSAO AS fatorConversao,
              QUANTIDADEMINIMA AS quantidadeMinima,
              DESCRICAOPRECO AS descricaoPreco,
              PRECOVENDA AS precoVenda,
              ATIVO AS ativo,
              FORMAT(DATACADASTRO,'yyyy-MM-ddTHH:mm:ss') AS dataCadastro,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0004.ProdutoUnidadePreco
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.produtoUnidadePrecos = r.recordset;
      }

      if (entidades.includes("contasReceber")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              DESCRICAO, CAST(GUIDDEVEDOR AS NVARCHAR(36)) AS guidDevedor, NOMEDEVEDOR,
              VALOR, VALORRECEBIDO, FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              FORMAT(DTVENCIMENTO,'yyyy-MM-dd') AS dtVencimento,
              FORMAT(DTRECEBIMENTO,'yyyy-MM-dd') AS dtRecebimento,
              STATUS, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00005
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasReceber = r.recordset;
      }

      if (entidades.includes("contasReceberBoletos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDBOLETO AS NVARCHAR(36)) AS guidBoleto,
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              BANCO AS banco, VALOR AS valor, FORMAT(VENCIMENTO,'yyyy-MM-dd') AS vencimento,
              STATUS AS status, NOSSONUMERO AS nossoNumero, LINHADIGITAVEL AS linhaDigitavel,
              CODIGOBARRAS AS codigoBarras, URLPDF AS urlPdf, EXTERNALID AS externalId,
              MENSAGEMERRO AS mensagemErro,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00011
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasReceberBoletos = r.recordset;
      }

      if (entidades.includes("contasReceberBoletoEventos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDEVENTO AS NVARCHAR(36)) AS guidEvento,
              CAST(GUIDBOLETO AS NVARCHAR(36)) AS guidBoleto,
              TIPOEVENTO AS tipoEvento, DESCRICAO AS descricao,
              REQUESTJSON AS requestJson, RESPONSEJSON AS responseJson,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00012
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasReceberBoletoEventos = r.recordset;
      }

      if (entidades.includes("contasPagar")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              DESCRICAO, CAST(GUIDCREDOR AS NVARCHAR(36)) AS guidCredor, NOMECREDOR,
              VALOR, VALORPAGO, FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              FORMAT(DTVENCIMENTO,'yyyy-MM-dd') AS dtVencimento,
              FORMAT(DTPAGAMENTO,'yyyy-MM-dd') AS dtPagamento,
              STATUS, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00004
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasPagar = r.recordset;
      }

      if (entidades.includes("lancamentosCaixa")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              TIPO, VALOR, DESCRICAO, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00010
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.lancamentosCaixa = r.recordset;
      }

      if (entidades.includes("conciliacaoPagamentos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamentoCartaoPix,
              CAST(GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              CAST(GUIDPAGAMENTOFORMA AS NVARCHAR(36)) AS guidPagamentoForma,
              CODFILIAL AS codFilial,
              FORMAPAGAMENTO AS formaPagamento, CLIENTE AS cliente, NUMEROVENDA AS numeroVenda,
              BANDEIRA AS bandeira, TIPO AS tipo, ADQUIRENTE AS adquirente, NSU AS nsu,
              AUTORIZACAO AS autorizacao, TID AS tid, TXID AS txid, E2EID AS e2eId,
              VALORBRUTO AS valorBruto, PARCELAS AS parcelas,
              FORMAT(DATAVENDA,'yyyy-MM-ddTHH:mm:ss') AS dataVenda,
              FORMAT(PREVISAORECEBIMENTO,'yyyy-MM-dd') AS previsaoRecebimento,
              STATUS AS status, FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00013
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.conciliacaoPagamentos = r.recordset;
      }

      if (entidades.includes("conciliacaoParcelas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDPARCELA AS NVARCHAR(36)) AS guidParcela,
              CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamentoCartaoPix,
              NUMEROPARCELA AS numeroParcela, VALORBRUTO AS valorBruto, TAXA AS taxa,
              VALORLIQUIDOPREVISTO AS valorLiquidoPrevisto, VALORRECEBIDO AS valorRecebido,
              DIFERENCA AS diferenca, FORMAT(DTPREVISTA,'yyyy-MM-dd') AS dtPrevista,
              FORMAT(DTRECEBIMENTO,'yyyy-MM-dd') AS dtRecebimento,
              CAST(GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria,
              STATUS AS status, MOTIVODIVERGENCIA AS motivoDivergencia, OBSERVACAO AS observacao,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00014
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.conciliacaoParcelas = r.recordset;
      }

      if (entidades.includes("conciliacaoEventos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDEVENTO AS NVARCHAR(36)) AS guidEvento,
              CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamentoCartaoPix,
              CAST(GUIDPARCELA AS NVARCHAR(36)) AS guidParcela,
              TIPOEVENTO AS tipoEvento, STATUSANTERIOR AS statusAnterior, STATUSNOVO AS statusNovo,
              DESCRICAO AS descricao, OBSERVACAO AS observacao,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00015
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.conciliacaoEventos = r.recordset;
      }

      if (entidades.includes("vendas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDVENDA AS NVARCHAR(36)) AS guidVenda, NUMEROVENDA AS numeroVenda,
              CODFILIAL AS codFilial, CAST(GUIDCLIENTE AS NVARCHAR(36)) AS guidCliente,
              CLIENTE AS cliente, DOCUMENTO AS documento,
              FORMAT(DATAVENDA,'yyyy-MM-ddTHH:mm:ss') AS dataVenda,
              STATUS AS status, VALORPRODUTOS AS valorProdutos, VALORDESCONTO AS valorDesconto,
              VALORACRESCIMO AS valorAcrescimo, VALORTOTAL AS valorTotal,
              NOTAMODELO AS notaModelo, NOTASERIE AS notaSerie, NOTANUMERO AS notaNumero,
              NOTACHAVE AS notaChave, NOTAPROTOCOLO AS notaProtocolo, NOTASTATUS AS notaStatus,
              FORMAT(NOTADATAEMISSAO,'yyyy-MM-ddTHH:mm:ss') AS notaDataEmissao,
              NOTAXML AS notaXml, NOTADANFEURL AS notaDanfeUrl, NOTAMENSAGEMSEFAZ AS notaMensagemSefaz,
              OBSERVACAO AS observacao,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00016
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.vendas = r.recordset;
      }

      if (entidades.includes("vendaItens")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 1000
              CAST(GUIDITEM AS NVARCHAR(36)) AS guidItem,
              CAST(GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
              CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
              CODPRODUTO AS codProduto, PRODUTO AS produto, UNIDADE AS unidade,
              QUANTIDADE AS quantidade, VALORUNITARIO AS valorUnitario,
              VALORDESCONTO AS valorDesconto, VALORTOTAL AS valorTotal,
              CFOP AS cfop, CST AS cst, CSOSN AS csosn, NCM AS ncm,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00017
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.vendaItens = r.recordset;
      }

      if (entidades.includes("vendaPagamentos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 1000
              CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
              CAST(GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
              CAST(GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
              FORMAPAGAMENTO AS formaPagamento, CODIGOSEFAZ AS codigoSefaz,
              VALOR AS valor, PARCELAS AS parcelas, NSU AS nsu,
              AUTORIZACAO AS autorizacao, BANDEIRA AS bandeira,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00018
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.vendaPagamentos = r.recordset;
      }

      if (entidades.includes("notaFiscalEventos")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDEVENTO AS NVARCHAR(36)) AS guidEvento,
              CAST(GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
              TIPOEVENTO AS tipoEvento, SEQUENCIA AS sequencia, PROTOCOLO AS protocolo,
              JUSTIFICATIVA AS justificativa, XML AS xml, STATUS AS status,
              MENSAGEMSEFAZ AS mensagemSefaz,
              FORMAT(DATAEVENTO,'yyyy-MM-ddTHH:mm:ss') AS dataEvento,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00020
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.notaFiscalEventos = r.recordset;
      }

      if (entidades.includes("fechamentosCaixa")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDFECHAMENTO AS NVARCHAR(36)) AS guidFechamento,
              DISPOSITIVO AS dispositivo, OPERADOR AS operador,
              FORMAT(DATAABERTURA,'yyyy-MM-ddTHH:mm:ss') AS dataAbertura,
              FORMAT(DATAFECHAMENTO,'yyyy-MM-ddTHH:mm:ss') AS dataFechamento,
              STATUS AS status, VALORABERTURA AS valorAbertura, TOTALVENDAS AS totalVendas,
              TOTALSUPRIMENTO AS totalSuprimento, TOTALSANGRIA AS totalSangria,
              TOTALINFORMADO AS totalInformado, TOTALDIFERENCA AS totalDiferenca,
              OBSERVACAO AS observacao,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00021
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.fechamentosCaixa = r.recordset;
      }

      if (entidades.includes("fechamentosCaixaControle")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde", sql.NVarChar(30), lastPull)
          .query(`
            SELECT TOP 1000
              CAST(GUIDCONTROLE AS NVARCHAR(36)) AS guidControle,
              CAST(GUIDFECHAMENTO AS NVARCHAR(36)) AS guidFechamento,
              CAST(GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
              FORMAPAGAMENTO AS formaPagamento, CODIGOSEFAZ AS codigoSefaz,
              VALORSISTEMA AS valorSistema, VALORINFORMADO AS valorInformado,
              DIFERENCA AS diferenca, QUANTIDADE AS quantidade, OBSERVACAO AS observacao,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00022
            WHERE GUIDENTIDADE=@guidentidade AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.fechamentosCaixaControle = r.recordset;
      }

      if (entidades.includes("planoContas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CODCONTA, CONTA, DESCRICAO,
              TIPO, NIVEL, CAST(GUIDCONTAPAI AS NVARCHAR(36)) AS guidContaPai, MASCARA, SITUACAO
            FROM KS0003.KS00001 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODCONTA
          `);
        delta.planoContas = r.recordset;
      }

      if (entidades.includes("centroCusto")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CODCENTRO, CENTRO, DESCRICAO,
              NIVEL, CAST(GUIDCENTROPAI AS NVARCHAR(36)) AS guidCentroPai, ORCAMENTO, SITUACAO
            FROM KS0003.KS00002 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODCENTRO
          `);
        delta.centroCusto = r.recordset;
      }

      if (entidades.includes("naturezaCaixa")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA, DESCRICAO, TIPO, SITUACAO
            FROM KS0003.KS00003 WHERE GUIDENTIDADE=@guidentidade ORDER BY NATUREZA
          `);
        delta.naturezaCaixa = r.recordset;
      }

      if (entidades.includes("formasPagamento")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento, PAGAMENTO, CODIGOSEFAZ,
              INTEGRATEF, SITUACAO,
              CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta,
              CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
              CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro,
              CAST(GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria
            FROM KS0003.KS00006 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODIGOSEFAZ
          `);
        delta.formasPagamento = r.recordset;
      }

      // Atualizar timestamp de pull
      await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    dispositivo)
        .query(`
          MERGE KS0002.KS00010 AS t
          USING (SELECT @guidentidade AS g, @dispositivo AS d) AS s
            ON t.GUIDENTIDADE = @guidentidade AND t.DISPOSITIVO = @dispositivo
          WHEN MATCHED THEN UPDATE SET LASTSYNC_PULL=GETDATE(), LASTSYNC_AT=GETDATE()
          WHEN NOT MATCHED THEN INSERT (GUIDENTIDADE,DISPOSITIVO,LASTSYNC_PULL,LASTSYNC_AT)
            VALUES (@guidentidade,@dispositivo,GETDATE(),GETDATE())
        `);

      const totais: Record<string, number> = {};
      for (const [k, v] of Object.entries(delta)) totais[k] = (v as unknown[]).length;

      return {
        success: true,
        syncedAt: new Date().toISOString(),
        dtDesde: lastPull,
        totais,
        delta,
      };
    }),

  /**
   * POST /api/trpc/syncDelphi.ack
   * Delphi confirma que processou o pull anterior.
   * Atualiza o lastSyncAt sem alterar lastSyncPull.
   */
  ack: publicProcedure
    .input(z.object({
      dispositivo: z.string().default("default"),
      syncedAt:    z.string(), // ISO datetime retornado pelo pull
    }))
    .mutation(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    input.dispositivo)
        .query(`
          UPDATE KS0002.KS00010
          SET LASTSYNC_AT = GETDATE()
          WHERE GUIDENTIDADE = @guidentidade AND DISPOSITIVO = @dispositivo
        `);

      return { success: true, ackedAt: new Date().toISOString() };
    }),
});

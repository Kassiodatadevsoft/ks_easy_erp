/**
 * Cria/recria todas as tabelas do módulo financeiro com GUID como PK.
 * Estratégia offline-first: GUIDs gerados no cliente (PDV Delphi) evitam
 * conflitos de ID ao sincronizar múltiplos PDVs com o servidor.
 */
import { getSqlPool } from "./server/sqlserver.js";
import sql from "mssql";

async function run() {
  const pool = await getSqlPool();

  // ── Schema KS0003 ────────────────────────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'KS0003')
      EXEC('CREATE SCHEMA KS0003')
  `);
  console.log("✅ Schema KS0003 OK");

  // ── KS0003.KS00001 — Plano de Contas ────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00001')
    CREATE TABLE KS0003.KS00001 (
      GUIDCONTA       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      CODCONTA        NVARCHAR(20)     NOT NULL,
      CONTA           NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      TIPO            CHAR(1)          NOT NULL CHECK (TIPO IN ('R','D','T')),  -- R=Receita D=Despesa T=Transferência
      NIVEL           TINYINT          NOT NULL DEFAULT 1,
      GUIDCONTAPAI    UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00001(GUIDCONTA),
      MASCARA         NVARCHAR(30)     NULL,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00001 (Plano de Contas) OK");

  // ── KS0003.KS00002 — Centro de Custo ────────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00002')
    CREATE TABLE KS0003.KS00002 (
      GUIDCENTRO      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      CODCENTRO       NVARCHAR(20)     NOT NULL,
      CENTRO          NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      NIVEL           TINYINT          NOT NULL DEFAULT 1,
      GUIDCENTROPAI   UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00002(GUIDCENTRO),
      ORCAMENTO       DECIMAL(15,2)    NULL DEFAULT 0,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00002 (Centro de Custo) OK");

  // ── KS0003.KS00003 — Natureza de Caixa ──────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00003')
    CREATE TABLE KS0003.KS00003 (
      GUIDNATUREZA    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      NATUREZA        NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      TIPO            CHAR(1)          NOT NULL CHECK (TIPO IN ('R','D')),  -- R=Receita D=Despesa
      GUIDCONTA       UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00001(GUIDCONTA),
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00003 (Natureza de Caixa) OK");

  // ── KS0003.KS00004 — Contas a Pagar (Saídas) ────────────────────────────────
  // PK = GUID gerado pelo PDV offline → sem conflito na sincronização
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00004')
    CREATE TABLE KS0003.KS00004 (
      GUIDLANCAMENTO  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      GUIDCREDOR      UNIQUEIDENTIFIER NULL,   -- FK para KS0002.KS00001 (entidade)
      NOMECREDOR      NVARCHAR(100)    NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORPAGO       DECIMAL(15,2)    NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE             NOT NULL,
      DTPAGAMENTO     DATE             NULL,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00003(GUIDNATUREZA),
      GUIDCONTA       UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00001(GUIDCONTA),
      GUIDCENTRO      UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00002(GUIDCENTRO),
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,   -- FK para KS0003.KS00006 (forma de pagamento)
      NUMERODOC       NVARCHAR(50)     NULL,
      PARCELA         SMALLINT         NOT NULL DEFAULT 1,
      TOTALPARCELAS   SMALLINT         NOT NULL DEFAULT 1,
      STATUS          NVARCHAR(10)     NOT NULL DEFAULT 'ABERTO'
                        CHECK (STATUS IN ('ABERTO','PAGO','PARCIAL','CANCELADO','VENCIDO')),
      OBSERVACAO      NVARCHAR(500)    NULL,
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',  -- MANUAL, PDV, COMPRA, SYNC
      GUIDORIGEM      UNIQUEIDENTIFIER NULL,   -- GUID do lançamento de origem (venda, NF, etc.)
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00004 (Contas a Pagar) OK");

  // ── KS0003.KS00005 — Contas a Receber (Entradas) ────────────────────────────
  // PK = GUID gerado pelo PDV offline → sem conflito na sincronização
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00005')
    CREATE TABLE KS0003.KS00005 (
      GUIDLANCAMENTO  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      GUIDDEVEDOR     UNIQUEIDENTIFIER NULL,   -- FK para KS0002.KS00001 (entidade)
      NOMEDEVEDOR     NVARCHAR(100)    NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORRECEBIDO   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE             NOT NULL,
      DTRECEBIMENTO   DATE             NULL,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00003(GUIDNATUREZA),
      GUIDCONTA       UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00001(GUIDCONTA),
      GUIDCENTRO      UNIQUEIDENTIFIER NULL REFERENCES KS0003.KS00002(GUIDCENTRO),
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,   -- FK para KS0003.KS00006 (forma de pagamento)
      NUMERODOC       NVARCHAR(50)     NULL,
      PARCELA         SMALLINT         NOT NULL DEFAULT 1,
      TOTALPARCELAS   SMALLINT         NOT NULL DEFAULT 1,
      STATUS          NVARCHAR(10)     NOT NULL DEFAULT 'ABERTO'
                        CHECK (STATUS IN ('ABERTO','RECEBIDO','PARCIAL','CANCELADO','VENCIDO')),
      OBSERVACAO      NVARCHAR(500)    NULL,
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',  -- MANUAL, PDV, VENDA, SYNC
      GUIDORIGEM      UNIQUEIDENTIFIER NULL,   -- GUID da venda/NF de origem
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00005 (Contas a Receber) OK");

  // ── KS0003.KS00006 — Formas de Pagamento ────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00006')
    CREATE TABLE KS0003.KS00006 (
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      PAGAMENTO       NVARCHAR(60)     NOT NULL,
      CODFISCAL       CHAR(2)          NOT NULL,
      DESCRICAOFISCAL NVARCHAR(100)    NOT NULL,
      INTEGRACAOTEF   BIT              NOT NULL DEFAULT 0,
      BANDEIRA        NVARCHAR(40)     NULL,
      CNPJTEF         CHAR(14)         NULL,
      AUTORIZADORA    NVARCHAR(60)     NULL,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00006 (Formas de Pagamento) OK");

  // ── KS0003.KS00007 — Movimentações de Caixa (Fluxo) ─────────────────────────
  // Tabela de movimentações efetivas (baixas de CP/CR + lançamentos diretos)
  // PK = GUID → gerado pelo PDV offline, sincronizado depois
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00007')
    CREATE TABLE KS0003.KS00007 (
      GUIDMOVIMENTO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DATA            DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      TIPO            CHAR(1)          NOT NULL CHECK (TIPO IN ('R','D')),  -- R=Receita D=Despesa
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL,
      GUIDCONTA       UNIQUEIDENTIFIER NULL,
      GUIDCENTRO      UNIQUEIDENTIFIER NULL,
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,
      GUIDLANCPAGAR   UNIQUEIDENTIFIER NULL,   -- ref KS0003.KS00004 (se veio de CP)
      GUIDLANCRECEBER UNIQUEIDENTIFIER NULL,   -- ref KS0003.KS00005 (se veio de CR)
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00007 (Movimentações de Caixa) OK");

  // ── Popular Formas de Pagamento com os 14 códigos SEFAZ ─────────────────────
  const check = await pool.request().query(`
    SELECT COUNT(*) AS TOTAL FROM KS0003.KS00006
    WHERE GUIDENTIDADE = '00000000-0000-0000-0000-000000000000'
  `);

  if ((check.recordset[0] as { TOTAL: number }).TOTAL === 0) {
    const formasPadrao = [
      { codfiscal: "01", descricao: "Dinheiro",                                  pagamento: "DINHEIRO" },
      { codfiscal: "02", descricao: "Cheque",                                    pagamento: "CHEQUE" },
      { codfiscal: "03", descricao: "Cartão de Crédito",                         pagamento: "CARTÃO DE CRÉDITO" },
      { codfiscal: "04", descricao: "Cartão de Débito",                          pagamento: "CARTÃO DE DÉBITO" },
      { codfiscal: "05", descricao: "Crédito Loja",                              pagamento: "CRÉDITO LOJA" },
      { codfiscal: "10", descricao: "Vale Alimentação",                          pagamento: "VALE ALIMENTAÇÃO" },
      { codfiscal: "11", descricao: "Vale Refeição",                             pagamento: "VALE REFEIÇÃO" },
      { codfiscal: "12", descricao: "Vale Presente",                             pagamento: "VALE PRESENTE" },
      { codfiscal: "13", descricao: "Vale Combustível",                          pagamento: "VALE COMBUSTÍVEL" },
      { codfiscal: "15", descricao: "Boleto Bancário",                           pagamento: "BOLETO BANCÁRIO" },
      { codfiscal: "16", descricao: "Depósito Bancário",                         pagamento: "DEPÓSITO BANCÁRIO" },
      { codfiscal: "17", descricao: "Pagamento Instantâneo (PIX)",               pagamento: "PIX" },
      { codfiscal: "18", descricao: "Transferência bancária / Carteira Digital", pagamento: "TRANSFERÊNCIA / CARTEIRA DIGITAL" },
      { codfiscal: "90", descricao: "Sem pagamento",                             pagamento: "SEM PAGAMENTO" },
    ];

    for (const f of formasPadrao) {
      await pool.request()
        .input("pagamento",   sql.NVarChar(60),  f.pagamento)
        .input("codfiscal",   sql.Char(2),       f.codfiscal)
        .input("descricao",   sql.NVarChar(100), f.descricao)
        .query(`
          INSERT INTO KS0003.KS00006 (PAGAMENTO, CODFISCAL, DESCRICAOFISCAL, GUIDENTIDADE)
          VALUES (@pagamento, @codfiscal, @descricao, '00000000-0000-0000-0000-000000000000')
        `);
    }
    console.log("✅ 14 formas de pagamento SEFAZ inseridas como padrão");
  } else {
    console.log("ℹ️  Formas de pagamento padrão já existem");
  }

  console.log("\n✅ Módulo Financeiro — todas as tabelas criadas com GUID como PK!");
  console.log("   Estrutura:");
  console.log("   KS0003.KS00001 — Plano de Contas (hierárquico)");
  console.log("   KS0003.KS00002 — Centro de Custo (hierárquico)");
  console.log("   KS0003.KS00003 — Natureza de Caixa");
  console.log("   KS0003.KS00004 — Contas a Pagar (Saídas) — GUID gerado pelo PDV");
  console.log("   KS0003.KS00005 — Contas a Receber (Entradas) — GUID gerado pelo PDV");
  console.log("   KS0003.KS00006 — Formas de Pagamento (14 códigos SEFAZ)");
  console.log("   KS0003.KS00007 — Movimentações de Caixa (Fluxo) — GUID gerado pelo PDV");
}

run().catch(e => { console.error("❌ Erro:", e.message); process.exit(1); });

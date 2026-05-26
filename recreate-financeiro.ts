/**
 * Drop e recria todas as tabelas do módulo financeiro com GUID como PK.
 * As tabelas antigas tinham INT como PK — incompatível com sincronização offline.
 */
import { getSqlPool } from "./server/sqlserver.js";
import sql from "mssql";

async function run() {
  const pool = await getSqlPool();

  // ── Drop tabelas na ordem correta (dependências primeiro) ────────────────────
  const drops = [
    "KS0003.KS00007", // Movimentações (referencia CP/CR)
    "KS0003.KS00005", // Contas a Receber
    "KS0003.KS00004", // Contas a Pagar
    "KS0003.KS00006", // Formas de Pagamento
    "KS0003.KS00003", // Natureza de Caixa (referencia Plano)
    "KS0003.KS00002", // Centro de Custo
    "KS0003.KS00001", // Plano de Contas
  ];

  for (const tbl of drops) {
    const [schema, name] = tbl.split(".");
    await pool.request().query(`
      IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='${schema}' AND TABLE_NAME='${name}')
        DROP TABLE ${tbl}
    `);
    console.log(`🗑  ${tbl} removida`);
  }

  // ── Recriar com GUID como PK ─────────────────────────────────────────────────

  // 1. Plano de Contas
  await pool.request().query(`
    CREATE TABLE KS0003.KS00001 (
      GUIDCONTA       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      CODCONTA        NVARCHAR(20)     NOT NULL,
      CONTA           NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      TIPO            CHAR(1)          NOT NULL DEFAULT 'D',
      NIVEL           TINYINT          NOT NULL DEFAULT 1,
      GUIDCONTAPAI    UNIQUEIDENTIFIER NULL,
      MASCARA         NVARCHAR(30)     NULL,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00001 (Plano de Contas) criada");

  // 2. Centro de Custo
  await pool.request().query(`
    CREATE TABLE KS0003.KS00002 (
      GUIDCENTRO      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      CODCENTRO       NVARCHAR(20)     NOT NULL,
      CENTRO          NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      NIVEL           TINYINT          NOT NULL DEFAULT 1,
      GUIDCENTROPAI   UNIQUEIDENTIFIER NULL,
      ORCAMENTO       DECIMAL(15,2)    NULL DEFAULT 0,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00002 (Centro de Custo) criada");

  // 3. Natureza de Caixa
  await pool.request().query(`
    CREATE TABLE KS0003.KS00003 (
      GUIDNATUREZA    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      NATUREZA        NVARCHAR(100)    NOT NULL,
      DESCRICAO       NVARCHAR(255)    NULL,
      TIPO            CHAR(1)          NOT NULL DEFAULT 'D',
      GUIDCONTA       UNIQUEIDENTIFIER NULL,
      SITUACAO        CHAR(1)          NOT NULL DEFAULT 'A',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00003 (Natureza de Caixa) criada");

  // 4. Formas de Pagamento
  await pool.request().query(`
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
  console.log("✅ KS0003.KS00006 (Formas de Pagamento) criada");

  // 5. Contas a Pagar (Saídas) — GUID gerado pelo PDV offline
  await pool.request().query(`
    CREATE TABLE KS0003.KS00004 (
      GUIDLANCAMENTO  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      GUIDCREDOR      UNIQUEIDENTIFIER NULL,
      NOMECREDOR      NVARCHAR(100)    NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORPAGO       DECIMAL(15,2)    NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE             NOT NULL,
      DTPAGAMENTO     DATE             NULL,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL,
      GUIDCONTA       UNIQUEIDENTIFIER NULL,
      GUIDCENTRO      UNIQUEIDENTIFIER NULL,
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,
      NUMERODOC       NVARCHAR(50)     NULL,
      PARCELA         SMALLINT         NOT NULL DEFAULT 1,
      TOTALPARCELAS   SMALLINT         NOT NULL DEFAULT 1,
      STATUS          NVARCHAR(10)     NOT NULL DEFAULT 'ABERTO',
      OBSERVACAO      NVARCHAR(500)    NULL,
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',
      GUIDORIGEM      UNIQUEIDENTIFIER NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00004 (Contas a Pagar) criada");

  // 6. Contas a Receber (Entradas) — GUID gerado pelo PDV offline
  await pool.request().query(`
    CREATE TABLE KS0003.KS00005 (
      GUIDLANCAMENTO  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      GUIDDEVEDOR     UNIQUEIDENTIFIER NULL,
      NOMEDEVEDOR     NVARCHAR(100)    NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      VALORRECEBIDO   DECIMAL(15,2)    NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE             NOT NULL,
      DTRECEBIMENTO   DATE             NULL,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL,
      GUIDCONTA       UNIQUEIDENTIFIER NULL,
      GUIDCENTRO      UNIQUEIDENTIFIER NULL,
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,
      NUMERODOC       NVARCHAR(50)     NULL,
      PARCELA         SMALLINT         NOT NULL DEFAULT 1,
      TOTALPARCELAS   SMALLINT         NOT NULL DEFAULT 1,
      STATUS          NVARCHAR(10)     NOT NULL DEFAULT 'ABERTO',
      OBSERVACAO      NVARCHAR(500)    NULL,
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',
      GUIDORIGEM      UNIQUEIDENTIFIER NULL,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00005 (Contas a Receber) criada");

  // 7. Movimentações de Caixa — GUID gerado pelo PDV offline
  await pool.request().query(`
    CREATE TABLE KS0003.KS00007 (
      GUIDMOVIMENTO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      DATA            DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      TIPO            CHAR(1)          NOT NULL DEFAULT 'D',
      DESCRICAO       NVARCHAR(200)    NOT NULL,
      VALOR           DECIMAL(15,2)    NOT NULL DEFAULT 0,
      GUIDNATUREZA    UNIQUEIDENTIFIER NULL,
      GUIDCONTA       UNIQUEIDENTIFIER NULL,
      GUIDCENTRO      UNIQUEIDENTIFIER NULL,
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NULL,
      GUIDLANCPAGAR   UNIQUEIDENTIFIER NULL,
      GUIDLANCRECEBER UNIQUEIDENTIFIER NULL,
      ORIGEM          NVARCHAR(20)     NULL DEFAULT 'MANUAL',
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME         NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME         NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ KS0003.KS00007 (Movimentações de Caixa) criada");

  // ── Popular Formas de Pagamento com os 14 códigos SEFAZ ─────────────────────
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
  console.log("✅ 14 formas de pagamento SEFAZ inseridas");

  console.log("\n🎉 Módulo Financeiro recriado com GUID como PK em todas as tabelas!");
  console.log("   Tabelas offline-safe (GUID gerado no PDV Delphi, sem conflito na sync):");
  console.log("   KS0003.KS00004 — Contas a Pagar  (GUIDLANCAMENTO)");
  console.log("   KS0003.KS00005 — Contas a Receber (GUIDLANCAMENTO)");
  console.log("   KS0003.KS00007 — Movimentações    (GUIDMOVIMENTO)");
}

run().catch(e => { console.error("❌ Erro:", e.message); process.exit(1); });

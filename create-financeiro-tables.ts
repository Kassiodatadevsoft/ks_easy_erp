/**
 * Cria todas as tabelas do módulo Financeiro no SQL Server
 * Modelagem completa com:
 *   KS0003.KS00001 — Plano de Contas (hierárquico)
 *   KS0003.KS00002 — Centro de Custo
 *   KS0003.KS00003 — Natureza de Caixa
 *   KS0003.KS00004 — Contas a Pagar
 *   KS0003.KS00005 — Contas a Receber
 *   KS0003.KS00006 — Movimentações de Caixa (baixas/pagamentos)
 */
import { getSqlPool } from "./server/sqlserver";

async function run() {
  const pool = await getSqlPool();

  const tables = [
    // ── Schema ────────────────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'KS0003')
      EXEC('CREATE SCHEMA KS0003')`,

    // ── Plano de Contas ───────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00001')
    CREATE TABLE KS0003.KS00001 (
      CODCONTA        INT IDENTITY(1,1) PRIMARY KEY,
      CONTA           NVARCHAR(150)  NOT NULL,
      DESCRICAO       NVARCHAR(500)  NULL,
      TIPO            CHAR(1)        NOT NULL DEFAULT 'D', -- R=Receita D=Despesa T=Transferência
      NATUREZA        CHAR(1)        NOT NULL DEFAULT 'A', -- A=Analítica S=Sintética
      NIVEL           INT            NOT NULL DEFAULT 1,
      CODCONTAPAI     INT            NULL,
      MASCARA         NVARCHAR(30)   NULL,   -- ex: 1.1.01
      SITUACAO        CHAR(1)        NOT NULL DEFAULT 'A',
      GUIDCONTA       NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME       NOT NULL DEFAULT GETDATE()
    )`,

    // ── Centro de Custo ───────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00002')
    CREATE TABLE KS0003.KS00002 (
      CODCENTRO       INT IDENTITY(1,1) PRIMARY KEY,
      CENTRO          NVARCHAR(150)  NOT NULL,
      DESCRICAO       NVARCHAR(500)  NULL,
      CODCENTROPAI    INT            NULL,
      NIVEL           INT            NOT NULL DEFAULT 1,
      MASCARA         NVARCHAR(30)   NULL,
      RESPONSAVEL     NVARCHAR(150)  NULL,
      ORCAMENTO       DECIMAL(18,2)  NULL DEFAULT 0,
      SITUACAO        CHAR(1)        NOT NULL DEFAULT 'A',
      GUIDCENTRO      NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME       NOT NULL DEFAULT GETDATE()
    )`,

    // ── Natureza de Caixa ─────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00003')
    CREATE TABLE KS0003.KS00003 (
      CODNATUREZA     INT IDENTITY(1,1) PRIMARY KEY,
      NATUREZA        NVARCHAR(150)  NOT NULL,
      DESCRICAO       NVARCHAR(500)  NULL,
      TIPO            CHAR(1)        NOT NULL DEFAULT 'D', -- R=Receita D=Despesa
      CODCONTA        INT            NULL,   -- FK para Plano de Contas
      SITUACAO        CHAR(1)        NOT NULL DEFAULT 'A',
      GUIDNATUREZA    NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME       NOT NULL DEFAULT GETDATE()
    )`,

    // ── Contas a Pagar ────────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00004')
    CREATE TABLE KS0003.KS00004 (
      CODLANCAMENTO   INT IDENTITY(1,1) PRIMARY KEY,
      DESCRICAO       NVARCHAR(300)  NOT NULL,
      CODCREDOR       INT            NULL,   -- FK KS0002.KS00001
      NOMECREDOR      NVARCHAR(150)  NULL,
      VALOR           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      VALORPAGO       DECIMAL(18,2)  NOT NULL DEFAULT 0,
      DESCONTO        DECIMAL(18,2)  NOT NULL DEFAULT 0,
      JUROS           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      MULTA           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE           NOT NULL,
      DTPAGAMENTO     DATE           NULL,
      CODNATUREZA     INT            NULL,   -- FK KS0003.KS00003
      NOMENATUREZA    NVARCHAR(150)  NULL,
      CODCENTRO       INT            NULL,   -- FK KS0003.KS00002
      NOMECENTRO      NVARCHAR(150)  NULL,
      CODCONTA        INT            NULL,   -- FK KS0003.KS00001
      NUMERODOC       NVARCHAR(50)   NULL,
      PARCELA         INT            NOT NULL DEFAULT 1,
      TOTALPARCELAS   INT            NOT NULL DEFAULT 1,
      GUIDPARCELA     NVARCHAR(36)   NULL,   -- agrupa parcelas do mesmo lançamento
      STATUS          NVARCHAR(10)   NOT NULL DEFAULT 'ABERTO', -- ABERTO/PAGO/PARCIAL/CANCELADO
      FORMAPAGAMENTO  NVARCHAR(20)   NULL,   -- DINHEIRO/PIX/BOLETO/CARTAO/TED/CHEQUE
      CONTABANCARIA   NVARCHAR(100)  NULL,
      OBSERVACAO      NVARCHAR(500)  NULL,
      GUIDLANCAMENTO  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME       NOT NULL DEFAULT GETDATE()
    )`,

    // ── Contas a Receber ──────────────────────────────────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00005')
    CREATE TABLE KS0003.KS00005 (
      CODLANCAMENTO   INT IDENTITY(1,1) PRIMARY KEY,
      DESCRICAO       NVARCHAR(300)  NOT NULL,
      CODDEVEDOR      INT            NULL,   -- FK KS0002.KS00001
      NOMEDEVEDOR     NVARCHAR(150)  NULL,
      VALOR           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      VALORRECEBIDO   DECIMAL(18,2)  NOT NULL DEFAULT 0,
      DESCONTO        DECIMAL(18,2)  NOT NULL DEFAULT 0,
      JUROS           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      MULTA           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      DTLANCAMENTO    DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      DTVENCIMENTO    DATE           NOT NULL,
      DTRECEBIMENTO   DATE           NULL,
      CODNATUREZA     INT            NULL,
      NOMENATUREZA    NVARCHAR(150)  NULL,
      CODCENTRO       INT            NULL,
      NOMECENTRO      NVARCHAR(150)  NULL,
      CODCONTA        INT            NULL,
      NUMERODOC       NVARCHAR(50)   NULL,
      PARCELA         INT            NOT NULL DEFAULT 1,
      TOTALPARCELAS   INT            NOT NULL DEFAULT 1,
      GUIDPARCELA     NVARCHAR(36)   NULL,
      STATUS          NVARCHAR(10)   NOT NULL DEFAULT 'ABERTO',
      FORMAPAGAMENTO  NVARCHAR(20)   NULL,
      CONTABANCARIA   NVARCHAR(100)  NULL,
      OBSERVACAO      NVARCHAR(500)  NULL,
      GUIDLANCAMENTO  NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME       NOT NULL DEFAULT GETDATE()
    )`,

    // ── Movimentações de Caixa (histórico de baixas) ──────────────────────────
    `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00006')
    CREATE TABLE KS0003.KS00006 (
      CODMOVIMENTO    INT IDENTITY(1,1) PRIMARY KEY,
      TIPO            CHAR(1)        NOT NULL, -- E=Entrada S=Saída
      DESCRICAO       NVARCHAR(300)  NOT NULL,
      VALOR           DECIMAL(18,2)  NOT NULL DEFAULT 0,
      DTMOVIMENTO     DATE           NOT NULL DEFAULT CAST(GETDATE() AS DATE),
      CODNATUREZA     INT            NULL,
      NOMENATUREZA    NVARCHAR(150)  NULL,
      CODCENTRO       INT            NULL,
      NOMECENTRO      NVARCHAR(150)  NULL,
      CODCONTA        INT            NULL,
      FORMAPAGAMENTO  NVARCHAR(20)   NULL,
      CONTABANCARIA   NVARCHAR(100)  NULL,
      CODLANCPAGAR    INT            NULL,   -- FK KS0003.KS00004 (se veio de baixa CP)
      CODLANCRECEBER  INT            NULL,   -- FK KS0003.KS00005 (se veio de baixa CR)
      OBSERVACAO      NVARCHAR(500)  NULL,
      GUIDMOVIMENTO   NVARCHAR(36)   NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    NVARCHAR(36)   NOT NULL,
      DATACADASTRO    DATETIME       NOT NULL DEFAULT GETDATE()
    )`,
  ];

  for (const sql of tables) {
    try {
      await pool.request().query(sql);
      const match = sql.match(/TABLE_NAME='(\w+)'/);
      const schema = sql.match(/TABLE_SCHEMA='(\w+)'/);
      if (match && schema) {
        console.log(`✅ ${schema[1]}.${match[1]} — OK`);
      } else {
        console.log(`✅ Schema/comando executado`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Erro:`, msg.slice(0, 120));
    }
  }

  console.log("\n✅ Módulo Financeiro — tabelas criadas/verificadas com sucesso!");
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

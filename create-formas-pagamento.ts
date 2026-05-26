import sql from "mssql";
import { getSqlPool } from "./server/sqlserver.js";

async function main() {
  const pool = await getSqlPool();

  // Criar schema KS0003 se não existir
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'KS0003')
      EXEC('CREATE SCHEMA KS0003')
  `);

  // Criar tabela KS0003.KS00006 — Formas de Pagamento
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00006'
    )
    CREATE TABLE KS0003.KS00006 (
      CODPAGAMENTO    INT IDENTITY(1,1) PRIMARY KEY,
      PAGAMENTO       NVARCHAR(60)  NOT NULL,
      CODFISCAL       CHAR(2)       NOT NULL,
      DESCRICAOFISCAL NVARCHAR(100) NOT NULL,
      INTEGRACAOTEF   BIT           NOT NULL DEFAULT 0,
      BANDEIRA        NVARCHAR(40)  NULL,
      CNPJTEF         CHAR(14)      NULL,
      AUTORIZADORA    NVARCHAR(60)  NULL,
      SITUACAO        CHAR(1)       NOT NULL DEFAULT 'A',
      GUIDPAGAMENTO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME      NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME      NOT NULL DEFAULT GETDATE()
    )
  `);
  console.log("✅ Tabela KS0003.KS00006 criada (ou já existia)");

  // Verificar se já tem dados padrão
  const check = await pool.request().query(`
    SELECT COUNT(*) AS TOTAL FROM KS0003.KS00006 WHERE GUIDENTIDADE = '00000000-0000-0000-0000-000000000000'
  `);

  if (check.recordset[0].TOTAL === 0) {
    // Inserir os 14 códigos fiscais SEFAZ como registros padrão (GUIDENTIDADE nula = padrão do sistema)
    const formasPadrao = [
      { codfiscal: "01", descricao: "Dinheiro",                                   pagamento: "DINHEIRO" },
      { codfiscal: "02", descricao: "Cheque",                                     pagamento: "CHEQUE" },
      { codfiscal: "03", descricao: "Cartão de Crédito",                          pagamento: "CARTÃO DE CRÉDITO" },
      { codfiscal: "04", descricao: "Cartão de Débito",                           pagamento: "CARTÃO DE DÉBITO" },
      { codfiscal: "05", descricao: "Crédito Loja",                               pagamento: "CRÉDITO LOJA" },
      { codfiscal: "10", descricao: "Vale Alimentação",                           pagamento: "VALE ALIMENTAÇÃO" },
      { codfiscal: "11", descricao: "Vale Refeição",                              pagamento: "VALE REFEIÇÃO" },
      { codfiscal: "12", descricao: "Vale Presente",                              pagamento: "VALE PRESENTE" },
      { codfiscal: "13", descricao: "Vale Combustível",                           pagamento: "VALE COMBUSTÍVEL" },
      { codfiscal: "15", descricao: "Boleto Bancário",                            pagamento: "BOLETO BANCÁRIO" },
      { codfiscal: "16", descricao: "Depósito Bancário",                          pagamento: "DEPÓSITO BANCÁRIO" },
      { codfiscal: "17", descricao: "Pagamento Instantâneo (PIX)",                pagamento: "PIX" },
      { codfiscal: "18", descricao: "Transferência bancária / Carteira Digital",  pagamento: "TRANSFERÊNCIA / CARTEIRA DIGITAL" },
      { codfiscal: "90", descricao: "Sem pagamento",                              pagamento: "SEM PAGAMENTO" },
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
    console.log("ℹ️  Dados padrão já existem, pulando inserção");
  }

  await pool.close();
  console.log("✅ Concluído!");
}

main().catch(e => { console.error("❌ Erro:", e.message); process.exit(1); });

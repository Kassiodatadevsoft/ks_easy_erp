import { getSqlPool, sql } from "./server/sqlserver";

async function main() {
  const pool = await getSqlPool();

  // Verificar colunas existentes
  const cols = await pool.request().query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00006'`
  );
  const existentes = cols.recordset.map((r: { COLUMN_NAME: string }) => r.COLUMN_NAME.toUpperCase());
  console.log("Colunas existentes:", existentes);

  const toAdd: { col: string; def: string }[] = [];

  if (!existentes.includes("ACEITATROCO"))
    toAdd.push({ col: "ACEITATROCO", def: "BIT NOT NULL DEFAULT 0" });
  if (!existentes.includes("BANDEIRATEF"))
    toAdd.push({ col: "BANDEIRATEF", def: "NVARCHAR(50) NULL" });
  if (!existentes.includes("CODIGOTEF"))
    toAdd.push({ col: "CODIGOTEF", def: "NVARCHAR(50) NULL" });
  if (!existentes.includes("INTEGRATEF"))
    toAdd.push({ col: "INTEGRATEF", def: "BIT NOT NULL DEFAULT 0" });
  if (!existentes.includes("CODIGOSEFAZ"))
    toAdd.push({ col: "CODIGOSEFAZ", def: "NVARCHAR(2) NULL" });
  if (!existentes.includes("DESCRICAO"))
    toAdd.push({ col: "DESCRICAO", def: "NVARCHAR(255) NULL" });
  if (!existentes.includes("SITUACAO"))
    toAdd.push({ col: "SITUACAO", def: "CHAR(1) NOT NULL DEFAULT 'A'" });
  if (!existentes.includes("DATACADASTRO"))
    toAdd.push({ col: "DATACADASTRO", def: "DATETIME NOT NULL DEFAULT GETDATE()" });
  if (!existentes.includes("ULTIMAALTERACAO"))
    toAdd.push({ col: "ULTIMAALTERACAO", def: "DATETIME NOT NULL DEFAULT GETDATE()" });

  for (const { col, def } of toAdd) {
    console.log(`Adicionando coluna ${col}...`);
    await pool.request().query(`ALTER TABLE KS0003.KS00006 ADD ${col} ${def}`);
    console.log(`  ✓ ${col} adicionada`);
  }

  if (toAdd.length === 0) {
    console.log("Todas as colunas já existem!");
  } else {
    console.log(`\n${toAdd.length} colunas adicionadas com sucesso!`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

import sql from 'mssql';
const connStr = process.env.SQLSERVER_URL;
const url = new URL(connStr);
const config = {
  server: url.hostname, port: parseInt(url.port) || 1433,
  database: url.pathname.replace(/^\//, '') || 'Data',
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
  connectionTimeout: 15000,
};
const pool = await sql.connect(config);

// Verificar campo CRT em KS0002.KS00001
console.log('=== Campo CRT em KS0002.KS00001 ===');
const crt = await pool.request().query(`
  SELECT TOP 10 GUIDPESSOA, NOME, DOCUMENTO, CRT, CADEMPRESA
  FROM KS0002.KS00001
  WHERE CADEMPRESA = 1
  ORDER BY NOME
`);
crt.recordset.forEach(r => console.log(JSON.stringify(r)));

// Verificar se existe coluna REGIME ou similar
console.log('\n=== Colunas com REGIME em KS0002.KS00001 ===');
const cols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00001'
    AND (COLUMN_NAME LIKE '%REGIME%' OR COLUMN_NAME LIKE '%CRT%' OR COLUMN_NAME LIKE '%SIMPLES%' OR COLUMN_NAME LIKE '%MEI%')
`);
cols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));

// Verificar todas as colunas de KS0002.KS00001
console.log('\n=== Todas as colunas de KS0002.KS00001 ===');
const allCols = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00001'
  ORDER BY ORDINAL_POSITION
`);
allCols.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH ?? ''})`));

await pool.close();

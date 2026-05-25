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

// Adicionar coluna CST (Regime Normal) se não existir
await pool.request().query(`
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00009' AND COLUMN_NAME='CST'
  )
  BEGIN
    ALTER TABLE KS0000.KS00009 ADD CST VARCHAR(3) NULL
    PRINT 'Coluna CST adicionada'
  END
  ELSE PRINT 'Coluna CST já existe'
`);
console.log('CST: OK');

await pool.close();
console.log('Concluído!');

import sql from 'mssql';
const connStr = process.env.SQLSERVER_URL;
const url = new URL(connStr);
const config = {
  server: url.hostname, port: parseInt(url.port)||1433,
  database: url.pathname.replace(/^\//,''), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
  connectionTimeout: 15000,
};
const pool = await sql.connect(config);
const r = await pool.request().query(`
  SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA IN ('KS0000','KS0002') ORDER BY TABLE_SCHEMA, TABLE_NAME
`);
console.log('Tabelas:', JSON.stringify(r.recordset));
await pool.close();

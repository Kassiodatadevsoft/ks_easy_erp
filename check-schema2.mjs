import sql from 'mssql';

// Usar a mesma lógica do sqlserver.ts
const connStr = process.env.SQLSERVER_URL;
console.log('SQLSERVER_URL:', connStr ? connStr.substring(0, 50) + '...' : 'NOT SET');

if (!connStr) process.exit(1);

let config;
if (connStr.startsWith('mssql://') || connStr.startsWith('sqlserver://')) {
  const url = new URL(connStr);
  config = {
    server: url.hostname,
    port: url.port ? parseInt(url.port) : 1433,
    database: url.pathname.replace(/^\//, '') || 'Data',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
    connectionTimeout: 15000,
  };
} else {
  // ADO.NET style: Server=host,port;Database=db;User Id=user;Password=pwd
  const parts = {};
  connStr.split(';').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > 0) {
      parts[p.slice(0,idx).trim().toLowerCase()] = p.slice(idx+1).trim();
    }
  });
  const serverPart = parts['server'] || parts['data source'] || '';
  const [server, port] = serverPart.split(',');
  config = {
    server: server?.trim(),
    port: port ? parseInt(port) : 1433,
    database: parts['database'] || parts['initial catalog'] || 'Data',
    user: parts['user id'] || parts['uid'],
    password: parts['password'] || parts['pwd'],
    options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
    connectionTimeout: 15000,
  };
}

console.log('Config server:', config.server, 'db:', config.database);

const pool = await sql.connect(config);

const r1 = await pool.request().query(`SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KS00007'`);
console.log('KS00007:', JSON.stringify(r1.recordset));

const r2 = await pool.request().query(`SELECT DISTINCT TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA LIKE 'KS%' ORDER BY TABLE_SCHEMA`);
console.log('KS* schemas:', JSON.stringify(r2.recordset));

// Verificar colunas se encontrou a tabela
if (r1.recordset.length > 0) {
  const sch = r1.recordset[0].TABLE_SCHEMA;
  const r3 = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${sch}' AND TABLE_NAME='KS00007' ORDER BY ORDINAL_POSITION`);
  console.log(`Columns ${sch}.KS00007:`, JSON.stringify(r3.recordset));
}

// Verificar tabelas de categorias/produtos
const r4 = await pool.request().query(`SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%CATEG%' OR TABLE_NAME LIKE '%PRODUTO%' OR TABLE_NAME LIKE '%PIZZA%' ORDER BY TABLE_SCHEMA, TABLE_NAME`);
console.log('Categorias/Produtos:', JSON.stringify(r4.recordset));

await pool.close();

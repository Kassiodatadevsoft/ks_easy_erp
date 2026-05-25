import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sql = require('mssql');
const dotenv = require('dotenv');

// Carregar .env se existir
try { dotenv.config(); } catch(e) {}

// Tentar parsear SQLSERVER_URL
const connStr = process.env.SQLSERVER_URL;
if (!connStr) { console.error('SQLSERVER_URL não definida'); process.exit(1); }

// Parsear connection string estilo mssql
function parseConnStr(str) {
  // Formato: Server=host,port;Database=db;User Id=user;Password=pass;...
  const parts = {};
  str.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim();
      parts[key] = val;
    }
  });
  const serverPart = parts['server'] || parts['data source'] || '';
  const [server, port] = serverPart.split(',');
  return {
    server: server?.trim(),
    port: port ? parseInt(port) : 1433,
    database: parts['database'] || parts['initial catalog'],
    user: parts['user id'] || parts['uid'],
    password: parts['password'] || parts['pwd'],
    options: { trustServerCertificate: true, encrypt: true }
  };
}

const config = parseConnStr(connStr);
console.log('Conectando em:', config.server, config.database);

const pool = await sql.connect(config);

const r = await pool.request().query(`
  SELECT TABLE_SCHEMA, TABLE_NAME 
  FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_NAME = 'KS00007'
  ORDER BY TABLE_SCHEMA, TABLE_NAME
`);
console.log('Tabela KS00007:', JSON.stringify(r.recordset));

const r2 = await pool.request().query(`
  SELECT DISTINCT TABLE_SCHEMA 
  FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA LIKE 'KS%'
  ORDER BY TABLE_SCHEMA
`);
console.log('Schemas KS*:', JSON.stringify(r2.recordset));

await pool.close();
process.exit(0);

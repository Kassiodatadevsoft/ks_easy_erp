import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const connStr = process.env.SQLSERVER_URL;
if (!connStr) { console.error("SQLSERVER_URL não definida"); process.exit(1); }

// Parse mssql://user:pass@host:port/db
const match = connStr.match(/mssql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) { console.error("URL inválida:", connStr); process.exit(1); }
const [, user, password, server, port, database] = match;

const pool = await sql.connect({ user, password, server, port: Number(port), database, options: { encrypt: false, trustServerCertificate: true } });

// 1. Verificar campo CODGERENTE vs CADGERENTE
const r1 = await pool.request().query(`
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00001' 
  AND COLUMN_NAME IN ('CODGERENTE','CADGERENTE','ISGERENTE','GERENTE')
`);
console.log("Campos gerente:", r1.recordset);

// 2. Listar usuários ativos
const r2 = await pool.request().query(`
  SELECT TOP 5 USUARIO, SITUACAO, CADUSUARIO, LEFT(ISNULL(SENHAPRAZO,''),3) as SENHAPREFIX
  FROM KS0002.KS00001
  WHERE CADUSUARIO = 1 AND SITUACAO = 'A' AND USUARIO IS NOT NULL AND USUARIO != ''
`);
console.log("Usuários ativos:", r2.recordset);

// 3. Testar a query exata de login com o usuário DATADEV
const r3 = await pool.request()
  .input("USUARIO", sql.VarChar(15), "DATADEV")
  .query(`
    SELECT TOP 1 CAD.USUARIO, CAD.SITUACAO, CAD.CADUSUARIO,
           ent.SITUACAO as ENT_SITUACAO, CAD.GUIDENTIDADE
    FROM KS0002.KS00001 AS CAD
    INNER JOIN KS0002.KS00001 AS ent ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
    WHERE CAD.USUARIO = @USUARIO AND CAD.SITUACAO = 'A' AND ent.SITUACAO = 'A'
  `);
console.log("Query login (sem senha):", r3.recordset);

await pool.close();

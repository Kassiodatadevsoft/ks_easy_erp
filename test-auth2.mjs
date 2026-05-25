import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const connStr = process.env.SQLSERVER_URL;
const match = connStr.match(/mssql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, password, server, port, database] = match;
const pool = await sql.connect({ user, password, server, port: Number(port), database, options: { encrypt: false, trustServerCertificate: true } });

// Ver o usuário DATADEV com todos os campos relevantes
const r1 = await pool.request().query(`
  SELECT TOP 1 
    GUIDPESSOA, GUIDENTIDADE, USUARIO, NOME, SITUACAO, CADUSUARIO,
    LEFT(ISNULL(SENHAPRAZO,''),5) as SENHAPREFIX,
    CADEMPRESA, CADGERENTE
  FROM KS0002.KS00001
  WHERE USUARIO = '10' OR USUARIO LIKE '%DATADEV%' OR USUARIO LIKE '%10%'
  ORDER BY CADUSUARIO DESC
`);
console.log("Usuário 10:", JSON.stringify(r1.recordset, null, 2));

// Ver se a empresa vinculada existe e está ativa
if (r1.recordset[0]?.GUIDENTIDADE) {
  const guid = r1.recordset[0].GUIDENTIDADE;
  const r2 = await pool.request().input("G", sql.UniqueIdentifier, guid).query(`
    SELECT GUIDPESSOA, NOME, SITUACAO, CADEMPRESA FROM KS0002.KS00001 WHERE GUIDPESSOA = @G
  `);
  console.log("Empresa vinculada:", JSON.stringify(r2.recordset, null, 2));
} else {
  console.log("GUIDENTIDADE está NULL ou vazio — o JOIN vai falhar!");
}

await pool.close();

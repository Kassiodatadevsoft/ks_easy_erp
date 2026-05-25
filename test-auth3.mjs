import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const connStr = process.env.SQLSERVER_URL;
const match = connStr.match(/mssql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, password, server, port, database] = match;
const pool = await sql.connect({ user, password, server, port: Number(port), database, options: { encrypt: false, trustServerCertificate: true } });

// Ver campos relacionados a gerente/filial
const r1 = await pool.request().query(`
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00001' 
  AND COLUMN_NAME IN ('CODGERENTE','CADGERENTE','ISGERENTE','GERENTE','CODFILIAL','FILIAL')
  ORDER BY COLUMN_NAME
`);
console.log("Campos gerente/filial:", r1.recordset.map(r => r.COLUMN_NAME));

// Ver o usuário com USUARIO='10' sem CADGERENTE
const r2 = await pool.request().query(`
  SELECT TOP 1 
    GUIDPESSOA, GUIDENTIDADE, USUARIO, NOME, SITUACAO, CADUSUARIO,
    CODGERENTE, CODFILIAL,
    LEFT(ISNULL(SENHAPRAZO,''),3) as SENHAPREFIX
  FROM KS0002.KS00001
  WHERE CADUSUARIO = 1 AND SITUACAO = 'A' AND USUARIO IS NOT NULL AND USUARIO != ''
`);
console.log("Usuário ativo:", JSON.stringify(r2.recordset[0], null, 2));

// Verificar se GUIDENTIDADE aponta para uma empresa ativa
if (r2.recordset[0]?.GUIDENTIDADE) {
  const guid = r2.recordset[0].GUIDENTIDADE;
  const r3 = await pool.request().input("G", sql.UniqueIdentifier, guid).query(`
    SELECT GUIDPESSOA, NOME, SITUACAO, CADEMPRESA FROM KS0002.KS00001 WHERE GUIDPESSOA = @G
  `);
  console.log("Empresa vinculada:", JSON.stringify(r3.recordset[0], null, 2));
} else {
  console.log("GUIDENTIDADE NULL!");
}

await pool.close();

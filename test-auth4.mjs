import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

const connStr = process.env.SQLSERVER_URL;
const match = connStr.match(/mssql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, password, server, port, database] = match;
const pool = await sql.connect({ user, password, server, port: Number(port), database, options: { encrypt: false, trustServerCertificate: true } });

// Testar a query EXATA do ksAuth.ts com usuário=10 e senha=1023 (prefixo encontrado)
const r1 = await pool.request()
  .input("USUARIO", sql.VarChar(15), "10")
  .input("SENHA", sql.VarChar(25), "1023")
  .query(`
    SELECT
      ent.DOCUMENTO   AS ENTDOCUMENTO,
      ent.NOME        AS NOMEFANTASIA,
      CAD.GUIDPESSOA,
      CAD.GUIDENTIDADE,
      CAD.NOME,
      CAD.FANTASIA,
      CAD.DOCUMENTO,
      CAD.USUARIO,
      CAD.EMAIL,
      CAD.CODTIPOENTIDADE,
      CAD.SITUACAO,
      CAD.CODGERENTE  AS CADGERENTE,
      CAD.CODFILIAL
    FROM KS0002.KS00001 AS CAD
    INNER JOIN KS0002.KS00001 AS ent
      ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
    WHERE CAD.SENHAPRAZO = @SENHA
      AND CAD.USUARIO    = @USUARIO
      AND CAD.SITUACAO   = 'A'
      AND ent.SITUACAO   = 'A'
  `);
console.log("Query exata com senha 1023:", r1.recordset.length, "registros");

// Testar sem filtro de senha para ver se o usuário/empresa está OK
const r2 = await pool.request()
  .input("USUARIO", sql.VarChar(15), "10")
  .query(`
    SELECT
      CAD.USUARIO, CAD.SITUACAO, CAD.SENHAPRAZO,
      ent.SITUACAO as ENT_SITUACAO, ent.CADEMPRESA
    FROM KS0002.KS00001 AS CAD
    INNER JOIN KS0002.KS00001 AS ent
      ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
    WHERE CAD.USUARIO = @USUARIO AND CAD.SITUACAO = 'A' AND ent.SITUACAO = 'A'
  `);
console.log("Sem filtro de senha:", JSON.stringify(r2.recordset, null, 2));

await pool.close();

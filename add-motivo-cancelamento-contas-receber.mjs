import "dotenv/config";
import sql from "mssql";

const connStr = process.env.SQLSERVER_URL;
if (!connStr) {
  throw new Error("SQLSERVER_URL environment variable is not set");
}

function buildConfig(connectionString) {
  if (connectionString.startsWith("mssql://") || connectionString.startsWith("sqlserver://")) {
    const url = new URL(connectionString);
    return {
      server: url.hostname,
      port: url.port ? Number(url.port) : 1433,
      database: url.pathname.replace(/^\//, "") || "KS_Easy",
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
    };
  }

  const params = {};
  for (const part of connectionString.split(";")) {
    const [key, ...rest] = part.split("=");
    if (key && rest.length) params[key.trim().toLowerCase()] = rest.join("=").trim();
  }

  return {
    server: params.server || params["data source"] || "localhost",
    port: params.port ? Number(params.port) : 1433,
    database: params.database || params["initial catalog"] || "KS_Easy",
    user: params["user id"] || params.uid || params.user || "",
    password: params.password || params.pwd || "",
    options: {
      trustServerCertificate: (params.trustservercertificate || "true").toLowerCase() === "true",
      encrypt: (params.encrypt || "false").toLowerCase() === "true",
      enableArithAbort: true,
    },
  };
}

const pool = await new sql.ConnectionPool(buildConfig(connStr)).connect();
try {
  await pool.request().query(`
    IF COL_LENGTH('KS0003.KS00005', 'MOTIVOCANCELAMENTO') IS NULL
    BEGIN
      ALTER TABLE KS0003.KS00005
        ADD MOTIVOCANCELAMENTO NVARCHAR(500) NULL;
    END
  `);
  console.log("Coluna MOTIVOCANCELAMENTO verificada/criada em KS0003.KS00005.");
} finally {
  await pool.close();
}

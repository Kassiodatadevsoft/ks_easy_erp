import sql from "mssql";

let pool: sql.ConnectionPool | null = null;

function buildConfig(): sql.config {
  const connStr = process.env.SQLSERVER_URL;
  if (!connStr) {
    throw new Error("SQLSERVER_URL environment variable is not set");
  }

  const params: Record<string, string> = {};
  connStr.split(";").forEach((part) => {
    const [key, ...rest] = part.split("=");
    if (key && rest.length > 0) {
      params[key.trim().toLowerCase()] = rest.join("=").trim();
    }
  });

  return {
    server: params["server"] || params["data source"] || "localhost",
    database: params["database"] || params["initial catalog"] || "KS_Easy",
    user: params["user id"] || params["uid"] || params["user"] || "",
    password: params["password"] || params["pwd"] || "",
    options: {
      trustServerCertificate:
        (params["trustservercertificate"] || "true").toLowerCase() === "true",
      encrypt: (params["encrypt"] || "false").toLowerCase() === "true",
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }
  const config = buildConfig();
  pool = await new sql.ConnectionPool(config).connect();
  pool.on("error", (err) => {
    console.error("[SQL Server] Pool error:", err);
    pool = null;
  });
  return pool;
}

type SqlParam = {
  type: sql.ISqlTypeFactory;
  value: unknown;
};

export async function querySql<T = Record<string, unknown>>(
  query: string,
  params?: Record<string, SqlParam>
): Promise<T[]> {
  const p = await getSqlPool();
  const request = p.request();
  if (params) {
    for (const [name, { type, value }] of Object.entries(params)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request.input(name, type as any, value);
    }
  }
  const result = await request.query(query);
  return result.recordset as T[];
}

export { sql };

import { TRPCError } from "@trpc/server";
import { getSqlPool, sql } from "../sqlserver";

type EmpresaOfflineRow = Record<string, unknown> & {
  GUIDENTIDADE?: unknown;
  GUIDPESSOA?: unknown;
  SITUACAO?: unknown;
};

function normalizeJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeJsonValue(item)])
    );
  }

  return value;
}

function normalizeEmpresaRow(row: EmpresaOfflineRow) {
  return normalizeJsonValue(row) as Record<string, unknown>;
}

export async function exportarEmpresaOfflinePorGuid(guid: string) {
  const pool = await getSqlPool();
  const result = await pool.request()
    .input("guid", sql.UniqueIdentifier, guid)
    .query<EmpresaOfflineRow>(`
      SELECT TOP 1 *
      FROM [KS0002].[KS00001]
      WHERE [GUIDPESSOA] = @guid
    `);

  const empresa = result.recordset[0];

  if (!empresa) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Empresa nao encontrada para o GUID informado.",
    });
  }

  if (String(empresa.SITUACAO ?? "").trim().toUpperCase() !== "A") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Empresa encontrada, mas esta inativa.",
    });
  }

  return {
    success: true,
    exportedAt: new Date().toISOString(),
    source: "[KS0002].[KS00001]",
    key: "GUIDPESSOA",
    guid,
    empresa: normalizeEmpresaRow(empresa),
  };
}

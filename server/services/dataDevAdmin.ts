import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { DATADEV_ADMIN_CNPJ, isDataDevAdminDocument, normalizeCnpj } from "@shared/datadev";
import type { KsSessionUser } from "../../shared/ksTypes";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "../routers/ksAuthRouter";

export { DATADEV_ADMIN_CNPJ, normalizeCnpj };

export const DATADEV_FORBIDDEN_MESSAGE = "Acesso permitido somente para administracao DataDev.";

export async function ensureEmpresaSegmentoColumn() {
  await querySql(`
    IF COL_LENGTH('KS0002.KS00001', 'SEGMENTO') IS NULL
      ALTER TABLE KS0002.KS00001 ADD SEGMENTO varchar(30) NOT NULL CONSTRAINT DF_KS00001_SEGMENTO DEFAULT ('GERAL') WITH VALUES;
  `);
}

export function isDataDevAdminSession(session: KsSessionUser | null | undefined) {
  return Boolean(isDataDevAdminDocument(session?.entDocumento) || isDataDevAdminDocument(session?.documento));
}

export async function sessionEmpresaCnpj(session: KsSessionUser | null | undefined) {
  if (!session?.guidEntidade) return "";
  const rows = await querySql<{ DOCUMENTO: string | null }>(
    `SELECT TOP 1 DOCUMENTO
     FROM KS0002.KS00001
     WHERE GUIDPESSOA = @GUIDPESSOA OR (GUIDENTIDADE = @GUIDPESSOA AND CADEMPRESA = 1)
     ORDER BY CASE WHEN GUIDPESSOA = @GUIDPESSOA THEN 0 ELSE 1 END`,
    { GUIDPESSOA: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
  );
  return normalizeCnpj(rows[0]?.DOCUMENTO);
}

export async function isDataDevAdminBySession(session: KsSessionUser | null | undefined) {
  if (isDataDevAdminSession(session)) return true;
  return (await sessionEmpresaCnpj(session)) === DATADEV_ADMIN_CNPJ;
}

export async function assertDataDevAdminSession(session: KsSessionUser | null | undefined) {
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida. Faca login novamente." });
  }
  if (!(await isDataDevAdminBySession(session))) {
    throw new TRPCError({ code: "FORBIDDEN", message: DATADEV_FORBIDDEN_MESSAGE });
  }
}

export async function isDataDevAdmin(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  return isDataDevAdminBySession(session);
}

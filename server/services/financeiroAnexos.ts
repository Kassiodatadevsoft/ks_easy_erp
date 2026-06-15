import fs from "fs";
import path from "path";
import { getSqlPool, sql } from "../sqlserver";

export const FINANCEIRO_ANEXOS_MAX_BYTES = Number(process.env.FINANCEIRO_ANEXOS_MAX_BYTES ?? 10 * 1024 * 1024);

export const FINANCEIRO_ANEXOS_ALLOWED: Record<string, { ext: string; kind: "image" | "pdf" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "application/pdf": { ext: "pdf", kind: "pdf" },
};

export type FinanceiroAnexoTipo = "LANCAMENTO" | "RECEBIMENTO";

export async function garantirTabelaFinanceiroAnexos(pool?: sql.ConnectionPool) {
  pool = pool ?? await getSqlPool();
  await pool.request().query(`
    IF OBJECT_ID('FINANCEIROANEXOS', 'U') IS NULL
    CREATE TABLE FINANCEIROANEXOS (
      GUIDANEXO CHAR(36) NOT NULL PRIMARY KEY,
      GUIDENTIDADE CHAR(36) NOT NULL,
      GUIDCONTARECEBER CHAR(36) NOT NULL,
      GUIDRECEBIMENTO CHAR(36) NULL,
      TIPO VARCHAR(20) NULL,
      NOMEARQUIVO VARCHAR(255) NULL,
      CAMINHOARQUIVO VARCHAR(500) NULL,
      TAMANHOARQUIVO NUMERIC(18,0) NULL,
      DATACADASTRO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCADASTRO VARCHAR(100) NULL
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_FINANCEIROANEXOS_TITULO' AND object_id=OBJECT_ID('FINANCEIROANEXOS'))
      CREATE INDEX IX_FINANCEIROANEXOS_TITULO ON FINANCEIROANEXOS (GUIDENTIDADE, GUIDCONTARECEBER, DATACADASTRO)
  `);
}

export function isGuid(value: string | undefined | null) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizeFileName(filename: string) {
  const base = path.basename(filename || "documento").replace(/[^\w.\- ]+/g, "_").trim();
  return base.slice(0, 180) || "documento";
}

export async function registrarFinanceiroAnexo(params: {
  guidAnexo: string;
  guidEntidade: string;
  guidContaReceber: string;
  guidRecebimento?: string | null;
  tipo: FinanceiroAnexoTipo;
  nomeArquivo: string;
  caminhoArquivo: string;
  tamanhoArquivo: number;
  usuarioCadastro?: string | null;
}) {
  const pool = await getSqlPool();
  await garantirTabelaFinanceiroAnexos(pool);
  await pool.request()
    .input("guidanexo", sql.Char(36), params.guidAnexo)
    .input("guidentidade", sql.Char(36), params.guidEntidade)
    .input("guidcontareceber", sql.Char(36), params.guidContaReceber)
    .input("guidrecebimento", sql.Char(36), params.guidRecebimento ?? null)
    .input("tipo", sql.VarChar(20), params.tipo)
    .input("nomearquivo", sql.VarChar(255), params.nomeArquivo)
    .input("caminhoarquivo", sql.VarChar(500), params.caminhoArquivo)
    .input("tamanhoarquivo", sql.Decimal(18, 0), params.tamanhoArquivo)
    .input("usuariocadastro", sql.VarChar(100), params.usuarioCadastro ?? null)
    .query(`
      INSERT INTO FINANCEIROANEXOS
        (GUIDANEXO, GUIDENTIDADE, GUIDCONTARECEBER, GUIDRECEBIMENTO, TIPO, NOMEARQUIVO, CAMINHOARQUIVO, TAMANHOARQUIVO, USUARIOCADASTRO)
      VALUES
        (@guidanexo, @guidentidade, @guidcontareceber, @guidrecebimento, @tipo, @nomearquivo, @caminhoarquivo, @tamanhoarquivo, @usuariocadastro)
    `);
}

export async function excluirArquivoSeLocal(caminho: string | null | undefined) {
  if (!caminho?.startsWith("/uploads/financeiro-anexos/")) return;
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  const resolved = path.resolve(process.cwd(), caminho.replace(/^\//, ""));
  if (!resolved.startsWith(uploadRoot)) return;
  await fs.promises.unlink(resolved).catch(() => undefined);
}

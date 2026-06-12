import type { ConnectionPool } from "mssql";
import crypto from "crypto";
import { sql } from "../../sqlserver";
import type { BoletoBanco } from "./BoletoProvider";

export type BoletoProviderConfig = {
  banco: BoletoBanco;
  ambiente: "HOMOLOGACAO" | "PRODUCAO";
  clientId: string | null;
  clientSecret: string | null;
  apiUrl: string | null;
  tokenUrl: string | null;
  emitirPath: string | null;
  consultarPath: string | null;
  cancelarPath: string | null;
  carteira: string | null;
  convenio: string | null;
};

const BOLETO_COLUMNS = [
  ["BOLETOATIVO", "BIT NULL"],
  ["BOLETOBANCO", "NVARCHAR(20) NULL"],
  ["BOLETOAMBIENTE", "NVARCHAR(20) NULL"],
  ["BOLETOCLIENTID", "NVARCHAR(200) NULL"],
  ["BOLETOCLIENTSECRET", "NVARCHAR(MAX) NULL"],
  ["BOLETOAPIURL", "NVARCHAR(300) NULL"],
  ["BOLETOTOKENURL", "NVARCHAR(300) NULL"],
  ["BOLETOEMITIRPATH", "NVARCHAR(300) NULL"],
  ["BOLETOCONSULTARPATH", "NVARCHAR(300) NULL"],
  ["BOLETOCANCELARPATH", "NVARCHAR(300) NULL"],
  ["BOLETOCARTEIRA", "NVARCHAR(50) NULL"],
  ["BOLETOCONVENIO", "NVARCHAR(80) NULL"],
] as const;

export async function garantirCamposBoletoContaBancaria(pool: ConnectionPool) {
  for (const [column, definition] of BOLETO_COLUMNS) {
    await pool.request()
      .input("columnName", sql.NVarChar(128), column)
      .query(`
        IF COL_LENGTH('KS0003.KS00008', @columnName) IS NULL
          ALTER TABLE KS0003.KS00008 ADD ${column} ${definition}
      `);
  }
}

export async function getBoletoConfig(
  pool: ConnectionPool,
  guidEntidade: string,
  banco: BoletoBanco
): Promise<BoletoProviderConfig | null> {
  await garantirCamposBoletoContaBancaria(pool);
  const r = await pool.request()
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .input("banco", sql.NVarChar(20), banco)
    .query(`
      SELECT TOP 1
        BOLETOBANCO, BOLETOAMBIENTE, BOLETOCLIENTID, BOLETOCLIENTSECRET,
        BOLETOAPIURL, BOLETOTOKENURL, BOLETOEMITIRPATH, BOLETOCONSULTARPATH,
        BOLETOCANCELARPATH, BOLETOCARTEIRA, BOLETOCONVENIO
      FROM KS0003.KS00008
      WHERE GUIDENTIDADE=@guidentidade
        AND SITUACAO='A'
        AND ISNULL(BOLETOATIVO, 0)=1
        AND BOLETOBANCO=@banco
      ORDER BY CODCONTA
    `);
  const row = r.recordset[0] as Record<string, string | null> | undefined;
  if (!row) return null;
  return {
    banco,
    ambiente: row.BOLETOAMBIENTE === "PRODUCAO" ? "PRODUCAO" : "HOMOLOGACAO",
    clientId: row.BOLETOCLIENTID ?? null,
    clientSecret: decryptSecret(row.BOLETOCLIENTSECRET ?? null),
    apiUrl: row.BOLETOAPIURL ?? null,
    tokenUrl: row.BOLETOTOKENURL ?? null,
    emitirPath: row.BOLETOEMITIRPATH ?? null,
    consultarPath: row.BOLETOCONSULTARPATH ?? null,
    cancelarPath: row.BOLETOCANCELARPATH ?? null,
    carteira: row.BOLETOCARTEIRA ?? null,
    convenio: row.BOLETOCONVENIO ?? null,
  };
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const key = getSecretKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value: string | null) {
  if (!value?.startsWith("enc:v1:")) return value;
  const key = getSecretKey();
  if (!key) return null;
  const [, , ivB64, tagB64, encryptedB64] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getSecretKey() {
  const secret = process.env.BOLETO_CONFIG_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

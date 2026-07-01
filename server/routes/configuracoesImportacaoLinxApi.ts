import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";
import { getSqlPool, sql } from "../sqlserver";

const MAX_XML_BYTES = 20 * 1024 * 1024;
const PRODUTOS_TABLE = "KS0000.KS00009";
const XML_FIELD_MAP = {
  codigoBarras: "ProdCodEan",
  descricao: "ProdDsc",
  ncm: "NcmCodSubItem",
  precoVenda: "PrEsPreVnd",
  precoCusto: "PrEsCustoMed",
  unidade: "UnidDsc",
  cest: "NcmCESTCod",
  codigoSped: "PrEsCodSPED",
  grupoCategoria: "EstruMerca",
} as const;

type MultipartPart =
  | { kind: "field"; name: string; value: string }
  | { kind: "file"; name: string; filename: string; contentType: string; buffer: Buffer };

type LinxProduto = {
  codigoBarras: string;
  descricao: string;
  ncm: string;
  precoVenda: number;
  precoCusto: number;
  unidade: string;
  cest: string;
  codigoSped: string;
  grupoCategoria: string;
};

type ImportacaoLog = {
  codigo: string;
  descricao: string;
  descricaoOriginal?: string;
  descricaoGravada?: string;
  acao: "INSERIDO" | "ATUALIZADO" | "IGNORADO" | "ERRO";
  mensagem: string;
};

type ImportacaoResult = {
  sucesso: boolean;
  mensagem: string;
  totalEncontrados: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  ajustados: number;
  logs: ImportacaoLog[];
};

type ImportacaoProgress = {
  tipo: "inicio" | "progresso" | "fim";
  totalEncontrados: number;
  processado: number;
  percentual: number;
  produtoAtual: string;
  codigoAtual: string;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  ajustados: number;
  log?: ImportacaoLog;
  resultado?: ImportacaoResult;
};

type ImportacaoProgressCallback = (progress: ImportacaoProgress) => void;

type ProdutoColumnFlags = {
  sincronizado: boolean;
  ncm: boolean;
  cest: boolean;
  unidade: boolean;
  precoCusto: boolean;
  codBarras: boolean;
  referencia: boolean;
  erpCode: boolean;
  categoriaTexto: string | null;
  stringLimits: Record<string, number | null>;
};

function emptyErrorResponse(mensagem: string) {
  return {
    sucesso: false,
    mensagem,
    totalEncontrados: 0,
    inseridos: 0,
    atualizados: 0,
    ignorados: 0,
    erros: 1,
    ajustados: 0,
    logs: [],
  };
}

function limitarTexto(valor: unknown, tamanho: number | null | undefined): string {
  const texto = valor === null || valor === undefined ? "" : String(valor).trim();
  if (!tamanho || tamanho < 0) return texto;
  return texto.substring(0, tamanho);
}

function somenteNumeros(valor: unknown) {
  return limitarTexto(valor, null).replace(/\D/g, "");
}

function stringLimit(flags: ProdutoColumnFlags, column: string) {
  return flags.stringLimits[column.toUpperCase()] ?? null;
}

function sqlStringType(column: string, flags: ProdutoColumnFlags, fallback = sql.NVarChar(sql.MAX)) {
  const limit = stringLimit(flags, column);
  if (!limit || limit < 0) return fallback;
  return sql.NVarChar(limit);
}

function prepararProduto(produto: LinxProduto, flags: ProdutoColumnFlags) {
  const original = {
    codigoBarras: produto.codigoBarras,
    descricao: produto.descricao,
    ncm: produto.ncm,
    cest: produto.cest,
    unidade: produto.unidade,
    codigoSped: produto.codigoSped,
    grupoCategoria: produto.grupoCategoria,
  };

  const preparado: LinxProduto = {
    ...produto,
    codigoBarras: limitarTexto(somenteNumeros(produto.codigoBarras), stringLimit(flags, "CODBARRAS")),
    descricao: limitarTexto(produto.descricao, stringLimit(flags, "PRODUTO")),
    ncm: limitarTexto(somenteNumeros(produto.ncm), stringLimit(flags, "NCM")),
    cest: limitarTexto(somenteNumeros(produto.cest), stringLimit(flags, "CEST")),
    unidade: limitarTexto(produto.unidade, stringLimit(flags, "UNIDADE")),
    codigoSped: limitarTexto(produto.codigoSped, Math.min(
      ...[
        stringLimit(flags, "ERPCODE"),
        stringLimit(flags, "REFERENCIA"),
      ].filter((value): value is number => typeof value === "number" && value > 0),
      Number.MAX_SAFE_INTEGER,
    )),
    grupoCategoria: limitarTexto(produto.grupoCategoria, flags.categoriaTexto ? stringLimit(flags, flags.categoriaTexto) : null),
  };

  const descricaoBanco = limitarTexto(produto.descricao, stringLimit(flags, "DESCRICAO"));
  const camposAjustados = [
    preparado.codigoBarras !== original.codigoBarras.trim() ? "CODBARRAS" : null,
    preparado.descricao !== original.descricao.trim() ? "PRODUTO" : null,
    descricaoBanco !== original.descricao.trim() ? "DESCRICAO" : null,
    preparado.ncm !== original.ncm.trim() ? "NCM" : null,
    preparado.cest !== original.cest.trim() ? "CEST" : null,
    preparado.unidade !== original.unidade.trim() ? "UNIDADE" : null,
    preparado.codigoSped !== original.codigoSped.trim() ? "CODIGO AUXILIAR/SPED" : null,
    preparado.grupoCategoria !== original.grupoCategoria.trim() ? "GRUPO/CATEGORIA" : null,
  ].filter(Boolean) as string[];

  return {
    produto: preparado,
    ajustado: camposAjustados.length > 0,
    camposAjustados,
    descricaoOriginal: original.descricao,
    descricaoGravada: preparado.descricao,
  };
}

function isValidGuid(value: string | null | undefined) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

function sendProgress(res: Response, progress: ImportacaoProgress) {
  res.write(`${JSON.stringify(progress)}\n`);
}

function getBoundary(contentType: string | undefined) {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const boundaryText = `--${boundary}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(boundaryText);
  const parsed: MultipartPart[] = [];

  for (const part of parts) {
    if (!part.includes("Content-Disposition")) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    let dataText = part.slice(headerEnd + 4);
    if (dataText.endsWith("\r\n")) dataText = dataText.slice(0, -2);
    if (dataText.endsWith("--")) dataText = dataText.slice(0, -2);

    const name = headers.match(/name="([^"]+)"/i)?.[1] ?? "";
    const filename = headers.match(/filename="([^"]*)"/i)?.[1];
    if (!filename) {
      parsed.push({ kind: "field", name, value: Buffer.from(dataText, "latin1").toString("utf8") });
      continue;
    }

    parsed.push({
      kind: "file",
      name,
      filename,
      contentType: headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() ?? "",
      buffer: Buffer.from(dataText, "latin1"),
    });
  }

  return parsed;
}

async function readRequestBody(req: Request, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(new Error("Arquivo XML maior que o limite permitido."));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

async function getKsSession(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return verifyKsSession(match?.[1]);
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function normalizeText(value: string | undefined) {
  return decodeXml(stripTags(value ?? "")).trim();
}

function getAttribute(tag: string, attribute: string) {
  return tag.match(new RegExp(`${attribute}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? "";
}

function fieldNameToKey(fieldName: string) {
  const clean = fieldName.replace(/[{}]/g, "");
  return clean.includes(".") ? clean.split(".").pop() ?? clean : clean;
}

function parseMoney(value: string) {
  const text = value.trim();
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTagContent(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<[^:>]*:?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${tagName}>`, "i"));
  return match?.[1] ?? "";
}

function parseCrystalFields(groupXml: string) {
  const groupHeader = getTagContent(groupXml, "GroupHeader");
  const fields = new Map<string, string>();
  const fieldRegex = /<([^:\s>]+:)?Field\b([^>]*)>([\s\S]*?)<\/([^:\s>]+:)?Field>/gi;
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(groupHeader))) {
    const attrs = match[2] ?? "";
    const body = match[3] ?? "";
    const fieldName = fieldNameToKey(getAttribute(attrs, "FieldName"));
    const name = getAttribute(attrs, "Name").replace(/\d+$/, "");
    const value = normalizeText(getTagContent(body, "Value")) || normalizeText(getTagContent(body, "FormattedValue"));

    if (fieldName) fields.set(fieldName.toLowerCase(), value);
    if (name) fields.set(name.toLowerCase(), value);
  }

  return fields;
}

function fieldValue(fields: Map<string, string>, xmlField: string) {
  return fields.get(xmlField.toLowerCase()) ?? "";
}

function parseProdutosCrystalXml(xml: string) {
  const produtos: LinxProduto[] = [];
  const groupRegex = /<([^:\s>]+:)?Group\b[^>]*>([\s\S]*?)<\/([^:\s>]+:)?Group>/gi;
  let match: RegExpExecArray | null;

  while ((match = groupRegex.exec(xml))) {
    const fields = parseCrystalFields(match[0]);
    const codigoSped = fieldValue(fields, XML_FIELD_MAP.codigoSped);

    produtos.push({
      codigoBarras: fieldValue(fields, XML_FIELD_MAP.codigoBarras).trim(),
      descricao: fieldValue(fields, XML_FIELD_MAP.descricao).trim(),
      ncm: fieldValue(fields, XML_FIELD_MAP.ncm).trim(),
      precoVenda: parseMoney(fieldValue(fields, XML_FIELD_MAP.precoVenda)),
      precoCusto: parseMoney(fieldValue(fields, XML_FIELD_MAP.precoCusto)),
      unidade: fieldValue(fields, XML_FIELD_MAP.unidade).trim(),
      cest: fieldValue(fields, XML_FIELD_MAP.cest).trim(),
      codigoSped: codigoSped.trim(),
      grupoCategoria: fieldValue(fields, XML_FIELD_MAP.grupoCategoria).trim(),
    });
  }

  return produtos;
}

async function getProdutoColumnFlags() {
  const pool = await getSqlPool();
  const result = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'KS0000' AND TABLE_NAME = 'KS00009'
  `);
  const columns = new Set(result.recordset.map((row) => String(row.COLUMN_NAME).toUpperCase()));
  const stringLimits = Object.fromEntries(
    result.recordset
      .filter((row) => ["char", "varchar", "nchar", "nvarchar"].includes(String(row.DATA_TYPE).toLowerCase()))
      .map((row) => [String(row.COLUMN_NAME).toUpperCase(), Number(row.CHARACTER_MAXIMUM_LENGTH)])
  ) as Record<string, number | null>;
  const categoriaCandidates = ["ESTRUMERCA", "GRUPOCATEGORIA", "CATEGORIATEXTO", "GRUPO", "CATEGORIA"];

  return {
    sincronizado: columns.has("SINCRONIZADO"),
    ncm: columns.has("NCM"),
    cest: columns.has("CEST"),
    unidade: columns.has("UNIDADE"),
    precoCusto: columns.has("PRECOCUSTO"),
    codBarras: columns.has("CODBARRAS"),
    referencia: columns.has("REFERENCIA"),
    erpCode: columns.has("ERPCODE"),
    categoriaTexto: categoriaCandidates.find((column) => columns.has(column)) ?? null,
    stringLimits,
  } satisfies ProdutoColumnFlags;
}

async function ensureImportacaoLinxIndexes(flags: ProdutoColumnFlags) {
  const pool = await getSqlPool();
  const indexSpecs = [
    flags.codBarras ? { name: "IX_KS00009_IMPORT_LINX_CODBARRAS", columns: "GUIDENTIDADE, CODBARRAS" } : null,
    flags.erpCode ? { name: "IX_KS00009_IMPORT_LINX_ERPCODE", columns: "GUIDENTIDADE, ERPCODE" } : null,
    flags.referencia ? { name: "IX_KS00009_IMPORT_LINX_REFERENCIA", columns: "GUIDENTIDADE, REFERENCIA" } : null,
    { name: "IX_KS00009_IMPORT_LINX_PRODUTO", columns: "GUIDENTIDADE, PRODUTO" },
  ].filter(Boolean) as Array<{ name: string; columns: string }>;

  for (const spec of indexSpecs) {
    await pool.request()
      .input("indexName", sql.NVarChar(128), spec.name)
      .query(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = @indexName
            AND object_id = OBJECT_ID('${PRODUTOS_TABLE}')
        )
        BEGIN
          CREATE INDEX ${spec.name} ON ${PRODUTOS_TABLE} (${spec.columns});
        END
      `);
  }
}

function addProdutoParams(
  request: ReturnType<Awaited<ReturnType<typeof getSqlPool>>["request"]>,
  produto: LinxProduto,
  guidEntidade: string,
  flags: ProdutoColumnFlags,
) {
  return request
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("produto", sqlStringType("PRODUTO", flags, sql.NVarChar(255)), limitarTexto(produto.descricao, stringLimit(flags, "PRODUTO")))
    .input("descricao", sqlStringType("DESCRICAO", flags), limitarTexto(produto.descricao, stringLimit(flags, "DESCRICAO")) || null)
    .input("codigoBarras", sqlStringType("CODBARRAS", flags, sql.NVarChar(50)), limitarTexto(produto.codigoBarras, stringLimit(flags, "CODBARRAS")) || null)
    .input("codigoSped", sqlStringType(flags.erpCode ? "ERPCODE" : "REFERENCIA", flags, sql.NVarChar(100)), limitarTexto(produto.codigoSped, stringLimit(flags, flags.erpCode ? "ERPCODE" : "REFERENCIA")) || null)
    .input("ncm", sqlStringType("NCM", flags, sql.NVarChar(10)), limitarTexto(produto.ncm, stringLimit(flags, "NCM")) || null)
    .input("cest", sqlStringType("CEST", flags, sql.NVarChar(10)), limitarTexto(produto.cest, stringLimit(flags, "CEST")) || null)
    .input("unidade", sqlStringType("UNIDADE", flags, sql.NVarChar(20)), limitarTexto(produto.unidade, stringLimit(flags, "UNIDADE")) || null)
    .input("precoVenda", sql.Decimal(15, 4), produto.precoVenda)
    .input("precoCusto", sql.Decimal(15, 4), produto.precoCusto)
    .input("grupoCategoria", flags.categoriaTexto ? sqlStringType(flags.categoriaTexto, flags, sql.NVarChar(150)) : sql.NVarChar(150), limitarTexto(produto.grupoCategoria, flags.categoriaTexto ? stringLimit(flags, flags.categoriaTexto) : null) || null);
}

async function proximoCodProduto(request: ReturnType<Awaited<ReturnType<typeof getSqlPool>>["request"]>) {
  const result = await request.query("SELECT ISNULL(MAX(CODPRODUTO), 0) + 1 AS CODPRODUTO FROM KS0000.KS00009 WITH (UPDLOCK, HOLDLOCK)");
  return Number(result.recordset[0]?.CODPRODUTO ?? 1);
}

function buildBuscaProdutoSql(flags: ProdutoColumnFlags) {
  const filters = [
    flags.codBarras ? "(@codigoBarras IS NOT NULL AND CODBARRAS = @codigoBarras)" : null,
    flags.erpCode ? "(@codigoSped IS NOT NULL AND ERPCODE = @codigoSped)" : null,
    flags.referencia ? "(@codigoSped IS NOT NULL AND REFERENCIA = @codigoSped)" : null,
    "PRODUTO = @produto",
  ].filter(Boolean);

  return `
    SELECT TOP 1 CAST(GUIDPRODUTO AS NVARCHAR(36)) AS GUIDPRODUTO
    FROM ${PRODUTOS_TABLE} WITH (UPDLOCK, HOLDLOCK)
    WHERE GUIDENTIDADE = @guidEntidade AND (${filters.join(" OR ")})
  `;
}

function buildUpdateSql(flags: ProdutoColumnFlags) {
  const sets = [
    "PRODUTO = @produto",
    "DESCRICAO = @descricao",
    "PRECOVENDA = @precoVenda",
    flags.precoCusto ? "PRECOCUSTO = @precoCusto" : null,
    flags.ncm ? "NCM = @ncm" : null,
    flags.cest ? "CEST = @cest" : null,
    flags.unidade ? "UNIDADE = @unidade" : null,
    flags.codBarras ? "CODBARRAS = @codigoBarras" : null,
    flags.referencia ? "REFERENCIA = @codigoSped" : null,
    flags.erpCode ? "ERPCODE = @codigoSped" : null,
    flags.categoriaTexto ? `${flags.categoriaTexto} = @grupoCategoria` : null,
    flags.sincronizado ? "SINCRONIZADO = 0" : null,
    "ULTIMAALTERACAO = GETDATE()",
  ].filter(Boolean);

  return `
    UPDATE ${PRODUTOS_TABLE}
    SET ${sets.join(", ")}
    WHERE GUIDPRODUTO = @guidProduto AND GUIDENTIDADE = @guidEntidade
  `;
}

function buildInsertSql(flags: ProdutoColumnFlags) {
  const columns = [
    "CODPRODUTO",
    "GUIDPRODUTO",
    "GUIDENTIDADE",
    "PRODUTO",
    "DESCRICAO",
    "PRECO",
    "PRECOVENDA",
    flags.precoCusto ? "PRECOCUSTO" : null,
    flags.ncm ? "NCM" : null,
    flags.cest ? "CEST" : null,
    flags.unidade ? "UNIDADE" : null,
    flags.codBarras ? "CODBARRAS" : null,
    flags.referencia ? "REFERENCIA" : null,
    flags.erpCode ? "ERPCODE" : null,
    flags.categoriaTexto,
    "ESTOQUE",
    "ESTOQUEMINIMO",
    "ORIGEMPRODUTO",
    "DESTAQUE",
    "ORDEMEXIBICAO",
    "SITUACAO",
    flags.sincronizado ? "SINCRONIZADO" : null,
    "DATACADASTRO",
    "ULTIMAALTERACAO",
  ].filter(Boolean);

  const values = [
    "@codProduto",
    "@guidProduto",
    "@guidEntidade",
    "@produto",
    "@descricao",
    "0",
    "@precoVenda",
    flags.precoCusto ? "@precoCusto" : null,
    flags.ncm ? "@ncm" : null,
    flags.cest ? "@cest" : null,
    flags.unidade ? "@unidade" : null,
    flags.codBarras ? "@codigoBarras" : null,
    flags.referencia ? "@codigoSped" : null,
    flags.erpCode ? "@codigoSped" : null,
    flags.categoriaTexto ? "@grupoCategoria" : null,
    "0",
    "0",
    "0",
    "0",
    "0",
    "'A'",
    flags.sincronizado ? "0" : null,
    "GETDATE()",
    "GETDATE()",
  ].filter(Boolean);

  return `
    INSERT INTO ${PRODUTOS_TABLE} (${columns.join(", ")})
    VALUES (${values.join(", ")})
  `;
}

export async function importarProdutosLinx(xml: string, guidEntidade: string, onProgress?: ImportacaoProgressCallback) {
  const pool = await getSqlPool();
  const produtos = parseProdutosCrystalXml(xml);
  const flags = await getProdutoColumnFlags();
  await ensureImportacaoLinxIndexes(flags);
  const logs: ImportacaoLog[] = [];
  let inseridos = 0;
  let atualizados = 0;
  let ignorados = 0;
  let erros = 0;
  let ajustados = 0;
  let processado = 0;
  const totalEncontrados = produtos.length;

  const progressBase = () => ({
    totalEncontrados,
    processado,
    percentual: totalEncontrados ? Math.round((processado / totalEncontrados) * 100) : 100,
    inseridos,
    atualizados,
    ignorados,
    erros,
    ajustados,
  });

  onProgress?.({
    tipo: "inicio",
    ...progressBase(),
    produtoAtual: "",
    codigoAtual: "",
  });

  if (!totalEncontrados) {
    const resultado = {
      sucesso: false,
      mensagem: "Nenhum produto encontrado no XML.",
      totalEncontrados,
      inseridos,
      atualizados,
      ignorados,
      erros,
      ajustados,
      logs,
    };
    onProgress?.({
      tipo: "fim",
      ...progressBase(),
      percentual: 100,
      produtoAtual: "",
      codigoAtual: "",
      resultado,
    });
    return resultado;
  }

  for (const produto of produtos) {
    let log: ImportacaoLog | undefined;
    const preparado = prepararProduto(produto, flags);
    const produtoBanco = preparado.produto;
    const codigoLog = produtoBanco.codigoBarras || produtoBanco.codigoSped;

    if (!produtoBanco.codigoBarras && !produtoBanco.codigoSped) {
      ignorados += 1;
      log = { codigo: "", descricao: produto.descricao, descricaoOriginal: produto.descricao, descricaoGravada: produtoBanco.descricao, acao: "IGNORADO", mensagem: "Produto sem codigo de barras e sem codigo SPED." };
      logs.push(log);
    } else if (!produtoBanco.descricao) {
      ignorados += 1;
      log = { codigo: produtoBanco.codigoBarras, descricao: "", descricaoOriginal: produto.descricao, descricaoGravada: "", acao: "IGNORADO", mensagem: "Produto sem descricao." };
      logs.push(log);
    } else {
      const transaction = new sql.Transaction(pool);
      try {
        await transaction.begin();
        const existing = await addProdutoParams(new sql.Request(transaction), produtoBanco, guidEntidade, flags)
          .query(buildBuscaProdutoSql(flags));
        const guidProduto = existing.recordset[0]?.GUIDPRODUTO as string | undefined;

        if (guidProduto) {
          await addProdutoParams(new sql.Request(transaction), produtoBanco, guidEntidade, flags)
            .input("guidProduto", sql.UniqueIdentifier, guidProduto)
            .query(buildUpdateSql(flags));
          await transaction.commit();
          atualizados += 1;
          if (preparado.ajustado) ajustados += 1;
          log = {
            codigo: codigoLog,
            descricao: produto.descricao,
            descricaoOriginal: preparado.descricaoOriginal,
            descricaoGravada: preparado.descricaoGravada,
            acao: "ATUALIZADO",
            mensagem: preparado.ajustado ? `Texto ajustado ao tamanho do campo (${preparado.camposAjustados.join(", ")})` : "Produto atualizado.",
          };
          logs.push(log);
        } else {
          const codProduto = await proximoCodProduto(new sql.Request(transaction));
          await addProdutoParams(new sql.Request(transaction), produtoBanco, guidEntidade, flags)
            .input("codProduto", sql.Int, codProduto)
            .input("guidProduto", sql.UniqueIdentifier, crypto.randomUUID())
            .query(buildInsertSql(flags));
          await transaction.commit();
          inseridos += 1;
          if (preparado.ajustado) ajustados += 1;
          log = {
            codigo: codigoLog,
            descricao: produto.descricao,
            descricaoOriginal: preparado.descricaoOriginal,
            descricaoGravada: preparado.descricaoGravada,
            acao: "INSERIDO",
            mensagem: preparado.ajustado ? `Texto ajustado ao tamanho do campo (${preparado.camposAjustados.join(", ")})` : "Produto inserido.",
          };
          logs.push(log);
        }
      } catch (error) {
        try {
          await transaction.rollback();
        } catch {
          // A transacao pode ja ter sido encerrada pelo driver em alguns erros.
        }
        erros += 1;
        log = {
          codigo: codigoLog,
          descricao: produto.descricao,
          descricaoOriginal: produto.descricao,
          descricaoGravada: produtoBanco.descricao,
          acao: "ERRO",
          mensagem: error instanceof Error ? error.message : "Erro ao importar produto.",
        };
        logs.push(log);
      }
    }

    processado += 1;
    onProgress?.({
      tipo: "progresso",
      ...progressBase(),
      produtoAtual: produtoBanco.descricao,
      codigoAtual: codigoLog,
      log,
    });
  }

  const resultado = {
    sucesso: erros === 0,
    mensagem: erros > 0 ? "Importacao finalizada com erros em alguns produtos." : "Importacao finalizada.",
    totalEncontrados,
    inseridos,
    atualizados,
    ignorados,
    erros,
    ajustados,
    logs,
  };
  onProgress?.({
    tipo: "fim",
    ...progressBase(),
    percentual: 100,
    produtoAtual: "",
    codigoAtual: "",
    resultado,
  });
  return resultado;
}

export function registerConfiguracoesImportacaoLinxApiRoutes(app: Express) {
  app.post("/api/configuracoes/importacao-linx/produtos", async (req: Request, res: Response) => {
    try {
      const session = await getKsSession(req);
      if (!session) return res.status(401).json(emptyErrorResponse("Sessao invalida."));
      if (!isValidGuid(session.guidEntidade)) return res.status(400).json(emptyErrorResponse("Empresa logada sem GUIDENTIDADE valido."));

      const boundary = getBoundary(req.headers["content-type"]);
      if (!boundary) return res.status(400).json(emptyErrorResponse("Upload multipart invalido."));

      const body = await readRequestBody(req, MAX_XML_BYTES);
      const parts = parseMultipart(body, boundary);
      const guidEntidadeInput = parts.find((part): part is Extract<MultipartPart, { kind: "field" }> => part.kind === "field" && part.name === "guidEntidade")?.value?.trim();
      const file = parts.find((part): part is Extract<MultipartPart, { kind: "file" }> => part.kind === "file" && part.name === "arquivo")
        ?? parts.find((part): part is Extract<MultipartPart, { kind: "file" }> => part.kind === "file");

      if (!guidEntidadeInput) {
        return res.status(400).json(emptyErrorResponse("GUIDENTIDADE da empresa logada nao enviado."));
      }
      if (guidEntidadeInput && guidEntidadeInput.toLowerCase() !== session.guidEntidade.toLowerCase()) {
        return res.status(403).json(emptyErrorResponse("Nao e permitido importar produtos em empresa diferente da empresa logada."));
      }
      if (!file) return res.status(400).json(emptyErrorResponse("Arquivo XML nao enviado."));
      if (!file.filename.toLowerCase().endsWith(".xml")) {
        return res.status(415).json(emptyErrorResponse("Envie um arquivo .xml."));
      }
      if (!file.buffer.length) return res.status(400).json(emptyErrorResponse("Arquivo XML vazio."));

      const xml = file.buffer.toString("utf8");
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      await importarProdutosLinx(xml, session.guidEntidade, (progress) => sendProgress(res, progress));
      return res.end();
    } catch (error) {
      console.error("Erro na importacao Linx:", error);
      if (!res.headersSent) {
        return res.status(500).json({
          ...emptyErrorResponse(error instanceof Error ? error.message : "Erro interno na importacao."),
        });
      }
      sendProgress(res, {
        tipo: "fim",
        totalEncontrados: 0,
        processado: 0,
        percentual: 100,
        produtoAtual: "",
        codigoAtual: "",
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        erros: 1,
        ajustados: 0,
        resultado: emptyErrorResponse(error instanceof Error ? error.message : "Erro interno na importacao."),
      });
      return res.end();
    }
  });
}

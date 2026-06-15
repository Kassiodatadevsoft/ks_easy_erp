import express, { type Express, type Request, type Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";
import {
  FINANCEIRO_ANEXOS_ALLOWED,
  FINANCEIRO_ANEXOS_MAX_BYTES,
  isGuid,
  registrarFinanceiroAnexo,
  sanitizeFileName,
  type FinanceiroAnexoTipo,
} from "../services/financeiroAnexos";
import { getSqlPool, sql } from "../sqlserver";

type MultipartPart =
  | { kind: "field"; name: string; value: string }
  | { kind: "file"; name: string; filename: string; contentType: string; buffer: Buffer };

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

async function getKsSession(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return verifyKsSession(match?.[1]);
}

async function validarTituloEmpresa(guidContaReceber: string, guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidlancamento", sql.UniqueIdentifier, guidContaReceber)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query("SELECT TOP 1 1 AS ok FROM KS0003.KS00005 WHERE GUIDLANCAMENTO=@guidlancamento AND GUIDENTIDADE=@guidentidade");
  return !!r.recordset[0];
}

export function registerFinanceiroAnexosApiRoutes(app: Express) {
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  const anexosDir = path.join(uploadRoot, "financeiro-anexos");

  app.use("/uploads", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/uploads", express.static(uploadRoot, { fallthrough: true }));

  app.get("/api/financeiro/anexos/:guidAnexo/download", async (req: Request, res: Response) => {
    try {
      const session = await getKsSession(req);
      if (!session) return res.status(401).json({ message: "Sessao invalida." });
      const guidAnexo = req.params.guidAnexo;
      if (!isGuid(guidAnexo)) return res.status(400).json({ message: "Anexo invalido." });

      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidanexo", sql.Char(36), guidAnexo)
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .query(`
          SELECT TOP 1 NOMEARQUIVO, CAMINHOARQUIVO
          FROM FINANCEIROANEXOS
          WHERE GUIDANEXO=@guidanexo AND GUIDENTIDADE=@guidentidade
        `);
      const anexo = r.recordset[0];
      if (!anexo?.CAMINHOARQUIVO) return res.status(404).json({ message: "Anexo nao encontrado." });

      const relative = String(anexo.CAMINHOARQUIVO).replace(/^\/uploads\//, "");
      const target = path.resolve(uploadRoot, relative);
      if (target !== uploadRoot && !target.startsWith(`${uploadRoot}${path.sep}`)) return res.status(403).json({ message: "Caminho de anexo invalido." });

      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.query.download === "1") return res.download(target, String(anexo.NOMEARQUIVO ?? "anexo"));
      return res.sendFile(target);
    } catch (error) {
      console.error("Erro ao baixar anexo financeiro:", error);
      if (!res.headersSent) res.status(500).json({ message: "Erro ao baixar anexo." });
    }
  });

  app.post("/api/financeiro/anexos/upload", async (req: Request, res: Response) => {
    try {
      const session = await getKsSession(req);
      if (!session) return res.status(401).json({ message: "Sessao invalida." });

      const boundary = getBoundary(req.headers["content-type"]);
      if (!boundary) return res.status(400).json({ message: "Upload multipart invalido." });

      const chunks: Buffer[] = [];
      let total = 0;
      let tooLarge = false;
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > FINANCEIRO_ANEXOS_MAX_BYTES * 10) {
          tooLarge = true;
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", async () => {
        if (res.headersSent) return;
        if (tooLarge) return res.status(413).json({ message: "Upload excede o tamanho maximo permitido." });

        const parts = parseMultipart(Buffer.concat(chunks), boundary);
        const fields = new Map(parts.filter((p): p is Extract<MultipartPart, { kind: "field" }> => p.kind === "field").map((p) => [p.name, p.value]));
        const files = parts.filter((p): p is Extract<MultipartPart, { kind: "file" }> => p.kind === "file");
        const guidContaReceber = fields.get("guidContaReceber") ?? "";
        const guidRecebimento = fields.get("guidRecebimento") || null;
        const tipo = (fields.get("tipo") ?? "LANCAMENTO").toUpperCase() as FinanceiroAnexoTipo;

        if (!isGuid(guidContaReceber)) return res.status(400).json({ message: "Titulo invalido." });
        if (guidRecebimento && !isGuid(guidRecebimento)) return res.status(400).json({ message: "Recebimento invalido." });
        if (!["LANCAMENTO", "RECEBIMENTO"].includes(tipo)) return res.status(400).json({ message: "Tipo de anexo invalido." });
        if (!files.length) return res.status(400).json({ message: "Nenhum arquivo enviado." });
        if (!(await validarTituloEmpresa(guidContaReceber, session.guidEntidade))) {
          return res.status(403).json({ message: "Titulo nao pertence a empresa logada." });
        }

        await fs.promises.mkdir(anexosDir, { recursive: true });
        const anexos = [];
        for (const file of files) {
          const allowed = FINANCEIRO_ANEXOS_ALLOWED[file.contentType];
          if (!allowed) return res.status(415).json({ message: "Arquivos permitidos: JPG, JPEG, PNG, WEBP e PDF." });
          if (!file.buffer.length) return res.status(400).json({ message: "Arquivo vazio." });
          if (file.buffer.length > FINANCEIRO_ANEXOS_MAX_BYTES) return res.status(413).json({ message: "Arquivo maior que o limite configurado." });

          const nomeOriginal = sanitizeFileName(file.filename);
          const extOriginal = path.extname(nomeOriginal).replace(".", "").toLowerCase();
          if (!["jpg", "jpeg", "png", "webp", "pdf"].includes(extOriginal)) {
            return res.status(415).json({ message: "Extensao de arquivo nao permitida." });
          }

          const guidAnexo = crypto.randomUUID();
          const safeName = `${guidContaReceber}_${guidAnexo}.${allowed.ext}`;
          const target = path.join(anexosDir, safeName);
          await fs.promises.writeFile(target, file.buffer, { flag: "wx" });
          const caminho = `/uploads/financeiro-anexos/${safeName}`;

          await registrarFinanceiroAnexo({
            guidAnexo,
            guidEntidade: session.guidEntidade,
            guidContaReceber,
            guidRecebimento,
            tipo,
            nomeArquivo: nomeOriginal,
            caminhoArquivo: caminho,
            tamanhoArquivo: file.buffer.length,
            usuarioCadastro: session.nome ?? session.usuario ?? session.email ?? null,
          });

          anexos.push({ GUIDANEXO: guidAnexo, nomeArquivo: nomeOriginal, caminho, tamanho: file.buffer.length });
        }

        return res.json({ anexos });
      });

      req.on("error", () => {
        if (!res.headersSent) res.status(400).json({ message: "Falha ao receber arquivo." });
      });
    } catch (error) {
      console.error("Erro no upload de anexos financeiros:", error);
      if (!res.headersSent) res.status(500).json({ message: "Erro ao salvar anexo." });
    }
  });
}

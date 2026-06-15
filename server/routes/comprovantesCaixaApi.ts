import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function getBoundary(contentType: string | undefined) {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] ?? match?.[2] ?? null;
}

function parseMultipartImage(body: Buffer, boundary: string) {
  const boundaryText = `--${boundary}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(boundaryText);

  for (const part of parts) {
    if (!part.includes("Content-Disposition") || !part.includes("filename=")) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd);
    let dataText = part.slice(headerEnd + 4);
    if (dataText.endsWith("\r\n")) dataText = dataText.slice(0, -2);
    if (dataText.endsWith("--")) dataText = dataText.slice(0, -2);

    const filename = headers.match(/filename="([^"]*)"/i)?.[1] ?? "comprovante";
    const contentType = headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() ?? "";
    return {
      filename,
      contentType,
      buffer: Buffer.from(dataText, "latin1"),
    };
  }

  return null;
}

async function getKsSession(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return verifyKsSession(match?.[1]);
}

export function registerComprovantesCaixaApiRoutes(app: Express) {
  const uploadRoot = path.resolve(process.cwd(), "uploads");
  const comprovantesDir = path.join(uploadRoot, "comprovantes-caixa");

  app.use("/uploads", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use("/uploads", express.static(uploadRoot, { fallthrough: true }));

  app.post("/api/lancamentos-caixa/comprovante/:guidLancamento", async (req: Request, res: Response) => {
    try {
      const session = await getKsSession(req);
      if (!session) return res.status(401).json({ message: "Sessao invalida." });

      const guidLancamento = req.params.guidLancamento;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guidLancamento)) {
        return res.status(400).json({ message: "GUID do lancamento invalido." });
      }

      const boundary = getBoundary(req.headers["content-type"]);
      if (!boundary) return res.status(400).json({ message: "Upload multipart invalido." });

      const chunks: Buffer[] = [];
      let total = 0;
      let tooLarge = false;
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_FILE_SIZE) {
          tooLarge = true;
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", async () => {
        if (res.headersSent) return;
        if (tooLarge) return res.status(413).json({ message: "Imagem maior que 5MB." });
        const file = parseMultipartImage(Buffer.concat(chunks), boundary);
        if (!file) return res.status(400).json({ message: "Arquivo nao encontrado." });

        const ext = ALLOWED_TYPES[file.contentType];
        if (!ext) return res.status(415).json({ message: "Aceite somente PNG, JPG, JPEG ou WEBP." });
        if (file.buffer.length > MAX_FILE_SIZE) return res.status(413).json({ message: "Imagem maior que 5MB." });
        if (file.buffer.length === 0) return res.status(400).json({ message: "Arquivo vazio." });

        await fs.promises.mkdir(comprovantesDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        const safeName = `${guidLancamento}_${stamp}_${crypto.randomUUID()}.${ext}`;
        const target = path.join(comprovantesDir, safeName);
        await fs.promises.writeFile(target, file.buffer, { flag: "wx" });

        return res.json({
          url: `/uploads/comprovantes-caixa/${safeName}`,
          nomeOriginal: file.filename,
          contentType: file.contentType,
          tamanho: file.buffer.length,
        });
      });

      req.on("error", () => {
        if (!res.headersSent) res.status(400).json({ message: "Falha ao receber imagem." });
      });
    } catch (error) {
      console.error("Erro no upload de comprovante de caixa:", error);
      if (!res.headersSent) res.status(500).json({ message: "Erro ao salvar comprovante." });
    }
  });
}

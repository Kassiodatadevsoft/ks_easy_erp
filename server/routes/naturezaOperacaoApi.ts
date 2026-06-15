import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "../routers/ksAuthRouter";

const guidSchema = z.string().uuid();

const naturezaOperacaoSchema = z.object({
  descricao: z.string().min(1).max(100),
  tipoOperacao: z.enum(["E", "S"]),
  situacao: z.boolean().default(true),
});

function cookieValue(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

async function getSession(req: Request) {
  const session = await verifyKsSession(cookieValue(req));
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida. Faca login novamente." });
  }
  return session;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Dados invalidos.", errors: error.issues });
    return;
  }
  if (error instanceof TRPCError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Erro interno";
  res.status(500).json({ success: false, message });
}

async function ensureNaturezaOperacaoTable() {
  const pool = await getSqlPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.NATUREZA_OPERACAO', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.NATUREZA_OPERACAO (
        GUIDNATUREZAOPERACAO char(36) NOT NULL PRIMARY KEY,
        GUIDENTIDADE char(36) NOT NULL,
        DESCRICAO varchar(100) NOT NULL,
        TIPOOPERACAO char(1) NOT NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_NATUREZA_OPERACAO_ULTIMAALTERACAO DEFAULT GETDATE(),
        CONSTRAINT CK_NATUREZA_OPERACAO_TIPO CHECK (TIPOOPERACAO IN ('E','S'))
      );
    END;

    IF COL_LENGTH('dbo.NATUREZA_OPERACAO','GUIDNATUREZAOPERACAO') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name='IX_NATUREZA_OPERACAO_ENTIDADE'
          AND object_id=OBJECT_ID('dbo.NATUREZA_OPERACAO')
      )
      CREATE INDEX IX_NATUREZA_OPERACAO_ENTIDADE ON dbo.NATUREZA_OPERACAO (GUIDENTIDADE, SITUACAO, DESCRICAO);
  `);
}

const selectNaturezaOperacao = `
  SELECT
    GUIDNATUREZAOPERACAO AS guidNaturezaOperacao,
    GUIDENTIDADE AS guidEntidade,
    DESCRICAO AS descricao,
    TIPOOPERACAO AS tipoOperacao,
    SITUACAO AS situacao,
    DATACADASTRO AS dataCadastro,
    ULTIMAALTERACAO AS ultimaAlteracao
  FROM dbo.NATUREZA_OPERACAO
`;

export function registerNaturezaOperacaoApiRoutes(app: Express) {
  app.get("/api/fiscal/natureza-operacao", async (req, res) => {
    try {
      await ensureNaturezaOperacaoTable();
      const session = await getSession(req);
      const somenteAtivas = String(req.query.ativas ?? "").toLowerCase() === "true";
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .input("somenteAtivas", sql.Bit, somenteAtivas ? 1 : 0)
        .query(`
          ${selectNaturezaOperacao}
          WHERE GUIDENTIDADE=@guidentidade
            AND (@somenteAtivas=0 OR SITUACAO=1)
          ORDER BY DESCRICAO
        `);
      res.json({ dados: r.recordset });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/fiscal/natureza-operacao/:guid", async (req, res) => {
    try {
      await ensureNaturezaOperacaoTable();
      const session = await getSession(req);
      const guid = guidSchema.parse(req.params.guid);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guid", sql.Char(36), guid)
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .query(`
          ${selectNaturezaOperacao}
          WHERE GUIDNATUREZAOPERACAO=@guid AND GUIDENTIDADE=@guidentidade
        `);
      if (!r.recordset[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Natureza da operacao nao encontrada." });
      res.json({ dados: r.recordset[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/fiscal/natureza-operacao", async (req, res) => {
    try {
      await ensureNaturezaOperacaoTable();
      const session = await getSession(req);
      const input = naturezaOperacaoSchema.parse(req.body);
      const guid = crypto.randomUUID();
      const pool = await getSqlPool();
      await pool.request()
        .input("guid", sql.Char(36), guid)
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .input("descricao", sql.VarChar(100), input.descricao.trim().toUpperCase())
        .input("tipo", sql.Char(1), input.tipoOperacao)
        .input("situacao", sql.Bit, input.situacao ? 1 : 0)
        .query(`
          INSERT INTO dbo.NATUREZA_OPERACAO
            (GUIDNATUREZAOPERACAO,GUIDENTIDADE,DESCRICAO,TIPOOPERACAO,SITUACAO)
          VALUES
            (@guid,@guidentidade,@descricao,@tipo,@situacao)
        `);
      res.json({ success: true, guidNaturezaOperacao: guid });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/fiscal/natureza-operacao/:guid", async (req, res) => {
    try {
      await ensureNaturezaOperacaoTable();
      const session = await getSession(req);
      const guid = guidSchema.parse(req.params.guid);
      const input = naturezaOperacaoSchema.parse(req.body);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guid", sql.Char(36), guid)
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .input("descricao", sql.VarChar(100), input.descricao.trim().toUpperCase())
        .input("tipo", sql.Char(1), input.tipoOperacao)
        .input("situacao", sql.Bit, input.situacao ? 1 : 0)
        .query(`
          UPDATE dbo.NATUREZA_OPERACAO SET
            DESCRICAO=@descricao,
            TIPOOPERACAO=@tipo,
            SITUACAO=@situacao,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDNATUREZAOPERACAO=@guid AND GUIDENTIDADE=@guidentidade
        `);
      if (!r.rowsAffected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Natureza da operacao nao encontrada." });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/fiscal/natureza-operacao/:guid", async (req, res) => {
    try {
      await ensureNaturezaOperacaoTable();
      const session = await getSession(req);
      const guid = guidSchema.parse(req.params.guid);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guid", sql.Char(36), guid)
        .input("guidentidade", sql.Char(36), session.guidEntidade)
        .query(`
          UPDATE dbo.NATUREZA_OPERACAO SET
            SITUACAO=0,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDNATUREZAOPERACAO=@guid AND GUIDENTIDADE=@guidentidade
        `);
      if (!r.rowsAffected[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Natureza da operacao nao encontrada." });
      res.json({ success: true, action: "inativado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

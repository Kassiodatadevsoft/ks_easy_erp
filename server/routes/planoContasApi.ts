import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";
import { getSqlPool, sql } from "../sqlserver";

const guidSchema = z.string().uuid();
const ultimaAlteracaoSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ultimaAlteracao invalida." });
      return z.NEVER;
    }
    return date;
  });

const planoContaSchema = z.object({
  codConta: z.string().min(1).max(20),
  conta: z.string().min(1).max(100),
  descricao: z.string().max(255).optional().nullable(),
  tipo: z.enum(["R", "D", "T"]).default("D"),
  nivel: z.number().int().min(1).max(5).default(1),
  guidContaPai: z.string().uuid().optional().nullable(),
  mascara: z.string().max(30).optional().nullable(),
  situacao: z.enum(["A", "I"]).default("A"),
});

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function requireSession(req: Request) {
  const token = getCookieValue(req.headers.cookie, COOKIE_NAME);
  const session = await verifyKsSession(token);
  if (!session) throw new Error("Sessao invalida.");
  return session;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Parametros invalidos." });
    return;
  }
  const message = error instanceof Error ? error.message : "Erro interno.";
  const status = message.includes("Sessao") ? 401 : 400;
  res.status(status).json({ success: false, message });
}

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

const selectPlanoContas = `
  SELECT
    CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta,
    CODCONTA, CONTA, DESCRICAO, TIPO, NIVEL,
    CAST(GUIDCONTAPAI AS NVARCHAR(36)) AS guidContaPai,
    MASCARA, SITUACAO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO
  FROM KS0003.KS00001
`;

async function listarPlanoContas(input: {
  guidEntidade: string;
  ultimaAlteracao?: string;
}) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectPlanoContas}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY CODCONTA
    `);
  const maior = r.recordset.reduce((acc, row) => {
    const value = row.ULTIMAALTERACAO ? new Date(row.ULTIMAALTERACAO).getTime() : 0;
    return value > acc.time ? { time: value, value: row.ULTIMAALTERACAO } : acc;
  }, { time: 0, value: null as unknown });
  return { dados: r.recordset, ULTIMAALTERACAO: maior.value };
}

export function registerPlanoContasApiRoutes(app: Express) {
  app.get("/api/plano-contas/ultima-alteracao", async (req, res) => {
    try {
      const session = await requireSession(req);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
          FROM KS0003.KS00001
          WHERE GUIDENTIDADE = @guidEntidade
        `);
      res.json(r.recordset[0] ?? { ULTIMAALTERACAO: null });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/plano-contas/arvore", async (req, res) => {
    try {
      const session = await requireSession(req);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`${selectPlanoContas}
          WHERE GUIDENTIDADE = @guidEntidade AND SITUACAO = 'A'
          ORDER BY CODCONTA
        `);
      res.json(r.recordset);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/plano-contas", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);

      const dados = await listarPlanoContas({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      });

      res.json(dados);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Erro interno",
      });
    }
  });

  app.get("/api/plano-contas/:guidConta", async (req, res) => {
    try {
      const session = await requireSession(req);
      const guidConta = guidSchema.parse(req.params.guidConta);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guidConta)
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`${selectPlanoContas}
          WHERE GUIDCONTA = @guidConta AND GUIDENTIDADE = @guidEntidade
        `);
      res.json(r.recordset[0] ?? null);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/plano-contas", async (req, res) => {
    try {
      const session = await requireSession(req);
      const input = planoContaSchema.parse(req.body);
      const guid = crypto.randomUUID();
      const pool = await getSqlPool();
      await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guid)
        .input("codConta", sql.NVarChar(20), input.codConta.toUpperCase())
        .input("conta", sql.NVarChar(100), input.conta.toUpperCase())
        .input("descricao", sql.NVarChar(255), input.descricao ?? null)
        .input("tipo", sql.Char(1), input.tipo)
        .input("nivel", sql.TinyInt, input.nivel)
        .input("guidContaPai", sql.UniqueIdentifier, input.guidContaPai ?? null)
        .input("mascara", sql.NVarChar(30), input.mascara ?? null)
        .input("situacao", sql.Char(1), input.situacao)
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00001
            (GUIDCONTA,CODCONTA,CONTA,DESCRICAO,TIPO,NIVEL,GUIDCONTAPAI,MASCARA,SITUACAO,GUIDENTIDADE)
          VALUES
            (@guidConta,@codConta,@conta,@descricao,@tipo,@nivel,@guidContaPai,@mascara,@situacao,@guidEntidade)
        `);
      res.json({ success: true, guidConta: guid });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/plano-contas/:guidConta", async (req, res) => {
    try {
      const session = await requireSession(req);
      const guidConta = guidSchema.parse(req.params.guidConta);
      const input = planoContaSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guidConta)
        .input("codConta", sql.NVarChar(20), input.codConta.toUpperCase())
        .input("conta", sql.NVarChar(100), input.conta.toUpperCase())
        .input("descricao", sql.NVarChar(255), input.descricao ?? null)
        .input("tipo", sql.Char(1), input.tipo)
        .input("nivel", sql.TinyInt, input.nivel)
        .input("guidContaPai", sql.UniqueIdentifier, input.guidContaPai ?? null)
        .input("mascara", sql.NVarChar(30), input.mascara ?? null)
        .input("situacao", sql.Char(1), input.situacao)
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00001 SET
            CODCONTA=@codConta, CONTA=@conta, DESCRICAO=@descricao,
            TIPO=@tipo, NIVEL=@nivel, GUIDCONTAPAI=@guidContaPai,
            MASCARA=@mascara, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDCONTA=@guidConta AND GUIDENTIDADE=@guidEntidade
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/plano-contas/:guidConta", async (req, res) => {
    try {
      const session = await requireSession(req);
      const guidConta = guidSchema.parse(req.params.guidConta);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guidConta)
        .input("guidEntidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00001
          SET SITUACAO = 'I',
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDCONTA = @guidConta
            AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true, action: "cancelado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

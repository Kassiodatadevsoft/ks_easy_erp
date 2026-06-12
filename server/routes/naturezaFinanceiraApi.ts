import type { Express, Request, Response } from "express";
import { z } from "zod";
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

const naturezaSchema = z.object({
  NATUREZA: z.string().min(1).max(100),
  DESCRICAO: z.string().max(255).optional().nullable(),
  TIPO: z.enum(["R", "D", "T"]),
  GUIDCONTA: z.string().uuid().optional().nullable(),
  SITUACAO: z.enum(["A", "I"]).default("A"),
  GUIDENTIDADE: z.string().uuid(),
});

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getGuidEntidade(req: Request) {
  return String(firstQueryValue(req.query.guidEntidade) ?? req.body?.GUIDENTIDADE ?? req.body?.guidEntidade ?? "");
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno";
  res.status(500).json({ success: false, message });
}

const selectNatureza = `
  SELECT
    GUIDNATUREZA,
    NATUREZA,
    DESCRICAO,
    TIPO,
    GUIDCONTA,
    SITUACAO,
    GUIDENTIDADE,
    DATACADASTRO,
    ULTIMAALTERACAO
  FROM [KS0003].[KS00003]
`;

async function ultimaAlteracaoBanco(guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
      FROM [KS0003].[KS00003]
      WHERE GUIDENTIDADE = @guidEntidade
    `);
  return r.recordset[0]?.ULTIMAALTERACAO ?? null;
}

function maiorUltimaAlteracao(rows: Array<{ ULTIMAALTERACAO?: Date | string | null }>) {
  let maior: Date | string | null = null;
  let maiorTime = 0;
  for (const row of rows) {
    const time = row.ULTIMAALTERACAO ? new Date(row.ULTIMAALTERACAO).getTime() : 0;
    if (time > maiorTime) {
      maiorTime = time;
      maior = row.ULTIMAALTERACAO ?? null;
    }
  }
  return maior;
}

async function listarNaturezaFinanceira(input: { guidEntidade: string; ultimaAlteracao?: string }) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectNatureza}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY ULTIMAALTERACAO
    `);
  return {
    dados: r.recordset,
    ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade),
  };
}

export function registerNaturezaFinanceiraApiRoutes(app: Express) {
  app.get("/api/natureza-financeira/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      res.json({ dados: [], ULTIMAALTERACAO: await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/natureza-financeira", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      res.json(await listarNaturezaFinanceira({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/natureza-financeira/:guidNatureza", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidNatureza = guidSchema.parse(req.params.guidNatureza);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidNatureza", sql.UniqueIdentifier, guidNatureza)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectNatureza}
          WHERE GUIDNATUREZA = @guidNatureza AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/natureza-financeira", async (req, res) => {
    try {
      const input = naturezaSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("NATUREZA", sql.NVarChar(100), input.NATUREZA)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("TIPO", sql.Char(1), input.TIPO)
        .input("GUIDCONTA", sql.UniqueIdentifier, input.GUIDCONTA ?? null)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .query(`
          INSERT INTO [KS0003].[KS00003]
            (NATUREZA,DESCRICAO,TIPO,GUIDCONTA,SITUACAO,GUIDENTIDADE)
          VALUES
            (@NATUREZA,@DESCRICAO,@TIPO,@GUIDCONTA,@SITUACAO,@GUIDENTIDADE)
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/natureza-financeira/:guidNatureza", async (req, res) => {
    try {
      const guidNatureza = guidSchema.parse(req.params.guidNatureza);
      const input = naturezaSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("GUIDNATUREZA", sql.UniqueIdentifier, guidNatureza)
        .input("NATUREZA", sql.NVarChar(100), input.NATUREZA)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("TIPO", sql.Char(1), input.TIPO)
        .input("GUIDCONTA", sql.UniqueIdentifier, input.GUIDCONTA ?? null)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .query(`
          UPDATE [KS0003].[KS00003] SET
            NATUREZA = @NATUREZA,
            DESCRICAO = @DESCRICAO,
            TIPO = @TIPO,
            GUIDCONTA = @GUIDCONTA,
            SITUACAO = @SITUACAO,
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDNATUREZA = @GUIDNATUREZA
            AND GUIDENTIDADE = @GUIDENTIDADE
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/natureza-financeira/:guidNatureza", async (req, res) => {
    try {
      const guidNatureza = guidSchema.parse(req.params.guidNatureza);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      await pool.request()
        .input("guidNatureza", sql.UniqueIdentifier, guidNatureza)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          UPDATE [KS0003].[KS00003]
          SET
              SITUACAO = 'I',
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDNATUREZA = @guidNatureza
          AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true, action: "cancelado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

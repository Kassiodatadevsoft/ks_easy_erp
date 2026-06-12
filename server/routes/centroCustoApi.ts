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

const centroCustoSchema = z.object({
  CODCENTRO: z.string().min(1).max(20),
  CENTRO: z.string().min(1).max(100),
  DESCRICAO: z.string().max(255).optional().nullable(),
  NIVEL: z.number().int().min(1).max(5).default(1),
  GUIDCENTROPAI: z.string().uuid().optional().nullable(),
  ORCAMENTO: z.number().min(0).default(0),
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

const selectCentroCusto = `
  SELECT
    GUIDCENTRO,
    CODCENTRO,
    CENTRO,
    DESCRICAO,
    NIVEL,
    GUIDCENTROPAI,
    ORCAMENTO,
    SITUACAO,
    GUIDENTIDADE,
    DATACADASTRO,
    ULTIMAALTERACAO
  FROM [KS0003].[KS00002]
`;

async function ultimaAlteracaoBanco(guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
      FROM [KS0003].[KS00002]
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

async function listarCentroCusto(input: { guidEntidade: string; ultimaAlteracao?: string }) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectCentroCusto}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY ULTIMAALTERACAO
    `);
  return {
    dados: r.recordset,
    ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade),
  };
}

export function registerCentroCustoApiRoutes(app: Express) {
  app.get("/api/centro-custo/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      res.json({ dados: [], ULTIMAALTERACAO: await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/centro-custo/arvore", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectCentroCusto}
          WHERE GUIDENTIDADE = @guidEntidade
          ORDER BY GUIDCENTROPAI, CODCENTRO
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/centro-custo", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      res.json(await listarCentroCusto({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/centro-custo/:guidCentro", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidCentro = guidSchema.parse(req.params.guidCentro);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidCentro", sql.UniqueIdentifier, guidCentro)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectCentroCusto}
          WHERE GUIDCENTRO = @guidCentro AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/centro-custo", async (req, res) => {
    try {
      const input = centroCustoSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("CODCENTRO", sql.NVarChar(20), input.CODCENTRO)
        .input("CENTRO", sql.NVarChar(100), input.CENTRO)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("NIVEL", sql.TinyInt, input.NIVEL)
        .input("GUIDCENTROPAI", sql.UniqueIdentifier, input.GUIDCENTROPAI ?? null)
        .input("ORCAMENTO", sql.Decimal(15, 2), input.ORCAMENTO)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .query(`
          INSERT INTO [KS0003].[KS00002]
            (CODCENTRO,CENTRO,DESCRICAO,NIVEL,GUIDCENTROPAI,ORCAMENTO,SITUACAO,GUIDENTIDADE)
          VALUES
            (@CODCENTRO,@CENTRO,@DESCRICAO,@NIVEL,@GUIDCENTROPAI,@ORCAMENTO,@SITUACAO,@GUIDENTIDADE)
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/centro-custo/:guidCentro", async (req, res) => {
    try {
      const guidCentro = guidSchema.parse(req.params.guidCentro);
      const input = centroCustoSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("GUIDCENTRO", sql.UniqueIdentifier, guidCentro)
        .input("CODCENTRO", sql.NVarChar(20), input.CODCENTRO)
        .input("CENTRO", sql.NVarChar(100), input.CENTRO)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("NIVEL", sql.TinyInt, input.NIVEL)
        .input("GUIDCENTROPAI", sql.UniqueIdentifier, input.GUIDCENTROPAI ?? null)
        .input("ORCAMENTO", sql.Decimal(15, 2), input.ORCAMENTO)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .query(`
          UPDATE [KS0003].[KS00002] SET
            CODCENTRO = @CODCENTRO,
            CENTRO = @CENTRO,
            DESCRICAO = @DESCRICAO,
            NIVEL = @NIVEL,
            GUIDCENTROPAI = @GUIDCENTROPAI,
            ORCAMENTO = @ORCAMENTO,
            SITUACAO = @SITUACAO,
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDCENTRO = @GUIDCENTRO
            AND GUIDENTIDADE = @GUIDENTIDADE
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/centro-custo/:guidCentro", async (req, res) => {
    try {
      const guidCentro = guidSchema.parse(req.params.guidCentro);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      await pool.request()
        .input("guidCentro", sql.UniqueIdentifier, guidCentro)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          UPDATE [KS0003].[KS00002]
          SET SITUACAO = 'I',
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDCENTRO = @guidCentro
            AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true, action: "cancelado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

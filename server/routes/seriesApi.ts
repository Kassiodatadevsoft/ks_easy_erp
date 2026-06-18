import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSqlPool, sql } from "../sqlserver";

const ESCOLAR_SCHEMA = "dbo";
const SERIE_TABLE = `[${ESCOLAR_SCHEMA}].[SERIE]`;
const TURMAS_TABLE = `[${ESCOLAR_SCHEMA}].[TURMAS]`;
const TURMA_SERIE_TABLE = `[${ESCOLAR_SCHEMA}].[TURMA_SERIE]`;
const MATRICULA_TABLE = `[${ESCOLAR_SCHEMA}].[MATRICULA]`;

const guidSchema = z.string().uuid();
const situacaoQuerySchema = z.enum(["TODAS", "ATIVAS", "INATIVAS"]).default("ATIVAS");
const boolBitSchema = z
  .union([z.boolean(), z.number().int().min(0).max(1), z.string()])
  .transform((value, ctx) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "s", "ativo", "ativa"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "n", "inativo", "inativa"].includes(normalized)) return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Situacao invalida." });
    return z.NEVER;
  });

const serieSchema = z.object({
  GUIDENTIDADE: z.string().uuid(),
  DESCRICAO: z.string().trim().min(1).max(100),
  ORDEM: z.coerce.number().int().optional().nullable(),
  SITUACAO: boolBitSchema.default(true),
});

const turmaSerieSchema = z.object({
  GUIDENTIDADE: z.string().uuid(),
  GUIDSERIE: z.string().uuid(),
  SITUACAO: boolBitSchema.default(true),
});

const turmaSerieUpdateSchema = z.object({
  GUIDENTIDADE: z.string().uuid(),
  SITUACAO: boolBitSchema.default(true),
});

const turmaConfiguracaoSerieSchema = z.object({
  GUIDENTIDADE: z.string().uuid(),
  TIPOTURMA: z.enum(["REGULAR", "MULTISSERIADA"]),
  GUIDSERIEPRINCIPAL: z.string().uuid().optional().nullable(),
});

const matriculaSerieSchema = z.object({
  GUIDENTIDADE: z.string().uuid(),
  GUIDTURMA: z.string().uuid(),
  GUIDSERIE: z.string().uuid(),
});

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function getGuidEntidade(req: Request) {
  return String(firstQueryValue(req.query.guidEntidade) ?? req.body?.GUIDENTIDADE ?? req.body?.guidEntidade ?? "");
}

function sendError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Parametros invalidos.", issues: error.issues });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno";
  const status = message.includes("nao encontrada") || message.includes("nao encontrado") ? 404
    : message.includes("utilizada") || message.includes("vinculada") || message.includes("obrigatoria") || message.includes("duplicidade") ? 409
      : 500;
  res.status(status).json({ success: false, message });
}

async function ensureEscolarTables() {
  const pool = await getSqlPool();
  await pool.request().query(`
    IF OBJECT_ID('${ESCOLAR_SCHEMA}.SERIE', 'U') IS NULL
    BEGIN
      CREATE TABLE ${SERIE_TABLE} (
        GUIDSERIE uniqueidentifier NOT NULL CONSTRAINT PK_SERIE PRIMARY KEY DEFAULT NEWID(),
        GUIDENTIDADE uniqueidentifier NOT NULL,
        DESCRICAO varchar(100) NOT NULL,
        ORDEM int NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_SERIE_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_SERIE_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_SERIE_ULTIMAALTERACAO DEFAULT GETDATE()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SERIE_ENTIDADE_DESCRICAO' AND object_id = OBJECT_ID('${ESCOLAR_SCHEMA}.SERIE'))
      CREATE UNIQUE INDEX UX_SERIE_ENTIDADE_DESCRICAO ON ${SERIE_TABLE} (GUIDENTIDADE, DESCRICAO);

    IF OBJECT_ID('${ESCOLAR_SCHEMA}.TURMAS', 'U') IS NULL
    BEGIN
      CREATE TABLE ${TURMAS_TABLE} (
        GUIDTURMA uniqueidentifier NOT NULL CONSTRAINT PK_TURMAS PRIMARY KEY DEFAULT NEWID(),
        GUIDENTIDADE uniqueidentifier NOT NULL,
        DESCRICAO varchar(100) NOT NULL,
        TIPOTURMA varchar(20) NOT NULL CONSTRAINT DF_TURMAS_TIPOTURMA DEFAULT 'REGULAR',
        MULTISSERIADA bit NOT NULL CONSTRAINT DF_TURMAS_MULTISSERIADA DEFAULT 0,
        GUIDSERIEPRINCIPAL uniqueidentifier NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_TURMAS_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_TURMAS_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_TURMAS_ULTIMAALTERACAO DEFAULT GETDATE()
      );
    END
    ELSE
    BEGIN
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.TURMAS', 'TIPOTURMA') IS NULL ALTER TABLE ${TURMAS_TABLE} ADD TIPOTURMA varchar(20) NOT NULL CONSTRAINT DF_TURMAS_TIPOTURMA DEFAULT 'REGULAR';
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.TURMAS', 'MULTISSERIADA') IS NULL ALTER TABLE ${TURMAS_TABLE} ADD MULTISSERIADA bit NOT NULL CONSTRAINT DF_TURMAS_MULTISSERIADA DEFAULT 0;
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.TURMAS', 'GUIDSERIEPRINCIPAL') IS NULL ALTER TABLE ${TURMAS_TABLE} ADD GUIDSERIEPRINCIPAL uniqueidentifier NULL;
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.TURMAS', 'ULTIMAALTERACAO') IS NULL ALTER TABLE ${TURMAS_TABLE} ADD ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_TURMAS_ULTIMAALTERACAO DEFAULT GETDATE();
    END;

    IF OBJECT_ID('${ESCOLAR_SCHEMA}.TURMA_SERIE', 'U') IS NULL
    BEGIN
      CREATE TABLE ${TURMA_SERIE_TABLE} (
        GUIDTURMASERIE uniqueidentifier NOT NULL CONSTRAINT PK_TURMA_SERIE PRIMARY KEY DEFAULT NEWID(),
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDTURMA uniqueidentifier NOT NULL,
        GUIDSERIE uniqueidentifier NOT NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_TURMA_SERIE_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_TURMA_SERIE_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_TURMA_SERIE_ULTIMAALTERACAO DEFAULT GETDATE()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TURMA_SERIE_ENTIDADE_TURMA_SERIE' AND object_id = OBJECT_ID('${ESCOLAR_SCHEMA}.TURMA_SERIE'))
      CREATE UNIQUE INDEX UX_TURMA_SERIE_ENTIDADE_TURMA_SERIE ON ${TURMA_SERIE_TABLE} (GUIDENTIDADE, GUIDTURMA, GUIDSERIE);

    IF OBJECT_ID('${ESCOLAR_SCHEMA}.MATRICULA', 'U') IS NULL
    BEGIN
      CREATE TABLE ${MATRICULA_TABLE} (
        GUIDMATRICULA uniqueidentifier NOT NULL CONSTRAINT PK_MATRICULA PRIMARY KEY DEFAULT NEWID(),
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDALUNO uniqueidentifier NULL,
        GUIDTURMA uniqueidentifier NOT NULL,
        GUIDSERIE uniqueidentifier NULL,
        SITUACAO bit NOT NULL CONSTRAINT DF_MATRICULA_SITUACAO DEFAULT 1,
        DATACADASTRO datetime NOT NULL CONSTRAINT DF_MATRICULA_DATACADASTRO DEFAULT GETDATE(),
        ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_MATRICULA_ULTIMAALTERACAO DEFAULT GETDATE()
      );
    END
    ELSE
    BEGIN
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.MATRICULA', 'GUIDSERIE') IS NULL ALTER TABLE ${MATRICULA_TABLE} ADD GUIDSERIE uniqueidentifier NULL;
      IF COL_LENGTH('${ESCOLAR_SCHEMA}.MATRICULA', 'ULTIMAALTERACAO') IS NULL ALTER TABLE ${MATRICULA_TABLE} ADD ULTIMAALTERACAO datetime NOT NULL CONSTRAINT DF_MATRICULA_ULTIMAALTERACAO DEFAULT GETDATE();
    END;
  `);
}

async function assertSerieExists(guidEntidade: string, guidSerie: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("guidSerie", sql.UniqueIdentifier, guidSerie)
    .query(`SELECT TOP 1 1 AS OK FROM ${SERIE_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIE = @guidSerie`);
  if (!r.recordset[0]) throw new Error("Serie/Nivel nao encontrada.");
}

async function assertTurmaExists(guidEntidade: string, guidTurma: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("guidTurma", sql.UniqueIdentifier, guidTurma)
    .query(`SELECT TOP 1 1 AS OK FROM ${TURMAS_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma`);
  if (!r.recordset[0]) throw new Error("Turma nao encontrada.");
}

export function registerSeriesApiRoutes(app: Express) {
  app.get("/api/series", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const situacao = situacaoQuerySchema.parse(String(firstQueryValue(req.query.situacao) ?? "ATIVAS").toUpperCase());
      const busca = String(firstQueryValue(req.query.busca) ?? "").trim();
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("situacao", sql.VarChar(10), situacao)
        .input("busca", sql.VarChar(100), busca ? `%${busca}%` : null)
        .query(`
          SELECT
            CAST(GUIDSERIE AS nvarchar(36)) AS GUIDSERIE,
            CAST(GUIDENTIDADE AS nvarchar(36)) AS GUIDENTIDADE,
            DESCRICAO, ORDEM, SITUACAO, DATACADASTRO, ULTIMAALTERACAO
          FROM ${SERIE_TABLE}
          WHERE GUIDENTIDADE = @guidEntidade
            AND (@situacao = 'TODAS' OR (@situacao = 'ATIVAS' AND SITUACAO = 1) OR (@situacao = 'INATIVAS' AND SITUACAO = 0))
            AND (@busca IS NULL OR DESCRICAO LIKE @busca)
          ORDER BY ISNULL(ORDEM, 999999), DESCRICAO
        `);
      res.json({ success: true, dados: r.recordset });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/series/:guidSerie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidSerie = guidSchema.parse(req.params.guidSerie);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidSerie", sql.UniqueIdentifier, guidSerie)
        .query(`
          SELECT TOP 1
            CAST(GUIDSERIE AS nvarchar(36)) AS GUIDSERIE,
            CAST(GUIDENTIDADE AS nvarchar(36)) AS GUIDENTIDADE,
            DESCRICAO, ORDEM, SITUACAO, DATACADASTRO, ULTIMAALTERACAO
          FROM ${SERIE_TABLE}
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIE = @guidSerie
        `);
      if (!r.recordset[0]) throw new Error("Serie/Nivel nao encontrada.");
      res.json({ success: true, dados: r.recordset[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/series", async (req, res) => {
    try {
      await ensureEscolarTables();
      const input = serieSchema.parse(req.body);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("descricao", sql.VarChar(100), input.DESCRICAO)
        .input("ordem", sql.Int, input.ORDEM ?? null)
        .input("situacao", sql.Bit, input.SITUACAO)
        .query(`
          INSERT INTO ${SERIE_TABLE} (GUIDENTIDADE, DESCRICAO, ORDEM, SITUACAO, DATACADASTRO, ULTIMAALTERACAO)
          OUTPUT CAST(INSERTED.GUIDSERIE AS nvarchar(36)) AS GUIDSERIE
          VALUES (@guidEntidade, @descricao, @ordem, @situacao, GETDATE(), GETDATE())
        `);
      res.status(201).json({ success: true, dados: r.recordset[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/series/:guidSerie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidSerie = guidSchema.parse(req.params.guidSerie);
      const input = serieSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidSerie", sql.UniqueIdentifier, guidSerie)
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("descricao", sql.VarChar(100), input.DESCRICAO)
        .input("ordem", sql.Int, input.ORDEM ?? null)
        .input("situacao", sql.Bit, input.SITUACAO)
        .query(`
          UPDATE ${SERIE_TABLE}
          SET DESCRICAO = @descricao,
              ORDEM = @ordem,
              SITUACAO = @situacao,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDSERIE = @guidSerie AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/series/:guidSerie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidSerie = guidSchema.parse(req.params.guidSerie);
      const pool = await getSqlPool();
      const uso = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidSerie", sql.UniqueIdentifier, guidSerie)
        .query(`
          SELECT
            (SELECT COUNT(1) FROM ${MATRICULA_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIE = @guidSerie) AS MATRICULAS,
            (SELECT COUNT(1) FROM ${TURMAS_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIEPRINCIPAL = @guidSerie) AS TURMAS
        `);
      if (Number(uso.recordset[0]?.MATRICULAS ?? 0) > 0 || Number(uso.recordset[0]?.TURMAS ?? 0) > 0) {
        throw new Error("Nao e permitido excluir Serie/Nivel utilizada em matricula ou turma.");
      }
      await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidSerie", sql.UniqueIdentifier, guidSerie)
        .query(`
          UPDATE ${SERIE_TABLE}
          SET SITUACAO = 0,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIE = @guidSerie
        `);
      res.json({ success: true, action: "inativada" });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/turmas/:guidTurma/configuracao-serie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const input = turmaConfiguracaoSerieSchema.parse(req.body);
      if (input.TIPOTURMA === "REGULAR" && !input.GUIDSERIEPRINCIPAL) {
        throw new Error("Serie/Nivel principal e obrigatoria para turma regular.");
      }
      if (input.GUIDSERIEPRINCIPAL) await assertSerieExists(input.GUIDENTIDADE, input.GUIDSERIEPRINCIPAL);
      await assertTurmaExists(input.GUIDENTIDADE, guidTurma);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .input("tipoTurma", sql.VarChar(20), input.TIPOTURMA)
        .input("multisseriada", sql.Bit, input.TIPOTURMA === "MULTISSERIADA")
        .input("guidSeriePrincipal", sql.UniqueIdentifier, input.GUIDSERIEPRINCIPAL ?? null)
        .query(`
          UPDATE ${TURMAS_TABLE}
          SET TIPOTURMA = @tipoTurma,
              MULTISSERIADA = @multisseriada,
              GUIDSERIEPRINCIPAL = @guidSeriePrincipal,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/turmas/:guidTurma/series", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .query(`
          SELECT
            CAST(ts.GUIDTURMASERIE AS nvarchar(36)) AS GUIDTURMASERIE,
            CAST(ts.GUIDENTIDADE AS nvarchar(36)) AS GUIDENTIDADE,
            CAST(ts.GUIDTURMA AS nvarchar(36)) AS GUIDTURMA,
            CAST(ts.GUIDSERIE AS nvarchar(36)) AS GUIDSERIE,
            s.DESCRICAO AS SERIE,
            s.ORDEM,
            ts.SITUACAO,
            ts.DATACADASTRO,
            ts.ULTIMAALTERACAO
          FROM ${TURMA_SERIE_TABLE} ts
          INNER JOIN ${SERIE_TABLE} s ON s.GUIDENTIDADE = ts.GUIDENTIDADE AND s.GUIDSERIE = ts.GUIDSERIE
          WHERE ts.GUIDENTIDADE = @guidEntidade AND ts.GUIDTURMA = @guidTurma
          ORDER BY ISNULL(s.ORDEM, 999999), s.DESCRICAO
        `);
      res.json({ success: true, dados: r.recordset });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/turmas/:guidTurma/series-ativas", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const pool = await getSqlPool();
      const turma = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .query(`
          SELECT TOP 1 MULTISSERIADA, TIPOTURMA, GUIDSERIEPRINCIPAL
          FROM ${TURMAS_TABLE}
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma
        `);
      const turmaRow = turma.recordset[0];
      if (!turmaRow) throw new Error("Turma nao encontrada.");

      const isMultisseriada = Boolean(turmaRow.MULTISSERIADA) || String(turmaRow.TIPOTURMA ?? "").toUpperCase() === "MULTISSERIADA";
      const r = isMultisseriada
        ? await pool.request()
          .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
          .input("guidTurma", sql.UniqueIdentifier, guidTurma)
          .query(`
            SELECT CAST(s.GUIDSERIE AS nvarchar(36)) AS GUIDSERIE, s.DESCRICAO, s.ORDEM
            FROM ${TURMA_SERIE_TABLE} ts
            INNER JOIN ${SERIE_TABLE} s ON s.GUIDENTIDADE = ts.GUIDENTIDADE AND s.GUIDSERIE = ts.GUIDSERIE
            WHERE ts.GUIDENTIDADE = @guidEntidade
              AND ts.GUIDTURMA = @guidTurma
              AND ts.SITUACAO = 1
              AND s.SITUACAO = 1
            ORDER BY ISNULL(s.ORDEM, 999999), s.DESCRICAO
          `)
        : await pool.request()
          .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
          .input("guidSerie", sql.UniqueIdentifier, turmaRow.GUIDSERIEPRINCIPAL ?? null)
          .query(`
            SELECT CAST(GUIDSERIE AS nvarchar(36)) AS GUIDSERIE, DESCRICAO, ORDEM
            FROM ${SERIE_TABLE}
            WHERE GUIDENTIDADE = @guidEntidade
              AND GUIDSERIE = @guidSerie
              AND SITUACAO = 1
          `);

      res.json({
        success: true,
        tipoTurma: isMultisseriada ? "MULTISSERIADA" : "REGULAR",
        editavel: isMultisseriada,
        dados: r.recordset,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/turmas/:guidTurma/series", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const input = turmaSerieSchema.parse(req.body);
      await assertTurmaExists(input.GUIDENTIDADE, guidTurma);
      await assertSerieExists(input.GUIDENTIDADE, input.GUIDSERIE);
      const pool = await getSqlPool();
      const duplicada = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .input("guidSerie", sql.UniqueIdentifier, input.GUIDSERIE)
        .query(`SELECT TOP 1 1 AS OK FROM ${TURMA_SERIE_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma AND GUIDSERIE = @guidSerie`);
      if (duplicada.recordset[0]) throw new Error("Nao e permitido vincular a mesma Serie/Nivel duas vezes na turma.");
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .input("guidSerie", sql.UniqueIdentifier, input.GUIDSERIE)
        .input("situacao", sql.Bit, input.SITUACAO)
        .query(`
          INSERT INTO ${TURMA_SERIE_TABLE} (GUIDENTIDADE, GUIDTURMA, GUIDSERIE, SITUACAO, DATACADASTRO, ULTIMAALTERACAO)
          OUTPUT CAST(INSERTED.GUIDTURMASERIE AS nvarchar(36)) AS GUIDTURMASERIE
          VALUES (@guidEntidade, @guidTurma, @guidSerie, @situacao, GETDATE(), GETDATE())
        `);
      res.status(201).json({ success: true, dados: r.recordset[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/turmas/:guidTurma/series/:guidTurmaSerie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const guidTurmaSerie = guidSchema.parse(req.params.guidTurmaSerie);
      const input = turmaSerieUpdateSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .input("guidTurmaSerie", sql.UniqueIdentifier, guidTurmaSerie)
        .input("situacao", sql.Bit, input.SITUACAO)
        .query(`
          UPDATE ${TURMA_SERIE_TABLE}
          SET SITUACAO = @situacao,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma AND GUIDTURMASERIE = @guidTurmaSerie
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/turmas/:guidTurma/series/:guidTurmaSerie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const guidTurma = guidSchema.parse(req.params.guidTurma);
      const guidTurmaSerie = guidSchema.parse(req.params.guidTurmaSerie);
      const pool = await getSqlPool();
      const uso = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidTurmaSerie", sql.UniqueIdentifier, guidTurmaSerie)
        .query(`
          SELECT COUNT(1) AS TOTAL
          FROM ${MATRICULA_TABLE} m
          INNER JOIN ${TURMA_SERIE_TABLE} ts ON ts.GUIDENTIDADE = m.GUIDENTIDADE AND ts.GUIDTURMA = m.GUIDTURMA AND ts.GUIDSERIE = m.GUIDSERIE
          WHERE m.GUIDENTIDADE = @guidEntidade AND ts.GUIDTURMASERIE = @guidTurmaSerie
        `);
      if (Number(uso.recordset[0]?.TOTAL ?? 0) > 0) throw new Error("Nao e permitido excluir vinculo TURMA_SERIE utilizado em matricula.");
      await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidTurma", sql.UniqueIdentifier, guidTurma)
        .input("guidTurmaSerie", sql.UniqueIdentifier, guidTurmaSerie)
        .query(`
          UPDATE ${TURMA_SERIE_TABLE}
          SET SITUACAO = 0,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma AND GUIDTURMASERIE = @guidTurmaSerie
        `);
      res.json({ success: true, action: "inativado" });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/matriculas/:guidMatricula/serie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidMatricula = guidSchema.parse(req.params.guidMatricula);
      const input = matriculaSerieSchema.parse(req.body);
      await assertTurmaExists(input.GUIDENTIDADE, input.GUIDTURMA);
      await assertSerieExists(input.GUIDENTIDADE, input.GUIDSERIE);
      const pool = await getSqlPool();
      const turma = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidTurma", sql.UniqueIdentifier, input.GUIDTURMA)
        .query(`SELECT TOP 1 MULTISSERIADA, TIPOTURMA, GUIDSERIEPRINCIPAL FROM ${TURMAS_TABLE} WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma`);
      const turmaRow = turma.recordset[0];
      const isMultisseriada = Boolean(turmaRow.MULTISSERIADA) || String(turmaRow.TIPOTURMA ?? "").toUpperCase() === "MULTISSERIADA";
      if (isMultisseriada) {
        const vinculo = await pool.request()
          .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
          .input("guidTurma", sql.UniqueIdentifier, input.GUIDTURMA)
          .input("guidSerie", sql.UniqueIdentifier, input.GUIDSERIE)
          .query(`
            SELECT TOP 1 1 AS OK
            FROM ${TURMA_SERIE_TABLE}
            WHERE GUIDENTIDADE = @guidEntidade AND GUIDTURMA = @guidTurma AND GUIDSERIE = @guidSerie AND SITUACAO = 1
          `);
        if (!vinculo.recordset[0]) throw new Error("Nao e permitido selecionar Serie/Nivel nao vinculada a turma.");
      } else if (String(turmaRow.GUIDSERIEPRINCIPAL).toLowerCase() !== input.GUIDSERIE.toLowerCase()) {
        throw new Error("Turma regular aceita apenas a Serie/Nivel principal.");
      }

      await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("guidMatricula", sql.UniqueIdentifier, guidMatricula)
        .input("guidTurma", sql.UniqueIdentifier, input.GUIDTURMA)
        .input("guidSerie", sql.UniqueIdentifier, input.GUIDSERIE)
        .query(`
          UPDATE ${MATRICULA_TABLE}
          SET GUIDTURMA = @guidTurma,
              GUIDSERIE = @guidSerie,
              ULTIMAALTERACAO = GETDATE()
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDMATRICULA = @guidMatricula
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/matriculas/sem-serie", async (req, res) => {
    try {
      await ensureEscolarTables();
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          SELECT
            CAST(GUIDMATRICULA AS nvarchar(36)) AS GUIDMATRICULA,
            CAST(GUIDTURMA AS nvarchar(36)) AS GUIDTURMA,
            CAST(GUIDALUNO AS nvarchar(36)) AS GUIDALUNO,
            'Matricula sem Serie/Nivel definida.' AS AVISO
          FROM ${MATRICULA_TABLE}
          WHERE GUIDENTIDADE = @guidEntidade AND GUIDSERIE IS NULL
          ORDER BY DATACADASTRO DESC
        `);
      res.json({ success: true, dados: r.recordset });
    } catch (error) {
      sendError(res, error);
    }
  });
}

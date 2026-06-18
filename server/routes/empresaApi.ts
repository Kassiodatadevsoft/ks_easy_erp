import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { listarDadosEmpresaNf } from "../services/empresaDadosService";
import { getSqlPool, sql } from "../sqlserver";
import { DATADEV_FORBIDDEN_MESSAGE, ensureEmpresaSegmentoColumn, isDataDevAdmin, normalizeCnpj } from "../services/dataDevAdmin";
import { SISTEMA_SEGMENTOS } from "@shared/datadev";

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function sendEmpresaDadosError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Parametros invalidos." });
    return;
  }

  if (error instanceof TRPCError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno ao consultar dados da empresa.";
  res.status(500).json({ success: false, message });
}

async function assertDataDevRest(req: Request, res: Response) {
  if (await isDataDevAdmin(req)) return true;
  res.status(403).json({ success: false, message: DATADEV_FORBIDDEN_MESSAGE });
  return false;
}

const empresaRestSchema = z.object({
  nome: z.string().min(1),
  fantasia: z.string().optional().nullable(),
  documento: z.string().min(1),
  codTipoDocumento: z.enum(["F", "J"]).default("J"),
  celular: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  segmentoSistema: z.enum(SISTEMA_SEGMENTOS).default("GERAL"),
  situacao: z.enum(["A", "I", "B"]).default("A"),
});

export function registerEmpresaApiRoutes(app: Express) {
  app.get("/api/empresas", async (req, res) => {
    try {
      if (!(await assertDataDevRest(req, res))) return;
      await ensureEmpresaSegmentoColumn();
      const pool = await getSqlPool();
      const r = await pool.request().query(`
        SELECT
          CAST(GUIDPESSOA AS NVARCHAR(36)) AS GUIDPESSOA,
          CAST(GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
          CODIGO, CODENTIDADE, NOME, FANTASIA, DOCUMENTO,
          CODTIPODOCUMENTO, CELULAR, EMAIL, SEGMENTO, SITUACAO,
          DATACADASTRO, ULTIMAALTERACAO
        FROM KS0002.KS00001
        WHERE CADEMPRESA = 1
        ORDER BY NOME
      `);
      res.json({ success: true, dados: r.recordset });
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });

  app.get("/api/empresas/:id", async (req, res) => {
    try {
      if (!(await assertDataDevRest(req, res))) return;
      await ensureEmpresaSegmentoColumn();
      const guidPessoa = z.string().uuid().parse(req.params.id);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidPessoa", sql.UniqueIdentifier, guidPessoa)
        .query(`
          SELECT TOP 1
            CAST(GUIDPESSOA AS NVARCHAR(36)) AS GUIDPESSOA,
            CAST(GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
            CODIGO, CODENTIDADE, NOME, FANTASIA, DOCUMENTO,
            CODTIPODOCUMENTO, CELULAR, EMAIL, SEGMENTO, SITUACAO,
            DATACADASTRO, ULTIMAALTERACAO
          FROM KS0002.KS00001
          WHERE GUIDPESSOA = @guidPessoa AND CADEMPRESA = 1
        `);
      if (!r.recordset[0]) {
        res.status(404).json({ success: false, message: "Empresa nao encontrada." });
        return;
      }
      res.json({ success: true, dados: r.recordset[0] });
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });

  app.post("/api/empresas", async (req, res) => {
    try {
      if (!(await assertDataDevRest(req, res))) return;
      await ensureEmpresaSegmentoColumn();
      const input = empresaRestSchema.parse(req.body);
      const pool = await getSqlPool();
      const documento = normalizeCnpj(input.documento);
      const duplicada = await pool.request()
        .input("documento", sql.VarChar(20), documento)
        .query(`
          SELECT TOP 1 GUIDPESSOA
          FROM KS0002.KS00001
          WHERE CADEMPRESA = 1
            AND REPLACE(REPLACE(REPLACE(DOCUMENTO,'.',''),'-',''),'/','') = @documento
        `);
      if (duplicada.recordset[0]) {
        res.status(409).json({ success: false, message: "Empresa ja cadastrada com este documento." });
        return;
      }
      const cod = await pool.request().query("SELECT ISNULL(MAX(CODIGO), 0) + 1 AS CODIGO FROM KS0002.KS00001 WHERE CADEMPRESA = 1");
      const codigo = Number(cod.recordset[0]?.CODIGO ?? 1);
      const insert = await pool.request()
        .input("codigo", sql.Int, codigo)
        .input("nome", sql.VarChar(100), input.nome)
        .input("fantasia", sql.VarChar(60), input.fantasia ?? null)
        .input("documento", sql.VarChar(20), input.documento)
        .input("codTipoDocumento", sql.Char(1), input.codTipoDocumento)
        .input("celular", sql.VarChar(15), input.celular ?? null)
        .input("email", sql.VarChar(100), input.email ?? null)
        .input("segmento", sql.VarChar(30), input.segmentoSistema)
        .input("situacao", sql.Char(1), input.situacao)
        .query(`
          DECLARE @guid uniqueidentifier = NEWID();
          INSERT INTO KS0002.KS00001
            (CODIGO, CODENTIDADE, GUIDPESSOA, GUIDENTIDADE, NOME, FANTASIA, DOCUMENTO,
             CODTIPODOCUMENTO, CELULAR, EMAIL, SEGMENTO, SITUACAO, CADEMPRESA,
             CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA,
             DATACADASTRO, ULTIMAALTERACAO, ULTIMOACESSO)
          OUTPUT CAST(INSERTED.GUIDPESSOA AS NVARCHAR(36)) AS GUIDPESSOA, INSERTED.CODIGO
          VALUES
            (@codigo, @codigo, @guid, @guid, @nome, @fantasia, @documento,
             @codTipoDocumento, @celular, @email, @segmento, @situacao, 1,
             0, 0, 0, 0, GETDATE(), GETDATE(), GETDATE());

          INSERT INTO KS0002.KS00013 (GUIDVINCULO, GUIDPESSOA, GUIDENTIDADE, DTLANCAMENTO)
          VALUES (NEWID(), @guid, @guid, GETDATE());
        `);
      res.status(201).json({ success: true, dados: insert.recordset[0] });
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });

  app.put("/api/empresas/:id", async (req, res) => {
    try {
      if (!(await assertDataDevRest(req, res))) return;
      await ensureEmpresaSegmentoColumn();
      const guidPessoa = z.string().uuid().parse(req.params.id);
      const input = empresaRestSchema.partial().parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidPessoa", sql.UniqueIdentifier, guidPessoa)
        .input("nome", sql.VarChar(100), input.nome ?? null)
        .input("fantasia", sql.VarChar(60), input.fantasia ?? null)
        .input("documento", sql.VarChar(20), input.documento ?? null)
        .input("codTipoDocumento", sql.Char(1), input.codTipoDocumento ?? null)
        .input("celular", sql.VarChar(15), input.celular ?? null)
        .input("email", sql.VarChar(100), input.email ?? null)
        .input("segmento", sql.VarChar(30), input.segmentoSistema ?? null)
        .input("situacao", sql.Char(1), input.situacao ?? null)
        .query(`
          UPDATE KS0002.KS00001 SET
            NOME = COALESCE(@nome, NOME),
            FANTASIA = COALESCE(@fantasia, FANTASIA),
            DOCUMENTO = COALESCE(@documento, DOCUMENTO),
            CODTIPODOCUMENTO = COALESCE(@codTipoDocumento, CODTIPODOCUMENTO),
            CELULAR = COALESCE(@celular, CELULAR),
            EMAIL = COALESCE(@email, EMAIL),
            SEGMENTO = COALESCE(@segmento, SEGMENTO),
            SITUACAO = COALESCE(@situacao, SITUACAO),
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDPESSOA = @guidPessoa AND CADEMPRESA = 1
        `);
      res.json({ success: true });
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });

  app.delete("/api/empresas/:id", async (req, res) => {
    try {
      if (!(await assertDataDevRest(req, res))) return;
      const guidPessoa = z.string().uuid().parse(req.params.id);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidPessoa", sql.UniqueIdentifier, guidPessoa)
        .query(`
          UPDATE KS0002.KS00001
          SET SITUACAO = 'I', ULTIMAALTERACAO = GETDATE()
          WHERE GUIDPESSOA = @guidPessoa AND CADEMPRESA = 1
        `);
      res.json({ success: true });
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });

  app.get("/api/empresa/dados", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);

      const dados = await listarDadosEmpresaNf({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      });

      res.json(dados);
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });
}

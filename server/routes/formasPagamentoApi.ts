import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSqlPool, sql } from "../sqlserver";

const guidSchema = z.string().uuid();
const bitValue = z.union([z.boolean(), z.number().int().min(0).max(1)]).transform(Boolean);
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

const formaPagamentoSchema = z.object({
  PAGAMENTO: z.string().min(1).max(100),
  CODFISCAL: z.string().min(1).max(10),
  DESCRICAOFISCAL: z.string().min(1).max(100),
  INTEGRACAOTEF: bitValue.default(false),
  BANDEIRA: z.string().max(50).optional().nullable(),
  CNPJTEF: z.string().max(20).optional().nullable(),
  AUTORIZADORA: z.string().max(100).optional().nullable(),
  SITUACAO: z.enum(["A", "I"]).default("A"),
  GUIDENTIDADE: z.string().uuid(),
  ACEITATROCO: bitValue.default(false),
  BANDEIRATEF: z.string().max(50).optional().nullable(),
  CODIGOTEF: z.string().max(50).optional().nullable(),
  INTEGRATEF: bitValue.default(false),
  CODIGOSEFAZ: z.string().max(10).optional().nullable(),
  DESCRICAO: z.string().max(255).optional().nullable(),
  GUIDCONTA: z.string().uuid().optional().nullable(),
  GUIDNATUREZA: z.string().uuid().optional().nullable(),
  GUIDCENTRO: z.string().uuid().optional().nullable(),
  GUIDCONTABANCARIA: z.string().uuid(),
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

const selectFormasPagamento = `
  SELECT
    GUIDPAGAMENTO,
    PAGAMENTO,
    CODFISCAL,
    DESCRICAOFISCAL,
    INTEGRACAOTEF,
    BANDEIRA,
    CNPJTEF,
    AUTORIZADORA,
    SITUACAO,
    GUIDENTIDADE,
    DATACADASTRO,
    ULTIMAALTERACAO,
    ACEITATROCO,
    BANDEIRATEF,
    CODIGOTEF,
    INTEGRATEF,
    CODIGOSEFAZ,
    DESCRICAO,
    GUIDCONTA,
    GUIDNATUREZA,
    GUIDCENTRO,
    GUIDCONTABANCARIA
  FROM [KS0003].[KS00006]
`;

async function ultimaAlteracaoBanco(guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
      FROM [KS0003].[KS00006]
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

async function listarFormasPagamento(input: { guidEntidade: string; ultimaAlteracao?: string }) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectFormasPagamento}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY ULTIMAALTERACAO
    `);
  return {
    dados: r.recordset,
    ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade),
  };
}

export function registerFormasPagamentoApiRoutes(app: Express) {
  app.get("/api/formas-pagamento/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      res.json({ dados: [], ULTIMAALTERACAO: await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/formas-pagamento", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      res.json(await listarFormasPagamento({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/formas-pagamento/:guidPagamento", async (req, res) => {
    try {
      const guidPagamento = guidSchema.parse(req.params.guidPagamento);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidPagamento", sql.UniqueIdentifier, guidPagamento)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectFormasPagamento}
          WHERE GUIDPAGAMENTO = @guidPagamento
            AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/formas-pagamento", async (req, res) => {
    try {
      const input = formaPagamentoSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("PAGAMENTO", sql.NVarChar(100), input.PAGAMENTO)
        .input("CODFISCAL", sql.NVarChar(10), input.CODFISCAL)
        .input("DESCRICAOFISCAL", sql.NVarChar(100), input.DESCRICAOFISCAL)
        .input("INTEGRACAOTEF", sql.Bit, input.INTEGRACAOTEF ? 1 : 0)
        .input("BANDEIRA", sql.NVarChar(50), input.BANDEIRA ?? null)
        .input("CNPJTEF", sql.NVarChar(20), input.CNPJTEF ?? null)
        .input("AUTORIZADORA", sql.NVarChar(100), input.AUTORIZADORA ?? null)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("ACEITATROCO", sql.Bit, input.ACEITATROCO ? 1 : 0)
        .input("BANDEIRATEF", sql.NVarChar(50), input.BANDEIRATEF ?? null)
        .input("CODIGOTEF", sql.NVarChar(50), input.CODIGOTEF ?? null)
        .input("INTEGRATEF", sql.Bit, input.INTEGRATEF ? 1 : 0)
        .input("CODIGOSEFAZ", sql.NVarChar(10), input.CODIGOSEFAZ ?? null)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("GUIDCONTA", sql.UniqueIdentifier, input.GUIDCONTA ?? null)
        .input("GUIDNATUREZA", sql.UniqueIdentifier, input.GUIDNATUREZA ?? null)
        .input("GUIDCENTRO", sql.UniqueIdentifier, input.GUIDCENTRO ?? null)
        .input("GUIDCONTABANCARIA", sql.UniqueIdentifier, input.GUIDCONTABANCARIA)
        .query(`
          INSERT INTO [KS0003].[KS00006]
            (PAGAMENTO,CODFISCAL,DESCRICAOFISCAL,INTEGRACAOTEF,BANDEIRA,CNPJTEF,AUTORIZADORA,
             SITUACAO,GUIDENTIDADE,ACEITATROCO,BANDEIRATEF,CODIGOTEF,INTEGRATEF,CODIGOSEFAZ,
             DESCRICAO,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,GUIDCONTABANCARIA)
          VALUES
            (@PAGAMENTO,@CODFISCAL,@DESCRICAOFISCAL,@INTEGRACAOTEF,@BANDEIRA,@CNPJTEF,@AUTORIZADORA,
             @SITUACAO,@GUIDENTIDADE,@ACEITATROCO,@BANDEIRATEF,@CODIGOTEF,@INTEGRATEF,@CODIGOSEFAZ,
             @DESCRICAO,@GUIDCONTA,@GUIDNATUREZA,@GUIDCENTRO,@GUIDCONTABANCARIA)
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/formas-pagamento/:guidPagamento", async (req, res) => {
    try {
      const guidPagamento = guidSchema.parse(req.params.guidPagamento);
      const input = formaPagamentoSchema.parse(req.body);
      const pool = await getSqlPool();
      await pool.request()
        .input("GUIDPAGAMENTO", sql.UniqueIdentifier, guidPagamento)
        .input("PAGAMENTO", sql.NVarChar(100), input.PAGAMENTO)
        .input("CODFISCAL", sql.NVarChar(10), input.CODFISCAL)
        .input("DESCRICAOFISCAL", sql.NVarChar(100), input.DESCRICAOFISCAL)
        .input("INTEGRACAOTEF", sql.Bit, input.INTEGRACAOTEF ? 1 : 0)
        .input("BANDEIRA", sql.NVarChar(50), input.BANDEIRA ?? null)
        .input("CNPJTEF", sql.NVarChar(20), input.CNPJTEF ?? null)
        .input("AUTORIZADORA", sql.NVarChar(100), input.AUTORIZADORA ?? null)
        .input("SITUACAO", sql.Char(1), input.SITUACAO)
        .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
        .input("ACEITATROCO", sql.Bit, input.ACEITATROCO ? 1 : 0)
        .input("BANDEIRATEF", sql.NVarChar(50), input.BANDEIRATEF ?? null)
        .input("CODIGOTEF", sql.NVarChar(50), input.CODIGOTEF ?? null)
        .input("INTEGRATEF", sql.Bit, input.INTEGRATEF ? 1 : 0)
        .input("CODIGOSEFAZ", sql.NVarChar(10), input.CODIGOSEFAZ ?? null)
        .input("DESCRICAO", sql.NVarChar(255), input.DESCRICAO ?? null)
        .input("GUIDCONTA", sql.UniqueIdentifier, input.GUIDCONTA ?? null)
        .input("GUIDNATUREZA", sql.UniqueIdentifier, input.GUIDNATUREZA ?? null)
        .input("GUIDCENTRO", sql.UniqueIdentifier, input.GUIDCENTRO ?? null)
        .input("GUIDCONTABANCARIA", sql.UniqueIdentifier, input.GUIDCONTABANCARIA)
        .query(`
          UPDATE [KS0003].[KS00006] SET
            PAGAMENTO=@PAGAMENTO,
            CODFISCAL=@CODFISCAL,
            DESCRICAOFISCAL=@DESCRICAOFISCAL,
            INTEGRACAOTEF=@INTEGRACAOTEF,
            BANDEIRA=@BANDEIRA,
            CNPJTEF=@CNPJTEF,
            AUTORIZADORA=@AUTORIZADORA,
            SITUACAO=@SITUACAO,
            ACEITATROCO=@ACEITATROCO,
            BANDEIRATEF=@BANDEIRATEF,
            CODIGOTEF=@CODIGOTEF,
            INTEGRATEF=@INTEGRATEF,
            CODIGOSEFAZ=@CODIGOSEFAZ,
            DESCRICAO=@DESCRICAO,
            GUIDCONTA=@GUIDCONTA,
            GUIDNATUREZA=@GUIDNATUREZA,
            GUIDCENTRO=@GUIDCENTRO,
            GUIDCONTABANCARIA=@GUIDCONTABANCARIA,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDPAGAMENTO=@GUIDPAGAMENTO
            AND GUIDENTIDADE=@GUIDENTIDADE
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/formas-pagamento/:guidPagamento", async (req, res) => {
    try {
      const guidPagamento = guidSchema.parse(req.params.guidPagamento);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      await pool.request()
        .input("guidPagamento", sql.UniqueIdentifier, guidPagamento)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          UPDATE [KS0003].[KS00006]
          SET
            SITUACAO = 'I',
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDPAGAMENTO = @guidPagamento
          AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true, action: "cancelado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

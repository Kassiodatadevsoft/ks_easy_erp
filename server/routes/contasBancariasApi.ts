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

const contaBancariaSchema = z.object({
  CODCONTA: z.number().int(),
  CONTA: z.string().min(1).max(60),
  BANCO: z.string().max(60).optional().nullable(),
  AGENCIA: z.string().max(20).optional().nullable(),
  NUMEROCONTA: z.string().max(30).optional().nullable(),
  TIPOCONTA: z.enum(["C", "P"]),
  SALDOINICIAL: z.number().default(0),
  SALDOATUAL: z.number().default(0),
  SITUACAO: z.enum(["A", "I"]).default("A"),
  GUIDENTIDADE: z.string().uuid(),
  BOLETOATIVO: bitValue.default(false),
  BOLETOBANCO: z.string().max(20).optional().nullable(),
  BOLETOAMBIENTE: z.string().max(20).optional().nullable(),
  BOLETOCLIENTID: z.string().max(200).optional().nullable(),
  BOLETOCLIENTSECRET: z.string().max(1000).optional().nullable(),
  BOLETOAPIURL: z.string().max(300).optional().nullable(),
  BOLETOTOKENURL: z.string().max(300).optional().nullable(),
  BOLETOEMITIRPATH: z.string().max(300).optional().nullable(),
  BOLETOCONSULTARPATH: z.string().max(300).optional().nullable(),
  BOLETOCANCELARPATH: z.string().max(300).optional().nullable(),
  BOLETOCARTEIRA: z.string().max(50).optional().nullable(),
  BOLETOCONVENIO: z.string().max(80).optional().nullable(),
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

const selectContasBancarias = `
  SELECT
    GUIDCONTA,
    CODCONTA,
    CONTA,
    BANCO,
    AGENCIA,
    NUMEROCONTA,
    TIPOCONTA,
    SALDOINICIAL,
    SALDOATUAL,
    SITUACAO,
    GUIDENTIDADE,
    DATACADASTRO,
    ULTIMAALTERACAO,
    BOLETOATIVO,
    BOLETOBANCO,
    BOLETOAMBIENTE,
    BOLETOCLIENTID,
    BOLETOCLIENTSECRET,
    BOLETOAPIURL,
    BOLETOTOKENURL,
    BOLETOEMITIRPATH,
    BOLETOCONSULTARPATH,
    BOLETOCANCELARPATH,
    BOLETOCARTEIRA,
    BOLETOCONVENIO
  FROM [KS0003].[KS00008]
`;

async function ultimaAlteracaoBanco(guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
      FROM [KS0003].[KS00008]
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

async function listarContasBancarias(input: { guidEntidade: string; ultimaAlteracao?: string }) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectContasBancarias}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY ULTIMAALTERACAO
    `);
  return {
    dados: r.recordset,
    ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade),
  };
}

function addContaInputs(request: ReturnType<Awaited<ReturnType<typeof getSqlPool>>["request"]>, input: z.infer<typeof contaBancariaSchema>) {
  return request
    .input("CODCONTA", sql.Int, input.CODCONTA)
    .input("CONTA", sql.NVarChar(60), input.CONTA)
    .input("BANCO", sql.NVarChar(60), input.BANCO ?? null)
    .input("AGENCIA", sql.NVarChar(20), input.AGENCIA ?? null)
    .input("NUMEROCONTA", sql.NVarChar(30), input.NUMEROCONTA ?? null)
    .input("TIPOCONTA", sql.Char(1), input.TIPOCONTA)
    .input("SALDOINICIAL", sql.Decimal(15, 2), input.SALDOINICIAL)
    .input("SALDOATUAL", sql.Decimal(15, 2), input.SALDOATUAL)
    .input("SITUACAO", sql.Char(1), input.SITUACAO)
    .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
    .input("BOLETOATIVO", sql.Bit, input.BOLETOATIVO ? 1 : 0)
    .input("BOLETOBANCO", sql.NVarChar(20), input.BOLETOBANCO ?? null)
    .input("BOLETOAMBIENTE", sql.NVarChar(20), input.BOLETOAMBIENTE ?? null)
    .input("BOLETOCLIENTID", sql.NVarChar(200), input.BOLETOCLIENTID ?? null)
    .input("BOLETOCLIENTSECRET", sql.NVarChar(sql.MAX), input.BOLETOCLIENTSECRET ?? null)
    .input("BOLETOAPIURL", sql.NVarChar(300), input.BOLETOAPIURL ?? null)
    .input("BOLETOTOKENURL", sql.NVarChar(300), input.BOLETOTOKENURL ?? null)
    .input("BOLETOEMITIRPATH", sql.NVarChar(300), input.BOLETOEMITIRPATH ?? null)
    .input("BOLETOCONSULTARPATH", sql.NVarChar(300), input.BOLETOCONSULTARPATH ?? null)
    .input("BOLETOCANCELARPATH", sql.NVarChar(300), input.BOLETOCANCELARPATH ?? null)
    .input("BOLETOCARTEIRA", sql.NVarChar(50), input.BOLETOCARTEIRA ?? null)
    .input("BOLETOCONVENIO", sql.NVarChar(80), input.BOLETOCONVENIO ?? null);
}

export function registerContasBancariasApiRoutes(app: Express) {
  app.get("/api/contas-bancarias/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      res.json({ dados: [], ULTIMAALTERACAO: await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/contas-bancarias", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      res.json(await listarContasBancarias({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/contas-bancarias/:guidConta", async (req, res) => {
    try {
      const guidConta = guidSchema.parse(req.params.guidConta);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guidConta)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectContasBancarias}
          WHERE GUIDCONTA = @guidConta
            AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/contas-bancarias", async (req, res) => {
    try {
      const input = contaBancariaSchema.parse(req.body);
      const pool = await getSqlPool();
      await addContaInputs(pool.request(), input).query(`
        INSERT INTO [KS0003].[KS00008]
          (CODCONTA,CONTA,BANCO,AGENCIA,NUMEROCONTA,TIPOCONTA,SALDOINICIAL,SALDOATUAL,SITUACAO,GUIDENTIDADE,
           BOLETOATIVO,BOLETOBANCO,BOLETOAMBIENTE,BOLETOCLIENTID,BOLETOCLIENTSECRET,BOLETOAPIURL,BOLETOTOKENURL,
           BOLETOEMITIRPATH,BOLETOCONSULTARPATH,BOLETOCANCELARPATH,BOLETOCARTEIRA,BOLETOCONVENIO)
        VALUES
          (@CODCONTA,@CONTA,@BANCO,@AGENCIA,@NUMEROCONTA,@TIPOCONTA,@SALDOINICIAL,@SALDOATUAL,@SITUACAO,@GUIDENTIDADE,
           @BOLETOATIVO,@BOLETOBANCO,@BOLETOAMBIENTE,@BOLETOCLIENTID,@BOLETOCLIENTSECRET,@BOLETOAPIURL,@BOLETOTOKENURL,
           @BOLETOEMITIRPATH,@BOLETOCONSULTARPATH,@BOLETOCANCELARPATH,@BOLETOCARTEIRA,@BOLETOCONVENIO)
      `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/contas-bancarias/:guidConta", async (req, res) => {
    try {
      const guidConta = guidSchema.parse(req.params.guidConta);
      const input = contaBancariaSchema.parse(req.body);
      const pool = await getSqlPool();
      await addContaInputs(pool.request(), input)
        .input("GUIDCONTA", sql.UniqueIdentifier, guidConta)
        .query(`
          UPDATE [KS0003].[KS00008] SET
            CODCONTA=@CODCONTA,
            CONTA=@CONTA,
            BANCO=@BANCO,
            AGENCIA=@AGENCIA,
            NUMEROCONTA=@NUMEROCONTA,
            TIPOCONTA=@TIPOCONTA,
            SALDOINICIAL=@SALDOINICIAL,
            SALDOATUAL=@SALDOATUAL,
            SITUACAO=@SITUACAO,
            BOLETOATIVO=@BOLETOATIVO,
            BOLETOBANCO=@BOLETOBANCO,
            BOLETOAMBIENTE=@BOLETOAMBIENTE,
            BOLETOCLIENTID=@BOLETOCLIENTID,
            BOLETOCLIENTSECRET=@BOLETOCLIENTSECRET,
            BOLETOAPIURL=@BOLETOAPIURL,
            BOLETOTOKENURL=@BOLETOTOKENURL,
            BOLETOEMITIRPATH=@BOLETOEMITIRPATH,
            BOLETOCONSULTARPATH=@BOLETOCONSULTARPATH,
            BOLETOCANCELARPATH=@BOLETOCANCELARPATH,
            BOLETOCARTEIRA=@BOLETOCARTEIRA,
            BOLETOCONVENIO=@BOLETOCONVENIO,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDCONTA=@GUIDCONTA
            AND GUIDENTIDADE=@GUIDENTIDADE
        `);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/contas-bancarias/:guidConta", async (req, res) => {
    try {
      const guidConta = guidSchema.parse(req.params.guidConta);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      await pool.request()
        .input("guidConta", sql.UniqueIdentifier, guidConta)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          UPDATE [KS0003].[KS00008]
          SET
            SITUACAO = 'I',
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

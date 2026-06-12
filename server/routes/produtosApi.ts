import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSqlPool, sql } from "../sqlserver";

const guidSchema = z.string().uuid();
const nullableString = z.string().optional().nullable();
const nullableDate = z.coerce.date().optional().nullable();
const nullableNumber = z.coerce.number().optional().nullable();
const nonNegativeNumber = z.coerce.number().min(0).default(0);
const bitValue = z
  .union([
    z.boolean(),
    z.number().int().min(0).max(1),
    z.string().transform((value, ctx) => {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") return true;
      if (normalized === "false" || normalized === "0") return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor BIT invalido." });
      return z.NEVER;
    }),
  ])
  .transform(Boolean);

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

const produtoSchema = z.object({
  CODPRODUTO: z.coerce.number().int(),
  PRODUTO: z.string().min(1).max(255),
  DESCRICAO: nullableString,
  CODCATEGORIA: z.coerce.number().int().optional().nullable(),
  GUIDENTIDADECAT: z.string().uuid().optional().nullable(),
  PRECOS: nullableString,
  TAMANHOSDISP: nullableString,
  PRECO: nonNegativeNumber,
  PRECOVENDA: nonNegativeNumber,
  IMAGEURL: nullableString,
  ERPCODE: nullableString,
  DESTAQUE: bitValue.default(false),
  ORDEMEXIBICAO: z.coerce.number().int().default(0),
  SITUACAO: z.enum(["A", "I"]).default("A"),
  GUIDENTIDADE: z.string().uuid(),
  NCM: nullableString,
  CEST: nullableString,
  CFOP: nullableString,
  CSOSN: nullableString,
  ALIQICMS: nullableNumber,
  ALIQPIS: nullableNumber,
  ALIQCOFINS: nullableNumber,
  ALIQIPI: nullableNumber,
  UNIDADE: nullableString,
  ESTOQUE: nonNegativeNumber,
  ESTOQUEMINIMO: nonNegativeNumber,
  PRECOCUSTO: nonNegativeNumber,
  ALIQIBS: nullableNumber,
  ALIQCBS: nullableNumber,
  ALIQIS: nullableNumber,
  CODBENEFIBS: nullableString,
  REGIMETRIB: z.coerce.number().int().optional().nullable(),
  PERCREDUCAO: nullableNumber,
  CODREGIMEESP: nullableString,
  CST: nullableString,
  CODBARRAS: nullableString,
  FRACIONADO: bitValue.default(false),
  ORIGEMPRODUTO: z.coerce.number().int().optional().nullable(),
  PERCDESCONTO: nullableNumber,
  PRECOPROMO: nullableNumber,
  DTINICIOPROMO: nullableDate,
  DTFIMPROMO: nullableDate,
  BALANCA: bitValue.default(false),
  SERVICO: bitValue.default(false),
  ALTERADESCRICAO: bitValue.default(false),
  CODBARRACAIXA: nullableString,
  QTDCAIXA: nullableNumber,
  REFERENCIA: nullableString,
  DELIVERY: bitValue.default(false),
  ALIQICMSFORM: nullableNumber,
  PERCREDUCAOFORM: nullableNumber,
  PERCFRETEFORM: nullableNumber,
  PERCJUROSFORM: nullableNumber,
});

type ProdutoInput = z.infer<typeof produtoSchema>;
type SqlRequest = ReturnType<Awaited<ReturnType<typeof getSqlPool>>["request"]>;

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

const selectProdutos = `
  SELECT *
  FROM [KS0000].[KS00009]
`;

async function ultimaAlteracaoBanco(guidEntidade: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ULTIMAALTERACAO) AS ULTIMAALTERACAO
      FROM [KS0000].[KS00009]
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

async function listarProdutos(input: { guidEntidade: string; ultimaAlteracao?: string }) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`${selectProdutos}
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ULTIMAALTERACAO > @ultimaAlteracao)
      ORDER BY ULTIMAALTERACAO
    `);
  return {
    dados: r.recordset,
    ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade),
  };
}

function addProdutoInputs(request: SqlRequest, input: ProdutoInput) {
  return request
    .input("CODPRODUTO", sql.Int, input.CODPRODUTO)
    .input("PRODUTO", sql.NVarChar(255), input.PRODUTO)
    .input("DESCRICAO", sql.NVarChar(sql.MAX), input.DESCRICAO ?? null)
    .input("CODCATEGORIA", sql.Int, input.CODCATEGORIA ?? null)
    .input("GUIDENTIDADECAT", sql.UniqueIdentifier, input.GUIDENTIDADECAT ?? null)
    .input("PRECOS", sql.NVarChar(sql.MAX), input.PRECOS ?? null)
    .input("TAMANHOSDISP", sql.NVarChar(sql.MAX), input.TAMANHOSDISP ?? null)
    .input("PRECO", sql.Decimal(15, 4), input.PRECO)
    .input("PRECOVENDA", sql.Decimal(15, 4), input.PRECOVENDA)
    .input("IMAGEURL", sql.NVarChar(sql.MAX), input.IMAGEURL ?? null)
    .input("ERPCODE", sql.NVarChar(60), input.ERPCODE ?? null)
    .input("DESTAQUE", sql.Bit, input.DESTAQUE ? 1 : 0)
    .input("ORDEMEXIBICAO", sql.Int, input.ORDEMEXIBICAO)
    .input("SITUACAO", sql.Char(1), input.SITUACAO)
    .input("GUIDENTIDADE", sql.UniqueIdentifier, input.GUIDENTIDADE)
    .input("NCM", sql.NVarChar(10), input.NCM ?? null)
    .input("CEST", sql.NVarChar(10), input.CEST ?? null)
    .input("CFOP", sql.NVarChar(5), input.CFOP ?? null)
    .input("CSOSN", sql.NVarChar(5), input.CSOSN ?? null)
    .input("ALIQICMS", sql.Decimal(9, 4), input.ALIQICMS ?? null)
    .input("ALIQPIS", sql.Decimal(9, 4), input.ALIQPIS ?? null)
    .input("ALIQCOFINS", sql.Decimal(9, 4), input.ALIQCOFINS ?? null)
    .input("ALIQIPI", sql.Decimal(9, 4), input.ALIQIPI ?? null)
    .input("UNIDADE", sql.NVarChar(6), input.UNIDADE ?? null)
    .input("ESTOQUE", sql.Decimal(15, 4), input.ESTOQUE)
    .input("ESTOQUEMINIMO", sql.Decimal(15, 4), input.ESTOQUEMINIMO)
    .input("PRECOCUSTO", sql.Decimal(15, 4), input.PRECOCUSTO)
    .input("ALIQIBS", sql.Decimal(9, 4), input.ALIQIBS ?? null)
    .input("ALIQCBS", sql.Decimal(9, 4), input.ALIQCBS ?? null)
    .input("ALIQIS", sql.Decimal(9, 4), input.ALIQIS ?? null)
    .input("CODBENEFIBS", sql.NVarChar(20), input.CODBENEFIBS ?? null)
    .input("REGIMETRIB", sql.Int, input.REGIMETRIB ?? null)
    .input("PERCREDUCAO", sql.Decimal(9, 4), input.PERCREDUCAO ?? null)
    .input("CODREGIMEESP", sql.NVarChar(10), input.CODREGIMEESP ?? null)
    .input("CST", sql.NVarChar(3), input.CST ?? null)
    .input("CODBARRAS", sql.NVarChar(14), input.CODBARRAS ?? null)
    .input("FRACIONADO", sql.Bit, input.FRACIONADO ? 1 : 0)
    .input("ORIGEMPRODUTO", sql.Int, input.ORIGEMPRODUTO ?? null)
    .input("PERCDESCONTO", sql.Decimal(9, 4), input.PERCDESCONTO ?? null)
    .input("PRECOPROMO", sql.Decimal(15, 4), input.PRECOPROMO ?? null)
    .input("DTINICIOPROMO", sql.DateTime, input.DTINICIOPROMO ?? null)
    .input("DTFIMPROMO", sql.DateTime, input.DTFIMPROMO ?? null)
    .input("BALANCA", sql.Bit, input.BALANCA ? 1 : 0)
    .input("SERVICO", sql.Bit, input.SERVICO ? 1 : 0)
    .input("ALTERADESCRICAO", sql.Bit, input.ALTERADESCRICAO ? 1 : 0)
    .input("CODBARRACAIXA", sql.NVarChar(14), input.CODBARRACAIXA ?? null)
    .input("QTDCAIXA", sql.Decimal(15, 4), input.QTDCAIXA ?? null)
    .input("REFERENCIA", sql.NVarChar(50), input.REFERENCIA ?? null)
    .input("DELIVERY", sql.Bit, input.DELIVERY ? 1 : 0)
    .input("ALIQICMSFORM", sql.Decimal(9, 4), input.ALIQICMSFORM ?? null)
    .input("PERCREDUCAOFORM", sql.Decimal(9, 4), input.PERCREDUCAOFORM ?? null)
    .input("PERCFRETEFORM", sql.Decimal(9, 4), input.PERCFRETEFORM ?? null)
    .input("PERCJUROSFORM", sql.Decimal(9, 4), input.PERCJUROSFORM ?? null);
}

export function registerProdutosApiRoutes(app: Express) {
  app.get("/api/produtos/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      res.json({ dados: [], ULTIMAALTERACAO: await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/produtos", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      res.json(await listarProdutos({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/produtos/:guidProduto", async (req, res) => {
    try {
      const guidProduto = guidSchema.parse(req.params.guidProduto);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidProduto", sql.UniqueIdentifier, guidProduto)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`${selectProdutos}
          WHERE GUIDPRODUTO = @guidProduto
            AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ dados: r.recordset, ULTIMAALTERACAO: maiorUltimaAlteracao(r.recordset) ?? await ultimaAlteracaoBanco(guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/produtos", async (req, res) => {
    try {
      const input = produtoSchema.parse(req.body);
      const pool = await getSqlPool();
      await addProdutoInputs(pool.request(), input).query(`
        INSERT INTO [KS0000].[KS00009]
          (CODPRODUTO,PRODUTO,DESCRICAO,CODCATEGORIA,GUIDENTIDADECAT,PRECOS,TAMANHOSDISP,PRECO,PRECOVENDA,
           IMAGEURL,ERPCODE,DESTAQUE,ORDEMEXIBICAO,SITUACAO,GUIDENTIDADE,NCM,CEST,CFOP,CSOSN,ALIQICMS,
           ALIQPIS,ALIQCOFINS,ALIQIPI,UNIDADE,ESTOQUE,ESTOQUEMINIMO,PRECOCUSTO,ALIQIBS,ALIQCBS,ALIQIS,
           CODBENEFIBS,REGIMETRIB,PERCREDUCAO,CODREGIMEESP,CST,CODBARRAS,FRACIONADO,ORIGEMPRODUTO,
           PERCDESCONTO,PRECOPROMO,DTINICIOPROMO,DTFIMPROMO,BALANCA,SERVICO,ALTERADESCRICAO,CODBARRACAIXA,
           QTDCAIXA,REFERENCIA,DELIVERY,ALIQICMSFORM,PERCREDUCAOFORM,PERCFRETEFORM,PERCJUROSFORM)
        VALUES
          (@CODPRODUTO,@PRODUTO,@DESCRICAO,@CODCATEGORIA,@GUIDENTIDADECAT,@PRECOS,@TAMANHOSDISP,@PRECO,@PRECOVENDA,
           @IMAGEURL,@ERPCODE,@DESTAQUE,@ORDEMEXIBICAO,@SITUACAO,@GUIDENTIDADE,@NCM,@CEST,@CFOP,@CSOSN,@ALIQICMS,
           @ALIQPIS,@ALIQCOFINS,@ALIQIPI,@UNIDADE,@ESTOQUE,@ESTOQUEMINIMO,@PRECOCUSTO,@ALIQIBS,@ALIQCBS,@ALIQIS,
           @CODBENEFIBS,@REGIMETRIB,@PERCREDUCAO,@CODREGIMEESP,@CST,@CODBARRAS,@FRACIONADO,@ORIGEMPRODUTO,
           @PERCDESCONTO,@PRECOPROMO,@DTINICIOPROMO,@DTFIMPROMO,@BALANCA,@SERVICO,@ALTERADESCRICAO,@CODBARRACAIXA,
           @QTDCAIXA,@REFERENCIA,@DELIVERY,@ALIQICMSFORM,@PERCREDUCAOFORM,@PERCFRETEFORM,@PERCJUROSFORM)
      `);
      res.json({ success: true, dados: [] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put("/api/produtos/:guidProduto", async (req, res) => {
    try {
      const guidProduto = guidSchema.parse(req.params.guidProduto);
      const input = produtoSchema.parse(req.body);
      const pool = await getSqlPool();
      await addProdutoInputs(pool.request(), input)
        .input("GUIDPRODUTO", sql.UniqueIdentifier, guidProduto)
        .query(`
          UPDATE [KS0000].[KS00009] SET
            CODPRODUTO=@CODPRODUTO,
            PRODUTO=@PRODUTO,
            DESCRICAO=@DESCRICAO,
            CODCATEGORIA=@CODCATEGORIA,
            GUIDENTIDADECAT=@GUIDENTIDADECAT,
            PRECOS=@PRECOS,
            TAMANHOSDISP=@TAMANHOSDISP,
            PRECO=@PRECO,
            PRECOVENDA=@PRECOVENDA,
            IMAGEURL=@IMAGEURL,
            ERPCODE=@ERPCODE,
            DESTAQUE=@DESTAQUE,
            ORDEMEXIBICAO=@ORDEMEXIBICAO,
            SITUACAO=@SITUACAO,
            NCM=@NCM,
            CEST=@CEST,
            CFOP=@CFOP,
            CSOSN=@CSOSN,
            ALIQICMS=@ALIQICMS,
            ALIQPIS=@ALIQPIS,
            ALIQCOFINS=@ALIQCOFINS,
            ALIQIPI=@ALIQIPI,
            UNIDADE=@UNIDADE,
            ESTOQUE=@ESTOQUE,
            ESTOQUEMINIMO=@ESTOQUEMINIMO,
            PRECOCUSTO=@PRECOCUSTO,
            ALIQIBS=@ALIQIBS,
            ALIQCBS=@ALIQCBS,
            ALIQIS=@ALIQIS,
            CODBENEFIBS=@CODBENEFIBS,
            REGIMETRIB=@REGIMETRIB,
            PERCREDUCAO=@PERCREDUCAO,
            CODREGIMEESP=@CODREGIMEESP,
            CST=@CST,
            CODBARRAS=@CODBARRAS,
            FRACIONADO=@FRACIONADO,
            ORIGEMPRODUTO=@ORIGEMPRODUTO,
            PERCDESCONTO=@PERCDESCONTO,
            PRECOPROMO=@PRECOPROMO,
            DTINICIOPROMO=@DTINICIOPROMO,
            DTFIMPROMO=@DTFIMPROMO,
            BALANCA=@BALANCA,
            SERVICO=@SERVICO,
            ALTERADESCRICAO=@ALTERADESCRICAO,
            CODBARRACAIXA=@CODBARRACAIXA,
            QTDCAIXA=@QTDCAIXA,
            REFERENCIA=@REFERENCIA,
            DELIVERY=@DELIVERY,
            ALIQICMSFORM=@ALIQICMSFORM,
            PERCREDUCAOFORM=@PERCREDUCAOFORM,
            PERCFRETEFORM=@PERCFRETEFORM,
            PERCJUROSFORM=@PERCJUROSFORM,
            ULTIMAALTERACAO=GETDATE()
          WHERE GUIDPRODUTO=@GUIDPRODUTO
            AND GUIDENTIDADE=@GUIDENTIDADE
        `);
      res.json({ success: true, dados: [] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/produtos/:guidProduto", async (req, res) => {
    try {
      const guidProduto = guidSchema.parse(req.params.guidProduto);
      const guidEntidade = guidSchema.parse(getGuidEntidade(req));
      const pool = await getSqlPool();
      await pool.request()
        .input("guidProduto", sql.UniqueIdentifier, guidProduto)
        .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
        .query(`
          UPDATE [KS0000].[KS00009]
          SET
            SITUACAO = 'I',
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDPRODUTO = @guidProduto
          AND GUIDENTIDADE = @guidEntidade
        `);
      res.json({ success: true, dados: [], action: "cancelado" });
    } catch (error) {
      sendError(res, error);
    }
  });
}

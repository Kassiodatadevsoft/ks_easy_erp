import type { Express, Request, Response } from "express";
import { z } from "zod";
import { getSqlPool, sql } from "../sqlserver";
import { garantirTabelaProdutoUnidadePreco } from "../services/produtoUnidadePreco";

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

function maxDateValue(...values: unknown[]) {
  let max: Date | string | null = null;
  let maxTime = 0;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value as string | Date).getTime();
    if (!Number.isNaN(time) && time > maxTime) {
      maxTime = time;
      max = value as Date | string;
    }
  }
  return max;
}

function asGuidString(value: unknown) {
  return String(value ?? "").toLowerCase();
}

async function existeTabela(nome: string) {
  const pool = await getSqlPool();
  const r = await pool.request()
    .input("nome", sql.NVarChar(160), nome)
    .query("SELECT CASE WHEN OBJECT_ID(@nome, 'U') IS NULL THEN 0 ELSE 1 END AS existe");
  return Boolean(r.recordset[0]?.existe);
}

async function listarProdutosOffline(input: {
  guidEntidade: string;
  ultimaAlteracao?: string;
  situacao?: string;
  limite?: number;
}) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);
  const situacao = String(input.situacao ?? "A").toUpperCase();
  const limite = Math.min(Math.max(Number(input.limite ?? 5000), 1), 20000);
  const pool = await getSqlPool();

  await garantirTabelaProdutoUnidadePreco();

  const produtosResult = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .input("situacao", sql.NVarChar(10), situacao)
    .input("limite", sql.Int, limite)
    .query(`
      SELECT TOP (@limite)
        p.*,
        CAST(c.GUIDCATEGORIA AS NVARCHAR(36)) AS CATEGORIA_GUID,
        c.CATEGORIA AS CATEGORIA_NOME,
        c.DESCRICAO AS CATEGORIA_DESCRICAO,
        c.SLUG AS CATEGORIA_SLUG,
        c.ORDEMEXIBICAO AS CATEGORIA_ORDEMEXIBICAO,
        c.SITUACAO AS CATEGORIA_SITUACAO,
        c.ULTIMAALTERACAO AS CATEGORIA_ULTIMAALTERACAO
      FROM KS0000.KS00009 p
      LEFT JOIN KS0000.KS00008 c
        ON c.CODCATEGORIA = p.CODCATEGORIA
       AND c.GUIDENTIDADE = p.GUIDENTIDADE
      WHERE p.GUIDENTIDADE = @guidEntidade
        AND (@situacao = 'TODOS' OR p.SITUACAO = @situacao)
        AND (
          @ultimaAlteracao IS NULL
          OR ISNULL(p.ULTIMAALTERACAO, p.DATACADASTRO) > @ultimaAlteracao
          OR ISNULL(c.ULTIMAALTERACAO, c.DATACADASTRO) > @ultimaAlteracao
        )
      ORDER BY ISNULL(p.ULTIMAALTERACAO, p.DATACADASTRO), p.CODPRODUTO
    `);

  const categoriasResult = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .query(`
      SELECT *
      FROM KS0000.KS00008
      WHERE GUIDENTIDADE = @guidEntidade
        AND (@ultimaAlteracao IS NULL OR ISNULL(ULTIMAALTERACAO, DATACADASTRO) > @ultimaAlteracao)
      ORDER BY CATEGORIA
    `);

  const faixasResult = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
    .input("situacao", sql.NVarChar(10), situacao)
    .query(`
      SELECT f.*
      FROM KS0004.ProdutoUnidadePreco f
      INNER JOIN KS0000.KS00009 p
        ON p.GUIDPRODUTO = f.GUIDPRODUTO
       AND p.GUIDENTIDADE = f.GUIDENTIDADE
      WHERE f.GUIDENTIDADE = @guidEntidade
        AND (@situacao = 'TODOS' OR p.SITUACAO = @situacao)
        AND (
          @ultimaAlteracao IS NULL
          OR ISNULL(f.ULTIMAALTERACAO, f.DATACADASTRO) > @ultimaAlteracao
          OR ISNULL(p.ULTIMAALTERACAO, p.DATACADASTRO) > @ultimaAlteracao
        )
      ORDER BY f.GUIDPRODUTO, f.UNIDADE, f.QUANTIDADEMINIMA
    `);

  let imeis: Record<string, unknown>[] = [];
  if (await existeTabela("KS0005.KS_PRODUTOS_IMEI")) {
    const imeisResult = await pool.request()
      .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
      .input("ultimaAlteracao", sql.DateTime, ultimaAlteracao)
      .input("situacao", sql.NVarChar(10), situacao)
      .query(`
        SELECT i.*
        FROM KS0005.KS_PRODUTOS_IMEI i
        INNER JOIN KS0000.KS00009 p
          ON p.GUIDPRODUTO = i.GUIDPRODUTO
         AND p.GUIDENTIDADE = i.GUIDENTIDADE
        WHERE i.GUIDENTIDADE = @guidEntidade
          AND (@situacao = 'TODOS' OR p.SITUACAO = @situacao)
          AND (
            @ultimaAlteracao IS NULL
            OR ISNULL(i.ULTIMAALTERACAO, i.DATAENTRADA) > @ultimaAlteracao
            OR ISNULL(p.ULTIMAALTERACAO, p.DATACADASTRO) > @ultimaAlteracao
          )
        ORDER BY i.GUIDPRODUTO, i.IMEI1, i.NUMEROSERIE
      `);
    imeis = imeisResult.recordset;
  }

  const faixasPorProduto = new Map<string, Record<string, unknown>[]>();
  for (const faixa of faixasResult.recordset) {
    const key = asGuidString(faixa.GUIDPRODUTO);
    if (!faixasPorProduto.has(key)) faixasPorProduto.set(key, []);
    faixasPorProduto.get(key)?.push(faixa);
  }

  const imeisPorProduto = new Map<string, Record<string, unknown>[]>();
  for (const imei of imeis) {
    const key = asGuidString(imei.GUIDPRODUTO);
    if (!imeisPorProduto.has(key)) imeisPorProduto.set(key, []);
    imeisPorProduto.get(key)?.push(imei);
  }

  const produtos = produtosResult.recordset.map((produto) => ({
    ...produto,
    categoria: {
      GUIDCATEGORIA: produto.CATEGORIA_GUID ?? produto.GUIDENTIDADECAT ?? null,
      CODCATEGORIA: produto.CODCATEGORIA ?? null,
      CATEGORIA: produto.CATEGORIA_NOME ?? null,
      DESCRICAO: produto.CATEGORIA_DESCRICAO ?? null,
      SLUG: produto.CATEGORIA_SLUG ?? null,
      ORDEMEXIBICAO: produto.CATEGORIA_ORDEMEXIBICAO ?? null,
      SITUACAO: produto.CATEGORIA_SITUACAO ?? null,
      ULTIMAALTERACAO: produto.CATEGORIA_ULTIMAALTERACAO ?? null,
    },
    faixasPreco: faixasPorProduto.get(asGuidString(produto.GUIDPRODUTO)) ?? [],
    imeis: imeisPorProduto.get(asGuidString(produto.GUIDPRODUTO)) ?? [],
  }));

  const ultima = maxDateValue(
    maiorUltimaAlteracao(produtosResult.recordset),
    maiorUltimaAlteracao(categoriasResult.recordset),
    maiorUltimaAlteracao(faixasResult.recordset),
    maiorUltimaAlteracao(imeis as Array<{ ULTIMAALTERACAO?: Date | string | null }>)
  ) ?? await ultimaAlteracaoBanco(guidEntidade);

  return {
    success: true,
    sincronizadoEm: new Date().toISOString(),
    origem: {
      produtos: "KS0000.KS00009",
      categorias: "KS0000.KS00008",
      faixasPreco: "KS0004.ProdutoUnidadePreco",
      imeis: "KS0005.KS_PRODUTOS_IMEI",
    },
    filtros: {
      guidEntidade,
      ultimaAlteracao: ultimaAlteracao ? ultimaAlteracao.toISOString() : null,
      situacao,
      limite,
    },
    totais: {
      produtos: produtos.length,
      categorias: categoriasResult.recordset.length,
      faixasPreco: faixasResult.recordset.length,
      imeis: imeis.length,
    },
    ULTIMAALTERACAO: ultima,
    dados: produtos,
    categorias: categoriasResult.recordset,
    faixasPreco: faixasResult.recordset,
    imeis,
  };
}

async function ultimaAlteracaoProdutosOffline(guidEntidadeInput: string) {
  const guidEntidade = guidSchema.parse(guidEntidadeInput);
  const pool = await getSqlPool();
  await garantirTabelaProdutoUnidadePreco();

  const produtos = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ISNULL(ULTIMAALTERACAO, DATACADASTRO)) AS ULTIMAALTERACAO
      FROM KS0000.KS00009
      WHERE GUIDENTIDADE = @guidEntidade
    `);

  const categorias = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ISNULL(ULTIMAALTERACAO, DATACADASTRO)) AS ULTIMAALTERACAO
      FROM KS0000.KS00008
      WHERE GUIDENTIDADE = @guidEntidade
    `);

  const faixasPreco = await pool.request()
    .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT MAX(ISNULL(ULTIMAALTERACAO, DATACADASTRO)) AS ULTIMAALTERACAO
      FROM KS0004.ProdutoUnidadePreco
      WHERE GUIDENTIDADE = @guidEntidade
    `);

  let imeisUltimaAlteracao: Date | string | null = null;
  if (await existeTabela("KS0005.KS_PRODUTOS_IMEI")) {
    const imeis = await pool.request()
      .input("guidEntidade", sql.UniqueIdentifier, guidEntidade)
      .query(`
        SELECT MAX(ISNULL(ULTIMAALTERACAO, DATAENTRADA)) AS ULTIMAALTERACAO
        FROM KS0005.KS_PRODUTOS_IMEI
        WHERE GUIDENTIDADE = @guidEntidade
      `);
    imeisUltimaAlteracao = imeis.recordset[0]?.ULTIMAALTERACAO ?? null;
  }

  const ultima = maxDateValue(
    produtos.recordset[0]?.ULTIMAALTERACAO,
    categorias.recordset[0]?.ULTIMAALTERACAO,
    faixasPreco.recordset[0]?.ULTIMAALTERACAO,
    imeisUltimaAlteracao
  );

  return {
    success: true,
    guidEntidade,
    consultadoEm: new Date().toISOString(),
    ULTIMAALTERACAO: ultima,
    tabelas: {
      produtos: produtos.recordset[0]?.ULTIMAALTERACAO ?? null,
      categorias: categorias.recordset[0]?.ULTIMAALTERACAO ?? null,
      faixasPreco: faixasPreco.recordset[0]?.ULTIMAALTERACAO ?? null,
      imeis: imeisUltimaAlteracao,
    },
  };
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

  app.get("/api/produtos/offline-sync", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);
      const situacao = firstQueryValue(req.query.situacao);
      const limite = firstQueryValue(req.query.limite);
      res.json(await listarProdutosOffline({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
        situacao: situacao == null ? undefined : String(situacao),
        limite: limite == null ? undefined : Number(limite),
      }));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/produtos/offline-sync/ultima-alteracao", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      res.json(await ultimaAlteracaoProdutosOffline(String(guidEntidade ?? "")));
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

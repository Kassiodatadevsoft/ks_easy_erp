import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/ks_session=([^;]+)/);
  return await verifyKsSession(match?.[1]);
}
import sql from "mssql";

const produtoBase = z.object({
  produto:       z.string().min(2).max(100),
  descricao:     z.string().max(500).optional(),
  guidCategoria: z.string().uuid().optional(),
  unidade:       z.string().max(6).default("UN"),
  unidadeFiscal: z.string().max(6).optional(),
  codBarras:     z.string().max(30).optional(),
  referencia:    z.string().max(30).optional(),
  ncm:           z.string().max(10).optional(),
  cest:          z.string().max(10).optional(),
  cfop:          z.string().max(5).optional(),
  csosn:         z.string().max(4).optional(),
  aliqIcms:      z.number().min(0).max(100).default(0),
  aliqPis:       z.number().min(0).max(100).default(0),
  aliqCofins:    z.number().min(0).max(100).default(0),
  preco:         z.number().min(0).default(0),
  precoVenda:    z.number().min(0).default(0),
  precoMinimo:   z.number().min(0).default(0),
  estoque:       z.number().default(0),
  estoqueMinimo: z.number().min(0).default(0),
  tamanho1:      z.string().max(20).optional(),
  tamanho2:      z.string().max(20).optional(),
  tamanho3:      z.string().max(20).optional(),
  tamanho4:      z.string().max(20).optional(),
  tamanho5:      z.string().max(20).optional(),
  tamanho6:      z.string().max(20).optional(),
  tamanho7:      z.string().max(20).optional(),
  fracionado:    z.number().int().min(0).max(1).default(0),
  situacao:      z.enum(["A", "I"]).default("A"),
});

export const produtosErpRouter = router({
  listar: publicProcedure
    .input(z.object({
      busca:         z.string().optional(),
      situacao:      z.string().optional(),
      guidCategoria: z.string().optional(),
      page:          z.number().int().min(1).default(1),
      pageSize:      z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conds = ["p.GUIDENTIDADE = @guidentidade"];
      if (input?.situacao) conds.push(`p.SITUACAO = '${input.situacao.replace(/'/g, "''")}'`);
      if (input?.guidCategoria) conds.push("p.GUIDCATEGORIA = @guidCategoria");
      if (input?.busca) conds.push("(p.PRODUTO LIKE @busca OR p.CODBARRAS LIKE @busca OR p.REFERENCIA LIKE @busca)");
      const where = conds.join(" AND ");

      const guidEnt = session.guidEntidade;
      function addParams(req: ReturnType<typeof pool.request>) {
        req.input("guidentidade", sql.UniqueIdentifier, guidEnt);
        if (input?.guidCategoria) req.input("guidCategoria", sql.UniqueIdentifier, input.guidCategoria);
        if (input?.busca) req.input("busca", sql.NVarChar(200), `%${input.busca}%`);
        return req;
      }

      const countR = await addParams(pool.request())
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0004.KS00001 p WHERE ${where}`);
      const total = (countR.recordset[0] as { TOTAL: number }).TOTAL;

      const r = await addParams(pool.request())
        .input("offset",   sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(p.GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
            p.CODPRODUTO, p.PRODUTO, p.DESCRICAO,
            CAST(p.GUIDCATEGORIA AS NVARCHAR(36)) AS guidCategoria,
            c.CATEGORIA AS nomeCategoria,
            p.UNIDADE, p.UNIDADEFISCAL, p.CODBARRAS, p.REFERENCIA,
            p.NCM, p.CEST, p.CFOP, p.CSOSN,
            p.ALIQICMS, p.ALIQPIS, p.ALIQCOFINS,
            p.PRECO, p.PRECOVENDA, p.PRECOMINIMO,
            p.ESTOQUE, p.ESTOQUEMINIMO,
            p.TAMANHO1, p.TAMANHO2, p.TAMANHO3, p.TAMANHO4,
            p.TAMANHO5, p.TAMANHO6, p.TAMANHO7,
            p.FRACIONADO, p.SITUACAO,
            p.DATACADASTRO, p.ULTIMAALTERACAO
          FROM KS0004.KS00001 p
          LEFT JOIN KS0004.KS00002 c ON c.GUIDCATEGORIA = p.GUIDCATEGORIA
          WHERE ${where}
          ORDER BY p.PRODUTO ASC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: r.recordset, total };
    }),

  buscar: publicProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("busca", sql.NVarChar(200), `%${input.q}%`)
        .query(`
          SELECT TOP 20
            CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
            PRODUTO, CODBARRAS, UNIDADE, ESTOQUE, PRECOVENDA
          FROM KS0004.KS00001
          WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
            AND (PRODUTO LIKE @busca OR CODBARRAS LIKE @busca OR REFERENCIA LIKE @busca)
          ORDER BY PRODUTO ASC
        `);
      return r.recordset as { guidProduto: string; PRODUTO: string; CODBARRAS: string; UNIDADE: string; ESTOQUE: number; PRECOVENDA: number }[];
    }),

  criar: publicProcedure
    .input(produtoBase)
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      const guid = crypto.randomUUID();
      await pool.request()
        .input("guidproduto",    sql.UniqueIdentifier, guid)
        .input("produto",        sql.NVarChar(100),    input.produto.toUpperCase())
        .input("descricao",      sql.NVarChar(500),    input.descricao?.toUpperCase() ?? null)
        .input("guidcategoria",  sql.UniqueIdentifier, input.guidCategoria ?? null)
        .input("unidade",        sql.NVarChar(6),      input.unidade.toUpperCase())
        .input("unidadefiscal",  sql.NVarChar(6),      input.unidadeFiscal?.toUpperCase() ?? null)
        .input("codbarras",      sql.NVarChar(30),     input.codBarras ?? null)
        .input("referencia",     sql.NVarChar(30),     input.referencia?.toUpperCase() ?? null)
        .input("ncm",            sql.NVarChar(10),     input.ncm ?? null)
        .input("cest",           sql.NVarChar(10),     input.cest ?? null)
        .input("cfop",           sql.NVarChar(5),      input.cfop ?? null)
        .input("csosn",          sql.NVarChar(4),      input.csosn ?? null)
        .input("aliqicms",       sql.Decimal(7,4),     input.aliqIcms)
        .input("aliqpis",        sql.Decimal(7,4),     input.aliqPis)
        .input("aliqcofins",     sql.Decimal(7,4),     input.aliqCofins)
        .input("preco",          sql.Decimal(15,4),    input.preco)
        .input("precovenda",     sql.Decimal(15,4),    input.precoVenda)
        .input("precominimo",    sql.Decimal(15,4),    input.precoMinimo)
        .input("estoque",        sql.Decimal(15,4),    input.estoque)
        .input("estoqueminimo",  sql.Decimal(15,4),    input.estoqueMinimo)
        .input("tamanho1",       sql.NVarChar(20),     input.tamanho1?.toUpperCase() ?? null)
        .input("tamanho2",       sql.NVarChar(20),     input.tamanho2?.toUpperCase() ?? null)
        .input("tamanho3",       sql.NVarChar(20),     input.tamanho3?.toUpperCase() ?? null)
        .input("tamanho4",       sql.NVarChar(20),     input.tamanho4?.toUpperCase() ?? null)
        .input("tamanho5",       sql.NVarChar(20),     input.tamanho5?.toUpperCase() ?? null)
        .input("tamanho6",       sql.NVarChar(20),     input.tamanho6?.toUpperCase() ?? null)
        .input("tamanho7",       sql.NVarChar(20),     input.tamanho7?.toUpperCase() ?? null)
        .input("fracionado",     sql.TinyInt,          input.fracionado)
        .input("situacao",       sql.Char(1),          input.situacao)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0004.KS00001 (
            GUIDPRODUTO, PRODUTO, DESCRICAO, GUIDCATEGORIA, UNIDADE, UNIDADEFISCAL,
            CODBARRAS, REFERENCIA, NCM, CEST, CFOP, CSOSN,
            ALIQICMS, ALIQPIS, ALIQCOFINS,
            PRECO, PRECOVENDA, PRECOMINIMO, ESTOQUE, ESTOQUEMINIMO,
            TAMANHO1, TAMANHO2, TAMANHO3, TAMANHO4, TAMANHO5, TAMANHO6, TAMANHO7,
            FRACIONADO, SITUACAO, GUIDENTIDADE
          ) VALUES (
            @guidproduto, @produto, @descricao, @guidcategoria, @unidade, @unidadefiscal,
            @codbarras, @referencia, @ncm, @cest, @cfop, @csosn,
            @aliqicms, @aliqpis, @aliqcofins,
            @preco, @precovenda, @precominimo, @estoque, @estoqueminimo,
            @tamanho1, @tamanho2, @tamanho3, @tamanho4, @tamanho5, @tamanho6, @tamanho7,
            @fracionado, @situacao, @guidentidade
          )
        `);
      return { guidProduto: guid };
    }),

  atualizar: publicProcedure
    .input(produtoBase.extend({ guidProduto: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await pool.request()
        .input("guidproduto",    sql.UniqueIdentifier, input.guidProduto)
        .input("produto",        sql.NVarChar(100),    input.produto.toUpperCase())
        .input("descricao",      sql.NVarChar(500),    input.descricao?.toUpperCase() ?? null)
        .input("guidcategoria",  sql.UniqueIdentifier, input.guidCategoria ?? null)
        .input("unidade",        sql.NVarChar(6),      input.unidade.toUpperCase())
        .input("unidadefiscal",  sql.NVarChar(6),      input.unidadeFiscal?.toUpperCase() ?? null)
        .input("codbarras",      sql.NVarChar(30),     input.codBarras ?? null)
        .input("referencia",     sql.NVarChar(30),     input.referencia?.toUpperCase() ?? null)
        .input("ncm",            sql.NVarChar(10),     input.ncm ?? null)
        .input("cest",           sql.NVarChar(10),     input.cest ?? null)
        .input("cfop",           sql.NVarChar(5),      input.cfop ?? null)
        .input("csosn",          sql.NVarChar(4),      input.csosn ?? null)
        .input("aliqicms",       sql.Decimal(7,4),     input.aliqIcms)
        .input("aliqpis",        sql.Decimal(7,4),     input.aliqPis)
        .input("aliqcofins",     sql.Decimal(7,4),     input.aliqCofins)
        .input("preco",          sql.Decimal(15,4),    input.preco)
        .input("precovenda",     sql.Decimal(15,4),    input.precoVenda)
        .input("precominimo",    sql.Decimal(15,4),    input.precoMinimo)
        .input("estoque",        sql.Decimal(15,4),    input.estoque)
        .input("estoqueminimo",  sql.Decimal(15,4),    input.estoqueMinimo)
        .input("tamanho1",       sql.NVarChar(20),     input.tamanho1?.toUpperCase() ?? null)
        .input("tamanho2",       sql.NVarChar(20),     input.tamanho2?.toUpperCase() ?? null)
        .input("tamanho3",       sql.NVarChar(20),     input.tamanho3?.toUpperCase() ?? null)
        .input("tamanho4",       sql.NVarChar(20),     input.tamanho4?.toUpperCase() ?? null)
        .input("tamanho5",       sql.NVarChar(20),     input.tamanho5?.toUpperCase() ?? null)
        .input("tamanho6",       sql.NVarChar(20),     input.tamanho6?.toUpperCase() ?? null)
        .input("tamanho7",       sql.NVarChar(20),     input.tamanho7?.toUpperCase() ?? null)
        .input("fracionado",     sql.TinyInt,          input.fracionado)
        .input("situacao",       sql.Char(1),          input.situacao)
        .input("guidentidade",   sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0004.KS00001 SET
            PRODUTO=@produto, DESCRICAO=@descricao, GUIDCATEGORIA=@guidcategoria,
            UNIDADE=@unidade, UNIDADEFISCAL=@unidadefiscal,
            CODBARRAS=@codbarras, REFERENCIA=@referencia,
            NCM=@ncm, CEST=@cest, CFOP=@cfop, CSOSN=@csosn,
            ALIQICMS=@aliqicms, ALIQPIS=@aliqpis, ALIQCOFINS=@aliqcofins,
            PRECO=@preco, PRECOVENDA=@precovenda, PRECOMINIMO=@precominimo,
            ESTOQUE=@estoque, ESTOQUEMINIMO=@estoqueminimo,
            TAMANHO1=@tamanho1, TAMANHO2=@tamanho2, TAMANHO3=@tamanho3,
            TAMANHO4=@tamanho4, TAMANHO5=@tamanho5, TAMANHO6=@tamanho6, TAMANHO7=@tamanho7,
            FRACIONADO=@fracionado, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade
        `);
      return { ok: true };
    }),

  excluir: publicProcedure
    .input(z.object({ guidProduto: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      // Verificar se há movimentações
      const check = await pool.request()
        .input("guidproduto",  sql.UniqueIdentifier, input.guidProduto)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0004.KS00003 WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade`);
      const total = (check.recordset[0] as { TOTAL: number }).TOTAL;
      if (total > 0) throw new Error(`Produto possui ${total} movimentação(ões) de estoque. Inative-o em vez de excluir.`);
      await pool.request()
        .input("guidproduto",  sql.UniqueIdentifier, input.guidProduto)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`DELETE FROM KS0004.KS00001 WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade`);
      return { ok: true };
    }),

  resumoEstoque: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { totalProdutos: 0, valorEstoque: 0, abaixoMinimo: 0, semEstoque: 0 };
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            COUNT(*) AS totalProdutos,
            ISNULL(SUM(ESTOQUE * PRECOVENDA), 0) AS valorEstoque,
            SUM(CASE WHEN ESTOQUE < ESTOQUEMINIMO AND ESTOQUEMINIMO > 0 THEN 1 ELSE 0 END) AS abaixoMinimo,
            SUM(CASE WHEN ESTOQUE <= 0 THEN 1 ELSE 0 END) AS semEstoque
          FROM KS0004.KS00001
          WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
        `);
      const row = r.recordset[0] as { totalProdutos: number; valorEstoque: number; abaixoMinimo: number; semEstoque: number };
      return row;
    }),

  produtosCriticos: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 20
            CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
            PRODUTO, ESTOQUE, ESTOQUEMINIMO, UNIDADE,
            CASE WHEN ESTOQUE <= 0 THEN 'SEM_ESTOQUE' ELSE 'ABAIXO_MINIMO' END AS status
          FROM KS0004.KS00001
          WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
            AND (ESTOQUE <= 0 OR (ESTOQUEMINIMO > 0 AND ESTOQUE < ESTOQUEMINIMO))
          ORDER BY ESTOQUE ASC
        `);
      return r.recordset;
    }),
});

import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import { auditarFinanceiro, garantirTabelasConciliacaoFinanceira } from "./conciliacaoFinanceiraRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  return session;
}

export async function garantirTabelasSugestaoCompra(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await garantirTabelasConciliacaoFinanceira(pool);

  const productColumns = [
    ["ESTOQUEMAXIMO", "DECIMAL(15,4) NULL"],
    ["PONTOREPOSICAO", "DECIMAL(15,4) NULL"],
    ["GUIDFORNECEDOR", "UNIQUEIDENTIFIER NULL"],
    ["MARCA", "NVARCHAR(80) NULL"],
    ["CURVAABC", "CHAR(1) NULL"],
  ] as const;
  for (const [column, definition] of productColumns) {
    await pool.request()
      .input("columnName", sql.NVarChar(128), column)
      .query(`
        IF COL_LENGTH('KS0004.KS00001', @columnName) IS NULL
          ALTER TABLE KS0004.KS00001 ADD ${column} ${definition}
      `);
  }

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0004' AND TABLE_NAME='KS00010')
    CREATE TABLE KS0004.KS00010 (
      GUIDSUGESTAO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      TIPO NVARCHAR(30) NOT NULL DEFAULT 'SOLICITACAO',
      DIASVENDA INT NOT NULL DEFAULT 30,
      DIASCOBERTURA INT NOT NULL DEFAULT 30,
      CONSIDERARPEDIDOS BIT NOT NULL DEFAULT 1,
      CONSIDERARRESERVADO BIT NOT NULL DEFAULT 0,
      APENASATIVOS BIT NOT NULL DEFAULT 1,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'ABERTO',
      OBSERVACAO NVARCHAR(500) NULL,
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0004' AND TABLE_NAME='KS00011')
    CREATE TABLE KS0004.KS00011 (
      GUIDITEM UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDSUGESTAO UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      GUIDPRODUTO UNIQUEIDENTIFIER NOT NULL,
      GUIDFORNECEDOR UNIQUEIDENTIFIER NULL,
      PRODUTO NVARCHAR(120) NOT NULL,
      CODPRODUTO INT NULL,
      QUANTIDADESUGERIDA DECIMAL(15,4) NOT NULL,
      QUANTIDADEALTERADA DECIMAL(15,4) NULL,
      CUSTOMEDIO DECIMAL(15,4) NOT NULL DEFAULT 0,
      VALORESTIMADO DECIMAL(15,2) NOT NULL DEFAULT 0,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'ABERTO',
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0004' AND TABLE_NAME='KS00012')
    CREATE TABLE KS0004.KS00012 (
      GUIDHISTORICO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDSUGESTAO UNIQUEIDENTIFIER NULL,
      GUIDITEM UNIQUEIDENTIFIER NULL,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      ACAO NVARCHAR(60) NOT NULL,
      DESCRICAO NVARCHAR(500) NULL,
      VALORANTERIOR NVARCHAR(MAX) NULL,
      VALORNOVO NVARCHAR(MAX) NULL,
      USUARIO UNIQUEIDENTIFIER NULL,
      DATAHORA DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

export const sugestaoCompraRouter = router({
  listar: publicProcedure
    .input(z.object({
      produto: z.string().optional(),
      guidCategoria: z.string().uuid().optional(),
      fornecedor: z.string().optional(),
      marca: z.string().optional(),
      estoqueBaixo: z.boolean().default(true),
      estoqueZerado: z.boolean().default(false),
      comVendaUltimosDias: z.boolean().default(false),
      semPedidoCompra: z.boolean().default(false),
      curvaAbc: z.string().length(1).optional(),
      situacao: z.enum(["A", "I", "TODOS"]).default("A"),
      diasVenda: z.number().int().min(1).max(365).default(30),
      diasCobertura: z.number().int().min(1).max(365).default(30),
      considerarPedidos: z.boolean().default(true),
      considerarReservado: z.boolean().default(false),
      fornecedorPreferencial: z.string().uuid().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasSugestaoCompra(pool);
      const cfg = {
        diasVenda: input?.diasVenda ?? 30,
        diasCobertura: input?.diasCobertura ?? 30,
        considerarPedidos: input?.considerarPedidos ?? true,
        situacao: input?.situacao ?? "A",
      };
      const where = ["p.GUIDENTIDADE=@guidentidade"];
      if (cfg.situacao !== "TODOS") where.push("p.SITUACAO=@situacao");
      if (input?.produto) where.push("(p.PRODUTO LIKE @produto OR p.CODBARRAS LIKE @produto OR p.REFERENCIA LIKE @produto)");
      if (input?.guidCategoria) where.push("p.GUIDCATEGORIA=@guidcategoria");
      if (input?.marca) where.push("p.MARCA LIKE @marca");
      if (input?.curvaAbc) where.push("p.CURVAABC=@curvaabc");
      if (input?.fornecedorPreferencial) where.push("p.GUIDFORNECEDOR=@fornecedorPreferencial");
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("situacao", sql.Char(1), cfg.situacao)
        .input("diasVenda", sql.Int, cfg.diasVenda)
        .input("diasCobertura", sql.Int, cfg.diasCobertura)
        .input("fornecedorPreferencial", sql.UniqueIdentifier, input?.fornecedorPreferencial ?? null);
      if (input?.produto) req.input("produto", sql.NVarChar(200), `%${input.produto}%`);
      if (input?.guidCategoria) req.input("guidcategoria", sql.UniqueIdentifier, input.guidCategoria);
      if (input?.marca) req.input("marca", sql.NVarChar(90), `%${input.marca}%`);
      if (input?.curvaAbc) req.input("curvaabc", sql.Char(1), input.curvaAbc);

      const raw = await req.query(`
        SELECT TOP 500
          CAST(p.GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
          p.CODPRODUTO, p.PRODUTO, c.CATEGORIA AS categoria, p.MARCA, p.CURVAABC,
          CAST(p.GUIDFORNECEDOR AS NVARCHAR(36)) AS guidFornecedor,
          forn.NOME AS fornecedorPrincipal,
          ISNULL(p.ESTOQUE,0) AS estoqueAtual,
          ISNULL(p.ESTOQUEMINIMO,0) AS estoqueMinimo,
          ISNULL(p.ESTOQUEMAXIMO,0) AS estoqueMaximo,
          ISNULL(p.PONTOREPOSICAO,0) AS pontoReposicao,
          ISNULL(p.PRECO,0) AS custoMedio,
          ISNULL(v.vendaPeriodo,0) AS vendaPeriodo,
          CAST(ISNULL(v.vendaPeriodo,0) / NULLIF(@diasVenda,0) AS DECIMAL(15,4)) AS mediaVendaDiaria,
          ISNULL(pc.quantidadePendente,0) AS quantidadePedidoCompra,
          p.SITUACAO,
          CASE
            WHEN ISNULL(p.ESTOQUE,0) <= 0 THEN 'ZERADO'
            WHEN ISNULL(p.ESTOQUE,0) <= ISNULL(NULLIF(p.PONTOREPOSICAO,0), ISNULL(p.ESTOQUEMINIMO,0)) THEN 'ESTOQUE_BAIXO'
            WHEN (ISNULL(v.vendaPeriodo,0) / NULLIF(@diasVenda,0)) * @diasCobertura > ISNULL(p.ESTOQUE,0) THEN 'PREVISAO_INSUFICIENTE'
            ELSE 'NORMAL'
          END AS status
        FROM KS0004.KS00001 p
        LEFT JOIN KS0004.KS00002 c ON c.GUIDCATEGORIA=p.GUIDCATEGORIA
        LEFT JOIN KS0002.KS00001 forn ON forn.GUIDENTIDADE=p.GUIDFORNECEDOR
        OUTER APPLY (
          SELECT SUM(m.QUANTIDADE) AS vendaPeriodo
          FROM KS0004.KS00003 m
          WHERE m.GUIDPRODUTO=p.GUIDPRODUTO AND m.GUIDENTIDADE=p.GUIDENTIDADE
            AND m.TIPO='S' AND m.DTMOVIMENTO>=DATEADD(DAY,-@diasVenda,CAST(GETDATE() AS DATE))
        ) v
        OUTER APPLY (
          SELECT SUM(ISNULL(i.QUANTIDADEALTERADA,i.QUANTIDADESUGERIDA)) AS quantidadePendente
          FROM KS0004.KS00011 i
          INNER JOIN KS0004.KS00010 s ON s.GUIDSUGESTAO=i.GUIDSUGESTAO
          WHERE i.GUIDPRODUTO=p.GUIDPRODUTO AND i.GUIDENTIDADE=p.GUIDENTIDADE
            AND i.STATUS IN ('ABERTO','GERADO') AND s.STATUS IN ('ABERTO','GERADO')
        ) pc
        WHERE ${where.join(" AND ")}
        ORDER BY status DESC, p.PRODUTO
      `);

      const rows = raw.recordset.map((r: Record<string, unknown>) => {
        const estoqueAtual = Number(r.estoqueAtual ?? 0);
        const estoqueMaximo = Number(r.estoqueMaximo ?? 0);
        const estoqueMinimo = Number(r.estoqueMinimo ?? 0);
        const pontoReposicao = Number(r.pontoReposicao ?? 0);
        const pedido = cfg.considerarPedidos ? Number(r.quantidadePedidoCompra ?? 0) : 0;
        const media = Number(r.mediaVendaDiaria ?? 0);
        const simplesBase = estoqueMaximo > 0 ? estoqueMaximo : Math.max(estoqueMinimo * 2, pontoReposicao * 2);
        const sugestaoSimples = simplesBase - estoqueAtual - pedido;
        const sugestaoMedia = media * cfg.diasCobertura - estoqueAtual - pedido;
        const sugestaoCompra = Math.ceil(Math.max(sugestaoSimples, sugestaoMedia, 0));
        return {
          ...r,
          sugestaoCompra,
          valorEstimado: sugestaoCompra * Number(r.custoMedio ?? 0),
        };
      }).filter((r: Record<string, unknown>) => {
        if (Number(r.sugestaoCompra ?? 0) <= 0) return false;
        if (input?.estoqueZerado && Number(r.estoqueAtual ?? 0) > 0) return false;
        if (input?.estoqueBaixo && r.status === "NORMAL") return false;
        if (input?.comVendaUltimosDias && Number(r.vendaPeriodo ?? 0) <= 0) return false;
        if (input?.semPedidoCompra && Number(r.quantidadePedidoCompra ?? 0) > 0) return false;
        return true;
      });
      return rows;
    }),

  ignorar: publicProcedure
    .input(z.object({ guidProduto: z.string().uuid(), motivo: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasSugestaoCompra(pool);
      await pool.request()
        .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("guidproduto", sql.UniqueIdentifier, input.guidProduto)
        .input("acao", sql.NVarChar(60), "IGNORAR_SUGESTAO")
        .input("descricao", sql.NVarChar(500), input.motivo ?? null)
        .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
        .query(`
          INSERT INTO KS0004.KS00012 (GUIDHISTORICO,GUIDENTIDADE,ACAO,DESCRICAO,VALORNOVO,USUARIO)
          VALUES (@guid,@guidentidade,@acao,@descricao,CONVERT(NVARCHAR(36),@guidproduto),@usuario)
        `);
      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        guidUsuario: session.guidPessoa,
        origem: "SUGESTAO_COMPRA",
        acao: "IGNORAR_SUGESTAO",
        tabela: "KS0004.KS00001",
        guidRegistro: input.guidProduto,
        novo: input,
      });
      return { success: true };
    }),

  gerar: publicProcedure
    .input(z.object({
      tipo: z.enum(["SOLICITACAO", "COTACAO", "PEDIDO"]).default("SOLICITACAO"),
      diasVenda: z.number().int().min(1).default(30),
      diasCobertura: z.number().int().min(1).default(30),
      considerarPedidos: z.boolean().default(true),
      considerarReservado: z.boolean().default(false),
      observacao: z.string().max(500).optional().nullable(),
      itens: z.array(z.object({
        guidProduto: z.string().uuid(),
        produto: z.string(),
        codProduto: z.number().optional().nullable(),
        guidFornecedor: z.string().uuid().optional().nullable(),
        quantidadeSugerida: z.number().positive(),
        quantidadeAlterada: z.number().positive().optional().nullable(),
        custoMedio: z.number().min(0),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasSugestaoCompra(pool);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      const guidSugestao = crypto.randomUUID();
      try {
        await transaction.request()
          .input("guid", sql.UniqueIdentifier, guidSugestao)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("tipo", sql.NVarChar(30), input.tipo)
          .input("diasVenda", sql.Int, input.diasVenda)
          .input("diasCobertura", sql.Int, input.diasCobertura)
          .input("considerarPedidos", sql.Bit, input.considerarPedidos ? 1 : 0)
          .input("considerarReservado", sql.Bit, input.considerarReservado ? 1 : 0)
          .input("observacao", sql.NVarChar(500), input.observacao ?? null)
          .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
          .query(`
            INSERT INTO KS0004.KS00010
              (GUIDSUGESTAO,GUIDENTIDADE,TIPO,DIASVENDA,DIASCOBERTURA,CONSIDERARPEDIDOS,CONSIDERARRESERVADO,STATUS,OBSERVACAO,USUARIOCRIACAO,USUARIOALTERACAO)
            VALUES
              (@guid,@guidentidade,@tipo,@diasVenda,@diasCobertura,@considerarPedidos,@considerarReservado,'GERADO',@observacao,@usuario,@usuario)
          `);
        for (const item of input.itens) {
          const qtd = item.quantidadeAlterada ?? item.quantidadeSugerida;
          if (qtd <= 0) continue;
          await transaction.request()
            .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
            .input("guidsugestao", sql.UniqueIdentifier, guidSugestao)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
            .input("guidfornecedor", sql.UniqueIdentifier, item.guidFornecedor ?? null)
            .input("produto", sql.NVarChar(120), item.produto)
            .input("codproduto", sql.Int, item.codProduto ?? null)
            .input("qtdsugerida", sql.Decimal(15,4), item.quantidadeSugerida)
            .input("qtdalterada", sql.Decimal(15,4), item.quantidadeAlterada ?? null)
            .input("custo", sql.Decimal(15,4), item.custoMedio)
            .input("valor", sql.Decimal(15,2), qtd * item.custoMedio)
            .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
            .query(`
              INSERT INTO KS0004.KS00011
                (GUIDITEM,GUIDSUGESTAO,GUIDENTIDADE,GUIDPRODUTO,GUIDFORNECEDOR,PRODUTO,CODPRODUTO,QUANTIDADESUGERIDA,QUANTIDADEALTERADA,CUSTOMEDIO,VALORESTIMADO,STATUS,USUARIOCRIACAO,USUARIOALTERACAO)
              VALUES
                (@guid,@guidsugestao,@guidentidade,@guidproduto,@guidfornecedor,@produto,@codproduto,@qtdsugerida,@qtdalterada,@custo,@valor,'GERADO',@usuario,@usuario)
            `);
        }
        await transaction.commit();
        await auditarFinanceiro(pool, {
          guidEntidade: session.guidEntidade,
          guidUsuario: session.guidPessoa,
          origem: "SUGESTAO_COMPRA",
          acao: `GERAR_${input.tipo}`,
          tabela: "KS0004.KS00010",
          guidRegistro: guidSugestao,
          novo: { ...input, itens: input.itens.map((i) => ({ guidProduto: i.guidProduto, quantidadeSugerida: i.quantidadeSugerida, quantidadeAlterada: i.quantidadeAlterada })) },
        });
        return { success: true, guidSugestao };
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    }),
});

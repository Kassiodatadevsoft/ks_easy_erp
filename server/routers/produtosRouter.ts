/**
 * Router de Produtos — KS0000.KS00009
 * v3: Reforma Tributária (IBS, CBS, IS) + regime tributário da empresa (CRT)
 *
 * CRT (Código de Regime Tributário) em KS0002.KS00001:
 *   1 = Simples Nacional
 *   2 = Simples Nacional – Excesso de sublimite de receita bruta
 *   3 = Regime Normal (Lucro Presumido / Lucro Real)
 *   4 = MEI (Microempreendedor Individual)
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { querySql } from "../sqlserver";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import {
  calcularPrecoFaixa,
  listarFaixasProduto,
  salvarFaixasProduto,
} from "../services/produtoUnidadePreco";
import {
  ensureEmpresaSegmentoColumn,
} from "../services/dataDevAdmin";
import {
  ensureProdutoMontagemSchema,
  listarOpcoesMontagem,
  salvarOpcoesMontagem,
  TIPOS_CALCULO_PRECO,
  TIPOS_MONTAGEM,
} from "../services/produtoMontagem";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const token = match?.[1];
  const session = await verifyKsSession(token);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
  }
  return session;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toUpper(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().trim();
}
function sqlStr(v: string | null | undefined): string {
  if (!v) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlNum(v: number | null | undefined, def = 0): string {
  const n = typeof v === "number" ? v : def;
  return String(n);
}

const imeiSituacoes = ["DISPONIVEL", "RESERVADO", "VENDIDO", "MANUTENCAO", "BLOQUEADO", "DEVOLVIDO"] as const;
const imeiEstados = ["NOVO", "SEMINOVO", "USADO", "VITRINE", "RECONDICIONADO"] as const;

const produtoImeiInput = z.object({
  guidImei: z.string().uuid(),
  guidProduto: z.string().uuid(),
  imei1: z.string().max(20).optional(),
  imei2: z.string().max(20).optional(),
  numeroSerie: z.string().max(50).optional(),
  cor: z.string().max(50).optional(),
  capacidade: z.string().max(20).optional(),
  estado: z.enum(imeiEstados).default("NOVO"),
  situacao: z.enum(imeiSituacoes).default("DISPONIVEL"),
  dataEntrada: z.string().optional(),
  custo: z.number().default(0),
  precoVenda: z.number().default(0),
  observacao: z.string().optional(),
});

async function ensureProdutosImeiTable() {
  await querySql(`
    IF OBJECT_ID('KS0005.KS_PRODUTOS_IMEI', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS_PRODUTOS_IMEI (
        GUIDIMEI uniqueidentifier NOT NULL,
        GUIDPRODUTO uniqueidentifier NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        IMEI1 varchar(20) NULL,
        IMEI2 varchar(20) NULL,
        NUMEROSERIE varchar(50) NULL,
        COR varchar(50) NULL,
        CAPACIDADE varchar(20) NULL,
        ESTADO varchar(30) NULL,
        SITUACAO varchar(30) NULL,
        DATAENTRADA datetime NULL,
        CUSTO numeric(18,4) NULL,
        PRECOVENDA numeric(18,4) NULL,
        OBSERVACAO varchar(max) NULL,
        ULTIMAALTERACAO datetime NULL,
        SINCRONIZADO bit NOT NULL CONSTRAINT DF_KS_PRODUTOS_IMEI_SINCRONIZADO DEFAULT 0,
        CONSTRAINT PK_KS_PRODUTOS_IMEI PRIMARY KEY (GUIDIMEI)
      );
      CREATE INDEX IX_KS_PRODUTOS_IMEI_PRODUTO
        ON KS0005.KS_PRODUTOS_IMEI (GUIDENTIDADE, GUIDPRODUTO, SITUACAO);
      CREATE INDEX IX_KS_PRODUTOS_IMEI_BUSCA
        ON KS0005.KS_PRODUTOS_IMEI (GUIDENTIDADE, IMEI1, IMEI2, NUMEROSERIE);
    END
  `);
}

function sqlDate(v: string | null | undefined): string {
  if (!v) return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

// ─── Campos base compartilhados ───────────────────────────────────────────────
const produtoInputBase = {
  produto: z.string().min(1, "Nome obrigatório"),
  descricao: z.string().optional(),
  codCategoria: z.number().int().optional(),
  guidentidadeCat: z.string().optional(),
  precos: z.string().optional(),
  tamanhosDisp: z.string().optional(),
  preco: z.number().default(0),
  precoVenda: z.number().default(0),
  precocusto: z.number().default(0),
  imageUrl: z.string().optional(),
  erpCode: z.string().optional(),
  destaque: z.boolean().default(false),
  ordemExibicao: z.number().int().default(0),
  situacao: z.enum(["A", "I"]).default("A"),
  // ── Identificação do produto ──
  codBarras: z.string().max(14).optional(),
  codBarraCaixa: z.string().max(14).optional(),  // EAN/GTIN da embalagem/caixa
  qtdCaixa: z.number().min(1).default(1),         // Qtd de unidades por caixa
  // ── Identificação fiscal ──
  ncm: z.string().max(10).optional(),
  cest: z.string().max(10).optional(),
  cfop: z.string().max(5).optional(),
  unidade: z.string().max(6).default("UN"),
  // ── Tributação legada (ainda usada no XML NF-e) ──
  csosn: z.string().max(5).optional(),          // Simples Nacional
  cst: z.string().max(3).optional(),            // Regime Normal
  aliqIcms: z.number().min(0).max(100).default(0),
  aliqPis: z.number().min(0).max(100).default(0),
  aliqCofins: z.number().min(0).max(100).default(0),
  aliqIpi: z.number().min(0).max(100).default(0),
  // ── Reforma Tributária (vigência 2026+) ──
  aliqIbs: z.number().min(0).max(100).default(0),      // IBS – Imposto sobre Bens e Serviços
  aliqCbs: z.number().min(0).max(100).default(0),      // CBS – Contribuição sobre Bens e Serviços
  aliqIs: z.number().min(0).max(100).default(0),       // IS  – Imposto Seletivo
  regimeTrib: z.number().int().min(1).max(5).default(1), // 1=Padrão,2=Reduzido,3=Isento,4=Monofásico,5=Seletivo
  percReducao: z.number().min(0).max(100).default(0),  // % redução da base IBS/CBS
  codBenefIbs: z.string().max(20).optional(),          // Código de benefício fiscal IBS/CBS
  codRegimeEsp: z.string().max(10).optional(),         // Regime especial (cashback, etc.)
  // ── Origem do produto (Tabela A ICMS) ──
  origemProduto: z.number().int().min(0).max(8).default(0),
  // ── Promoção ──
  percDesconto: z.number().min(0).max(100).default(0),
  precoPromo: z.number().min(0).default(0),
  dtInicioPromo: z.string().optional(),  // ISO date string ou null
  dtFimPromo: z.string().optional(),
  // ── Flags de comportamento ──
  balanca: z.boolean().default(false),
  servico: z.boolean().default(false),
  alteraDescricao: z.boolean().default(false),
  // ── Produto fracionado ──
  fracionado: z.boolean().default(false),
  // ── Estoque ──
  estoque: z.number().default(0),
  estoqueMinimo: z.number().default(0),
  // ── Identificação adicional ──
  referencia: z.string().max(50).optional(),
  // ── Delivery ──
  delivery: z.boolean().default(true),
  // ── Formação de preço (modo Preço Único) ──
  aliqIcmsForm: z.number().min(0).max(100).default(0),
  percReducaoForm: z.number().min(0).max(100).default(0),
  percFreteForm: z.number().min(0).max(100).default(0),
  percJurosForm: z.number().min(0).max(100).default(0),
  permiteMontagem: z.boolean().default(false),
  tipoMontagem: z.enum(TIPOS_MONTAGEM).default("PIZZA"),
  qtdMinOpcoes: z.number().int().min(0).default(0),
  qtdMaxOpcoes: z.number().int().min(0).default(0),
  obrigaSelecaoMontagem: z.boolean().default(false),
  tipoCalculoPrecoMontagem: z.enum(TIPOS_CALCULO_PRECO).default("MAIOR_VALOR"),
  opcoesMontagem: z.array(z.object({
    guidProdutoOpcao: z.string().uuid(),
    descricao: z.string().max(100).optional(),
    valorAdicional: z.number().default(0),
    ordem: z.number().int().optional(),
    situacao: z.enum(["A", "I"]).default("A"),
  })).default([]),
  faixasPreco: z.array(z.object({
    id: z.number().int().positive().optional(),
    unidade: z.string().min(1).max(6),
    fatorConversao: z.number().positive(),
    quantidadeMinima: z.number().positive(),
    descricaoPreco: z.string().max(60).optional().nullable(),
    precoVenda: z.number().positive(),
    ativo: z.boolean().default(true),
  })).default([]),
};

type ProdutoRow = {
  CODPRODUTO: number;
  PRODUTO: string;
  DESCRICAO: string | null;
  CODCATEGORIA: number | null;
  GUIDENTIDADECAT: string | null;
  CATEGORIA: string | null;
  PRECOS: string | null;
  TAMANHOSDISP: string | null;
  PRECO: number;
  PRECOVENDA: number;
  PRECOCUSTO: number;
  IMAGEURL: string | null;
  ERPCODE: string | null;
  DESTAQUE: boolean;
  ORDEMEXIBICAO: number;
  SITUACAO: string;
  GUIDPRODUTO: string;
  GUIDENTIDADE: string;
  DATACADASTRO: Date;
  ULTIMAALTERACAO: Date;
  NCM: string | null;
  CEST: string | null;
  CFOP: string | null;
  CSOSN: string | null;
  CST: string | null;
  ALIQICMS: number;
  ALIQPIS: number;
  ALIQCOFINS: number;
  ALIQIPI: number;
  ALIQIBS: number;
  ALIQCBS: number;
  ALIQIS: number;
  REGIMETRIB: number;
  PERCREDUCAO: number;
  CODBARRAS: string | null;
  CODBARRACAIXA: string | null;
  QTDCAIXA: number;
  CODBENEFIBS: string | null;
  CODREGIMEESP: string | null;
  UNIDADE: string | null;
  ORIGEMPRODUTO: number;
  PERCDESCONTO: number;
  PRECOPROMO: number;
  DTINICIOPROMO: Date | null;
  DTFIMPROMO: Date | null;
  BALANCA: boolean;
  SERVICO: boolean;
  ALTERADESCRICAO: boolean;
  FRACIONADO: boolean;
  ESTOQUE: number;
  ESTOQUEMINIMO: number;
  REFERENCIA: string | null;
  DELIVERY: boolean;
  ALIQICMSFORM: number;
  PERCREDUCAOFORM: number;
  PERCFRETEFORM: number;
  PERCJUROSFORM: number;
  PERMITEMONTAGEM: boolean;
  TIPOMONTAGEM: string | null;
  QTDMINOPCOES: number;
  QTDMAXOPCOES: number;
  OBRIGASELECAOMONTAGEM: boolean;
  TIPOCALCULOPRECOMONTAGEM: string | null;
};

const SELECT_CAMPOS = `
  p.CODPRODUTO, p.PRODUTO, p.DESCRICAO, p.CODCATEGORIA, p.GUIDENTIDADECAT,
  c.CATEGORIA, p.PRECOS, p.TAMANHOSDISP, p.PRECO, p.PRECOVENDA,
  ISNULL(p.PRECOCUSTO, 0) AS PRECOCUSTO,
  p.IMAGEURL, p.ERPCODE, p.DESTAQUE, p.ORDEMEXIBICAO, p.SITUACAO,
  p.GUIDPRODUTO, p.GUIDENTIDADE, p.DATACADASTRO, p.ULTIMAALTERACAO,
  p.NCM, p.CEST, p.CFOP, p.CSOSN, p.CST,
  ISNULL(p.ALIQICMS,0) AS ALIQICMS,
  ISNULL(p.ALIQPIS,0)  AS ALIQPIS,
  ISNULL(p.ALIQCOFINS,0) AS ALIQCOFINS,
  ISNULL(p.ALIQIPI,0)  AS ALIQIPI,
  ISNULL(p.ALIQIBS,0)  AS ALIQIBS,
  ISNULL(p.ALIQCBS,0)  AS ALIQCBS,
  ISNULL(p.ALIQIS,0)   AS ALIQIS,
  ISNULL(p.REGIMETRIB,1) AS REGIMETRIB,
  ISNULL(p.PERCREDUCAO,0) AS PERCREDUCAO,
  p.CODBENEFIBS, p.CODREGIMEESP, p.UNIDADE,
  ISNULL(p.ESTOQUE,0) AS ESTOQUE,
  ISNULL(p.ESTOQUEMINIMO,0) AS ESTOQUEMINIMO,
  ISNULL(p.ORIGEMPRODUTO,0) AS ORIGEMPRODUTO,
  p.CODBARRACAIXA,
  ISNULL(p.QTDCAIXA,1) AS QTDCAIXA,
  ISNULL(p.PERCDESCONTO,0) AS PERCDESCONTO,
  ISNULL(p.PRECOPROMO,0) AS PRECOPROMO,
  p.DTINICIOPROMO, p.DTFIMPROMO,
  ISNULL(p.BALANCA,0) AS BALANCA,
  ISNULL(p.SERVICO,0) AS SERVICO,
  ISNULL(p.ALTERADESCRICAO,0) AS ALTERADESCRICAO,
  ISNULL(p.FRACIONADO,0) AS FRACIONADO,
  p.CODBARRAS,
  p.REFERENCIA,
  ISNULL(p.DELIVERY,1) AS DELIVERY,
  ISNULL(p.ALIQICMSFORM,0) AS ALIQICMSFORM,
  ISNULL(p.PERCREDUCAOFORM,0) AS PERCREDUCAOFORM,
  ISNULL(p.PERCFRETEFORM,0) AS PERCFRETEFORM,
  ISNULL(p.PERCJUROSFORM,0) AS PERCJUROSFORM,
  ISNULL(p.PERMITEMONTAGEM,0) AS PERMITEMONTAGEM,
  p.TIPOMONTAGEM,
  ISNULL(p.QTDMINOPCOES,0) AS QTDMINOPCOES,
  ISNULL(p.QTDMAXOPCOES,0) AS QTDMAXOPCOES,
  ISNULL(p.OBRIGASELECAOMONTAGEM,0) AS OBRIGASELECAOMONTAGEM,
  ISNULL(p.TIPOCALCULOPRECOMONTAGEM,'MAIOR_VALOR') AS TIPOCALCULOPRECOMONTAGEM
`;

// ─── Router ───────────────────────────────────────────────────────────────────
export const produtosRouter = router({

  // ── Regime tributário da empresa logada ──────────────────────────────────────
  regimeEmpresa: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      await ensureEmpresaSegmentoColumn();
      const rows = await querySql<{
        CRT: number | null;
        REGIMEPISCOFINS: number | null;
        ALIQUOTAPIS: number | null;
        ALIQUOTACOFINS: number | null;
        CREDITOCSOSN: number | null;
        SEGMENTO: string | null;
        NOME: string;
        DOCUMENTO: string;
      }>(
        `SELECT TOP 1
           e.CRT, e.REGIMEPISCOFINS,
           e.ALIQUOTAPIS, e.ALIQUOTACOFINS, e.CREDITOCSOSN,
           ISNULL(e.SEGMENTO, 'GERAL') AS SEGMENTO,
           e.NOME, e.DOCUMENTO
         FROM KS0002.KS00001 e
         WHERE e.GUIDENTIDADE = '${session.guidEntidade}'
           AND e.CADEMPRESA = 1
           AND e.SITUACAO = 'A'`
      );

      const empresa = rows[0];
      if (!empresa) {
        return {
          crt: 1,
          regimePisCofins: 1,
          aliquotaPis: 0.65,
          aliquotaCofins: 3.0,
          creditoCsosn: 0,
          nome: "",
          descricaoRegime: "Simples Nacional",
          isMEI: false,
          isSimples: true,
          isNormal: false,
          segmento: "GERAL",
        };
      }

      const crt = empresa.CRT ?? 1;
      const descricoes: Record<number, string> = {
        1: "Simples Nacional",
        2: "Simples Nacional – Excesso de sublimite",
        3: "Regime Normal (Lucro Presumido / Lucro Real)",
        4: "MEI – Microempreendedor Individual",
      };

      return {
        crt,
        regimePisCofins: empresa.REGIMEPISCOFINS ?? 1,
        aliquotaPis: Number(empresa.ALIQUOTAPIS ?? 0.65),
        aliquotaCofins: Number(empresa.ALIQUOTACOFINS ?? 3.0),
        creditoCsosn: Number(empresa.CREDITOCSOSN ?? 0),
        nome: empresa.NOME,
        descricaoRegime: descricoes[crt] ?? "Simples Nacional",
        isMEI: crt === 4,
        isSimples: crt === 1 || crt === 2 || crt === 4,
        isNormal: crt === 3,
        segmento: empresa.SEGMENTO ?? "GERAL",
      };
    }),

  // ── Listar ──────────────────────────────────────────────────────────────────
  listar: publicProcedure
    .input(z.object({
      busca: z.string().optional(),
      situacao: z.enum(["TODOS", "A", "I"]).default("A"),
      guidCategoria: z.string().optional(),
      pagina: z.number().int().min(1).default(1),
      porPagina: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutoMontagemSchema();
      const { busca, situacao, guidCategoria, pagina, porPagina } = input;
      const offset = (pagina - 1) * porPagina;

      let where = `WHERE p.GUIDENTIDADE = '${session.guidEntidade}'`;
      if (situacao !== "TODOS") where += ` AND p.SITUACAO = '${situacao}'`;
      if (guidCategoria) where += ` AND p.GUIDENTIDADECAT = '${guidCategoria}'`;
      if (busca) {
        const b = busca.replace(/'/g, "''");
        where += ` AND (
          p.PRODUTO LIKE '%${b}%'
          OR p.DESCRICAO LIKE '%${b}%'
          OR p.ERPCODE LIKE '%${b}%'
          OR CAST(p.CODPRODUTO AS NVARCHAR(20)) LIKE '%${b}%'
          OR p.CODBARRAS LIKE '%${b}%'
          OR p.CODBARRACAIXA LIKE '%${b}%'
          OR p.REFERENCIA LIKE '%${b}%'
          OR p.TAMANHOSDISP LIKE '%${b}%'
          OR c.CATEGORIA LIKE '%${b}%'
        )`;
      }

      const countResult = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
         FROM KS0000.KS00009 p
         LEFT JOIN KS0000.KS00008 c
           ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
         ${where}`
      );
      const total = countResult[0]?.TOTAL ?? 0;

      const rows = await querySql<ProdutoRow>(
        `SELECT ${SELECT_CAMPOS}
         FROM KS0000.KS00009 p
         LEFT JOIN KS0000.KS00008 c
           ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
         ${where}
         ORDER BY p.ORDEMEXIBICAO, p.PRODUTO
         OFFSET ${offset} ROWS FETCH NEXT ${porPagina} ROWS ONLY`
      );

      const registros = await Promise.all(rows.map(async (produto) => ({
        ...produto,
        faixasPreco: await listarFaixasProduto(session.guidEntidade, String(produto.GUIDPRODUTO)),
      })));

      return { total, pagina, porPagina, registros };
    }),

  // ── Buscar por GUID ──────────────────────────────────────────────────────────
  buscarPorGuid: publicProcedure
    .input(z.object({ guidProduto: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutoMontagemSchema();
      const rows = await querySql<ProdutoRow>(
        `SELECT ${SELECT_CAMPOS}
         FROM KS0000.KS00009 p
         LEFT JOIN KS0000.KS00008 c
           ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
         WHERE p.GUIDPRODUTO = '${input.guidProduto}'
           AND p.GUIDENTIDADE = '${session.guidEntidade}'`
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
      const produto = rows[0];
      const faixasPreco = await listarFaixasProduto(session.guidEntidade, String(produto.GUIDPRODUTO));
      const opcoesMontagem = await listarOpcoesMontagem(session.guidEntidade, String(produto.GUIDPRODUTO));
      return { ...produto, faixasPreco, opcoesMontagem };
    }),

  // ── Validar nome ─────────────────────────────────────────────────────────────
  validarNome: publicProcedure
    .input(z.object({ produto: z.string(), guidProduto: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const nome = toUpper(input.produto).replace(/'/g, "''");
      let sql = `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00009
                 WHERE PRODUTO = '${nome}' AND GUIDENTIDADE = '${session.guidEntidade}'`;
      if (input.guidProduto) sql += ` AND GUIDPRODUTO <> '${input.guidProduto}'`;
      const rows = await querySql<{ TOTAL: number }>(sql);
      return { disponivel: (rows[0]?.TOTAL ?? 0) === 0 };
    }),

  // ── Criar ────────────────────────────────────────────────────────────────────
  criar: publicProcedure
    .input(z.object(produtoInputBase))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutoMontagemSchema();

      const maxRows = await querySql<{ MAXCOD: number | null }>(
        `SELECT ISNULL(MAX(CODPRODUTO), 0) AS MAXCOD FROM KS0000.KS00009`
      );
      const codProduto = (maxRows[0]?.MAXCOD ?? 0) + 1;

      const produto = toUpper(input.produto).replace(/'/g, "''");
      const descricao = input.descricao ? toUpper(input.descricao).replace(/'/g, "''") : null;
      const now = new Date().toISOString();

      await querySql(
        `INSERT INTO KS0000.KS00009
           (CODPRODUTO, PRODUTO, DESCRICAO, CODCATEGORIA, GUIDENTIDADECAT,
            PRECOS, TAMANHOSDISP, PRECO, PRECOVENDA, PRECOCUSTO,
            IMAGEURL, ERPCODE, DESTAQUE, ORDEMEXIBICAO, SITUACAO,
            NCM, CEST, CFOP, CSOSN, CST,
            ALIQICMS, ALIQPIS, ALIQCOFINS, ALIQIPI,
            ALIQIBS, ALIQCBS, ALIQIS,
            REGIMETRIB, PERCREDUCAO, CODBENEFIBS, CODREGIMEESP,
            UNIDADE, ESTOQUE, ESTOQUEMINIMO, ORIGEMPRODUTO,
            PERCDESCONTO, PRECOPROMO, DTINICIOPROMO, DTFIMPROMO,
            BALANCA, SERVICO, ALTERADESCRICAO, FRACIONADO, CODBARRAS,
             CODBARRACAIXA, QTDCAIXA,
             REFERENCIA, DELIVERY,
             ALIQICMSFORM, PERCREDUCAOFORM, PERCFRETEFORM, PERCJUROSFORM,
             PERMITEMONTAGEM, TIPOMONTAGEM, QTDMINOPCOES, QTDMAXOPCOES,
             OBRIGASELECAOMONTAGEM, TIPOCALCULOPRECOMONTAGEM,
             GUIDPRODUTO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
         VALUES
           (${codProduto}, '${produto}', ${descricao ? `'${descricao}'` : "NULL"},
            ${input.codCategoria ?? "NULL"}, ${sqlStr(input.guidentidadeCat)},
            ${sqlStr(input.precos)}, ${sqlStr(input.tamanhosDisp)},
            ${sqlNum(input.preco)}, ${sqlNum(input.precoVenda)}, ${sqlNum(input.precocusto)},
            ${sqlStr(input.imageUrl)}, ${sqlStr(input.erpCode ? toUpper(input.erpCode) : null)},
            ${input.destaque ? 1 : 0}, ${input.ordemExibicao}, '${input.situacao}',
            ${sqlStr(input.ncm)}, ${sqlStr(input.cest)}, ${sqlStr(input.cfop)},
            ${sqlStr(input.csosn)}, ${sqlStr(input.cst)},
            ${sqlNum(input.aliqIcms)}, ${sqlNum(input.aliqPis)}, ${sqlNum(input.aliqCofins)}, ${sqlNum(input.aliqIpi)},
            ${sqlNum(input.aliqIbs)}, ${sqlNum(input.aliqCbs)}, ${sqlNum(input.aliqIs)},
            ${input.regimeTrib}, ${sqlNum(input.percReducao)},
            ${sqlStr(input.codBenefIbs)}, ${sqlStr(input.codRegimeEsp)},
            ${sqlStr(input.unidade || "UN")},
            ${sqlNum(input.estoque)}, ${sqlNum(input.estoqueMinimo)},
            ${input.origemProduto},
            ${sqlNum(input.percDesconto)}, ${sqlNum(input.precoPromo)},
            ${input.dtInicioPromo ? `'${input.dtInicioPromo}'` : 'NULL'},
            ${input.dtFimPromo ? `'${input.dtFimPromo}'` : 'NULL'},
            ${input.balanca ? 1 : 0}, ${input.servico ? 1 : 0}, ${input.alteraDescricao ? 1 : 0},
            ${input.fracionado ? 1 : 0},
            ${sqlStr(input.codBarras)},
            ${sqlStr(input.codBarraCaixa)}, ${sqlNum(input.qtdCaixa ?? 1)},
             ${sqlStr(input.referencia ? input.referencia.toUpperCase() : null)}, ${input.delivery ? 1 : 0},
             ${sqlNum(input.aliqIcmsForm)}, ${sqlNum(input.percReducaoForm)}, ${sqlNum(input.percFreteForm)}, ${sqlNum(input.percJurosForm)},
             ${input.permiteMontagem ? 1 : 0}, ${sqlStr(input.tipoMontagem)}, ${sqlNum(input.qtdMinOpcoes)}, ${sqlNum(input.qtdMaxOpcoes)},
             ${input.obrigaSelecaoMontagem ? 1 : 0}, ${sqlStr(input.tipoCalculoPrecoMontagem)},
             NEWID(), '${session.guidEntidade}', '${now}', '${now}')`
      );

      const produtoRows = await querySql<{ GUIDPRODUTO: string }>(
        `SELECT TOP 1 CAST(GUIDPRODUTO AS NVARCHAR(36)) AS GUIDPRODUTO
         FROM KS0000.KS00009
         WHERE CODPRODUTO = ${codProduto} AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      const guidProdutoCriado = produtoRows[0]?.GUIDPRODUTO;
      if (guidProdutoCriado) {
        await salvarFaixasProduto(session.guidEntidade, guidProdutoCriado, codProduto, input.faixasPreco);
        await salvarOpcoesMontagem(session.guidEntidade, guidProdutoCriado, input.opcoesMontagem);
      }

      return { codProduto, mensagem: "Produto criado com sucesso" };
    }),

  // ── Atualizar ────────────────────────────────────────────────────────────────
  atualizar: publicProcedure
    .input(z.object({ guidProduto: z.string(), ...produtoInputBase }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutoMontagemSchema();

      const produto = toUpper(input.produto).replace(/'/g, "''");
      const descricao = input.descricao ? toUpper(input.descricao).replace(/'/g, "''") : null;
      const now = new Date().toISOString();

      await querySql(
        `UPDATE KS0000.KS00009 SET
           PRODUTO = '${produto}',
           DESCRICAO = ${descricao ? `'${descricao}'` : "NULL"},
           CODCATEGORIA = ${input.codCategoria ?? "NULL"},
           GUIDENTIDADECAT = ${sqlStr(input.guidentidadeCat)},
           PRECOS = ${sqlStr(input.precos)},
           TAMANHOSDISP = ${sqlStr(input.tamanhosDisp)},
           PRECO = ${sqlNum(input.preco)},
           PRECOVENDA = ${sqlNum(input.precoVenda)},
           PRECOCUSTO = ${sqlNum(input.precocusto)},
           IMAGEURL = ${sqlStr(input.imageUrl)},
           ERPCODE = ${sqlStr(input.erpCode ? toUpper(input.erpCode) : null)},
           DESTAQUE = ${input.destaque ? 1 : 0},
           ORDEMEXIBICAO = ${input.ordemExibicao},
           SITUACAO = '${input.situacao}',
           NCM = ${sqlStr(input.ncm)},
           CEST = ${sqlStr(input.cest)},
           CFOP = ${sqlStr(input.cfop)},
           CSOSN = ${sqlStr(input.csosn)},
           CST = ${sqlStr(input.cst)},
           ALIQICMS = ${sqlNum(input.aliqIcms)},
           ALIQPIS = ${sqlNum(input.aliqPis)},
           ALIQCOFINS = ${sqlNum(input.aliqCofins)},
           ALIQIPI = ${sqlNum(input.aliqIpi)},
           ALIQIBS = ${sqlNum(input.aliqIbs)},
           ALIQCBS = ${sqlNum(input.aliqCbs)},
           ALIQIS = ${sqlNum(input.aliqIs)},
           REGIMETRIB = ${input.regimeTrib},
           PERCREDUCAO = ${sqlNum(input.percReducao)},
           CODBENEFIBS = ${sqlStr(input.codBenefIbs)},
           CODREGIMEESP = ${sqlStr(input.codRegimeEsp)},
           UNIDADE = ${sqlStr(input.unidade || "UN")},
           ESTOQUE = ${sqlNum(input.estoque)},
           ESTOQUEMINIMO = ${sqlNum(input.estoqueMinimo)},
           ORIGEMPRODUTO = ${input.origemProduto},
           PERCDESCONTO = ${sqlNum(input.percDesconto)},
           PRECOPROMO = ${sqlNum(input.precoPromo)},
           DTINICIOPROMO = ${input.dtInicioPromo ? `'${input.dtInicioPromo}'` : 'NULL'},
           DTFIMPROMO = ${input.dtFimPromo ? `'${input.dtFimPromo}'` : 'NULL'},
           BALANCA = ${input.balanca ? 1 : 0},
           SERVICO = ${input.servico ? 1 : 0},
           ALTERADESCRICAO = ${input.alteraDescricao ? 1 : 0},
           FRACIONADO = ${input.fracionado ? 1 : 0},
           CODBARRAS = ${sqlStr(input.codBarras)},
           CODBARRACAIXA = ${sqlStr(input.codBarraCaixa)},
           QTDCAIXA = ${sqlNum(input.qtdCaixa ?? 1)},
           REFERENCIA = ${sqlStr(input.referencia ? input.referencia.toUpperCase() : null)},
           DELIVERY = ${input.delivery ? 1 : 0},
           ALIQICMSFORM = ${sqlNum(input.aliqIcmsForm)},
           PERCREDUCAOFORM = ${sqlNum(input.percReducaoForm)},
           PERCFRETEFORM = ${sqlNum(input.percFreteForm)},
           PERCJUROSFORM = ${sqlNum(input.percJurosForm)},
           PERMITEMONTAGEM = ${input.permiteMontagem ? 1 : 0},
           TIPOMONTAGEM = ${sqlStr(input.tipoMontagem)},
           QTDMINOPCOES = ${sqlNum(input.qtdMinOpcoes)},
           QTDMAXOPCOES = ${sqlNum(input.qtdMaxOpcoes)},
           OBRIGASELECAOMONTAGEM = ${input.obrigaSelecaoMontagem ? 1 : 0},
           TIPOCALCULOPRECOMONTAGEM = ${sqlStr(input.tipoCalculoPrecoMontagem)},
           ULTIMAALTERACAO = '${now}'
         WHERE GUIDPRODUTO = '${input.guidProduto}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );

      const produtoRows = await querySql<{ CODPRODUTO: number }>(
        `SELECT TOP 1 CODPRODUTO
         FROM KS0000.KS00009
         WHERE GUIDPRODUTO = '${input.guidProduto}' AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      await salvarFaixasProduto(session.guidEntidade, input.guidProduto, produtoRows[0]?.CODPRODUTO ?? null, input.faixasPreco);
      await salvarOpcoesMontagem(session.guidEntidade, input.guidProduto, input.opcoesMontagem);

      return { mensagem: "Produto atualizado com sucesso" };
    }),

  calcularPrecoVenda: publicProcedure
    .input(z.object({
      guidProduto: z.string(),
      unidade: z.string().min(1).max(6),
      quantidade: z.number().positive(),
    }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const preco = await calcularPrecoFaixa(
        session.guidEntidade,
        input.guidProduto,
        input.unidade,
        input.quantidade
      );
      if (!preco) throw new TRPCError({ code: "NOT_FOUND", message: "Produto nÃ£o encontrado" });
      return {
        id: preco.ID,
        descricaoPreco: preco.DESCRICAOPRECO,
        precoVenda: Number(preco.PRECOVENDA),
        fatorConversao: Number(preco.FATORCONVERSAO),
        quantidadeMinima: preco.QUANTIDADEMINIMA === null ? null : Number(preco.QUANTIDADEMINIMA),
        quantidadeEstoque: input.quantidade * Number(preco.FATORCONVERSAO),
        origem: preco.ORIGEM,
      };
    }),

  // ── Excluir (soft delete) ────────────────────────────────────────────────────
  excluir: publicProcedure
    .input(z.object({ guidProduto: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const now = new Date().toISOString();
      await querySql(
        `UPDATE KS0000.KS00009 SET SITUACAO = 'I', ULTIMAALTERACAO = '${now}'
         WHERE GUIDPRODUTO = '${input.guidProduto}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      return { mensagem: "Produto inativado com sucesso" };
    }),

  buscar: publicProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const busca = input.q.replace(/'/g, "''");
      const rows = await querySql<{
        guidProduto: string;
        PRODUTO: string;
        CODBARRAS: string | null;
        UNIDADE: string | null;
        ESTOQUE: number;
        PRECOVENDA: number;
      }>(
        `SELECT TOP 20
           CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
           PRODUTO,
           CODBARRAS,
           ISNULL(UNIDADE, 'UN') AS UNIDADE,
           ISNULL(ESTOQUE, 0) AS ESTOQUE,
           ISNULL(PRECOVENDA, 0) AS PRECOVENDA
         FROM KS0000.KS00009
         WHERE GUIDENTIDADE = '${session.guidEntidade}'
           AND SITUACAO = 'A'
           AND (
             PRODUTO LIKE '%${busca}%'
             OR CODBARRAS LIKE '%${busca}%'
             OR REFERENCIA LIKE '%${busca}%'
             OR ERPCODE LIKE '%${busca}%'
           )
         ORDER BY PRODUTO ASC`
      );
      return rows.map(row => ({
        ...row,
        UNIDADE: row.UNIDADE ?? "UN",
        CODBARRAS: row.CODBARRAS ?? "",
      }));
    }),

  resumoEstoque: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<{
        totalProdutos: number;
        valorEstoque: number;
        abaixoMinimo: number;
        semEstoque: number;
      }>(
        `SELECT
           COUNT(*) AS totalProdutos,
           ISNULL(SUM(ISNULL(ESTOQUE, 0) * ISNULL(PRECOVENDA, 0)), 0) AS valorEstoque,
           SUM(CASE WHEN ISNULL(ESTOQUE, 0) < ISNULL(ESTOQUEMINIMO, 0) AND ISNULL(ESTOQUEMINIMO, 0) > 0 THEN 1 ELSE 0 END) AS abaixoMinimo,
           SUM(CASE WHEN ISNULL(ESTOQUE, 0) <= 0 THEN 1 ELSE 0 END) AS semEstoque
         FROM KS0000.KS00009
         WHERE GUIDENTIDADE = '${session.guidEntidade}'
           AND SITUACAO = 'A'`
      );
      return rows[0] ?? { totalProdutos: 0, valorEstoque: 0, abaixoMinimo: 0, semEstoque: 0 };
    }),

  produtosCriticos: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      return querySql(
        `SELECT TOP 20
           CAST(GUIDPRODUTO AS NVARCHAR(36)) AS guidProduto,
           PRODUTO,
           ISNULL(ESTOQUE, 0) AS ESTOQUE,
           ISNULL(ESTOQUEMINIMO, 0) AS ESTOQUEMINIMO,
           ISNULL(UNIDADE, 'UN') AS UNIDADE,
           CASE WHEN ISNULL(ESTOQUE, 0) <= 0 THEN 'SEM_ESTOQUE' ELSE 'ABAIXO_MINIMO' END AS status
         FROM KS0000.KS00009
         WHERE GUIDENTIDADE = '${session.guidEntidade}'
           AND SITUACAO = 'A'
           AND (
             ISNULL(ESTOQUE, 0) <= 0
             OR (ISNULL(ESTOQUEMINIMO, 0) > 0 AND ISNULL(ESTOQUE, 0) < ISNULL(ESTOQUEMINIMO, 0))
           )
          ORDER BY ISNULL(ESTOQUE, 0) ASC`
      );
    }),

  listarImeis: publicProcedure
    .input(z.object({
      guidProduto: z.string().uuid(),
      busca: z.string().optional(),
      situacao: z.enum(["TODOS", ...imeiSituacoes]).default("TODOS"),
    }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutosImeiTable();

      let where = `
        WHERE GUIDENTIDADE = '${session.guidEntidade}'
          AND GUIDPRODUTO = '${input.guidProduto}'
      `;
      if (input.situacao !== "TODOS") where += ` AND SITUACAO = '${input.situacao}'`;
      if (input.busca?.trim()) {
        const busca = input.busca.trim().replace(/'/g, "''");
        where += ` AND (
          IMEI1 LIKE '%${busca}%'
          OR IMEI2 LIKE '%${busca}%'
          OR NUMEROSERIE LIKE '%${busca}%'
          OR COR LIKE '%${busca}%'
          OR CAPACIDADE LIKE '%${busca}%'
        )`;
      }

      const rows = await querySql<{
        GUIDIMEI: string;
        GUIDPRODUTO: string;
        GUIDENTIDADE: string;
        IMEI1: string | null;
        IMEI2: string | null;
        NUMEROSERIE: string | null;
        COR: string | null;
        CAPACIDADE: string | null;
        ESTADO: string | null;
        SITUACAO: string | null;
        DATAENTRADA: Date | null;
        CUSTO: number | null;
        PRECOVENDA: number | null;
        OBSERVACAO: string | null;
        ULTIMAALTERACAO: Date | null;
        SINCRONIZADO: boolean;
      }>(
        `SELECT
           CAST(GUIDIMEI AS NVARCHAR(36)) AS GUIDIMEI,
           CAST(GUIDPRODUTO AS NVARCHAR(36)) AS GUIDPRODUTO,
           CAST(GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
           IMEI1, IMEI2, NUMEROSERIE, COR, CAPACIDADE, ESTADO, SITUACAO,
           DATAENTRADA, CUSTO, PRECOVENDA, OBSERVACAO, ULTIMAALTERACAO,
           SINCRONIZADO
         FROM KS0005.KS_PRODUTOS_IMEI
         ${where}
         ORDER BY DATAENTRADA DESC, ULTIMAALTERACAO DESC`
      );

      const disponiveis = rows.filter((row) => row.SITUACAO === "DISPONIVEL").length;
      return { registros: rows, disponiveis, total: rows.length };
    }),

  buscarPorImei: publicProcedure
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutosImeiTable();
      await ensureProdutoMontagemSchema();
      const busca = input.q.trim().replace(/'/g, "''");
      const rows = await querySql<ProdutoRow & {
        GUIDIMEI: string;
        IMEI1: string | null;
        IMEI2: string | null;
        NUMEROSERIE: string | null;
        SITUACAOIMEI: string | null;
        DATAENTRADAIMEI: Date | null;
        CUSTOIMEI: number | null;
        PRECOVENDAIMEI: number | null;
      }>(
        `SELECT TOP 1
           ${SELECT_CAMPOS},
           CAST(i.GUIDIMEI AS NVARCHAR(36)) AS GUIDIMEI,
           i.IMEI1, i.IMEI2, i.NUMEROSERIE,
           i.SITUACAO AS SITUACAOIMEI,
           i.DATAENTRADA AS DATAENTRADAIMEI,
           i.CUSTO AS CUSTOIMEI,
           i.PRECOVENDA AS PRECOVENDAIMEI
         FROM KS0005.KS_PRODUTOS_IMEI i
         INNER JOIN KS0000.KS00009 p
           ON p.GUIDPRODUTO = i.GUIDPRODUTO
          AND p.GUIDENTIDADE = i.GUIDENTIDADE
         LEFT JOIN KS0000.KS00008 c
           ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
         WHERE i.GUIDENTIDADE = '${session.guidEntidade}'
           AND (
             i.IMEI1 = '${busca}'
             OR i.IMEI2 = '${busca}'
             OR i.NUMEROSERIE = '${busca}'
           )
         ORDER BY i.ULTIMAALTERACAO DESC`
      );

      const row = rows[0];
      if (!row) return null;
      const faixasPreco = await listarFaixasProduto(session.guidEntidade, String(row.GUIDPRODUTO));
      return { produto: { ...row, faixasPreco }, imei: {
        guidImei: row.GUIDIMEI,
        imei1: row.IMEI1 ?? "",
        imei2: row.IMEI2 ?? "",
        numeroSerie: row.NUMEROSERIE ?? "",
        situacao: row.SITUACAOIMEI ?? "",
        dataEntrada: row.DATAENTRADAIMEI?.toISOString().slice(0, 10),
        custo: Number(row.CUSTOIMEI ?? 0),
        precoVenda: Number(row.PRECOVENDAIMEI ?? 0),
      } };
    }),

  atualizarSituacaoImei: publicProcedure
    .input(z.object({
      guidImei: z.string().uuid(),
      situacao: z.enum(imeiSituacoes),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutosImeiTable();
      await querySql(
        `UPDATE KS0005.KS_PRODUTOS_IMEI SET
           SITUACAO = '${input.situacao}',
           ULTIMAALTERACAO = '${new Date().toISOString()}',
           SINCRONIZADO = 0
         WHERE GUIDIMEI = '${input.guidImei}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      return { mensagem: "SituaÃ§Ã£o do IMEI atualizada" };
    }),

  salvarImei: publicProcedure
    .input(produtoImeiInput)
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutosImeiTable();

      const produtoRows = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
         FROM KS0000.KS00009
         WHERE GUIDPRODUTO = '${input.guidProduto}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      if ((produtoRows[0]?.TOTAL ?? 0) === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Produto nÃ£o encontrado para esta empresa." });
      }

      if (!input.imei1 && !input.imei2 && !input.numeroSerie) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe IMEI 1, IMEI 2 ou nÃºmero de sÃ©rie." });
      }

      const duplicatedWhere = [
        input.imei1 ? `IMEI1 = ${sqlStr(input.imei1)} OR IMEI2 = ${sqlStr(input.imei1)} OR NUMEROSERIE = ${sqlStr(input.imei1)}` : "",
        input.imei2 ? `IMEI1 = ${sqlStr(input.imei2)} OR IMEI2 = ${sqlStr(input.imei2)} OR NUMEROSERIE = ${sqlStr(input.imei2)}` : "",
        input.numeroSerie ? `IMEI1 = ${sqlStr(input.numeroSerie)} OR IMEI2 = ${sqlStr(input.numeroSerie)} OR NUMEROSERIE = ${sqlStr(input.numeroSerie)}` : "",
      ].filter(Boolean).join(" OR ");

      const duplicates = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
         FROM KS0005.KS_PRODUTOS_IMEI
         WHERE GUIDENTIDADE = '${session.guidEntidade}'
           AND GUIDIMEI <> '${input.guidImei}'
           AND (${duplicatedWhere})`
      );
      if ((duplicates[0]?.TOTAL ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "IMEI ou nÃºmero de sÃ©rie jÃ¡ cadastrado." });
      }

      const exists = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
         FROM KS0005.KS_PRODUTOS_IMEI
         WHERE GUIDIMEI = '${input.guidImei}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      const now = new Date().toISOString();
      const dataEntrada = input.dataEntrada || now.slice(0, 10);

      if ((exists[0]?.TOTAL ?? 0) > 0) {
        await querySql(
          `UPDATE KS0005.KS_PRODUTOS_IMEI SET
             GUIDPRODUTO = '${input.guidProduto}',
             IMEI1 = ${sqlStr(input.imei1)},
             IMEI2 = ${sqlStr(input.imei2)},
             NUMEROSERIE = ${sqlStr(input.numeroSerie)},
             COR = ${sqlStr(input.cor ? input.cor.toUpperCase() : undefined)},
             CAPACIDADE = ${sqlStr(input.capacidade ? input.capacidade.toUpperCase() : undefined)},
             ESTADO = '${input.estado}',
             SITUACAO = '${input.situacao}',
             DATAENTRADA = ${sqlDate(dataEntrada)},
             CUSTO = ${sqlNum(input.custo)},
             PRECOVENDA = ${sqlNum(input.precoVenda)},
             OBSERVACAO = ${sqlStr(input.observacao)},
             ULTIMAALTERACAO = '${now}',
             SINCRONIZADO = 0
           WHERE GUIDIMEI = '${input.guidImei}'
             AND GUIDENTIDADE = '${session.guidEntidade}'`
        );
      } else {
        await querySql(
          `INSERT INTO KS0005.KS_PRODUTOS_IMEI
             (GUIDIMEI, GUIDPRODUTO, GUIDENTIDADE, IMEI1, IMEI2, NUMEROSERIE,
              COR, CAPACIDADE, ESTADO, SITUACAO, DATAENTRADA, CUSTO, PRECOVENDA,
              OBSERVACAO, ULTIMAALTERACAO, SINCRONIZADO)
           VALUES
             ('${input.guidImei}', '${input.guidProduto}', '${session.guidEntidade}',
              ${sqlStr(input.imei1)}, ${sqlStr(input.imei2)}, ${sqlStr(input.numeroSerie)},
              ${sqlStr(input.cor ? input.cor.toUpperCase() : undefined)},
              ${sqlStr(input.capacidade ? input.capacidade.toUpperCase() : undefined)},
              '${input.estado}', '${input.situacao}', ${sqlDate(dataEntrada)},
              ${sqlNum(input.custo)}, ${sqlNum(input.precoVenda)}, ${sqlStr(input.observacao)},
              '${now}', 0)`
        );
      }

      return { mensagem: "IMEI salvo com sucesso" };
    }),

  excluirImei: publicProcedure
    .input(z.object({ guidImei: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureProdutosImeiTable();
      await querySql(
        `DELETE FROM KS0005.KS_PRODUTOS_IMEI
         WHERE GUIDIMEI = '${input.guidImei}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      return { mensagem: "IMEI excluÃ­do com sucesso" };
    }),
});

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
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
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
  codBarras: z.string().max(50).optional(),
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
  // ── Produto fracionado ──
  fracionado: z.boolean().default(false),
  // ── Estoque ──
  estoque: z.number().default(0),
  estoqueMinimo: z.number().default(0),
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
  CODBENEFIBS: string | null;
  CODREGIMEESP: string | null;
  UNIDADE: string | null;
  FRACIONADO: boolean;
  ESTOQUE: number;
  ESTOQUEMINIMO: number;
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
  ISNULL(p.FRACIONADO,0) AS FRACIONADO,
  p.CODBARRAS
`;

// ─── Router ───────────────────────────────────────────────────────────────────
export const produtosRouter = router({

  // ── Regime tributário da empresa logada ──────────────────────────────────────
  regimeEmpresa: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<{
        CRT: number | null;
        REGIMEPISCOFINS: number | null;
        ALIQUOTAPIS: number | null;
        ALIQUOTACOFINS: number | null;
        CREDITOCSOSN: number | null;
        NOME: string;
        DOCUMENTO: string;
      }>(
        `SELECT TOP 1
           e.CRT, e.REGIMEPISCOFINS,
           e.ALIQUOTAPIS, e.ALIQUOTACOFINS, e.CREDITOCSOSN,
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
      const { busca, situacao, guidCategoria, pagina, porPagina } = input;
      const offset = (pagina - 1) * porPagina;

      let where = `WHERE p.GUIDENTIDADE = '${session.guidEntidade}'`;
      if (situacao !== "TODOS") where += ` AND p.SITUACAO = '${situacao}'`;
      if (guidCategoria) where += ` AND p.GUIDENTIDADECAT = '${guidCategoria}'`;
      if (busca) {
        const b = busca.replace(/'/g, "''");
        where += ` AND (p.PRODUTO LIKE '%${b}%' OR p.DESCRICAO LIKE '%${b}%' OR p.ERPCODE LIKE '%${b}%')`;
      }

      const countResult = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00009 p ${where}`
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

      return { total, pagina, porPagina, registros: rows };
    }),

  // ── Buscar por GUID ──────────────────────────────────────────────────────────
  buscarPorGuid: publicProcedure
    .input(z.object({ guidProduto: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<ProdutoRow>(
        `SELECT ${SELECT_CAMPOS}
         FROM KS0000.KS00009 p
         LEFT JOIN KS0000.KS00008 c
           ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
         WHERE p.GUIDPRODUTO = '${input.guidProduto}'
           AND p.GUIDENTIDADE = '${session.guidEntidade}'`
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
      return rows[0];
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
            UNIDADE, ESTOQUE, ESTOQUEMINIMO, FRACIONADO, CODBARRAS,
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
            ${input.fracionado ? 1 : 0},
            ${sqlStr(input.codBarras)},
            NEWID(), '${session.guidEntidade}', '${now}', '${now}')`
      );

      return { codProduto, mensagem: "Produto criado com sucesso" };
    }),

  // ── Atualizar ────────────────────────────────────────────────────────────────
  atualizar: publicProcedure
    .input(z.object({ guidProduto: z.string(), ...produtoInputBase }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);

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
           FRACIONADO = ${input.fracionado ? 1 : 0},
           CODBARRAS = ${sqlStr(input.codBarras)},
           ULTIMAALTERACAO = '${now}'
         WHERE GUIDPRODUTO = '${input.guidProduto}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );

      return { mensagem: "Produto atualizado com sucesso" };
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
});

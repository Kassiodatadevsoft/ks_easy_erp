/**
 * Router de Produtos — KS0000.KS00009
 * Multiempresa: GUIDENTIDADE filtra por empresa logada
 * Integração com delivery: campo ERPCODE vincula produto ao sistema de pizzaria
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

// ─── Router ───────────────────────────────────────────────────────────────────
export const produtosRouter = router({
  // ── Listar ──────────────────────────────────────────────────────────────────
  listar: publicProcedure
    .input(
      z.object({
        busca: z.string().optional(),
        situacao: z.enum(["TODOS", "A", "I"]).default("A"),
        guidCategoria: z.string().optional(),
        pagina: z.number().int().min(1).default(1),
        porPagina: z.number().int().min(1).max(100).default(20),
      })
    )
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

      const rows = await querySql<{
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
        IMAGEURL: string | null;
        ERPCODE: string | null;
        DESTAQUE: boolean;
        ORDEMEXIBICAO: number;
        SITUACAO: string;
        GUIDPRODUTO: string;
        GUIDENTIDADE: string;
        DATACADASTRO: Date;
        ULTIMAALTERACAO: Date;
      }>(
        `SELECT p.CODPRODUTO, p.PRODUTO, p.DESCRICAO, p.CODCATEGORIA, p.GUIDENTIDADECAT,
                c.CATEGORIA, p.PRECOS, p.TAMANHOSDISP, p.PRECO, p.PRECOVENDA,
                p.IMAGEURL, p.ERPCODE, p.DESTAQUE, p.ORDEMEXIBICAO, p.SITUACAO,
                p.GUIDPRODUTO, p.GUIDENTIDADE, p.DATACADASTRO, p.ULTIMAALTERACAO
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
      const rows = await querySql<{
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
        IMAGEURL: string | null;
        ERPCODE: string | null;
        DESTAQUE: boolean;
        ORDEMEXIBICAO: number;
        SITUACAO: string;
        GUIDPRODUTO: string;
        GUIDENTIDADE: string;
        DATACADASTRO: Date;
        ULTIMAALTERACAO: Date;
      }>(
        `SELECT p.CODPRODUTO, p.PRODUTO, p.DESCRICAO, p.CODCATEGORIA, p.GUIDENTIDADECAT,
                c.CATEGORIA, p.PRECOS, p.TAMANHOSDISP, p.PRECO, p.PRECOVENDA,
                p.IMAGEURL, p.ERPCODE, p.DESTAQUE, p.ORDEMEXIBICAO, p.SITUACAO,
                p.GUIDPRODUTO, p.GUIDENTIDADE, p.DATACADASTRO, p.ULTIMAALTERACAO
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
    .input(
      z.object({
        produto: z.string(),
        guidProduto: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const nome = toUpper(input.produto).replace(/'/g, "''");
      let sql = `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00009
                 WHERE PRODUTO = '${nome}' AND GUIDENTIDADE = '${session.guidEntidade}'`;
      if (input.guidProduto) {
        sql += ` AND GUIDPRODUTO <> '${input.guidProduto}'`;
      }
      const rows = await querySql<{ TOTAL: number }>(sql);
      return { disponivel: (rows[0]?.TOTAL ?? 0) === 0 };
    }),

  // ── Criar ────────────────────────────────────────────────────────────────────
  criar: publicProcedure
    .input(
      z.object({
        produto: z.string().min(1, "Nome obrigatório"),
        descricao: z.string().optional(),
        codCategoria: z.number().int().optional(),
        guidentidadeCat: z.string().optional(),
        precos: z.string().optional(),       // JSON string: {"brotinho":29.90,"media":49.90}
        tamanhosDisp: z.string().optional(), // JSON string: ["brotinho","media","grande"]
        preco: z.number().default(0),
        precoVenda: z.number().default(0),
        imageUrl: z.string().optional(),
        erpCode: z.string().optional(),
        destaque: z.boolean().default(false),
        ordemExibicao: z.number().int().default(0),
        situacao: z.enum(["A", "I"]).default("A"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);

      // Gerar próximo CODPRODUTO (global)
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
            PRECOS, TAMANHOSDISP, PRECO, PRECOVENDA, IMAGEURL, ERPCODE,
            DESTAQUE, ORDEMEXIBICAO, SITUACAO, GUIDPRODUTO, GUIDENTIDADE,
            DATACADASTRO, ULTIMAALTERACAO)
         VALUES
           (${codProduto}, '${produto}', ${descricao ? `'${descricao}'` : "NULL"},
            ${input.codCategoria ?? "NULL"}, ${sqlStr(input.guidentidadeCat)},
            ${sqlStr(input.precos)}, ${sqlStr(input.tamanhosDisp)},
            ${input.preco}, ${input.precoVenda},
            ${sqlStr(input.imageUrl)}, ${sqlStr(input.erpCode ? toUpper(input.erpCode) : null)},
            ${input.destaque ? 1 : 0}, ${input.ordemExibicao}, '${input.situacao}',
            NEWID(), '${session.guidEntidade}', '${now}', '${now}')`
      );

      return { codProduto, mensagem: "Produto criado com sucesso" };
    }),

  // ── Atualizar ────────────────────────────────────────────────────────────────
  atualizar: publicProcedure
    .input(
      z.object({
        guidProduto: z.string(),
        produto: z.string().min(1, "Nome obrigatório"),
        descricao: z.string().optional(),
        codCategoria: z.number().int().optional(),
        guidentidadeCat: z.string().optional(),
        precos: z.string().optional(),
        tamanhosDisp: z.string().optional(),
        preco: z.number().default(0),
        precoVenda: z.number().default(0),
        imageUrl: z.string().optional(),
        erpCode: z.string().optional(),
        destaque: z.boolean().default(false),
        ordemExibicao: z.number().int().default(0),
        situacao: z.enum(["A", "I"]).default("A"),
      })
    )
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
           PRECO = ${input.preco},
           PRECOVENDA = ${input.precoVenda},
           IMAGEURL = ${sqlStr(input.imageUrl)},
           ERPCODE = ${sqlStr(input.erpCode ? toUpper(input.erpCode) : null)},
           DESTAQUE = ${input.destaque ? 1 : 0},
           ORDEMEXIBICAO = ${input.ordemExibicao},
           SITUACAO = '${input.situacao}',
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
        `UPDATE KS0000.KS00009 SET
           SITUACAO = 'I', ULTIMAALTERACAO = '${now}'
         WHERE GUIDPRODUTO = '${input.guidProduto}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );

      return { mensagem: "Produto inativado com sucesso" };
    }),
});

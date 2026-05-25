/**
 * Router de Categorias de Produtos — KS0000.KS00008
 * Multiempresa: GUIDENTIDADE filtra por empresa logada
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

// ─── Router ───────────────────────────────────────────────────────────────────
export const categoriasRouter = router({
  // ── Listar ──────────────────────────────────────────────────────────────────
  listar: publicProcedure
    .input(
      z.object({
        busca: z.string().optional(),
        situacao: z.enum(["TODOS", "A", "I"]).default("A"),
        pagina: z.number().int().min(1).default(1),
        porPagina: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const { busca, situacao, pagina, porPagina } = input;
      const offset = (pagina - 1) * porPagina;

      let where = `WHERE GUIDENTIDADE = '${session.guidEntidade}'`;
      if (situacao !== "TODOS") where += ` AND SITUACAO = '${situacao}'`;
      if (busca) {
        const b = busca.replace(/'/g, "''");
        where += ` AND (CATEGORIA LIKE '%${b}%' OR DESCRICAO LIKE '%${b}%')`;
      }

      const countResult = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00008 ${where}`
      );
      const total = countResult[0]?.TOTAL ?? 0;

      const rows = await querySql<{
        CODCATEGORIA: number;
        CATEGORIA: string;
        DESCRICAO: string | null;
        SLUG: string | null;
        ORDEMEXIBICAO: number;
        SITUACAO: string;
        GUIDCATEGORIA: string;
        GUIDENTIDADE: string;
        DATACADASTRO: Date;
        ULTIMAALTERACAO: Date;
      }>(
        `SELECT CODCATEGORIA, CATEGORIA, DESCRICAO, SLUG, ORDEMEXIBICAO, SITUACAO,
                GUIDCATEGORIA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO
         FROM KS0000.KS00008 ${where}
         ORDER BY ORDEMEXIBICAO, CATEGORIA
         OFFSET ${offset} ROWS FETCH NEXT ${porPagina} ROWS ONLY`
      );

      return { total, pagina, porPagina, registros: rows };
    }),

  // ── Buscar por GUID ──────────────────────────────────────────────────────────
  buscarPorGuid: publicProcedure
    .input(z.object({ guidCategoria: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<{
        CODCATEGORIA: number;
        CATEGORIA: string;
        DESCRICAO: string | null;
        SLUG: string | null;
        ORDEMEXIBICAO: number;
        SITUACAO: string;
        GUIDCATEGORIA: string;
        GUIDENTIDADE: string;
        DATACADASTRO: Date;
        ULTIMAALTERACAO: Date;
      }>(
        `SELECT CODCATEGORIA, CATEGORIA, DESCRICAO, SLUG, ORDEMEXIBICAO, SITUACAO,
                GUIDCATEGORIA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO
         FROM KS0000.KS00008
         WHERE GUIDCATEGORIA = '${input.guidCategoria}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
      return rows[0];
    }),

  // ── Validar nome ─────────────────────────────────────────────────────────────
  validarNome: publicProcedure
    .input(
      z.object({
        categoria: z.string(),
        guidCategoria: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const nome = toUpper(input.categoria).replace(/'/g, "''");
      let sql = `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00008
                 WHERE CATEGORIA = '${nome}' AND GUIDENTIDADE = '${session.guidEntidade}'`;
      if (input.guidCategoria) {
        sql += ` AND GUIDCATEGORIA <> '${input.guidCategoria}'`;
      }
      const rows = await querySql<{ TOTAL: number }>(sql);
      return { disponivel: (rows[0]?.TOTAL ?? 0) === 0 };
    }),

  // ── Criar ────────────────────────────────────────────────────────────────────
  criar: publicProcedure
    .input(
      z.object({
        categoria: z.string().min(1, "Nome obrigatório"),
        descricao: z.string().optional(),
        slug: z.string().optional(),
        ordemExibicao: z.number().int().default(0),
        situacao: z.enum(["A", "I"]).default("A"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);

      // Gerar próximo CODCATEGORIA (global, sem filtro de empresa)
      const maxRows = await querySql<{ MAXCOD: number | null }>(
        `SELECT ISNULL(MAX(CODCATEGORIA), 0) AS MAXCOD FROM KS0000.KS00008`
      );
      const codCategoria = (maxRows[0]?.MAXCOD ?? 0) + 1;

      const categoria = toUpper(input.categoria).replace(/'/g, "''");
      const descricao = input.descricao ? toUpper(input.descricao).replace(/'/g, "''") : null;
      const slug = input.slug ? input.slug.toLowerCase().replace(/'/g, "''") : null;
      const now = new Date().toISOString();

      await querySql(
        `INSERT INTO KS0000.KS00008
           (CODCATEGORIA, CATEGORIA, DESCRICAO, SLUG, ORDEMEXIBICAO, SITUACAO,
            GUIDCATEGORIA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
         VALUES
           (${codCategoria}, '${categoria}', ${descricao ? `'${descricao}'` : "NULL"},
            ${slug ? `'${slug}'` : "NULL"}, ${input.ordemExibicao}, '${input.situacao}',
            NEWID(), '${session.guidEntidade}', '${now}', '${now}')`
      );

      return { codCategoria, mensagem: "Categoria criada com sucesso" };
    }),

  // ── Atualizar ────────────────────────────────────────────────────────────────
  atualizar: publicProcedure
    .input(
      z.object({
        guidCategoria: z.string(),
        categoria: z.string().min(1, "Nome obrigatório"),
        descricao: z.string().optional(),
        slug: z.string().optional(),
        ordemExibicao: z.number().int().default(0),
        situacao: z.enum(["A", "I"]).default("A"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);

      const categoria = toUpper(input.categoria).replace(/'/g, "''");
      const descricao = input.descricao ? toUpper(input.descricao).replace(/'/g, "''") : null;
      const slug = input.slug ? input.slug.toLowerCase().replace(/'/g, "''") : null;
      const now = new Date().toISOString();

      await querySql(
        `UPDATE KS0000.KS00008 SET
           CATEGORIA = '${categoria}',
           DESCRICAO = ${descricao ? `'${descricao}'` : "NULL"},
           SLUG = ${slug ? `'${slug}'` : "NULL"},
           ORDEMEXIBICAO = ${input.ordemExibicao},
           SITUACAO = '${input.situacao}',
           ULTIMAALTERACAO = '${now}'
         WHERE GUIDCATEGORIA = '${input.guidCategoria}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );

      return { mensagem: "Categoria atualizada com sucesso" };
    }),

  // ── Excluir (soft delete) ────────────────────────────────────────────────────
  excluir: publicProcedure
    .input(z.object({ guidCategoria: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      const now = new Date().toISOString();

      await querySql(
        `UPDATE KS0000.KS00008 SET
           SITUACAO = 'I', ULTIMAALTERACAO = '${now}'
         WHERE GUIDCATEGORIA = '${input.guidCategoria}'
           AND GUIDENTIDADE = '${session.guidEntidade}'`
      );

      return { mensagem: "Categoria inativada com sucesso" };
    }),

  // ── Listar todas (para selects) ──────────────────────────────────────────────
  listarTodas: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const rows = await querySql<{
      CODCATEGORIA: number;
      CATEGORIA: string;
      GUIDCATEGORIA: string;
    }>(
      `SELECT CODCATEGORIA, CATEGORIA, GUIDCATEGORIA
       FROM KS0000.KS00008
       WHERE GUIDENTIDADE = '${session.guidEntidade}' AND SITUACAO = 'A'
       ORDER BY ORDEMEXIBICAO, CATEGORIA`
    );
    return rows;
  }),
});

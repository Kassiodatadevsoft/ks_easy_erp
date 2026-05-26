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

export const categoriasEstoqueRouter = router({
  listar: publicProcedure
    .input(z.object({
      busca:    z.string().optional(),
      situacao: z.string().optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conds = ["GUIDENTIDADE = @guidentidade"];
      if (input?.situacao) conds.push(`SITUACAO = '${input.situacao.replace(/'/g, "''")}'`);
      if (input?.busca) conds.push("CATEGORIA LIKE @busca");
      const where = conds.join(" AND ");

      const guidEnt = session.guidEntidade;
      function addParams(req: ReturnType<typeof pool.request>) {
        req.input("guidentidade", sql.UniqueIdentifier, guidEnt);
        if (input?.busca) req.input("busca", sql.NVarChar(100), `%${input.busca}%`);
        return req;
      }

      const countR = await addParams(pool.request())
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0004.KS00002 WHERE ${where}`);
      const total = (countR.recordset[0] as { TOTAL: number }).TOTAL;

      const r = await addParams(pool.request())
        .input("offset",   sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(GUIDCATEGORIA AS NVARCHAR(36)) AS guidCategoria,
            CODCATEGORIA, CATEGORIA, DESCRICAO, SITUACAO,
            DATACADASTRO, ULTIMAALTERACAO
          FROM KS0004.KS00002
          WHERE ${where}
          ORDER BY CATEGORIA ASC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: r.recordset, total };
    }),

  listarTodas: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT CAST(GUIDCATEGORIA AS NVARCHAR(36)) AS guidCategoria, CATEGORIA
          FROM KS0004.KS00002
          WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
          ORDER BY CATEGORIA ASC
        `);
      return r.recordset as { guidCategoria: string; CATEGORIA: string }[];
    }),

  criar: publicProcedure
    .input(z.object({
      categoria:  z.string().min(2).max(60),
      descricao:  z.string().max(200).optional(),
      situacao:   z.enum(["A", "I"]).default("A"),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      const guid = crypto.randomUUID();
      await pool.request()
        .input("guidcategoria", sql.UniqueIdentifier, guid)
        .input("categoria",     sql.NVarChar(60),     input.categoria.toUpperCase())
        .input("descricao",     sql.NVarChar(200),    input.descricao?.toUpperCase() ?? null)
        .input("situacao",      sql.Char(1),          input.situacao)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0004.KS00002 (GUIDCATEGORIA, CATEGORIA, DESCRICAO, SITUACAO, GUIDENTIDADE)
          VALUES (@guidcategoria, @categoria, @descricao, @situacao, @guidentidade)
        `);
      return { guidCategoria: guid };
    }),

  atualizar: publicProcedure
    .input(z.object({
      guidCategoria: z.string().uuid(),
      categoria:     z.string().min(2).max(60),
      descricao:     z.string().max(200).optional(),
      situacao:      z.enum(["A", "I"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      await pool.request()
        .input("guidcategoria", sql.UniqueIdentifier, input.guidCategoria)
        .input("categoria",     sql.NVarChar(60),     input.categoria.toUpperCase())
        .input("descricao",     sql.NVarChar(200),    input.descricao?.toUpperCase() ?? null)
        .input("situacao",      sql.Char(1),          input.situacao)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0004.KS00002
          SET CATEGORIA=@categoria, DESCRICAO=@descricao, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDCATEGORIA=@guidcategoria AND GUIDENTIDADE=@guidentidade
        `);
      return { ok: true };
    }),

  excluir: publicProcedure
    .input(z.object({ guidCategoria: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new Error("Não autenticado");
      const pool = await getSqlPool();
      // Verificar se há produtos vinculados
      const check = await pool.request()
        .input("guidcategoria", sql.UniqueIdentifier, input.guidCategoria)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`SELECT COUNT(*) AS TOTAL FROM KS0004.KS00001 WHERE GUIDCATEGORIA=@guidcategoria AND GUIDENTIDADE=@guidentidade`);
      const total = (check.recordset[0] as { TOTAL: number }).TOTAL;
      if (total > 0) throw new Error(`Categoria possui ${total} produto(s) vinculado(s). Inative-a ou transfira os produtos antes de excluir.`);
      await pool.request()
        .input("guidcategoria", sql.UniqueIdentifier, input.guidCategoria)
        .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
        .query(`DELETE FROM KS0004.KS00002 WHERE GUIDCATEGORIA=@guidcategoria AND GUIDENTIDADE=@guidentidade`);
      return { ok: true };
    }),
});

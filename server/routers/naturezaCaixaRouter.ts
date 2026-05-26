import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  return await verifyKsSession(match?.[1]);
}

const naturezaBase = z.object({
  natureza:  z.string().min(1).max(100),
  descricao: z.string().max(255).optional().nullable(),
  tipo:      z.enum(["R", "D"]),
  guidConta: z.string().uuid().optional().nullable(),
  situacao:  z.enum(["A", "I"]).default("A"),
});

export const naturezaCaixaRouter = router({
  listar: publicProcedure
    .input(z.object({ tipo: z.string().optional(), situacao: z.string().optional(), busca: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      let where = "n.GUIDENTIDADE = @guidentidade";
      if (input?.tipo) where += ` AND n.TIPO = '${input.tipo}'`;
      if (input?.situacao) where += ` AND n.SITUACAO = '${input.situacao}'`;
      if (input?.busca) where += ` AND n.NATUREZA LIKE '%${input.busca.replace(/'/g, "''")}%'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(n.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
            n.NATUREZA, n.DESCRICAO, n.TIPO,
            CAST(n.GUIDCONTA AS NVARCHAR(36))    AS guidConta,
            c.CONTA                               AS nomeConta,
            n.SITUACAO, n.DATACADASTRO, n.ULTIMAALTERACAO
          FROM KS0003.KS00003 n
          LEFT JOIN KS0003.KS00001 c ON c.GUIDCONTA = n.GUIDCONTA
          WHERE ${where}
          ORDER BY n.TIPO, n.NATUREZA
        `);
      return r.recordset;
    }),

  listarTodas: publicProcedure
    .input(z.object({ tipo: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      let where = "GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'";
      if (input?.tipo) where += ` AND TIPO = '${input.tipo}'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA, TIPO
          FROM KS0003.KS00003
          WHERE ${where}
          ORDER BY TIPO, NATUREZA
        `);
      return r.recordset;
    }),

  criar: publicProcedure.input(naturezaBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const guid = crypto.randomUUID();
    await pool.request()
      .input("guidnatureza", sql.UniqueIdentifier, guid)
      .input("natureza",     sql.NVarChar(100),    input.natureza.toUpperCase())
      .input("descricao",    sql.NVarChar(255),    input.descricao ?? null)
      .input("tipo",         sql.Char(1),          input.tipo)
      .input("guidconta",    sql.UniqueIdentifier, input.guidConta ?? null)
      .input("situacao",     sql.Char(1),          input.situacao)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00003
          (GUIDNATUREZA,NATUREZA,DESCRICAO,TIPO,GUIDCONTA,SITUACAO,GUIDENTIDADE)
        VALUES
          (@guidnatureza,@natureza,@descricao,@tipo,@guidconta,@situacao,@guidentidade)
      `);
    return { success: true, guidNatureza: guid };
  }),

  atualizar: publicProcedure.input(naturezaBase.extend({ guidNatureza: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
      .input("natureza",     sql.NVarChar(100),    input.natureza.toUpperCase())
      .input("descricao",    sql.NVarChar(255),    input.descricao ?? null)
      .input("tipo",         sql.Char(1),          input.tipo)
      .input("guidconta",    sql.UniqueIdentifier, input.guidConta ?? null)
      .input("situacao",     sql.Char(1),          input.situacao)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00003 SET
          NATUREZA=@natureza, DESCRICAO=@descricao, TIPO=@tipo,
          GUIDCONTA=@guidconta, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDNATUREZA=@guidnatureza AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),

  excluir: publicProcedure.input(z.object({ guidNatureza: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00003 SET SITUACAO='I', ULTIMAALTERACAO=GETDATE()
        WHERE GUIDNATUREZA=@guidnatureza AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),
});

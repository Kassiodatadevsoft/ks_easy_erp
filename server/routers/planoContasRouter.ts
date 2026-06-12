import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  return await verifyKsSession(match?.[1]);
}

const contaBase = z.object({
  codConta:     z.string().min(1).max(20),
  conta:        z.string().min(1).max(100),
  descricao:    z.string().max(255).optional().nullable(),
  tipo:         z.enum(["R", "D", "T"]).default("D"),
  nivel:        z.number().int().min(1).max(5).default(1),
  guidContaPai: z.string().uuid().optional().nullable(),
  mascara:      z.string().max(30).optional().nullable(),
  situacao:     z.enum(["A", "I"]).default("A"),
});

const cancelarContaProcedure = publicProcedure.input(z.object({ guidConta: z.string().uuid() })).mutation(async ({ input, ctx }) => {
  const session = await getKsSession(ctx.req);
  if (!session) throw new Error("Não autenticado");
  const pool = await getSqlPool();
  await pool.request()
    .input("guidconta",    sql.UniqueIdentifier, input.guidConta)
    .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
    .query(`
      UPDATE KS0003.KS00001 SET SITUACAO='I', ULTIMAALTERACAO=GETDATE()
      WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
    `);
  return { success: true, action: "cancelado" as const };
});

export const planoContasRouter = router({
  listar: publicProcedure
    .input(z.object({ tipo: z.string().optional(), situacao: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const req2 = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      let where = "c.GUIDENTIDADE = @guidentidade";
      if (input?.tipo) {
        req2.input("tipo", sql.Char(1), input.tipo);
        where += " AND c.TIPO = @tipo";
      }
      if (input?.situacao) {
        req2.input("situacao", sql.Char(1), input.situacao);
        where += " AND c.SITUACAO = @situacao";
      }
      const r = await req2.query(`
        SELECT
          CAST(c.GUIDCONTA AS NVARCHAR(36))    AS guidConta,
          c.CODCONTA, c.CONTA, c.DESCRICAO, c.TIPO, c.NIVEL,
          CAST(c.GUIDCONTAPAI AS NVARCHAR(36)) AS guidContaPai,
          p.CONTA                               AS contaPai,
          c.MASCARA, c.SITUACAO,
          c.DATACADASTRO, c.ULTIMAALTERACAO
        FROM KS0003.KS00001 c
        LEFT JOIN KS0003.KS00001 p ON p.GUIDCONTA = c.GUIDCONTAPAI AND p.GUIDENTIDADE = c.GUIDENTIDADE
        WHERE ${where}
        ORDER BY c.CODCONTA
      `);
      return r.recordset;
    }),

  listarTodas: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) return [];
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CODCONTA, CONTA, TIPO
        FROM KS0003.KS00001
        WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
        ORDER BY CODCONTA
      `);
    return r.recordset;
  }),

  criar: publicProcedure.input(contaBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const guid = crypto.randomUUID();
    await pool.request()
      .input("guidconta",    sql.UniqueIdentifier, guid)
      .input("codconta",     sql.NVarChar(20),     input.codConta.toUpperCase())
      .input("conta",        sql.NVarChar(100),    input.conta.toUpperCase())
      .input("descricao",    sql.NVarChar(255),    input.descricao ?? null)
      .input("tipo",         sql.Char(1),          input.tipo)
      .input("nivel",        sql.TinyInt,          input.nivel)
      .input("guidcontapai", sql.UniqueIdentifier, input.guidContaPai ?? null)
      .input("mascara",      sql.NVarChar(30),     input.mascara ?? null)
      .input("situacao",     sql.Char(1),          input.situacao)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00001
          (GUIDCONTA,CODCONTA,CONTA,DESCRICAO,TIPO,NIVEL,GUIDCONTAPAI,MASCARA,SITUACAO,GUIDENTIDADE)
        VALUES
          (@guidconta,@codconta,@conta,@descricao,@tipo,@nivel,@guidcontapai,@mascara,@situacao,@guidentidade)
      `);
    return { success: true, guidConta: guid };
  }),

  atualizar: publicProcedure.input(contaBase.extend({ guidConta: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidconta",    sql.UniqueIdentifier, input.guidConta)
      .input("codconta",     sql.NVarChar(20),     input.codConta.toUpperCase())
      .input("conta",        sql.NVarChar(100),    input.conta.toUpperCase())
      .input("descricao",    sql.NVarChar(255),    input.descricao ?? null)
      .input("tipo",         sql.Char(1),          input.tipo)
      .input("nivel",        sql.TinyInt,          input.nivel)
      .input("guidcontapai", sql.UniqueIdentifier, input.guidContaPai ?? null)
      .input("mascara",      sql.NVarChar(30),     input.mascara ?? null)
      .input("situacao",     sql.Char(1),          input.situacao)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00001 SET
          CODCONTA=@codconta, CONTA=@conta, DESCRICAO=@descricao,
          TIPO=@tipo, NIVEL=@nivel, GUIDCONTAPAI=@guidcontapai,
          MASCARA=@mascara, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),

  cancelar: cancelarContaProcedure,
  excluir: cancelarContaProcedure,
});

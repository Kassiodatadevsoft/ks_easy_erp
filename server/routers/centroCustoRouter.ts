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

const centroBase = z.object({
  codCentro:     z.string().min(1).max(20),
  centro:        z.string().min(1).max(100),
  descricao:     z.string().max(255).optional().nullable(),
  nivel:         z.number().int().min(1).max(5).default(1),
  guidCentroPai: z.string().uuid().optional().nullable(),
  orcamento:     z.number().min(0).default(0),
  situacao:      z.enum(["A", "I"]).default("A"),
});

const cancelarCentroProcedure = publicProcedure.input(z.object({ guidCentro: z.string().uuid() })).mutation(async ({ input, ctx }) => {
  const session = await getKsSession(ctx.req);
  if (!session) throw new Error("Não autenticado");
  const pool = await getSqlPool();
  await pool.request()
    .input("guidcentro",   sql.UniqueIdentifier, input.guidCentro)
    .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
    .query(`
      UPDATE KS0003.KS00002 SET SITUACAO='I', ULTIMAALTERACAO=GETDATE()
      WHERE GUIDCENTRO=@guidcentro AND GUIDENTIDADE=@guidentidade
    `);
  return { success: true, action: "cancelado" as const };
});

export const centroCustoRouter = router({
  listar: publicProcedure
    .input(z.object({ situacao: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      let where = "c.GUIDENTIDADE = @guidentidade";
      if (input?.situacao) where += ` AND c.SITUACAO = '${input.situacao}'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(c.GUIDCENTRO AS NVARCHAR(36))    AS guidCentro,
            c.CODCENTRO, c.CENTRO, c.DESCRICAO, c.NIVEL,
            CAST(c.GUIDCENTROPAI AS NVARCHAR(36)) AS guidCentroPai,
            p.CENTRO                               AS centroPai,
            c.ORCAMENTO, c.SITUACAO,
            c.DATACADASTRO, c.ULTIMAALTERACAO
          FROM KS0003.KS00002 c
          LEFT JOIN KS0003.KS00002 p ON p.GUIDCENTRO = c.GUIDCENTROPAI
          WHERE ${where}
          ORDER BY c.CODCENTRO
        `);
      return r.recordset;
    }),

  listarTodos: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) return [];
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CODCENTRO, CENTRO
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
        ORDER BY CODCENTRO
      `);
    return r.recordset;
  }),

  criar: publicProcedure.input(centroBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const guid = crypto.randomUUID();
    await pool.request()
      .input("guidcentro",    sql.UniqueIdentifier, guid)
      .input("codcentro",     sql.NVarChar(20),     input.codCentro.toUpperCase())
      .input("centro",        sql.NVarChar(100),    input.centro.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("nivel",         sql.TinyInt,          input.nivel)
      .input("guidcentropai", sql.UniqueIdentifier, input.guidCentroPai ?? null)
      .input("orcamento",     sql.Decimal(15, 2),   input.orcamento)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00002
          (GUIDCENTRO,CODCENTRO,CENTRO,DESCRICAO,NIVEL,GUIDCENTROPAI,ORCAMENTO,SITUACAO,GUIDENTIDADE)
        VALUES
          (@guidcentro,@codcentro,@centro,@descricao,@nivel,@guidcentropai,@orcamento,@situacao,@guidentidade)
      `);
    return { success: true, guidCentro: guid };
  }),

  atualizar: publicProcedure.input(centroBase.extend({ guidCentro: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidcentro",    sql.UniqueIdentifier, input.guidCentro)
      .input("codcentro",     sql.NVarChar(20),     input.codCentro.toUpperCase())
      .input("centro",        sql.NVarChar(100),    input.centro.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("nivel",         sql.TinyInt,          input.nivel)
      .input("guidcentropai", sql.UniqueIdentifier, input.guidCentroPai ?? null)
      .input("orcamento",     sql.Decimal(15, 2),   input.orcamento)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00002 SET
          CODCENTRO=@codcentro, CENTRO=@centro, DESCRICAO=@descricao,
          NIVEL=@nivel, GUIDCENTROPAI=@guidcentropai, ORCAMENTO=@orcamento,
          SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDCENTRO=@guidcentro AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),

  cancelar: cancelarCentroProcedure,
  excluir: cancelarCentroProcedure,

  resumoOrcamento: publicProcedure
    .input(z.object({ dtInicio: z.string(), dtFim: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
        .input("dtFim",        sql.NVarChar(10),             input.dtFim)
        .query(`
          SELECT
            cc.CODCENTRO, cc.CENTRO, cc.ORCAMENTO,
            ISNULL((
              SELECT SUM(cp.VALORPAGO) FROM KS0003.KS00004 cp
              WHERE cp.GUIDCENTRO = cc.GUIDCENTRO
                AND cp.GUIDENTIDADE = cc.GUIDENTIDADE
                AND cp.DTVENCIMENTO BETWEEN @dtInicio AND @dtFim
            ), 0) AS REALIZADO_PAGAR,
            ISNULL((
              SELECT SUM(cr.VALORRECEBIDO) FROM KS0003.KS00005 cr
              WHERE cr.GUIDCENTRO = cc.GUIDCENTRO
                AND cr.GUIDENTIDADE = cc.GUIDENTIDADE
                AND cr.DTVENCIMENTO BETWEEN @dtInicio AND @dtFim
            ), 0) AS REALIZADO_RECEBER
          FROM KS0003.KS00002 cc
          WHERE cc.GUIDENTIDADE = @guidentidade AND cc.SITUACAO = 'A'
          ORDER BY cc.CODCENTRO
        `);
      return r.recordset;
    }),
});

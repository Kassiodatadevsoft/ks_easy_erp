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

export const fluxoCaixaRouter = router({
  fluxoDiario: publicProcedure
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
            CONVERT(NVARCHAR(10), DATA, 23) AS DT,
            SUM(CASE WHEN TIPO='R' THEN VALOR ELSE 0 END) AS ENTRADAS,
            SUM(CASE WHEN TIPO='D' THEN VALOR ELSE 0 END) AS SAIDAS,
            SUM(CASE WHEN TIPO='R' THEN VALOR ELSE -VALOR END) AS SALDO_DIA
          FROM KS0003.KS00007
          WHERE GUIDENTIDADE=@guidentidade AND DATA BETWEEN @dtInicio AND @dtFim
          GROUP BY CONVERT(NVARCHAR(10), DATA, 23)
          ORDER BY DT
        `);
      return r.recordset;
    }),

  resumoPeriodo: publicProcedure
    .input(z.object({ dtInicio: z.string(), dtFim: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return null;
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
        .input("dtFim",        sql.NVarChar(10),             input.dtFim)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN TIPO='R' THEN VALOR ELSE 0 END), 0) AS TOTAL_ENTRADAS,
            ISNULL(SUM(CASE WHEN TIPO='D' THEN VALOR ELSE 0 END), 0) AS TOTAL_SAIDAS,
            ISNULL(SUM(CASE WHEN TIPO='R' THEN VALOR ELSE -VALOR END), 0) AS SALDO_PERIODO,
            COUNT(CASE WHEN TIPO='R' THEN 1 END) AS QTD_ENTRADAS,
            COUNT(CASE WHEN TIPO='D' THEN 1 END) AS QTD_SAIDAS
          FROM KS0003.KS00007
          WHERE GUIDENTIDADE=@guidentidade AND DATA BETWEEN @dtInicio AND @dtFim
        `);
      return r.recordset[0] ?? null;
    }),

  fluxoPorNatureza: publicProcedure
    .input(z.object({ dtInicio: z.string(), dtFim: z.string(), tipo: z.enum(["R", "D"]).optional() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      let where = "m.GUIDENTIDADE=@guidentidade AND m.DATA BETWEEN @dtInicio AND @dtFim";
      if (input.tipo) where += ` AND m.TIPO='${input.tipo}'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
        .input("dtFim",        sql.NVarChar(10),             input.dtFim)
        .query(`
          SELECT
            m.TIPO,
            ISNULL(n.NATUREZA, 'Sem Natureza') AS NATUREZA,
            SUM(m.VALOR) AS TOTAL,
            COUNT(*) AS QTD
          FROM KS0003.KS00007 m
          LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = m.GUIDNATUREZA
          WHERE ${where}
          GROUP BY m.TIPO, n.NATUREZA
          ORDER BY m.TIPO, TOTAL DESC
        `);
      return r.recordset;
    }),

  fluxoPorCentro: publicProcedure
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
            ISNULL(cc.CENTRO, 'Sem Centro') AS CENTRO,
            SUM(CASE WHEN m.TIPO='R' THEN m.VALOR ELSE 0 END) AS ENTRADAS,
            SUM(CASE WHEN m.TIPO='D' THEN m.VALOR ELSE 0 END) AS SAIDAS,
            SUM(CASE WHEN m.TIPO='R' THEN m.VALOR ELSE -m.VALOR END) AS SALDO
          FROM KS0003.KS00007 m
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO = m.GUIDCENTRO
          WHERE m.GUIDENTIDADE=@guidentidade AND m.DATA BETWEEN @dtInicio AND @dtFim
          GROUP BY cc.CENTRO
          ORDER BY SALDO DESC
        `);
      return r.recordset;
    }),

  dre: publicProcedure
    .input(z.object({ dtInicio: z.string(), dtFim: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { receitas: [], despesas: [], totalReceitas: 0, totalDespesas: 0, resultado: 0 };
      const pool = await getSqlPool();
      const [recR, despR] = await Promise.all([
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
          .input("dtFim",        sql.NVarChar(10),             input.dtFim)
          .query(`
            SELECT ISNULL(n.NATUREZA,'Sem Natureza') AS NATUREZA, SUM(cr.VALORRECEBIDO) AS TOTAL
            FROM KS0003.KS00005 cr
            LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = cr.GUIDNATUREZA
            WHERE cr.GUIDENTIDADE=@guidentidade AND cr.STATUS IN ('PAGO','PARCIAL')
              AND cr.DTRECEBIMENTO BETWEEN @dtInicio AND @dtFim
            GROUP BY n.NATUREZA ORDER BY TOTAL DESC
          `),
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
          .input("dtFim",        sql.NVarChar(10),             input.dtFim)
          .query(`
            SELECT ISNULL(n.NATUREZA,'Sem Natureza') AS NATUREZA, SUM(cp.VALORPAGO) AS TOTAL
            FROM KS0003.KS00004 cp
            LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = cp.GUIDNATUREZA
            WHERE cp.GUIDENTIDADE=@guidentidade AND cp.STATUS IN ('PAGO','PARCIAL')
              AND cp.DTPAGAMENTO BETWEEN @dtInicio AND @dtFim
            GROUP BY n.NATUREZA ORDER BY TOTAL DESC
          `),
      ]);
      const receitas = recR.recordset;
      const despesas = despR.recordset;
      const totalReceitas = receitas.reduce((s: number, r: { TOTAL: number }) => s + Number(r.TOTAL), 0);
      const totalDespesas = despesas.reduce((s: number, r: { TOTAL: number }) => s + Number(r.TOTAL), 0);
      return { receitas, despesas, totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas };
    }),

  previsao: publicProcedure
    .input(z.object({ dias: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { apagar: [], areceber: [] };
      const pool = await getSqlPool();
      const hoje = new Date().toISOString().slice(0, 10);
      const futuro = new Date(Date.now() + input.dias * 86400000).toISOString().slice(0, 10);
      const [pagarR, receberR] = await Promise.all([
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("hoje",         sql.NVarChar(10),             hoje)
          .input("futuro",       sql.NVarChar(10),             futuro)
          .query(`
            SELECT cp.DESCRICAO, cp.NOMECREDOR, cp.VALOR, cp.VALORPAGO,
                   CONVERT(NVARCHAR(10), cp.DTVENCIMENTO, 23) AS DTVENCIMENTO,
                   n.NATUREZA AS NOMENATUREZA, cp.STATUS
            FROM KS0003.KS00004 cp
            LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = cp.GUIDNATUREZA
            WHERE cp.GUIDENTIDADE=@guidentidade AND cp.STATUS IN ('ABERTO','PARCIAL')
              AND cp.DTVENCIMENTO BETWEEN @hoje AND @futuro
            ORDER BY cp.DTVENCIMENTO
          `),
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("hoje",         sql.NVarChar(10),             hoje)
          .input("futuro",       sql.NVarChar(10),             futuro)
          .query(`
            SELECT cr.DESCRICAO, cr.NOMEDEVEDOR, cr.VALOR, cr.VALORRECEBIDO,
                   CONVERT(NVARCHAR(10), cr.DTVENCIMENTO, 23) AS DTVENCIMENTO,
                   n.NATUREZA AS NOMENATUREZA, cr.STATUS
            FROM KS0003.KS00005 cr
            LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = cr.GUIDNATUREZA
            WHERE cr.GUIDENTIDADE=@guidentidade AND cr.STATUS IN ('ABERTO','PARCIAL')
              AND cr.DTVENCIMENTO BETWEEN @hoje AND @futuro
            ORDER BY cr.DTVENCIMENTO
          `),
      ]);
      return { apagar: pagarR.recordset, areceber: receberR.recordset };
    }),

  movimentacoes: publicProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim:    z.string(),
      tipo:     z.enum(["R", "D"]).optional(),
      page:     z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return { items: [], total: 0 };
      const pool = await getSqlPool();
      const offset = (input.page - 1) * input.pageSize;
      let where = "m.GUIDENTIDADE=@guidentidade AND m.DATA BETWEEN @dtInicio AND @dtFim";
      if (input.tipo) where += ` AND m.TIPO='${input.tipo}'`;
      const [dataR, countR] = await Promise.all([
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
          .input("dtFim",        sql.NVarChar(10),             input.dtFim)
          .input("offset",       sql.Int,              offset)
          .input("pageSize",     sql.Int,              input.pageSize)
          .query(`
            SELECT
              CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
              CONVERT(NVARCHAR(10), m.DATA, 23) AS DATA,
              m.TIPO, m.DESCRICAO, m.VALOR,
              CAST(m.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
              n.NATUREZA AS nomeNatureza,
              CAST(m.GUIDCENTRO AS NVARCHAR(36)) AS guidCentro,
              cc.CENTRO AS nomeCentro,
              CAST(m.GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
              fp.PAGAMENTO AS nomePagamento,
              m.ORIGEM, m.DATACADASTRO
            FROM KS0003.KS00007 m
            LEFT JOIN KS0003.KS00003 n  ON n.GUIDNATUREZA   = m.GUIDNATUREZA
            LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO    = m.GUIDCENTRO
            LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = m.GUIDPAGAMENTO
            WHERE ${where}
            ORDER BY m.DATA DESC, m.DATACADASTRO DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
          `),
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("dtInicio",     sql.NVarChar(10),             input.dtInicio)
          .input("dtFim",        sql.NVarChar(10),             input.dtFim)
          .query(`SELECT COUNT(*) AS TOTAL FROM KS0003.KS00007 m WHERE ${where}`),
      ]);
      return { items: dataR.recordset, total: (countR.recordset[0] as { TOTAL: number }).TOTAL };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

export const vendasDashboardRouter = router({

  /** KPIs principais: faturamento, ticket médio, qtd pedidos, clientes ativos */
  kpis: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(), // YYYY-MM-DD, default: início do mês atual
      dtFim:    z.string().optional(), // YYYY-MM-DD, default: hoje
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const dtInicio = input?.dtInicio ?? inicioMes;
      const dtFim    = input?.dtFim    ?? hoje;

      // Período anterior para comparação (mesmo número de dias)
      const dias = Math.ceil((new Date(dtFim).getTime() - new Date(dtInicio).getTime()) / 86400000) + 1;
      const dtInicioAnt = new Date(new Date(dtInicio).getTime() - dias * 86400000).toISOString().slice(0, 10);
      const dtFimAnt    = new Date(new Date(dtInicio).getTime() - 86400000).toISOString().slice(0, 10);

      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),     dtInicio)
        .input("dtFim",        sql.NVarChar(10),     dtFim)
        .input("dtInicioAnt",  sql.NVarChar(10),     dtInicioAnt)
        .input("dtFimAnt",     sql.NVarChar(10),     dtFimAnt);

      // Faturamento do período atual e anterior via Contas a Receber (KS0003.KS00005)
      const r = await req2.query(`
        SELECT
          -- Período atual
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicio) AND CONVERT(DATE,@dtFim) THEN VALOR ELSE 0 END), 0) AS faturamentoAtual,
          COUNT(CASE WHEN CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicio) AND CONVERT(DATE,@dtFim) THEN 1 END) AS qtdPedidosAtual,
          -- Período anterior
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicioAnt) AND CONVERT(DATE,@dtFimAnt) THEN VALOR ELSE 0 END), 0) AS faturamentoAnt,
          COUNT(CASE WHEN CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicioAnt) AND CONVERT(DATE,@dtFimAnt) THEN 1 END) AS qtdPedidosAnt
        FROM KS0003.KS00005
        WHERE GUIDENTIDADE = @guidentidade
          AND STATUS NOT IN ('CANCELADO')
      `);

      // Clientes únicos no período atual
      const rClientes = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),     dtInicio)
        .input("dtFim",        sql.NVarChar(10),     dtFim)
        .query(`
          SELECT COUNT(DISTINCT GUIDDEVEDOR) AS clientesAtivos
          FROM KS0003.KS00005
          WHERE GUIDENTIDADE = @guidentidade
            AND STATUS NOT IN ('CANCELADO')
            AND CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicio) AND CONVERT(DATE,@dtFim)
        `);

      // Contas a receber em aberto (total geral)
      const rAberto = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            ISNULL(SUM(VALOR - ISNULL(VALORRECEBIDO,0)),0) AS totalAberto,
            COUNT(*) AS qtdAberto
          FROM KS0003.KS00005
          WHERE GUIDENTIDADE = @guidentidade AND STATUS IN ('ABERTO','PARCIAL')
        `);

      const row = r.recordset[0];
      const fat  = Number(row?.faturamentoAtual ?? 0);
      const fatA = Number(row?.faturamentoAnt ?? 0);
      const qtd  = Number(row?.qtdPedidosAtual ?? 0);
      const qtdA = Number(row?.qtdPedidosAnt ?? 0);

      return {
        faturamento:    fat,
        faturamentoAnt: fatA,
        varFaturamento: fatA > 0 ? ((fat - fatA) / fatA) * 100 : 0,
        ticketMedio:    qtd > 0 ? fat / qtd : 0,
        ticketMedioAnt: qtdA > 0 ? fatA / qtdA : 0,
        qtdPedidos:     qtd,
        qtdPedidosAnt:  qtdA,
        clientesAtivos: Number(rClientes.recordset[0]?.clientesAtivos ?? 0),
        totalAberto:    Number(rAberto.recordset[0]?.totalAberto ?? 0),
        qtdAberto:      Number(rAberto.recordset[0]?.qtdAberto ?? 0),
        periodo: { dtInicio, dtFim },
      };
    }),

  /** Faturamento mensal dos últimos 12 meses */
  faturamentoMensal: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT TOP 12
          FORMAT(DTLANCAMENTO, 'yyyy-MM') AS mes,
          FORMAT(DTLANCAMENTO, 'MMM/yy', 'pt-BR') AS mesLabel,
          ISNULL(SUM(VALOR),0) AS total,
          COUNT(*) AS qtd
        FROM KS0003.KS00005
        WHERE GUIDENTIDADE = @guidentidade
          AND STATUS NOT IN ('CANCELADO')
          AND DTLANCAMENTO >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
        GROUP BY FORMAT(DTLANCAMENTO, 'yyyy-MM'), FORMAT(DTLANCAMENTO, 'MMM/yy', 'pt-BR')
        ORDER BY mes ASC
      `);

    return r.recordset.map(row => ({
      mes:      String(row.mes),
      mesLabel: String(row.mesLabel),
      total:    Number(row.total),
      qtd:      Number(row.qtd),
    }));
  }),

  /** Top 10 clientes por faturamento no período */
  topClientes: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim:    z.string().optional(),
      limite:   z.number().min(5).max(20).default(10),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const dtInicio = input?.dtInicio ?? inicioMes;
      const dtFim    = input?.dtFim    ?? hoje;
      const limite   = input?.limite   ?? 10;

      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),     dtInicio)
        .input("dtFim",        sql.NVarChar(10),     dtFim)
        .input("limite",       sql.Int,              limite)
        .query(`
          SELECT TOP (@limite)
            NOMEDEVEDOR AS nome,
            ISNULL(SUM(VALOR),0) AS total,
            COUNT(*) AS qtdPedidos,
            ISNULL(SUM(VALOR - ISNULL(VALORRECEBIDO,0)),0) AS saldoAberto
          FROM KS0003.KS00005
          WHERE GUIDENTIDADE = @guidentidade
            AND STATUS NOT IN ('CANCELADO')
            AND CONVERT(DATE,DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicio) AND CONVERT(DATE,@dtFim)
          GROUP BY NOMEDEVEDOR
          ORDER BY total DESC
        `);

      return r.recordset.map(row => ({
        nome:       String(row.nome ?? "—"),
        total:      Number(row.total),
        qtdPedidos: Number(row.qtdPedidos),
        saldoAberto: Number(row.saldoAberto),
      }));
    }),

  /** Receitas por natureza de caixa no período */
  receitasPorNatureza: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim:    z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const dtInicio = input?.dtInicio ?? inicioMes;
      const dtFim    = input?.dtFim    ?? hoje;

      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),     dtInicio)
        .input("dtFim",        sql.NVarChar(10),     dtFim)
        .query(`
          SELECT
            ISNULL(n.NATUREZA, 'Sem natureza') AS natureza,
            ISNULL(SUM(cr.VALOR),0) AS total,
            COUNT(*) AS qtd
          FROM KS0003.KS00005 cr
          LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = cr.GUIDNATUREZA AND n.GUIDENTIDADE = cr.GUIDENTIDADE
          WHERE cr.GUIDENTIDADE = @guidentidade
            AND cr.STATUS NOT IN ('CANCELADO')
            AND CONVERT(DATE,cr.DTLANCAMENTO) BETWEEN CONVERT(DATE,@dtInicio) AND CONVERT(DATE,@dtFim)
          GROUP BY ISNULL(n.NATUREZA,'Sem natureza')
          ORDER BY total DESC
        `);

      return r.recordset.map(row => ({
        natureza: String(row.natureza),
        total:    Number(row.total),
        qtd:      Number(row.qtd),
      }));
    }),

  /** Status das contas a receber: vencidas, a vencer hoje, a vencer em 7d, a vencer em 30d */
  statusReceber: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTVENCIMENTO) < CONVERT(DATE,GETDATE()) THEN VALOR - ISNULL(VALORRECEBIDO,0) ELSE 0 END),0) AS vencido,
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTVENCIMENTO) = CONVERT(DATE,GETDATE()) THEN VALOR - ISNULL(VALORRECEBIDO,0) ELSE 0 END),0) AS venceHoje,
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTVENCIMENTO) BETWEEN CONVERT(DATE,GETDATE()) AND CONVERT(DATE,DATEADD(DAY,7,GETDATE())) THEN VALOR - ISNULL(VALORRECEBIDO,0) ELSE 0 END),0) AS vence7d,
          ISNULL(SUM(CASE WHEN CONVERT(DATE,DTVENCIMENTO) BETWEEN CONVERT(DATE,GETDATE()) AND CONVERT(DATE,DATEADD(DAY,30,GETDATE())) THEN VALOR - ISNULL(VALORRECEBIDO,0) ELSE 0 END),0) AS vence30d
        FROM KS0003.KS00005
        WHERE GUIDENTIDADE = @guidentidade AND STATUS IN ('ABERTO','PARCIAL')
      `);

    const row = r.recordset[0];
    return {
      vencido:   Number(row?.vencido ?? 0),
      venceHoje: Number(row?.venceHoje ?? 0),
      vence7d:   Number(row?.vence7d ?? 0),
      vence30d:  Number(row?.vence30d ?? 0),
    };
  }),
});

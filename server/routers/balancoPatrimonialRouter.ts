import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

export const balancoPatrimonialRouter = router({

  /**
   * Retorna o Balanço Patrimonial consolidado até a data de referência.
   *
   * ATIVO:
   *   Ativo Circulante:
   *     - Disponível: saldo atual das contas bancárias ativas
   *     - Contas a Receber: valor em aberto das contas a receber (status ABERTO/PARCIAL)
   *   Ativo Não Circulante: (placeholder — expandir com imobilizado quando disponível)
   *
   * PASSIVO:
   *   Passivo Circulante:
   *     - Contas a Pagar: valor em aberto das contas a pagar (status ABERTO/PARCIAL)
   *   Passivo Não Circulante: (placeholder)
   *
   * PATRIMÔNIO LÍQUIDO:
   *   PL = Total Ativo - Total Passivo
   */
  obter: publicProcedure
    .input(z.object({
      dtReferencia: z.string().optional(), // ISO date — default: hoje
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const dtRef = input?.dtReferencia ?? new Date().toISOString().slice(0, 10);

      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtRef",        sql.Date,             dtRef);

      // 1. Disponível: saldo das contas bancárias ativas
      const disponR = await req2.query(`
        SELECT
          CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta,
          CONTA, TIPOCONTA, SALDOATUAL
        FROM KS0003.KS00008
        WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
        ORDER BY CODCONTA
      `);

      // 2. Contas a Receber em aberto (vencidas ou a vencer até dtRef)
      const receberR = await req2.query(`
        SELECT
          ISNULL(SUM(VALOR - ISNULL(VALORRECEBIDO,0)), 0) AS totalAberto,
          ISNULL(SUM(CASE WHEN DTVENCIMENTO < @dtRef THEN VALOR - ISNULL(VALORRECEBIDO,0) ELSE 0 END), 0) AS totalVencido
        FROM KS0003.KS00005
        WHERE GUIDENTIDADE = @guidentidade
          AND STATUS IN ('ABERTO','PARCIAL')
          AND DTLANCAMENTO <= @dtRef
      `);

      // 3. Contas a Pagar em aberto
      const pagarR = await req2.query(`
        SELECT
          ISNULL(SUM(VALOR - ISNULL(VALORPAGO,0)), 0) AS totalAberto,
          ISNULL(SUM(CASE WHEN DTVENCIMENTO < @dtRef THEN VALOR - ISNULL(VALORPAGO,0) ELSE 0 END), 0) AS totalVencido
        FROM KS0003.KS00004
        WHERE GUIDENTIDADE = @guidentidade
          AND STATUS IN ('ABERTO','PARCIAL')
          AND DTLANCAMENTO <= @dtRef
      `);

      // 4. Receitas e Despesas acumuladas (DRE simplificado para PL)
      const dreR = await req2.query(`
        SELECT
          ISNULL(SUM(CASE WHEN TIPO='E' THEN VALOR ELSE 0 END),0) AS totalReceitas,
          ISNULL(SUM(CASE WHEN TIPO='S' THEN VALOR ELSE 0 END),0) AS totalDespesas
        FROM KS0003.KS00010
        WHERE GUIDENTIDADE = @guidentidade
          AND DTLANCAMENTO <= @dtRef
      `);

      const contas = disponR.recordset as Array<{
        guidConta: string; CONTA: string; TIPOCONTA: string; SALDOATUAL: number;
      }>;
      const totalDisponivel = contas.reduce((s, c) => s + (Number(c.SALDOATUAL) || 0), 0);
      const totalReceberAberto = Number(receberR.recordset[0]?.totalAberto ?? 0);
      const totalReceberVencido = Number(receberR.recordset[0]?.totalVencido ?? 0);
      const totalPagarAberto = Number(pagarR.recordset[0]?.totalAberto ?? 0);
      const totalPagarVencido = Number(pagarR.recordset[0]?.totalVencido ?? 0);
      const totalReceitas = Number(dreR.recordset[0]?.totalReceitas ?? 0);
      const totalDespesas = Number(dreR.recordset[0]?.totalDespesas ?? 0);

      // Estrutura do Balanço
      const ativoCirculante = totalDisponivel + totalReceberAberto;
      const ativoNaoCirculante = 0; // expandir com imobilizado
      const totalAtivo = ativoCirculante + ativoNaoCirculante;

      const passivoCirculante = totalPagarAberto;
      const passivoNaoCirculante = 0;
      const totalPassivo = passivoCirculante + passivoNaoCirculante;

      const resultadoExercicio = totalReceitas - totalDespesas;
      const patrimonioLiquido = totalAtivo - totalPassivo;

      return {
        dtReferencia: dtRef,
        ativo: {
          circulante: {
            disponivel: {
              total: totalDisponivel,
              contas: contas.map(c => ({
                guidConta: c.guidConta,
                nome: c.CONTA,
                tipo: c.TIPOCONTA,
                saldo: Number(c.SALDOATUAL) || 0,
              })),
            },
            contasAReceber: {
              total: totalReceberAberto,
              vencido: totalReceberVencido,
              aVencer: totalReceberAberto - totalReceberVencido,
            },
            total: ativoCirculante,
          },
          naoCirculante: {
            total: ativoNaoCirculante,
            itens: [],
          },
          total: totalAtivo,
        },
        passivo: {
          circulante: {
            contasAPagar: {
              total: totalPagarAberto,
              vencido: totalPagarVencido,
              aVencer: totalPagarAberto - totalPagarVencido,
            },
            total: passivoCirculante,
          },
          naoCirculante: {
            total: passivoNaoCirculante,
            itens: [],
          },
          total: totalPassivo,
        },
        patrimonioLiquido: {
          resultadoExercicio,
          totalReceitas,
          totalDespesas,
          total: patrimonioLiquido,
        },
        totalPassivoMaisPL: totalPassivo + patrimonioLiquido,
        equilibrado: Math.abs(totalAtivo - (totalPassivo + patrimonioLiquido)) < 0.01,
      };
    }),

  /** Evolução mensal do PL — para gráfico de tendência */
  evolucaoMensal: publicProcedure
    .input(z.object({
      meses: z.number().min(1).max(24).default(12),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const meses = input?.meses ?? 12;

      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("meses",        sql.Int,              meses)
        .query(`
          WITH meses AS (
            SELECT TOP (@meses)
              CONVERT(NVARCHAR(7), DATEADD(MONTH, -ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + 1, GETDATE()), 126) AS mes,
              EOMONTH(DATEADD(MONTH, -ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) + 1, GETDATE())) AS dtFim
            FROM sys.objects
          )
          SELECT
            m.mes,
            ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00010 WHERE GUIDENTIDADE=@guidentidade AND TIPO='E' AND DTLANCAMENTO<=m.dtFim),0)
            - ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00010 WHERE GUIDENTIDADE=@guidentidade AND TIPO='S' AND DTLANCAMENTO<=m.dtFim),0)
            AS resultadoAcumulado
          FROM meses m
          ORDER BY m.mes
        `);
      return r.recordset;
    }),
});

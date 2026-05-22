import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import { parse as parseCookieHeader } from "cookie";

const KS_SESSION_COOKIE = "ks_session";

async function getKsSession(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  return verifyKsSession(cookies[KS_SESSION_COOKIE]);
}

/**
 * Router de sincronização entre o sistema Delphi legado e o novo React.
 * Todas as operações respeitam o isolamento por GUIDENTIDADE.
 */
export const syncRouter = router({
  /**
   * Status da sincronização — usado pelo Delphi para verificar conectividade.
   */
  status: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req.headers.cookie);
    if (!session) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
    }
    return {
      online: true,
      timestamp: new Date().toISOString(),
      guidEntidade: session.guidEntidade,
      empresa: session.nomeEmpresa,
    };
  }),

  /**
   * Lista entidades modificadas após uma data — para sincronização incremental.
   */
  entidadesModificadas: publicProcedure
    .input(
      z.object({
        desde: z.string().datetime().optional(),
        limite: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req.headers.cookie);
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
      }

      const desdeFilter = input.desde
        ? `AND ULTIMAALTERACAO >= @DESDE`
        : "";

      const params: Record<string, { type: unknown; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        LIMITE: { type: sql.Int, value: input.limite },
      };

      if (input.desde) {
        params.DESDE = { type: sql.DateTime, value: new Date(input.desde) };
      }

      const rows = await querySql(
        `SELECT TOP (@LIMITE)
           GUIDPESSOA, NOME, FANTASIA, DOCUMENTO, SITUACAO,
           CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA,
           ULTIMAALTERACAO
         FROM KS0002.KS00001
         WHERE GUIDENTIDADE = @GUIDENTIDADE
           ${desdeFilter}
         ORDER BY ULTIMAALTERACAO DESC`,
        params as Parameters<typeof querySql>[1]
      );

      return {
        total: rows.length,
        ultimaConsulta: new Date().toISOString(),
        dados: rows,
      };
    }),
});

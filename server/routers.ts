import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { ksAuthRouter } from "./routers/ksAuthRouter";
import { entidadesRouter } from "./routers/entidadesRouter";
import { syncRouter } from "./routers/syncRouter";
import { clientesRouter } from "./routers/clientesRouter";
import { fornecedoresRouter } from "./routers/fornecedoresRouter";
import { empresasRouter } from "./routers/empresasRouter";

export const appRouter = router({
  system: systemRouter,

  // Autenticação Manus OAuth (mantida para compatibilidade interna)
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Autenticação KS ERP — login contra SQL Server KS0002.KS00001
  ksAuth: ksAuthRouter,

  // Cadastro unificado de entidades (clientes, fornecedores, funcionários, etc.)
  entidades: entidadesRouter,

  // Módulo de Clientes
  clientes: clientesRouter,

  // Módulo de Fornecedores
  fornecedores: fornecedoresRouter,

  // Módulo de Empresas
  empresas: empresasRouter,

  // Sincronização com sistema legado Delphi
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;

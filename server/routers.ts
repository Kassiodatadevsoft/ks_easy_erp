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
import { cargosRouter } from "./routers/cargosRouter";
import { funcionariosRouter } from "./routers/funcionariosRouter";
import { transportadorasRouter } from "./routers/transportadorasRouter";
import { categoriasRouter } from "./routers/categoriasRouter";
import { produtosRouter } from "./routers/produtosRouter";
import { deliveryRouter } from "./routers/deliveryRouter";

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

  // Módulo de Cargos
  cargos: cargosRouter,

  // Módulo de Funcionários
  funcionarios: funcionariosRouter,

  // Módulo de Transportadoras
  transportadoras: transportadorasRouter,

  // Módulo de Categorias de Produtos
  categorias: categoriasRouter,

  // Módulo de Produtos
  produtos: produtosRouter,

  // Módulo de Delivery
  delivery: deliveryRouter,

  // Sincronização com sistema legado Delphi
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { ksAuthRouter } from "./routers/ksAuthRouter";
import { entidadesRouter } from "./routers/entidadesRouter";
import { syncRouter } from "./routers/syncRouter";
import { syncDelphiRouter } from "./routers/syncDelphiRouter";
import { clientesRouter } from "./routers/clientesRouter";
import { fornecedoresRouter } from "./routers/fornecedoresRouter";
import { empresasRouter } from "./routers/empresasRouter";
import { cargosRouter } from "./routers/cargosRouter";
import { funcionariosRouter } from "./routers/funcionariosRouter";
import { transportadorasRouter } from "./routers/transportadorasRouter";
import { categoriasRouter } from "./routers/categoriasRouter";
import { produtosRouter } from "./routers/produtosRouter";
import { deliveryRouter } from "./routers/deliveryRouter";
import { planoContasRouter } from "./routers/planoContasRouter";
import { centroCustoRouter } from "./routers/centroCustoRouter";
import { naturezaCaixaRouter } from "./routers/naturezaCaixaRouter";
import { contasPagarRouter } from "./routers/contasPagarRouter";
import { contasReceberRouter } from "./routers/contasReceberRouter";
import { fluxoCaixaRouter } from "./routers/fluxoCaixaRouter";
import { formasPagamentoRouter } from "./routers/formasPagamentoRouter";
import { contasBancariasRouter } from "./routers/contasBancariasRouter";
import { transferenciasRouter } from "./routers/transferenciasRouter";
import { lancamentosCaixaRouter } from "./routers/lancamentosCaixaRouter";
import { balancoPatrimonialRouter } from "./routers/balancoPatrimonialRouter";
import { seedRouter } from "./routers/seedRouter";
import { vendasDashboardRouter } from "./routers/vendasDashboardRouter";

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

  // Módulo Financeiro
  planoContas: planoContasRouter,
  centroCusto: centroCustoRouter,
  naturezaCaixa: naturezaCaixaRouter,
  contasPagar: contasPagarRouter,
  contasReceber: contasReceberRouter,
  fluxoCaixa: fluxoCaixaRouter,
  formasPagamento: formasPagamentoRouter,
  contasBancarias: contasBancariasRouter,
  transferencias: transferenciasRouter,
  lancamentosCaixa: lancamentosCaixaRouter,
  balancoPatrimonial: balancoPatrimonialRouter,

  // Dashboard de Vendas
  vendasDashboard: vendasDashboardRouter,

  // Seed de dados padrão
  seed: seedRouter,

  // Sincronização com sistema legado Delphi
  sync: syncRouter,
  syncDelphi: syncDelphiRouter,
});

export type AppRouter = typeof appRouter;

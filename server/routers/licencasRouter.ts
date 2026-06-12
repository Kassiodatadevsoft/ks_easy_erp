import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { publicProcedure, router } from "../_core/trpc";
import { verifyKsSession } from "./ksAuthRouter";
import {
  alterarBloqueioLicenca,
  alterarBloqueioTerminal,
  alterarStatusTerminal,
  assertLicencasAdmin,
  listarLicencas,
  listarTerminais,
  removerTerminal,
  renovarTodasLicencasPorBoletoPago,
  renovarLicencaPorBoletoPago,
  salvarLicenca,
} from "../services/licencasService";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  return session;
}

const licencaSchema = z.object({
  idLicenca: z.number().int().positive().optional(),
  cnpj: z.string().min(1).max(20),
  codEntidade: z.number().int().nonnegative(),
  guidPessoa: z.string().uuid(),
  status: z.enum(["A", "I"]).default("A"),
  dataInicio: z.string().min(8),
  dataValidade: z.string().min(8),
  diasTolerancia: z.number().int().min(0).max(365).default(0),
  modulos: z.array(z.string().min(1).max(80)).optional().nullable(),
  qtdeTerminaisMax: z.number().int().min(1).max(999).default(1),
  bloqueado: z.boolean().default(false),
  motivoBloqueio: z.string().max(500).optional().nullable(),
});

export const licencasRouter = router({
  listar: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    assertLicencasAdmin(session);
    return listarLicencas();
  }),

  salvar: publicProcedure.input(licencaSchema).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    assertLicencasAdmin(session);
    return salvarLicenca(input);
  }),

  bloquear: publicProcedure
    .input(z.object({ idLicenca: z.number().int().positive(), motivo: z.string().max(500).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarBloqueioLicenca(input.idLicenca, true, input.motivo);
    }),

  desbloquear: publicProcedure
    .input(z.object({ idLicenca: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarBloqueioLicenca(input.idLicenca, false);
    }),

  renovarPorBoletoPago: publicProcedure
    .input(z.object({ idLicenca: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return renovarLicencaPorBoletoPago(input.idLicenca);
    }),

  renovarTodasPorBoletoPago: publicProcedure
    .mutation(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return renovarTodasLicencasPorBoletoPago();
    }),

  terminais: publicProcedure
    .input(z.object({ idLicenca: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return listarTerminais(input.idLicenca);
    }),

  bloquearTerminal: publicProcedure
    .input(z.object({ idTerminal: z.number().int().positive(), motivo: z.string().max(500).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarBloqueioTerminal(input.idTerminal, true, input.motivo);
    }),

  desbloquearTerminal: publicProcedure
    .input(z.object({ idTerminal: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarBloqueioTerminal(input.idTerminal, false);
    }),

  desabilitarTerminal: publicProcedure
    .input(z.object({ idTerminal: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarStatusTerminal(input.idTerminal, "DESABILITADO");
    }),

  reativarTerminal: publicProcedure
    .input(z.object({ idTerminal: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return alterarStatusTerminal(input.idTerminal, "ATIVO");
    }),

  removerTerminal: publicProcedure
    .input(z.object({ idTerminal: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      assertLicencasAdmin(session);
      return removerTerminal(input.idTerminal);
    }),
});

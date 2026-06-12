import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authenticateKsUser, updateLastAccess } from "../ksAuth";
import { publicProcedure, router } from "../_core/trpc";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "../_core/env";
import type { KsSessionUser } from "../../shared/ksTypes";

const KS_SESSION_COOKIE = COOKIE_NAME;
function getJwtSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

async function signKsSession(user: KsSessionUser): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({ ks: user })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(secret);
}

export async function verifyKsSession(
  token: string | undefined | null
): Promise<KsSessionUser | null> {
  if (!token) return null;
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    const ks = (payload as Record<string, unknown>).ks as KsSessionUser;
    if (!ks?.guidPessoa || !ks?.guidEntidade) return null;
    return ks;
  } catch {
    return null;
  }
}

export const ksAuthRouter = router({
  /**
   * Login com usuário e senha contra KS0002.KS00001.
   * Retorna dados do usuário + GUIDENTIDADE da empresa.
   */
  login: publicProcedure
    .input(
      z.object({
        usuario: z.string().min(1),
        senha: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ksUser = await authenticateKsUser(input.usuario, input.senha);

      if (!ksUser) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Usuário ou senha incorretos. Verifique suas credenciais.",
        });
      }

      const sessionUser: KsSessionUser = {
        guidPessoa: ksUser.GUIDPESSOA,
        guidEntidade: ksUser.GUIDENTIDADE,
        nome: ksUser.NOME,
        fantasia: ksUser.FANTASIA ?? null,
        documento: ksUser.DOCUMENTO,
        entDocumento: ksUser.ENTDOCUMENTO,
        nomeEmpresa: ksUser.NOMEFANTASIA ?? null,
        usuario: ksUser.USUARIO,
        email: ksUser.EMAIL ?? null,
        codTipoEntidade: ksUser.CODTIPOENTIDADE ?? null,
        isGerente: Boolean(ksUser.CADGERENTE),
        codFilial: ksUser.CODFILIAL ?? null,
      };

      const token = await signKsSession(sessionUser);
      const cookieOptions = getSessionCookieOptions(ctx.req);

      ctx.res.cookie(KS_SESSION_COOKIE, token, {
        ...cookieOptions,
        maxAge: 8 * 60 * 60 * 1000, // 8 horas
      });

      // Atualiza último acesso em background (fire-and-forget)
      void Promise.resolve(updateLastAccess(ksUser.GUIDPESSOA)).catch(console.error);

      return {
  success: true,
  guidPessoa: sessionUser.guidPessoa,
  nome: sessionUser.nome,
};
    }),

  /**
   * Retorna o usuário KS da sessão atual (ou null se não autenticado).
   */
  me: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie ?? "";
    const match = cookies.match(new RegExp(`${KS_SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    return verifyKsSession(token);
  }),

  /**
   * Encerra a sessão KS.
   */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(KS_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});

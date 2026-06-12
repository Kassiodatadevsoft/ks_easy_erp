import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";
import {
  alterarBloqueioTerminal,
  alterarStatusTerminal,
  assertLicencasAdmin,
  liberarTerminal,
  listarLicencas,
  listarTerminais,
  removerTerminal,
  validarTerminal,
} from "../services/licencasService";

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function requireLicencasAdmin(req: Request) {
  const token = getCookieValue(req.headers.cookie, COOKIE_NAME);
  const session = await verifyKsSession(token);
  assertLicencasAdmin(session);
  return session;
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";
  const status = message.includes("Acesso restrito") ? 403 : message.includes("Sessao") ? 401 : 400;
  res.status(status).json({ success: false, message });
}

const liberarSchema = z.object({
  cnpj: z.string().min(1),
  hardwareId: z.string().min(1).max(200),
  nomeComputador: z.string().max(150).optional().nullable(),
  usuarioWindows: z.string().max(150).optional().nullable(),
  ip: z.string().max(45).optional().nullable(),
});

const validarSchema = z.object({
  cnpj: z.string().min(1),
  hardwareId: z.string().min(1).max(200),
  token: z.string().min(1).max(200),
});

export function registerLicencasApiRoutes(app: Express) {
  app.post("/api/licencas/liberar-terminal", async (req, res) => {
    try {
      const input = liberarSchema.parse(req.body);
      res.json(await liberarTerminal(input));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/licencas/validar-terminal", async (req, res) => {
    try {
      const input = validarSchema.parse(req.body);
      res.json(await validarTerminal(input));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/licencas", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await listarLicencas());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/licencas/:id/terminais", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await listarTerminais(Number(req.params.id)));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/licencas/terminais/:id/bloquear", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await alterarBloqueioTerminal(Number(req.params.id), true, req.body?.motivo ?? null));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/licencas/terminais/:id/desbloquear", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await alterarBloqueioTerminal(Number(req.params.id), false));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/licencas/terminais/:id/desabilitar", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await alterarStatusTerminal(Number(req.params.id), "DESABILITADO"));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/licencas/terminais/:id/reativar", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await alterarStatusTerminal(Number(req.params.id), "ATIVO"));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/licencas/terminais/:id", async (req, res) => {
    try {
      await requireLicencasAdmin(req);
      res.json(await removerTerminal(Number(req.params.id)));
    } catch (error) {
      sendError(res, error);
    }
  });
}

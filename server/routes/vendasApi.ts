import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";

function sendError(res: Response, error: unknown) {
  if (error instanceof TRPCError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 400;
    res.status(status).json({ sucesso: false, success: false, mensagem: error.message, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.";
  res.status(400).json({ sucesso: false, success: false, mensagem: message, message });
}

export function registerVendasApiRoutes(app: Express) {
  app.post("/api/vendas/finalizar", async (req: Request, res: Response) => {
    try {
      const caller = appRouter.createCaller({ req, res, user: null });
      const result = await caller.vendasOperacao.finalizar(req.body);
      res.json({
        sucesso: true,
        success: true,
        mensagem: result.mensagem ?? "Venda finalizada com sucesso.",
        message: result.mensagem ?? "Venda finalizada com sucesso.",
        GUIDVENDA: result.guidVenda,
        guidVenda: result.guidVenda,
        CODPREVENDA: result.CODPREVENDA ?? result.numeroVenda,
        codPreVenda: result.CODPREVENDA ?? result.numeroVenda,
        numeroVenda: result.numeroVenda,
        total: result.total,
        comprovante: result.comprovante,
        impressao: result.impressao,
        dataHora: result.dataHora,
        empresa: result.empresa,
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}

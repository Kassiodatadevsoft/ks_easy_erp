import type { Express, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { exportarEmpresaOfflinePorGuid } from "../services/offlineExportService";

const guidSchema = z.string().uuid();

function sendOfflineError(res: Response, error: unknown) {
  if (error instanceof TRPCError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : 400;
    res.status(status).json({ success: false, message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "GUID da empresa invalido." });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno ao exportar empresa offline.";
  res.status(500).json({ success: false, message });
}

export function registerOfflineApiRoutes(app: Express) {
  app.get("/api/offline/empresa/:guid", async (req, res) => {
    try {
      const guid = guidSchema.parse(req.params.guid);
      res.json(await exportarEmpresaOfflinePorGuid(guid));
    } catch (error) {
      sendOfflineError(res, error);
    }
  });
}

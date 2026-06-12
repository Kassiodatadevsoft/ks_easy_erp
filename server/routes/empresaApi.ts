import type { Express, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { listarDadosEmpresaNf } from "../services/empresaDadosService";

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function sendEmpresaDadosError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Parametros invalidos." });
    return;
  }

  if (error instanceof TRPCError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno ao consultar dados da empresa.";
  res.status(500).json({ success: false, message });
}

export function registerEmpresaApiRoutes(app: Express) {
  app.get("/api/empresa/dados", async (req, res) => {
    try {
      const guidEntidade = firstQueryValue(req.query.guidEntidade);
      const ultimaAlteracao = firstQueryValue(req.query.ultimaAlteracao);

      const dados = await listarDadosEmpresaNf({
        guidEntidade: String(guidEntidade ?? ""),
        ultimaAlteracao: ultimaAlteracao == null ? undefined : String(ultimaAlteracao),
      });

      res.json(dados);
    } catch (error) {
      sendEmpresaDadosError(res, error);
    }
  });
}

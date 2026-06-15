import type { Express, Request, Response } from "express";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { dreGerencialInputSchema, obterDreGerencial } from "../routers/financeiroRelatoriosRouter";
import { verifyKsSession } from "../routers/ksAuthRouter";

function first(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function getSession(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return verifyKsSession(match?.[1]);
}

function sendError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, message: "Parametros invalidos.", issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "Erro interno";
  res.status(500).json({ success: false, message });
}

export function registerFinanceiroRelatoriosApiRoutes(app: Express) {
  app.get("/api/relatorios/financeiro/dre-gerencial", async (req, res) => {
    try {
      const session = await getSession(req);
      if (!session) {
        res.status(401).json({ success: false, message: "Sessao invalida. Faca login novamente." });
        return;
      }

      const input = dreGerencialInputSchema.parse({
        dtInicio: first(req.query.dataInicial) ?? first(req.query.dtInicio),
        dtFim: first(req.query.dataFinal) ?? first(req.query.dtFim),
        regime: first(req.query.regime) ?? "competencia",
        guidCentro: first(req.query.centroCusto) ?? first(req.query.guidCentro),
        guidContaFinanceira: first(req.query.contaFinanceira) ?? first(req.query.guidContaFinanceira),
        guidPlanoConta: first(req.query.planoConta) ?? first(req.query.guidPlanoConta),
        guidNatureza: first(req.query.natureza) ?? first(req.query.guidNatureza),
        guidFormaPagamento: first(req.query.formaPagamento) ?? first(req.query.guidFormaPagamento),
      });

      res.json(await obterDreGerencial(session.guidEntidade, input));
    } catch (error) {
      sendError(res, error);
    }
  });
}

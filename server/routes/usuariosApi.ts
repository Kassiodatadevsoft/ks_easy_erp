import type { Express } from "express";

function getServerHorario() {
  const now = new Date();
  const timezone = process.env.TZ || "America/Sao_Paulo";

  return {
    success: true,
    servidor: {
      iso: now.toISOString(),
      timestamp: now.getTime(),
      timezone,
      data: new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now),
      hora: new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
      dataHora: new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now),
    },
  };
}

export function registerUsuariosApiRoutes(app: Express) {
  app.get("/api/usuarios/horario", (_req, res) => {
    res.json(getServerHorario());
  });
}

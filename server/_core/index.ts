import "dotenv/config";

import express from "express";
import { createServer } from "http";
import net from "net";

import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "../routers";

import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { registerLicencasApiRoutes } from "../routes/licencasApi";
import { registerOfflineApiRoutes } from "../routes/offlineApi";
import { registerUsuariosApiRoutes } from "../routes/usuariosApi";
import { registerEmpresaApiRoutes } from "../routes/empresaApi";
import { registerPlanoContasApiRoutes } from "../routes/planoContasApi";
import { registerCentroCustoApiRoutes } from "../routes/centroCustoApi";
import { registerNaturezaFinanceiraApiRoutes } from "../routes/naturezaFinanceiraApi";
import { registerFormasPagamentoApiRoutes } from "../routes/formasPagamentoApi";
import { registerContasBancariasApiRoutes } from "../routes/contasBancariasApi";
import { registerProdutosApiRoutes } from "../routes/produtosApi";
// import { registerStorageProxy } from "./storageProxy";

import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.listen(port, () => {
      server.close(() => resolve(true));
    });

    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(
  startPort: number = 3000
): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available port found starting from ${startPort}`
  );
}

async function startServer() {
  const app = express();

  const server = createServer(app);

  // registerStorageProxy(app);

  registerOAuthRoutes(app);

  // =====================================================
  // tRPC API
  // =====================================================

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error("======== tRPC ERROR ========");
      console.error("PATH:", path);
      console.error("MESSAGE:", error.message);
      console.error("CODE:", error.code);
      console.error("CAUSE:", error.cause);
      console.error("STACK:", error.stack);
      console.error("===========================");
    },
  })
);
  // =====================================================
  // Body Parser
  // =====================================================

  app.use(
    express.json({
      limit: "50mb",
    })
  );

  app.use(
    express.urlencoded({
      limit: "50mb",
      extended: true,
    })
  );

  registerLicencasApiRoutes(app);
  registerEmpresaApiRoutes(app);
  registerOfflineApiRoutes(app);
  registerUsuariosApiRoutes(app);
  registerPlanoContasApiRoutes(app);
  registerCentroCustoApiRoutes(app);
  registerNaturezaFinanceiraApiRoutes(app);
  registerFormasPagamentoApiRoutes(app);
  registerContasBancariasApiRoutes(app);
  registerProdutosApiRoutes(app);

  // =====================================================
  // Frontend
  // =====================================================

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(
    process.env.PORT || "3000"
  );

  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(
      `Port ${preferredPort} is busy, using port ${port} instead`
    );
  }

  server.listen(port, () => {
    console.log(
      `Server running on http://localhost:${port}/`
    );
  });



  
}

startServer().catch(console.error);

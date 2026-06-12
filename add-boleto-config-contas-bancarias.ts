import "dotenv/config";

import { getSqlPool } from "./server/sqlserver.js";
import { garantirCamposBoletoContaBancaria } from "./server/services/boletos/config.js";

async function run() {
  const pool = await getSqlPool();
  await garantirCamposBoletoContaBancaria(pool);
  console.log("Campos de configuração de boletos em Contas Bancárias verificados/criados.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

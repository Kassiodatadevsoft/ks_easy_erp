import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";
import { garantirTabelasSugestaoCompra } from "./server/routers/sugestaoCompraRouter";

async function main() {
  const pool = await getSqlPool();
  await garantirTabelasSugestaoCompra(pool);
  console.log("Tabelas e campos de sugestao de compra verificados/criados.");
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

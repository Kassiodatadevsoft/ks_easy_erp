import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";
import { garantirTabelasConciliacao } from "./server/routers/conciliacaoRouter";

async function main() {
  const pool = await getSqlPool();
  await garantirTabelasConciliacao(pool);
  console.log("Tabelas de conciliacao de cartoes e PIX verificadas/criadas.");
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

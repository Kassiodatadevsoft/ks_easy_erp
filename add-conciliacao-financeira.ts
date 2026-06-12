import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";
import { garantirTabelasConciliacaoFinanceira } from "./server/routers/conciliacaoFinanceiraRouter";

async function main() {
  const pool = await getSqlPool();
  await garantirTabelasConciliacaoFinanceira(pool);
  console.log("Tabelas de conciliacao financeira, OFX, CNAB e auditoria verificadas/criadas.");
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

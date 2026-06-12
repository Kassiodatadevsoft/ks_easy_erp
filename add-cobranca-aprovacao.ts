import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";
import { garantirTabelasCobrancaAprovacao } from "./server/routers/cobrancaAprovacaoRouter";

async function main() {
  const pool = await getSqlPool();
  await garantirTabelasCobrancaAprovacao(pool);
  console.log("Tabelas de cobranca automatica e aprovacao de pagamentos verificadas/criadas.");
  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

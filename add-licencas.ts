import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";
import { garantirTabelasLicencas } from "./server/services/licencasService";

async function main() {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  console.log("Tabelas LICENCAS_EMPRESA e LICENCAS_TERMINAIS verificadas/criadas.");
  await pool.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

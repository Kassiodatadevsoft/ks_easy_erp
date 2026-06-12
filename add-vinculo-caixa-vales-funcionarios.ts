import "dotenv/config";
import { getSqlPool } from "./server/sqlserver.js";

async function run() {
  const pool = await getSqlPool();

  await pool.request().query(`
    IF COL_LENGTH('KS0005.KS00001', 'GUIDLANCCAIXA') IS NULL
      ALTER TABLE KS0005.KS00001 ADD GUIDLANCCAIXA UNIQUEIDENTIFIER NULL
    IF COL_LENGTH('KS0005.KS00001', 'GUIDCONTACAIXA') IS NULL
      ALTER TABLE KS0005.KS00001 ADD GUIDCONTACAIXA UNIQUEIDENTIFIER NULL
    IF COL_LENGTH('KS0005.KS00001', 'GUIDNATUREZA') IS NULL
      ALTER TABLE KS0005.KS00001 ADD GUIDNATUREZA UNIQUEIDENTIFIER NULL
    IF COL_LENGTH('KS0005.KS00001', 'GUIDCENTRO') IS NULL
      ALTER TABLE KS0005.KS00001 ADD GUIDCENTRO UNIQUEIDENTIFIER NULL
  `);

  console.log("Vinculo de vales com lancamentos de caixa criado com sucesso.");
}

run().catch((err) => {
  console.error("Erro ao criar vinculo de vales com lancamentos de caixa:", err);
  process.exit(1);
});

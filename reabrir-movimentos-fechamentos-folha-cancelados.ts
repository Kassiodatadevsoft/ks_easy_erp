import "dotenv/config";
import { getSqlPool } from "./server/sqlserver.js";

async function run() {
  const pool = await getSqlPool();
  await pool.request().query(`
    UPDATE m
    SET STATUS='ABERTO',
        GUIDFECHAMENTO=NULL,
        ULTIMAALTERACAO=GETDATE()
    FROM KS0005.KS00001 m
    INNER JOIN KS0005.KS00002 f ON f.GUIDFECHAMENTO = m.GUIDFECHAMENTO
    WHERE f.STATUS='CANCELADO'
      AND m.STATUS='FECHADO'
  `);

  console.log("Movimentos de fechamentos cancelados foram reabertos.");
}

run().catch((err) => {
  console.error("Erro ao reabrir movimentos de fechamentos cancelados:", err);
  process.exit(1);
});

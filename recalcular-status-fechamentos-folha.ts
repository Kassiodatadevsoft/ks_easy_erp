import "dotenv/config";
import { getSqlPool } from "./server/sqlserver.js";

async function run() {
  const pool = await getSqlPool();
  await pool.request().query(`
    UPDATE f
    SET
      STATUS = CASE
        WHEN s.total > 0 AND s.cancelados = s.total THEN 'CANCELADO'
        WHEN s.total > 0 AND s.pagos = s.total THEN 'PAGO'
        ELSE 'ABERTO'
      END,
      ULTIMAALTERACAO = GETDATE()
    FROM KS0005.KS00002 f
    CROSS APPLY (
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN cp.STATUS = 'CANCELADO' THEN 1 ELSE 0 END) AS cancelados,
        SUM(CASE WHEN cp.STATUS = 'PAGO' THEN 1 ELSE 0 END) AS pagos
      FROM KS0005.KS00003 i
      LEFT JOIN KS0003.KS00004 cp ON cp.GUIDLANCAMENTO = i.GUIDLANCPAGAR
      WHERE i.GUIDFECHAMENTO = f.GUIDFECHAMENTO
    ) s
  `);

  console.log("Status dos fechamentos de folha recalculados.");
}

run().catch((err) => {
  console.error("Erro ao recalcular status dos fechamentos de folha:", err);
  process.exit(1);
});

import "dotenv/config";

import { getSqlPool, sql } from "./server/sqlserver.js";

async function run() {
  const pool = await getSqlPool();
  const columns = [
    ["GUIDCONTA", "UNIQUEIDENTIFIER NULL"],
    ["GUIDNATUREZA", "UNIQUEIDENTIFIER NULL"],
    ["GUIDCENTRO", "UNIQUEIDENTIFIER NULL"],
    ["GUIDCONTABANCARIA", "UNIQUEIDENTIFIER NULL"],
  ] as const;

  for (const [column, definition] of columns) {
    await pool.request()
      .input("columnName", sql.NVarChar(128), column)
      .query(`
        IF COL_LENGTH('KS0003.KS00006', @columnName) IS NULL
          ALTER TABLE KS0003.KS00006 ADD ${column} ${definition}
      `);
  }

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = 'CK_KS00006_GUIDCONTABANCARIA_OBRIGATORIA'
        AND parent_object_id = OBJECT_ID('KS0003.KS00006')
    )
    BEGIN
      ALTER TABLE KS0003.KS00006 WITH NOCHECK
      ADD CONSTRAINT CK_KS00006_GUIDCONTABANCARIA_OBRIGATORIA
      CHECK (GUIDCONTABANCARIA IS NOT NULL)
    END
  `);

  console.log("Campos de vinculo financeiro em Formas de Pagamento verificados/criados.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

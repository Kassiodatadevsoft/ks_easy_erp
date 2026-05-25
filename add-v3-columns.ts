import "dotenv/config";
import { getSqlPool } from "./server/sqlserver";

const cols = [
  "REFERENCIA NVARCHAR(50)",
  "DELIVERY BIT DEFAULT 1",
  "ALIQICMSFORM DECIMAL(10,4)",
  "PERCREDUCAOFORM DECIMAL(10,4)",
  "PERCFRETEFORM DECIMAL(10,4)",
  "PERCJUROSFORM DECIMAL(10,4)",
];

const pool = await getSqlPool();

for (const col of cols) {
  const name = col.split(" ")[0];
  try {
    await pool.request().query(`ALTER TABLE KS0000.KS00009 ADD ${col}`);
    console.log("✓ Adicionada:", name);
  } catch (e: any) {
    const msg: string = e.message ?? "";
    if (msg.includes("already") || msg.includes("Column names in each table must be unique")) {
      console.log("→ Já existe:", name);
    } else {
      console.error("✗ Erro em", name, ":", msg);
    }
  }
}

console.log("\nConcluído!");
process.exit(0);

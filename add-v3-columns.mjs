import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const sql = require('mssql');

// Ler .env manualmente
try {
  const env = readFileSync('/home/ubuntu/ks_easy_erp/.env', 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
} catch {}

const url = process.env.SQLSERVER_URL;
if (!url) { console.error('SQLSERVER_URL não encontrada'); process.exit(1); }

const pool = await sql.connect(url);

const cols = [
  'REFERENCIA NVARCHAR(50)',
  'DELIVERY BIT DEFAULT 1',
  'ALIQICMSFORM DECIMAL(10,4)',
  'PERCREDUCAOFORM DECIMAL(10,4)',
  'PERCFRETEFORM DECIMAL(10,4)',
  'PERCJUROSFORM DECIMAL(10,4)',
];

for (const col of cols) {
  const name = col.split(' ')[0];
  try {
    await pool.request().query(`ALTER TABLE KS0000.KS00009 ADD ${col}`);
    console.log('✓ Adicionada:', name);
  } catch (e) {
    if (e.message.toLowerCase().includes('already') || e.message.includes('Column names in each table must be unique')) {
      console.log('→ Já existe:', name);
    } else {
      console.error('✗ Erro em', name, ':', e.message);
    }
  }
}

await pool.close();
console.log('\nConcluído!');

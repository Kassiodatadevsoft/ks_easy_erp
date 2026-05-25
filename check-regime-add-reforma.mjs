/**
 * 1. Verifica colunas de regime tributário em KS0002.KS00013 (empresas)
 * 2. Adiciona colunas da Reforma Tributária em KS0000.KS00009 (produtos)
 */
import sql from 'mssql';

const connStr = process.env.SQLSERVER_URL;
if (!connStr) { console.error('SQLSERVER_URL not set'); process.exit(1); }

const url = new URL(connStr);
const config = {
  server: url.hostname,
  port: parseInt(url.port) || 1433,
  database: url.pathname.replace(/^\//, '') || 'Data',
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
  connectionTimeout: 15000,
};

const pool = await sql.connect(config);
console.log('Conectado:', config.server, config.database);

// ── 1. Verificar KS0002.KS00013 (empresa) ────────────────────────────────────
console.log('\n=== Colunas de KS0002.KS00013 (Empresa) ===');
const colsEmpresa = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00013'
  ORDER BY ORDINAL_POSITION
`);
colsEmpresa.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH ?? ''}) nullable:${c.IS_NULLABLE}`));

// ── 2. Verificar KS0002.KS00001 (entidade) — campo CRT ───────────────────────
console.log('\n=== Colunas relevantes de KS0002.KS00001 (Entidade) — buscar CRT/regime ===');
const colsEntidade = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00001'
    AND COLUMN_NAME IN ('CRT','REGIME','REGIMETRIBUTARIO','CODREGIME','TIPOPESSOA','CODTIPODOCUMENTO')
  ORDER BY COLUMN_NAME
`);
colsEntidade.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH ?? ''})`));

// ── 3. Verificar KS0000.KS00001 (usuário) — campo CODTIPOENTIDADE ─────────────
console.log('\n=== Colunas de KS0000.KS00001 (Usuário) ===');
const colsUser = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00001'
  ORDER BY ORDINAL_POSITION
`);
colsUser.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));

// ── 4. Adicionar colunas da Reforma Tributária em KS0000.KS00009 ──────────────
console.log('\n=== Adicionando colunas da Reforma Tributária em KS0000.KS00009 ===');
const colsReforma = [
  // Reforma Tributária — IBS (Imposto sobre Bens e Serviços)
  { nome: 'ALIQIBS',        tipo: 'NUMERIC(7,4) NOT NULL DEFAULT 0', desc: 'Alíquota IBS (%)' },
  // Reforma Tributária — CBS (Contribuição sobre Bens e Serviços)
  { nome: 'ALIQCBS',        tipo: 'NUMERIC(7,4) NOT NULL DEFAULT 0', desc: 'Alíquota CBS (%)' },
  // Reforma Tributária — IS (Imposto Seletivo)
  { nome: 'ALIQIS',         tipo: 'NUMERIC(7,4) NOT NULL DEFAULT 0', desc: 'Alíquota IS (%)' },
  // Código de benefício fiscal IBS/CBS
  { nome: 'CODBENEFIBS',    tipo: 'VARCHAR(20) NULL', desc: 'Código de benefício fiscal IBS/CBS' },
  // Regime de tributação do produto (1=Padrão, 2=Reduzido, 3=Isento, 4=Monofásico, 5=Seletivo)
  { nome: 'REGIMETRIB',     tipo: 'TINYINT NOT NULL DEFAULT 1', desc: 'Regime de tributação do produto na RT' },
  // Percentual de redução da base (para regimes reduzidos)
  { nome: 'PERCREDUCAO',    tipo: 'NUMERIC(7,4) NOT NULL DEFAULT 0', desc: 'Percentual de redução da base de cálculo' },
  // Código de regime especial (cashback, etc.)
  { nome: 'CODREGIMEESP',   tipo: 'VARCHAR(10) NULL', desc: 'Código de regime especial (ex: cashback)' },
];

for (const col of colsReforma) {
  const q = `
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00009' AND COLUMN_NAME='${col.nome}'
    )
    BEGIN
      ALTER TABLE KS0000.KS00009 ADD ${col.nome} ${col.tipo}
      PRINT 'Coluna ${col.nome} adicionada'
    END
    ELSE PRINT 'Coluna ${col.nome} já existe'
  `;
  await pool.request().query(q);
  console.log(`  ${col.nome}: OK`);
}

// ── 5. Verificar campo CRT na KS0002.KS00013 ─────────────────────────────────
console.log('\n=== Verificar campo CRT em KS0002.KS00013 ===');
const crtCheck = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00013'
    AND COLUMN_NAME LIKE '%CRT%'
`);
if (crtCheck.recordset.length === 0) {
  console.log('  Campo CRT não encontrado em KS0002.KS00013 — verificar KS0002.KS00001');
} else {
  crtCheck.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE}`));
}

// ── 6. Amostra de dados da empresa para entender o CRT ───────────────────────
console.log('\n=== Amostra de dados KS0002.KS00013 (5 primeiros) ===');
try {
  const sample = await pool.request().query(`SELECT TOP 5 * FROM KS0002.KS00013`);
  if (sample.recordset.length > 0) {
    console.log('Colunas:', Object.keys(sample.recordset[0]).join(', '));
    sample.recordset.forEach((r, i) => console.log(`  [${i}]`, JSON.stringify(r)));
  }
} catch (e) { console.log('  Erro ao amostrar KS0002.KS00013:', e.message); }

await pool.close();
console.log('\nConcluído!');

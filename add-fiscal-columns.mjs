/**
 * Script para adicionar colunas fiscais e de estoque na tabela KS0000.KS00009
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
console.log('Conectado em:', config.server, config.database);

// Adicionar colunas uma a uma (IF NOT EXISTS)
const colunas = [
  // Tributação Simples Nacional
  { nome: 'NCM',         tipo: 'VARCHAR(10)  NULL',          desc: 'Nomenclatura Comum do Mercosul' },
  { nome: 'CEST',        tipo: 'VARCHAR(10)  NULL',          desc: 'Código Especificador da Substituição Tributária' },
  { nome: 'CFOP',        tipo: 'VARCHAR(5)   NULL',          desc: 'Código Fiscal de Operações e Prestações' },
  { nome: 'CSOSN',       tipo: 'VARCHAR(5)   NULL',          desc: 'Código de Situação da Operação - Simples Nacional' },
  { nome: 'ALIQICMS',    tipo: 'NUMERIC(5,2) NOT NULL DEFAULT 0', desc: 'Alíquota ICMS (%)' },
  { nome: 'ALIQPIS',     tipo: 'NUMERIC(5,2) NOT NULL DEFAULT 0', desc: 'Alíquota PIS (%)' },
  { nome: 'ALIQCOFINS',  tipo: 'NUMERIC(5,2) NOT NULL DEFAULT 0', desc: 'Alíquota COFINS (%)' },
  { nome: 'ALIQIPI',     tipo: 'NUMERIC(5,2) NOT NULL DEFAULT 0', desc: 'Alíquota IPI (%)' },
  // Unidade
  { nome: 'UNIDADE',     tipo: 'VARCHAR(6)   NULL',          desc: 'Unidade fiscal (UN, KG, L, CX, etc.)' },
  // Estoque
  { nome: 'ESTOQUE',     tipo: 'NUMERIC(15,3) NOT NULL DEFAULT 0', desc: 'Estoque atual' },
  { nome: 'ESTOQUEMINIMO', tipo: 'NUMERIC(15,3) NOT NULL DEFAULT 0', desc: 'Estoque mínimo' },
  // Preço de custo (já existe PRECO, mas adicionar PRECOCUSTO para clareza)
  { nome: 'PRECOCUSTO',  tipo: 'NUMERIC(15,2) NOT NULL DEFAULT 0', desc: 'Preço de custo do produto' },
];

for (const col of colunas) {
  const query = `
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00009' AND COLUMN_NAME='${col.nome}'
    )
    BEGIN
      ALTER TABLE KS0000.KS00009 ADD ${col.nome} ${col.tipo}
      PRINT 'Coluna ${col.nome} adicionada: ${col.desc}'
    END
    ELSE
      PRINT 'Coluna ${col.nome} já existe'
  `;
  await pool.request().query(query);
  console.log(`  ${col.nome}: OK`);
}

// Verificar resultado
const r = await pool.request().query(`
  SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00009'
  ORDER BY ORDINAL_POSITION
`);
console.log('\nColunas da KS0000.KS00009:');
r.recordset.forEach(c => console.log(`  ${c.COLUMN_NAME}: ${c.DATA_TYPE} (nullable: ${c.IS_NULLABLE})`));

await pool.close();
console.log('\nConcluído!');

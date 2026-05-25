/**
 * Script para criar as tabelas KS0000.KS00008 (Categorias) e KS0000.KS00009 (Produtos)
 * no SQL Server externo 179.0.177.60:1433/Data
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

console.log('Conectando em:', config.server, config.database);
const pool = await sql.connect(config);

// Criar tabela de Categorias (KS0000.KS00008)
console.log('\n--- Criando KS0000.KS00008 (Categorias) ---');
await pool.request().query(`
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00008'
  )
  BEGIN
    CREATE TABLE KS0000.KS00008 (
      CODCATEGORIA    INT           NOT NULL,
      CATEGORIA       VARCHAR(100)  NOT NULL,
      DESCRICAO       VARCHAR(255)  NULL,
      SLUG            VARCHAR(100)  NULL,
      ORDEMEXIBICAO   INT           NOT NULL DEFAULT 0,
      SITUACAO        CHAR(1)       NOT NULL DEFAULT 'A',
      GUIDCATEGORIA   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME      NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_KS00008 PRIMARY KEY (CODCATEGORIA, GUIDENTIDADE)
    )
    PRINT 'Tabela KS0000.KS00008 criada!'
  END
`);
console.log('KS0000.KS00008 OK');

// Criar tabela de Produtos (KS0000.KS00009)
console.log('\n--- Criando KS0000.KS00009 (Produtos) ---');
await pool.request().query(`
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA='KS0000' AND TABLE_NAME='KS00009'
  )
  BEGIN
    CREATE TABLE KS0000.KS00009 (
      CODPRODUTO      INT             NOT NULL,
      PRODUTO         VARCHAR(150)    NOT NULL,
      DESCRICAO       VARCHAR(500)    NULL,
      CODCATEGORIA    INT             NULL,
      GUIDENTIDADECAT UNIQUEIDENTIFIER NULL,
      PRECOS          VARCHAR(MAX)    NULL,
      TAMANHOSDISP    VARCHAR(MAX)    NULL,
      PRECO           NUMERIC(15,2)   NOT NULL DEFAULT 0,
      PRECOVENDA      NUMERIC(15,2)   NOT NULL DEFAULT 0,
      IMAGEURL        VARCHAR(500)    NULL,
      ERPCODE         VARCHAR(100)    NULL,
      DESTAQUE        BIT             NOT NULL DEFAULT 0,
      ORDEMEXIBICAO   INT             NOT NULL DEFAULT 0,
      SITUACAO        CHAR(1)         NOT NULL DEFAULT 'A',
      GUIDPRODUTO     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO    DATETIME        NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME        NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_KS00009 PRIMARY KEY (CODPRODUTO, GUIDENTIDADE)
    )
    PRINT 'Tabela KS0000.KS00009 criada!'
  END
`);
console.log('KS0000.KS00009 OK');

// Verificar resultado
const r = await pool.request().query(`
  SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_NAME IN ('KS00008','KS00009')
`);
console.log('\nTabelas criadas:', JSON.stringify(r.recordset));

await pool.close();
console.log('\nConcluído!');

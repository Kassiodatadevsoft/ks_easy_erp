import sql from 'mssql';

const url = new URL(process.env.SQLSERVER_URL);
const pool = await sql.connect({
  server: url.hostname,
  port: parseInt(url.port) || 1433,
  database: url.pathname.replace(/^\//, '') || 'Data',
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  options: { trustServerCertificate: true, encrypt: false, enableArithAbort: true },
  connectionTimeout: 15000,
});

// ── Criar schema KS0001 se não existir ──────────────────────────────────────
await pool.request().query(`
  IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'KS0001')
  BEGIN EXEC('CREATE SCHEMA KS0001') PRINT 'Schema KS0001 criado' END
  ELSE PRINT 'Schema KS0001 já existe'
`);
console.log('Schema KS0001: OK');

// ── KS0001.KS00001 — Pedidos do Delivery ────────────────────────────────────
await pool.request().query(`
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0001' AND TABLE_NAME='KS00001')
  BEGIN
    CREATE TABLE KS0001.KS00001 (
      CODPEDIDO       INT IDENTITY(1,1) NOT NULL,
      TOKEN           VARCHAR(20) NOT NULL,           -- token público de rastreamento
      GUIDENTIDADE    VARCHAR(36) NOT NULL,           -- empresa (multiempresa)
      -- Cliente
      NOMECLIENTE     VARCHAR(150) NOT NULL,
      TELEFONE        VARCHAR(20) NULL,
      EMAIL           VARCHAR(150) NULL,
      GUIDUSUARIO     VARCHAR(36) NULL,               -- usuário logado (opcional)
      -- Endereço de entrega
      TIPOENTREGA     VARCHAR(10) NOT NULL DEFAULT 'ENTREGA',  -- ENTREGA | RETIRADA
      LOGRADOURO      VARCHAR(200) NULL,
      NUMERO          VARCHAR(20) NULL,
      COMPLEMENTO     VARCHAR(100) NULL,
      BAIRRO          VARCHAR(100) NULL,
      CIDADE          VARCHAR(100) NULL,
      UF              CHAR(2) NULL,
      CEP             VARCHAR(9) NULL,
      -- Valores
      SUBTOTAL        DECIMAL(15,4) NOT NULL DEFAULT 0,
      TAXAENTREGA     DECIMAL(15,4) NOT NULL DEFAULT 0,
      TOTAL           DECIMAL(15,4) NOT NULL DEFAULT 0,
      -- Pagamento
      FORMAPAGAMENTO  VARCHAR(20) NOT NULL DEFAULT 'DINHEIRO',  -- DINHEIRO | CARTAO_CREDITO | CARTAO_DEBITO | PIX
      TROCOPARA       DECIMAL(15,4) NULL,
      -- Status
      STATUS          VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',  -- PENDENTE | CONFIRMADO | PREPARO | SAIU | ENTREGUE | CANCELADO
      OBSERVACAO      VARCHAR(500) NULL,
      -- Timestamps
      DATACADASTRO    DATETIME NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_KS0001_KS00001 PRIMARY KEY (CODPEDIDO)
    )
    CREATE UNIQUE INDEX IX_KS0001_KS00001_TOKEN ON KS0001.KS00001(TOKEN)
    CREATE INDEX IX_KS0001_KS00001_GUIDENTIDADE ON KS0001.KS00001(GUIDENTIDADE)
    CREATE INDEX IX_KS0001_KS00001_STATUS ON KS0001.KS00001(STATUS)
    PRINT 'Tabela KS0001.KS00001 criada'
  END
  ELSE PRINT 'Tabela KS0001.KS00001 já existe'
`);
console.log('KS0001.KS00001 (Pedidos): OK');

// ── KS0001.KS00002 — Itens do Pedido ────────────────────────────────────────
await pool.request().query(`
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0001' AND TABLE_NAME='KS00002')
  BEGIN
    CREATE TABLE KS0001.KS00002 (
      CODITEM         INT IDENTITY(1,1) NOT NULL,
      CODPEDIDO       INT NOT NULL,
      CODPRODUTO      INT NOT NULL,
      GUIDPRODUTO     VARCHAR(36) NULL,
      NOMEPRODUTO     VARCHAR(150) NOT NULL,
      TAMANHO         VARCHAR(20) NULL,               -- BROTINHO | PEQUENA | MEDIA | GRANDE | TREM | BITREM | UNICO
      QUANTIDADE      DECIMAL(10,4) NOT NULL DEFAULT 1,
      PRECOUNITARIO   DECIMAL(15,4) NOT NULL DEFAULT 0,
      SUBTOTAL        DECIMAL(15,4) NOT NULL DEFAULT 0,
      OBSERVACAO      VARCHAR(300) NULL,
      -- Meio a meio (pizza)
      METADE1GUID     VARCHAR(36) NULL,
      METADE1NOME     VARCHAR(150) NULL,
      METADE2GUID     VARCHAR(36) NULL,
      METADE2NOME     VARCHAR(150) NULL,
      CONSTRAINT PK_KS0001_KS00002 PRIMARY KEY (CODITEM),
      CONSTRAINT FK_KS0001_KS00002_PEDIDO FOREIGN KEY (CODPEDIDO) REFERENCES KS0001.KS00001(CODPEDIDO)
    )
    CREATE INDEX IX_KS0001_KS00002_CODPEDIDO ON KS0001.KS00002(CODPEDIDO)
    PRINT 'Tabela KS0001.KS00002 criada'
  END
  ELSE PRINT 'Tabela KS0001.KS00002 já existe'
`);
console.log('KS0001.KS00002 (Itens do Pedido): OK');

await pool.close();
console.log('\n✅ Todas as tabelas de delivery criadas com sucesso!');

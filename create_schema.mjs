import sql from 'mssql';

const config = {
  server: '179.0.177.60',
  port: 1433,
  database: 'Data',
  user: 'sa',
  password: 'F8eq!wyh',
  options: { trustServerCertificate: true, encrypt: false },
  connectionTimeout: 10000
};

try {
  const pool = await sql.connect(config);
  console.log('Conectado ao banco Data!');

  // Listar schemas existentes
  const schemas = await pool.request().query("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME");
  console.log('\nSchemas existentes no banco Data:');
  schemas.recordset.forEach(s => console.log(' -', s.SCHEMA_NAME));

  // Verificar se KS0002 já existe
  const exists = schemas.recordset.some(s => s.SCHEMA_NAME === 'KS0002');
  if (exists) {
    console.log('\nSchema KS0002 já existe no banco Data.');
  } else {
    await pool.request().query('CREATE SCHEMA KS0002');
    console.log('\nSchema KS0002 CRIADO com sucesso no banco Data!');
  }

  // Verificar tabelas existentes no banco Data
  const tables = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME");
  console.log('\nTabelas existentes no banco Data:');
  tables.recordset.forEach(t => console.log(' -', t.TABLE_SCHEMA + '.' + t.TABLE_NAME));

  await pool.close();
  process.exit(0);
} catch (err) {
  console.error('ERRO:', err.message);
  process.exit(1);
}

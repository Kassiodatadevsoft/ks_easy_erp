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

const pool = await sql.connect(config);
console.log('Conectado ao banco Data!\n');

// Mostrar todos os registros da tabela
const todos = await pool.request().query(
  'SELECT CODIGO, USUARIO, SENHAPRAZO, SITUACAO, GUIDPESSOA, GUIDENTIDADE, NOME FROM KS0002.KS00001'
);
console.log('=== Registros em KS0002.KS00001 ===');
todos.recordset.forEach(u => {
  console.log(`CODIGO: ${u.CODIGO} | USUARIO: ${u.USUARIO} | SENHA: ${u.SENHAPRAZO} | SITUACAO: ${u.SITUACAO}`);
  console.log(`  GUIDPESSOA:   ${u.GUIDPESSOA}`);
  console.log(`  GUIDENTIDADE: ${u.GUIDENTIDADE}`);
  console.log(`  NOME:         ${u.NOME}`);
  console.log('');
});

// Testar login com usuario=1 senha=1
console.log('=== Testando login USUARIO=1 SENHA=1 ===');
const login = await pool.request()
  .input('USUARIO', sql.VarChar, '1')
  .input('SENHA', sql.VarChar, '1')
  .query(`
    SELECT CAD.USUARIO, CAD.NOME, CAD.GUIDPESSOA, CAD.GUIDENTIDADE,
           ent.DOCUMENTO as ENTDOCUMENTO, ent.NOME as ENTNOME
    FROM KS0002.KS00001 AS CAD
    INNER JOIN KS0002.KS00001 AS ent ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
    WHERE CAD.SENHAPRAZO = @SENHA
      AND CAD.USUARIO    = @USUARIO
      AND CAD.SITUACAO   = 'A'
      AND ent.SITUACAO   = 'A'
  `);

if (login.recordset.length > 0) {
  console.log('✅ LOGIN OK!');
  console.log(JSON.stringify(login.recordset[0], null, 2));
} else {
  console.log('❌ Login falhou — verificando o motivo...');

  // Verificar se o GUIDENTIDADE do usuário existe como GUIDPESSOA
  const usuario = todos.recordset.find(u => u.USUARIO === '1');
  if (usuario) {
    console.log(`\nO usuário '1' tem GUIDENTIDADE = ${usuario.GUIDENTIDADE}`);
    const empresa = todos.recordset.find(u => u.GUIDPESSOA?.toString() === usuario.GUIDENTIDADE?.toString());
    if (empresa) {
      console.log(`Empresa encontrada: ${empresa.NOME} | SITUACAO: ${empresa.SITUACAO}`);
      if (empresa.SITUACAO !== 'A') {
        console.log('⚠️  Problema: a empresa vinculada está INATIVA (SITUACAO != A)');
      }
    } else {
      console.log('⚠️  Problema: não existe registro com GUIDPESSOA = GUIDENTIDADE do usuário');
      console.log('   Precisa inserir o registro da empresa vinculada ao usuário.');
      console.log(`\n   Script para corrigir:`);
      console.log(`   INSERT INTO KS0002.KS00001 (CODIGO, NOME, GUIDPESSOA, SITUACAO, CODENTIDADE)`);
      console.log(`   VALUES (999, 'EMPRESA TESTE', '${usuario.GUIDENTIDADE}', 'A', 0);`);
    }
  }
}

await pool.close();
process.exit(0);

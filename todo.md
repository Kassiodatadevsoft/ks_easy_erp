# KS Easy ERP - TODO

## Fase 1: Configuração e Infraestrutura
- [x] Instalar driver mssql (SQL Server) no projeto Node.js
- [x] Criar helper de conexão com SQL Server usando variável de ambiente
- [x] Configurar variável de ambiente SQLSERVER_URL
- [x] Criar procedure tRPC de autenticação contra tabela KS00001

## Fase 2: Autenticação e Sessão
- [x] Tela de login responsiva com campos USUÁRIO e SENHA
- [x] Validação de credenciais contra KS00001 (USUARIO, SENHAPRAZO, SITUACAO='A')
- [x] Captura do GUIDENTIDADE da empresa vinculada ao usuário no login
- [x] Armazenar na sessão: GUIDPESSOA, NOME, DOCUMENTO, GUIDENTIDADE, CODTIPOENTIDADE
- [x] Mensagem de erro clara para credenciais inválidas
- [x] Context API (useKsAuth hook) com dados do usuário logado e GUIDENTIDADE
- [x] Persistência de sessão via JWT (cookie httpOnly, 8h)
- [x] Logout com limpeza de sessão

## Fase 3: Estrutura Base e Navegação
- [x] Rotas protegidas com redirecionamento automático para login
- [x] DashboardLayout com sidebar responsivo (colapsável em mobile)
- [x] Menu lateral com módulos do ERP (Cadastros, Financeiro, Vendas, etc.)
- [x] Header com nome do usuário logado e empresa
- [x] Página 404 personalizada
- [x] Breadcrumb de navegação (header com KS ERP > Página)

## Fase 4: Cadastro Unificado de Entidades
- [x] Listagem de entidades filtrada por GUIDENTIDADE da empresa logada (backend)
- [x] Filtro por tipo: Empresa, Cliente, Fornecedor, Funcionário, Transportadora (backend)
- [x] Filtro por SITUACAO (Ativo/Inativo) (backend)
- [ ] Tela de listagem de entidades com tabela e filtros
- [ ] Formulário de cadastro/edição de entidade
- [ ] Campos: NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO, TELEFONE, CELULAR, EMAIL
- [ ] Campos de endereço: CEP, ENDERECO, NUMERO, BAIRRO, COMPLEMENTO
- [ ] Flags de tipo: CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA
- [ ] Validação de CNPJ/CPF no frontend
- [ ] Busca por nome, documento ou código

## Fase 5: API REST de Sincronização
- [x] Endpoint sync.status - status da sincronização
- [x] Endpoint sync.entidadesModificadas - listar entidades modificadas por empresa
- [ ] Endpoint para criar/atualizar entidade via Delphi
- [ ] Autenticação via API Key para chamadas do Delphi
- [ ] Log de sincronizações realizadas

## Fase 6: Testes e Entrega
- [x] Testes unitários da procedure de autenticação
- [x] Testes de isolamento por GUIDENTIDADE (mock)
- [ ] Validação de rotas protegidas
- [ ] Checkpoint final e entrega

## Módulo de Clientes

- [x] Backend: router tRPC para listar clientes (CADCLIENTE=1) filtrado por GUIDENTIDADE
- [x] Backend: busca por DOCUMENTO, FANTASIA, NOME, TELEFONE com paginação
- [x] Backend: buscar cidades da tabela KS0000.KS00005 por nome/código/IBGE
- [x] Backend: criar cliente (INSERT em KS0002.KS00001 com CADCLIENTE=1)
- [x] Backend: editar cliente (UPDATE em KS0002.KS00001)
- [x] Backend: validar duplicidade de DOCUMENTO antes de salvar
- [x] Backend: consulta CNPJ via BrasilAPI para auto-preencher
- [x] Frontend: página de listagem de clientes com grid/tabela responsiva
- [x] Frontend: filtros por DOCUMENTO, FANTASIA, NOME, TELEFONE
- [x] Frontend: botão "Novo Cliente" abre formulário
- [x] Frontend: formulário de cadastro/edição com abas (Dados, Endereço, Financeiro)
- [x] Frontend: campo Tipo de Pessoa (Física/Jurídica) com máscara CPF/CNPJ
- [x] Frontend: campo Situação (Ativo/Inativo/Bloqueado)
- [x] Frontend: campo Indicador IE (Contribuinte/Isento/Não Contribuinte)
- [x] Frontend: busca de cidade com autocomplete (KS0000.KS00005)
- [x] Frontend: botão buscar CNPJ via BrasilAPI (auto-preencher endereço)
- [x] Frontend: campos financeiros (limite de compra, dia vencimento)
- [x] Frontend: checkboxes (Manter Promoções, Também é Usuário, Também é Fornecedor, Consta no SPC)
- [x] Frontend: validação de campos obrigatórios (Documento, Nome, CEP, Endereço, Número, Bairro, Cidade, Celular)
- [x] Frontend: rota e tabela de preço deixados para implementação posterior

## Módulo de Fornecedores

- [x] Backend: router tRPC para listar fornecedores (CADFORNECEDOR=1) filtrado por GUIDENTIDADE
- [x] Backend: criar fornecedor com CADFORNECEDOR=1 fixo e CADCLIENTE como flag
- [x] Backend: editar fornecedor com flag "Também é Cliente" (CADCLIENTE)
- [x] Frontend: página de listagem de fornecedores com grid/tabela responsiva
- [x] Frontend: formulário de cadastro/edição com checkbox "Também é Cliente"
- [x] Frontend: mesmas validações e campos do módulo de clientes

## Módulo de Empresas

- [x] Backend: router tRPC para listar empresas (CADEMPRESA=1) filtrado por GUIDENTIDADE
- [x] Backend: criar empresa com CADEMPRESA=1 fixo, INSERT em KS0002.KS00001 + KS0002.KS00013
- [x] Backend: editar empresa
- [x] Backend: verificar CNPJ da empresa logada para ocultar campos sensíveis (CNPJ 50303631000158)
- [x] Frontend: página de listagem de empresas com grid/filtros/paginação
- [x] Frontend: formulário com abas Dados Gerais, Endereço, Fiscal/Financeiro e Contrato
- [x] Frontend: aba Contrato com campos EdtSegmento, EdtdATABASE, DtDemissao, edtValorNegociado, EdtVALORSALARIO
- [x] Frontend: campos fiscais (CRT, Ambiente NFe, Alíquota COFINS, Alíquota PIS, Juro Mensal)
- [x] Frontend: campos bancários (Banco, Agência, Conta, Pix)
- [x] Frontend: campos de acesso (Usuário, Senha com validação de força)
- [x] Frontend: ocultar aba Contrato se empresa logada for CNPJ 50303631000158
- [x] Frontend: validações obrigatórias (Documento, Nome, CEP, Endereço, Número, Bairro, Cidade, Data Implantação, Segmento, Valor Negociado, Valor Salário)
- [x] Frontend: busca CNPJ via BrasilAPI com auto-preenchimento
- [x] Frontend: upload de certificado digital .pfx/.p12 com conversão base64
- [x] Frontend: campo DTCERTIFICADO (data de vencimento do certificado)
- [x] Backend: campos fiscais NF-e no input Zod e SQLs (CERTIFICADO, DTCERTIFICADO, CODPIN, CSC, CODCSC, NUMNFE, SERIENFE, USUARIO, SENHAPRAZO)

## Módulo Cargos (KS0000.KS00007)

- [x] Backend: cargosRouter.ts com listar, buscarPorGuid, criar, atualizar, excluir
- [x] Backend: validação de nome duplicado por GUIDENTIDADE
- [x] Frontend: página Cargos.tsx com listagem, filtros e paginação
- [x] Frontend: CargoForm.tsx com campos Cargo, Classificação (CODTIPO), Situação, Dashboard inicial (CODPAINEL), Desconto máximo, Comissão, PDV, Alterar preço produto
- [x] Frontend: registrar rota /cargos no App.tsx
- [x] Frontend: adicionar item Cargos no menu do DashboardLayout

## Módulo Transportadoras (KS0002.KS00001 — CADTRANSPORTADORA=1)
- [ ] Backend: transportadorasRouter.ts com listar, buscarPorGuid, criar, atualizar, excluir
- [ ] Frontend: página Transportadoras.tsx com listagem, filtros e paginação
- [ ] Frontend: TransportadoraForm.tsx baseado no FornecedorForm (maiúsculas, validações)
- [ ] Frontend: registrar rota /cadastros/transportadoras no App.tsx
- [ ] Frontend: adicionar item Transportadoras no menu do KsDashboardLayout

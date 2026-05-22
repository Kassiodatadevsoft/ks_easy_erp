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

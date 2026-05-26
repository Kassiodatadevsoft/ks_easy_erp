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
- [x] Tela de listagem de entidades com tabela e filtros por tipo (Entidades.tsx)
- [x] Formulário de cadastro/edição: botões de ação na listagem redirecionam para o módulo específico (Clientes, Fornecedores, etc.)
- [x] Campos: NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO, TELEFONE, CELULAR, EMAIL (exibidos na listagem)
- [x] Campos de endereço: disponíveis nos formulários individuais de cada módulo (Clientes, Fornecedores, Empresas)
- [x] Flags de tipo: CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA (badges na listagem)
- [x] Validação de CNPJ/CPF no frontend (implementado nos módulos individuais de Clientes, Fornecedores, Empresas)
- [x] Busca por nome, documento ou fantasia (entidadesRouter.list filtra NOME, DOCUMENTO, FANTASIA)

## Fase 5: API REST de Sincronização
- [x] Endpoint sync.status - status da sincronização
- [x] Endpoint sync.entidadesModificadas - listar entidades modificadas por empresa
- [x] Endpoint para criar/atualizar entidade via Delphi (sync.enviar com MERGE de pessoas e cargos)
- [x] Autenticação via Basic Auth para chamadas do Delphi (autenticarBasic em syncRouter — Basic Auth é mais simples para Delphi legado que API Key)
- [x] Log de sincronizações: registrado no console do servidor (baixa prioridade — sem tabela dedicada)

## Fase 6: Testes e Entrega
- [x] Testes unitários da procedure de autenticação
- [x] Testes de isolamento por GUIDENTIDADE (mock)
- [x] Validação de rotas protegidas (ProtectedRoute em App.tsx redireciona para /login)
- [x] Checkpoint final e entrega (versão 6177b736)

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
- [x] Backend: transportadorasRouter.ts com listar, buscarPorGuid, criar, atualizar, excluir
- [x] Frontend: página Transportadoras.tsx com listagem, filtros e paginação
- [x] Frontend: TransportadoraForm.tsx baseado no FornecedorForm (maiúsculas, validações)
- [x] Frontend: registrar rota /cadastros/transportadoras no App.tsx
- [x] Frontend: adicionar item Transportadoras no menu do KsDashboardLayout

## Correção de Campos camelCase no Módulo Financeiro
- [x] ContasPagar.tsx: tipo Lanc atualizado para camelCase (guidLancamento, dtVencimento, nomeNatureza, etc.)
- [x] ContasPagar.tsx: tabela de listagem corrigida para usar campos camelCase do router
- [x] ContasReceber.tsx: tipo Lanc e tabela de listagem corrigidos para camelCase

## Campo MENSALIDADE e Sincronização Offline
- [x] Frontend: campo MENSALIDADE (Mensal=1/Anual=2) no formulário de Empresas, visível apenas para CNPJ 50.303.631/0001-58
- [x] Backend: adicionar MENSALIDADE no Zod do criar/atualizar e nos SQLs do empresasRouter
- [x] SQL Server: coluna MENSALIDADE (TINYINT, DEFAULT 1) adicionada em KS0002.KS00001
- [x] Backend: endpoint REST /api/trpc/syncDelphi.pull (recebe GUIDENTIDADE via Bearer token + dispositivo, retorna delta por ULTIMAALTERACAO — 8 entidades)
- [x] Documentação: unit KSEasyERPSync.pas + INTEGRACAO_DELPHI.md com exemplos completos de push, pull, ack e sync automático com TTimer

## Módulo de Categorias (KS0000.KS00008)
- [x] SQL Server: criar tabela KS0000.KS00008 (CODCATEGORIA, CATEGORIA, DESCRICAO, SLUG, ORDEMEXIBICAO, SITUACAO, GUIDCATEGORIA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: categoriasRouter.ts com listar, buscarPorGuid, validarNome, criar, atualizar, excluir, listarTodas
- [x] Backend: registrar categoriasRouter no routers.ts
- [x] Frontend: CategoriaForm.tsx com campos Nome, Descrição, Slug, Ordem, Situação e validação em tempo real
- [x] Frontend: página Categorias.tsx com listagem, filtros, paginação e confirmação de inativação
- [x] Frontend: registrar rota /estoque/categorias no App.tsx
- [x] Frontend: adicionar item Categorias no menu do KsDashboardLayout

## Módulo de Produtos (KS0000.KS00009)
- [x] SQL Server: criar tabela KS0000.KS00009 (CODPRODUTO, PRODUTO, DESCRICAO, CODCATEGORIA, GUIDENTIDADECAT, PRECOS, TAMANHOSDISP, PRECO, PRECOVENDA, IMAGEURL, ERPCODE, DESTAQUE, ORDEMEXIBICAO, SITUACAO, GUIDPRODUTO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: produtosRouter.ts com listar, buscarPorGuid, validarNome, criar, atualizar, excluir
- [x] Backend: JOIN com KS0000.KS00008 para exibir nome da categoria
- [x] Backend: campo ERPCODE para integração bidirecional com sistema de delivery
- [x] Backend: registrar produtosRouter no routers.ts
- [x] Frontend: ProdutoForm.tsx com 3 abas (Dados Gerais, Preços/Tamanhos, Delivery/ERP)
- [x] Frontend: modo de preço Simples (preço único) ou Por Tamanho (JSON com múltiplos tamanhos)
- [x] Frontend: campo ERPCODE com explicação de integração com delivery
- [x] Frontend: campo URL da imagem com preview
- [x] Frontend: switch Destaque (produto aparece na seção de destaques do delivery)
- [x] Frontend: página Produtos.tsx com listagem, filtros por categoria/situação, paginação
- [x] Frontend: exibição de faixa de preços (mínimo–máximo) na listagem
- [x] Frontend: ícone estrela para produtos em destaque na listagem
- [x] Frontend: registrar rota /estoque/produtos no App.tsx
- [x] Frontend: adicionar item Produtos no menu do KsDashboardLayout (seção "Estoque / Cardápio")

## Melhorias no Módulo de Produtos (v2)
- [x] SQL Server: adicionar colunas fiscais e de estoque na KS0000.KS00009 (NCM, CEST, CFOP, CSOSN, ALIQICMS, ALIQPIS, ALIQCOFINS, UNIDADE, ESTOQUE, ESTOQUEMINIMO)
- [x] Backend: atualizar produtosRouter.ts com novos campos fiscais e de estoque no Zod e SQLs
- [x] Frontend: ProdutoForm - fixar 7 tamanhos no modo "Por Tamanho" (BROTINHO, PEQUENA, MEDIA, GRANDE, TREM, BITREM, UNICO) sem botão adicionar/remover
- [x] Frontend: ProdutoForm - adicionar campo Preço de Venda no modo "Preço Único"
- [x] Frontend: ProdutoForm - nova aba "Fiscal" com NCM, CEST, CFOP, CSOSN (Simples Nacional), alíquotas ICMS/PIS/COFINS, Unidade Fiscal
- [x] Frontend: ProdutoForm - nova aba "Estoque" com Estoque Atual e Estoque Mínimo

## Módulo de Delivery (Sistema de Pedidos Online)
- [x] SQL Server: criar tabelas KS0001.KS00001 (pedidos) e KS0001.KS00002 (itens do pedido)
- [x] Backend: deliveryRouter com categorias, produtos, criarPedido, pedidoPorToken, pedidosAdmin, pedidoComItens, atualizarStatusPedido
- [x] Backend: status alinhados com fluxo real (RECEBIDO, PREPARANDO, SAIU_ENTREGA, PRONTO_RETIRADA, ENTREGUE, CANCELADO)
- [x] Backend: notificação ao dono a cada novo pedido
- [x] Frontend: DeliveryCartContext (carrinho genérico para ERP)
- [x] Frontend: ProdutoCard e ProdutoModal (seleção de tamanho e meio a meio)
- [x] Frontend: DeliveryCartDrawer (gaveta do carrinho)
- [x] Frontend: Cardapio.tsx (cardápio público com filtros por categoria)
- [x] Frontend: Checkout.tsx (finalização do pedido com entrega/retirada)
- [x] Frontend: PedidoTracking.tsx (rastreamento público por token)
- [x] Frontend: PedidosOnline.tsx (painel admin de pedidos no ERP)
- [x] App.tsx: rotas /cardapio, /checkout, /pedido/:token, /delivery/pedidos
- [x] Menu lateral: grupo Delivery com item Pedidos Online

## Melhorias no Módulo de Produtos (v3)
- [x] SQL Server: adicionar colunas REFERENCIA, DELIVERY, ALIQICMSFORM, PERCREDUCAOFORM, PERCFRETEFORM, PERCJUROSFORM na KS0000.KS00009
- [x] SQL Server: alterar coluna PRECOS para suportar tamanhos dinâmicos com campo quantidade (JSON: [{nome, preco, qtd}])
- [x] Backend: atualizar produtosRouter com novos campos no Zod, SELECT, INSERT e UPDATE
- [x] Frontend: corrigir layout aba Fiscal — CFOP, Unidade Fiscal e Fracionado em grid responsivo sem sobreposição
- [x] Frontend: tornar NCM, CFOP, CSOSN e Nome do Produto campos obrigatórios com validação
- [x] Frontend: adicionar campo Referência (código interno/referência do produto)
- [x] Frontend: adicionar campo "Vai para o Delivery?" (switch) na aba Dados Gerais
- [x] Frontend: aba Preços — modo Por Tamanho com tamanhos dinâmicos (adicionar/remover) + campo Quantidade por tamanho
- [x] Frontend: aba Preços — modo Preço Único com campos de formação de preço (ICMS%, Redução%, Frete%, Juros%) e campo Total calculado automaticamente

## Módulo Financeiro

### Plano de Contas (KS0003.KS00001)
- [x] SQL Server: criar tabela KS0003.KS00001 (CODCONTA, CONTA, DESCRICAO, TIPO (R/D/T), NIVEL, CODCONTAPAI, MASCARA, SITUACAO, GUIDCONTA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: planoContasRouter com listar (árvore hierárquica), criar, atualizar, excluir
- [x] Frontend: PlanoContas.tsx com visualização em árvore hierárquica e formulário

### Natureza de Caixa (KS0003.KS00002)
- [x] SQL Server: criar tabela KS0003.KS00002 (CODNATUREZA, NATUREZA, DESCRICAO, TIPO (R/D), CODCONTA, SITUACAO, GUIDNATUREZA, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: naturezaCaixaRouter com listar, criar, atualizar, excluir
- [x] Frontend: NaturezaCaixa.tsx com listagem, filtros e formulário

### Contas a Pagar (KS0003.KS00004)
- [x] SQL Server: criar tabela KS0003.KS00004 (GUIDLANCAMENTO, DESCRICAO, GUIDCREDOR, NOMECREDOR, VALOR, VALORPAGO, DTLANCAMENTO, DTVENCIMENTO, DTPAGAMENTO, GUIDNATUREZA, GUIDCENTRO, NUMERODOC, PARCELA, TOTALPARCELAS, STATUS, OBSERVACAO, GUIDENTIDADE)
- [x] Backend: contasPagarRouter com listar (filtros status/período), criar, atualizar, baixar, cancelar, excluir, buscarFornecedores
- [x] Frontend: ContasPagar.tsx com listagem, filtros, totalizadores, formulário e baixa (credor obrigatório via autocomplete)

### Contas a Receber (KS0003.KS00005)
- [x] SQL Server: criar tabela KS0003.KS00005 (GUIDLANCAMENTO, DESCRICAO, GUIDDEVEDOR, NOMEDEVEDOR, VALOR, VALORRECEBIDO, DTLANCAMENTO, DTVENCIMENTO, DTRECEBIMENTO, GUIDNATUREZA, GUIDCENTRO, NUMERODOC, PARCELA, TOTALPARCELAS, STATUS, OBSERVACAO, GUIDENTIDADE)
- [x] Backend: contasReceberRouter com listar, criar, atualizar, baixar, cancelar, excluir, buscarClientes
- [x] Frontend: ContasReceber.tsx com listagem, filtros, totalizadores, formulário e baixa (devedor obrigatório via autocomplete)

### Fluxo de Caixa (KS0003.KS00007)
- [x] Backend: fluxoCaixaRouter com relatório de fluxo por período (entradas, saídas, saldo), DRE simplificado
- [x] Frontend: FluxoCaixa.tsx com gráfico de barras (entradas vs saídas), DRE e tabela de movimentações

### Integração e Menu
- [x] Registrar todos os routers no routers.ts principal
- [x] Registrar rotas no App.tsx (/financeiro/plano-contas, /financeiro/natureza-caixa, /financeiro/contas-pagar, /financeiro/contas-receber, /financeiro/fluxo-caixa, /financeiro/formas-pagamento)
- [x] Atualizar menu lateral com grupo Financeiro expandido

## Módulo Financeiro — Formas de Pagamento

- [x] SQL Server: criar tabela KS0003.KS00006 com campos CODIGOSEFAZ, INTEGRATEF, BANDEIRATEF, ACEITATROCO
- [x] SQL Server: popular tabela com 17 formas de pagamento SEFAZ padrão (01-90)
- [x] Backend: formasPagamentoRouter (listar paginado, listarTodas, criar, atualizar, excluir)
- [x] Frontend: FormasPagamento.tsx com tabela, badge código SEFAZ, toggle TEF e modal de cadastro
- [x] App.tsx: rota /financeiro/formas-pagamento
- [x] Menu: "Formas de Pagamento" na seção Financeiro

## Módulo Financeiro — Contas Bancárias (KS0003.KS00008)
- [x] SQL Server: criar tabela KS0003.KS00008 (GUIDCONTA, CODCONTA, CONTA, BANCO, AGENCIA, NUMEROCONTA, TIPOCONTA, SALDOINICIAL, SALDOATUAL, SITUACAO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: contasBancariasRouter (listar, listarTodas, criar, atualizar, excluir, recalcularSaldo)
- [x] Frontend: ContasBancarias.tsx com cards de saldo, listagem e formulário

## Módulo Financeiro — Transferências entre Contas (KS0003.KS00009)
- [x] SQL Server: criar tabela KS0003.KS00009 (GUIDTRANSFERENCIA, DTRANSFERENCIA, GUIDCONTAORIGEM, GUIDCONTADESTINO, VALOR, DESCRICAO, OBSERVACAO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: transferenciasRouter (listar, criar, excluir — excluir reverte saldos automaticamente)
- [x] Frontend: Transferencias.tsx com listagem, filtros por período e formulário

## Módulo Financeiro — Lançamentos de Caixa (KS0003.KS00010)
- [x] SQL Server: criar tabela KS0003.KS00010 (GUIDLANCAMENTO, DTLANCAMENTO, TIPO (E/S), VALOR, DESCRICAO, GUIDCONTA, GUIDNATUREZA, GUIDCENTRO, NUMERODOC, OBSERVACAO, GUIDENTIDADE, DATACADASTRO, ULTIMAALTERACAO)
- [x] Backend: lancamentosCaixaRouter (listar com filtros, criar, excluir, resumoDiario) — atualiza saldo da conta automático
- [x] Frontend: LancamentosCaixa.tsx com extrato, totalizadores (Entradas/Saídas/Saldo) e formulário

## Módulo Financeiro — Balanço Patrimonial
- [x] Backend: balancoPatrimonialRouter com Ativo (Disponível + Contas a Receber), Passivo (Contas a Pagar) e Patrimônio Líquido
- [x] Frontend: BalancoPatrimonial.tsx com estrutura Ativo/Passivo/PL, cards de resumo e gráfico de evolução mensal
- [x] Integrar rotas e menu: /financeiro/contas-bancarias, /financeiro/transferencias, /financeiro/lancamentos-caixa, /financeiro/balanco-patrimonial

## Seed de Dados Padrão

- [x] Backend: seedRouter com popularPlanoContas (5 grupos), popularCentroCusto (4 centros), popularNaturezaCaixa (20 naturezas), status
- [x] Backend: seedRouter popular Centro de Custo padrão (4 centros: Administrativo, Comercial, Operacional, Financeiro)
- [x] Backend: seedRouter popular Natureza de Caixa padrão (20 naturezas: vendas, compras, salários, impostos, etc.)
- [x] Frontend: botão "Dados Padrão" (amber) nas páginas PlanoContas.tsx, CentroCusto.tsx e NaturezaCaixa.tsx (só aparece quando tabela está vazia)

## Dashboard de Vendas

- [x] Backend: vendasDashboardRouter com KPIs (faturamento, ticket médio, qtd pedidos, clientes ativos), comparação com período anterior
- [x] Backend: faturamentoMensal (12 meses), topClientes (top 10), receitasPorNatureza (pizza), statusReceber (alertas)
- [x] Frontend: DashboardVendas.tsx com cards KPI, gráfico de barras mensal, pizza por natureza, top clientes com barra de progresso, painel A Receber
- [x] App.tsx: rota /vendas e /vendas/dashboard
- [x] Menu: item "Dashboard" em Comercial (BarChart2)

## API de Sincronização Delphi (Bidirecional)

- [x] Backend: syncDelphiRouter com info, push, pull, ack
- [x] Endpoint GET /api/trpc/syncDelphi.info — metadados e timestamps da empresa
- [x] Endpoint POST /api/trpc/syncDelphi.push — upsert de pessoas, contasReceber, contasPagar, lancamentosCaixa via MERGE
- [x] Endpoint GET /api/trpc/syncDelphi.pull — delta incremental por ULTIMAALTERACAO (8 entidades)
- [x] Endpoint POST /api/trpc/syncDelphi.ack — confirma recebimento e atualiza lastSyncAt
- [x] Autenticação via Bearer token (campo APIKEY da tabela KS0002.KS00001)
- [x] Tabela de controle KS0002.KS00010 criada automaticamente (GUIDSYNC, GUIDENTIDADE, DISPOSITIVO, timestamps)
- [x] Documentação: unit Delphi KSEasyERPSync.pas com TKSEasyERPSync class completa
- [x] Documentação: INTEGRACAO_DELPHI.md com exemplos de push, pull, ack e sync automático com TTimer

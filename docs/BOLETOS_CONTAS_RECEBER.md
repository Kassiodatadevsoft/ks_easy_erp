# Gestão de Boletos em Contas a Receber

A emissão de boletos fica integrada ao módulo existente de Contas a Receber. Não há rota ou menu financeiro separado: cada título em `KS0003.KS00005` pode emitir, consultar, baixar PDF, copiar linha digitável e cancelar boleto.

## Banco de Dados

As tabelas complementares seguem o padrão offline-first do ERP:

- `KS0003.KS00011`: boletos de contas a receber.
- `KS0003.KS00012`: eventos/histórico dos boletos.

Ambas usam `UNIQUEIDENTIFIER` como chave primária, com GUID gerado pela aplicação ou `DEFAULT NEWID()`, e possuem `GUIDENTIDADE` e `ULTIMAALTERACAO` para sincronização.

Script de criação/verificação:

```bash
pnpm exec tsx add-contas-receber-boletos.ts
```

## Configuração dos Bancos

A configuração de Itaú e Cora fica no cadastro existente de Contas Bancárias:

1. Acesse Financeiro > Contas Bancárias.
2. Crie ou edite uma conta.
3. Ative a seção Integração de Boletos.
4. Escolha Itaú ou Cora.
5. Informe ambiente, Client ID, Client Secret e URLs/paths quando necessário.

O `Client Secret` não é retornado para o frontend. Na edição, deixar o campo em branco mantém o segredo já salvo.

### Criptografia do segredo

Para criptografar o `Client Secret` no banco, configure:

```env
BOLETO_CONFIG_SECRET=uma-chave-forte-fora-do-repositorio
```

Se essa variável não estiver definida, o sistema mantém compatibilidade e salva o valor recebido sem criptografia. Em produção, configure sempre essa variável antes de cadastrar credenciais.

Script de criação/verificação dos campos na tabela de Contas Bancárias:

```bash
pnpm exec tsx add-boleto-config-contas-bancarias.ts
```

## Fallback por Variáveis de Ambiente

Nunca grave tokens ou segredos no código. Configure as credenciais no ambiente de execução.

As variáveis abaixo continuam funcionando como fallback técnico, mas a preferência operacional é usar o cadastro de Contas Bancárias.

### Itaú

```env
ITAU_API_URL=https://api.itau.com.br
ITAU_TOKEN_URL=https://api.itau.com.br/oauth/token
ITAU_CLIENT_ID=...
ITAU_CLIENT_SECRET=...
ITAU_BOLETO_EMITIR_PATH=/boletos
ITAU_BOLETO_CONSULTAR_PATH=/boletos/{id}
ITAU_BOLETO_CANCELAR_PATH=/boletos/{id}
```

Os caminhos podem ser ajustados conforme o produto contratado no Itaú Empresas/Developers. Se o ambiente exigir certificado mTLS, configure o proxy/infra segura ou estenda o provider para carregar certificado fora do repositório.

### Cora

```env
CORA_API_URL=https://api.cora.com.br
CORA_TOKEN_URL=https://api.cora.com.br/oauth/token
CORA_CLIENT_ID=...
CORA_CLIENT_SECRET=...
```

Para sandbox/homologação, altere `CORA_API_URL` e `CORA_TOKEN_URL` para os endpoints de stage informados pela Cora.

## Sincronização Offline

O `syncDelphiRouter` aceita e retorna:

- `contasReceberBoletos`
- `contasReceberBoletoEventos`

O relacionamento é sempre por GUID:

- `GUIDLANCAMENTO` referencia o título de contas a receber.
- `GUIDBOLETO` referencia o boleto.

Não há dependência de `IDENTITY`, auto incremento ou chave sequencial.

## Segurança

- A regra bancária fica no backend.
- O frontend apenas chama as procedures tRPC.
- Requests e responses gravados em eventos passam por mascaramento de campos sensíveis.
- Erros de API retornam mensagens amigáveis para a tela.

# Rotas Delphi - vendas, fiscal e caixa

Autenticacao nas rotas tRPC de sincronizacao geral:

```http
Authorization: Bearer <API_KEY_DA_EMPRESA>
Content-Type: application/json
```

Excecao: `POST /api/vendas/sincronizar-pdv` nao usa `Authorization` nem API Key. A empresa e identificada exclusivamente pelo campo `GUIDENTIDADE` enviado no corpo JSON.

## API Key da empresa

A chave fica no campo `APIKEY` da tabela `KS0002.KS00001`, no cadastro da empresa.

Regra de seguranca aplicada pela API:

```sql
SELECT TOP 1 *
FROM KS0002.KS00001
WHERE APIKEY = @apikey
  AND SITUACAO = 'A'
```

Ou seja: se a empresa nao estiver ativa (`SITUACAO <> 'A'`), o Delphi nao deve conseguir sincronizar. Isso evita que uma empresa inativa, bloqueada ou suspensa continue enviando/recebendo dados.

## Rotas

| Metodo | Rota | Uso |
|---|---|---|
| GET | `/api/trpc/syncDelphi.info` | Testar conexao e ver ultimo sync |
| POST | `/api/trpc/syncDelphi.push` | Delphi envia vendas, itens, pagamentos, notas, eventos e fechamento |
| GET | `/api/trpc/syncDelphi.pull` | Delphi recebe dados/deltas do ERP |
| POST | `/api/trpc/syncDelphi.ack` | Delphi confirma que processou o pull |
| POST | `/api/vendas/sincronizar-pdv` | PDV Delphi envia uma venda completa sem Bearer Token, usando `GUIDENTIDADE` no JSON |

## Sincronizacao de venda do PDV sem token

```http
POST /api/vendas/sincronizar-pdv
Content-Type: application/json
```

Campos obrigatorios:

- `GUIDENTIDADE`
- `venda`
- `ITENS`
- `PAGAMENTOS`

Exemplo:

```json
{
  "GUIDENTIDADE": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "venda": {
    "GUIDVENDA": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "GUIDCAIXA": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "NUMEROCAIXA": 1,
    "GUIDVENDEDOR": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "CLIENTEPADRAO": true,
    "TOTALPRODUTOS": 100,
    "DESCONTOVALOR": 0,
    "ACRESCIMOVALOR": 0,
    "TOTALVENDA": 100,
    "VALORPAGO": 100,
    "TROCO": 0
  },
  "CAIXA_MOVIMENTO": {
    "GUIDCAIXA": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "GUIDUSUARIO": "dddddddd-dddd-dddd-dddd-dddddddddddd",
    "NUMEROCAIXA": 1
  },
  "ITENS": [
    {
      "GUIDPRODUTO": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      "CODPRODUTO": 123,
      "PRODUTO": "Produto exemplo",
      "QUANTIDADE": 2,
      "PRECOVENDA": 50,
      "PRECOFINAL": 50,
      "TOTALITEM": 100,
      "PERMITEVENDASEMESTOQUE": false
    }
  ],
  "PAGAMENTOS": [
    {
      "GUIDFORMAPAGAMENTO": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "CODFORMAPAGAMENTO": 1,
      "FORMAPAGAMENTO": "DINHEIRO",
      "VALORPAGO": 100,
      "TROCO": 0,
      "PARCELAS": 1
    }
  ]
}
```

Resposta de sucesso:

```json
{
  "sucesso": true,
  "mensagem": "Venda sincronizada com sucesso",
  "guidVenda": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "guidEntidade": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

## Formato tRPC

No `POST`, o corpo sempre deve ir dentro de `json`:

```json
{
  "json": {
    "dispositivo": "CAIXA-01",
    "versaoDelphi": "2.5.1"
  }
}
```

No `GET /pull`, o parametro `input` tambem usa `json`:

```http
GET /api/trpc/syncDelphi.pull?input={"json":{"dispositivo":"CAIXA-01","entidades":["produtos"]}}
```

## Tabelas criadas

| Tabela | Conteudo |
|---|---|
| `KS0003.KS00016` | Vendas/cabecalho e dados da nota fiscal/XML |
| `KS0003.KS00017` | Itens da venda |
| `KS0003.KS00018` | Formas de pagamento da venda |
| `KS0003.KS00020` | Eventos da nota, como autorizacao, cancelamento, carta de correcao, inutilizacao e XML do evento |
| `KS0003.KS00021` | Fechamento de caixa por dispositivo/operador |
| `KS0003.KS00022` | Controle do fechamento por forma de pagamento |
| `KS0002.KS00010` | Controle geral de sincronizacao por dispositivo |

## Exemplo de push do Delphi

```json
{
  "dispositivo": "CAIXA-01",
  "versaoDelphi": "2.5.1",
  "vendas": [
    {
      "guidVenda": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "numeroVenda": "1001",
      "codFilial": 1,
      "guidCliente": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "cliente": "Cliente Exemplo",
      "documento": "12345678901",
      "dataVenda": "2026-05-29T10:30:00",
      "status": "FECHADA",
      "valorProdutos": 100,
      "valorDesconto": 0,
      "valorAcrescimo": 0,
      "valorTotal": 100,
      "notaModelo": "65",
      "notaSerie": "1",
      "notaNumero": "123",
      "notaChave": "35260500000000000000650010000001231000001234",
      "notaProtocolo": "135260000000000",
      "notaStatus": "AUTORIZADA",
      "notaDataEmissao": "2026-05-29T10:31:00",
      "notaXml": "<nfeProc>...</nfeProc>",
      "notaDanfeUrl": "",
      "notaMensagemSefaz": "Autorizado o uso da NF-e"
    }
  ],
  "vendaItens": [
    {
      "guidItem": "cccccccc-cccc-cccc-cccc-cccccccccccc",
      "guidVenda": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "codProduto": "001",
      "produto": "Produto Exemplo",
      "unidade": "UN",
      "quantidade": 2,
      "valorUnitario": 50,
      "valorTotal": 100,
      "cfop": "5102",
      "ncm": "00000000"
    }
  ],
  "vendaPagamentos": [
    {
      "guidPagamento": "dddddddd-dddd-dddd-dddd-dddddddddddd",
      "guidVenda": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "formaPagamento": "DINHEIRO",
      "codigoSefaz": "01",
      "valor": 100,
      "parcelas": 1
    }
  ],
  "notaFiscalEventos": [
    {
      "guidVenda": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "tipoEvento": "CANCELAMENTO",
      "sequencia": 1,
      "protocolo": "135260000000001",
      "justificativa": "Cancelamento solicitado pelo cliente",
      "xml": "<procEventoNFe>...</procEventoNFe>",
      "status": "REGISTRADO",
      "dataEvento": "2026-05-29T10:40:00"
    }
  ],
  "fechamentosCaixa": [
    {
      "guidFechamento": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "dispositivo": "CAIXA-01",
      "operador": "OPERADOR 1",
      "dataAbertura": "2026-05-29T08:00:00",
      "dataFechamento": "2026-05-29T18:00:00",
      "status": "FECHADO",
      "valorAbertura": 100,
      "totalVendas": 1000,
      "totalSuprimento": 50,
      "totalSangria": 200,
      "totalInformado": 950,
      "totalDiferenca": 0
    }
  ],
  "fechamentosCaixaControle": [
    {
      "guidFechamento": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "formaPagamento": "DINHEIRO",
      "codigoSefaz": "01",
      "valorSistema": 500,
      "valorInformado": 500,
      "diferenca": 0,
      "quantidade": 10
    },
    {
      "guidFechamento": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "formaPagamento": "PIX",
      "codigoSefaz": "17",
      "valorSistema": 450,
      "valorInformado": 450,
      "diferenca": 0,
      "quantidade": 8
    }
  ]
}
```

## Fluxo recomendado para o PDV

1. Ao abrir o PDV, chamar `syncDelphi.info`.
2. Buscar cadastros e configuracoes com `syncDelphi.pull`.
3. Durante o dia, enviar vendas, contas a receber e lancamentos de caixa com `syncDelphi.push`.
4. Ao fechar o caixa, enviar `fechamentosCaixa` e `fechamentosCaixaControle`.
5. Depois de processar um `pull`, chamar `syncDelphi.ack`.

## Pull inicial do PDV

Use para carregar produtos, clientes, funcionarios e tabelas financeiras/fiscais.

```http
GET /api/trpc/syncDelphi.pull?input={"json":{"dispositivo":"CAIXA-01","entidades":["produtos","clientes","funcionarios","formasPagamento","planoContas","centroCusto","naturezaCaixa"]}}
```

## Venda a vista com nota fiscal

Enviar no `POST /api/trpc/syncDelphi.push`.

```json
{
  "json": {
    "dispositivo": "CAIXA-01",
    "versaoDelphi": "2.5.1",
    "vendas": [
      {
        "guidVenda": "11111111-1111-1111-1111-111111111111",
        "numeroVenda": "1001",
        "codFilial": 1,
        "guidCliente": "22222222-2222-2222-2222-222222222222",
        "cliente": "CLIENTE BALCAO",
        "documento": "12345678901",
        "dataVenda": "2026-05-29T10:30:00",
        "status": "FECHADA",
        "valorProdutos": 100,
        "valorDesconto": 0,
        "valorAcrescimo": 0,
        "valorTotal": 100,
        "notaModelo": "65",
        "notaSerie": "1",
        "notaNumero": "123",
        "notaChave": "35260500000000000000650010000001231000001234",
        "notaProtocolo": "135260000000000",
        "notaStatus": "AUTORIZADA",
        "notaDataEmissao": "2026-05-29T10:31:00",
        "notaXml": "<nfeProc>...</nfeProc>",
        "notaMensagemSefaz": "Autorizado o uso da NF-e"
      }
    ],
    "vendaItens": [
      {
        "guidItem": "33333333-3333-3333-3333-333333333333",
        "guidVenda": "11111111-1111-1111-1111-111111111111",
        "guidProduto": "44444444-4444-4444-4444-444444444444",
        "codProduto": "001",
        "produto": "PRODUTO TESTE",
        "unidade": "UN",
        "quantidade": 2,
        "valorUnitario": 50,
        "valorDesconto": 0,
        "valorTotal": 100,
        "cfop": "5102",
        "ncm": "00000000"
      }
    ],
    "vendaPagamentos": [
      {
        "guidPagamento": "55555555-5555-5555-5555-555555555555",
        "guidVenda": "11111111-1111-1111-1111-111111111111",
        "formaPagamento": "DINHEIRO",
        "codigoSefaz": "01",
        "valor": 100,
        "parcelas": 1
      }
    ],
    "lancamentosCaixa": [
      {
        "guidLancamento": "66666666-6666-6666-6666-666666666666",
        "dtLancamento": "2026-05-29",
        "tipo": "E",
        "valor": 100,
        "descricao": "Venda a vista 1001",
        "numerodoc": "1001"
      }
    ]
  }
}
```

## Venda a prazo

Para venda a prazo, envie a venda normalmente e tambem gere `contasReceber`. Se houver entrada no caixa, envie tambem `lancamentosCaixa`.

```json
{
  "json": {
    "dispositivo": "CAIXA-01",
    "versaoDelphi": "2.5.1",
    "vendas": [
      {
        "guidVenda": "77777777-7777-7777-7777-777777777777",
        "numeroVenda": "1002",
        "codFilial": 1,
        "guidCliente": "22222222-2222-2222-2222-222222222222",
        "cliente": "CLIENTE PRAZO",
        "documento": "12345678901",
        "dataVenda": "2026-05-29T11:00:00",
        "status": "FECHADA",
        "valorProdutos": 300,
        "valorTotal": 300,
        "notaModelo": "65",
        "notaStatus": "AUTORIZADA",
        "notaXml": "<nfeProc>...</nfeProc>"
      }
    ],
    "vendaItens": [
      {
        "guidVenda": "77777777-7777-7777-7777-777777777777",
        "codProduto": "002",
        "produto": "PRODUTO A PRAZO",
        "unidade": "UN",
        "quantidade": 1,
        "valorUnitario": 300,
        "valorTotal": 300
      }
    ],
    "vendaPagamentos": [
      {
        "guidVenda": "77777777-7777-7777-7777-777777777777",
        "formaPagamento": "CREDIARIO",
        "codigoSefaz": "05",
        "valor": 300,
        "parcelas": 3
      }
    ],
    "contasReceber": [
      {
        "guidLancamento": "88888888-8888-8888-8888-888888888881",
        "descricao": "Venda 1002 - Parcela 1/3",
        "guidDevedor": "22222222-2222-2222-2222-222222222222",
        "nomeDevedor": "CLIENTE PRAZO",
        "valor": 100,
        "valorRecebido": 0,
        "dtLancamento": "2026-05-29",
        "dtVencimento": "2026-06-29",
        "status": "ABERTO",
        "numerodoc": "1002-1"
      },
      {
        "guidLancamento": "88888888-8888-8888-8888-888888888882",
        "descricao": "Venda 1002 - Parcela 2/3",
        "guidDevedor": "22222222-2222-2222-2222-222222222222",
        "nomeDevedor": "CLIENTE PRAZO",
        "valor": 100,
        "valorRecebido": 0,
        "dtLancamento": "2026-05-29",
        "dtVencimento": "2026-07-29",
        "status": "ABERTO",
        "numerodoc": "1002-2"
      },
      {
        "guidLancamento": "88888888-8888-8888-8888-888888888883",
        "descricao": "Venda 1002 - Parcela 3/3",
        "guidDevedor": "22222222-2222-2222-2222-222222222222",
        "nomeDevedor": "CLIENTE PRAZO",
        "valor": 100,
        "valorRecebido": 0,
        "dtLancamento": "2026-05-29",
        "dtVencimento": "2026-08-29",
        "status": "ABERTO",
        "numerodoc": "1002-3"
      }
    ]
  }
}
```

## Lancamento avulso de caixa

Use para suprimento, sangria, ajuste ou recebimento que nao seja uma venda.

```json
{
  "json": {
    "dispositivo": "CAIXA-01",
    "versaoDelphi": "2.5.1",
    "lancamentosCaixa": [
      {
        "guidLancamento": "99999999-9999-9999-9999-999999999999",
        "dtLancamento": "2026-05-29",
        "tipo": "S",
        "valor": 50,
        "descricao": "Sangria do caixa",
        "numerodoc": "SANGRIA-001",
        "observacao": "Retirada para cofre"
      }
    ]
  }
}
```

## Fechamento do caixa

Envie o resumo do caixa em `fechamentosCaixa` e a conferencia por forma de pagamento em `fechamentosCaixaControle`.

```json
{
  "json": {
    "dispositivo": "CAIXA-01",
    "versaoDelphi": "2.5.1",
    "fechamentosCaixa": [
      {
        "guidFechamento": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "dispositivo": "CAIXA-01",
        "operador": "OPERADOR 1",
        "dataAbertura": "2026-05-29T08:00:00",
        "dataFechamento": "2026-05-29T18:00:00",
        "status": "FECHADO",
        "valorAbertura": 100,
        "totalVendas": 1000,
        "totalSuprimento": 50,
        "totalSangria": 200,
        "totalInformado": 950,
        "totalDiferenca": 0
      }
    ],
    "fechamentosCaixaControle": [
      {
        "guidFechamento": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "formaPagamento": "DINHEIRO",
        "codigoSefaz": "01",
        "valorSistema": 500,
        "valorInformado": 500,
        "diferenca": 0,
        "quantidade": 10
      },
      {
        "guidFechamento": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "formaPagamento": "PIX",
        "codigoSefaz": "17",
        "valorSistema": 450,
        "valorInformado": 450,
        "diferenca": 0,
        "quantidade": 8
      }
    ]
  }
}
```

## Pull seletivo

Para receber somente essas entidades:

```http
GET /api/trpc/syncDelphi.pull?input={"json":{"dispositivo":"CAIXA-01","entidades":["vendas","vendaItens","vendaPagamentos","notaFiscalEventos","fechamentosCaixa","fechamentosCaixaControle"]}}
```

Chaves aceitas em `entidades`:

```text
clientes
funcionarios
produtos
contasReceber
lancamentosCaixa
formasPagamento
planoContas
centroCusto
naturezaCaixa
conciliacaoParcelas
conciliacaoEventos
vendas
vendaItens
vendaPagamentos
notaFiscalEventos
fechamentosCaixa
fechamentosCaixaControle
```

Tambem continuam disponiveis as chaves antigas: `pessoas`, `contasPagar`, `contasReceberBoletos`, `contasReceberBoletoEventos` e `conciliacaoPagamentos`.

Exemplo para o Delphi receber somente cadastros basicos:

```http
GET /api/trpc/syncDelphi.pull?input={"json":{"dispositivo":"CAIXA-01","entidades":["produtos","clientes","funcionarios"]}}
```

Exemplo para o Delphi receber financeiro/configuracoes:

```http
GET /api/trpc/syncDelphi.pull?input={"json":{"dispositivo":"CAIXA-01","entidades":["contasReceber","lancamentosCaixa","formasPagamento","planoContas","centroCusto","naturezaCaixa","conciliacaoParcelas","conciliacaoEventos"]}}
```

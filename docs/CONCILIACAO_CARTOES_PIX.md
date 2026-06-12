# Conciliação de Cartões e PIX

## Visão geral

A conciliação foi adicionada ao módulo Financeiro para conferir recebimentos de cartão de crédito, cartão de débito e PIX contra banco, adquirente ou gateway.

A venda offline pode enviar os pagamentos para o ERP pelo sincronizador Delphi. A tela online consulta as parcelas pendentes, permite conciliar manualmente, marcar divergência, desfazer conciliação e exportar a consulta atual em CSV.

## Tabelas

Todas as tabelas usam `UNIQUEIDENTIFIER` como chave primária, compatível com replicação offline:

- `KS0003.KS00013`: cabeçalho do pagamento de cartão/PIX.
- `KS0003.KS00014`: parcelas/recebimentos previstos e conciliados.
- `KS0003.KS00015`: histórico e auditoria da conciliação.

Script de criação/verificação:

```bash
pnpm.cmd exec tsx add-conciliacao-cartoes-pix.ts
```

## Sincronização offline

O endpoint `syncDelphi.push` aceita:

- `conciliacaoPagamentos`
- `conciliacaoParcelas`
- `conciliacaoEventos`

O endpoint `syncDelphi.pull` retorna as mesmas entidades quando solicitadas no campo `entidades`.

Campos principais do pagamento:

- `guidPagamentoCartaoPix`
- `guidVenda`
- `guidLancamento`
- `guidPagamentoForma`
- `codFilial`
- `tipo`: `CREDITO`, `DEBITO` ou `PIX`
- `adquirente`
- `bandeira`
- `nsu`
- `autorizacao`
- `tid`
- `txid`
- `e2eId`
- `valorBruto`
- `parcelas`
- `dataVenda`
- `previsaoRecebimento`
- `status`

Campos principais da parcela:

- `guidParcela`
- `guidPagamentoCartaoPix`
- `numeroParcela`
- `valorBruto`
- `taxa`
- `valorLiquidoPrevisto`
- `valorRecebido`
- `diferenca`
- `dtPrevista`
- `dtRecebimento`
- `guidContaBancaria`
- `status`
- `motivoDivergencia`
- `observacao`

## Integração financeira

Ao conciliar uma parcela:

- A parcela recebe data de recebimento, taxa, valor líquido, conta bancária e status.
- O saldo da conta bancária é atualizado pelo valor líquido.
- Se houver `guidLancamento` vinculado em Contas a Receber, o título é atualizado como recebido/parcial usando o valor bruto recebido.
- A ação é gravada em `KS0003.KS00015`.

Ao desfazer:

- A parcela volta para `PENDENTE`.
- O saldo bancário é revertido quando havia conciliação.
- O contas a receber vinculado tem o valor recebido reduzido.
- Um evento de auditoria é gravado.

## Tela

Rota:

```text
/financeiro/conciliacao-cartoes-pix
```

Menu:

```text
Financeiro > Conciliação Cartões/PIX
```

Filtros disponíveis:

- período da venda
- período previsto de recebimento
- forma de pagamento
- adquirente/gateway
- bandeira
- status
- filial
- busca por cliente, venda, NSU, autorização, TXID ou E2E ID

O botão `Importar extrato` fica preparado para a próxima etapa de importação CSV/OFX ou APIs.

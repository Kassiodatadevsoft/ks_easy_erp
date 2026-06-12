# Conciliação Financeira

## Módulos

- Financeiro > Conciliação Bancária
- Financeiro > Importar Extrato OFX
- Financeiro > Importar CNAB
- Financeiro > Auditoria Financeira

## Tabelas

Todas as novas tabelas usam `UNIQUEIDENTIFIER` como chave primária:

- `KS0003.KS00016`: arquivos OFX importados.
- `KS0003.KS00017`: movimentos de extrato bancário.
- `KS0003.KS00018`: cabeçalho da conciliação bancária.
- `KS0003.KS00019`: vínculos entre extrato e lançamentos do sistema.
- `KS0003.KS00020`: arquivos CNAB importados.
- `KS0003.KS00021`: itens do retorno CNAB.
- `KS0003.KS00022`: auditoria financeira.
- `KS0003.KS00023`: divergências da conciliação.

Script:

```bash
pnpm.cmd exec tsx add-conciliacao-financeira.ts
```

## OFX

O arquivo é validado no frontend e enviado como texto para o backend. A importação:

- identifica banco, agência, conta, período e saldo final quando existirem no arquivo;
- lê créditos e débitos;
- evita duplicidade por `FITID` ou hash composto;
- grava movimentos como `PENDENTE`;
- registra auditoria.

## CNAB

A estrutura aceita CNAB 240 e CNAB 400. A importação:

- gera prévia dos registros;
- grava arquivo e itens de retorno;
- tenta localizar título em Contas a Receber por número do documento ou nosso número;
- em liquidação, atualiza o título como pago;
- registra auditoria e log da importação.

## Conciliação Bancária

Permite:

- conciliar um ou mais movimentos do extrato com um ou mais lançamentos do sistema;
- marcar movimento como ignorado;
- marcar divergência;
- desfazer status para pendente;
- criar lançamento de caixa a partir de um item de extrato;
- consultar sugestões por valor, data e documento.

## Auditoria

A auditoria registra:

- importação OFX;
- importação CNAB;
- conciliação bancária;
- desfazer conciliação;
- criação de lançamento via extrato;
- marcação de divergência/ignorado.

Campos principais:

- empresa/filial;
- usuário;
- data/hora;
- origem;
- ação;
- tabela afetada;
- GUID do registro;
- valor anterior;
- valor novo;
- observação.

# Guia de Integração Delphi — KS Easy ERP

**Versão:** 1.0.0 · **Data:** 2026-05-26 · **Compatibilidade:** Delphi 10.x ou superior

---

## Visão Geral

O KS Easy ERP expõe uma API REST de sincronização bidirecional que permite ao sistema Delphi (offline/local) trocar dados com o ERP na nuvem. A comunicação usa o protocolo **tRPC over HTTP/JSON**, mas a unit `KSEasyERPSync.pas` abstrai toda a complexidade — você só precisa instanciar a classe e chamar os métodos.

### Fluxo de Sincronização

```
Delphi (offline)                    KS Easy ERP (nuvem)
─────────────────                   ──────────────────────
1. Acumula registros locais
2. Sync.Push(lote)         ─────►   Upsert via MERGE SQL
3. Sync.Pull(entidades)    ◄─────   Delta desde último sync
4. Atualiza base local
5. Sync.Ack                ─────►   Confirma recebimento
```

---

## Configuração Inicial

### 1. Obter o API Key

Acesse o ERP → **Cadastros → Empresas** → selecione a empresa → copie o campo **"API Key de Integração"**.

> O API Key é único por empresa e deve ser armazenado de forma segura (ex: `TIniFile`, `TRegistry` com criptografia, ou variável de ambiente).

### 2. Adicionar a unit ao projeto

Copie `KSEasyERPSync.pas` para a pasta do seu projeto e adicione ao `uses`:

```delphi
uses
  KSEasyERPSync;
```

### 3. Dependências necessárias

A unit usa apenas units nativas do Delphi — **nenhuma biblioteca externa** é necessária:

| Unit | Finalidade |
|---|---|
| `System.Net.HttpClient` | Requisições HTTP/HTTPS |
| `System.JSON` | Serialização/deserialização JSON |
| `System.Net.URLClient` | Encoding de parâmetros de URL |
| `System.Generics.Collections` | Listas genéricas internas |

---

## Exemplos de Uso

### Verificar Conectividade

```delphi
procedure TFormPrincipal.BtnTestarConexaoClick(Sender: TObject);
var
  Sync: TKSEasyERPSync;
begin
  Sync := TKSEasyERPSync.Create(
    'https://seu-erp.manus.space',  // URL base do ERP
    'ks_live_abc123def456'          // API Key da empresa
  );
  try
    if Sync.Info then
      ShowMessage('Conectado! Último sync: ' + Sync.UltimoSync)
    else
      ShowMessage('Falha na conexão.');
  except
    on E: Exception do
      ShowMessage('Erro: ' + E.Message);
  end;
  Sync.Free;
end;
```

---

### Push — Enviar Dados para o ERP

O método `Push` envia um lote de registros de uma vez. Você adiciona itens às filas e chama `Push` ao final.

```delphi
procedure TFormSync.EnviarDadosParaERP;
var
  Sync   : TKSEasyERPSync;
  Result : TKSResultadoPush;
  i      : Integer;
begin
  Sync := TKSEasyERPSync.Create(
    'https://seu-erp.manus.space',
    'ks_live_abc123def456',
    'CAIXA-01',   // Nome do dispositivo/terminal
    '2.5.1'       // Versão do sistema Delphi
  );
  try
    // ── Adicionar clientes/fornecedores ──
    Sync.AdicionarPessoa(
      'João da Silva',           // Nome
      '123.456.789-00',          // CPF/CNPJ
      1,                         // TipoDoc: 1=CPF, 2=CNPJ
      'João Silva',              // Fantasia (opcional)
      '{guid-do-cliente}',       // GuidPessoa (vazio = novo)
      True,                      // É cliente
      False                      // É fornecedor
    );

    // ── Adicionar contas a receber (vendas) ──
    Sync.AdicionarContaReceber(
      'Venda #1001 - Produto A',  // Descrição
      'João da Silva',            // Nome do devedor
      1500.00,                    // Valor total
      '2026-05-26',               // Data do lançamento
      '2026-06-10',               // Data de vencimento
      '{guid-da-venda}',          // GuidLancamento (vazio = novo)
      '{guid-do-cliente}',        // GuidDevedor (opcional)
      'NF-001001',                // Número do documento
      0.00,                       // Valor já recebido
      'ABERTO'                    // Status
    );

    // ── Adicionar contas a pagar (compras) ──
    Sync.AdicionarContaPagar(
      'Compra de Mercadoria #501',
      'Fornecedor ABC Ltda',
      3200.00,
      '2026-05-26',
      '2026-06-15',
      '',           // GuidLancamento vazio = gera novo GUID
      '',           // GuidCredor vazio = sem vínculo
      'NF-000501'
    );

    // ── Adicionar lançamentos de caixa ──
    Sync.AdicionarLancamentoCaixa(
      'Recebimento à vista - Venda #1001',
      'E',           // 'E'=Entrada, 'S'=Saída
      1500.00,
      '2026-05-26',
      'REC-001001'
    );

    Sync.AdicionarLancamentoCaixa(
      'Pagamento Fornecedor ABC',
      'S',
      3200.00,
      '2026-05-26'
    );

    // ── Executar o push ──
    Result := Sync.Push;

    if Result.Sucesso then
    begin
      ShowMessage(Format(
        'Sync concluído em %s' + #13 +
        'Pessoas: %d inseridas, %d atualizadas' + #13 +
        'Contas a Receber: %d' + #13 +
        'Contas a Pagar: %d' + #13 +
        'Lançamentos de Caixa: %d',
        [Result.SyncedAt,
         Result.PessoasInseridas, Result.PessoasAtualizadas,
         Result.ReceberInseridos,
         Result.PagarInseridos,
         Result.CaixaInseridos]
      ));

      // Verificar erros parciais
      if Length(Result.PessoasErros) > 0 then
        for i := 0 to High(Result.PessoasErros) do
          LogErro('Pessoa: ' + Result.PessoasErros[i]);
    end;

  finally
    Sync.Free;
  end;
end;
```

---

### Pull — Buscar Alterações do ERP

O método `Pull` retorna apenas os registros alterados **desde o último sync** (delta incremental). Na primeira execução, retorna todos os registros.

```delphi
procedure TFormSync.BuscarAlteracoesDoERP;
var
  Sync     : TKSEasyERPSync;
  Pessoas  : TJSONArray;
  Receber  : TJSONArray;
  Pagar    : TJSONArray;
  Plano    : TJSONArray;
  i        : Integer;
  Obj      : TJSONObject;
begin
  Sync := TKSEasyERPSync.Create(
    'https://seu-erp.manus.space',
    'ks_live_abc123def456',
    'CAIXA-01'
  );
  try
    // Solicitar delta de múltiplas entidades
    if Sync.Pull(['pessoas', 'contasReceber', 'contasPagar',
                  'planoContas', 'centroCusto', 'naturezaCaixa',
                  'formasPagamento']) then
    begin
      // ── Processar Pessoas ──
      Pessoas := Sync.DeltaPessoas;
      if Pessoas <> nil then
        for i := 0 to Pessoas.Count - 1 do
        begin
          Obj := Pessoas.Items[i] as TJSONObject;
          // Upsert na base local SQL Server
          AtualizarPessoaLocal(
            Obj.GetValue<string>('guidPessoa', ''),
            Obj.GetValue<string>('nome', ''),
            Obj.GetValue<string>('documento', ''),
            Obj.GetValue<Boolean>('cadCliente', False),
            Obj.GetValue<Boolean>('cadFornecedor', False)
          );
        end;

      // ── Processar Contas a Receber ──
      Receber := Sync.DeltaContasReceber;
      if Receber <> nil then
        for i := 0 to Receber.Count - 1 do
        begin
          Obj := Receber.Items[i] as TJSONObject;
          AtualizarContaReceberLocal(
            Obj.GetValue<string>('guidLancamento', ''),
            Obj.GetValue<string>('descricao', ''),
            Obj.GetValue<string>('nomeDevedor', ''),
            Obj.GetValue<Double>('valor', 0),
            Obj.GetValue<string>('dtVencimento', ''),
            Obj.GetValue<string>('status', 'ABERTO')
          );
        end;

      // ── Processar Plano de Contas ──
      Plano := Sync.DeltaPlanoContas;
      if Plano <> nil then
        for i := 0 to Plano.Count - 1 do
        begin
          Obj := Plano.Items[i] as TJSONObject;
          AtualizarPlanoContasLocal(
            Obj.GetValue<string>('guidConta', ''),
            Obj.GetValue<string>('codConta', ''),
            Obj.GetValue<string>('conta', ''),
            Obj.GetValue<string>('tipo', 'D')
          );
        end;

      // ── Confirmar recebimento ──
      Sync.Ack;

      ShowMessage(Format('Pull concluído. Próximo pull buscará apenas alterações após %s', [Sync.SyncedAt]));
    end;

  finally
    Sync.Free;
  end;
end;
```

---

### Sincronização Automática com Timer

Para sincronização periódica (ex: a cada 5 minutos):

```delphi
// No FormCreate:
procedure TFormPrincipal.FormCreate(Sender: TObject);
begin
  TimerSync.Interval := 5 * 60 * 1000; // 5 minutos em ms
  TimerSync.Enabled  := True;
end;

// No evento OnTimer:
procedure TFormPrincipal.TimerSyncTimer(Sender: TObject);
begin
  TimerSync.Enabled := False; // Evitar reentrada
  try
    TThread.CreateAnonymousThread(procedure
    begin
      try
        ExecutarSyncCompleto;
      except
        on E: Exception do
          TThread.Synchronize(nil, procedure
          begin
            StatusBar.SimpleText := 'Erro no sync: ' + E.Message;
          end);
      end;
      TThread.Synchronize(nil, procedure
      begin
        TimerSync.Enabled := True;
      end);
    end).Start;
  except
    TimerSync.Enabled := True;
  end;
end;

procedure TFormPrincipal.ExecutarSyncCompleto;
var
  Sync   : TKSEasyERPSync;
  Result : TKSResultadoPush;
begin
  Sync := TKSEasyERPSync.Create(
    ConfigERP.BaseURL,
    ConfigERP.ApiKey,
    GetComputerName,   // Usar nome do computador como dispositivo
    APP_VERSION
  );
  try
    // 1. Verificar conectividade
    if not Sync.Info then Exit;

    // 2. Coletar dados locais pendentes de envio
    ColetarVendasPendentes(Sync);
    ColetarRecebimentosPendentes(Sync);

    // 3. Push
    Result := Sync.Push;
    if Result.Sucesso then
      MarcarComoSincronizado;

    // 4. Pull de tabelas de configuração
    if Sync.Pull(['planoContas','centroCusto','naturezaCaixa','formasPagamento']) then
    begin
      AtualizarTabelasLocais(Sync);
      Sync.Ack;
    end;

    TThread.Synchronize(nil, procedure
    begin
      StatusBar.SimpleText := 'Último sync: ' + FormatDateTime('dd/mm/yyyy hh:nn', Now);
    end);
  finally
    Sync.Free;
  end;
end;
```

---

## Referência da API

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/trpc/syncDelphi.info` | Metadados da empresa e timestamps |
| `POST` | `/api/trpc/syncDelphi.push` | Enviar lote de registros |
| `GET` | `/api/trpc/syncDelphi.pull` | Buscar delta de alterações |
| `POST` | `/api/trpc/syncDelphi.ack` | Confirmar recebimento |

### Entidades disponíveis no Pull

| Chave | Tabela | Descrição |
|---|---|---|
| `pessoas` | `KS0002.KS00001` | Clientes, fornecedores, funcionários |
| `contasReceber` | `KS0003.KS00005` | Contas a receber (delta por `ULTIMAALTERACAO`) |
| `contasPagar` | `KS0003.KS00004` | Contas a pagar (delta por `ULTIMAALTERACAO`) |
| `lancamentosCaixa` | `KS0003.KS00010` | Lançamentos de caixa (delta) |
| `planoContas` | `KS0003.KS00001` | Plano de contas completo |
| `centroCusto` | `KS0003.KS00002` | Centros de custo completo |
| `naturezaCaixa` | `KS0003.KS00003` | Naturezas de caixa completo |
| `formasPagamento` | `KS0003.KS00006` | Formas de pagamento SEFAZ |

### Formato das Datas

Todas as datas são trocadas no formato `YYYY-MM-DD` (ISO 8601). Para converter no Delphi:

```delphi
// Data → string ISO
function DateToISO(ADate: TDate): string;
begin
  Result := FormatDateTime('yyyy-mm-dd', ADate);
end;

// String ISO → TDate
function ISOToDate(const AStr: string): TDate;
begin
  Result := EncodeDate(
    StrToInt(Copy(AStr, 1, 4)),
    StrToInt(Copy(AStr, 6, 2)),
    StrToInt(Copy(AStr, 9, 2))
  );
end;
```

---

## Tratamento de Erros

O `Push` retorna erros parciais por registro (não aborta o lote inteiro):

```delphi
Result := Sync.Push;

// Verificar erros por entidade
if Length(Result.PessoasErros) > 0 then
  for i := 0 to High(Result.PessoasErros) do
    GravarLog('ERRO_PESSOA: ' + Result.PessoasErros[i]);

if Length(Result.ReceberErros) > 0 then
  for i := 0 to High(Result.ReceberErros) do
    GravarLog('ERRO_RECEBER: ' + Result.ReceberErros[i]);
```

Erros de conectividade lançam `Exception` — sempre use `try..except`:

```delphi
try
  Result := Sync.Push;
except
  on E: EHTTPException do
    GravarLog('Erro HTTP: ' + E.Message);
  on E: Exception do
    GravarLog('Erro geral: ' + E.Message);
end;
```

---

## Segurança

- O API Key deve ser armazenado criptografado no cliente (ex: `TDPAPIEncrypt` do Windows DPAPI)
- Toda comunicação usa **HTTPS** — nunca use HTTP em produção
- O API Key pode ser regenerado no ERP a qualquer momento em caso de comprometimento
- Cada terminal/dispositivo deve usar um `Dispositivo` único para rastreamento independente de sync

---

## Arquivo da Unit

O arquivo `KSEasyERPSync.pas` está disponível em `/docs/KSEasyERPSync.pas` no repositório do projeto.

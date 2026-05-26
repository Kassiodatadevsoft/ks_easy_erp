unit KSEasyERPSync;

{
  ============================================================================
  KS Easy ERP — Unit de Sincronização Bidirecional
  ============================================================================
  Versão  : 1.0.0
  Autor   : KS Sistemas
  Data    : 2026-05-26
  Delphi  : 10.x ou superior (usa System.Net.HttpClient + System.JSON)

  DESCRIÇÃO
  ---------
  Esta unit encapsula toda a comunicação com a API REST do KS Easy ERP.
  O protocolo usa tRPC over HTTP/JSON — os endpoints são chamados via
  POST (mutations) ou GET (queries) em /api/trpc/<router>.<procedure>.

  AUTENTICAÇÃO
  ------------
  Todas as chamadas exigem o header:
    Authorization: Bearer <API_KEY>

  O API_KEY é o campo APIKEY da tabela KS0002.KS00001 da empresa.
  Para gerar/visualizar o API Key, acesse o ERP > Cadastros > Empresas
  e copie o campo "API Key de Integração".

  ENDPOINTS DISPONÍVEIS
  ---------------------
  GET  /api/trpc/syncDelphi.info   — Verifica conectividade e metadados
  POST /api/trpc/syncDelphi.push   — Envia lote de registros para o ERP
  GET  /api/trpc/syncDelphi.pull   — Busca delta de alterações desde último sync
  POST /api/trpc/syncDelphi.ack    — Confirma recebimento do pull

  USO BÁSICO
  ----------
  var
    Sync: TKSEasyERPSync;
  begin
    Sync := TKSEasyERPSync.Create('https://seu-erp.manus.space', 'SUA_API_KEY');
    try
      // 1. Verificar conectividade
      if Sync.Info then
        ShowMessage('Conectado: ' + Sync.UltimoSync);

      // 2. Enviar dados locais para o ERP (push)
      Sync.AdicionarContaReceber('Venda #1001', 'João Silva', 1500.00, '2026-05-26', '2026-06-10');
      Sync.Push;

      // 3. Buscar alterações do ERP (pull)
      Sync.Pull(['pessoas', 'contasReceber', 'contasPagar']);
      // Processar Sync.DeltaPessoas, Sync.DeltaContasReceber, etc.

      // 4. Confirmar recebimento
      Sync.Ack;
    finally
      Sync.Free;
    end;
  end;

  ============================================================================
}

interface

uses
  System.SysUtils, System.Classes, System.JSON,
  System.Net.HttpClient, System.Net.HttpClientComponent,
  System.Net.URLClient, System.Generics.Collections;

type
  // ── Tipos de dados ──────────────────────────────────────────────────────

  TKSPessoa = record
    GuidPessoa   : string;
    Nome         : string;
    Fantasia     : string;
    Documento    : string;
    TipoDoc      : Integer; // 1=CPF, 2=CNPJ
    Telefone     : string;
    Celular      : string;
    Email        : string;
    CEP          : string;
    Endereco     : string;
    Numero       : string;
    Bairro       : string;
    Complemento  : string;
    Cidade       : string;
    UF           : string;
    CadCliente   : Boolean;
    CadFornecedor: Boolean;
    Situacao     : string; // 'A' ou 'I'
    UltimaAlteracao: string;
  end;

  TKSContaReceber = record
    GuidLancamento : string;
    Descricao      : string;
    GuidDevedor    : string;
    NomeDevedor    : string;
    Valor          : Currency;
    ValorRecebido  : Currency;
    DtLancamento   : string; // YYYY-MM-DD
    DtVencimento   : string;
    DtRecebimento  : string;
    Status         : string; // ABERTO|PAGO|PARCIAL|CANCELADO
    NumerDoc       : string;
    Observacao     : string;
    UltimaAlteracao: string;
  end;

  TKSContaPagar = record
    GuidLancamento : string;
    Descricao      : string;
    GuidCredor     : string;
    NomeCredor     : string;
    Valor          : Currency;
    ValorPago      : Currency;
    DtLancamento   : string;
    DtVencimento   : string;
    DtPagamento    : string;
    Status         : string;
    NumerDoc       : string;
    Observacao     : string;
    UltimaAlteracao: string;
  end;

  TKSLancamentoCaixa = record
    GuidLancamento : string;
    DtLancamento   : string;
    Tipo           : string; // 'E'=Entrada, 'S'=Saída
    Valor          : Currency;
    Descricao      : string;
    NumerDoc       : string;
    Observacao     : string;
    UltimaAlteracao: string;
  end;

  TKSResultadoPush = record
    Sucesso           : Boolean;
    SyncedAt          : string;
    PessoasInseridas  : Integer;
    PessoasAtualizadas: Integer;
    PessoasErros      : TArray<string>;
    ReceberInseridos  : Integer;
    ReceberErros      : TArray<string>;
    PagarInseridos    : Integer;
    PagarErros        : TArray<string>;
    CaixaInseridos    : Integer;
    CaixaErros        : TArray<string>;
  end;

  // ── Classe principal ────────────────────────────────────────────────────

  TKSEasyERPSync = class
  private
    FBaseURL    : string;
    FApiKey     : string;
    FDispositivo: string;
    FVersao     : string;
    FUltimoSync : string;
    FSyncedAt   : string;

    // Filas de push
    FPessoas          : TList<TJSONObject>;
    FContasReceber    : TList<TJSONObject>;
    FContasPagar      : TList<TJSONObject>;
    FLancamentosCaixa : TList<TJSONObject>;

    // Resultados de pull
    FDeltaPessoas          : TJSONArray;
    FDeltaContasReceber    : TJSONArray;
    FDeltaContasPagar      : TJSONArray;
    FDeltaLancamentosCaixa : TJSONArray;
    FDeltaPlanoContas      : TJSONArray;
    FDeltaCentroCusto      : TJSONArray;
    FDeltaNaturezaCaixa    : TJSONArray;
    FDeltaFormasPagamento  : TJSONArray;

    function  FazerGet(const APath: string; const AParams: string = ''): TJSONObject;
    function  FazerPost(const APath: string; ABody: TJSONObject): TJSONObject;
    function  ExtrairData(AResp: TJSONObject): TJSONValue;
    procedure LimparDeltas;
    procedure LimparFilas;

  public
    constructor Create(const ABaseURL, AApiKey: string;
                       const ADispositivo: string = 'default';
                       const AVersao: string = '1.0.0');
    destructor Destroy; override;

    // ── Conectividade ──
    function Info: Boolean;

    // ── Métodos de adição à fila de push ──
    procedure AdicionarPessoa(const ANome, ADocumento: string;
                              ATipoDoc: Integer = 2;
                              const AFantasia: string = '';
                              const AGuidPessoa: string = '';
                              ACadCliente: Boolean = True;
                              ACadFornecedor: Boolean = False);

    procedure AdicionarContaReceber(const ADescricao, ANomeDevedor: string;
                                    AValor: Currency;
                                    const ADtLancamento, ADtVencimento: string;
                                    const AGuidLancamento: string = '';
                                    const AGuidDevedor: string = '';
                                    const ANumerDoc: string = '';
                                    AValorRecebido: Currency = 0;
                                    const AStatus: string = 'ABERTO');

    procedure AdicionarContaPagar(const ADescricao, ANomeCredor: string;
                                  AValor: Currency;
                                  const ADtLancamento, ADtVencimento: string;
                                  const AGuidLancamento: string = '';
                                  const AGuidCredor: string = '';
                                  const ANumerDoc: string = '';
                                  AValorPago: Currency = 0;
                                  const AStatus: string = 'ABERTO');

    procedure AdicionarLancamentoCaixa(const ADescricao: string;
                                       ATipo: string; // 'E' ou 'S'
                                       AValor: Currency;
                                       const ADtLancamento: string;
                                       const ANumerDoc: string = '');

    // ── Operações de sync ──
    function Push: TKSResultadoPush;
    function Pull(const AEntidades: array of string): Boolean;
    function Ack: Boolean;

    // ── Propriedades ──
    property UltimoSync : string read FUltimoSync;
    property SyncedAt   : string read FSyncedAt;

    property DeltaPessoas          : TJSONArray read FDeltaPessoas;
    property DeltaContasReceber    : TJSONArray read FDeltaContasReceber;
    property DeltaContasPagar      : TJSONArray read FDeltaContasPagar;
    property DeltaLancamentosCaixa : TJSONArray read FDeltaLancamentosCaixa;
    property DeltaPlanoContas      : TJSONArray read FDeltaPlanoContas;
    property DeltaCentroCusto      : TJSONArray read FDeltaCentroCusto;
    property DeltaNaturezaCaixa    : TJSONArray read FDeltaNaturezaCaixa;
    property DeltaFormasPagamento  : TJSONArray read FDeltaFormasPagamento;
  end;

implementation

{ TKSEasyERPSync }

constructor TKSEasyERPSync.Create(const ABaseURL, AApiKey: string;
  const ADispositivo: string; const AVersao: string);
begin
  inherited Create;
  FBaseURL     := ABaseURL.TrimRight(['/']);
  FApiKey      := AApiKey;
  FDispositivo := ADispositivo;
  FVersao      := AVersao;

  FPessoas           := TList<TJSONObject>.Create;
  FContasReceber     := TList<TJSONObject>.Create;
  FContasPagar       := TList<TJSONObject>.Create;
  FLancamentosCaixa  := TList<TJSONObject>.Create;

  FDeltaPessoas          := nil;
  FDeltaContasReceber    := nil;
  FDeltaContasPagar      := nil;
  FDeltaLancamentosCaixa := nil;
  FDeltaPlanoContas      := nil;
  FDeltaCentroCusto      := nil;
  FDeltaNaturezaCaixa    := nil;
  FDeltaFormasPagamento  := nil;
end;

destructor TKSEasyERPSync.Destroy;
begin
  LimparFilas;
  LimparDeltas;
  FPessoas.Free;
  FContasReceber.Free;
  FContasPagar.Free;
  FLancamentosCaixa.Free;
  inherited;
end;

procedure TKSEasyERPSync.LimparFilas;
var
  Obj: TJSONObject;
begin
  for Obj in FPessoas do Obj.Free;
  FPessoas.Clear;
  for Obj in FContasReceber do Obj.Free;
  FContasReceber.Clear;
  for Obj in FContasPagar do Obj.Free;
  FContasPagar.Clear;
  for Obj in FLancamentosCaixa do Obj.Free;
  FLancamentosCaixa.Clear;
end;

procedure TKSEasyERPSync.LimparDeltas;
begin
  FreeAndNil(FDeltaPessoas);
  FreeAndNil(FDeltaContasReceber);
  FreeAndNil(FDeltaContasPagar);
  FreeAndNil(FDeltaLancamentosCaixa);
  FreeAndNil(FDeltaPlanoContas);
  FreeAndNil(FDeltaCentroCusto);
  FreeAndNil(FDeltaNaturezaCaixa);
  FreeAndNil(FDeltaFormasPagamento);
end;

function TKSEasyERPSync.FazerGet(const APath: string; const AParams: string): TJSONObject;
var
  HTTP    : THTTPClient;
  Resp    : IHTTPResponse;
  URL     : string;
  RespStr : string;
begin
  Result := nil;
  HTTP := THTTPClient.Create;
  try
    HTTP.CustomHeaders['Authorization'] := 'Bearer ' + FApiKey;
    HTTP.CustomHeaders['Content-Type']  := 'application/json';
    HTTP.CustomHeaders['Accept']        := 'application/json';

    URL := FBaseURL + '/api/trpc/' + APath;
    if AParams <> '' then
      URL := URL + '?input=' + TNetEncoding.URL.Encode(AParams);

    Resp := HTTP.Get(URL);

    if Resp.StatusCode <> 200 then
      raise Exception.CreateFmt('HTTP %d: %s', [Resp.StatusCode, Resp.ContentAsString]);

    RespStr := Resp.ContentAsString;
    Result  := TJSONObject.ParseJSONValue(RespStr) as TJSONObject;
  finally
    HTTP.Free;
  end;
end;

function TKSEasyERPSync.FazerPost(const APath: string; ABody: TJSONObject): TJSONObject;
var
  HTTP      : THTTPClient;
  Resp      : IHTTPResponse;
  URL       : string;
  BodyStr   : string;
  BodyStream: TStringStream;
  RespStr   : string;
begin
  Result := nil;
  HTTP := THTTPClient.Create;
  try
    HTTP.CustomHeaders['Authorization'] := 'Bearer ' + FApiKey;
    HTTP.CustomHeaders['Content-Type']  := 'application/json';
    HTTP.CustomHeaders['Accept']        := 'application/json';

    URL     := FBaseURL + '/api/trpc/' + APath;
    BodyStr := '{"json":' + ABody.ToJSON + '}';

    BodyStream := TStringStream.Create(BodyStr, TEncoding.UTF8);
    try
      Resp := HTTP.Post(URL, BodyStream, nil, [TNameValuePair.Create('Content-Type', 'application/json')]);
    finally
      BodyStream.Free;
    end;

    if Resp.StatusCode <> 200 then
      raise Exception.CreateFmt('HTTP %d: %s', [Resp.StatusCode, Resp.ContentAsString]);

    RespStr := Resp.ContentAsString;
    Result  := TJSONObject.ParseJSONValue(RespStr) as TJSONObject;
  finally
    HTTP.Free;
  end;
end;

function TKSEasyERPSync.ExtrairData(AResp: TJSONObject): TJSONValue;
begin
  // tRPC retorna: {"result":{"data":{"json":{...}}}}
  Result := nil;
  if AResp = nil then Exit;
  try
    Result := AResp
      .GetValue<TJSONObject>('result')
      .GetValue<TJSONObject>('data')
      .GetValue('json');
  except
    Result := nil;
  end;
end;

// ── Info ────────────────────────────────────────────────────────────────────

function TKSEasyERPSync.Info: Boolean;
var
  Resp : TJSONObject;
  Data : TJSONValue;
begin
  Result := False;
  Resp   := FazerGet('syncDelphi.info');
  try
    Data := ExtrairData(Resp);
    if Data = nil then Exit;
    FUltimoSync := (Data as TJSONObject).GetValue<string>('lastSyncAt', '');
    Result := True;
  finally
    Resp.Free;
  end;
end;

// ── Adicionar à fila de push ────────────────────────────────────────────────

procedure TKSEasyERPSync.AdicionarPessoa(const ANome, ADocumento: string;
  ATipoDoc: Integer; const AFantasia, AGuidPessoa: string;
  ACadCliente, ACadFornecedor: Boolean);
var
  Obj: TJSONObject;
begin
  Obj := TJSONObject.Create;
  if AGuidPessoa <> '' then Obj.AddPair('guidPessoa', AGuidPessoa);
  Obj.AddPair('nome',          ANome);
  Obj.AddPair('fantasia',      AFantasia);
  Obj.AddPair('documento',     ADocumento);
  Obj.AddPair('tipodoc',       TJSONNumber.Create(ATipoDoc));
  Obj.AddPair('cadCliente',    TJSONBool.Create(ACadCliente));
  Obj.AddPair('cadFornecedor', TJSONBool.Create(ACadFornecedor));
  FPessoas.Add(Obj);
end;

procedure TKSEasyERPSync.AdicionarContaReceber(const ADescricao, ANomeDevedor: string;
  AValor: Currency; const ADtLancamento, ADtVencimento: string;
  const AGuidLancamento, AGuidDevedor, ANumerDoc: string;
  AValorRecebido: Currency; const AStatus: string);
var
  Obj: TJSONObject;
begin
  Obj := TJSONObject.Create;
  if AGuidLancamento <> '' then Obj.AddPair('guidLancamento', AGuidLancamento);
  if AGuidDevedor    <> '' then Obj.AddPair('guidDevedor',    AGuidDevedor);
  Obj.AddPair('descricao',    ADescricao);
  Obj.AddPair('nomeDevedor',  ANomeDevedor);
  Obj.AddPair('valor',        TJSONNumber.Create(AValor));
  Obj.AddPair('valorRecebido',TJSONNumber.Create(AValorRecebido));
  Obj.AddPair('dtLancamento', ADtLancamento);
  Obj.AddPair('dtVencimento', ADtVencimento);
  Obj.AddPair('status',       AStatus);
  if ANumerDoc <> '' then Obj.AddPair('numerodoc', ANumerDoc);
  FContasReceber.Add(Obj);
end;

procedure TKSEasyERPSync.AdicionarContaPagar(const ADescricao, ANomeCredor: string;
  AValor: Currency; const ADtLancamento, ADtVencimento: string;
  const AGuidLancamento, AGuidCredor, ANumerDoc: string;
  AValorPago: Currency; const AStatus: string);
var
  Obj: TJSONObject;
begin
  Obj := TJSONObject.Create;
  if AGuidLancamento <> '' then Obj.AddPair('guidLancamento', AGuidLancamento);
  if AGuidCredor     <> '' then Obj.AddPair('guidCredor',     AGuidCredor);
  Obj.AddPair('descricao',   ADescricao);
  Obj.AddPair('nomeCredor',  ANomeCredor);
  Obj.AddPair('valor',       TJSONNumber.Create(AValor));
  Obj.AddPair('valorPago',   TJSONNumber.Create(AValorPago));
  Obj.AddPair('dtLancamento',ADtLancamento);
  Obj.AddPair('dtVencimento',ADtVencimento);
  Obj.AddPair('status',      AStatus);
  if ANumerDoc <> '' then Obj.AddPair('numerodoc', ANumerDoc);
  FContasPagar.Add(Obj);
end;

procedure TKSEasyERPSync.AdicionarLancamentoCaixa(const ADescricao, ATipo: string;
  AValor: Currency; const ADtLancamento, ANumerDoc: string);
var
  Obj: TJSONObject;
begin
  Obj := TJSONObject.Create;
  Obj.AddPair('descricao',   ADescricao);
  Obj.AddPair('tipo',        ATipo);
  Obj.AddPair('valor',       TJSONNumber.Create(AValor));
  Obj.AddPair('dtLancamento',ADtLancamento);
  if ANumerDoc <> '' then Obj.AddPair('numerodoc', ANumerDoc);
  FLancamentosCaixa.Add(Obj);
end;

// ── Push ────────────────────────────────────────────────────────────────────

function TKSEasyERPSync.Push: TKSResultadoPush;
var
  Body       : TJSONObject;
  ArrPessoas : TJSONArray;
  ArrReceber : TJSONArray;
  ArrPagar   : TJSONArray;
  ArrCaixa   : TJSONArray;
  Obj        : TJSONObject;
  Resp       : TJSONObject;
  Data       : TJSONValue;
  Resultado  : TJSONObject;
  function GetInt(AObj: TJSONObject; const AKey: string): Integer;
  begin
    Result := AObj.GetValue<Integer>(AKey, 0);
  end;
begin
  FillChar(Result, SizeOf(Result), 0);

  Body := TJSONObject.Create;
  try
    Body.AddPair('dispositivo',  FDispositivo);
    Body.AddPair('versaoDelphi', FVersao);

    // Pessoas
    ArrPessoas := TJSONArray.Create;
    for Obj in FPessoas do ArrPessoas.Add(Obj.Clone as TJSONObject);
    Body.AddPair('pessoas', ArrPessoas);

    // Contas a Receber
    ArrReceber := TJSONArray.Create;
    for Obj in FContasReceber do ArrReceber.Add(Obj.Clone as TJSONObject);
    Body.AddPair('contasReceber', ArrReceber);

    // Contas a Pagar
    ArrPagar := TJSONArray.Create;
    for Obj in FContasPagar do ArrPagar.Add(Obj.Clone as TJSONObject);
    Body.AddPair('contasPagar', ArrPagar);

    // Lançamentos de Caixa
    ArrCaixa := TJSONArray.Create;
    for Obj in FLancamentosCaixa do ArrCaixa.Add(Obj.Clone as TJSONObject);
    Body.AddPair('lancamentosCaixa', ArrCaixa);

    Resp := FazerPost('syncDelphi.push', Body);
    try
      Data := ExtrairData(Resp);
      if Data = nil then Exit;

      Result.Sucesso   := (Data as TJSONObject).GetValue<Boolean>('success', False);
      Result.SyncedAt  := (Data as TJSONObject).GetValue<string>('syncedAt', '');
      FSyncedAt        := Result.SyncedAt;

      Resultado := (Data as TJSONObject).GetValue<TJSONObject>('resultado');
      if Resultado <> nil then
      begin
        Result.PessoasInseridas   := GetInt(Resultado.GetValue<TJSONObject>('pessoas'),          'inseridos');
        Result.PessoasAtualizadas := GetInt(Resultado.GetValue<TJSONObject>('pessoas'),          'atualizados');
        Result.ReceberInseridos   := GetInt(Resultado.GetValue<TJSONObject>('contasReceber'),    'inseridos');
        Result.PagarInseridos     := GetInt(Resultado.GetValue<TJSONObject>('contasPagar'),      'inseridos');
        Result.CaixaInseridos     := GetInt(Resultado.GetValue<TJSONObject>('lancamentosCaixa'), 'inseridos');
      end;
    finally
      Resp.Free;
    end;
  finally
    Body.Free;
    LimparFilas;
  end;
end;

// ── Pull ────────────────────────────────────────────────────────────────────

function TKSEasyERPSync.Pull(const AEntidades: array of string): Boolean;
var
  InputObj  : TJSONObject;
  ArrEnt    : TJSONArray;
  Ent       : string;
  InputJSON : string;
  Resp      : TJSONObject;
  Data      : TJSONValue;
  DeltaObj  : TJSONObject;
begin
  Result := False;
  LimparDeltas;

  InputObj := TJSONObject.Create;
  try
    InputObj.AddPair('dispositivo', FDispositivo);

    ArrEnt := TJSONArray.Create;
    for Ent in AEntidades do ArrEnt.Add(Ent);
    InputObj.AddPair('entidades', ArrEnt);

    InputJSON := '{"json":' + InputObj.ToJSON + '}';
  finally
    InputObj.Free;
  end;

  Resp := FazerGet('syncDelphi.pull', InputJSON);
  try
    Data := ExtrairData(Resp);
    if Data = nil then Exit;

    Result   := (Data as TJSONObject).GetValue<Boolean>('success', False);
    FSyncedAt := (Data as TJSONObject).GetValue<string>('syncedAt', '');

    DeltaObj := (Data as TJSONObject).GetValue<TJSONObject>('delta');
    if DeltaObj = nil then Exit;

    // Clonar arrays para uso externo
    if DeltaObj.GetValue('pessoas')           <> nil then FDeltaPessoas          := DeltaObj.GetValue<TJSONArray>('pessoas').Clone           as TJSONArray;
    if DeltaObj.GetValue('contasReceber')     <> nil then FDeltaContasReceber    := DeltaObj.GetValue<TJSONArray>('contasReceber').Clone     as TJSONArray;
    if DeltaObj.GetValue('contasPagar')       <> nil then FDeltaContasPagar      := DeltaObj.GetValue<TJSONArray>('contasPagar').Clone       as TJSONArray;
    if DeltaObj.GetValue('lancamentosCaixa')  <> nil then FDeltaLancamentosCaixa := DeltaObj.GetValue<TJSONArray>('lancamentosCaixa').Clone  as TJSONArray;
    if DeltaObj.GetValue('planoContas')       <> nil then FDeltaPlanoContas      := DeltaObj.GetValue<TJSONArray>('planoContas').Clone       as TJSONArray;
    if DeltaObj.GetValue('centroCusto')       <> nil then FDeltaCentroCusto      := DeltaObj.GetValue<TJSONArray>('centroCusto').Clone       as TJSONArray;
    if DeltaObj.GetValue('naturezaCaixa')     <> nil then FDeltaNaturezaCaixa    := DeltaObj.GetValue<TJSONArray>('naturezaCaixa').Clone     as TJSONArray;
    if DeltaObj.GetValue('formasPagamento')   <> nil then FDeltaFormasPagamento  := DeltaObj.GetValue<TJSONArray>('formasPagamento').Clone   as TJSONArray;
  finally
    Resp.Free;
  end;
end;

// ── Ack ─────────────────────────────────────────────────────────────────────

function TKSEasyERPSync.Ack: Boolean;
var
  Body : TJSONObject;
  Resp : TJSONObject;
  Data : TJSONValue;
begin
  Result := False;
  Body   := TJSONObject.Create;
  try
    Body.AddPair('dispositivo', FDispositivo);
    Body.AddPair('syncedAt',    FSyncedAt);

    Resp := FazerPost('syncDelphi.ack', Body);
    try
      Data   := ExtrairData(Resp);
      Result := (Data <> nil) and (Data as TJSONObject).GetValue<Boolean>('success', False);
    finally
      Resp.Free;
    end;
  finally
    Body.Free;
  end;
end;

end.

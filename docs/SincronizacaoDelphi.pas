unit UKsSyncManager;

{
  ============================================================================
  KS Easy ERP — Módulo de Sincronização Offline
  ============================================================================
  Descrição:
    Funções para comunicar o sistema Delphi (offline) com o servidor Node.js
    (online). Utiliza o endpoint tRPC /api/trpc/sync.baixar via HTTP GET com
    autenticação Basic Auth (USUARIO:SENHA em Base64).

  Fluxo de sincronização:
    1. Delphi chama SincronizarDoServidor(GUIDENTIDADE, ULTIMAALTERACAO)
    2. Servidor retorna JSON com registros alterados de cada tabela
    3. Delphi faz MERGE nas tabelas locais (INSERT ou UPDATE por GUID)

  Dependências:
    - Indy (TIdHTTP) — já incluído no Delphi
    - SuperObject ou System.JSON (para parsear JSON)
    - Tabelas locais: KS00001_LOCAL, KS00007_LOCAL, KS00005_LOCAL

  Configuração:
    - URL_SERVIDOR: URL base do sistema web (ex: https://xxx.manus.space)
    - USUARIO_SYNC: usuário cadastrado no sistema com CADUSUARIO=1
    - SENHA_SYNC: senha do usuário acima
  ============================================================================
}

interface

uses
  System.SysUtils, System.Classes, System.DateUtils, System.NetEncoding,
  System.JSON,
  IdHTTP, IdSSLOpenSSL,
  Data.DB, ADODB;

const
  // ── Configuração do servidor ──────────────────────────────────────────────
  URL_SERVIDOR   = 'https://SEU-PROJETO.manus.space'; // ← altere para a URL real
  USUARIO_SYNC   = 'DATADEV';   // ← usuário com CADUSUARIO=1 no sistema web
  SENHA_SYNC     = 'SUASENHA';  // ← senha do usuário acima

type
  TKsSyncResult = record
    Sucesso: Boolean;
    Mensagem: string;
    TotalPessoas: Integer;
    TotalCargos: Integer;
    TotalCidades: Integer;
    Timestamp: TDateTime;
  end;

// ── Funções públicas ──────────────────────────────────────────────────────────
function SincronizarDoServidor(
  const GuidEntidade: string;
  const UltimaAlteracao: TDateTime; // passar 0 para sync completa
  ADOConnection: TADOConnection
): TKsSyncResult;

function TestarConexao: Boolean;

implementation

// ─────────────────────────────────────────────────────────────────────────────
// Gera o header Basic Auth: "Basic " + Base64(USUARIO:SENHA)
// ─────────────────────────────────────────────────────────────────────────────
function GerarBasicAuth: string;
var
  Credencial: string;
begin
  Credencial := USUARIO_SYNC + ':' + SENHA_SYNC;
  Result := 'Basic ' + TNetEncoding.Base64.Encode(Credencial);
end;

// ─────────────────────────────────────────────────────────────────────────────
// Converte TDateTime para ISO 8601 UTC (ex: "2026-05-25T18:00:00.000Z")
// ─────────────────────────────────────────────────────────────────────────────
function DateTimeToISO8601(const DT: TDateTime): string;
begin
  if DT = 0 then
    Result := ''
  else
    Result := FormatDateTime('yyyy-mm-dd"T"hh:nn:ss".000Z"', DT);
end;

// ─────────────────────────────────────────────────────────────────────────────
// Faz MERGE de um registro de pessoa na tabela local KS00001_LOCAL
// ─────────────────────────────────────────────────────────────────────────────
procedure MergePessoa(ADOConn: TADOConnection; Obj: TJSONObject);
var
  Q: TADOQuery;
  GuidPessoa: string;
begin
  GuidPessoa := Obj.GetValue<string>('GUIDPESSOA', '');
  if GuidPessoa = '' then Exit;

  Q := TADOQuery.Create(nil);
  try
    Q.Connection := ADOConn;

    // Verifica se já existe
    Q.SQL.Text := 'SELECT COUNT(*) AS CNT FROM KS00001_LOCAL WHERE GUIDPESSOA = :GUID';
    Q.Parameters.ParamByName('GUID').Value := GuidPessoa;
    Q.Open;

    if Q.FieldByName('CNT').AsInteger > 0 then
    begin
      // UPDATE
      Q.Close;
      Q.SQL.Text :=
        'UPDATE KS00001_LOCAL SET ' +
        '  NOME = :NOME, FANTASIA = :FANTASIA, DOCUMENTO = :DOC, ' +
        '  CODTIPODOCUMENTO = :CODTIPO, TELEFONE = :TEL, CELULAR = :CEL, ' +
        '  WHATSAPP = :WA, EMAIL = :EMAIL, IE = :IE, ' +
        '  CEP = :CEP, ENDERECO = :END, NUMERO = :NUM, ' +
        '  COMPLEMENTO = :COMP, BAIRRO = :BAIRRO, CODCIDADE = :CODCID, ' +
        '  SITUACAO = :SIT, CADCLIENTE = :CADCLI, CADFORNECEDOR = :CADFOR, ' +
        '  CADUSUARIO = :CADUSU, CADTRANSPORTADORA = :CADTRA, CADEMPRESA = :CADEMP, ' +
        '  LIMITECOMPRA = :LIMCOM, DIAVENCIMENTO = :DIAVENC, ' +
        '  COSEGMENTO = :COSEG, DATAADMISSAO = :DTADM, DATADEMISSAO = :DTDEM, ' +
        '  VALORNEGOCIADO = :VALNEG, VALORSALARIO = :VALSAL, MENSALIDADE = :MENSAL, ' +
        '  CODCARGO = :CODCAR, USUARIO = :USU, ' +
        '  ULTIMAALTERACAO = :ULTALT ' +
        'WHERE GUIDPESSOA = :GUID';
    end
    else
    begin
      // INSERT
      Q.Close;
      Q.SQL.Text :=
        'INSERT INTO KS00001_LOCAL (' +
        '  GUIDPESSOA, GUIDENTIDADE, CODIGO, NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO, ' +
        '  TELEFONE, CELULAR, WHATSAPP, EMAIL, IE, ' +
        '  CEP, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CODCIDADE, ' +
        '  SITUACAO, CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA, ' +
        '  LIMITECOMPRA, DIAVENCIMENTO, COSEGMENTO, DATAADMISSAO, DATADEMISSAO, ' +
        '  VALORNEGOCIADO, VALORSALARIO, MENSALIDADE, CODCARGO, USUARIO, ' +
        '  DATACADASTRO, ULTIMAALTERACAO ' +
        ') VALUES (' +
        '  :GUID, :GUIDIDENT, :CODIGO, :NOME, :FANTASIA, :DOC, :CODTIPO, ' +
        '  :TEL, :CEL, :WA, :EMAIL, :IE, ' +
        '  :CEP, :END, :NUM, :COMP, :BAIRRO, :CODCID, ' +
        '  :SIT, :CADCLI, :CADFOR, :CADUSU, :CADTRA, :CADEMP, ' +
        '  :LIMCOM, :DIAVENC, :COSEG, :DTADM, :DTDEM, ' +
        '  :VALNEG, :VALSAL, :MENSAL, :CODCAR, :USU, ' +
        '  :DTCAD, :ULTALT ' +
        ')';
      Q.Parameters.ParamByName('GUIDIDENT').Value := Obj.GetValue<string>('GUIDENTIDADE', '');
      Q.Parameters.ParamByName('CODIGO').Value    := Obj.GetValue<Integer>('CODIGO', 0);
      Q.Parameters.ParamByName('DTCAD').Value     := Obj.GetValue<string>('DATACADASTRO', '');
    end;

    // Parâmetros comuns ao INSERT e UPDATE
    Q.Parameters.ParamByName('GUID').Value    := GuidPessoa;
    Q.Parameters.ParamByName('NOME').Value    := Obj.GetValue<string>('NOME', '');
    Q.Parameters.ParamByName('FANTASIA').Value := Obj.GetValue<string>('FANTASIA', '');
    Q.Parameters.ParamByName('DOC').Value     := Obj.GetValue<string>('DOCUMENTO', '');
    Q.Parameters.ParamByName('CODTIPO').Value := Obj.GetValue<string>('CODTIPODOCUMENTO', 'J');
    Q.Parameters.ParamByName('TEL').Value     := Obj.GetValue<string>('TELEFONE', '');
    Q.Parameters.ParamByName('CEL').Value     := Obj.GetValue<string>('CELULAR', '');
    Q.Parameters.ParamByName('WA').Value      := Obj.GetValue<string>('WHATSAPP', '');
    Q.Parameters.ParamByName('EMAIL').Value   := Obj.GetValue<string>('EMAIL', '');
    Q.Parameters.ParamByName('IE').Value      := Obj.GetValue<string>('IE', '');
    Q.Parameters.ParamByName('CEP').Value     := Obj.GetValue<string>('CEP', '');
    Q.Parameters.ParamByName('END').Value     := Obj.GetValue<string>('ENDERECO', '');
    Q.Parameters.ParamByName('NUM').Value     := Obj.GetValue<string>('NUMERO', '');
    Q.Parameters.ParamByName('COMP').Value    := Obj.GetValue<string>('COMPLEMENTO', '');
    Q.Parameters.ParamByName('BAIRRO').Value  := Obj.GetValue<string>('BAIRRO', '');
    Q.Parameters.ParamByName('CODCID').Value  := Obj.GetValue<Integer>('CODCIDADE', 0);
    Q.Parameters.ParamByName('SIT').Value     := Obj.GetValue<string>('SITUACAO', 'A');
    Q.Parameters.ParamByName('CADCLI').Value  := Obj.GetValue<Integer>('CADCLIENTE', 0);
    Q.Parameters.ParamByName('CADFOR').Value  := Obj.GetValue<Integer>('CADFORNECEDOR', 0);
    Q.Parameters.ParamByName('CADUSU').Value  := Obj.GetValue<Integer>('CADUSUARIO', 0);
    Q.Parameters.ParamByName('CADTRA').Value  := Obj.GetValue<Integer>('CADTRANSPORTADORA', 0);
    Q.Parameters.ParamByName('CADEMP').Value  := Obj.GetValue<Integer>('CADEMPRESA', 0);
    Q.Parameters.ParamByName('LIMCOM').Value  := Obj.GetValue<Double>('LIMITECOMPRA', 0);
    Q.Parameters.ParamByName('DIAVENC').Value := Obj.GetValue<Integer>('DIAVENCIMENTO', 0);
    Q.Parameters.ParamByName('COSEG').Value   := Obj.GetValue<Integer>('COSEGMENTO', 0);
    Q.Parameters.ParamByName('DTADM').Value   := Obj.GetValue<string>('DATAADMISSAO', '');
    Q.Parameters.ParamByName('DTDEM').Value   := Obj.GetValue<string>('DATADEMISSAO', '');
    Q.Parameters.ParamByName('VALNEG').Value  := Obj.GetValue<Double>('VALORNEGOCIADO', 0);
    Q.Parameters.ParamByName('VALSAL').Value  := Obj.GetValue<Double>('VALORSALARIO', 0);
    Q.Parameters.ParamByName('MENSAL').Value  := Obj.GetValue<Integer>('MENSALIDADE', 1);
    Q.Parameters.ParamByName('CODCAR').Value  := Obj.GetValue<Integer>('CODCARGO', 0);
    Q.Parameters.ParamByName('USU').Value     := Obj.GetValue<string>('USUARIO', '');
    Q.Parameters.ParamByName('ULTALT').Value  := Obj.GetValue<string>('ULTIMAALTERACAO', '');

    Q.ExecSQL;
  finally
    Q.Free;
  end;
end;

// ─────────────────────────────────────────────────────────────────────────────
// Faz MERGE de um cargo na tabela local KS00007_LOCAL
// ─────────────────────────────────────────────────────────────────────────────
procedure MergeCargo(ADOConn: TADOConnection; Obj: TJSONObject);
var
  Q: TADOQuery;
  GuidCargo: string;
begin
  GuidCargo := Obj.GetValue<string>('GUIDCARGO', '');
  if GuidCargo = '' then Exit;

  Q := TADOQuery.Create(nil);
  try
    Q.Connection := ADOConn;
    Q.SQL.Text := 'SELECT COUNT(*) AS CNT FROM KS00007_LOCAL WHERE GUIDCARGO = :GUID';
    Q.Parameters.ParamByName('GUID').Value := GuidCargo;
    Q.Open;

    if Q.FieldByName('CNT').AsInteger > 0 then
    begin
      Q.Close;
      Q.SQL.Text :=
        'UPDATE KS00007_LOCAL SET ' +
        '  CARGO = :CARGO, DESCONTOMAXIMO = :DESC, CODTIPO = :CODTIPO, ' +
        '  SITUACAO = :SIT, ALTERARPRECOPRODUTO = :ALTPRE, ' +
        '  CODPAINEL = :CODPAI, COMISSAO = :COM, PDV = :PDV, ' +
        '  ULTIMAALTERACAO = :ULTALT ' +
        'WHERE GUIDCARGO = :GUID';
    end
    else
    begin
      Q.Close;
      Q.SQL.Text :=
        'INSERT INTO KS00007_LOCAL (' +
        '  GUIDCARGO, CODCARGO, CARGO, DESCONTOMAXIMO, CODTIPO, ' +
        '  SITUACAO, ALTERARPRECOPRODUTO, CODPAINEL, COMISSAO, PDV, ' +
        '  DATACADASTRO, ULTIMAALTERACAO ' +
        ') VALUES (' +
        '  :GUID, :CODCARGO, :CARGO, :DESC, :CODTIPO, ' +
        '  :SIT, :ALTPRE, :CODPAI, :COM, :PDV, ' +
        '  :DTCAD, :ULTALT ' +
        ')';
      Q.Parameters.ParamByName('CODCARGO').Value := Obj.GetValue<Integer>('CODCARGO', 0);
      Q.Parameters.ParamByName('DTCAD').Value    := Obj.GetValue<string>('DATACADASTRO', '');
    end;

    Q.Parameters.ParamByName('GUID').Value   := GuidCargo;
    Q.Parameters.ParamByName('CARGO').Value  := Obj.GetValue<string>('CARGO', '');
    Q.Parameters.ParamByName('DESC').Value   := Obj.GetValue<Double>('DESCONTOMAXIMO', 0);
    Q.Parameters.ParamByName('CODTIPO').Value := Obj.GetValue<Integer>('CODTIPO', 1);
    Q.Parameters.ParamByName('SIT').Value    := Obj.GetValue<string>('SITUACAO', 'A');
    Q.Parameters.ParamByName('ALTPRE').Value := Obj.GetValue<Integer>('ALTERARPRECOPRODUTO', 0);
    Q.Parameters.ParamByName('CODPAI').Value := Obj.GetValue<Integer>('CODPAINEL', 268);
    Q.Parameters.ParamByName('COM').Value    := Obj.GetValue<Double>('COMISSAO', 0);
    Q.Parameters.ParamByName('PDV').Value    := Obj.GetValue<Integer>('PDV', 0);
    Q.Parameters.ParamByName('ULTALT').Value := Obj.GetValue<string>('ULTIMAALTERACAO', '');

    Q.ExecSQL;
  finally
    Q.Free;
  end;
end;

// ─────────────────────────────────────────────────────────────────────────────
// Função principal: sincroniza dados do servidor para o banco local
// ─────────────────────────────────────────────────────────────────────────────
function SincronizarDoServidor(
  const GuidEntidade: string;
  const UltimaAlteracao: TDateTime;
  ADOConnection: TADOConnection
): TKsSyncResult;
var
  HTTP: TIdHTTP;
  SSL: TIdSSLIOHandlerSocketOpenSSL;
  URL, RespStr, UltAltISO: string;
  RespJSON, DadosObj: TJSONObject;
  PessoasArr, CargosArr: TJSONArray;
  I: Integer;
begin
  Result.Sucesso := False;
  Result.Mensagem := '';
  Result.TotalPessoas := 0;
  Result.TotalCargos := 0;
  Result.TotalCidades := 0;

  HTTP := TIdHTTP.Create(nil);
  SSL  := TIdSSLIOHandlerSocketOpenSSL.Create(nil);
  try
    // Configurar SSL
    SSL.SSLOptions.Method := sslvTLSv1_2;
    HTTP.IOHandler := SSL;
    HTTP.ConnectTimeout := 15000; // 15 segundos
    HTTP.ReadTimeout    := 60000; // 60 segundos

    // Autenticação Basic Auth
    HTTP.Request.CustomHeaders.Values['Authorization'] := GerarBasicAuth;
    HTTP.Request.Accept := 'application/json';

    // Montar URL do endpoint tRPC
    // Formato: /api/trpc/sync.baixar?input={"json":{"guidentidade":"...","ultimaAlteracao":"..."}}
    UltAltISO := DateTimeToISO8601(UltimaAlteracao);

    if UltAltISO <> '' then
      URL := Format(
        '%s/api/trpc/sync.baixar?input=%s',
        [URL_SERVIDOR,
         TNetEncoding.URL.Encode(
           Format('{"json":{"guidentidade":"%s","ultimaAlteracao":"%s"}}',
             [GuidEntidade, UltAltISO])
         )]
      )
    else
      URL := Format(
        '%s/api/trpc/sync.baixar?input=%s',
        [URL_SERVIDOR,
         TNetEncoding.URL.Encode(
           Format('{"json":{"guidentidade":"%s"}}', [GuidEntidade])
         )]
      );

    // Executar requisição GET
    RespStr := HTTP.Get(URL);

    // Parsear resposta JSON
    // Estrutura: {"result":{"data":{"json":{"timestamp":"...","dados":{...},"totais":{...}}}}}
    RespJSON := TJSONObject.ParseJSONValue(RespStr) as TJSONObject;
    if RespJSON = nil then
    begin
      Result.Mensagem := 'Resposta inválida do servidor.';
      Exit;
    end;

    try
      // Navegar até dados: result.data.json
      DadosObj := RespJSON
        .GetValue<TJSONObject>('result')
        .GetValue<TJSONObject>('data')
        .GetValue<TJSONObject>('json');

      // Processar pessoas
      PessoasArr := DadosObj
        .GetValue<TJSONObject>('dados')
        .GetValue<TJSONArray>('pessoas');

      ADOConnection.BeginTrans;
      try
        for I := 0 to PessoasArr.Count - 1 do
          MergePessoa(ADOConnection, PessoasArr.Items[I] as TJSONObject);

        // Processar cargos
        CargosArr := DadosObj
          .GetValue<TJSONObject>('dados')
          .GetValue<TJSONArray>('cargos');

        for I := 0 to CargosArr.Count - 1 do
          MergeCargo(ADOConnection, CargosArr.Items[I] as TJSONObject);

        ADOConnection.CommitTrans;
      except
        on E: Exception do
        begin
          ADOConnection.RollbackTrans;
          Result.Mensagem := 'Erro ao gravar dados locais: ' + E.Message;
          Exit;
        end;
      end;

      // Preencher resultado
      Result.Sucesso      := True;
      Result.TotalPessoas := DadosObj.GetValue<TJSONObject>('totais').GetValue<Integer>('pessoas');
      Result.TotalCargos  := DadosObj.GetValue<TJSONObject>('totais').GetValue<Integer>('cargos');
      Result.TotalCidades := DadosObj.GetValue<TJSONObject>('totais').GetValue<Integer>('cidades');
      Result.Timestamp    := Now;
      Result.Mensagem     := Format('Sync OK: %d pessoas, %d cargos',
        [Result.TotalPessoas, Result.TotalCargos]);

    finally
      RespJSON.Free;
    end;

  except
    on E: Exception do
      Result.Mensagem := 'Erro de conexão: ' + E.Message;
  end;

  HTTP.Free;
  SSL.Free;
end;

// ─────────────────────────────────────────────────────────────────────────────
// Testa a conectividade com o servidor
// ─────────────────────────────────────────────────────────────────────────────
function TestarConexao: Boolean;
var
  HTTP: TIdHTTP;
  SSL: TIdSSLIOHandlerSocketOpenSSL;
  RespStr: string;
begin
  Result := False;
  HTTP := TIdHTTP.Create(nil);
  SSL  := TIdSSLIOHandlerSocketOpenSSL.Create(nil);
  try
    SSL.SSLOptions.Method := sslvTLSv1_2;
    HTTP.IOHandler := SSL;
    HTTP.ConnectTimeout := 10000;
    HTTP.ReadTimeout    := 10000;
    HTTP.Request.CustomHeaders.Values['Authorization'] := GerarBasicAuth;

    RespStr := HTTP.Get(URL_SERVIDOR + '/api/trpc/sync.status?input={"json":{}}');
    Result := Pos('"online":true', RespStr) > 0;
  except
    Result := False;
  end;
  HTTP.Free;
  SSL.Free;
end;

end.

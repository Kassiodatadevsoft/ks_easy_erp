import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { ConnectionPool } from "mssql";
import type { KsSessionUser } from "../../shared/ksTypes";
import { getSqlPool, sql } from "../sqlserver";

export const LICENCAS_ADMIN_CNPJ = "50303631000158";

export type LicencaPayload = {
  idLicenca?: number;
  cnpj: string;
  codEntidade: number;
  guidPessoa: string;
  status: "A" | "I";
  dataInicio: string;
  dataValidade: string;
  diasTolerancia: number;
  qtdeTerminaisMax: number;
  bloqueado: boolean;
  motivoBloqueio?: string | null;
  modulos?: string[] | null;
};

export type LiberarTerminalPayload = {
  cnpj: string;
  hardwareId: string;
  nomeComputador?: string | null;
  usuarioWindows?: string | null;
  ip?: string | null;
};

export type ValidarTerminalPayload = {
  cnpj: string;
  hardwareId: string;
  token: string;
};

export type TerminalStatus = "ATIVO" | "BLOQUEADO" | "DESABILITADO";

export type LicencaAssinada = {
  empresaId: string;
  cnpj: string;
  hardwareId: string;
  status: "ATIVA" | "INATIVA" | "BLOQUEADA";
  validade: string;
  emitidaEm: string;
  ultimaComunicacao: string;
  toleranciaOfflineDias: number;
  modulos: string[];
  assinatura: string;
};

export function normalizeCnpj(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isLicencasAdmin(session: KsSessionUser | null | undefined) {
  return normalizeCnpj(session?.entDocumento) === LICENCAS_ADMIN_CNPJ;
}

export function assertLicencasAdmin(session: KsSessionUser | null | undefined) {
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  }
  if (!isLicencasAdmin(session)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso restrito ao Gerenciador de Licencas.",
    });
  }
}

export async function garantirTabelasLicencas(pool: ConnectionPool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.LICENCAS_EMPRESA', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LICENCAS_EMPRESA (
        IDLICENCA INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CNPJ VARCHAR(14) NOT NULL,
        CODENTIDADE INT NOT NULL,
        GUIDPESSOA UNIQUEIDENTIFIER NOT NULL,
        STATUS CHAR(1) NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_STATUS DEFAULT ('A'),
        DATA_INICIO DATE NOT NULL,
        DATA_VALIDADE DATE NOT NULL,
        DIAS_TOLERANCIA INT NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_TOLERANCIA DEFAULT (0),
        QTDE_TERMINAIS_MAX INT NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_QTDE DEFAULT (1),
        BLOQUEADO BIT NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_BLOQUEADO DEFAULT (0),
        MOTIVO_BLOQUEIO NVARCHAR(500) NULL,
        MODULOS NVARCHAR(MAX) NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_MODULOS DEFAULT ('[]'),
        DATA_ULTIMA_VALIDACAO DATETIME2 NULL
      );
      CREATE INDEX IX_LICENCAS_EMPRESA_CNPJ ON dbo.LICENCAS_EMPRESA (CNPJ);
      CREATE UNIQUE INDEX UX_LICENCAS_EMPRESA_CHAVE
        ON dbo.LICENCAS_EMPRESA (CNPJ, CODENTIDADE, GUIDPESSOA);
    END;

    IF OBJECT_ID('dbo.LICENCAS_TERMINAIS', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.LICENCAS_TERMINAIS (
        IDTERMINAL INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        IDLICENCA INT NOT NULL,
        HARDWARE_ID NVARCHAR(200) NOT NULL,
        NOME_COMPUTADOR NVARCHAR(150) NULL,
        USUARIO_WINDOWS NVARCHAR(150) NULL,
        IP NVARCHAR(45) NULL,
        TOKEN_LIBERACAO NVARCHAR(200) NOT NULL,
        DATA_LIBERACAO DATETIME2 NOT NULL CONSTRAINT DF_LICENCAS_TERMINAIS_LIBERACAO DEFAULT (SYSUTCDATETIME()),
        DATA_ULTIMA_VALIDACAO DATETIME2 NULL,
        STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_LICENCAS_TERMINAIS_STATUS DEFAULT ('ATIVO'),
        HASH_VALIDACAO NVARCHAR(128) NULL,
        BLOQUEADO BIT NOT NULL CONSTRAINT DF_LICENCAS_TERMINAIS_BLOQUEADO DEFAULT (0),
        MOTIVO_BLOQUEIO NVARCHAR(500) NULL,
        CONSTRAINT FK_LICENCAS_TERMINAIS_EMPRESA
          FOREIGN KEY (IDLICENCA) REFERENCES dbo.LICENCAS_EMPRESA(IDLICENCA)
      );
      CREATE UNIQUE INDEX UX_LICENCAS_TERMINAIS_HW
        ON dbo.LICENCAS_TERMINAIS (IDLICENCA, HARDWARE_ID);
    END;

    IF OBJECT_ID('dbo.LICENCAS_TERMINAIS', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('dbo.LICENCAS_TERMINAIS', 'STATUS') IS NULL
        ALTER TABLE dbo.LICENCAS_TERMINAIS ADD STATUS NVARCHAR(20) NOT NULL CONSTRAINT DF_LICENCAS_TERMINAIS_STATUS DEFAULT ('ATIVO') WITH VALUES;

      IF COL_LENGTH('dbo.LICENCAS_TERMINAIS', 'HASH_VALIDACAO') IS NULL
        ALTER TABLE dbo.LICENCAS_TERMINAIS ADD HASH_VALIDACAO NVARCHAR(128) NULL;

      EXEC(N'
        UPDATE dbo.LICENCAS_TERMINAIS
        SET STATUS = CASE WHEN ISNULL(BLOQUEADO, 0) = 1 THEN ''BLOQUEADO'' ELSE ISNULL(NULLIF(STATUS, ''''), ''ATIVO'') END
        WHERE STATUS IS NULL OR STATUS = '''' OR ISNULL(BLOQUEADO, 0) = 1
      ');
    END;

    IF OBJECT_ID('dbo.LICENCAS_EMPRESA', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('dbo.LICENCAS_EMPRESA', 'MODULOS') IS NULL
        ALTER TABLE dbo.LICENCAS_EMPRESA ADD MODULOS NVARCHAR(MAX) NOT NULL CONSTRAINT DF_LICENCAS_EMPRESA_MODULOS DEFAULT ('[]') WITH VALUES;
    END;
  `);
}

function tokenLiberacao() {
  return crypto.randomBytes(32).toString("hex");
}

function hashValidacao(params: { cnpj: string; hardwareId: string; token: string; dataUltValidacao: string }) {
  return crypto
    .createHash("sha256")
    .update(`${params.cnpj}|${params.hardwareId}|${params.token}|${params.dataUltValidacao}`)
    .digest("hex");
}

function dataIso(date: Date | string | null | undefined) {
  if (!date) return new Date().toISOString().slice(0, 10);
  return new Date(date).toISOString().slice(0, 10);
}

function statusLicencaLabel(status: string, bloqueado: boolean) {
  if (bloqueado) return "BLOQUEADA";
  return status === "A" ? "ATIVA" : "INATIVA";
}

function normalizarModulos(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean).sort();
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return normalizarModulos(parsed);
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean).sort();
  }
}

function getLicencaPrivateKey() {
  const raw = process.env.LICENCA_PRIVATE_KEY ?? "";
  const base64 = process.env.LICENCA_PRIVATE_KEY_BASE64 ?? "";
  const key = raw || (base64 ? Buffer.from(base64, "base64").toString("utf-8") : "");
  if (!key.trim()) {
    throw new Error("LICENCA_PRIVATE_KEY nao configurada no servidor.");
  }
  return key.replace(/\\n/g, "\n");
}

function canonicalLicencaPayload(payload: Omit<LicencaAssinada, "assinatura">) {
  return JSON.stringify({
    empresaId: payload.empresaId,
    cnpj: payload.cnpj,
    hardwareId: payload.hardwareId,
    status: payload.status,
    validade: payload.validade,
    emitidaEm: payload.emitidaEm,
    ultimaComunicacao: payload.ultimaComunicacao,
    toleranciaOfflineDias: payload.toleranciaOfflineDias,
    modulos: payload.modulos,
  });
}

function assinarLicenca(payload: Omit<LicencaAssinada, "assinatura">) {
  return crypto
    .createSign("RSA-SHA256")
    .update(canonicalLicencaPayload(payload))
    .end()
    .sign(getLicencaPrivateKey(), "base64");
}

function criarLicencaAssinada(params: {
  licenca: {
    CNPJ: string;
    CODENTIDADE: number;
    STATUS: string;
    DATA_INICIO: Date | string;
    DATA_VALIDADE: Date | string;
    DIAS_TOLERANCIA: number;
    BLOQUEADO: boolean;
    MODULOS?: string | null;
  };
  hardwareId: string;
  ultimaComunicacao?: Date | string;
}): LicencaAssinada {
  const payload = {
    empresaId: String(params.licenca.CODENTIDADE),
    cnpj: normalizeCnpj(params.licenca.CNPJ),
    hardwareId: params.hardwareId,
    status: statusLicencaLabel(params.licenca.STATUS, Boolean(params.licenca.BLOQUEADO)),
    validade: dataIso(params.licenca.DATA_VALIDADE),
    emitidaEm: dataIso(params.licenca.DATA_INICIO),
    ultimaComunicacao: dataIso(params.ultimaComunicacao ?? new Date()),
    toleranciaOfflineDias: Number(params.licenca.DIAS_TOLERANCIA ?? 0),
    modulos: normalizarModulos(params.licenca.MODULOS),
  } satisfies Omit<LicencaAssinada, "assinatura">;

  return {
    ...payload,
    assinatura: assinarLicenca(payload),
  };
}

function respostaNegada(mensagem: string) {
  return { autorizado: false, mensagem };
}

function respostaLiberada(params: {
  mensagem: string;
  licenca: { STATUS: string; BLOQUEADO: boolean; GUIDPESSOA: string; CODENTIDADE: number };
  terminal: { IDTERMINAL: number; HARDWARE_ID: string; TOKEN_LIBERACAO: string };
  dataUltValidacao: string;
  hash: string;
  licencaAssinada: LicencaAssinada;
}) {
  return {
    autorizado: true,
    mensagem: params.mensagem,
    guidPessoa: String(params.licenca.GUIDPESSOA),
    codChave: Number(params.terminal.IDTERMINAL),
    codEntidade: Number(params.licenca.CODENTIDADE),
    chave: params.terminal.HARDWARE_ID,
    liberacao: params.terminal.TOKEN_LIBERACAO,
    statusLicenca: statusLicencaLabel(params.licenca.STATUS, Boolean(params.licenca.BLOQUEADO)),
    dataUltValidacao: params.dataUltValidacao,
    hashValidacao: params.hash,
    ...params.licencaAssinada,
    licenca: params.licencaAssinada,
  };
}

function isDentroValidade(licenca: { DATA_VALIDADE: Date | string; DIAS_TOLERANCIA: number }) {
  const validade = new Date(licenca.DATA_VALIDADE);
  validade.setHours(23, 59, 59, 999);
  validade.setDate(validade.getDate() + Number(licenca.DIAS_TOLERANCIA ?? 0));
  return Date.now() <= validade.getTime();
}

export async function listarLicencas() {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  const r = await pool.request().query(`
    SELECT
      l.IDLICENCA AS idLicenca,
      l.CNPJ AS cnpj,
      l.CODENTIDADE AS codEntidade,
      CAST(l.GUIDPESSOA AS NVARCHAR(36)) AS guidPessoa,
      l.STATUS AS status,
      l.DATA_INICIO AS dataInicio,
      l.DATA_VALIDADE AS dataValidade,
      l.DIAS_TOLERANCIA AS diasTolerancia,
      l.MODULOS AS modulos,
      l.QTDE_TERMINAIS_MAX AS qtdeTerminaisMax,
      CAST(l.BLOQUEADO AS bit) AS bloqueado,
      l.MOTIVO_BLOQUEIO AS motivoBloqueio,
      l.DATA_ULTIMA_VALIDACAO AS dataUltimaValidacao,
      COUNT(t.IDTERMINAL) AS terminaisCadastrados,
      SUM(CASE WHEN ISNULL(t.STATUS, CASE WHEN ISNULL(t.BLOQUEADO, 0)=1 THEN 'BLOQUEADO' ELSE 'ATIVO' END) = 'ATIVO' THEN 1 ELSE 0 END) AS terminaisAtivos,
      SUM(CASE WHEN ISNULL(t.STATUS, CASE WHEN ISNULL(t.BLOQUEADO, 0)=1 THEN 'BLOQUEADO' ELSE 'ATIVO' END) = 'BLOQUEADO' THEN 1 ELSE 0 END) AS terminaisBloqueados,
      SUM(CASE WHEN ISNULL(t.STATUS, CASE WHEN ISNULL(t.BLOQUEADO, 0)=1 THEN 'BLOQUEADO' ELSE 'ATIVO' END) = 'DESABILITADO' THEN 1 ELSE 0 END) AS terminaisDesabilitados
    FROM dbo.LICENCAS_EMPRESA l
    LEFT JOIN dbo.LICENCAS_TERMINAIS t ON t.IDLICENCA = l.IDLICENCA
    GROUP BY l.IDLICENCA, l.CNPJ, l.CODENTIDADE, l.GUIDPESSOA, l.STATUS, l.DATA_INICIO,
      l.DATA_VALIDADE, l.DIAS_TOLERANCIA, l.MODULOS, l.QTDE_TERMINAIS_MAX, l.BLOQUEADO,
      l.MOTIVO_BLOQUEIO, l.DATA_ULTIMA_VALIDACAO
    ORDER BY l.CNPJ, l.CODENTIDADE
  `);
  return r.recordset;
}

export async function salvarLicenca(input: LicencaPayload) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  const cnpj = normalizeCnpj(input.cnpj);
  if (input.idLicenca) {
    await pool.request()
      .input("id", sql.Int, input.idLicenca)
      .input("cnpj", sql.VarChar(14), cnpj)
      .input("codentidade", sql.Int, input.codEntidade)
      .input("guidpessoa", sql.UniqueIdentifier, input.guidPessoa)
      .input("status", sql.Char(1), input.status)
      .input("dataInicio", sql.Date, input.dataInicio)
      .input("dataValidade", sql.Date, input.dataValidade)
      .input("diasTolerancia", sql.Int, input.diasTolerancia)
      .input("modulos", sql.NVarChar(sql.MAX), JSON.stringify(normalizarModulos(input.modulos)))
      .input("qtdeTerminaisMax", sql.Int, input.qtdeTerminaisMax)
      .input("bloqueado", sql.Bit, input.bloqueado ? 1 : 0)
      .input("motivoBloqueio", sql.NVarChar(500), input.motivoBloqueio ?? null)
      .query(`
        UPDATE dbo.LICENCAS_EMPRESA SET
          CNPJ=@cnpj, CODENTIDADE=@codentidade, GUIDPESSOA=@guidpessoa,
          STATUS=@status, DATA_INICIO=@dataInicio, DATA_VALIDADE=@dataValidade,
          DIAS_TOLERANCIA=@diasTolerancia, MODULOS=@modulos, QTDE_TERMINAIS_MAX=@qtdeTerminaisMax,
          BLOQUEADO=@bloqueado, MOTIVO_BLOQUEIO=@motivoBloqueio
        WHERE IDLICENCA=@id
      `);
    return { success: true, idLicenca: input.idLicenca };
  }

  const r = await pool.request()
    .input("cnpj", sql.VarChar(14), cnpj)
    .input("codentidade", sql.Int, input.codEntidade)
    .input("guidpessoa", sql.UniqueIdentifier, input.guidPessoa)
    .input("status", sql.Char(1), input.status)
    .input("dataInicio", sql.Date, input.dataInicio)
    .input("dataValidade", sql.Date, input.dataValidade)
    .input("diasTolerancia", sql.Int, input.diasTolerancia)
    .input("modulos", sql.NVarChar(sql.MAX), JSON.stringify(normalizarModulos(input.modulos)))
    .input("qtdeTerminaisMax", sql.Int, input.qtdeTerminaisMax)
    .input("bloqueado", sql.Bit, input.bloqueado ? 1 : 0)
    .input("motivoBloqueio", sql.NVarChar(500), input.motivoBloqueio ?? null)
    .query(`
      INSERT INTO dbo.LICENCAS_EMPRESA
        (CNPJ, CODENTIDADE, GUIDPESSOA, STATUS, DATA_INICIO, DATA_VALIDADE,
         DIAS_TOLERANCIA, MODULOS, QTDE_TERMINAIS_MAX, BLOQUEADO, MOTIVO_BLOQUEIO)
      OUTPUT INSERTED.IDLICENCA AS idLicenca
      VALUES
        (@cnpj, @codentidade, @guidpessoa, @status, @dataInicio, @dataValidade,
         @diasTolerancia, @modulos, @qtdeTerminaisMax, @bloqueado, @motivoBloqueio)
    `);
  return { success: true, idLicenca: r.recordset[0]?.idLicenca };
}

export async function listarTerminais(idLicenca: number) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  const r = await pool.request()
    .input("idLicenca", sql.Int, idLicenca)
    .query(`
      SELECT
        IDTERMINAL AS idTerminal,
        IDLICENCA AS idLicenca,
        HARDWARE_ID AS hardwareId,
        NOME_COMPUTADOR AS nomeComputador,
        USUARIO_WINDOWS AS usuarioWindows,
        IP AS ip,
        DATA_LIBERACAO AS dataLiberacao,
        DATA_ULTIMA_VALIDACAO AS dataUltimaValidacao,
        STATUS AS status,
        HASH_VALIDACAO AS hashValidacao,
        CAST(BLOQUEADO AS bit) AS bloqueado,
        MOTIVO_BLOQUEIO AS motivoBloqueio
      FROM dbo.LICENCAS_TERMINAIS
      WHERE IDLICENCA=@idLicenca
      ORDER BY DATA_LIBERACAO DESC
    `);
  return r.recordset;
}

export async function alterarBloqueioLicenca(idLicenca: number, bloqueado: boolean, motivo?: string | null) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  await pool.request()
    .input("idLicenca", sql.Int, idLicenca)
    .input("bloqueado", sql.Bit, bloqueado ? 1 : 0)
    .input("motivo", sql.NVarChar(500), bloqueado ? motivo ?? null : null)
    .query(`
      UPDATE dbo.LICENCAS_EMPRESA
      SET BLOQUEADO=@bloqueado, MOTIVO_BLOQUEIO=@motivo
      WHERE IDLICENCA=@idLicenca
    `);
  return { success: true };
}

export async function alterarBloqueioTerminal(idTerminal: number, bloqueado: boolean, motivo?: string | null) {
  return alterarStatusTerminal(idTerminal, bloqueado ? "BLOQUEADO" : "ATIVO", bloqueado ? motivo : null);
}

export async function alterarStatusTerminal(idTerminal: number, status: TerminalStatus, motivo?: string | null) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  if (status === "ATIVO") {
    const limiteR = await pool.request()
      .input("idTerminal", sql.Int, idTerminal)
      .query(`
        SELECT
          t.IDLICENCA,
          ISNULL(t.STATUS, CASE WHEN ISNULL(t.BLOQUEADO, 0)=1 THEN 'BLOQUEADO' ELSE 'ATIVO' END) AS statusAtual,
          l.QTDE_TERMINAIS_MAX AS limite,
          (
            SELECT COUNT(*)
            FROM dbo.LICENCAS_TERMINAIS ta
            WHERE ta.IDLICENCA=t.IDLICENCA
              AND ta.IDTERMINAL<>t.IDTERMINAL
              AND ta.STATUS='ATIVO'
          ) AS ativos
        FROM dbo.LICENCAS_TERMINAIS t
        INNER JOIN dbo.LICENCAS_EMPRESA l ON l.IDLICENCA=t.IDLICENCA
        WHERE t.IDTERMINAL=@idTerminal
      `);
    const limite = limiteR.recordset[0] as { statusAtual: string; limite: number; ativos: number } | undefined;
    if (!limite) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Terminal nao encontrado." });
    }
    if (limite.statusAtual !== "ATIVO" && Number(limite.ativos ?? 0) >= Number(limite.limite ?? 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Limite maximo de terminais ativos atingido." });
    }
  }
  await pool.request()
    .input("idTerminal", sql.Int, idTerminal)
    .input("status", sql.NVarChar(20), status)
    .input("bloqueado", sql.Bit, status === "BLOQUEADO" ? 1 : 0)
    .input("motivo", sql.NVarChar(500), status === "BLOQUEADO" ? motivo ?? null : null)
    .query(`
      UPDATE dbo.LICENCAS_TERMINAIS
      SET STATUS=@status, BLOQUEADO=@bloqueado, MOTIVO_BLOQUEIO=@motivo
      WHERE IDTERMINAL=@idTerminal
    `);
  return { success: true };
}

export async function removerTerminal(idTerminal: number) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  await pool.request()
    .input("idTerminal", sql.Int, idTerminal)
    .query("DELETE FROM dbo.LICENCAS_TERMINAIS WHERE IDTERMINAL=@idTerminal");
  return { success: true };
}

export async function renovarLicencaPorBoletoPago(idLicenca: number) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);

  const licencaR = await pool.request()
    .input("idLicenca", sql.Int, idLicenca)
    .query(`
      SELECT TOP 1
        IDLICENCA, CNPJ, CODENTIDADE, GUIDPESSOA, DATA_VALIDADE
      FROM dbo.LICENCAS_EMPRESA
      WHERE IDLICENCA=@idLicenca
    `);
  const licenca = licencaR.recordset[0] as {
    IDLICENCA: number;
    CNPJ: string;
    CODENTIDADE: number;
    GUIDPESSOA: string;
    DATA_VALIDADE: Date;
  } | undefined;
  if (!licenca) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Licenca nao encontrada." });
  }

  const pagamentoR = await pool.request()
    .input("guidPessoa", sql.UniqueIdentifier, licenca.GUIDPESSOA)
    .input("dataValidade", sql.Date, licenca.DATA_VALIDADE)
    .query(`
      SELECT TOP 1
        CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
        cr.DESCRICAO,
        cr.VALOR,
        cr.VALORRECEBIDO,
        cr.STATUS AS statusTitulo,
        cr.DTVENCIMENTO AS dtVencimento,
        cr.DTRECEBIMENTO AS dtRecebimento,
        b.STATUS AS statusBoleto
      FROM KS0003.KS00005 cr
      OUTER APPLY (
        SELECT TOP 1 STATUS
        FROM KS0003.KS00011
        WHERE GUIDLANCAMENTO = cr.GUIDLANCAMENTO
        ORDER BY DATACADASTRO DESC
      ) b
      WHERE cr.GUIDDEVEDOR=@guidPessoa
        AND CONVERT(DATE, cr.DTVENCIMENTO) >= DATEFROMPARTS(YEAR(@dataValidade), MONTH(@dataValidade), 1)
        AND CONVERT(DATE, cr.DTVENCIMENTO) <= EOMONTH(@dataValidade)
        AND (
          cr.STATUS='PAGO'
          OR ISNULL(b.STATUS, '')='PAGO'
          OR ISNULL(cr.VALORRECEBIDO, 0) >= ISNULL(cr.VALOR, 0)
        )
      ORDER BY cr.DTRECEBIMENTO DESC, cr.DTVENCIMENTO DESC
    `);
  const pagamento = pagamentoR.recordset[0] as
    | {
        guidLancamento: string;
        DESCRICAO: string;
        VALOR: number;
        VALORRECEBIDO: number;
        statusTitulo: string;
        dtVencimento: Date;
        dtRecebimento: Date | null;
        statusBoleto: string | null;
      }
    | undefined;

  if (!pagamento) {
    return {
      success: false,
      atualizado: false,
      message: "Nenhum boleto ou titulo pago foi encontrado para o mes da validade atual.",
    };
  }

  const updateR = await pool.request()
    .input("idLicenca", sql.Int, idLicenca)
    .query(`
      UPDATE dbo.LICENCAS_EMPRESA
      SET
        DATA_VALIDADE = CASE
          WHEN DATA_VALIDADE = EOMONTH(DATA_VALIDADE)
            THEN EOMONTH(DATEADD(MONTH, 1, DATA_VALIDADE))
          ELSE DATEADD(MONTH, 1, DATA_VALIDADE)
        END,
        BLOQUEADO = 0,
        MOTIVO_BLOQUEIO = NULL
      OUTPUT INSERTED.DATA_VALIDADE AS dataValidade
      WHERE IDLICENCA=@idLicenca
    `);

  return {
    success: true,
    atualizado: true,
    dataValidade: updateR.recordset[0]?.dataValidade,
    pagamento,
  };
}

export async function renovarTodasLicencasPorBoletoPago() {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);

  const licencasR = await pool.request().query(`
    SELECT IDLICENCA
    FROM dbo.LICENCAS_EMPRESA
    ORDER BY CNPJ, CODENTIDADE
  `);

  const resultados = [];
  for (const licenca of licencasR.recordset as Array<{ IDLICENCA: number }>) {
    try {
      const resultado = await renovarLicencaPorBoletoPago(licenca.IDLICENCA);
      resultados.push({ idLicenca: licenca.IDLICENCA, ...resultado });
    } catch (error) {
      resultados.push({
        idLicenca: licenca.IDLICENCA,
        success: false,
        atualizado: false,
        message: error instanceof Error ? error.message : "Erro ao renovar licenca.",
      });
    }
  }

  const renovadas = resultados.filter((item) => item.atualizado).length;
  return {
    success: true,
    total: resultados.length,
    renovadas,
    naoRenovadas: resultados.length - renovadas,
    resultados,
  };
}

export async function liberarTerminal(input: LiberarTerminalPayload) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  const cnpj = normalizeCnpj(input.cnpj);
  const hardwareId = input.hardwareId.trim();

  const licencaR = await pool.request()
    .input("cnpj", sql.VarChar(14), cnpj)
    .query(`
      SELECT TOP 1
        IDLICENCA, CNPJ, CODENTIDADE, CAST(GUIDPESSOA AS NVARCHAR(36)) AS GUIDPESSOA,
        STATUS, DATA_INICIO, DATA_VALIDADE, DIAS_TOLERANCIA, MODULOS, QTDE_TERMINAIS_MAX,
        CAST(BLOQUEADO AS bit) AS BLOQUEADO, MOTIVO_BLOQUEIO
      FROM dbo.LICENCAS_EMPRESA
      WHERE CNPJ=@cnpj
      ORDER BY CASE WHEN STATUS='A' AND ISNULL(BLOQUEADO, 0)=0 THEN 0 ELSE 1 END, IDLICENCA DESC
    `);
  const licenca = licencaR.recordset[0];
  if (!licenca) return respostaNegada("Licenca nao encontrada para o CNPJ informado.");
  if (licenca.STATUS !== "A") return respostaNegada("Licenca inativa.");
  if (licenca.BLOQUEADO) return respostaNegada(licenca.MOTIVO_BLOQUEIO ?? "Licenca bloqueada.");
  if (!isDentroValidade(licenca)) return respostaNegada("Licenca vencida.");

  const terminalR = await pool.request()
    .input("idLicenca", sql.Int, licenca.IDLICENCA)
    .input("hardwareId", sql.NVarChar(200), hardwareId)
    .query("SELECT TOP 1 * FROM dbo.LICENCAS_TERMINAIS WHERE IDLICENCA=@idLicenca AND HARDWARE_ID=@hardwareId");
  const terminal = terminalR.recordset[0];
  const statusTerminal = String(terminal?.STATUS ?? (terminal?.BLOQUEADO ? "BLOQUEADO" : "ATIVO")) as TerminalStatus;
  if (statusTerminal === "BLOQUEADO") {
    return respostaNegada(terminal.MOTIVO_BLOQUEIO ?? "Terminal bloqueado.");
  }

  const qtdR = await pool.request()
    .input("idLicenca", sql.Int, licenca.IDLICENCA)
    .query("SELECT COUNT(*) AS total FROM dbo.LICENCAS_TERMINAIS WHERE IDLICENCA=@idLicenca AND STATUS='ATIVO'");
  const ativos = Number(qtdR.recordset[0]?.total ?? 0);

  if (!terminal || statusTerminal === "DESABILITADO") {
    if (ativos >= Number(licenca.QTDE_TERMINAIS_MAX ?? 0)) {
      return respostaNegada("Limite maximo de terminais ativos atingido.");
    }
  }

  if (terminal && statusTerminal === "ATIVO") {
    const dataUltValidacao = dataIso(new Date());
    const hash = hashValidacao({
      cnpj,
      hardwareId,
      token: terminal.TOKEN_LIBERACAO,
      dataUltValidacao,
    });
    await pool.request()
      .input("idTerminal", sql.Int, terminal.IDTERMINAL)
      .input("nomeComputador", sql.NVarChar(150), input.nomeComputador ?? terminal.NOME_COMPUTADOR ?? null)
      .input("usuarioWindows", sql.NVarChar(150), input.usuarioWindows ?? terminal.USUARIO_WINDOWS ?? null)
      .input("ip", sql.NVarChar(45), input.ip ?? terminal.IP ?? null)
      .input("hash", sql.NVarChar(128), hash)
      .input("idLicenca", sql.Int, licenca.IDLICENCA)
      .query(`
        UPDATE dbo.LICENCAS_TERMINAIS
        SET NOME_COMPUTADOR=@nomeComputador, USUARIO_WINDOWS=@usuarioWindows, IP=@ip,
          DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME(), HASH_VALIDACAO=@hash
        WHERE IDTERMINAL=@idTerminal;

        UPDATE dbo.LICENCAS_EMPRESA
        SET DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME()
        WHERE IDLICENCA=@idLicenca;
      `);
    return respostaLiberada({
      mensagem: "Terminal ja liberado. Token existente retornado.",
      licenca,
      terminal,
      dataUltValidacao,
      hash,
      licencaAssinada: criarLicencaAssinada({ licenca, hardwareId, ultimaComunicacao: dataUltValidacao }),
    });
  }

  if (terminal && statusTerminal === "DESABILITADO") {
    const dataUltValidacao = dataIso(new Date());
    const hash = hashValidacao({
      cnpj,
      hardwareId,
      token: terminal.TOKEN_LIBERACAO,
      dataUltValidacao,
    });
    await pool.request()
      .input("idTerminal", sql.Int, terminal.IDTERMINAL)
      .input("nomeComputador", sql.NVarChar(150), input.nomeComputador ?? terminal.NOME_COMPUTADOR ?? null)
      .input("usuarioWindows", sql.NVarChar(150), input.usuarioWindows ?? terminal.USUARIO_WINDOWS ?? null)
      .input("ip", sql.NVarChar(45), input.ip ?? terminal.IP ?? null)
      .input("hash", sql.NVarChar(128), hash)
      .input("idLicenca", sql.Int, licenca.IDLICENCA)
      .query(`
        UPDATE dbo.LICENCAS_TERMINAIS
        SET STATUS='ATIVO', BLOQUEADO=0, MOTIVO_BLOQUEIO=NULL,
          NOME_COMPUTADOR=@nomeComputador, USUARIO_WINDOWS=@usuarioWindows, IP=@ip,
          DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME(), HASH_VALIDACAO=@hash
        WHERE IDTERMINAL=@idTerminal;

        UPDATE dbo.LICENCAS_EMPRESA
        SET DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME()
        WHERE IDLICENCA=@idLicenca;
      `);
    return respostaLiberada({
      mensagem: "Terminal reativado com sucesso.",
      licenca,
      terminal,
      dataUltValidacao,
      hash,
      licencaAssinada: criarLicencaAssinada({ licenca, hardwareId, ultimaComunicacao: dataUltValidacao }),
    });
  }

  const token = tokenLiberacao();
  const dataUltValidacao = dataIso(new Date());
  const hash = hashValidacao({ cnpj, hardwareId, token, dataUltValidacao });
  const insertR = await pool.request()
    .input("idLicenca", sql.Int, licenca.IDLICENCA)
    .input("hardwareId", sql.NVarChar(200), hardwareId)
    .input("nomeComputador", sql.NVarChar(150), input.nomeComputador ?? null)
    .input("usuarioWindows", sql.NVarChar(150), input.usuarioWindows ?? null)
    .input("ip", sql.NVarChar(45), input.ip ?? null)
    .input("token", sql.NVarChar(200), token)
    .input("hash", sql.NVarChar(128), hash)
    .query(`
      INSERT INTO dbo.LICENCAS_TERMINAIS
        (IDLICENCA, HARDWARE_ID, NOME_COMPUTADOR, USUARIO_WINDOWS, IP, TOKEN_LIBERACAO,
         STATUS, BLOQUEADO, DATA_ULTIMA_VALIDACAO, HASH_VALIDACAO)
      OUTPUT INSERTED.IDTERMINAL AS IDTERMINAL, INSERTED.HARDWARE_ID, INSERTED.TOKEN_LIBERACAO
      VALUES (@idLicenca, @hardwareId, @nomeComputador, @usuarioWindows, @ip, @token,
        'ATIVO', 0, SYSUTCDATETIME(), @hash);

      UPDATE dbo.LICENCAS_EMPRESA
      SET DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME()
      WHERE IDLICENCA=@idLicenca;
    `);

  return respostaLiberada({
    mensagem: "Terminal liberado com sucesso",
    licenca,
    terminal: insertR.recordset[0],
    dataUltValidacao,
    hash,
    licencaAssinada: criarLicencaAssinada({ licenca, hardwareId, ultimaComunicacao: dataUltValidacao }),
  });
}

export async function validarTerminal(input: ValidarTerminalPayload) {
  const pool = await getSqlPool();
  await garantirTabelasLicencas(pool);
  const cnpj = normalizeCnpj(input.cnpj);
  const r = await pool.request()
    .input("cnpj", sql.VarChar(14), cnpj)
    .input("hardwareId", sql.NVarChar(200), input.hardwareId.trim())
    .input("token", sql.NVarChar(200), input.token.trim())
    .query(`
      SELECT TOP 1 l.*, t.IDTERMINAL, t.HARDWARE_ID, t.TOKEN_LIBERACAO, t.BLOQUEADO AS TERMINAL_BLOQUEADO,
        t.STATUS AS TERMINAL_STATUS, t.MOTIVO_BLOQUEIO AS TERMINAL_MOTIVO_BLOQUEIO
      FROM dbo.LICENCAS_TERMINAIS t
      INNER JOIN dbo.LICENCAS_EMPRESA l ON l.IDLICENCA = t.IDLICENCA
      WHERE l.CNPJ=@cnpj AND t.HARDWARE_ID=@hardwareId AND t.TOKEN_LIBERACAO=@token
    `);
  const row = r.recordset[0];
  if (!row) return { autorizado: false, motivo: "Terminal ou token invalido." };
  if (row.STATUS !== "A") return { autorizado: false, motivo: "Licenca inativa." };
  if (row.BLOQUEADO) return { autorizado: false, motivo: row.MOTIVO_BLOQUEIO ?? "Licenca bloqueada." };
  if (!isDentroValidade(row)) return { autorizado: false, motivo: "Licenca vencida." };
  if (row.TERMINAL_STATUS === "BLOQUEADO" || row.TERMINAL_BLOQUEADO) {
    return { autorizado: false, motivo: row.TERMINAL_MOTIVO_BLOQUEIO ?? "Terminal bloqueado." };
  }
  if (row.TERMINAL_STATUS === "DESABILITADO") {
    return { autorizado: false, motivo: "Terminal desabilitado." };
  }

  await pool.request()
    .input("idTerminal", sql.Int, row.IDTERMINAL)
    .input("idLicenca", sql.Int, row.IDLICENCA)
    .query(`
      UPDATE dbo.LICENCAS_TERMINAIS
      SET DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME()
      WHERE IDTERMINAL=@idTerminal;

      UPDATE dbo.LICENCAS_EMPRESA
      SET DATA_ULTIMA_VALIDACAO=SYSUTCDATETIME()
      WHERE IDLICENCA=@idLicenca;
    `);

  const ultimaComunicacao = dataIso(new Date());
  const licencaAssinada = criarLicencaAssinada({
    licenca: row,
    hardwareId: String(row.HARDWARE_ID),
    ultimaComunicacao,
  });
  return {
    autorizado: true,
    ...licencaAssinada,
    licenca: licencaAssinada,
  };
}

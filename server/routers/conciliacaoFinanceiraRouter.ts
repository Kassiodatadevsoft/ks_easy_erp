import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  return session;
}

const statusConciliacao = z.enum(["PENDENTE", "CONCILIADO", "DIVERGENTE", "IGNORADO", "CANCELADO"]);
const tipoMovimento = z.enum(["CREDITO", "DEBITO", "TARIFA", "TRANSFERENCIA", "PIX", "BOLETO", "CARTAO", "OUTRO"]);

export async function garantirTabelasConciliacaoFinanceira(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00016')
    CREATE TABLE KS0003.KS00016 (
      GUIDARQUIVO       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL         INT NULL,
      GUIDCONTABANCARIA UNIQUEIDENTIFIER NOT NULL,
      TIPOARQUIVO       NVARCHAR(10) NOT NULL,
      NOMEARQUIVO       NVARCHAR(255) NOT NULL,
      HASHARQUIVO       NVARCHAR(80) NOT NULL,
      BANCO             NVARCHAR(80) NULL,
      AGENCIA           NVARCHAR(30) NULL,
      CONTA             NVARCHAR(40) NULL,
      DTINICIO          DATE NULL,
      DTFIM             DATE NULL,
      SALDOINICIAL      DECIMAL(15,2) NULL,
      SALDOFINAL        DECIMAL(15,2) NULL,
      QTDMOVIMENTOS     INT NOT NULL DEFAULT 0,
      QTDDUPLICADOS     INT NOT NULL DEFAULT 0,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'IMPORTADO',
      USUARIOCRIACAO    UNIQUEIDENTIFIER NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO  UNIQUEIDENTIFIER NULL,
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00016_HASH' AND object_id=OBJECT_ID('KS0003.KS00016'))
      CREATE INDEX IX_KS00016_HASH ON KS0003.KS00016 (GUIDENTIDADE, HASHARQUIVO)
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00017')
    CREATE TABLE KS0003.KS00017 (
      GUIDMOVIMENTO     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDARQUIVO       UNIQUEIDENTIFIER NULL,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL         INT NULL,
      GUIDCONTABANCARIA UNIQUEIDENTIFIER NOT NULL,
      BANCO             NVARCHAR(80) NULL,
      AGENCIA           NVARCHAR(30) NULL,
      CONTA             NVARCHAR(40) NULL,
      DTMOVIMENTO       DATE NOT NULL,
      DTCOMPENSACAO     DATE NULL,
      TIPO              NVARCHAR(20) NOT NULL,
      DESCRICAO         NVARCHAR(500) NOT NULL,
      DOCUMENTO         NVARCHAR(120) NULL,
      VALOR             DECIMAL(15,2) NOT NULL,
      SALDO             DECIMAL(15,2) NULL,
      IDENTIFICADOR     NVARCHAR(180) NULL,
      HASHMOVIMENTO     NVARCHAR(80) NOT NULL,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
      USUARIOCRIACAO    UNIQUEIDENTIFIER NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO  UNIQUEIDENTIFIER NULL,
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_KS00017_HASH' AND object_id=OBJECT_ID('KS0003.KS00017'))
      CREATE UNIQUE INDEX UX_KS00017_HASH ON KS0003.KS00017 (GUIDENTIDADE, GUIDCONTABANCARIA, HASHMOVIMENTO)
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00018')
    CREATE TABLE KS0003.KS00018 (
      GUIDCONCILIACAO   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL         INT NULL,
      GUIDCONTABANCARIA UNIQUEIDENTIFIER NOT NULL,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'CONCILIADO',
      OBSERVACAO        NVARCHAR(500) NULL,
      USUARIOCRIACAO    UNIQUEIDENTIFIER NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO  UNIQUEIDENTIFIER NULL,
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00019')
    CREATE TABLE KS0003.KS00019 (
      GUIDITEM          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDCONCILIACAO   UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      GUIDMOVIMENTO     UNIQUEIDENTIFIER NULL,
      ORIGEMSISTEMA     NVARCHAR(30) NULL,
      GUIDREGISTRO      UNIQUEIDENTIFIER NULL,
      VALOR             DECIMAL(15,2) NOT NULL,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'CONCILIADO',
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00020')
    CREATE TABLE KS0003.KS00020 (
      GUIDCNAB          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL         INT NULL,
      GUIDCONTABANCARIA UNIQUEIDENTIFIER NOT NULL,
      LAYOUTCNAB        NVARCHAR(10) NOT NULL,
      BANCO             NVARCHAR(80) NULL,
      NOMEARQUIVO       NVARCHAR(255) NOT NULL,
      HASHARQUIVO       NVARCHAR(80) NOT NULL,
      QTDREGISTROS      INT NOT NULL DEFAULT 0,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'IMPORTADO',
      LOGIMPORTACAO     NVARCHAR(MAX) NULL,
      USUARIOCRIACAO    UNIQUEIDENTIFIER NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO  UNIQUEIDENTIFIER NULL,
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00021')
    CREATE TABLE KS0003.KS00021 (
      GUIDITEM          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDCNAB          UNIQUEIDENTIFIER NOT NULL,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      GUIDLANCAMENTO    UNIQUEIDENTIFIER NULL,
      NOSSONUMERO       NVARCHAR(80) NULL,
      NUMERODOC         NVARCHAR(80) NULL,
      CARTEIRA          NVARCHAR(40) NULL,
      AGENCIA           NVARCHAR(30) NULL,
      CONTA             NVARCHAR(40) NULL,
      DTOCORRENCIA      DATE NULL,
      DTCREDITO         DATE NULL,
      VALORTITULO       DECIMAL(15,2) NULL,
      VALORPAGO         DECIMAL(15,2) NULL,
      JUROS             DECIMAL(15,2) NULL,
      MULTA             DECIMAL(15,2) NULL,
      DESCONTO          DECIMAL(15,2) NULL,
      ABATIMENTO        DECIMAL(15,2) NULL,
      TARIFA            DECIMAL(15,2) NULL,
      CODIGOOCORRENCIA  NVARCHAR(20) NULL,
      DESCRICAOOCORRENCIA NVARCHAR(200) NULL,
      STATUSPROCESSAMENTO NVARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
      MENSAGEMERRO      NVARCHAR(500) NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00022')
    CREATE TABLE KS0003.KS00022 (
      GUIDAUDITORIA     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL         INT NULL,
      GUIDUSUARIO       UNIQUEIDENTIFIER NULL,
      DATAHORA          DATETIME NOT NULL DEFAULT GETDATE(),
      ORIGEM            NVARCHAR(60) NOT NULL,
      ACAO              NVARCHAR(80) NOT NULL,
      TABELAAFETADA     NVARCHAR(80) NULL,
      GUIDREGISTRO      UNIQUEIDENTIFIER NULL,
      VALORANTERIOR     NVARCHAR(MAX) NULL,
      VALORNOVO         NVARCHAR(MAX) NULL,
      OBSERVACAO        NVARCHAR(500) NULL,
      IDENTIFICACAO     NVARCHAR(120) NULL,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'REGISTRADO',
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00023')
    CREATE TABLE KS0003.KS00023 (
      GUIDDIVERGENCIA   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      GUIDMOVIMENTO     UNIQUEIDENTIFIER NULL,
      GUIDCONCILIACAO   UNIQUEIDENTIFIER NULL,
      MOTIVO            NVARCHAR(80) NOT NULL,
      DESCRICAO         NVARCHAR(500) NULL,
      STATUS            NVARCHAR(20) NOT NULL DEFAULT 'ABERTA',
      USUARIOCRIACAO    UNIQUEIDENTIFIER NULL,
      DATACRIACAO       DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO  UNIQUEIDENTIFIER NULL,
      DATAALTERACAO     DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

export async function auditarFinanceiro(pool: Awaited<ReturnType<typeof getSqlPool>>, params: {
  guidEntidade: string;
  codFilial?: number | null;
  guidUsuario?: string | null;
  origem: string;
  acao: string;
  tabela?: string | null;
  guidRegistro?: string | null;
  anterior?: unknown;
  novo?: unknown;
  observacao?: string | null;
  identificacao?: string | null;
}) {
  await pool.request()
    .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
    .input("guidentidade", sql.UniqueIdentifier, params.guidEntidade)
    .input("codfilial", sql.Int, params.codFilial ?? null)
    .input("guidusuario", sql.UniqueIdentifier, params.guidUsuario ?? null)
    .input("origem", sql.NVarChar(60), params.origem)
    .input("acao", sql.NVarChar(80), params.acao)
    .input("tabela", sql.NVarChar(80), params.tabela ?? null)
    .input("guidregistro", sql.UniqueIdentifier, params.guidRegistro ?? null)
    .input("anterior", sql.NVarChar(sql.MAX), params.anterior ? JSON.stringify(params.anterior) : null)
    .input("novo", sql.NVarChar(sql.MAX), params.novo ? JSON.stringify(params.novo) : null)
    .input("observacao", sql.NVarChar(500), params.observacao ?? null)
    .input("identificacao", sql.NVarChar(120), params.identificacao ?? null)
    .query(`
      INSERT INTO KS0003.KS00022
        (GUIDAUDITORIA,GUIDENTIDADE,CODFILIAL,GUIDUSUARIO,ORIGEM,ACAO,TABELAAFETADA,GUIDREGISTRO,VALORANTERIOR,VALORNOVO,OBSERVACAO,IDENTIFICACAO)
      VALUES
        (@guid,@guidentidade,@codfilial,@guidusuario,@origem,@acao,@tabela,@guidregistro,@anterior,@novo,@observacao,@identificacao)
    `);
}

function hashTexto(texto: string) {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

function parseOfxDate(value?: string | null) {
  if (!value) return null;
  const clean = value.trim();
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6) || "01";
  const d = clean.slice(6, 8) || "01";
  return `${y}-${m}-${d}`;
}

function tag(block: string, name: string) {
  const re = new RegExp(`<${name}>([^<\\r\\n]+)`, "i");
  return block.match(re)?.[1]?.trim() ?? null;
}

function parseValor(value?: string | null) {
  return Number(String(value ?? "0").replace(",", "."));
}

function tipoPorOfx(trntype: string | null, valor: number): z.infer<typeof tipoMovimento> {
  const t = (trntype ?? "").toUpperCase();
  if (t.includes("FEE") || t.includes("SRVCHG")) return "TARIFA";
  if (t.includes("XFER")) return "TRANSFERENCIA";
  if (t.includes("PIX")) return "PIX";
  if (valor >= 0) return "CREDITO";
  return "DEBITO";
}

function parseOfx(content: string, nomeArquivo: string, contaFallback?: string | null) {
  const banco = tag(content, "BANKID") ?? tag(content, "ORG");
  const agencia = tag(content, "BRANCHID");
  const conta = tag(content, "ACCTID") ?? contaFallback ?? null;
  const saldoFinal = parseValor(tag(content, "BALAMT"));
  const dtSaldo = parseOfxDate(tag(content, "DTASOF"));
  const dtInicio = parseOfxDate(tag(content, "DTSTART"));
  const dtFim = parseOfxDate(tag(content, "DTEND"));
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/OFX>)/gi) ?? [];
  const movimentos = blocks.map((block) => {
    const valor = parseValor(tag(block, "TRNAMT"));
    const dtMovimento = parseOfxDate(tag(block, "DTPOSTED")) ?? dtSaldo ?? new Date().toISOString().slice(0, 10);
    const descricao = tag(block, "MEMO") ?? tag(block, "NAME") ?? "MOVIMENTO OFX";
    const documento = tag(block, "CHECKNUM") ?? tag(block, "REFNUM");
    const fitid = tag(block, "FITID");
    const tipo = tipoPorOfx(tag(block, "TRNTYPE"), valor);
    const hash = hashTexto(`${banco}|${conta}|${dtMovimento}|${valor}|${descricao}|${documento}|${fitid ?? ""}`);
    return {
      banco,
      agencia,
      conta,
      dtMovimento,
      dtCompensacao: parseOfxDate(tag(block, "DTAVAIL")) ?? dtMovimento,
      tipo,
      descricao,
      documento,
      valor,
      saldo: null as number | null,
      identificador: fitid,
      hashMovimento: fitid ? hashTexto(`${banco}|${conta}|${fitid}`) : hash,
      arquivoOrigem: nomeArquivo,
    };
  });
  const creditos = movimentos.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
  const debitos = movimentos.filter((m) => m.valor < 0).reduce((s, m) => s + Math.abs(m.valor), 0);
  return {
    banco,
    agencia,
    conta,
    dtInicio,
    dtFim,
    saldoInicial: null as number | null,
    saldoFinal: Number.isFinite(saldoFinal) ? saldoFinal : null,
    movimentos,
    resumo: { quantidade: movimentos.length, creditos, debitos },
  };
}

function parseCnab(content: string, layout: "CNAB240" | "CNAB400") {
  const linhas = content.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const itens = linhas.slice(1, -1).map((linha, index) => {
    const nossoNumero = layout === "CNAB400" ? linha.slice(62, 70).trim() : linha.slice(37, 57).trim();
    const numeroDoc = layout === "CNAB400" ? linha.slice(116, 126).trim() : linha.slice(73, 88).trim();
    const codigo = layout === "CNAB400" ? linha.slice(108, 110).trim() : linha.slice(15, 17).trim();
    const valorRaw = layout === "CNAB400" ? linha.slice(253, 266) : linha.slice(81, 96);
    const valorPagoRaw = layout === "CNAB400" ? linha.slice(152, 165) : linha.slice(77, 92);
    const valorTitulo = Number(valorRaw || 0) / 100;
    const valorPago = Number(valorPagoRaw || 0) / 100;
    return {
      linha: index + 2,
      nossoNumero,
      numeroDoc,
      codigoOcorrencia: codigo,
      descricaoOcorrencia: descricaoOcorrenciaCnab(codigo),
      valorTitulo: Number.isFinite(valorTitulo) ? valorTitulo : 0,
      valorPago: Number.isFinite(valorPago) ? valorPago : 0,
      status: "PENDENTE",
      raw: linha,
    };
  });
  return { itens, resumo: { quantidade: itens.length, encontrados: 0, naoEncontrados: itens.length, erros: 0 } };
}

function descricaoOcorrenciaCnab(codigo: string) {
  const mapa: Record<string, string> = {
    "02": "Entrada confirmada",
    "06": "Liquidação",
    "09": "Baixa",
    "10": "Baixa por protesto",
    "12": "Abatimento concedido",
    "13": "Abatimento cancelado",
    "14": "Alteração de vencimento",
    "17": "Liquidação após baixa",
    "19": "Confirmação de protesto",
    "28": "Tarifa",
    "30": "Erro de registro",
  };
  return mapa[codigo] ?? "Ocorrência bancária";
}

async function contarDuplicados(pool: Awaited<ReturnType<typeof getSqlPool>>, guidEntidade: string, guidConta: string, hashes: string[]) {
  if (!hashes.length) return new Set<string>();
  const existentes = new Set<string>();
  for (const h of hashes) {
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
      .input("guidconta", sql.UniqueIdentifier, guidConta)
      .input("hash", sql.NVarChar(80), h)
      .query("SELECT HASHMOVIMENTO FROM KS0003.KS00017 WHERE GUIDENTIDADE=@guidentidade AND GUIDCONTABANCARIA=@guidconta AND HASHMOVIMENTO=@hash");
    if (r.recordset.length) existentes.add(h);
  }
  return existentes;
}

export const conciliacaoFinanceiraRouter = router({
  validarOfx: publicProcedure
    .input(z.object({
      nomeArquivo: z.string().min(1),
      conteudo: z.string().min(1),
      guidContaBancaria: z.string().uuid(),
      codFilial: z.number().int().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const parsed = parseOfx(input.conteudo, input.nomeArquivo);
      const duplicados = await contarDuplicados(pool, session.guidEntidade, input.guidContaBancaria, parsed.movimentos.map((m) => m.hashMovimento));
      return {
        ...parsed,
        hashArquivo: hashTexto(input.conteudo),
        movimentos: parsed.movimentos.map((m) => ({ ...m, duplicado: duplicados.has(m.hashMovimento), erro: null })),
        resumo: {
          ...parsed.resumo,
          duplicados: duplicados.size,
          novos: parsed.movimentos.length - duplicados.size,
          erros: parsed.movimentos.length ? 0 : 1,
        },
      };
    }),

  importarOfx: publicProcedure
    .input(z.object({
      nomeArquivo: z.string().min(1),
      conteudo: z.string().min(1),
      guidContaBancaria: z.string().uuid(),
      codFilial: z.number().int().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const parsed = parseOfx(input.conteudo, input.nomeArquivo);
      const duplicados = await contarDuplicados(pool, session.guidEntidade, input.guidContaBancaria, parsed.movimentos.map((m) => m.hashMovimento));
      const guidArquivo = crypto.randomUUID();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await transaction.request()
          .input("guid", sql.UniqueIdentifier, guidArquivo)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("codfilial", sql.Int, input.codFilial ?? session.codFilial ?? null)
          .input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria)
          .input("nome", sql.NVarChar(255), input.nomeArquivo)
          .input("hash", sql.NVarChar(80), hashTexto(input.conteudo))
          .input("banco", sql.NVarChar(80), parsed.banco ?? null)
          .input("agencia", sql.NVarChar(30), parsed.agencia ?? null)
          .input("conta", sql.NVarChar(40), parsed.conta ?? null)
          .input("dtinicio", sql.NVarChar(10), parsed.dtInicio ?? null)
          .input("dtfim", sql.NVarChar(10), parsed.dtFim ?? null)
          .input("saldoinicial", sql.Decimal(15,2), parsed.saldoInicial ?? null)
          .input("saldofinal", sql.Decimal(15,2), parsed.saldoFinal ?? null)
          .input("qtd", sql.Int, parsed.movimentos.length)
          .input("dup", sql.Int, duplicados.size)
          .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
          .query(`
            INSERT INTO KS0003.KS00016
              (GUIDARQUIVO,GUIDENTIDADE,CODFILIAL,GUIDCONTABANCARIA,TIPOARQUIVO,NOMEARQUIVO,HASHARQUIVO,BANCO,AGENCIA,CONTA,
               DTINICIO,DTFIM,SALDOINICIAL,SALDOFINAL,QTDMOVIMENTOS,QTDDUPLICADOS,USUARIOCRIACAO,USUARIOALTERACAO)
            VALUES
              (@guid,@guidentidade,@codfilial,@guidconta,'OFX',@nome,@hash,@banco,@agencia,@conta,
               CASE WHEN @dtinicio IS NULL THEN NULL ELSE CONVERT(DATE,@dtinicio) END,
               CASE WHEN @dtfim IS NULL THEN NULL ELSE CONVERT(DATE,@dtfim) END,
               @saldoinicial,@saldofinal,@qtd,@dup,@usuario,@usuario)
          `);

        let inseridos = 0;
        for (const m of parsed.movimentos) {
          if (duplicados.has(m.hashMovimento)) continue;
          await transaction.request()
            .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
            .input("guidarquivo", sql.UniqueIdentifier, guidArquivo)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .input("codfilial", sql.Int, input.codFilial ?? session.codFilial ?? null)
            .input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria)
            .input("banco", sql.NVarChar(80), m.banco ?? null)
            .input("agencia", sql.NVarChar(30), m.agencia ?? null)
            .input("conta", sql.NVarChar(40), m.conta ?? null)
            .input("dtmov", sql.NVarChar(10), m.dtMovimento)
            .input("dtcomp", sql.NVarChar(10), m.dtCompensacao ?? null)
            .input("tipo", sql.NVarChar(20), m.tipo)
            .input("descricao", sql.NVarChar(500), m.descricao)
            .input("documento", sql.NVarChar(120), m.documento ?? null)
            .input("valor", sql.Decimal(15,2), m.valor)
            .input("saldo", sql.Decimal(15,2), m.saldo ?? null)
            .input("identificador", sql.NVarChar(180), m.identificador ?? null)
            .input("hash", sql.NVarChar(80), m.hashMovimento)
            .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
            .query(`
              INSERT INTO KS0003.KS00017
                (GUIDMOVIMENTO,GUIDARQUIVO,GUIDENTIDADE,CODFILIAL,GUIDCONTABANCARIA,BANCO,AGENCIA,CONTA,DTMOVIMENTO,DTCOMPENSACAO,
                 TIPO,DESCRICAO,DOCUMENTO,VALOR,SALDO,IDENTIFICADOR,HASHMOVIMENTO,USUARIOCRIACAO,USUARIOALTERACAO)
              VALUES
                (@guid,@guidarquivo,@guidentidade,@codfilial,@guidconta,@banco,@agencia,@conta,CONVERT(DATE,@dtmov),
                 CASE WHEN @dtcomp IS NULL THEN NULL ELSE CONVERT(DATE,@dtcomp) END,
                 @tipo,@descricao,@documento,@valor,@saldo,@identificador,@hash,@usuario,@usuario)
            `);
          inseridos++;
        }
        await transaction.commit();
        await auditarFinanceiro(pool, {
          guidEntidade: session.guidEntidade,
          codFilial: input.codFilial ?? session.codFilial ?? null,
          guidUsuario: session.guidPessoa,
          origem: "IMPORTACAO_OFX",
          acao: "IMPORTAR_OFX",
          tabela: "KS0003.KS00016",
          guidRegistro: guidArquivo,
          novo: { arquivo: input.nomeArquivo, inseridos, duplicados: duplicados.size },
        });
        return { success: true, guidArquivo, inseridos, duplicados: duplicados.size };
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    }),

  listarExtrato: publicProcedure
    .input(z.object({
      guidContaBancaria: z.string().uuid().optional(),
      codFilial: z.number().int().optional(),
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
      tipo: tipoMovimento.or(z.literal("TODOS")).default("TODOS"),
      status: statusConciliacao.or(z.literal("TODOS")).default("PENDENTE"),
      valor: z.number().optional(),
      busca: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;
      const where: string[] = ["m.GUIDENTIDADE=@guidentidade"];
      if (input?.guidContaBancaria) where.push("m.GUIDCONTABANCARIA=@guidconta");
      if (input?.codFilial != null) where.push("m.CODFILIAL=@codfilial");
      if (input?.dtInicio) where.push("m.DTMOVIMENTO >= CONVERT(DATE,@dtinicio)");
      if (input?.dtFim) where.push("m.DTMOVIMENTO <= CONVERT(DATE,@dtfim)");
      if (input?.tipo && input.tipo !== "TODOS") where.push("m.TIPO=@tipo");
      if (input?.status && input.status !== "TODOS") where.push("m.STATUS=@status");
      if (input?.valor != null) where.push("ABS(m.VALOR)=ABS(@valor)");
      if (input?.busca) where.push("(m.DESCRICAO LIKE @busca OR m.DOCUMENTO LIKE @busca OR m.IDENTIFICADOR LIKE @busca)");
      const add = (req: ReturnType<typeof pool.request>) => {
        req.input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
        if (input?.guidContaBancaria) req.input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria);
        if (input?.codFilial != null) req.input("codfilial", sql.Int, input.codFilial);
        if (input?.dtInicio) req.input("dtinicio", sql.NVarChar(10), input.dtInicio);
        if (input?.dtFim) req.input("dtfim", sql.NVarChar(10), input.dtFim);
        if (input?.tipo && input.tipo !== "TODOS") req.input("tipo", sql.NVarChar(20), input.tipo);
        if (input?.status && input.status !== "TODOS") req.input("status", sql.NVarChar(20), input.status);
        if (input?.valor != null) req.input("valor", sql.Decimal(15,2), input.valor);
        if (input?.busca) req.input("busca", sql.NVarChar(220), `%${input.busca}%`);
        return req;
      };
      const totalR = await add(pool.request()).query(`SELECT COUNT(*) AS total FROM KS0003.KS00017 m WHERE ${where.join(" AND ")}`);
      const rows = await add(pool.request())
        .input("offset", sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .query(`
          SELECT
            CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
            CAST(m.GUIDARQUIVO AS NVARCHAR(36)) AS guidArquivo,
            CAST(m.GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria,
            m.CODFILIAL AS codFilial, m.BANCO AS banco, m.AGENCIA AS agencia, m.CONTA AS conta,
            CONVERT(NVARCHAR(10),m.DTMOVIMENTO,23) AS dtMovimento,
            CONVERT(NVARCHAR(10),m.DTCOMPENSACAO,23) AS dtCompensacao,
            m.TIPO AS tipo, m.DESCRICAO AS descricao, m.DOCUMENTO AS documento, m.VALOR AS valor,
            m.SALDO AS saldo, m.IDENTIFICADOR AS identificador, m.STATUS AS status,
            cb.CONTA AS nomeContaBancaria
          FROM KS0003.KS00017 m
          LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA=m.GUIDCONTABANCARIA
          WHERE ${where.join(" AND ")}
          ORDER BY m.DTMOVIMENTO DESC, m.DATACRIACAO DESC
          OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        `);
      return { items: rows.recordset, total: totalR.recordset[0]?.total ?? 0, page, pageSize };
    }),

  listarLancamentosSistema: publicProcedure
    .input(z.object({
      guidContaBancaria: z.string().uuid().optional(),
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
      valor: z.number().optional(),
      busca: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      if (input?.guidContaBancaria) req.input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria);
      if (input?.dtInicio) req.input("dtinicio", sql.NVarChar(10), input.dtInicio);
      if (input?.dtFim) req.input("dtfim", sql.NVarChar(10), input.dtFim);
      if (input?.valor != null) req.input("valor", sql.Decimal(15,2), Math.abs(input.valor));
      if (input?.busca) req.input("busca", sql.NVarChar(220), `%${input.busca}%`);
      const contaFilter = input?.guidContaBancaria ? "AND l.GUIDCONTA=@guidconta" : "";
      const dtFilter = `${input?.dtInicio ? "AND CONVERT(DATE,l.DTLANCAMENTO)>=CONVERT(DATE,@dtinicio)" : ""} ${input?.dtFim ? "AND CONVERT(DATE,l.DTLANCAMENTO)<=CONVERT(DATE,@dtfim)" : ""}`;
      const valorFilter = input?.valor != null ? "AND ABS(l.VALOR)=ABS(@valor)" : "";
      const buscaFilter = input?.busca ? "AND (l.DESCRICAO LIKE @busca OR l.NUMERODOC LIKE @busca)" : "";
      const r = await req.query(`
        SELECT TOP 200
          CAST(l.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidRegistro,
          'LANCAMENTO_CAIXA' AS origem,
          CONVERT(NVARCHAR(10),l.DTLANCAMENTO,23) AS data,
          l.NUMERODOC AS documento,
          NULL AS pessoa,
          l.DESCRICAO AS descricao,
          CASE WHEN l.TIPO='S' THEN -l.VALOR ELSE l.VALOR END AS valor,
          CAST(l.GUIDCONTA AS NVARCHAR(36)) AS guidContaBancaria,
          cb.CONTA AS contaBancaria,
          'PENDENTE' AS status
        FROM KS0003.KS00010 l
        LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA=l.GUIDCONTA
        WHERE l.GUIDENTIDADE=@guidentidade ${contaFilter} ${dtFilter} ${valorFilter} ${buscaFilter}
        ORDER BY l.DTLANCAMENTO DESC
      `);
      return r.recordset;
    }),

  sugestoes: publicProcedure
    .input(z.object({ guidMovimento: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const movR = await pool.request()
        .input("guid", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 VALOR, DTMOVIMENTO, DOCUMENTO, DESCRICAO, GUIDCONTABANCARIA FROM KS0003.KS00017 WHERE GUIDMOVIMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      const mov = movR.recordset[0];
      if (!mov) return [];
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("guidconta", sql.UniqueIdentifier, mov.GUIDCONTABANCARIA)
        .input("valor", sql.Decimal(15,2), Math.abs(Number(mov.VALOR)))
        .input("dt", sql.Date, mov.DTMOVIMENTO)
        .input("doc", sql.NVarChar(120), mov.DOCUMENTO ?? "")
        .query(`
          SELECT TOP 20
            CAST(l.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidRegistro,
            'LANCAMENTO_CAIXA' AS origem,
            CONVERT(NVARCHAR(10),l.DTLANCAMENTO,23) AS data,
            l.NUMERODOC AS documento,
            l.DESCRICAO AS descricao,
            CASE WHEN l.TIPO='S' THEN -l.VALOR ELSE l.VALOR END AS valor,
            CASE
              WHEN ABS(l.VALOR)=ABS(@valor) AND CONVERT(DATE,l.DTLANCAMENTO)=CONVERT(DATE,@dt) AND ISNULL(l.NUMERODOC,'')=ISNULL(@doc,'') THEN 'ALTA'
              WHEN ABS(l.VALOR)=ABS(@valor) AND ABS(DATEDIFF(DAY,l.DTLANCAMENTO,@dt))<=2 THEN 'MEDIA'
              ELSE 'BAIXA'
            END AS confianca
          FROM KS0003.KS00010 l
          WHERE l.GUIDENTIDADE=@guidentidade
            AND l.GUIDCONTA=@guidconta
            AND ABS(l.VALOR)=ABS(@valor)
            AND ABS(DATEDIFF(DAY,l.DTLANCAMENTO,@dt))<=5
          ORDER BY ABS(DATEDIFF(DAY,l.DTLANCAMENTO,@dt)), l.DTLANCAMENTO DESC
        `);
      return r.recordset;
    }),

  conciliar: publicProcedure
    .input(z.object({
      guidMovimentos: z.array(z.string().uuid()).min(1),
      lancamentos: z.array(z.object({ origem: z.string(), guidRegistro: z.string().uuid(), valor: z.number() })).min(1),
      guidContaBancaria: z.string().uuid(),
      observacao: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const guidConciliacao = crypto.randomUUID();
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guidConciliacao)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria)
        .input("observacao", sql.NVarChar(500), input.observacao ?? null)
        .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
        .query(`
          INSERT INTO KS0003.KS00018
            (GUIDCONCILIACAO,GUIDENTIDADE,GUIDCONTABANCARIA,OBSERVACAO,USUARIOCRIACAO,USUARIOALTERACAO)
          VALUES (@guid,@guidentidade,@guidconta,@observacao,@usuario,@usuario)
        `);
      for (const guidMovimento of input.guidMovimentos) {
        await pool.request()
          .input("guiditem", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidconciliacao", sql.UniqueIdentifier, guidConciliacao)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidmovimento", sql.UniqueIdentifier, guidMovimento)
          .input("valor", sql.Decimal(15,2), 0)
          .query("INSERT INTO KS0003.KS00019 (GUIDITEM,GUIDCONCILIACAO,GUIDENTIDADE,GUIDMOVIMENTO,VALOR) VALUES (@guiditem,@guidconciliacao,@guidentidade,@guidmovimento,@valor)");
        await pool.request()
          .input("guid", sql.UniqueIdentifier, guidMovimento)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
          .query("UPDATE KS0003.KS00017 SET STATUS='CONCILIADO', USUARIOALTERACAO=@usuario, DATAALTERACAO=GETDATE() WHERE GUIDMOVIMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      }
      for (const lanc of input.lancamentos) {
        await pool.request()
          .input("guiditem", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidconciliacao", sql.UniqueIdentifier, guidConciliacao)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("origem", sql.NVarChar(30), lanc.origem)
          .input("guidregistro", sql.UniqueIdentifier, lanc.guidRegistro)
          .input("valor", sql.Decimal(15,2), lanc.valor)
          .query(`
            INSERT INTO KS0003.KS00019
              (GUIDITEM,GUIDCONCILIACAO,GUIDENTIDADE,ORIGEMSISTEMA,GUIDREGISTRO,VALOR)
            VALUES (@guiditem,@guidconciliacao,@guidentidade,@origem,@guidregistro,@valor)
          `);
      }
      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        guidUsuario: session.guidPessoa,
        origem: "CONCILIACAO_BANCARIA",
        acao: "CONCILIAR",
        tabela: "KS0003.KS00018",
        guidRegistro: guidConciliacao,
        novo: input,
      });
      return { success: true, guidConciliacao };
    }),

  atualizarStatusMovimento: publicProcedure
    .input(z.object({
      guidMovimento: z.string().uuid(),
      status: statusConciliacao,
      motivo: z.string().max(80).optional().nullable(),
      observacao: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const antesR = await pool.request()
        .input("guid", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT STATUS FROM KS0003.KS00017 WHERE GUIDMOVIMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      await pool.request()
        .input("guid", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("status", sql.NVarChar(20), input.status)
        .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
        .query("UPDATE KS0003.KS00017 SET STATUS=@status, USUARIOALTERACAO=@usuario, DATAALTERACAO=GETDATE() WHERE GUIDMOVIMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      if (input.status === "DIVERGENTE") {
        await pool.request()
          .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidmovimento", sql.UniqueIdentifier, input.guidMovimento)
          .input("motivo", sql.NVarChar(80), input.motivo ?? "OUTRO")
          .input("descricao", sql.NVarChar(500), input.observacao ?? null)
          .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
          .query("INSERT INTO KS0003.KS00023 (GUIDDIVERGENCIA,GUIDENTIDADE,GUIDMOVIMENTO,MOTIVO,DESCRICAO,USUARIOCRIACAO,USUARIOALTERACAO) VALUES (@guid,@guidentidade,@guidmovimento,@motivo,@descricao,@usuario,@usuario)");
      }
      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        guidUsuario: session.guidPessoa,
        origem: "CONCILIACAO_BANCARIA",
        acao: input.status === "PENDENTE" ? "DESFAZER_CONCILIACAO" : `MARCAR_${input.status}`,
        tabela: "KS0003.KS00017",
        guidRegistro: input.guidMovimento,
        anterior: antesR.recordset[0] ?? null,
        novo: input,
      });
      return { success: true };
    }),

  criarLancamentoPorExtrato: publicProcedure
    .input(z.object({
      guidMovimento: z.string().uuid(),
      guidNatureza: z.string().uuid(),
      guidCentro: z.string().uuid(),
      descricao: z.string().min(1).max(200),
      observacao: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const movR = await pool.request()
        .input("guid", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 * FROM KS0003.KS00017 WHERE GUIDMOVIMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      const mov = movR.recordset[0];
      if (!mov) throw new TRPCError({ code: "NOT_FOUND", message: "Movimento de extrato nao encontrado." });
      const guidLanc = crypto.randomUUID();
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guidLanc)
        .input("dt", sql.Date, mov.DTMOVIMENTO)
        .input("tipo", sql.Char(1), Number(mov.VALOR) >= 0 ? "E" : "S")
        .input("valor", sql.Decimal(15,2), Math.abs(Number(mov.VALOR)))
        .input("descricao", sql.NVarChar(200), input.descricao.toUpperCase())
        .input("guidconta", sql.UniqueIdentifier, mov.GUIDCONTABANCARIA)
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
        .input("guidcentro", sql.UniqueIdentifier, input.guidCentro)
        .input("numerodoc", sql.NVarChar(30), mov.DOCUMENTO ?? null)
        .input("observacao", sql.NVarChar(500), input.observacao ?? mov.DESCRICAO)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00010
            (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
          VALUES
            (@guid,@dt,@tipo,@valor,@descricao,@guidconta,@guidnatureza,@guidcentro,@numerodoc,@observacao,@guidentidade)
        `);
      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        guidUsuario: session.guidPessoa,
        origem: "EXTRATO_BANCARIO",
        acao: "CRIAR_LANCAMENTO_EXTRATO",
        tabela: "KS0003.KS00010",
        guidRegistro: guidLanc,
        novo: { guidMovimento: input.guidMovimento, valor: mov.VALOR },
      });
      return { success: true, guidLancamento: guidLanc };
    }),

  validarCnab: publicProcedure
    .input(z.object({
      nomeArquivo: z.string().min(1),
      conteudo: z.string().min(1),
      layout: z.enum(["CNAB240", "CNAB400"]),
    }))
    .mutation(async ({ input }) => {
      return { ...parseCnab(input.conteudo, input.layout), hashArquivo: hashTexto(input.conteudo) };
    }),

  importarCnab: publicProcedure
    .input(z.object({
      nomeArquivo: z.string().min(1),
      conteudo: z.string().min(1),
      layout: z.enum(["CNAB240", "CNAB400"]),
      banco: z.string().max(80).optional().nullable(),
      guidContaBancaria: z.string().uuid(),
      codFilial: z.number().int().optional().nullable(),
      reprocessar: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const parsed = parseCnab(input.conteudo, input.layout);
      const guidCnab = crypto.randomUUID();
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guidCnab)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("codfilial", sql.Int, input.codFilial ?? session.codFilial ?? null)
        .input("guidconta", sql.UniqueIdentifier, input.guidContaBancaria)
        .input("layout", sql.NVarChar(10), input.layout)
        .input("banco", sql.NVarChar(80), input.banco ?? null)
        .input("nome", sql.NVarChar(255), input.nomeArquivo)
        .input("hash", sql.NVarChar(80), hashTexto(input.conteudo))
        .input("qtd", sql.Int, parsed.itens.length)
        .input("log", sql.NVarChar(sql.MAX), JSON.stringify(parsed.resumo))
        .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
        .query(`
          INSERT INTO KS0003.KS00020
            (GUIDCNAB,GUIDENTIDADE,CODFILIAL,GUIDCONTABANCARIA,LAYOUTCNAB,BANCO,NOMEARQUIVO,HASHARQUIVO,QTDREGISTROS,LOGIMPORTACAO,USUARIOCRIACAO,USUARIOALTERACAO)
          VALUES
            (@guid,@guidentidade,@codfilial,@guidconta,@layout,@banco,@nome,@hash,@qtd,@log,@usuario,@usuario)
        `);
      let encontrados = 0;
      for (const item of parsed.itens) {
        const titR = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("nosso", sql.NVarChar(80), item.nossoNumero)
          .input("doc", sql.NVarChar(80), item.numeroDoc)
          .query(`
            SELECT TOP 1 CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento
            FROM KS0003.KS00005
            WHERE GUIDENTIDADE=@guidentidade AND (NUMERODOC=@doc OR NUMERODOC=@nosso)
          `);
        const guidLancamento = titR.recordset[0]?.guidLancamento as string | undefined;
        if (guidLancamento) encontrados++;
        const liquidacao = ["06", "17"].includes(item.codigoOcorrencia);
        if (guidLancamento && liquidacao) {
          await pool.request()
            .input("guid", sql.UniqueIdentifier, guidLancamento)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .input("valor", sql.Decimal(15,2), item.valorPago || item.valorTitulo)
            .query(`
              UPDATE KS0003.KS00005 SET
                VALORRECEBIDO=@valor, DTRECEBIMENTO=CAST(GETDATE() AS DATE), STATUS='PAGO', ULTIMAALTERACAO=GETDATE()
              WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade AND STATUS IN ('ABERTO','PARCIAL')
            `);
        }
        await pool.request()
          .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidcnab", sql.UniqueIdentifier, guidCnab)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidlancamento", sql.UniqueIdentifier, guidLancamento ?? null)
          .input("nosso", sql.NVarChar(80), item.nossoNumero || null)
          .input("doc", sql.NVarChar(80), item.numeroDoc || null)
          .input("valortitulo", sql.Decimal(15,2), item.valorTitulo)
          .input("valorpago", sql.Decimal(15,2), item.valorPago)
          .input("codigo", sql.NVarChar(20), item.codigoOcorrencia)
          .input("descricao", sql.NVarChar(200), item.descricaoOcorrencia)
          .input("status", sql.NVarChar(30), guidLancamento ? "PROCESSADO" : "NAO_ENCONTRADO")
          .query(`
            INSERT INTO KS0003.KS00021
              (GUIDITEM,GUIDCNAB,GUIDENTIDADE,GUIDLANCAMENTO,NOSSONUMERO,NUMERODOC,VALORTITULO,VALORPAGO,CODIGOOCORRENCIA,DESCRICAOOCORRENCIA,STATUSPROCESSAMENTO)
            VALUES
              (@guid,@guidcnab,@guidentidade,@guidlancamento,@nosso,@doc,@valortitulo,@valorpago,@codigo,@descricao,@status)
          `);
      }
      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        codFilial: input.codFilial ?? session.codFilial ?? null,
        guidUsuario: session.guidPessoa,
        origem: "IMPORTACAO_CNAB",
        acao: "IMPORTAR_CNAB",
        tabela: "KS0003.KS00020",
        guidRegistro: guidCnab,
        novo: { arquivo: input.nomeArquivo, registros: parsed.itens.length, encontrados },
      });
      return { success: true, guidCnab, registros: parsed.itens.length, encontrados, naoEncontrados: parsed.itens.length - encontrados };
    }),

  listarCnabItens: publicProcedure
    .input(z.object({ guidCnab: z.string().uuid().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("guidcnab", sql.UniqueIdentifier, input?.guidCnab ?? null)
        .query(`
          SELECT TOP 200
            CAST(i.GUIDITEM AS NVARCHAR(36)) AS guidItem,
            CAST(i.GUIDCNAB AS NVARCHAR(36)) AS guidCnab,
            CAST(i.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
            i.NOSSONUMERO AS nossoNumero, i.NUMERODOC AS numeroDoc, i.VALORTITULO AS valorTitulo,
            i.VALORPAGO AS valorPago, i.CODIGOOCORRENCIA AS codigoOcorrencia,
            i.DESCRICAOOCORRENCIA AS descricaoOcorrencia, i.STATUSPROCESSAMENTO AS statusProcessamento,
            a.NOMEARQUIVO AS nomeArquivo, a.LAYOUTCNAB AS layoutCnab
          FROM KS0003.KS00021 i
          INNER JOIN KS0003.KS00020 a ON a.GUIDCNAB=i.GUIDCNAB
          WHERE i.GUIDENTIDADE=@guidentidade AND (@guidcnab IS NULL OR i.GUIDCNAB=@guidcnab)
          ORDER BY i.DATACRIACAO DESC
        `);
      return r.recordset;
    }),

  auditoria: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
      usuario: z.string().optional(),
      codFilial: z.number().int().optional(),
      origem: z.string().optional(),
      acao: z.string().optional(),
      tabela: z.string().optional(),
      registro: z.string().uuid().optional(),
      busca: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);
      const where = ["GUIDENTIDADE=@guidentidade"];
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      if (input?.dtInicio) { where.push("DATAHORA>=CONVERT(DATETIME,@dtinicio)"); req.input("dtinicio", sql.NVarChar(10), input.dtInicio); }
      if (input?.dtFim) { where.push("DATAHORA<DATEADD(DAY,1,CONVERT(DATETIME,@dtfim))"); req.input("dtfim", sql.NVarChar(10), input.dtFim); }
      if (input?.usuario) { where.push("CAST(GUIDUSUARIO AS NVARCHAR(36)) LIKE @usuario"); req.input("usuario", sql.NVarChar(80), `%${input.usuario}%`); }
      if (input?.codFilial != null) { where.push("CODFILIAL=@codfilial"); req.input("codfilial", sql.Int, input.codFilial); }
      if (input?.origem) { where.push("ORIGEM LIKE @origem"); req.input("origem", sql.NVarChar(80), `%${input.origem}%`); }
      if (input?.acao) { where.push("ACAO LIKE @acao"); req.input("acao", sql.NVarChar(100), `%${input.acao}%`); }
      if (input?.tabela) { where.push("TABELAAFETADA LIKE @tabela"); req.input("tabela", sql.NVarChar(100), `%${input.tabela}%`); }
      if (input?.registro) { where.push("GUIDREGISTRO=@registro"); req.input("registro", sql.UniqueIdentifier, input.registro); }
      if (input?.busca) { where.push("(OBSERVACAO LIKE @busca OR VALORANTERIOR LIKE @busca OR VALORNOVO LIKE @busca OR IDENTIFICACAO LIKE @busca)"); req.input("busca", sql.NVarChar(220), `%${input.busca}%`); }
      const r = await req.query(`
        SELECT TOP 300
          CAST(GUIDAUDITORIA AS NVARCHAR(36)) AS guidAuditoria,
          CODFILIAL AS codFilial, CAST(GUIDUSUARIO AS NVARCHAR(36)) AS guidUsuario,
          DATAHORA AS dataHora, ORIGEM AS origem, ACAO AS acao, TABELAAFETADA AS tabelaAfetada,
          CAST(GUIDREGISTRO AS NVARCHAR(36)) AS guidRegistro, VALORANTERIOR AS valorAnterior,
          VALORNOVO AS valorNovo, OBSERVACAO AS observacao, IDENTIFICACAO AS identificacao
        FROM KS0003.KS00022
        WHERE ${where.join(" AND ")}
        ORDER BY DATAHORA DESC
      `);
      return r.recordset;
    }),
});

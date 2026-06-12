import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import { auditarFinanceiro, garantirTabelasConciliacaoFinanceira } from "./conciliacaoFinanceiraRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida." });
  return session;
}

const canalSchema = z.enum(["WHATSAPP", "EMAIL", "SMS"]);
const cobrancaStatusSchema = z.enum(["PENDENTE", "ENVIADO", "FALHA", "PAUSADO", "NEGOCIADO", "PAGO", "CANCELADO"]);
const aprovacaoStatusSchema = z.enum(["LANCADO", "AGUARDANDO_APROVACAO", "APROVADO", "REJEITADO", "DEVOLVIDO_AJUSTE", "PAGO", "CANCELADO"]);

export async function garantirTabelasCobrancaAprovacao(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await garantirTabelasConciliacaoFinanceira(pool);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00024')
    CREATE TABLE KS0003.KS00024 (
      GUIDMODELO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      NOME NVARCHAR(100) NOT NULL,
      CANAL NVARCHAR(20) NOT NULL,
      MENSAGEM NVARCHAR(MAX) NOT NULL,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'A',
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00025')
    CREATE TABLE KS0003.KS00025 (
      GUIDREGUA UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      DIASRELATIVOS INT NOT NULL,
      DIAVENCIMENTO BIT NOT NULL DEFAULT 0,
      CANAL NVARCHAR(20) NOT NULL,
      GUIDMODELO UNIQUEIDENTIFIER NULL,
      STATUSCLIENTE NVARCHAR(20) NULL,
      VALORMINIMO DECIMAL(15,2) NOT NULL DEFAULT 0,
      REENVIARAPOSDIAS INT NULL,
      ATIVA BIT NOT NULL DEFAULT 1,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'A',
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00026')
    CREATE TABLE KS0003.KS00026 (
      GUIDFILA UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      GUIDLANCAMENTO UNIQUEIDENTIFIER NOT NULL,
      GUIDREGUA UNIQUEIDENTIFIER NULL,
      GUIDCLIENTE UNIQUEIDENTIFIER NULL,
      CANAL NVARCHAR(20) NOT NULL,
      MENSAGEM NVARCHAR(MAX) NOT NULL,
      TENTATIVA INT NOT NULL DEFAULT 1,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
      RETORNO NVARCHAR(MAX) NULL,
      DATAENVIO DATETIME NULL,
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00026_TITULO_DIA' AND object_id=OBJECT_ID('KS0003.KS00026'))
      CREATE INDEX IX_KS00026_TITULO_DIA ON KS0003.KS00026 (GUIDENTIDADE, GUIDLANCAMENTO, CANAL, DATAENVIO)
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00027')
    CREATE TABLE KS0003.KS00027 (
      GUIDHISTORICO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      GUIDLANCAMENTO UNIQUEIDENTIFIER NOT NULL,
      GUIDCLIENTE UNIQUEIDENTIFIER NULL,
      CANAL NVARCHAR(20) NOT NULL,
      MENSAGEM NVARCHAR(MAX) NULL,
      STATUSENVIO NVARCHAR(20) NOT NULL,
      RETORNO NVARCHAR(MAX) NULL,
      TENTATIVA INT NOT NULL DEFAULT 1,
      USUARIO UNIQUEIDENTIFIER NULL,
      DATAHORA DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00028')
    CREATE TABLE KS0003.KS00028 (
      GUIDREGRA UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      DESCRICAO NVARCHAR(120) NOT NULL,
      ATIVA BIT NOT NULL DEFAULT 1,
      EXIGEAPROVACAO BIT NOT NULL DEFAULT 1,
      VALORAPARTIR DECIMAL(15,2) NULL,
      GUIDCENTRO UNIQUEIDENTIFIER NULL,
      GUIDNATUREZA UNIQUEIDENTIFIER NULL,
      GUIDFORNECEDOR UNIQUEIDENTIFIER NULL,
      NIVEIS INT NOT NULL DEFAULT 1,
      BLOQUEARAPROVADORORIGEM BIT NOT NULL DEFAULT 0,
      STATUS NVARCHAR(20) NOT NULL DEFAULT 'A',
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00029')
    CREATE TABLE KS0003.KS00029 (
      GUIDAPROVACAO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      CODFILIAL INT NULL,
      GUIDLANCAMENTO UNIQUEIDENTIFIER NOT NULL,
      GUIDREGRA UNIQUEIDENTIFIER NULL,
      STATUS NVARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
      NIVELATUAL INT NOT NULL DEFAULT 1,
      NIVEISNECESSARIOS INT NOT NULL DEFAULT 1,
      GUIDUSUARIOLANCAMENTO UNIQUEIDENTIFIER NULL,
      OBSERVACAO NVARCHAR(500) NULL,
      DATACRIACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOCRIACAO UNIQUEIDENTIFIER NULL,
      DATAALTERACAO DATETIME NOT NULL DEFAULT GETDATE(),
      USUARIOALTERACAO UNIQUEIDENTIFIER NULL
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_KS00029_LANCAMENTO' AND object_id=OBJECT_ID('KS0003.KS00029'))
      CREATE INDEX IX_KS00029_LANCAMENTO ON KS0003.KS00029 (GUIDENTIDADE, GUIDLANCAMENTO, STATUS)
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0003' AND TABLE_NAME='KS00030')
    CREATE TABLE KS0003.KS00030 (
      GUIDHISTORICO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      GUIDAPROVACAO UNIQUEIDENTIFIER NOT NULL,
      GUIDLANCAMENTO UNIQUEIDENTIFIER NOT NULL,
      ACAO NVARCHAR(40) NOT NULL,
      NIVEL INT NULL,
      USUARIO UNIQUEIDENTIFIER NULL,
      OBSERVACAO NVARCHAR(500) NULL,
      DATAHORA DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

function aplicarModelo(template: string, titulo: Record<string, unknown>) {
  return template
    .replaceAll("{{cliente}}", String(titulo.NOMEDEVEDOR ?? "cliente"))
    .replaceAll("{{titulo}}", String(titulo.NUMERODOC ?? titulo.DESCRICAO ?? "titulo"))
    .replaceAll("{{valor}}", Number(titulo.SALDO ?? titulo.VALOR ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
    .replaceAll("{{vencimento}}", String(titulo.DTVENCIMENTO ?? ""));
}

async function garantirAprovacaoParaTitulo(pool: Awaited<ReturnType<typeof getSqlPool>>, guidLancamento: string, guidEntidade: string, guidUsuario: string) {
  const tituloR = await pool.request()
    .input("guid", sql.UniqueIdentifier, guidLancamento)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query("SELECT TOP 1 * FROM KS0003.KS00004 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");
  const titulo = tituloR.recordset[0];
  if (!titulo) return null;
  const regraR = await pool.request()
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .input("valor", sql.Decimal(15,2), titulo.VALOR)
    .input("guidcentro", sql.UniqueIdentifier, titulo.GUIDCENTRO ?? null)
    .input("guidnatureza", sql.UniqueIdentifier, titulo.GUIDNATUREZA ?? null)
    .input("guidcredor", sql.UniqueIdentifier, titulo.GUIDCREDOR ?? null)
    .query(`
      SELECT TOP 1 *
      FROM KS0003.KS00028
      WHERE GUIDENTIDADE=@guidentidade AND ATIVA=1 AND EXIGEAPROVACAO=1
        AND (VALORAPARTIR IS NULL OR @valor >= VALORAPARTIR)
        AND (GUIDCENTRO IS NULL OR GUIDCENTRO=@guidcentro)
        AND (GUIDNATUREZA IS NULL OR GUIDNATUREZA=@guidnatureza)
        AND (GUIDFORNECEDOR IS NULL OR GUIDFORNECEDOR=@guidcredor)
      ORDER BY ISNULL(VALORAPARTIR,0) DESC
    `);
  const regra = regraR.recordset[0];
  if (!regra) return null;
  const existente = await pool.request()
    .input("guid", sql.UniqueIdentifier, guidLancamento)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query("SELECT TOP 1 GUIDAPROVACAO FROM KS0003.KS00029 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade AND STATUS IN ('AGUARDANDO_APROVACAO','APROVADO')");
  if (existente.recordset.length) return existente.recordset[0];
  const guidAprovacao = crypto.randomUUID();
  await pool.request()
    .input("guid", sql.UniqueIdentifier, guidAprovacao)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .input("guidlancamento", sql.UniqueIdentifier, guidLancamento)
    .input("guidregra", sql.UniqueIdentifier, regra.GUIDREGRA)
    .input("niveis", sql.Int, regra.NIVEIS ?? 1)
    .input("usuario", sql.UniqueIdentifier, guidUsuario)
    .query(`
      INSERT INTO KS0003.KS00029
        (GUIDAPROVACAO,GUIDENTIDADE,GUIDLANCAMENTO,GUIDREGRA,NIVEISNECESSARIOS,GUIDUSUARIOLANCAMENTO,USUARIOCRIACAO,USUARIOALTERACAO)
      VALUES
        (@guid,@guidentidade,@guidlancamento,@guidregra,@niveis,@usuario,@usuario,@usuario)
    `);
  return { GUIDAPROVACAO: guidAprovacao };
}

export async function validarPagamentoAprovado(pool: Awaited<ReturnType<typeof getSqlPool>>, guidLancamento: string, guidEntidade: string, guidUsuario: string) {
  await garantirTabelasCobrancaAprovacao(pool);
  await garantirAprovacaoParaTitulo(pool, guidLancamento, guidEntidade, guidUsuario);
  const apR = await pool.request()
    .input("guid", sql.UniqueIdentifier, guidLancamento)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query("SELECT TOP 1 STATUS FROM KS0003.KS00029 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade ORDER BY DATACRIACAO DESC");
  const status = apR.recordset[0]?.STATUS as string | undefined;
  if (status && status !== "APROVADO") {
    await auditarFinanceiro(pool, { guidEntidade, guidUsuario, origem: "APROVACAO_PAGAMENTOS", acao: "BAIXA_BLOQUEADA", tabela: "KS0003.KS00004", guidRegistro: guidLancamento, novo: { status } });
    throw new TRPCError({ code: "BAD_REQUEST", message: `Pagamento bloqueado: aprovação ${status.toLowerCase().replaceAll("_", " ")}.` });
  }
}

export const cobrancaAprovacaoRouter = router({
  modelos: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const r = await pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade).query(`
      SELECT CAST(GUIDMODELO AS NVARCHAR(36)) AS guidModelo, NOME, CANAL, MENSAGEM, STATUS
      FROM KS0003.KS00024 WHERE GUIDENTIDADE=@guidentidade ORDER BY NOME
    `);
    return r.recordset;
  }),

  salvarModelo: publicProcedure.input(z.object({
    guidModelo: z.string().uuid().optional(),
    nome: z.string().min(1).max(100),
    canal: canalSchema,
    mensagem: z.string().min(1),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const guid = input.guidModelo ?? crypto.randomUUID();
    await pool.request()
      .input("guid", sql.UniqueIdentifier, guid)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("nome", sql.NVarChar(100), input.nome)
      .input("canal", sql.NVarChar(20), input.canal)
      .input("mensagem", sql.NVarChar(sql.MAX), input.mensagem)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query(`
        MERGE KS0003.KS00024 AS t USING (SELECT @guid AS g) s ON t.GUIDMODELO=@guid
        WHEN MATCHED THEN UPDATE SET NOME=@nome,CANAL=@canal,MENSAGEM=@mensagem,DATAALTERACAO=GETDATE(),USUARIOALTERACAO=@usuario
        WHEN NOT MATCHED THEN INSERT (GUIDMODELO,GUIDENTIDADE,NOME,CANAL,MENSAGEM,USUARIOCRIACAO,USUARIOALTERACAO)
          VALUES (@guid,@guidentidade,@nome,@canal,@mensagem,@usuario,@usuario);
      `);
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "COBRANCA_AUTOMATICA", acao: "SALVAR_MODELO", tabela: "KS0003.KS00024", guidRegistro: guid, novo: input });
    return { success: true, guidModelo: guid };
  }),

  regrasCobranca: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const r = await pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade).query(`
      SELECT CAST(r.GUIDREGUA AS NVARCHAR(36)) AS guidRegua, r.CODFILIAL, r.DIASRELATIVOS, r.DIAVENCIMENTO, r.CANAL,
        CAST(r.GUIDMODELO AS NVARCHAR(36)) AS guidModelo, m.NOME AS nomeModelo, r.STATUSCLIENTE, r.VALORMINIMO, r.REENVIARAPOSDIAS, r.ATIVA
      FROM KS0003.KS00025 r LEFT JOIN KS0003.KS00024 m ON m.GUIDMODELO=r.GUIDMODELO
      WHERE r.GUIDENTIDADE=@guidentidade ORDER BY r.DIASRELATIVOS
    `);
    return r.recordset;
  }),

  salvarRegua: publicProcedure.input(z.object({
    guidRegua: z.string().uuid().optional(),
    codFilial: z.number().int().optional().nullable(),
    diasRelativos: z.number().int(),
    diaVencimento: z.boolean().default(false),
    canal: canalSchema,
    guidModelo: z.string().uuid().optional().nullable(),
    statusCliente: z.string().max(20).optional().nullable(),
    valorMinimo: z.number().min(0).default(0),
    reenviarAposDias: z.number().int().optional().nullable(),
    ativa: z.boolean().default(true),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const guid = input.guidRegua ?? crypto.randomUUID();
    await pool.request()
      .input("guid", sql.UniqueIdentifier, guid)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("codfilial", sql.Int, input.codFilial ?? null)
      .input("dias", sql.Int, input.diasRelativos)
      .input("dia", sql.Bit, input.diaVencimento ? 1 : 0)
      .input("canal", sql.NVarChar(20), input.canal)
      .input("guidmodelo", sql.UniqueIdentifier, input.guidModelo ?? null)
      .input("statuscliente", sql.NVarChar(20), input.statusCliente ?? null)
      .input("valorminimo", sql.Decimal(15,2), input.valorMinimo)
      .input("reenviar", sql.Int, input.reenviarAposDias ?? null)
      .input("ativa", sql.Bit, input.ativa ? 1 : 0)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query(`
        MERGE KS0003.KS00025 AS t USING (SELECT @guid AS g) s ON t.GUIDREGUA=@guid
        WHEN MATCHED THEN UPDATE SET CODFILIAL=@codfilial,DIASRELATIVOS=@dias,DIAVENCIMENTO=@dia,CANAL=@canal,GUIDMODELO=@guidmodelo,
          STATUSCLIENTE=@statuscliente,VALORMINIMO=@valorminimo,REENVIARAPOSDIAS=@reenviar,ATIVA=@ativa,DATAALTERACAO=GETDATE(),USUARIOALTERACAO=@usuario
        WHEN NOT MATCHED THEN INSERT (GUIDREGUA,GUIDENTIDADE,CODFILIAL,DIASRELATIVOS,DIAVENCIMENTO,CANAL,GUIDMODELO,STATUSCLIENTE,VALORMINIMO,REENVIARAPOSDIAS,ATIVA,USUARIOCRIACAO,USUARIOALTERACAO)
          VALUES (@guid,@guidentidade,@codfilial,@dias,@dia,@canal,@guidmodelo,@statuscliente,@valorminimo,@reenviar,@ativa,@usuario,@usuario);
      `);
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "COBRANCA_AUTOMATICA", acao: "SALVAR_REGUA", tabela: "KS0003.KS00025", guidRegistro: guid, novo: input });
    return { success: true, guidRegua: guid };
  }),

  listarTitulosCobranca: publicProcedure.input(z.object({
    cliente: z.string().optional(),
    dtInicio: z.string().optional(),
    dtFim: z.string().optional(),
    valorMin: z.number().optional(),
    status: cobrancaStatusSchema.or(z.literal("TODOS")).default("PENDENTE"),
    codFilial: z.number().int().optional(),
  }).optional()).query(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const where = ["cr.GUIDENTIDADE=@guidentidade", "cr.STATUS IN ('ABERTO','PARCIAL')"];
    const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
    if (input?.cliente) { where.push("cr.NOMEDEVEDOR LIKE @cliente"); req.input("cliente", sql.NVarChar(140), `%${input.cliente}%`); }
    if (input?.dtInicio) { where.push("cr.DTVENCIMENTO>=CONVERT(DATE,@dtinicio)"); req.input("dtinicio", sql.NVarChar(10), input.dtInicio); }
    if (input?.dtFim) { where.push("cr.DTVENCIMENTO<=CONVERT(DATE,@dtfim)"); req.input("dtfim", sql.NVarChar(10), input.dtFim); }
    if (input?.valorMin != null) { where.push("(cr.VALOR-cr.VALORRECEBIDO)>=@valor"); req.input("valor", sql.Decimal(15,2), input.valorMin); }
    const r = await req.query(`
      SELECT TOP 300
        CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
        CAST(cr.GUIDDEVEDOR AS NVARCHAR(36)) AS guidCliente,
        cr.NOMEDEVEDOR, cr.DESCRICAO, cr.NUMERODOC, cr.VALOR, cr.VALORRECEBIDO,
        cr.VALOR-cr.VALORRECEBIDO AS SALDO,
        CONVERT(NVARCHAR(10),cr.DTVENCIMENTO,23) AS DTVENCIMENTO,
        CASE WHEN cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN 'VENCIDO' WHEN cr.DTVENCIMENTO=CAST(GETDATE() AS DATE) THEN 'VENCE_HOJE' ELSE 'A_VENCER' END AS faixa,
        h.ultimoStatus, h.ultimaCobranca
      FROM KS0003.KS00005 cr
      OUTER APPLY (
        SELECT TOP 1 STATUSENVIO AS ultimoStatus, DATAHORA AS ultimaCobranca
        FROM KS0003.KS00027 h WHERE h.GUIDLANCAMENTO=cr.GUIDLANCAMENTO AND h.GUIDENTIDADE=cr.GUIDENTIDADE ORDER BY DATAHORA DESC
      ) h
      WHERE ${where.join(" AND ")}
      ORDER BY cr.DTVENCIMENTO
    `);
    return r.recordset;
  }),

  enviarCobranca: publicProcedure.input(z.object({
    guidLancamento: z.string().uuid(),
    canal: canalSchema,
    mensagem: z.string().optional(),
    forcarReenvio: z.boolean().default(false),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const tituloR = await pool.request()
      .input("guid", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query("SELECT TOP 1 *, VALOR-VALORRECEBIDO AS SALDO, CONVERT(NVARCHAR(10),DTVENCIMENTO,23) AS DTVENCIMENTO_STR FROM KS0003.KS00005 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");
    const titulo = tituloR.recordset[0];
    if (!titulo) throw new TRPCError({ code: "NOT_FOUND", message: "Titulo nao encontrado." });
    const dup = await pool.request()
      .input("guid", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("canal", sql.NVarChar(20), input.canal)
      .query("SELECT TOP 1 1 FROM KS0003.KS00027 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade AND CANAL=@canal AND CONVERT(DATE,DATAHORA)=CAST(GETDATE() AS DATE) AND STATUSENVIO='ENVIADO'");
    if (dup.recordset.length && !input.forcarReenvio) throw new TRPCError({ code: "BAD_REQUEST", message: "Cobrança já enviada hoje para este título/canal." });
    const mensagem = input.mensagem || aplicarModelo("Olá {{cliente}}, identificamos o título {{titulo}} no valor de {{valor}} com vencimento em {{vencimento}}.", { ...titulo, DTVENCIMENTO: titulo.DTVENCIMENTO_STR });
    const tentativaR = await pool.request().input("guid", sql.UniqueIdentifier, input.guidLancamento).query("SELECT COUNT(*)+1 AS t FROM KS0003.KS00027 WHERE GUIDLANCAMENTO=@guid");
    const tentativa = tentativaR.recordset[0]?.t ?? 1;
    const guidFila = crypto.randomUUID();
    await pool.request()
      .input("guidfila", sql.UniqueIdentifier, guidFila)
      .input("guidhist", sql.UniqueIdentifier, crypto.randomUUID())
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidcliente", sql.UniqueIdentifier, titulo.GUIDDEVEDOR ?? null)
      .input("canal", sql.NVarChar(20), input.canal)
      .input("mensagem", sql.NVarChar(sql.MAX), mensagem)
      .input("tentativa", sql.Int, tentativa)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query(`
        INSERT INTO KS0003.KS00026 (GUIDFILA,GUIDENTIDADE,GUIDLANCAMENTO,GUIDCLIENTE,CANAL,MENSAGEM,TENTATIVA,STATUS,DATAENVIO,USUARIOCRIACAO,USUARIOALTERACAO)
        VALUES (@guidfila,@guidentidade,@guidlancamento,@guidcliente,@canal,@mensagem,@tentativa,'ENVIADO',GETDATE(),@usuario,@usuario);
        INSERT INTO KS0003.KS00027 (GUIDHISTORICO,GUIDENTIDADE,GUIDLANCAMENTO,GUIDCLIENTE,CANAL,MENSAGEM,STATUSENVIO,RETORNO,TENTATIVA,USUARIO)
        VALUES (@guidhist,@guidentidade,@guidlancamento,@guidcliente,@canal,@mensagem,'ENVIADO','Envio simulado; integração futura preparada.',@tentativa,@usuario);
      `);
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "COBRANCA_AUTOMATICA", acao: "ENVIAR_COBRANCA", tabela: "KS0003.KS00027", guidRegistro: input.guidLancamento, novo: { canal: input.canal, tentativa } });
    return { success: true, status: "ENVIADO" };
  }),

  alterarStatusCobranca: publicProcedure.input(z.object({
    guidLancamento: z.string().uuid(),
    status: z.enum(["PAUSADO", "NEGOCIADO", "CANCELADO"]),
    observacao: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    await pool.request()
      .input("guidhist", sql.UniqueIdentifier, crypto.randomUUID())
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("guidlancamento", sql.UniqueIdentifier, input.guidLancamento)
      .input("status", sql.NVarChar(20), input.status)
      .input("retorno", sql.NVarChar(sql.MAX), input.observacao ?? null)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query("INSERT INTO KS0003.KS00027 (GUIDHISTORICO,GUIDENTIDADE,GUIDLANCAMENTO,CANAL,MENSAGEM,STATUSENVIO,RETORNO,USUARIO) VALUES (@guidhist,@guidentidade,@guidlancamento,'INTERNO',NULL,@status,@retorno,@usuario)");
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "COBRANCA_AUTOMATICA", acao: input.status, tabela: "KS0003.KS00027", guidRegistro: input.guidLancamento, novo: input });
    return { success: true };
  }),

  historicoCobranca: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).query(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const r = await pool.request()
      .input("guid", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query("SELECT CANAL, MENSAGEM, STATUSENVIO, RETORNO, TENTATIVA, USUARIO, DATAHORA FROM KS0003.KS00027 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade ORDER BY DATAHORA DESC");
    return r.recordset;
  }),

  regrasAprovacao: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const r = await pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade).query(`
      SELECT CAST(GUIDREGRA AS NVARCHAR(36)) AS guidRegra, DESCRICAO, ATIVA, EXIGEAPROVACAO, VALORAPARTIR,
        CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
        CAST(GUIDFORNECEDOR AS NVARCHAR(36)) AS guidFornecedor, NIVEIS, BLOQUEARAPROVADORORIGEM
      FROM KS0003.KS00028 WHERE GUIDENTIDADE=@guidentidade ORDER BY DESCRICAO
    `);
    return r.recordset;
  }),

  salvarRegraAprovacao: publicProcedure.input(z.object({
    guidRegra: z.string().uuid().optional(),
    descricao: z.string().min(1).max(120),
    ativa: z.boolean().default(true),
    exigeAprovacao: z.boolean().default(true),
    valorApartir: z.number().min(0).optional().nullable(),
    guidCentro: z.string().uuid().optional().nullable(),
    guidNatureza: z.string().uuid().optional().nullable(),
    guidFornecedor: z.string().uuid().optional().nullable(),
    niveis: z.number().int().min(1).max(5).default(1),
    bloquearAprovadorOrigem: z.boolean().default(false),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const guid = input.guidRegra ?? crypto.randomUUID();
    await pool.request()
      .input("guid", sql.UniqueIdentifier, guid)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .input("descricao", sql.NVarChar(120), input.descricao)
      .input("ativa", sql.Bit, input.ativa ? 1 : 0)
      .input("exige", sql.Bit, input.exigeAprovacao ? 1 : 0)
      .input("valor", sql.Decimal(15,2), input.valorApartir ?? null)
      .input("guidcentro", sql.UniqueIdentifier, input.guidCentro ?? null)
      .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza ?? null)
      .input("guidfornecedor", sql.UniqueIdentifier, input.guidFornecedor ?? null)
      .input("niveis", sql.Int, input.niveis)
      .input("bloquear", sql.Bit, input.bloquearAprovadorOrigem ? 1 : 0)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query(`
        MERGE KS0003.KS00028 AS t USING (SELECT @guid AS g) s ON t.GUIDREGRA=@guid
        WHEN MATCHED THEN UPDATE SET DESCRICAO=@descricao,ATIVA=@ativa,EXIGEAPROVACAO=@exige,VALORAPARTIR=@valor,GUIDCENTRO=@guidcentro,GUIDNATUREZA=@guidnatureza,GUIDFORNECEDOR=@guidfornecedor,NIVEIS=@niveis,BLOQUEARAPROVADORORIGEM=@bloquear,DATAALTERACAO=GETDATE(),USUARIOALTERACAO=@usuario
        WHEN NOT MATCHED THEN INSERT (GUIDREGRA,GUIDENTIDADE,DESCRICAO,ATIVA,EXIGEAPROVACAO,VALORAPARTIR,GUIDCENTRO,GUIDNATUREZA,GUIDFORNECEDOR,NIVEIS,BLOQUEARAPROVADORORIGEM,USUARIOCRIACAO,USUARIOALTERACAO)
          VALUES (@guid,@guidentidade,@descricao,@ativa,@exige,@valor,@guidcentro,@guidnatureza,@guidfornecedor,@niveis,@bloquear,@usuario,@usuario);
      `);
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "APROVACAO_PAGAMENTOS", acao: "SALVAR_REGRA", tabela: "KS0003.KS00028", guidRegistro: guid, novo: input });
    return { success: true, guidRegra: guid };
  }),

  listarAprovacoes: publicProcedure.input(z.object({
    fornecedor: z.string().optional(),
    dtInicio: z.string().optional(),
    dtFim: z.string().optional(),
    valorMin: z.number().optional(),
    guidCentro: z.string().uuid().optional(),
    guidNatureza: z.string().uuid().optional(),
    status: aprovacaoStatusSchema.or(z.literal("TODOS")).default("AGUARDANDO_APROVACAO"),
  }).optional()).query(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const where = ["cp.GUIDENTIDADE=@guidentidade", "cp.STATUS IN ('ABERTO','PARCIAL')"];
    const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
    if (input?.fornecedor) { where.push("cp.NOMECREDOR LIKE @fornecedor"); req.input("fornecedor", sql.NVarChar(140), `%${input.fornecedor}%`); }
    if (input?.dtInicio) { where.push("cp.DTVENCIMENTO>=CONVERT(DATE,@dtinicio)"); req.input("dtinicio", sql.NVarChar(10), input.dtInicio); }
    if (input?.dtFim) { where.push("cp.DTVENCIMENTO<=CONVERT(DATE,@dtfim)"); req.input("dtfim", sql.NVarChar(10), input.dtFim); }
    if (input?.valorMin != null) { where.push("cp.VALOR>=@valor"); req.input("valor", sql.Decimal(15,2), input.valorMin); }
    if (input?.guidCentro) { where.push("cp.GUIDCENTRO=@guidcentro"); req.input("guidcentro", sql.UniqueIdentifier, input.guidCentro); }
    if (input?.guidNatureza) { where.push("cp.GUIDNATUREZA=@guidnatureza"); req.input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza); }
    const statusFilter = input?.status && input.status !== "TODOS" ? "AND ISNULL(ap.STATUS,'LANCADO')=@status" : "";
    if (input?.status && input.status !== "TODOS") req.input("status", sql.NVarChar(30), input.status);
    const r = await req.query(`
      SELECT TOP 300
        CAST(cp.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
        cp.DESCRICAO, cp.NOMECREDOR, cp.NUMERODOC, cp.VALOR, cp.VALORPAGO,
        CONVERT(NVARCHAR(10),cp.DTVENCIMENTO,23) AS dtVencimento,
        CAST(cp.GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, cc.CENTRO AS nomeCentro,
        CAST(cp.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, n.NATUREZA AS nomeNatureza,
        CAST(ap.GUIDAPROVACAO AS NVARCHAR(36)) AS guidAprovacao,
        ISNULL(ap.STATUS,'LANCADO') AS statusAprovacao, ap.NIVELATUAL, ap.NIVEISNECESSARIOS, ap.OBSERVACAO
      FROM KS0003.KS00004 cp
      OUTER APPLY (SELECT TOP 1 * FROM KS0003.KS00029 a WHERE a.GUIDLANCAMENTO=cp.GUIDLANCAMENTO AND a.GUIDENTIDADE=cp.GUIDENTIDADE ORDER BY a.DATACRIACAO DESC) ap
      LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO=cp.GUIDCENTRO
      LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=cp.GUIDNATUREZA
      WHERE ${where.join(" AND ")} ${statusFilter}
      ORDER BY cp.DTVENCIMENTO
    `);
    return r.recordset;
  }),

  gerarAprovacao: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    const r = await garantirAprovacaoParaTitulo(pool, input.guidLancamento, session.guidEntidade, session.guidPessoa);
    if (!r) return { success: true, mensagem: "Nenhuma regra exigiu aprovação." };
    return { success: true };
  }),

  acaoAprovacao: publicProcedure.input(z.object({
    guidLancamento: z.string().uuid(),
    acao: z.enum(["APROVAR", "REJEITAR", "DEVOLVER_AJUSTE"]),
    observacao: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const apR = await pool.request()
      .input("guid", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT TOP 1 ap.*, r.BLOQUEARAPROVADORORIGEM
        FROM KS0003.KS00029 ap LEFT JOIN KS0003.KS00028 r ON r.GUIDREGRA=ap.GUIDREGRA
        WHERE ap.GUIDLANCAMENTO=@guid AND ap.GUIDENTIDADE=@guidentidade
        ORDER BY ap.DATACRIACAO DESC
      `);
    const ap = apR.recordset[0];
    if (!ap) throw new TRPCError({ code: "NOT_FOUND", message: "Aprovação não encontrada." });
    if (input.acao !== "APROVAR" && !input.observacao?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Observação obrigatória para rejeição/devolução." });
    if (input.acao === "APROVAR" && ap.BLOQUEARAPROVADORORIGEM && String(ap.GUIDUSUARIOLANCAMENTO).toLowerCase() === session.guidPessoa.toLowerCase()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário que lançou não pode aprovar este pagamento." });
    }
    const novoStatus = input.acao === "REJEITAR" ? "REJEITADO" : input.acao === "DEVOLVER_AJUSTE" ? "DEVOLVIDO_AJUSTE" : (Number(ap.NIVELATUAL) >= Number(ap.NIVEISNECESSARIOS) ? "APROVADO" : "AGUARDANDO_APROVACAO");
    const novoNivel = input.acao === "APROVAR" && novoStatus !== "APROVADO" ? Number(ap.NIVELATUAL) + 1 : Number(ap.NIVELATUAL);
    await pool.request()
      .input("guidaprovacao", sql.UniqueIdentifier, ap.GUIDAPROVACAO)
      .input("status", sql.NVarChar(30), novoStatus)
      .input("nivel", sql.Int, novoNivel)
      .input("obs", sql.NVarChar(500), input.observacao ?? null)
      .input("usuario", sql.UniqueIdentifier, session.guidPessoa)
      .query(`
        UPDATE KS0003.KS00029 SET STATUS=@status,NIVELATUAL=@nivel,OBSERVACAO=@obs,DATAALTERACAO=GETDATE(),USUARIOALTERACAO=@usuario WHERE GUIDAPROVACAO=@guidaprovacao;
        INSERT INTO KS0003.KS00030 (GUIDHISTORICO,GUIDENTIDADE,GUIDAPROVACAO,GUIDLANCAMENTO,ACAO,NIVEL,USUARIO,OBSERVACAO)
        VALUES (NEWID(), (SELECT GUIDENTIDADE FROM KS0003.KS00029 WHERE GUIDAPROVACAO=@guidaprovacao), @guidaprovacao, (SELECT GUIDLANCAMENTO FROM KS0003.KS00029 WHERE GUIDAPROVACAO=@guidaprovacao), @status, @nivel, @usuario, @obs);
      `);
    await auditarFinanceiro(pool, { guidEntidade: session.guidEntidade, guidUsuario: session.guidPessoa, origem: "APROVACAO_PAGAMENTOS", acao: input.acao, tabela: "KS0003.KS00029", guidRegistro: ap.GUIDAPROVACAO, anterior: { status: ap.STATUS }, novo: { status: novoStatus, nivel: novoNivel, observacao: input.observacao } });
    return { success: true, status: novoStatus };
  }),

  historicoAprovacao: publicProcedure.input(z.object({ guidLancamento: z.string().uuid() })).query(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelasCobrancaAprovacao(pool);
    const r = await pool.request()
      .input("guid", sql.UniqueIdentifier, input.guidLancamento)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query("SELECT ACAO,NIVEL,USUARIO,OBSERVACAO,DATAHORA FROM KS0003.KS00030 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade ORDER BY DATAHORA DESC");
    return r.recordset;
  }),
});

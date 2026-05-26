/**
 * syncDelphiRouter — API REST de sincronização bidirecional Delphi ↔ KS Easy ERP
 *
 * Autenticação: Bearer token via header Authorization: Bearer <API_KEY>
 * O API_KEY é o campo APIKEY da tabela KS0002.KS00001 (empresa).
 *
 * Endpoints (via tRPC publicProcedure com verificação manual de API Key):
 *   POST /api/trpc/syncDelphi.push  — Delphi envia lote de registros para o ERP
 *   GET  /api/trpc/syncDelphi.pull  — Delphi busca delta de alterações desde último sync
 *   POST /api/trpc/syncDelphi.ack   — Delphi confirma recebimento (atualiza lastSyncAt)
 *   GET  /api/trpc/syncDelphi.info  — Retorna metadados da empresa e timestamp do servidor
 *
 * Tabela de controle de sync: KS0002.KS00010 (criada automaticamente se não existir)
 *   GUIDSYNC, GUIDENTIDADE, DISPOSITIVO, LASTSYNC_AT, LASTSYNC_PUSH, LASTSYNC_PULL
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import crypto from "crypto";

// ─── Autenticação via API Key ──────────────────────────────────────────────
async function autenticarApiKey(req: { headers: Record<string, string | string[] | undefined> }) {
  const authHeader = (req.headers["authorization"] as string | undefined) ?? "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!apiKey) throw new TRPCError({ code: "UNAUTHORIZED", message: "API Key ausente. Use: Authorization: Bearer <API_KEY>" });

  const pool = await getSqlPool();
  const r = await pool.request()
    .input("apikey", sql.NVarChar(100), apiKey)
    .query(`
      SELECT TOP 1
        CAST(GUIDENTIDADE AS NVARCHAR(36)) AS guidEntidade,
        RAZAOSOCIAL, FANTASIA, CNPJ, SITUACAO
      FROM KS0002.KS00001
      WHERE APIKEY = @apikey AND SITUACAO = 'A'
    `);

  if (!r.recordset.length) throw new TRPCError({ code: "UNAUTHORIZED", message: "API Key inválida ou empresa inativa." });
  return r.recordset[0] as { guidEntidade: string; RAZAOSOCIAL: string; FANTASIA: string; CNPJ: string; SITUACAO: string };
}

// ─── Garantir tabela de controle de sync ──────────────────────────────────
async function garantirTabelaSync(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0002' AND TABLE_NAME='KS00010')
    CREATE TABLE KS0002.KS00010 (
      GUIDSYNC        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE    UNIQUEIDENTIFIER NOT NULL,
      DISPOSITIVO     NVARCHAR(100)    NOT NULL DEFAULT 'default',
      LASTSYNC_AT     DATETIME         NULL,
      LASTSYNC_PUSH   DATETIME         NULL,
      LASTSYNC_PULL   DATETIME         NULL,
      VERSAO_DELPHI   NVARCHAR(20)     NULL,
      CONSTRAINT FK_SYNC_ENTIDADE FOREIGN KEY (GUIDENTIDADE) REFERENCES KS0002.KS00001(GUIDENTIDADE)
    )
  `);
}

// ─── Schemas Zod ──────────────────────────────────────────────────────────

const PessoaSchema = z.object({
  guidPessoa:    z.string().uuid().optional(),
  nome:          z.string().min(1),
  fantasia:      z.string().optional(),
  documento:     z.string().optional(),
  tipodoc:       z.number().int().optional(), // 1=CPF, 2=CNPJ
  telefone:      z.string().optional(),
  celular:       z.string().optional(),
  email:         z.string().optional(),
  cep:           z.string().optional(),
  endereco:      z.string().optional(),
  numero:        z.string().optional(),
  bairro:        z.string().optional(),
  complemento:   z.string().optional(),
  cidade:        z.string().optional(),
  uf:            z.string().max(2).optional(),
  cadCliente:    z.boolean().optional(),
  cadFornecedor: z.boolean().optional(),
  situacao:      z.enum(["A","I"]).optional(),
  ultimaAlteracao: z.string().optional(), // ISO datetime
});

const ContaReceberSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  descricao:       z.string().min(1),
  guidDevedor:     z.string().uuid().optional(),
  nomeDevedor:     z.string().min(1),
  valor:           z.number().positive(),
  valorRecebido:   z.number().min(0).optional(),
  dtLancamento:    z.string(), // YYYY-MM-DD
  dtVencimento:    z.string(), // YYYY-MM-DD
  dtRecebimento:   z.string().optional(),
  status:          z.enum(["ABERTO","PAGO","PARCIAL","CANCELADO"]).optional(),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const ContaPagarSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  descricao:       z.string().min(1),
  guidCredor:      z.string().uuid().optional(),
  nomeCredor:      z.string().min(1),
  valor:           z.number().positive(),
  valorPago:       z.number().min(0).optional(),
  dtLancamento:    z.string(),
  dtVencimento:    z.string(),
  dtPagamento:     z.string().optional(),
  status:          z.enum(["ABERTO","PAGO","PARCIAL","CANCELADO"]).optional(),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

const LancamentoCaixaSchema = z.object({
  guidLancamento:  z.string().uuid().optional(),
  dtLancamento:    z.string(),
  tipo:            z.enum(["E","S"]),
  valor:           z.number().positive(),
  descricao:       z.string().min(1),
  numerodoc:       z.string().optional(),
  observacao:      z.string().optional(),
  ultimaAlteracao: z.string().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────
export const syncDelphiRouter = router({

  /**
   * GET /api/trpc/syncDelphi.info
   * Retorna metadados da empresa e timestamp do servidor.
   * Usado pelo Delphi para verificar conectividade e sincronização.
   */
  info: publicProcedure.query(async ({ ctx }) => {
    const empresa = await autenticarApiKey(ctx.req);
    const pool = await getSqlPool();
    await garantirTabelaSync(pool);

    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
      .query(`
        SELECT LASTSYNC_AT, LASTSYNC_PUSH, LASTSYNC_PULL, DISPOSITIVO, VERSAO_DELPHI
        FROM KS0002.KS00010
        WHERE GUIDENTIDADE = @guidentidade
      `);

    return {
      serverTime:     new Date().toISOString(),
      guidEntidade:   empresa.guidEntidade,
      razaoSocial:    empresa.RAZAOSOCIAL,
      fantasia:       empresa.FANTASIA,
      cnpj:           empresa.CNPJ,
      lastSyncAt:     r.recordset[0]?.LASTSYNC_AT ?? null,
      lastSyncPush:   r.recordset[0]?.LASTSYNC_PUSH ?? null,
      lastSyncPull:   r.recordset[0]?.LASTSYNC_PULL ?? null,
      versaoDelphi:   r.recordset[0]?.VERSAO_DELPHI ?? null,
    };
  }),

  /**
   * POST /api/trpc/syncDelphi.push
   * Delphi envia lote de registros para o ERP (upsert via MERGE).
   * Suporta: pessoas, contasReceber, contasPagar, lancamentosCaixa.
   */
  push: publicProcedure
    .input(z.object({
      dispositivo:    z.string().default("default"),
      versaoDelphi:   z.string().optional(),
      pessoas:        z.array(PessoaSchema).optional(),
      contasReceber:  z.array(ContaReceberSchema).optional(),
      contasPagar:    z.array(ContaPagarSchema).optional(),
      lancamentosCaixa: z.array(LancamentoCaixaSchema).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      const resultado = {
        pessoas:          { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasReceber:    { inseridos: 0, atualizados: 0, erros: [] as string[] },
        contasPagar:      { inseridos: 0, atualizados: 0, erros: [] as string[] },
        lancamentosCaixa: { inseridos: 0, atualizados: 0, erros: [] as string[] },
      };

      // ── Pessoas ──
      for (const p of input.pessoas ?? []) {
        try {
          const guid = p.guidPessoa ?? crypto.randomUUID();
          const r = await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("nome",         sql.NVarChar(150),    p.nome)
            .input("fantasia",     sql.NVarChar(100),    p.fantasia ?? null)
            .input("documento",    sql.NVarChar(20),     p.documento ?? null)
            .input("tipodoc",      sql.TinyInt,          p.tipodoc ?? null)
            .input("telefone",     sql.NVarChar(20),     p.telefone ?? null)
            .input("celular",      sql.NVarChar(20),     p.celular ?? null)
            .input("email",        sql.NVarChar(100),    p.email ?? null)
            .input("cep",          sql.NVarChar(9),      p.cep ?? null)
            .input("endereco",     sql.NVarChar(150),    p.endereco ?? null)
            .input("numero",       sql.NVarChar(10),     p.numero ?? null)
            .input("bairro",       sql.NVarChar(80),     p.bairro ?? null)
            .input("complemento",  sql.NVarChar(80),     p.complemento ?? null)
            .input("cidade",       sql.NVarChar(80),     p.cidade ?? null)
            .input("uf",           sql.Char(2),          p.uf ?? null)
            .input("cadCliente",   sql.Bit,              p.cadCliente ? 1 : 0)
            .input("cadFornecedor",sql.Bit,              p.cadFornecedor ? 1 : 0)
            .input("situacao",     sql.Char(1),          p.situacao ?? "A")
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0002.KS00001 AS t
              USING (SELECT @guid AS GUIDENTIDADE_PESSOA) AS s ON t.GUIDENTIDADE = @guid
              WHEN MATCHED THEN UPDATE SET
                NOME=@nome, FANTASIA=@fantasia, DOCUMENTO=@documento, CODTIPODOCUMENTO=@tipodoc,
                TELEFONE=@telefone, CELULAR=@celular, EMAIL=@email, CEP=@cep,
                ENDERECO=@endereco, NUMERO=@numero, BAIRRO=@bairro, COMPLEMENTO=@complemento,
                CIDADE=@cidade, UF=@uf, CADCLIENTE=@cadCliente, CADFORNECEDOR=@cadFornecedor,
                SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDENTIDADE,NOME,FANTASIA,DOCUMENTO,CODTIPODOCUMENTO,TELEFONE,CELULAR,EMAIL,
                 CEP,ENDERECO,NUMERO,BAIRRO,COMPLEMENTO,CIDADE,UF,CADCLIENTE,CADFORNECEDOR,
                 SITUACAO,CODENTIDADE,DATACADASTRO,ULTIMAALTERACAO)
              VALUES
                (@guid,@nome,@fantasia,@documento,@tipodoc,@telefone,@celular,@email,
                 @cep,@endereco,@numero,@bairro,@complemento,@cidade,@uf,@cadCliente,@cadFornecedor,
                 @situacao,@guidentidade,GETDATE(),GETDATE());
              SELECT @@ROWCOUNT AS affected, CASE WHEN EXISTS(SELECT 1 FROM KS0002.KS00001 WHERE GUIDENTIDADE=@guid AND DATACADASTRO=ULTIMAALTERACAO) THEN 'insert' ELSE 'update' END AS op
            `);
          const op = r.recordset[0]?.op;
          if (op === "insert") resultado.pessoas.inseridos++;
          else resultado.pessoas.atualizados++;
        } catch (e: any) {
          resultado.pessoas.erros.push(`${p.nome}: ${e.message}`);
        }
      }

      // ── Contas a Receber ──
      for (const cr of input.contasReceber ?? []) {
        try {
          const guid = cr.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",          sql.UniqueIdentifier, guid)
            .input("descricao",     sql.NVarChar(200),    cr.descricao)
            .input("guidDevedor",   sql.UniqueIdentifier, cr.guidDevedor ?? null)
            .input("nomeDevedor",   sql.NVarChar(150),    cr.nomeDevedor)
            .input("valor",         sql.Decimal(15,2),    cr.valor)
            .input("valorRecebido", sql.Decimal(15,2),    cr.valorRecebido ?? 0)
            .input("dtLancamento",  sql.NVarChar(10),     cr.dtLancamento)
            .input("dtVencimento",  sql.NVarChar(10),     cr.dtVencimento)
            .input("dtRecebimento", sql.NVarChar(10),     cr.dtRecebimento ?? null)
            .input("status",        sql.NVarChar(10),     cr.status ?? "ABERTO")
            .input("numerodoc",     sql.NVarChar(30),     cr.numerodoc ?? null)
            .input("observacao",    sql.NVarChar(500),    cr.observacao ?? null)
            .input("guidentidade",  sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00005 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                DESCRICAO=@descricao, NOMEDEVEDOR=@nomeDevedor, VALOR=@valor,
                VALORRECEBIDO=@valorRecebido, DTVENCIMENTO=CONVERT(DATE,@dtVencimento),
                DTRECEBIMENTO=CASE WHEN @dtRecebimento IS NULL THEN NULL ELSE CONVERT(DATE,@dtRecebimento) END,
                STATUS=@status, NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DESCRICAO,GUIDDEVEDOR,NOMEDEVEDOR,VALOR,VALORRECEBIDO,
                 DTLANCAMENTO,DTVENCIMENTO,STATUS,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,@descricao,@guidDevedor,@nomeDevedor,@valor,@valorRecebido,
                 CONVERT(DATE,@dtLancamento),CONVERT(DATE,@dtVencimento),@status,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.contasReceber.inseridos++;
        } catch (e: any) {
          resultado.contasReceber.erros.push(`${cr.descricao}: ${e.message}`);
        }
      }

      // ── Contas a Pagar ──
      for (const cp of input.contasPagar ?? []) {
        try {
          const guid = cp.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("descricao",    sql.NVarChar(200),    cp.descricao)
            .input("guidCredor",   sql.UniqueIdentifier, cp.guidCredor ?? null)
            .input("nomeCredor",   sql.NVarChar(150),    cp.nomeCredor)
            .input("valor",        sql.Decimal(15,2),    cp.valor)
            .input("valorPago",    sql.Decimal(15,2),    cp.valorPago ?? 0)
            .input("dtLancamento", sql.NVarChar(10),     cp.dtLancamento)
            .input("dtVencimento", sql.NVarChar(10),     cp.dtVencimento)
            .input("dtPagamento",  sql.NVarChar(10),     cp.dtPagamento ?? null)
            .input("status",       sql.NVarChar(10),     cp.status ?? "ABERTO")
            .input("numerodoc",    sql.NVarChar(30),     cp.numerodoc ?? null)
            .input("observacao",   sql.NVarChar(500),    cp.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00004 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                DESCRICAO=@descricao, NOMECREDOR=@nomeCredor, VALOR=@valor,
                VALORPAGO=@valorPago, DTVENCIMENTO=CONVERT(DATE,@dtVencimento),
                DTPAGAMENTO=CASE WHEN @dtPagamento IS NULL THEN NULL ELSE CONVERT(DATE,@dtPagamento) END,
                STATUS=@status, NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DESCRICAO,GUIDCREDOR,NOMECREDOR,VALOR,VALORPAGO,
                 DTLANCAMENTO,DTVENCIMENTO,STATUS,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,@descricao,@guidCredor,@nomeCredor,@valor,@valorPago,
                 CONVERT(DATE,@dtLancamento),CONVERT(DATE,@dtVencimento),@status,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.contasPagar.inseridos++;
        } catch (e: any) {
          resultado.contasPagar.erros.push(`${cp.descricao}: ${e.message}`);
        }
      }

      // ── Lançamentos de Caixa ──
      for (const lc of input.lancamentosCaixa ?? []) {
        try {
          const guid = lc.guidLancamento ?? crypto.randomUUID();
          await pool.request()
            .input("guid",         sql.UniqueIdentifier, guid)
            .input("dtLancamento", sql.NVarChar(10),     lc.dtLancamento)
            .input("tipo",         sql.Char(1),          lc.tipo)
            .input("valor",        sql.Decimal(15,2),    lc.valor)
            .input("descricao",    sql.NVarChar(200),    lc.descricao)
            .input("numerodoc",    sql.NVarChar(30),     lc.numerodoc ?? null)
            .input("observacao",   sql.NVarChar(500),    lc.observacao ?? null)
            .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
            .query(`
              MERGE KS0003.KS00010 AS t
              USING (SELECT @guid AS g) AS s ON t.GUIDLANCAMENTO = @guid
              WHEN MATCHED THEN UPDATE SET
                TIPO=@tipo, VALOR=@valor, DESCRICAO=@descricao,
                NUMERODOC=@numerodoc, OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE()
              WHEN NOT MATCHED THEN INSERT
                (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,NUMERODOC,OBSERVACAO,GUIDENTIDADE)
              VALUES
                (@guid,CONVERT(DATE,@dtLancamento),@tipo,@valor,@descricao,@numerodoc,@observacao,@guidentidade)
            `);
          resultado.lancamentosCaixa.inseridos++;
        } catch (e: any) {
          resultado.lancamentosCaixa.erros.push(`${lc.descricao}: ${e.message}`);
        }
      }

      // Atualizar timestamp de push
      await pool.request()
        .input("guidentidade",  sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",   sql.NVarChar(100),    input.dispositivo)
        .input("versaoDelphi",  sql.NVarChar(20),     input.versaoDelphi ?? null)
        .query(`
          MERGE KS0002.KS00010 AS t
          USING (SELECT @guidentidade AS g, @dispositivo AS d) AS s
            ON t.GUIDENTIDADE = @guidentidade AND t.DISPOSITIVO = @dispositivo
          WHEN MATCHED THEN UPDATE SET LASTSYNC_PUSH=GETDATE(), LASTSYNC_AT=GETDATE(), VERSAO_DELPHI=@versaoDelphi
          WHEN NOT MATCHED THEN INSERT (GUIDENTIDADE,DISPOSITIVO,LASTSYNC_PUSH,LASTSYNC_AT,VERSAO_DELPHI)
            VALUES (@guidentidade,@dispositivo,GETDATE(),GETDATE(),@versaoDelphi)
        `);

      return { success: true, resultado, syncedAt: new Date().toISOString() };
    }),

  /**
   * GET /api/trpc/syncDelphi.pull
   * Retorna delta de alterações desde o último sync (ou desde dtDesde).
   * Delphi usa para atualizar sua base local.
   */
  pull: publicProcedure
    .input(z.object({
      dispositivo: z.string().default("default"),
      dtDesde:     z.string().optional(), // ISO datetime, ex: "2026-05-01T00:00:00"
      entidades:   z.array(z.enum(["pessoas","contasReceber","contasPagar","lancamentosCaixa","planoContas","centroCusto","naturezaCaixa","formasPagamento"])).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      // Buscar último sync deste dispositivo
      const dispositivo = input?.dispositivo ?? "default";
      const syncR = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    dispositivo)
        .query(`SELECT LASTSYNC_PULL FROM KS0002.KS00010 WHERE GUIDENTIDADE=@guidentidade AND DISPOSITIVO=@dispositivo`);

      const lastPull = input?.dtDesde ?? syncR.recordset[0]?.LASTSYNC_PULL ?? "2000-01-01T00:00:00";
      const entidades = input?.entidades ?? ["pessoas","contasReceber","contasPagar","lancamentosCaixa"];

      const delta: Record<string, unknown[]> = {};

      if (entidades.includes("pessoas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDENTIDADE AS NVARCHAR(36)) AS guidPessoa,
              NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO AS tipodoc,
              TELEFONE, CELULAR, EMAIL, CEP, ENDERECO, NUMERO, BAIRRO,
              COMPLEMENTO, CIDADE, UF, CADCLIENTE, CADFORNECEDOR, SITUACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0002.KS00001
            WHERE CODENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.pessoas = r.recordset;
      }

      if (entidades.includes("contasReceber")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              DESCRICAO, CAST(GUIDDEVEDOR AS NVARCHAR(36)) AS guidDevedor, NOMEDEVEDOR,
              VALOR, VALORRECEBIDO, FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              FORMAT(DTVENCIMENTO,'yyyy-MM-dd') AS dtVencimento,
              FORMAT(DTRECEBIMENTO,'yyyy-MM-dd') AS dtRecebimento,
              STATUS, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00005
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasReceber = r.recordset;
      }

      if (entidades.includes("contasPagar")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              DESCRICAO, CAST(GUIDCREDOR AS NVARCHAR(36)) AS guidCredor, NOMECREDOR,
              VALOR, VALORPAGO, FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              FORMAT(DTVENCIMENTO,'yyyy-MM-dd') AS dtVencimento,
              FORMAT(DTPAGAMENTO,'yyyy-MM-dd') AS dtPagamento,
              STATUS, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00004
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.contasPagar = r.recordset;
      }

      if (entidades.includes("lancamentosCaixa")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .input("desde",        sql.NVarChar(30),     lastPull)
          .query(`
            SELECT TOP 500
              CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
              FORMAT(DTLANCAMENTO,'yyyy-MM-dd') AS dtLancamento,
              TIPO, VALOR, DESCRICAO, NUMERODOC, OBSERVACAO,
              FORMAT(ULTIMAALTERACAO,'yyyy-MM-ddTHH:mm:ss') AS ultimaAlteracao
            FROM KS0003.KS00010
            WHERE GUIDENTIDADE = @guidentidade
              AND ULTIMAALTERACAO > CONVERT(DATETIME,@desde)
            ORDER BY ULTIMAALTERACAO DESC
          `);
        delta.lancamentosCaixa = r.recordset;
      }

      if (entidades.includes("planoContas")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CODCONTA, CONTA, DESCRICAO,
              TIPO, NIVEL, CAST(GUIDCONTAPAI AS NVARCHAR(36)) AS guidContaPai, MASCARA, SITUACAO
            FROM KS0003.KS00001 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODCONTA
          `);
        delta.planoContas = r.recordset;
      }

      if (entidades.includes("centroCusto")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CODCENTRO, CENTRO, DESCRICAO,
              NIVEL, CAST(GUIDCENTROPAI AS NVARCHAR(36)) AS guidCentroPai, ORCAMENTO, SITUACAO
            FROM KS0003.KS00002 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODCENTRO
          `);
        delta.centroCusto = r.recordset;
      }

      if (entidades.includes("naturezaCaixa")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA, DESCRICAO, TIPO, SITUACAO
            FROM KS0003.KS00003 WHERE GUIDENTIDADE=@guidentidade ORDER BY NATUREZA
          `);
        delta.naturezaCaixa = r.recordset;
      }

      if (entidades.includes("formasPagamento")) {
        const r = await pool.request()
          .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
          .query(`
            SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento, PAGAMENTO, CODIGOSEFAZ,
              INTEGRATEF, SITUACAO
            FROM KS0003.KS00006 WHERE GUIDENTIDADE=@guidentidade ORDER BY CODIGOSEFAZ
          `);
        delta.formasPagamento = r.recordset;
      }

      // Atualizar timestamp de pull
      await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    dispositivo)
        .query(`
          MERGE KS0002.KS00010 AS t
          USING (SELECT @guidentidade AS g, @dispositivo AS d) AS s
            ON t.GUIDENTIDADE = @guidentidade AND t.DISPOSITIVO = @dispositivo
          WHEN MATCHED THEN UPDATE SET LASTSYNC_PULL=GETDATE(), LASTSYNC_AT=GETDATE()
          WHEN NOT MATCHED THEN INSERT (GUIDENTIDADE,DISPOSITIVO,LASTSYNC_PULL,LASTSYNC_AT)
            VALUES (@guidentidade,@dispositivo,GETDATE(),GETDATE())
        `);

      const totais: Record<string, number> = {};
      for (const [k, v] of Object.entries(delta)) totais[k] = (v as unknown[]).length;

      return {
        success: true,
        syncedAt: new Date().toISOString(),
        dtDesde: lastPull,
        totais,
        delta,
      };
    }),

  /**
   * POST /api/trpc/syncDelphi.ack
   * Delphi confirma que processou o pull anterior.
   * Atualiza o lastSyncAt sem alterar lastSyncPull.
   */
  ack: publicProcedure
    .input(z.object({
      dispositivo: z.string().default("default"),
      syncedAt:    z.string(), // ISO datetime retornado pelo pull
    }))
    .mutation(async ({ input, ctx }) => {
      const empresa = await autenticarApiKey(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelaSync(pool);

      await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, empresa.guidEntidade)
        .input("dispositivo",  sql.NVarChar(100),    input.dispositivo)
        .query(`
          UPDATE KS0002.KS00010
          SET LASTSYNC_AT = GETDATE()
          WHERE GUIDENTIDADE = @guidentidade AND DISPOSITIVO = @dispositivo
        `);

      return { success: true, ackedAt: new Date().toISOString() };
    }),
});

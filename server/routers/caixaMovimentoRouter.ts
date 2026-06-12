import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match?.[1];
  const session = await verifyKsSession(token);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida. Faca login novamente." });
  }
  return session;
}

type CaixaRow = {
  GUIDCAIXA: string;
  NUMEROCAIXA: number;
  GUIDENTIDADE: string;
  GUIDUSUARIO: string;
  CODUSUARIO: number | null;
  DESCRICAO: string | null;
  DATAABERTURA: Date;
  DATAFECHAMENTO: Date | null;
  SALDOINICIAL: number;
  SALDOFINAL: number;
  TOTALVENDAS: number;
  TOTALSUPRIMENTO: number;
  TOTALSANGRIA: number;
  SITUACAO: string;
  OBSERVACAO: string | null;
  ULTIMAALTERACAO: Date;
  SINCRONIZADO: boolean;
  OPERADOR?: string | null;
};

type FormaResumo = {
  guidPagamento: string;
  pagamento: string;
  valor: number;
};

async function ensureCaixaMovimentoTable() {
  await querySql(`
    IF SCHEMA_ID('KS0005') IS NULL
      EXEC('CREATE SCHEMA KS0005');

    IF OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS_CAIXA_MOVIMENTO (
        GUIDCAIXA uniqueidentifier NOT NULL,
        NUMEROCAIXA int NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDUSUARIO uniqueidentifier NOT NULL,
        CODUSUARIO int NULL,
        DESCRICAO varchar(100) NULL,
        DATAABERTURA datetime NOT NULL,
        DATAFECHAMENTO datetime NULL,
        SALDOINICIAL numeric(18,4) NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_SALDOINICIAL DEFAULT 0,
        SALDOFINAL numeric(18,4) NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_SALDOFINAL DEFAULT 0,
        TOTALVENDAS numeric(18,4) NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_TOTALVENDAS DEFAULT 0,
        TOTALSUPRIMENTO numeric(18,4) NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_TOTALSUPRIMENTO DEFAULT 0,
        TOTALSANGRIA numeric(18,4) NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_TOTALSANGRIA DEFAULT 0,
        SITUACAO varchar(20) NOT NULL,
        OBSERVACAO varchar(max) NULL,
        ULTIMAALTERACAO datetime NOT NULL,
        SINCRONIZADO bit NOT NULL CONSTRAINT DF_KS_CAIXA_MOVIMENTO_SINCRONIZADO DEFAULT 0,
        CONSTRAINT PK_KS_CAIXA_MOVIMENTO PRIMARY KEY (GUIDCAIXA),
        CONSTRAINT CK_KS_CAIXA_MOVIMENTO_SITUACAO CHECK (SITUACAO IN ('ABERTO', 'FECHADO', 'CANCELADO', 'BLOQUEADO'))
      );
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_KS_CAIXA_MOVIMENTO_USUARIO'
        AND object_id = OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO')
    )
      CREATE INDEX IX_KS_CAIXA_MOVIMENTO_USUARIO
        ON KS0005.KS_CAIXA_MOVIMENTO (GUIDENTIDADE, GUIDUSUARIO, SITUACAO);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_KS_CAIXA_MOVIMENTO_ABERTO_USUARIO'
        AND object_id = OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO')
    )
      CREATE UNIQUE INDEX UX_KS_CAIXA_MOVIMENTO_ABERTO_USUARIO
        ON KS0005.KS_CAIXA_MOVIMENTO (GUIDENTIDADE, GUIDUSUARIO)
        WHERE SITUACAO = 'ABERTO';

    IF OBJECT_ID('KS0005.KS00016', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS00016', 'GUIDCAIXA') IS NULL
        ALTER TABLE KS0005.KS00016 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016', 'NUMEROCAIXA') IS NULL
        ALTER TABLE KS0005.KS00016 ADD NUMEROCAIXA int NULL;
      IF COL_LENGTH('KS0005.KS00016', 'GUIDUSUARIOCAIXA') IS NULL
        ALTER TABLE KS0005.KS00016 ADD GUIDUSUARIOCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016', 'CODCAIXA') IS NULL
        ALTER TABLE KS0005.KS00016 ADD CODCAIXA int NULL;
      IF COL_LENGTH('KS0005.KS00016', 'CLIENTEPADRAO') IS NULL
        ALTER TABLE KS0005.KS00016 ADD CLIENTEPADRAO bit NOT NULL CONSTRAINT DF_KS00016_CLIENTEPADRAO DEFAULT 1;
      IF COL_LENGTH('KS0005.KS00016', 'GUIDCLIENTE') IS NULL
        ALTER TABLE KS0005.KS00016 ADD GUIDCLIENTE uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016', 'CODCLIENTE') IS NULL
        ALTER TABLE KS0005.KS00016 ADD CODCLIENTE int NULL;
    END;

    IF OBJECT_ID('KS0005.KS00018', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS00018 (
        GUIDPAGAMENTOVENDA uniqueidentifier NOT NULL,
        GUIDVENDA uniqueidentifier NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDFORMAPAGAMENTO uniqueidentifier NOT NULL,
        CODFORMAPAGAMENTO int NULL,
        VALORPAGO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_VALORPAGO DEFAULT 0,
        TROCO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_TROCO DEFAULT 0,
        PARCELAS int NULL,
        ULTIMAALTERACAO datetime NOT NULL,
        SINCRONIZADO bit NOT NULL CONSTRAINT DF_KS00018_SINCRONIZADO DEFAULT 0,
        CONSTRAINT PK_KS00018_PAGAMENTO PRIMARY KEY (GUIDPAGAMENTOVENDA)
      );
    END;

    IF OBJECT_ID('KS0005.KS00018', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS00018', 'GUIDFORMAPAGAMENTO') IS NULL
        ALTER TABLE KS0005.KS00018 ADD GUIDFORMAPAGAMENTO uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00018', 'CODFORMAPAGAMENTO') IS NULL
        ALTER TABLE KS0005.KS00018 ADD CODFORMAPAGAMENTO int NULL;
      IF COL_LENGTH('KS0005.KS00018', 'VALORPAGO') IS NULL
        ALTER TABLE KS0005.KS00018 ADD VALORPAGO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_VALORPAGO_ADD DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00018', 'TROCO') IS NULL
        ALTER TABLE KS0005.KS00018 ADD TROCO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_TROCO_ADD DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00018', 'PARCELAS') IS NULL
        ALTER TABLE KS0005.KS00018 ADD PARCELAS int NULL;
    END;
  `);
}

function selectCaixaSql(where: string) {
  return `
    SELECT TOP 1
      CAST(GUIDCAIXA AS NVARCHAR(36)) AS GUIDCAIXA,
      NUMEROCAIXA,
      CAST(GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
      CAST(GUIDUSUARIO AS NVARCHAR(36)) AS GUIDUSUARIO,
      CODUSUARIO,
      DESCRICAO,
      DATAABERTURA,
      DATAFECHAMENTO,
      SALDOINICIAL,
      SALDOFINAL,
      TOTALVENDAS,
      TOTALSUPRIMENTO,
      TOTALSANGRIA,
      SITUACAO,
      OBSERVACAO,
      ULTIMAALTERACAO,
      SINCRONIZADO
    FROM KS0005.KS_CAIXA_MOVIMENTO
    ${where}
  `;
}

async function formasPagamentoResumo(guidEntidade: string, guidCaixa: string) {
  const formas = await querySql<{
    guidPagamento: string;
    PAGAMENTO: string;
  }>(
    `SELECT
       CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
       PAGAMENTO
     FROM KS0003.KS00006
     WHERE GUIDENTIDADE = @GUIDENTIDADE
       AND SITUACAO = 'A'
     ORDER BY PAGAMENTO`,
    { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: guidEntidade } }
  );

  const totaisPorForma = new Map<string, number>();
  const pagamentosDisponiveis = await querySql<{ DISPONIVEL: number }>(
    `SELECT CASE
       WHEN OBJECT_ID('KS0005.KS00018', 'U') IS NOT NULL
        AND COL_LENGTH('KS0005.KS00018', 'GUIDVENDA') IS NOT NULL
        AND COL_LENGTH('KS0005.KS00018', 'GUIDFORMAPAGAMENTO') IS NOT NULL
        AND COL_LENGTH('KS0005.KS00018', 'VALORPAGO') IS NOT NULL
        AND OBJECT_ID('KS0005.KS00016', 'U') IS NOT NULL
        AND COL_LENGTH('KS0005.KS00016', 'GUIDCAIXA') IS NOT NULL
       THEN 1 ELSE 0 END AS DISPONIVEL`
  );

  if (pagamentosDisponiveis[0]?.DISPONIVEL === 1) {
    const movimentos = await querySql<{ guidPagamento: string; VALOR: number }>(
      `SELECT
         CAST(p.GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
         SUM(ISNULL(p.VALORPAGO, 0) - ISNULL(p.TROCO, 0)) AS VALOR
       FROM KS0005.KS00018 p
       INNER JOIN KS0005.KS00016 v ON v.GUIDVENDA = p.GUIDVENDA
       WHERE v.GUIDCAIXA = @GUIDCAIXA
         AND v.GUIDENTIDADE = @GUIDENTIDADE
         AND ISNULL(v.STATUS, '') NOT IN ('CANCELADA', 'CANCELADO')
       GROUP BY p.GUIDFORMAPAGAMENTO`,
      {
        GUIDCAIXA: { type: sql.UniqueIdentifier, value: guidCaixa },
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: guidEntidade },
      }
    );
    for (const movimento of movimentos) {
      totaisPorForma.set(movimento.guidPagamento, Number(movimento.VALOR ?? 0));
    }
  }

  return formas.map((forma): FormaResumo => ({
    guidPagamento: forma.guidPagamento,
    pagamento: forma.PAGAMENTO,
    valor: totaisPorForma.get(forma.guidPagamento) ?? 0,
  }));
}

async function resumoCaixa(guidEntidade: string, guidCaixa: string, caixa: CaixaRow) {
  const formasPagamento = await formasPagamentoResumo(guidEntidade, guidCaixa);
  const totalFormas = formasPagamento.reduce((sum, forma) => sum + forma.valor, 0);
  const totalVendas = totalFormas > 0 ? totalFormas : Number(caixa.TOTALVENDAS ?? 0);
  const totalEsperado =
    Number(caixa.SALDOINICIAL ?? 0) +
    totalVendas +
    Number(caixa.TOTALSUPRIMENTO ?? 0) -
    Number(caixa.TOTALSANGRIA ?? 0);
  return {
    formasPagamento,
    totalVendas,
    totalEntradas: totalVendas + Number(caixa.TOTALSUPRIMENTO ?? 0),
    totalMovimentado: totalVendas + Number(caixa.TOTALSUPRIMENTO ?? 0) + Number(caixa.TOTALSANGRIA ?? 0),
    totalEsperado,
    totalLiquido: totalEsperado,
    cancelamentos: 0,
  };
}

export const caixaMovimentoRouter = router({
  listar: publicProcedure
    .input(z.object({
      situacao: z.enum(["ABERTO", "FECHADO", "CANCELADO", "BLOQUEADO", "TODOS"]).default("ABERTO"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();
      const situacao = input?.situacao ?? "ABERTO";
      const whereSituacao = situacao === "TODOS" ? "" : "AND c.SITUACAO = @SITUACAO";
      const rows = await querySql<CaixaRow>(
        `SELECT
           CAST(c.GUIDCAIXA AS NVARCHAR(36)) AS GUIDCAIXA,
           c.NUMEROCAIXA,
           CAST(c.GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
           CAST(c.GUIDUSUARIO AS NVARCHAR(36)) AS GUIDUSUARIO,
           c.CODUSUARIO,
           c.DESCRICAO,
           c.DATAABERTURA,
           c.DATAFECHAMENTO,
           c.SALDOINICIAL,
           c.SALDOFINAL,
           c.TOTALVENDAS,
           c.TOTALSUPRIMENTO,
           c.TOTALSANGRIA,
           c.SITUACAO,
           c.OBSERVACAO,
           c.ULTIMAALTERACAO,
           c.SINCRONIZADO,
           u.NOME AS OPERADOR
         FROM KS0005.KS_CAIXA_MOVIMENTO c
         LEFT JOIN KS0002.KS00001 u
           ON u.GUIDPESSOA = c.GUIDUSUARIO
          AND u.GUIDENTIDADE = c.GUIDENTIDADE
         WHERE c.GUIDENTIDADE = @GUIDENTIDADE
           ${whereSituacao}
         ORDER BY c.DATAABERTURA DESC`,
        {
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          SITUACAO: { type: sql.VarChar(20), value: situacao },
        }
      );

      return Promise.all(rows.map(async (caixa) => ({
        ...caixa,
        resumo: await resumoCaixa(session.guidEntidade, caixa.GUIDCAIXA, caixa),
      })));
    }),

  detalhe: publicProcedure
    .input(z.object({ guidCaixa: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();
      const rows = await querySql<CaixaRow>(
        `SELECT
           CAST(c.GUIDCAIXA AS NVARCHAR(36)) AS GUIDCAIXA,
           c.NUMEROCAIXA,
           CAST(c.GUIDENTIDADE AS NVARCHAR(36)) AS GUIDENTIDADE,
           CAST(c.GUIDUSUARIO AS NVARCHAR(36)) AS GUIDUSUARIO,
           c.CODUSUARIO,
           c.DESCRICAO,
           c.DATAABERTURA,
           c.DATAFECHAMENTO,
           c.SALDOINICIAL,
           c.SALDOFINAL,
           c.TOTALVENDAS,
           c.TOTALSUPRIMENTO,
           c.TOTALSANGRIA,
           c.SITUACAO,
           c.OBSERVACAO,
           c.ULTIMAALTERACAO,
           c.SINCRONIZADO,
           u.NOME AS OPERADOR
         FROM KS0005.KS_CAIXA_MOVIMENTO c
         LEFT JOIN KS0002.KS00001 u
           ON u.GUIDPESSOA = c.GUIDUSUARIO
          AND u.GUIDENTIDADE = c.GUIDENTIDADE
         WHERE c.GUIDCAIXA = @GUIDCAIXA
           AND c.GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: input.guidCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      const caixa = rows[0];
      if (!caixa) throw new TRPCError({ code: "NOT_FOUND", message: "Caixa nao encontrado." });
      return {
        caixa,
        resumo: await resumoCaixa(session.guidEntidade, caixa.GUIDCAIXA, caixa),
        empresa: { nome: session.nomeEmpresa ?? session.entDocumento },
        operadorAtual: session.guidPessoa,
        podeFecharOutroOperador: session.isGerente,
      };
    }),

  fechar: publicProcedure
    .input(z.object({
      guidCaixa: z.string().uuid(),
      saldoFinal: z.number(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();
      const rows = await querySql<CaixaRow>(
        `${selectCaixaSql(`
          WHERE GUIDCAIXA = @GUIDCAIXA
            AND GUIDENTIDADE = @GUIDENTIDADE
        `)}
         ORDER BY DATAABERTURA DESC`,
        {
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: input.guidCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      const caixa = rows[0];
      if (!caixa) throw new TRPCError({ code: "NOT_FOUND", message: "Caixa nao encontrado." });
      if (caixa.SITUACAO !== "ABERTO") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nao e permitido fechar caixa ja fechado." });
      }
      if (caixa.GUIDUSUARIO !== session.guidPessoa && !session.isGerente) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Usuario sem permissao para fechar caixa de outro operador." });
      }

      const resumo = await resumoCaixa(session.guidEntidade, caixa.GUIDCAIXA, caixa);
      const diferenca = Number(input.saldoFinal ?? 0) - resumo.totalEsperado;
      if (Math.abs(diferenca) > 0.009 && !input.observacao?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe observacao para fechar caixa com diferenca." });
      }

      await querySql(
        `UPDATE KS0005.KS_CAIXA_MOVIMENTO SET
           SITUACAO = 'FECHADO',
           DATAFECHAMENTO = GETDATE(),
           SALDOFINAL = @SALDOFINAL,
           TOTALVENDAS = @TOTALVENDAS,
           OBSERVACAO = @OBSERVACAO,
           ULTIMAALTERACAO = GETDATE(),
           SINCRONIZADO = 0
         WHERE GUIDCAIXA = @GUIDCAIXA
           AND GUIDENTIDADE = @GUIDENTIDADE
           AND SITUACAO = 'ABERTO'`,
        {
          SALDOFINAL: { type: sql.Decimal(18, 4), value: input.saldoFinal },
          TOTALVENDAS: { type: sql.Decimal(18, 4), value: resumo.totalVendas },
          OBSERVACAO: { type: sql.VarChar(sql.MAX), value: input.observacao ?? null },
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: input.guidCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      return { success: true, diferenca };
    }),

  atual: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();

      const rows = await querySql<CaixaRow>(
        `${selectCaixaSql(`
          WHERE GUIDENTIDADE = @GUIDENTIDADE
            AND GUIDUSUARIO = @GUIDUSUARIO
            AND SITUACAO = 'ABERTO'
        `)}
         ORDER BY DATAABERTURA DESC`,
        {
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          GUIDUSUARIO: { type: sql.UniqueIdentifier, value: session.guidPessoa },
        }
      );

      return rows[0] ?? null;
    }),

  abrir: publicProcedure
    .input(z.object({
      guidCaixa: z.string().uuid().optional(),
      saldoInicial: z.number().default(0),
      descricao: z.string().max(100).optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();

      const aberto = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL
         FROM KS0005.KS_CAIXA_MOVIMENTO
         WHERE GUIDENTIDADE = @GUIDENTIDADE
           AND GUIDUSUARIO = @GUIDUSUARIO
           AND SITUACAO = 'ABERTO'`,
        {
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          GUIDUSUARIO: { type: sql.UniqueIdentifier, value: session.guidPessoa },
        }
      );
      if ((aberto[0]?.TOTAL ?? 0) > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este usuario ja possui um caixa aberto. Feche o caixa atual antes de abrir outro.",
        });
      }

      const numeroRows = await querySql<{ NUMEROCAIXA: number }>(
        `SELECT ISNULL(MAX(NUMEROCAIXA), 0) + 1 AS NUMEROCAIXA
         FROM KS0005.KS_CAIXA_MOVIMENTO
         WHERE GUIDENTIDADE = @GUIDENTIDADE`,
        { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
      );
      const usuarioRows = await querySql<{ CODUSUARIO: number | null }>(
        `SELECT TOP 1 CODIGO AS CODUSUARIO
         FROM KS0002.KS00001
         WHERE GUIDPESSOA = @GUIDUSUARIO
           AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUIDUSUARIO: { type: sql.UniqueIdentifier, value: session.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      const guidCaixa = input.guidCaixa ?? crypto.randomUUID();
      const numeroCaixa = numeroRows[0]?.NUMEROCAIXA ?? 1;
      const codUsuario = usuarioRows[0]?.CODUSUARIO ?? null;

      await querySql(
        `INSERT INTO KS0005.KS_CAIXA_MOVIMENTO
           (GUIDCAIXA, NUMEROCAIXA, GUIDENTIDADE, GUIDUSUARIO, CODUSUARIO,
            DESCRICAO, DATAABERTURA, SALDOINICIAL, SALDOFINAL, TOTALVENDAS,
            TOTALSUPRIMENTO, TOTALSANGRIA, SITUACAO, OBSERVACAO, ULTIMAALTERACAO, SINCRONIZADO)
         VALUES
           (@GUIDCAIXA, @NUMEROCAIXA, @GUIDENTIDADE, @GUIDUSUARIO, @CODUSUARIO,
            @DESCRICAO, GETDATE(), @SALDOINICIAL, 0, 0, 0, 0,
            'ABERTO', @OBSERVACAO, GETDATE(), 0)`,
        {
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: guidCaixa },
          NUMEROCAIXA: { type: sql.Int, value: numeroCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          GUIDUSUARIO: { type: sql.UniqueIdentifier, value: session.guidPessoa },
          CODUSUARIO: { type: sql.Int, value: codUsuario },
          DESCRICAO: { type: sql.VarChar(100), value: input.descricao ?? `CAIXA ${numeroCaixa}` },
          SALDOINICIAL: { type: sql.Decimal(18, 4), value: input.saldoInicial },
          OBSERVACAO: { type: sql.VarChar(sql.MAX), value: input.observacao ?? null },
        }
      );

      const rows = await querySql<CaixaRow>(
        `${selectCaixaSql("WHERE GUIDCAIXA = @GUIDCAIXA AND GUIDENTIDADE = @GUIDENTIDADE")}
         ORDER BY DATAABERTURA DESC`,
        {
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: guidCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      return rows[0];
    }),

  validarAberto: publicProcedure
    .input(z.object({ guidCaixa: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await getKsSession(ctx.req);
      await ensureCaixaMovimentoTable();

      const rows = await querySql<CaixaRow>(
        `${selectCaixaSql(`
          WHERE GUIDCAIXA = @GUIDCAIXA
            AND GUIDENTIDADE = @GUIDENTIDADE
            AND GUIDUSUARIO = @GUIDUSUARIO
            AND SITUACAO = 'ABERTO'
        `)}
         ORDER BY DATAABERTURA DESC`,
        {
          GUIDCAIXA: { type: sql.UniqueIdentifier, value: input.guidCaixa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          GUIDUSUARIO: { type: sql.UniqueIdentifier, value: session.guidPessoa },
        }
      );

      return { valido: Boolean(rows[0]), caixa: rows[0] ?? null };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import { auditarFinanceiro, garantirTabelasConciliacaoFinanceira } from "./conciliacaoFinanceiraRouter";
import { ensureCaixaMovimentoTable } from "./caixaMovimentoRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

async function garantirCamposOrigemLancamento(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF OBJECT_ID('KS0003.KS00010', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0003.KS00010','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDCAIXA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDFORMAPAGAMENTO') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDFORMAPAGAMENTO uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','ORIGEM') IS NULL ALTER TABLE KS0003.KS00010 ADD ORIGEM nvarchar(30) NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDORIGEM') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDORIGEM uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','COMPROVANTEURL') IS NULL ALTER TABLE KS0003.KS00010 ADD COMPROVANTEURL varchar(500) NULL;
    END
  `);
}

export const lancamentosCaixaRouter = router({

  listar: publicProcedure
    .input(z.object({
      tipo:      z.enum(["E", "S", "todos"]).default("todos"),
      dtInicio:  z.string().optional(),
      dtFim:     z.string().optional(),
      guidConta: z.string().uuid().optional(),
      guidCaixa: z.string().uuid().optional(),
      guidOperador: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      situacao: z.string().optional(),
      busca:     z.string().optional(),
      pagina:    z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(30),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposOrigemLancamento(pool);
      await ensureCaixaMovimentoTable();
      const pagina = input?.pagina ?? 1;
      const porPagina = input?.porPagina ?? 30;
      const offset = (pagina - 1) * porPagina;

      // Cláusula WHERE reutilizada nas duas queries (lista + totalizadores)
      const conditions: string[] = ["l.GUIDENTIDADE = @guidentidade"];
      if (input?.tipo && input.tipo !== "todos") conditions.push(`l.TIPO = '${input.tipo}'`);
      if (input?.dtInicio) conditions.push("CONVERT(DATE, l.DTLANCAMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim)    conditions.push("CONVERT(DATE, l.DTLANCAMENTO) <= CONVERT(DATE, @dtFim)");
      if (input?.guidConta) conditions.push("l.GUIDCONTA = @guidConta");
      if (input?.guidCaixa) conditions.push("l.GUIDCAIXA = @guidCaixa");
      if (input?.guidOperador) conditions.push("c.GUIDUSUARIO = @guidOperador");
      if (input?.guidFormaPagamento) conditions.push("l.GUIDFORMAPAGAMENTO = @guidFormaPagamento");
      if (input?.situacao) conditions.push("c.SITUACAO = @situacao");
      if (input?.busca)    conditions.push("(l.DESCRICAO LIKE @busca OR l.NUMERODOC LIKE @busca OR fp.PAGAMENTO LIKE @busca)");
      const where = conditions.join(" AND ");

      // Helper para adicionar parâmetros de filtro em qualquer request
      function addFilterParams(r: ReturnType<typeof pool.request>) {
        r.input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
        if (input?.dtInicio) r.input("dtInicio",  sql.NVarChar(10), input.dtInicio);
        if (input?.dtFim)    r.input("dtFim",     sql.NVarChar(10), input.dtFim);
        if (input?.guidConta) r.input("guidConta", sql.UniqueIdentifier, input.guidConta);
        if (input?.guidCaixa) r.input("guidCaixa", sql.UniqueIdentifier, input.guidCaixa);
        if (input?.guidOperador) r.input("guidOperador", sql.UniqueIdentifier, input.guidOperador);
        if (input?.guidFormaPagamento) r.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento);
        if (input?.situacao) r.input("situacao", sql.NVarChar(20), input.situacao);
        if (input?.busca)    r.input("busca",     sql.NVarChar(200), `%${input.busca}%`);
        return r;
      }

      const req2 = addFilterParams(pool.request())
        .input("offset", sql.Int, offset)
        .input("limit",  sql.Int, porPagina);

      const rows = await req2.query(`
        SELECT
          CAST(l.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          l.DTLANCAMENTO, l.TIPO, l.VALOR, l.DESCRICAO, l.NUMERODOC, l.OBSERVACAO,
          CAST(l.GUIDCONTA    AS NVARCHAR(36)) AS guidConta,
          CAST(l.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
          CAST(l.GUIDCENTRO   AS NVARCHAR(36)) AS guidCentro,
          CAST(l.GUIDVENDA    AS NVARCHAR(36)) AS guidVenda,
          CAST(l.GUIDCAIXA    AS NVARCHAR(36)) AS guidCaixa,
          CAST(l.GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
          l.COMPROVANTEURL AS comprovanteUrl,
          ISNULL(l.ORIGEM, CASE WHEN l.GUIDVENDA IS NOT NULL THEN 'VENDA' ELSE 'FINANCEIRO' END) AS origem,
          cb.CONTA AS nomeConta,
          n.NATUREZA AS nomeNatureza,
          cc.CENTRO AS nomeCentro,
          fp.PAGAMENTO AS nomeFormaPagamento,
          COALESCE(c.SITUACAO, 'LANCAMENTO') AS situacaoCaixa,
          l.DATACADASTRO
        FROM KS0003.KS00010 l
        LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA    = l.GUIDCONTA
        LEFT JOIN KS0003.KS00003 n  ON n.GUIDNATUREZA  = l.GUIDNATUREZA
        LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO   = l.GUIDCENTRO
        LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO c ON c.GUIDCAIXA = l.GUIDCAIXA AND c.GUIDENTIDADE = l.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = l.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE = l.GUIDENTIDADE AND fp.SITUACAO = 'A'
        WHERE ${where}
        ORDER BY l.DTLANCAMENTO DESC, l.DATACADASTRO DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

      // Totalizadores do período filtrado (reutiliza o mesmo WHERE, sem offset/limit)
      const totR = await addFilterParams(pool.request()).query(`
        SELECT
          COUNT(*) AS total,
          ISNULL(SUM(CASE WHEN l.TIPO='E' THEN l.VALOR ELSE 0 END),0) AS totalEntradas,
          ISNULL(SUM(CASE WHEN l.TIPO='S' THEN l.VALOR ELSE 0 END),0) AS totalSaidas
        FROM KS0003.KS00010 l
        LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO c ON c.GUIDCAIXA = l.GUIDCAIXA AND c.GUIDENTIDADE = l.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO = l.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE = l.GUIDENTIDADE AND fp.SITUACAO = 'A'
        WHERE ${where}
      `);

      return {
        dados: rows.recordset,
        total: totR.recordset[0]?.total ?? 0,
        totalEntradas: totR.recordset[0]?.totalEntradas ?? 0,
        totalSaidas:   totR.recordset[0]?.totalSaidas ?? 0,
        pagina,
        porPagina,
      };
    }),

  filtrosRelatorio: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    await garantirCamposOrigemLancamento(pool);
    await ensureCaixaMovimentoTable();

    const [caixasR, operadoresR] = await Promise.all([
      pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          IF OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO', 'U') IS NOT NULL
          BEGIN
            SELECT DISTINCT
              CAST(c.GUIDCAIXA AS NVARCHAR(36)) AS guidCaixa,
              c.NUMEROCAIXA AS numeroCaixa,
              COALESCE(c.DESCRICAO, CONCAT('Caixa ', c.NUMEROCAIXA)) AS descricao,
              c.SITUACAO AS situacao
            FROM KS0005.KS_CAIXA_MOVIMENTO c
            WHERE c.GUIDENTIDADE = @guidentidade
            ORDER BY c.NUMEROCAIXA DESC
          END
        `),
      pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT DISTINCT
            CAST(u.GUIDPESSOA AS NVARCHAR(36)) AS guidOperador,
            u.NOME AS nome,
            u.USUARIO AS usuario
          FROM KS0002.KS00001 u
          WHERE u.GUIDENTIDADE = @guidentidade
            AND EXISTS (
              SELECT 1
              FROM KS0003.KS00010 l
              LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO c
                ON c.GUIDCAIXA = l.GUIDCAIXA
               AND c.GUIDENTIDADE = l.GUIDENTIDADE
              WHERE l.GUIDENTIDADE = @guidentidade
                AND c.GUIDUSUARIO = u.GUIDPESSOA
            )
          ORDER BY u.NOME
        `),
    ]);

    return {
      caixas: caixasR.recordset ?? [],
      operadores: operadoresR.recordset ?? [],
      situacoes: [
        { valor: "ABERTO", descricao: "Aberto" },
        { valor: "FECHADO", descricao: "Fechado" },
        { valor: "CANCELADO", descricao: "Cancelado" },
        { valor: "BLOQUEADO", descricao: "Bloqueado" },
      ],
    };
  }),

  relatorioMovimentacaoCaixa: publicProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
      tipo: z.enum(["E", "S", "todos"]).default("todos"),
      guidCaixa: z.string().uuid().optional(),
      guidOperador: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      situacao: z.string().optional(),
      busca: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposOrigemLancamento(pool);
      await ensureCaixaMovimentoTable();

      const conditions: string[] = ["l.GUIDENTIDADE = @guidentidade"];
      if (input?.tipo && input.tipo !== "todos") conditions.push("l.TIPO = @tipo");
      if (input?.dtInicio) conditions.push("CONVERT(DATE, l.DTLANCAMENTO) >= CONVERT(DATE, @dtInicio)");
      if (input?.dtFim) conditions.push("CONVERT(DATE, l.DTLANCAMENTO) <= CONVERT(DATE, @dtFim)");
      if (input?.guidCaixa) conditions.push("l.GUIDCAIXA = @guidCaixa");
      if (input?.guidOperador) conditions.push("c.GUIDUSUARIO = @guidOperador");
      if (input?.guidFormaPagamento) conditions.push("l.GUIDFORMAPAGAMENTO = @guidFormaPagamento");
      if (input?.situacao) conditions.push("c.SITUACAO = @situacao");
      if (input?.busca) conditions.push("(l.DESCRICAO LIKE @busca OR l.NUMERODOC LIKE @busca OR fp.PAGAMENTO LIKE @busca)");
      const where = conditions.join(" AND ");

      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      if (input?.tipo && input.tipo !== "todos") req.input("tipo", sql.Char(1), input.tipo);
      if (input?.dtInicio) req.input("dtInicio", sql.NVarChar(10), input.dtInicio);
      if (input?.dtFim) req.input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input?.guidCaixa) req.input("guidCaixa", sql.UniqueIdentifier, input.guidCaixa);
      if (input?.guidOperador) req.input("guidOperador", sql.UniqueIdentifier, input.guidOperador);
      if (input?.guidFormaPagamento) req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento);
      if (input?.situacao) req.input("situacao", sql.NVarChar(20), input.situacao);
      if (input?.busca) req.input("busca", sql.NVarChar(200), `%${input.busca}%`);

      const rows = await req.query(`
        SELECT
          CAST(l.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          CONVERT(NVARCHAR(10), l.DTLANCAMENTO, 23) AS data,
          COALESCE(CONCAT('Caixa ', c.NUMEROCAIXA), cb.CONTA, '-') AS caixa,
          CAST(l.GUIDCAIXA AS NVARCHAR(36)) AS guidCaixa,
          COALESCE(u.NOME, u.USUARIO, '-') AS operador,
          CAST(c.GUIDUSUARIO AS NVARCHAR(36)) AS guidOperador,
          l.DESCRICAO AS historico,
          CAST(l.GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
          fp.PAGAMENTO AS formaPagamento,
          l.COMPROVANTEURL AS comprovanteUrl,
          CASE WHEN l.TIPO = 'E' THEN CAST(l.VALOR AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS entrada,
          CASE WHEN l.TIPO = 'S' THEN CAST(l.VALOR AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS saida,
          SUM(CASE WHEN l.TIPO = 'E' THEN l.VALOR ELSE -l.VALOR END)
            OVER (ORDER BY l.DTLANCAMENTO, l.DATACADASTRO, l.GUIDLANCAMENTO ROWS UNBOUNDED PRECEDING) AS saldo,
          l.TIPO AS tipo,
          COALESCE(c.SITUACAO, 'LANCAMENTO') AS situacao,
          l.NUMERODOC AS numeroDoc,
          ISNULL(l.ORIGEM, CASE WHEN l.GUIDVENDA IS NOT NULL THEN 'VENDA' ELSE 'FINANCEIRO' END) AS origem
        FROM KS0003.KS00010 l
        LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO c
          ON c.GUIDCAIXA = l.GUIDCAIXA
         AND c.GUIDENTIDADE = l.GUIDENTIDADE
        LEFT JOIN KS0002.KS00001 u
          ON u.GUIDPESSOA = c.GUIDUSUARIO
         AND u.GUIDENTIDADE = l.GUIDENTIDADE
        LEFT JOIN KS0003.KS00008 cb
          ON cb.GUIDCONTA = l.GUIDCONTA
         AND cb.GUIDENTIDADE = l.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp
          ON fp.GUIDPAGAMENTO = l.GUIDFORMAPAGAMENTO
         AND fp.GUIDENTIDADE = l.GUIDENTIDADE
         AND fp.SITUACAO = 'A'
        WHERE ${where}
        ORDER BY l.DTLANCAMENTO, l.DATACADASTRO, l.GUIDLANCAMENTO
      `);

      const dados = rows.recordset;
      const totalEntradas = dados.reduce((sum, row) => sum + Number(row.entrada ?? 0), 0);
      const totalSaidas = dados.reduce((sum, row) => sum + Number(row.saida ?? 0), 0);
      const porFormaMap = new Map<string, { guidFormaPagamento: string | null; formaPagamento: string; entradas: number; saidas: number; saldo: number }>();
      for (const row of dados) {
        const chave = row.guidFormaPagamento ?? "__sem_forma__";
        const atual = porFormaMap.get(chave) ?? {
          guidFormaPagamento: row.guidFormaPagamento ?? null,
          formaPagamento: row.formaPagamento ?? "Sem forma informada",
          entradas: 0,
          saidas: 0,
          saldo: 0,
        };
        atual.entradas += Number(row.entrada ?? 0);
        atual.saidas += Number(row.saida ?? 0);
        atual.saldo = atual.entradas - atual.saidas;
        porFormaMap.set(chave, atual);
      }

      return {
        dados,
        totaisPorForma: Array.from(porFormaMap.values()).sort((a, b) => a.formaPagamento.localeCompare(b.formaPagamento)),
        totalEntradas,
        totalSaidas,
        saldoGeral: totalEntradas - totalSaidas,
      };
    }),

  criar: publicProcedure
    .input(z.object({
      dtLancamento: z.string().min(1),
      tipo:         z.enum(["E", "S"]),
      valor:        z.number().positive(),
      descricao:    z.string().min(1).max(200),
      guidConta:    z.string().uuid("Conta/caixa obrigatoria"),
      guidNatureza: z.string().uuid("Natureza de caixa obrigatoria"),
      guidCentro:   z.string().uuid("Centro de custo obrigatorio"),
      numerodoc:    z.string().max(30).optional().nullable(),
      observacao:   z.string().max(500).optional().nullable(),
      comprovanteUrl: z.string().max(500).optional().nullable(),
      guidLancamento: z.string().uuid().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposOrigemLancamento(pool);
      const guid = input.guidLancamento ?? crypto.randomUUID();
      const tipoNatureza = input.tipo === "E" ? "R" : "D";

      const natR = await pool.request()
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
        .input("tipo",         sql.Char(1),          tipoNatureza)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT GUIDCONTA
          FROM KS0003.KS00003
          WHERE GUIDNATUREZA=@guidnatureza
            AND GUIDENTIDADE=@guidentidade
            AND SITUACAO='A'
            AND TIPO=@tipo
        `);
      const natureza = natR.recordset[0] as { GUIDCONTA: string | null } | undefined;
      if (!natureza) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Natureza de caixa incompativel com o tipo do lancamento." });
      }
      if (!natureza.GUIDCONTA) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A natureza de caixa precisa estar vinculada a uma conta do plano de contas." });
      }

      await pool.request()
        .input("guid",         sql.UniqueIdentifier, guid)
        .input("dtlancamento", sql.NVarChar(10),       input.dtLancamento)
        .input("tipo",         sql.Char(1),          input.tipo)
        .input("valor",        sql.Decimal(15,2),    input.valor)
        .input("descricao",    sql.NVarChar(200),    input.descricao.toUpperCase())
        .input("guidconta",    sql.UniqueIdentifier, input.guidConta)
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
        .input("guidcentro",   sql.UniqueIdentifier, input.guidCentro)
        .input("numerodoc",    sql.NVarChar(30),     input.numerodoc ?? null)
        .input("observacao",   sql.NVarChar(500),    input.observacao ?? null)
        .input("comprovanteurl", sql.VarChar(500),    input.comprovanteUrl ?? null)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00010
            (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,NUMERODOC,OBSERVACAO,COMPROVANTEURL,GUIDENTIDADE)
          VALUES
            (@guid,@dtlancamento,@tipo,@valor,@descricao,@guidconta,@guidnatureza,@guidcentro,@numerodoc,@observacao,@comprovanteurl,@guidentidade)
        `);

      // Atualizar saldo da conta bancária se informada
      if (input.guidConta) {
        const delta = input.tipo === "E" ? input.valor : -input.valor;
        await pool.request()
          .input("delta",       sql.Decimal(15,2),    delta)
          .input("guidconta",   sql.UniqueIdentifier, input.guidConta)
          .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      }

      return { success: true, guidLancamento: guid };
    }),

  excluir: publicProcedure
    .input(z.object({
      guidLancamento: z.string().uuid(),
      motivo: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposOrigemLancamento(pool);
      await garantirTabelasConciliacaoFinanceira(pool);

      // Buscar para reverter saldo
      const lR = await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS GUIDLANCAMENTO,
            CONVERT(NVARCHAR(10), DTLANCAMENTO, 23) AS DTLANCAMENTO,
            TIPO, VALOR, DESCRICAO, NUMERODOC, OBSERVACAO,
            CAST(GUIDCONTA AS NVARCHAR(36)) AS GUIDCONTA,
            CAST(GUIDNATUREZA AS NVARCHAR(36)) AS GUIDNATUREZA,
            CAST(GUIDCENTRO AS NVARCHAR(36)) AS GUIDCENTRO,
            CAST(GUIDVENDA AS NVARCHAR(36)) AS GUIDVENDA,
            CAST(GUIDCAIXA AS NVARCHAR(36)) AS GUIDCAIXA,
            CAST(GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS GUIDFORMAPAGAMENTO,
            COMPROVANTEURL,
            ORIGEM,
            DATACADASTRO
          FROM KS0003.KS00010
          WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade
        `);
      const l = lR.recordset[0];
      if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });

      const origem = String(l.ORIGEM ?? (l.GUIDVENDA ? "VENDA" : "FINANCEIRO")).toUpperCase();
      if (l.GUIDVENDA || origem === "VENDA") {
        await auditarFinanceiro(pool, {
          guidEntidade: session.guidEntidade,
          codFilial: session.codFilial,
          guidUsuario: session.guidPessoa,
          origem: "LANCAMENTOS_CAIXA",
          acao: "EXCLUSAO_BLOQUEADA_VENDA",
          tabela: "KS0003.KS00010",
          guidRegistro: input.guidLancamento,
          anterior: l,
          observacao: input.motivo ?? "Tentativa de excluir lancamento gerado por venda.",
          identificacao: l.NUMERODOC ? `DOC ${l.NUMERODOC}` : input.guidLancamento,
        });

        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Este lancamento foi gerado por uma venda. Cancele a venda para desfazer o movimento financeiro.",
        });
      }

      await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidLancamento)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("DELETE FROM KS0003.KS00010 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");

      // Reverter saldo da conta
      if (l.GUIDCONTA) {
        const delta = l.TIPO === "E" ? -l.VALOR : l.VALOR;
        await pool.request()
          .input("delta",       sql.Decimal(15,2),    delta)
          .input("guidconta",   sql.UniqueIdentifier, l.GUIDCONTA)
          .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      }

      await auditarFinanceiro(pool, {
        guidEntidade: session.guidEntidade,
        codFilial: session.codFilial,
        guidUsuario: session.guidPessoa,
        origem: "LANCAMENTOS_CAIXA",
        acao: "EXCLUIR_LANCAMENTO_CAIXA",
        tabela: "KS0003.KS00010",
        guidRegistro: input.guidLancamento,
        anterior: l,
        observacao: input.motivo ?? "Lancamento excluido pelo usuario.",
        identificacao: l.NUMERODOC ? `DOC ${l.NUMERODOC}` : input.guidLancamento,
      });

      return { success: true };
    }),

  /** Resumo por dia — usado no gráfico de extrato */
  auditoriaExclusoes: publicProcedure
    .input(z.object({
      pagina: z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirTabelasConciliacaoFinanceira(pool);

      const pagina = input?.pagina ?? 1;
      const porPagina = input?.porPagina ?? 20;
      const offset = (pagina - 1) * porPagina;

      const rows = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("offset", sql.Int, offset)
        .input("limit", sql.Int, porPagina)
        .query(`
          SELECT
            CAST(a.GUIDAUDITORIA AS NVARCHAR(36)) AS guidAuditoria,
            CONVERT(NVARCHAR(19), a.DATAHORA, 120) AS dataHora,
            a.ACAO AS acao,
            a.IDENTIFICACAO AS identificacao,
            a.OBSERVACAO AS observacao,
            a.VALORANTERIOR AS valorAnterior,
            CAST(a.GUIDREGISTRO AS NVARCHAR(36)) AS guidRegistro,
            u.NOME AS nomeUsuario,
            u.USUARIO AS usuario
          FROM KS0003.KS00022 a
          LEFT JOIN KS0002.KS00001 u ON u.GUIDPESSOA = a.GUIDUSUARIO
          WHERE a.GUIDENTIDADE = @guidentidade
            AND a.ORIGEM = 'LANCAMENTOS_CAIXA'
            AND a.ACAO IN ('EXCLUIR_LANCAMENTO_CAIXA', 'EXCLUSAO_BLOQUEADA_VENDA')
          ORDER BY a.DATAHORA DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

      return { dados: rows.recordset, pagina, porPagina };
    }),

  resumoDiario: publicProcedure
    .input(z.object({
      dtInicio:  z.string(),
      dtFim:     z.string(),
      guidConta: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio",     sql.NVarChar(10),     input.dtInicio)
        .input("dtFim",        sql.NVarChar(10),     input.dtFim);
      const contaFilter = input.guidConta
        ? (req2.input("guidconta", sql.UniqueIdentifier, input.guidConta), "AND GUIDCONTA=@guidconta")
        : "";

      const r = await req2.query(`
        SELECT
          CONVERT(NVARCHAR(10), DTLANCAMENTO, 23) AS dia,
          ISNULL(SUM(CASE WHEN TIPO='E' THEN VALOR ELSE 0 END),0) AS entradas,
          ISNULL(SUM(CASE WHEN TIPO='S' THEN VALOR ELSE 0 END),0) AS saidas
        FROM KS0003.KS00010
        WHERE GUIDENTIDADE=@guidentidade
          AND CONVERT(DATE, DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
          ${contaFilter}
        GROUP BY CONVERT(DATE, DTLANCAMENTO)
        ORDER BY CONVERT(DATE, DTLANCAMENTO)
      `);
      return r.recordset;
    }),
});

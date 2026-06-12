import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
  }
  return session;
}

const tipoMovimento = z.enum(["SALARIO", "COMISSAO", "VALE"]);

const movimentoBase = z.object({
  guidFuncionario: z.string().uuid("Funcionário obrigatório"),
  tipo: tipoMovimento,
  descricao: z.string().min(1).max(200),
  valor: z.number().positive("Valor deve ser maior que zero"),
  dataMovimento: z.string().min(10).max(10),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
  observacao: z.string().max(500).optional().nullable(),
  guidContaCaixa: z.string().uuid().optional().nullable(),
  guidNatureza: z.string().uuid().optional().nullable(),
  guidCentro: z.string().uuid().optional().nullable(),
});

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const funcionariosPagamentosRouter = router({
  listarFuncionarios: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          CAST(c.GUIDPESSOA AS NVARCHAR(36)) AS guidFuncionario,
          c.CODIGO, c.NOME, c.DOCUMENTO,
          car.CARGO AS cargo
        FROM KS0002.KS00001 c
        LEFT JOIN KS0000.KS00007 car ON car.CODCARGO = c.CODCARGO AND car.GUIDENTIDADE = c.GUIDENTIDADE
        WHERE c.GUIDENTIDADE = @guidentidade
          AND c.CADUSUARIO = 1
          AND c.SITUACAO = 'A'
        ORDER BY c.NOME
      `);
    return r.recordset;
  }),

  listarMovimentos: publicProcedure
    .input(z.object({
      tipo: tipoMovimento.optional(),
      status: z.string().optional(),
      guidFuncionario: z.string().uuid().optional(),
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
      competencia: z.string().optional(),
      busca: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const conditions = ["m.GUIDENTIDADE = @guidentidade"];
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);

      if (input?.tipo) {
        conditions.push("m.TIPO = @tipo");
        req.input("tipo", sql.NVarChar(20), input.tipo);
      }
      if (input?.status) {
        conditions.push("m.STATUS = @status");
        req.input("status", sql.NVarChar(20), input.status);
      }
      if (input?.guidFuncionario) {
        conditions.push("m.GUIDFUNCIONARIO = @guidfuncionario");
        req.input("guidfuncionario", sql.UniqueIdentifier, input.guidFuncionario);
      }
      if (input?.dtInicio) {
        conditions.push("CONVERT(DATE, m.DATAMOVIMENTO) >= CONVERT(DATE, @dtInicio)");
        req.input("dtInicio", sql.NVarChar(10), input.dtInicio);
      }
      if (input?.dtFim) {
        conditions.push("CONVERT(DATE, m.DATAMOVIMENTO) <= CONVERT(DATE, @dtFim)");
        req.input("dtFim", sql.NVarChar(10), input.dtFim);
      }
      if (input?.competencia) {
        conditions.push("m.COMPETENCIA = @competencia");
        req.input("competencia", sql.NVarChar(7), input.competencia);
      }
      if (input?.busca) {
        conditions.push("(m.DESCRICAO LIKE @busca OR f.NOME LIKE @busca OR f.DOCUMENTO LIKE @busca)");
        req.input("busca", sql.NVarChar(200), `%${input.busca.trim()}%`);
      }

      const r = await req.query(`
        SELECT
          CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
          CAST(m.GUIDFUNCIONARIO AS NVARCHAR(36)) AS guidFuncionario,
          f.NOME AS nomeFuncionario,
          f.DOCUMENTO,
          m.TIPO, m.DESCRICAO, m.VALOR,
          CONVERT(NVARCHAR(10), m.DATAMOVIMENTO, 23) AS dataMovimento,
          m.COMPETENCIA, m.STATUS,
          CAST(m.GUIDFECHAMENTO AS NVARCHAR(36)) AS guidFechamento,
          CAST(m.GUIDLANCCAIXA AS NVARCHAR(36)) AS guidLancCaixa,
          CAST(m.GUIDCONTACAIXA AS NVARCHAR(36)) AS guidContaCaixa,
          cb.CONTA AS nomeContaCaixa,
          n.NATUREZA AS nomeNatureza,
          cc.CENTRO AS nomeCentro,
          m.OBSERVACAO, m.DATACADASTRO, m.ULTIMAALTERACAO
        FROM KS0005.KS00001 m
        INNER JOIN KS0002.KS00001 f ON f.GUIDPESSOA = m.GUIDFUNCIONARIO
        LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA = m.GUIDCONTACAIXA
        LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = m.GUIDNATUREZA
        LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO = m.GUIDCENTRO
        WHERE ${conditions.join(" AND ")}
        ORDER BY m.DATAMOVIMENTO DESC, f.NOME
      `);
      return r.recordset;
    }),

  resumo: publicProcedure
    .input(z.object({ competencia: z.string().default(competenciaAtual()) }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const competencia = input?.competencia ?? competenciaAtual();
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("competencia", sql.NVarChar(7), competencia)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN TIPO='SALARIO' AND STATUS <> 'CANCELADO' THEN VALOR ELSE 0 END),0) AS salario,
            ISNULL(SUM(CASE WHEN TIPO='COMISSAO' AND STATUS <> 'CANCELADO' THEN VALOR ELSE 0 END),0) AS comissao,
            ISNULL(SUM(CASE WHEN TIPO='VALE' AND STATUS <> 'CANCELADO' THEN VALOR ELSE 0 END),0) AS vale,
            ISNULL(SUM(CASE WHEN TIPO IN ('SALARIO','COMISSAO') AND STATUS <> 'CANCELADO' THEN VALOR WHEN TIPO='VALE' AND STATUS <> 'CANCELADO' THEN -VALOR ELSE 0 END),0) AS liquido
          FROM KS0005.KS00001
          WHERE GUIDENTIDADE=@guidentidade AND COMPETENCIA=@competencia
        `);
      const row = r.recordset[0] as { salario: number; comissao: number; vale: number; liquido: number };
      return row;
    }),

  criarMovimento: publicProcedure.input(movimentoBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    const funcionario = await pool.request()
      .input("guidfuncionario", sql.UniqueIdentifier, input.guidFuncionario)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT TOP 1 GUIDPESSOA, NOME
        FROM KS0002.KS00001
        WHERE GUIDPESSOA=@guidfuncionario AND GUIDENTIDADE=@guidentidade AND CADUSUARIO=1 AND SITUACAO='A'
      `);
    const funcionarioRow = funcionario.recordset[0] as { NOME: string } | undefined;
    if (!funcionarioRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário ativo não encontrado." });
    }

    const guid = crypto.randomUUID();
    const guidLancCaixa = input.tipo === "VALE" ? crypto.randomUUID() : null;

    if (input.tipo === "VALE") {
      if (!input.guidContaCaixa || !input.guidNatureza || !input.guidCentro) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Para registrar vale, informe conta/caixa, natureza de caixa e centro de custo." });
      }

      const natR = await pool.request()
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT GUIDCONTA
          FROM KS0003.KS00003
          WHERE GUIDNATUREZA=@guidnatureza
            AND GUIDENTIDADE=@guidentidade
            AND SITUACAO='A'
            AND TIPO='D'
        `);
      const natureza = natR.recordset[0] as { GUIDCONTA: string | null } | undefined;
      if (!natureza) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Natureza de caixa incompativel com vale." });
      }
      if (!natureza.GUIDCONTA) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A natureza de caixa precisa estar vinculada a uma conta do plano de contas." });
      }

      await pool.request()
        .input("guid", sql.UniqueIdentifier, guidLancCaixa)
        .input("dtlancamento", sql.NVarChar(10), input.dataMovimento)
        .input("valor", sql.Decimal(15, 2), input.valor)
        .input("descricao", sql.NVarChar(200), `VALE FUNCIONARIO - ${funcionarioRow.NOME}`.toUpperCase())
        .input("guidconta", sql.UniqueIdentifier, input.guidContaCaixa)
        .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
        .input("guidcentro", sql.UniqueIdentifier, input.guidCentro)
        .input("numerodoc", sql.NVarChar(30), `VALE-${input.competencia}`)
        .input("observacao", sql.NVarChar(500), input.observacao?.toUpperCase() ?? null)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00010
            (GUIDLANCAMENTO, DTLANCAMENTO, TIPO, VALOR, DESCRICAO, GUIDCONTA, GUIDNATUREZA, GUIDCENTRO, NUMERODOC, OBSERVACAO, GUIDENTIDADE)
          VALUES
            (@guid, @dtlancamento, 'S', @valor, @descricao, @guidconta, @guidnatureza, @guidcentro, @numerodoc, @observacao, @guidentidade)
        `);

      await pool.request()
        .input("delta", sql.Decimal(15, 2), -input.valor)
        .input("guidconta", sql.UniqueIdentifier, input.guidContaCaixa)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
    }

    await pool.request()
      .input("guidmovimento", sql.UniqueIdentifier, guid)
      .input("guidfuncionario", sql.UniqueIdentifier, input.guidFuncionario)
      .input("tipo", sql.NVarChar(20), input.tipo)
      .input("descricao", sql.NVarChar(200), input.descricao.toUpperCase())
      .input("valor", sql.Decimal(15, 2), input.valor)
      .input("datamovimento", sql.NVarChar(10), input.dataMovimento)
      .input("competencia", sql.NVarChar(7), input.competencia)
      .input("observacao", sql.NVarChar(500), input.observacao?.toUpperCase() ?? null)
      .input("guidlanccaixa", sql.UniqueIdentifier, guidLancCaixa)
      .input("guidcontacaixa", sql.UniqueIdentifier, input.tipo === "VALE" ? input.guidContaCaixa : null)
      .input("guidnatureza", sql.UniqueIdentifier, input.tipo === "VALE" ? input.guidNatureza : null)
      .input("guidcentro", sql.UniqueIdentifier, input.tipo === "VALE" ? input.guidCentro : null)
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0005.KS00001
          (GUIDMOVIMENTO, GUIDFUNCIONARIO, TIPO, DESCRICAO, VALOR, DATAMOVIMENTO, COMPETENCIA, OBSERVACAO, GUIDLANCCAIXA, GUIDCONTACAIXA, GUIDNATUREZA, GUIDCENTRO, GUIDENTIDADE)
        VALUES
          (@guidmovimento, @guidfuncionario, @tipo, @descricao, @valor, @datamovimento, @competencia, @observacao, @guidlanccaixa, @guidcontacaixa, @guidnatureza, @guidcentro, @guidentidade)
      `);

    console.log(`[FuncionariosPagamentos] Movimento ${input.tipo} criado: ${guid}`);
    return { success: true, guidMovimento: guid };
  }),

  cancelarMovimento: publicProcedure
    .input(z.object({ guidMovimento: z.string().uuid(), motivo: z.string().min(3).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      const movimentoR = await pool.request()
        .input("guidmovimento", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDLANCCAIXA AS NVARCHAR(36)) AS guidLancCaixa
          FROM KS0005.KS00001
          WHERE GUIDMOVIMENTO=@guidmovimento AND GUIDENTIDADE=@guidentidade AND STATUS='ABERTO'
        `);
      const movimento = movimentoR.recordset[0] as { guidLancCaixa: string | null } | undefined;
      if (!movimento) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro aberto nao encontrado." });
      }

      if (movimento.guidLancCaixa) {
        const caixaR = await pool.request()
          .input("guid", sql.UniqueIdentifier, movimento.guidLancCaixa)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("SELECT VALOR, GUIDCONTA FROM KS0003.KS00010 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");
        const caixa = caixaR.recordset[0] as { VALOR: number; GUIDCONTA: string | null } | undefined;

        if (caixa?.GUIDCONTA) {
          await pool.request()
            .input("delta", sql.Decimal(15, 2), caixa.VALOR)
            .input("guidconta", sql.UniqueIdentifier, caixa.GUIDCONTA)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
        }

        await pool.request()
          .input("guid", sql.UniqueIdentifier, movimento.guidLancCaixa)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("DELETE FROM KS0003.KS00010 WHERE GUIDLANCAMENTO=@guid AND GUIDENTIDADE=@guidentidade");
      }

      await pool.request()
        .input("guidmovimento", sql.UniqueIdentifier, input.guidMovimento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("motivo", sql.NVarChar(500), input.motivo.toUpperCase())
        .query(`
          UPDATE KS0005.KS00001
          SET STATUS='CANCELADO', OBSERVACAO=CONCAT(ISNULL(OBSERVACAO,''), ' | CANCELADO: ', @motivo), ULTIMAALTERACAO=GETDATE()
          WHERE GUIDMOVIMENTO=@guidmovimento AND GUIDENTIDADE=@guidentidade AND STATUS='ABERTO'
        `);
      return { success: true };
    }),

  listarFechamentos: publicProcedure
    .input(z.object({ competencia: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      const conditions = ["f.GUIDENTIDADE=@guidentidade"];
      if (input?.competencia) {
        conditions.push("f.COMPETENCIA=@competencia");
        req.input("competencia", sql.NVarChar(7), input.competencia);
      }
      const r = await req.query(`
        SELECT
          CAST(f.GUIDFECHAMENTO AS NVARCHAR(36)) AS guidFechamento,
          f.COMPETENCIA,
          CONVERT(NVARCHAR(10), f.DTINICIO, 23) AS dtInicio,
          CONVERT(NVARCHAR(10), f.DTFIM, 23) AS dtFim,
          CONVERT(NVARCHAR(10), f.DTVENCIMENTO, 23) AS dtVencimento,
          f.TOTALSALARIO, f.TOTALCOMISSAO, f.TOTALVALE, f.TOTALLIQUIDO,
          f.STATUS, f.OBSERVACAO, f.DATACADASTRO,
          COUNT(i.GUIDITEM) AS qtdFuncionarios,
          STUFF((
            SELECT ', ' + CAST(p2.CODIGO AS NVARCHAR(20)) + ' - ' + p2.NOME
            FROM KS0005.KS00003 i2
            INNER JOIN KS0002.KS00001 p2 ON p2.GUIDPESSOA = i2.GUIDFUNCIONARIO
            WHERE i2.GUIDFECHAMENTO = f.GUIDFECHAMENTO
            ORDER BY p2.NOME
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS funcionarios
        FROM KS0005.KS00002 f
        LEFT JOIN KS0005.KS00003 i ON i.GUIDFECHAMENTO = f.GUIDFECHAMENTO
        WHERE ${conditions.join(" AND ")}
        GROUP BY f.GUIDFECHAMENTO, f.COMPETENCIA, f.DTINICIO, f.DTFIM, f.DTVENCIMENTO,
          f.TOTALSALARIO, f.TOTALCOMISSAO, f.TOTALVALE, f.TOTALLIQUIDO, f.STATUS, f.OBSERVACAO, f.DATACADASTRO
        ORDER BY f.COMPETENCIA DESC, f.DATACADASTRO DESC
      `);
      return r.recordset;
    }),

  detalhesFechamento: publicProcedure
    .input(z.object({ guidFechamento: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const r = await pool.request()
        .input("guidfechamento", sql.UniqueIdentifier, input.guidFechamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(i.GUIDITEM AS NVARCHAR(36)) AS guidItem,
            CAST(i.GUIDFUNCIONARIO AS NVARCHAR(36)) AS guidFuncionario,
            p.CODIGO AS codigoFuncionario,
            p.NOME AS nomeFuncionario,
            i.TOTALSALARIO, i.TOTALCOMISSAO, i.TOTALVALE, i.VALORLIQUIDO,
            CAST(i.GUIDLANCPAGAR AS NVARCHAR(36)) AS guidLancPagar,
            cp.STATUS AS statusPagamento,
            CONVERT(NVARCHAR(10), cp.DTPAGAMENTO, 23) AS dtPagamento
          FROM KS0005.KS00003 i
          INNER JOIN KS0005.KS00002 f ON f.GUIDFECHAMENTO = i.GUIDFECHAMENTO
          INNER JOIN KS0002.KS00001 p ON p.GUIDPESSOA = i.GUIDFUNCIONARIO
          LEFT JOIN KS0003.KS00004 cp ON cp.GUIDLANCAMENTO = i.GUIDLANCPAGAR
          WHERE i.GUIDFECHAMENTO=@guidfechamento AND f.GUIDENTIDADE=@guidentidade
          ORDER BY p.NOME
        `);
      return r.recordset;
    }),

  fecharMes: publicProcedure
    .input(z.object({
      competencia: z.string().regex(/^\d{4}-\d{2}$/),
      dtInicio: z.string().min(10).max(10),
      dtFim: z.string().min(10).max(10),
      dtVencimento: z.string().min(10).max(10),
      guidNatureza: z.string().uuid("Natureza de caixa obrigatória"),
      guidConta: z.string().uuid("Conta do plano de contas obrigatória"),
      guidCentro: z.string().uuid("Centro de custo obrigatório"),
      observacao: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      const jaExiste = await pool.request()
        .input("competencia", sql.NVarChar(7), input.competencia)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 1 GUIDFECHAMENTO
          FROM KS0005.KS00002
          WHERE COMPETENCIA=@competencia AND GUIDENTIDADE=@guidentidade AND STATUS <> 'CANCELADO'
        `);
      if (jaExiste.recordset.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe fechamento ativo para esta competência." });
      }

      const base = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim)
        .input("competencia", sql.NVarChar(7), input.competencia)
        .query(`
          SELECT
            CAST(m.GUIDFUNCIONARIO AS NVARCHAR(36)) AS guidFuncionario,
            p.NOME,
            ISNULL(SUM(CASE WHEN m.TIPO='SALARIO' THEN m.VALOR ELSE 0 END),0) AS salario,
            ISNULL(SUM(CASE WHEN m.TIPO='COMISSAO' THEN m.VALOR ELSE 0 END),0) AS comissao,
            ISNULL(SUM(CASE WHEN m.TIPO='VALE' THEN m.VALOR ELSE 0 END),0) AS vale
          FROM KS0005.KS00001 m
          INNER JOIN KS0002.KS00001 p ON p.GUIDPESSOA = m.GUIDFUNCIONARIO
          WHERE m.GUIDENTIDADE=@guidentidade
            AND m.STATUS='ABERTO'
            AND m.COMPETENCIA=@competencia
            AND CONVERT(DATE, m.DATAMOVIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
          GROUP BY m.GUIDFUNCIONARIO, p.NOME
        `);

      const itens = base.recordset as Array<{ guidFuncionario: string; NOME: string; salario: number; comissao: number; vale: number }>;
      if (itens.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não há salários, comissões ou vales em aberto para fechar." });
      }

      const totais = itens.reduce((acc, item) => {
        acc.salario += Number(item.salario) || 0;
        acc.comissao += Number(item.comissao) || 0;
        acc.vale += Number(item.vale) || 0;
        return acc;
      }, { salario: 0, comissao: 0, vale: 0 });
      const totalLiquido = totais.salario + totais.comissao - totais.vale;
      const guidFechamento = crypto.randomUUID();

      await pool.request()
        .input("guidfechamento", sql.UniqueIdentifier, guidFechamento)
        .input("competencia", sql.NVarChar(7), input.competencia)
        .input("dtinicio", sql.NVarChar(10), input.dtInicio)
        .input("dtfim", sql.NVarChar(10), input.dtFim)
        .input("dtvencimento", sql.NVarChar(10), input.dtVencimento)
        .input("totalsalario", sql.Decimal(15, 2), totais.salario)
        .input("totalcomissao", sql.Decimal(15, 2), totais.comissao)
        .input("totalvale", sql.Decimal(15, 2), totais.vale)
        .input("totalliquido", sql.Decimal(15, 2), totalLiquido)
        .input("observacao", sql.NVarChar(500), input.observacao?.toUpperCase() ?? null)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0005.KS00002
            (GUIDFECHAMENTO, COMPETENCIA, DTINICIO, DTFIM, DTVENCIMENTO, TOTALSALARIO, TOTALCOMISSAO, TOTALVALE, TOTALLIQUIDO, OBSERVACAO, GUIDENTIDADE)
          VALUES
            (@guidfechamento, @competencia, @dtinicio, @dtfim, @dtvencimento, @totalsalario, @totalcomissao, @totalvale, @totalliquido, @observacao, @guidentidade)
        `);

      for (const item of itens) {
        const salario = Number(item.salario) || 0;
        const comissao = Number(item.comissao) || 0;
        const vale = Number(item.vale) || 0;
        const liquido = salario + comissao - vale;
        const guidItem = crypto.randomUUID();
        const guidLanc = liquido > 0 ? crypto.randomUUID() : null;

        await pool.request()
          .input("guiditem", sql.UniqueIdentifier, guidItem)
          .input("guidfechamento", sql.UniqueIdentifier, guidFechamento)
          .input("guidfuncionario", sql.UniqueIdentifier, item.guidFuncionario)
          .input("totalsalario", sql.Decimal(15, 2), salario)
          .input("totalcomissao", sql.Decimal(15, 2), comissao)
          .input("totalvale", sql.Decimal(15, 2), vale)
          .input("valorliquido", sql.Decimal(15, 2), liquido)
          .input("guidlancpagar", sql.UniqueIdentifier, guidLanc)
          .query(`
            INSERT INTO KS0005.KS00003
              (GUIDITEM, GUIDFECHAMENTO, GUIDFUNCIONARIO, TOTALSALARIO, TOTALCOMISSAO, TOTALVALE, VALORLIQUIDO, GUIDLANCPAGAR)
            VALUES
              (@guiditem, @guidfechamento, @guidfuncionario, @totalsalario, @totalcomissao, @totalvale, @valorliquido, @guidlancpagar)
          `);

        if (guidLanc) {
          await pool.request()
            .input("guidlancamento", sql.UniqueIdentifier, guidLanc)
            .input("descricao", sql.NVarChar(200), `FOLHA ${input.competencia} - ${item.NOME}`)
            .input("guidcredor", sql.UniqueIdentifier, item.guidFuncionario)
            .input("nomecredor", sql.NVarChar(100), item.NOME)
            .input("valor", sql.Decimal(15, 2), liquido)
            .input("dtlancamento", sql.NVarChar(10), input.dtFim)
            .input("dtvencimento", sql.NVarChar(10), input.dtVencimento)
            .input("guidnatureza", sql.UniqueIdentifier, input.guidNatureza)
            .input("guidconta", sql.UniqueIdentifier, input.guidConta)
            .input("guidcentro", sql.UniqueIdentifier, input.guidCentro)
            .input("numerodoc", sql.NVarChar(50), `FOLHA-${input.competencia}`)
            .input("observacao", sql.NVarChar(500), input.observacao?.toUpperCase() ?? null)
            .input("guidorigem", sql.UniqueIdentifier, guidItem)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .query(`
              INSERT INTO KS0003.KS00004
                (GUIDLANCAMENTO, DESCRICAO, GUIDCREDOR, NOMECREDOR, VALOR, DTLANCAMENTO, DTVENCIMENTO,
                 GUIDNATUREZA, GUIDCONTA, GUIDCENTRO, NUMERODOC, PARCELA, TOTALPARCELAS, OBSERVACAO, ORIGEM, GUIDORIGEM, GUIDENTIDADE)
              VALUES
                (@guidlancamento, @descricao, @guidcredor, @nomecredor, @valor, @dtlancamento, @dtvencimento,
                 @guidnatureza, @guidconta, @guidcentro, @numerodoc, 1, 1, @observacao, 'FOLHA', @guidorigem, @guidentidade)
            `);
        }
      }

      await pool.request()
        .input("guidfechamento", sql.UniqueIdentifier, guidFechamento)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim)
        .input("competencia", sql.NVarChar(7), input.competencia)
        .query(`
          UPDATE KS0005.KS00001
          SET STATUS='FECHADO', GUIDFECHAMENTO=@guidfechamento, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDENTIDADE=@guidentidade
            AND STATUS='ABERTO'
            AND COMPETENCIA=@competencia
            AND CONVERT(DATE, DATAMOVIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
        `);

      console.log(`[FuncionariosPagamentos] Fechamento ${input.competencia} criado: ${guidFechamento}`);
      return { success: true, guidFechamento, totalFuncionarios: itens.length, totalLiquido };
    }),

  historicoPagamentos: publicProcedure
    .input(z.object({ competencia: z.string().optional(), guidFuncionario: z.string().uuid().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const req = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      const conditions = ["f.GUIDENTIDADE=@guidentidade"];
      if (input?.competencia) {
        conditions.push("f.COMPETENCIA=@competencia");
        req.input("competencia", sql.NVarChar(7), input.competencia);
      }
      if (input?.guidFuncionario) {
        conditions.push("i.GUIDFUNCIONARIO=@guidfuncionario");
        req.input("guidfuncionario", sql.UniqueIdentifier, input.guidFuncionario);
      }
      const r = await req.query(`
        SELECT
          f.COMPETENCIA,
          p.NOME AS nomeFuncionario,
          i.TOTALSALARIO, i.TOTALCOMISSAO, i.TOTALVALE, i.VALORLIQUIDO,
          cp.STATUS AS statusPagamento,
          CONVERT(NVARCHAR(10), cp.DTVENCIMENTO, 23) AS dtVencimento,
          CONVERT(NVARCHAR(10), cp.DTPAGAMENTO, 23) AS dtPagamento,
          cp.VALORPAGO
        FROM KS0005.KS00003 i
        INNER JOIN KS0005.KS00002 f ON f.GUIDFECHAMENTO = i.GUIDFECHAMENTO
        INNER JOIN KS0002.KS00001 p ON p.GUIDPESSOA = i.GUIDFUNCIONARIO
        LEFT JOIN KS0003.KS00004 cp ON cp.GUIDLANCAMENTO = i.GUIDLANCPAGAR
        WHERE ${conditions.join(" AND ")}
        ORDER BY f.COMPETENCIA DESC, p.NOME
      `);
      return r.recordset;
    }),
});

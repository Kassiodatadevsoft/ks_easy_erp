import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { ensureVendasTables } from "./vendasOperacaoRouter";
import { garantirTabelaFinanceiroAnexos } from "../services/financeiroAnexos";

const REPORTS = [
  { id: "movimentacao-caixa", nome: "Movimentacao de Caixa", disponivel: true },
  { id: "vendas-forma-pagamento", nome: "Vendas por Forma de Pagamento", disponivel: true },
  { id: "contas-receber", nome: "Contas a Receber", disponivel: true },
  { id: "contas-pagar", nome: "Contas a Pagar", disponivel: true },
  { id: "fluxo-caixa", nome: "Fluxo de Caixa", disponivel: true },
  { id: "comissoes", nome: "Comissoes", disponivel: true },
  { id: "dre-gerencial", nome: "DRE Gerencial", disponivel: true },
  { id: "inadimplencia", nome: "Inadimplencia", disponivel: true },
] as const;

const reportIdSchema = z.enum(REPORTS.map((report) => report.id) as [string, ...string[]]);

type ReportId = (typeof REPORTS)[number]["id"];

type PermissionRow = {
  CODRELATORIO: ReportId;
  LIBERADO: boolean | number;
};

const optionalUuid = z.preprocess(
  (value) => value === "" || value === "todos" || value === "none" ? undefined : value,
  z.string().uuid().optional()
);

export const dreGerencialInputSchema = z.object({
  dtInicio: z.string().min(10).max(10),
  dtFim: z.string().min(10).max(10),
  regime: z.enum(["competencia", "caixa"]).default("competencia"),
  guidCentro: optionalUuid,
  guidContaFinanceira: optionalUuid,
  guidPlanoConta: optionalUuid,
  guidNatureza: optionalUuid,
  guidFormaPagamento: optionalUuid,
});

type DreInput = z.infer<typeof dreGerencialInputSchema>;

type DreItem = {
  descricao: string;
  valor: number;
  percentual: number;
};

type DreGrupo = {
  descricao: string;
  valor: number;
  percentual: number;
  itens: DreItem[];
};

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function pct(valor: number, receitaLiquida: number) {
  return receitaLiquida !== 0 ? (valor / receitaLiquida) * 100 : 0;
}

function sumRows(rows: Array<Record<string, unknown>>, key = "valor") {
  return rows.reduce((sum, row) => sum + toNumber(row[key]), 0);
}

function addDreParams(req: ReturnType<Awaited<ReturnType<typeof getSqlPool>>["request"]>, guidEntidade: string, input: DreInput) {
  req.input("guidentidade", sql.UniqueIdentifier, guidEntidade);
  req.input("dtInicio", sql.NVarChar(10), input.dtInicio);
  req.input("dtFim", sql.NVarChar(10), input.dtFim);
  if (input.guidCentro) req.input("guidCentro", sql.UniqueIdentifier, input.guidCentro);
  if (input.guidContaFinanceira) req.input("guidContaFinanceira", sql.UniqueIdentifier, input.guidContaFinanceira);
  if (input.guidPlanoConta) req.input("guidPlanoConta", sql.UniqueIdentifier, input.guidPlanoConta);
  if (input.guidNatureza) req.input("guidNatureza", sql.UniqueIdentifier, input.guidNatureza);
  if (input.guidFormaPagamento) req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento);
  return req;
}

function filtrosFinanceiros(alias: string, input: DreInput, contaFinanceiraCampo?: string) {
  const where: string[] = [];
  if (input.guidCentro) where.push(`${alias}.GUIDCENTRO=@guidCentro`);
  if (input.guidPlanoConta) where.push(`${alias}.GUIDCONTA=@guidPlanoConta`);
  if (input.guidNatureza) where.push(`${alias}.GUIDNATUREZA=@guidNatureza`);
  if (input.guidFormaPagamento) where.push(`${alias}.GUIDPAGAMENTO=@guidFormaPagamento`);
  if (input.guidContaFinanceira && contaFinanceiraCampo) where.push(`${contaFinanceiraCampo}=@guidContaFinanceira`);
  return where;
}

function filtroVendaPorForma(input: DreInput) {
  return input.guidFormaPagamento
    ? "AND EXISTS (SELECT 1 FROM KS0005.KS00018 pv WHERE pv.GUIDVENDA=v.GUIDVENDA AND pv.GUIDENTIDADE=v.GUIDENTIDADE AND pv.GUIDFORMAPAGAMENTO=@guidFormaPagamento)"
    : "";
}

function montarGrupo(descricao: string, itens: DreItem[], receitaLiquida: number): DreGrupo {
  const valor = itens.reduce((sum, item) => sum + item.valor, 0);
  return {
    descricao,
    valor,
    percentual: pct(valor, receitaLiquida),
    itens: itens.map((item) => ({ ...item, percentual: pct(item.valor, receitaLiquida) })),
  };
}

export async function obterDreGerencial(guidEntidade: string, rawInput: DreInput) {
  const input = dreGerencialInputSchema.parse(rawInput);
  const pool = await getSqlPool();
  await ensureVendasTables();
  await garantirCamposFluxoCaixa(pool);

  const vendaFormaFiltro = filtroVendaPorForma(input);
  const vendaCentroFiltro = input.guidCentro
    ? "AND EXISTS (SELECT 1 FROM KS0003.KS00010 mv WHERE mv.GUIDVENDA=v.GUIDVENDA AND mv.GUIDENTIDADE=v.GUIDENTIDADE AND mv.GUIDCENTRO=@guidCentro)"
    : "";
  const vendaNaturezaFiltro = input.guidNatureza
    ? "AND EXISTS (SELECT 1 FROM KS0003.KS00010 mv WHERE mv.GUIDVENDA=v.GUIDVENDA AND mv.GUIDENTIDADE=v.GUIDENTIDADE AND mv.GUIDNATUREZA=@guidNatureza)"
    : "";
  const vendaPlanoFiltro = input.guidPlanoConta
    ? "AND EXISTS (SELECT 1 FROM KS0005.KS00018 pv INNER JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=pv.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE=pv.GUIDENTIDADE WHERE pv.GUIDVENDA=v.GUIDVENDA AND pv.GUIDENTIDADE=v.GUIDENTIDADE AND fp.GUIDCONTA=@guidPlanoConta)"
    : "";
  const vendaContaFinanceiraFiltro = input.guidContaFinanceira
    ? "AND EXISTS (SELECT 1 FROM KS0003.KS00010 mv WHERE mv.GUIDVENDA=v.GUIDVENDA AND mv.GUIDENTIDADE=v.GUIDENTIDADE AND mv.GUIDCONTA=@guidContaFinanceira)"
    : "";

  const vendas = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT
      CAST(ISNULL(SUM(ISNULL(v.TOTALVENDA,0)),0) AS DECIMAL(18,2)) AS vendasFinalizadas,
      CAST(ISNULL(SUM(ISNULL(v.DESCONTOVALOR,0)),0) AS DECIMAL(18,2)) AS descontos
    FROM KS0005.KS00016 v
    WHERE v.GUIDENTIDADE=@guidentidade
      AND v.SITUACAO='F'
      AND ISNULL(v.STATUSNFE,'') <> 'CANCELADA'
      AND CONVERT(DATE, v.DATAVENDA) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
      ${vendaFormaFiltro}
      ${vendaCentroFiltro}
      ${vendaNaturezaFiltro}
      ${vendaPlanoFiltro}
      ${vendaContaFinanceiraFiltro}
  `);

  const cancelamentos = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT CAST(ISNULL(SUM(ISNULL(v.TOTALVENDA,0)),0) AS DECIMAL(18,2)) AS valor
    FROM KS0005.KS00016 v
    WHERE v.GUIDENTIDADE=@guidentidade
      AND (v.SITUACAO='CANCELADA' OR ISNULL(v.STATUSNFE,'')='CANCELADA')
      AND CONVERT(DATE, v.DATAVENDA) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
      ${vendaFormaFiltro}
      ${vendaCentroFiltro}
      ${vendaNaturezaFiltro}
      ${vendaPlanoFiltro}
      ${vendaContaFinanceiraFiltro}
  `);

  const custos = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT
      CASE WHEN ISNULL(p.SERVICO,0)=1 THEN 'Custo dos servicos vendidos' ELSE 'Custo dos produtos vendidos' END AS descricao,
      CAST(ISNULL(SUM(ISNULL(i.PRECOCUSTO, ISNULL(p.PRECOCUSTO,0)) * ISNULL(i.QUANTIDADE,0)),0) AS DECIMAL(18,2)) AS valor
    FROM KS0005.KS00017 i
    INNER JOIN KS0005.KS00016 v ON v.GUIDVENDA=i.GUIDVENDA AND v.GUIDENTIDADE=i.GUIDENTIDADE
    LEFT JOIN KS0000.KS00009 p ON p.GUIDPRODUTO=i.GUIDPRODUTO AND p.GUIDENTIDADE=i.GUIDENTIDADE
    WHERE v.GUIDENTIDADE=@guidentidade
      AND v.SITUACAO='F'
      AND ISNULL(v.STATUSNFE,'') <> 'CANCELADA'
      AND CONVERT(DATE, v.DATAVENDA) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
      ${vendaFormaFiltro}
      ${vendaCentroFiltro}
      ${vendaNaturezaFiltro}
      ${vendaPlanoFiltro}
      ${vendaContaFinanceiraFiltro}
    GROUP BY CASE WHEN ISNULL(p.SERVICO,0)=1 THEN 'Custo dos servicos vendidos' ELSE 'Custo dos produtos vendidos' END
  `);

  const crFilters = filtrosFinanceiros("cr", input, undefined);
  const receitaContaFiltro = input.guidContaFinanceira
    ? "cr.GUIDCONTA=@guidContaFinanceira"
    : undefined;
  const receitasFinanceirasWhere = [
    "cr.GUIDENTIDADE=@guidentidade",
    "cr.STATUS <> 'CANCELADO'",
    input.regime === "caixa"
      ? "cr.STATUS IN ('PAGO','PARCIAL') AND cr.DTRECEBIMENTO IS NOT NULL AND CONVERT(DATE, cr.DTRECEBIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)"
      : "CONVERT(DATE, cr.DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
    ...crFilters,
    receitaContaFiltro,
    input.regime === "competencia" ? "(cr.ORIGEM IS NULL OR cr.ORIGEM <> 'VENDA')" : undefined,
  ].filter(Boolean).join(" AND ");
  const receitasFinanceiras = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT COALESCE(n.NATUREZA, pc.CONTA, 'Recebimentos de clientes') AS descricao,
      CAST(SUM(${input.regime === "caixa" ? "ISNULL(cr.VALORRECEBIDO,0)" : "ISNULL(cr.VALOR,0)"}) AS DECIMAL(18,2)) AS valor
    FROM KS0003.KS00005 cr
    LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=cr.GUIDNATUREZA AND n.GUIDENTIDADE=cr.GUIDENTIDADE
    LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=cr.GUIDCONTA AND pc.GUIDENTIDADE=cr.GUIDENTIDADE
    WHERE ${receitasFinanceirasWhere}
    GROUP BY COALESCE(n.NATUREZA, pc.CONTA, 'Recebimentos de clientes')
  `);

  const cpFilters = filtrosFinanceiros("cp", input, undefined);
  const despesaContaFiltro = input.guidContaFinanceira
    ? "cp.GUIDCONTA=@guidContaFinanceira"
    : undefined;
  const despesasWhere = [
    "cp.GUIDENTIDADE=@guidentidade",
    "cp.STATUS <> 'CANCELADO'",
    input.regime === "caixa"
      ? "cp.STATUS IN ('PAGO','PARCIAL') AND cp.DTPAGAMENTO IS NOT NULL AND CONVERT(DATE, cp.DTPAGAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)"
      : "CONVERT(DATE, cp.DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
    ...cpFilters,
    despesaContaFiltro,
    "(cp.ORIGEM IS NULL OR cp.ORIGEM <> 'FOLHA')",
  ].filter(Boolean).join(" AND ");
  const despesas = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT COALESCE(n.NATUREZA, pc.CONTA, 'Outras despesas') AS descricao,
      CAST(SUM(${input.regime === "caixa" ? "ISNULL(cp.VALORPAGO,0)" : "ISNULL(cp.VALOR,0)"}) AS DECIMAL(18,2)) AS valor
    FROM KS0003.KS00004 cp
    LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=cp.GUIDNATUREZA AND n.GUIDENTIDADE=cp.GUIDENTIDADE
    LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=cp.GUIDCONTA AND pc.GUIDENTIDADE=cp.GUIDENTIDADE
    WHERE ${despesasWhere}
    GROUP BY COALESCE(n.NATUREZA, pc.CONTA, 'Outras despesas')
  `);

  const movimentoFilters = [
    input.guidCentro ? "m.GUIDCENTRO=@guidCentro" : undefined,
    input.guidNatureza ? "m.GUIDNATUREZA=@guidNatureza" : undefined,
    input.guidFormaPagamento ? "m.GUIDFORMAPAGAMENTO=@guidFormaPagamento" : undefined,
    input.guidContaFinanceira ? "m.GUIDCONTA=@guidContaFinanceira" : undefined,
  ].filter(Boolean);
  const outrasReceitas = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT COALESCE(n.NATUREZA, pc.CONTA, 'Outras receitas') AS descricao,
      CAST(SUM(ISNULL(m.VALOR,0)) AS DECIMAL(18,2)) AS valor
    FROM KS0003.KS00010 m
    LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=m.GUIDNATUREZA AND n.GUIDENTIDADE=m.GUIDENTIDADE
    LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=m.GUIDCONTA AND pc.GUIDENTIDADE=m.GUIDENTIDADE
    WHERE m.GUIDENTIDADE=@guidentidade
      AND m.TIPO='E'
      AND m.GUIDVENDA IS NULL
      AND CONVERT(DATE, m.DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
      ${movimentoFilters.length ? `AND ${movimentoFilters.join(" AND ")}` : ""}
    GROUP BY COALESCE(n.NATUREZA, pc.CONTA, 'Outras receitas')
  `);

  const outrasDespesas = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT COALESCE(n.NATUREZA, pc.CONTA, 'Outras despesas') AS descricao,
      CAST(SUM(ISNULL(m.VALOR,0)) AS DECIMAL(18,2)) AS valor
    FROM KS0003.KS00010 m
    LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=m.GUIDNATUREZA AND n.GUIDENTIDADE=m.GUIDENTIDADE
    LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=m.GUIDCONTA AND pc.GUIDENTIDADE=m.GUIDENTIDADE
    WHERE m.GUIDENTIDADE=@guidentidade
      AND m.TIPO='S'
      AND m.GUIDVENDA IS NULL
      AND CONVERT(DATE, m.DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
      ${movimentoFilters.length ? `AND ${movimentoFilters.join(" AND ")}` : ""}
    GROUP BY COALESCE(n.NATUREZA, pc.CONTA, 'Outras despesas')
  `);

  const comissaoWhere = [
    "m.GUIDENTIDADE=@guidentidade",
    "m.TIPO='COMISSAO'",
    "ISNULL(m.STATUS,'ABERTO') <> 'CANCELADO'",
    input.regime === "caixa"
      ? "m.STATUS='FECHADO'"
      : "CONVERT(DATE, m.DATAMOVIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
  ].join(" AND ");
  const comissoes = await addDreParams(pool.request(), guidEntidade, input).query(`
    SELECT CAST(ISNULL(SUM(ISNULL(m.VALOR,0)),0) AS DECIMAL(18,2)) AS valor
    FROM KS0005.KS00001 m
    WHERE ${comissaoWhere}
  `);

  const vendaRow = vendas.recordset[0] ?? {};
  const receitaVendas = toNumber(vendaRow.vendasFinalizadas);
  const descontos = toNumber(vendaRow.descontos);
  const cancelamentosValor = toNumber(cancelamentos.recordset[0]?.valor);
  const receitasFinanceirasItens = receitasFinanceiras.recordset.map((row) => ({ descricao: String(row.descricao), valor: toNumber(row.valor), percentual: 0 }));
  const outrasReceitasItens = outrasReceitas.recordset.map((row) => ({ descricao: String(row.descricao), valor: toNumber(row.valor), percentual: 0 }));
  const despesasItens = despesas.recordset.map((row) => ({ descricao: String(row.descricao), valor: toNumber(row.valor), percentual: 0 }));
  const outrasDespesasItens = outrasDespesas.recordset.map((row) => ({ descricao: String(row.descricao), valor: toNumber(row.valor), percentual: 0 }));
  const custoItens = custos.recordset.map((row) => ({ descricao: String(row.descricao), valor: toNumber(row.valor), percentual: 0 }));
  const comissaoValor = toNumber(comissoes.recordset[0]?.valor);

  const receitaBrutaItens: DreItem[] = [
    { descricao: "Vendas finalizadas", valor: receitaVendas, percentual: 0 },
    ...receitasFinanceirasItens,
  ].filter((item) => item.valor !== 0);
  const deducoesItens: DreItem[] = [
    { descricao: "Descontos concedidos", valor: descontos, percentual: 0 },
    { descricao: "Cancelamentos", valor: cancelamentosValor, percentual: 0 },
  ].filter((item) => item.valor !== 0);
  const despesasOperacionaisItens: DreItem[] = [
    ...despesasItens,
    { descricao: "Comissoes", valor: comissaoValor, percentual: 0 },
  ].filter((item) => item.valor !== 0);

  const receitaBruta = receitaBrutaItens.reduce((s, i) => s + i.valor, 0);
  const deducoes = deducoesItens.reduce((s, i) => s + i.valor, 0);
  const receitaLiquida = receitaBruta - deducoes;
  const custoTotal = sumRows(custoItens);
  const lucroBruto = receitaLiquida - custoTotal;
  const despesasOperacionais = despesasOperacionaisItens.reduce((s, i) => s + i.valor, 0);
  const resultadoOperacional = lucroBruto - despesasOperacionais;
  const outrasReceitasTotal = outrasReceitasItens.reduce((s, i) => s + i.valor, 0);
  const outrasDespesasTotal = outrasDespesasItens.reduce((s, i) => s + i.valor, 0);
  const resultadoFinal = resultadoOperacional + outrasReceitasTotal - outrasDespesasTotal;

  const grupos: DreGrupo[] = [
    montarGrupo("RECEITA BRUTA", receitaBrutaItens, receitaLiquida),
    montarGrupo("DEDUCOES DA RECEITA", deducoesItens, receitaLiquida),
    montarGrupo("RECEITA LIQUIDA", [{ descricao: "Receita Liquida", valor: receitaLiquida, percentual: 0 }], receitaLiquida),
    montarGrupo("CUSTOS", custoItens, receitaLiquida),
    montarGrupo("LUCRO BRUTO", [{ descricao: "Lucro Bruto", valor: lucroBruto, percentual: 0 }], receitaLiquida),
    montarGrupo("DESPESAS OPERACIONAIS", despesasOperacionaisItens, receitaLiquida),
    montarGrupo("RESULTADO OPERACIONAL", [{ descricao: "Resultado Operacional", valor: resultadoOperacional, percentual: 0 }], receitaLiquida),
    montarGrupo("OUTRAS RECEITAS / DESPESAS", [
      ...outrasReceitasItens.map((item) => ({ ...item, descricao: `Receita - ${item.descricao}` })),
      ...outrasDespesasItens.map((item) => ({ ...item, descricao: `Despesa - ${item.descricao}`, valor: -item.valor })),
    ], receitaLiquida),
    montarGrupo("RESULTADO FINAL", [{ descricao: "Resultado Final", valor: resultadoFinal, percentual: 0 }], receitaLiquida),
  ];

  return {
    periodo: { dataInicial: input.dtInicio, dataFinal: input.dtFim },
    regime: input.regime,
    grupos,
    totais: {
      receitaBruta,
      receitaLiquida,
      custoTotal,
      lucroBruto,
      despesasOperacionais,
      resultadoOperacional,
      resultadoFinal,
      margemBruta: pct(lucroBruto, receitaLiquida),
      margemLiquida: pct(resultadoFinal, receitaLiquida),
    },
  };
}

async function garantirTabelaPermissoes(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'KS0002'
        AND TABLE_NAME = 'KS_RELATORIO_PERMISSAO'
    )
    CREATE TABLE KS0002.KS_RELATORIO_PERMISSAO (
      GUIDPERMISSAO UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      GUIDENTIDADE UNIQUEIDENTIFIER NOT NULL,
      GUIDUSUARIO UNIQUEIDENTIFIER NOT NULL,
      CODRELATORIO NVARCHAR(80) NOT NULL,
      LIBERADO BIT NOT NULL DEFAULT 1,
      DATACADASTRO DATETIME NOT NULL DEFAULT GETDATE(),
      ULTIMAALTERACAO DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UX_KS_RELATORIO_PERMISSAO_USUARIO'
        AND object_id = OBJECT_ID('KS0002.KS_RELATORIO_PERMISSAO')
    )
    CREATE UNIQUE INDEX UX_KS_RELATORIO_PERMISSAO_USUARIO
      ON KS0002.KS_RELATORIO_PERMISSAO (GUIDENTIDADE, GUIDUSUARIO, CODRELATORIO)
  `);
}

async function garantirCamposFluxoCaixa(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await pool.request().query(`
    IF OBJECT_ID('KS0003.KS00010', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0003.KS00010','GUIDCAIXA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDFORMAPAGAMENTO') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDFORMAPAGAMENTO uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','ORIGEM') IS NULL ALTER TABLE KS0003.KS00010 ADD ORIGEM nvarchar(30) NULL;
    END
  `);
}

async function listarPermissoesUsuario(
  pool: Awaited<ReturnType<typeof getSqlPool>>,
  guidEntidade: string,
  guidUsuario: string
) {
  await garantirTabelaPermissoes(pool);

  const result = await pool.request()
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .input("guidusuario", sql.UniqueIdentifier, guidUsuario)
    .query(`
      SELECT CODRELATORIO, CAST(LIBERADO AS bit) AS LIBERADO
      FROM KS0002.KS_RELATORIO_PERMISSAO
      WHERE GUIDENTIDADE = @guidentidade
        AND GUIDUSUARIO = @guidusuario
    `);

  return new Map(
    (result.recordset as PermissionRow[]).map((row) => [
      row.CODRELATORIO,
      Boolean(row.LIBERADO),
    ])
  );
}

async function podeAcessarRelatorio(
  pool: Awaited<ReturnType<typeof getSqlPool>>,
  params: {
    guidEntidade: string;
    guidUsuario: string;
    isGerente: boolean;
    reportId: ReportId;
  }
) {
  if (params.isGerente) return true;

  const permissoes = await listarPermissoesUsuario(
    pool,
    params.guidEntidade,
    params.guidUsuario
  );

  return permissoes.get(params.reportId) ?? true;
}

export const financeiroRelatoriosRouter = router({
  listar: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const permissoes = ctx.user.isGerente
      ? new Map<ReportId, boolean>()
      : await listarPermissoesUsuario(pool, ctx.user.guidEntidade, ctx.user.guidPessoa);

    return REPORTS
      .map((report) => ({
        ...report,
        autorizado: ctx.user.isGerente ? true : permissoes.get(report.id) ?? true,
      }))
      .filter((report) => report.autorizado);
  }),

  indicadores: protectedProcedure
    .input(z.object({
      dtInicio: z.string().optional(),
      dtFim: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const hoje = new Date();
      const inicio = input?.dtInicio ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
      const fim = input?.dtFim ?? `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

      const result = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), inicio)
        .input("dtFim", sql.NVarChar(10), fim)
        .query(`
          SELECT
            ISNULL((
              SELECT SUM(VALOR - ISNULL(VALORRECEBIDO, 0))
              FROM KS0003.KS00005
              WHERE GUIDENTIDADE = @guidentidade
                AND STATUS IN ('ABERTO', 'PARCIAL')
            ), 0) AS contasReceber,
            ISNULL((
              SELECT SUM(VALOR - ISNULL(VALORPAGO, 0))
              FROM KS0003.KS00004
              WHERE GUIDENTIDADE = @guidentidade
                AND STATUS IN ('ABERTO', 'PARCIAL')
            ), 0) AS contasPagar,
            ISNULL((
              SELECT SUM(ISNULL(SALDOATUAL, 0))
              FROM KS0003.KS00008
              WHERE GUIDENTIDADE = @guidentidade
                AND SITUACAO = 'A'
            ), 0) AS saldoAtual,
            ISNULL((
              SELECT SUM(VALOR)
              FROM KS0003.KS00010
              WHERE GUIDENTIDADE = @guidentidade
                AND TIPO = 'E'
                AND CONVERT(DATE, DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
            ), 0) AS entradasPeriodo,
            ISNULL((
              SELECT SUM(VALOR)
              FROM KS0003.KS00010
              WHERE GUIDENTIDADE = @guidentidade
                AND TIPO = 'S'
                AND CONVERT(DATE, DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
            ), 0) AS saidasPeriodo
        `);

      const row = result.recordset[0] as {
        contasReceber: number;
        contasPagar: number;
        saldoAtual: number;
        entradasPeriodo: number;
        saidasPeriodo: number;
      };

      const entradasPeriodo = Number(row?.entradasPeriodo ?? 0);
      const saidasPeriodo = Number(row?.saidasPeriodo ?? 0);

      return {
        dtInicio: inicio,
        dtFim: fim,
        contasReceber: Number(row?.contasReceber ?? 0),
        contasPagar: Number(row?.contasPagar ?? 0),
        saldoAtual: Number(row?.saldoAtual ?? 0),
        entradasPeriodo,
        saidasPeriodo,
        lucroPeriodo: entradasPeriodo - saidasPeriodo,
      };
    }),

  verificarAcesso: protectedProcedure
    .input(z.object({ reportId: reportIdSchema }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      return {
        autorizado: await podeAcessarRelatorio(pool, {
          guidEntidade: ctx.user.guidEntidade,
          guidUsuario: ctx.user.guidPessoa,
          isGerente: ctx.user.isGerente,
          reportId: input.reportId as ReportId,
        }),
      };
    }),

  filtrosVendasFormaPagamento: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "vendas-forma-pagamento",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
    await ensureVendasTables();

    const [caixas, vendedores, clientes, formas, situacoes] = await Promise.all([
      pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade).query(`
        SELECT DISTINCT CAST(v.GUIDCAIXA AS NVARCHAR(36)) AS guidCaixa, v.NUMEROCAIXA AS numeroCaixa,
          COALESCE(c.DESCRICAO, CONCAT('Caixa ', v.NUMEROCAIXA)) AS descricao
        FROM KS0005.KS00016 v
        LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO c ON c.GUIDCAIXA=v.GUIDCAIXA AND c.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE v.GUIDENTIDADE=@guidentidade AND v.GUIDCAIXA IS NOT NULL
        ORDER BY v.NUMEROCAIXA DESC
      `),
      pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade).query(`
        SELECT DISTINCT CAST(u.GUIDPESSOA AS NVARCHAR(36)) AS guidVendedor, u.NOME AS nome
        FROM KS0005.KS00016 v
        INNER JOIN KS0002.KS00001 u ON u.GUIDPESSOA=v.GUIDVENDEDOR AND u.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE v.GUIDENTIDADE=@guidentidade
        ORDER BY u.NOME
      `),
      pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade).query(`
        SELECT DISTINCT CAST(c.GUIDPESSOA AS NVARCHAR(36)) AS guidCliente, COALESCE(c.FANTASIA, c.NOME) AS nome
        FROM KS0005.KS00016 v
        INNER JOIN KS0002.KS00001 c ON c.GUIDPESSOA=v.GUIDCLIENTE AND c.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE v.GUIDENTIDADE=@guidentidade AND v.GUIDCLIENTE IS NOT NULL
        ORDER BY COALESCE(c.FANTASIA, c.NOME)
      `),
      pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade).query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS descricao
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
      pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade).query(`
        SELECT DISTINCT SITUACAO AS situacao
        FROM KS0005.KS00016
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO IS NOT NULL
        ORDER BY SITUACAO
      `),
    ]);

    return {
      caixas: caixas.recordset,
      vendedores: vendedores.recordset,
      clientes: clientes.recordset,
      formas: formas.recordset,
      situacoes: situacoes.recordset,
    };
  }),

  vendasFormaPagamento: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidCaixa: z.string().uuid().optional(),
      guidVendedor: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      guidCliente: z.string().uuid().optional(),
      situacao: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "vendas-forma-pagamento",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      await ensureVendasTables();
      await garantirTabelaFinanceiroAnexos(pool);

      const where = [
        "v.GUIDENTIDADE=@guidentidade",
        "v.SITUACAO='F'",
        "CONVERT(DATE, v.DATAVENDA) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
      ];
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input.guidCaixa) { where.push("v.GUIDCAIXA=@guidCaixa"); req.input("guidCaixa", sql.UniqueIdentifier, input.guidCaixa); }
      if (input.guidVendedor) { where.push("v.GUIDVENDEDOR=@guidVendedor"); req.input("guidVendedor", sql.UniqueIdentifier, input.guidVendedor); }
      if (input.guidFormaPagamento) { where.push("p.GUIDFORMAPAGAMENTO=@guidFormaPagamento"); req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento); }
      if (input.guidCliente) { where.push("v.GUIDCLIENTE=@guidCliente"); req.input("guidCliente", sql.UniqueIdentifier, input.guidCliente); }
      if (input.situacao) { where.push("v.SITUACAO=@situacao"); req.input("situacao", sql.VarChar(30), input.situacao); }

      const rows = await req.query(`
        SELECT
          CAST(fp.GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
          fp.PAGAMENTO AS formaPagamento,
          COUNT(DISTINCT v.GUIDVENDA) AS quantidadeVendas,
          CAST(SUM(ISNULL(p.VALORPAGO,0) - ISNULL(p.TROCO,0)) AS DECIMAL(18,2)) AS valorTotal
        FROM KS0005.KS00016 v
        INNER JOIN KS0005.KS00018 p
          ON p.GUIDVENDA=v.GUIDVENDA
         AND p.GUIDENTIDADE=v.GUIDENTIDADE
        INNER JOIN KS0003.KS00006 fp
          ON fp.GUIDPAGAMENTO=p.GUIDFORMAPAGAMENTO
         AND fp.GUIDENTIDADE=v.GUIDENTIDADE
         AND fp.SITUACAO='A'
        WHERE ${where.join(" AND ")}
        GROUP BY fp.GUIDPAGAMENTO, fp.PAGAMENTO
        ORDER BY valorTotal DESC
      `);

      const dados = rows.recordset.map((row) => ({
        guidFormaPagamento: row.guidFormaPagamento as string,
        formaPagamento: row.formaPagamento as string,
        quantidadeVendas: Number(row.quantidadeVendas ?? 0),
        valorTotal: Number(row.valorTotal ?? 0),
        percentual: 0,
      }));
      const totalGeral = dados.reduce((sum, row) => sum + row.valorTotal, 0);
      for (const row of dados) row.percentual = totalGeral > 0 ? (row.valorTotal / totalGeral) * 100 : 0;

      return { dados, totalGeral, quantidadeVendas: dados.reduce((sum, row) => sum + row.quantidadeVendas, 0) };
    }),

  filtrosContasReceber: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "contas-receber",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });

    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [clientes, vendedores, contas, centros, naturezas, formas] = await Promise.all([
      req().query(`
        SELECT DISTINCT CAST(p.GUIDPESSOA AS NVARCHAR(36)) AS guidCliente, COALESCE(p.FANTASIA, p.NOME) AS nome
        FROM KS0003.KS00005 cr
        INNER JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cr.GUIDDEVEDOR AND p.GUIDENTIDADE=cr.GUIDENTIDADE
        WHERE cr.GUIDENTIDADE=@guidentidade AND cr.STATUS <> 'CANCELADO'
        ORDER BY COALESCE(p.FANTASIA, p.NOME)
      `),
      req().query(`
        IF OBJECT_ID('KS0005.KS00016', 'U') IS NOT NULL
        BEGIN
          SELECT DISTINCT CAST(u.GUIDPESSOA AS NVARCHAR(36)) AS guidVendedor, u.NOME AS nome
          FROM KS0003.KS00005 cr
          INNER JOIN KS0005.KS00016 v ON v.GUIDVENDA=cr.GUIDORIGEM AND v.GUIDENTIDADE=cr.GUIDENTIDADE
          INNER JOIN KS0002.KS00001 u ON u.GUIDPESSOA=v.GUIDVENDEDOR AND u.GUIDENTIDADE=v.GUIDENTIDADE
          WHERE cr.GUIDENTIDADE=@guidentidade AND cr.STATUS <> 'CANCELADO'
          ORDER BY u.NOME
        END
      `),
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CONTA AS nome
        FROM KS0003.KS00001
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CENTRO AS nome
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CENTRO
      `),
      req().query(`
        SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA AS nome
        FROM KS0003.KS00003
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY NATUREZA
      `),
      req().query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS nome
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
    ]);

    return {
      clientes: clientes.recordset,
      vendedores: vendedores.recordset,
      contas: contas.recordset,
      centros: centros.recordset,
      naturezas: naturezas.recordset,
      formas: formas.recordset,
    };
  }),

  contasReceberRelatorio: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidCliente: z.string().uuid().optional(),
      guidVendedor: z.string().uuid().optional(),
      guidConta: z.string().uuid().optional(),
      guidCentro: z.string().uuid().optional(),
      guidNatureza: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      situacao: z.enum(["ABERTO", "RECEBIDO", "VENCIDO", "TODOS"]).default("TODOS"),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "contas-receber",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      await ensureVendasTables();
      await garantirTabelaFinanceiroAnexos(pool);

      const where = [
        "cr.GUIDENTIDADE=@guidentidade",
        "cr.STATUS <> 'CANCELADO'",
        "CONVERT(DATE, cr.DTVENCIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
      ];
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input.guidCliente) { where.push("cr.GUIDDEVEDOR=@guidCliente"); req.input("guidCliente", sql.UniqueIdentifier, input.guidCliente); }
      if (input.guidVendedor) { where.push("v.GUIDVENDEDOR=@guidVendedor"); req.input("guidVendedor", sql.UniqueIdentifier, input.guidVendedor); }
      if (input.guidConta) { where.push("cr.GUIDCONTA=@guidConta"); req.input("guidConta", sql.UniqueIdentifier, input.guidConta); }
      if (input.guidCentro) { where.push("cr.GUIDCENTRO=@guidCentro"); req.input("guidCentro", sql.UniqueIdentifier, input.guidCentro); }
      if (input.guidNatureza) { where.push("cr.GUIDNATUREZA=@guidNatureza"); req.input("guidNatureza", sql.UniqueIdentifier, input.guidNatureza); }
      if (input.guidFormaPagamento) { where.push("cr.GUIDPAGAMENTO=@guidFormaPagamento"); req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento); }
      if (input.situacao === "ABERTO") where.push("cr.STATUS IN ('ABERTO','PARCIAL') AND cr.DTVENCIMENTO >= CAST(GETDATE() AS DATE)");
      if (input.situacao === "RECEBIDO") where.push("cr.STATUS='PAGO'");
      if (input.situacao === "VENCIDO") where.push("cr.STATUS IN ('ABERTO','PARCIAL') AND cr.DTVENCIMENTO < CAST(GETDATE() AS DATE)");

      const result = await req.query(`
        SELECT
          CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          cr.NUMERODOC AS documento,
          CONCAT(ISNULL(cr.PARCELA,1), '/', ISNULL(cr.TOTALPARCELAS,1)) AS parcela,
          COALESCE(p.FANTASIA, p.NOME, cr.NOMEDEVEDOR) AS cliente,
          CONVERT(NVARCHAR(10), cr.DTLANCAMENTO, 23) AS emissao,
          CONVERT(NVARCHAR(10), cr.DTVENCIMENTO, 23) AS vencimento,
          CONVERT(NVARCHAR(10), cr.DTRECEBIMENTO, 23) AS dataRecebimento,
          fp.PAGAMENTO AS formaPagamento,
          pc.CONTA AS contaFinanceira,
          cc.CENTRO AS centroCusto,
          n.NATUREZA AS naturezaFinanceira,
          COALESCE(vend.NOME, '-') AS vendedor,
          ISNULL(ax.QTDANEXOS, 0) AS qtdAnexos,
          CAST(ISNULL(cr.VALOR,0) AS DECIMAL(18,2)) AS valorOriginal,
          CAST(0 AS DECIMAL(18,2)) AS juros,
          CAST(0 AS DECIMAL(18,2)) AS multa,
          CAST(0 AS DECIMAL(18,2)) AS desconto,
          CAST(ISNULL(cr.VALORRECEBIDO,0) AS DECIMAL(18,2)) AS valorRecebido,
          CAST(ISNULL(cr.VALOR,0) - ISNULL(cr.VALORRECEBIDO,0) AS DECIMAL(18,2)) AS saldo,
          CASE
            WHEN cr.STATUS IN ('ABERTO','PARCIAL') AND cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
            WHEN cr.STATUS='PAGO' THEN 'RECEBIDO'
            WHEN cr.STATUS='PARCIAL' THEN 'PARCIAL'
            ELSE cr.STATUS
          END AS situacao
        FROM KS0003.KS00005 cr
        LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cr.GUIDDEVEDOR AND p.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0005.KS00016 v ON v.GUIDVENDA=cr.GUIDORIGEM AND v.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0002.KS00001 vend ON vend.GUIDPESSOA=v.GUIDVENDEDOR AND vend.GUIDENTIDADE=v.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=cr.GUIDPAGAMENTO AND fp.GUIDENTIDADE=cr.GUIDENTIDADE AND fp.SITUACAO='A'
        LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=cr.GUIDCONTA AND pc.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO=cr.GUIDCENTRO AND cc.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=cr.GUIDNATUREZA AND n.GUIDENTIDADE=cr.GUIDENTIDADE
        OUTER APPLY (
          SELECT COUNT(1) AS QTDANEXOS
          FROM FINANCEIROANEXOS a
          WHERE a.GUIDENTIDADE=CAST(cr.GUIDENTIDADE AS CHAR(36))
            AND a.GUIDCONTARECEBER=CAST(cr.GUIDLANCAMENTO AS CHAR(36))
        ) ax
        WHERE ${where.join(" AND ")}
        ORDER BY cr.DTVENCIMENTO, cr.NUMERODOC, cr.PARCELA
      `);

      const dados = result.recordset.map((row) => ({
        ...row,
        valorOriginal: Number(row.valorOriginal ?? 0),
        juros: Number(row.juros ?? 0),
        multa: Number(row.multa ?? 0),
        desconto: Number(row.desconto ?? 0),
        valorRecebido: Number(row.valorRecebido ?? 0),
        saldo: Number(row.saldo ?? 0),
      }));
      const hoje = new Date().toISOString().slice(0, 10);
      const saldoPendente = (d: typeof dados[number]) => Math.max(Number(d.saldo ?? 0), 0);
      const tituloNaoRecebido = (d: typeof dados[number]) => saldoPendente(d) > 0 && d.situacao !== "RECEBIDO";
      const valorTotalGeral = dados.reduce((s, d) => s + d.valorOriginal, 0);
      const totalVencido = dados
        .filter((d) => tituloNaoRecebido(d) && d.vencimento < hoje)
        .reduce((s, d) => s + saldoPendente(d), 0);
      const resumo = {
        quantidadeTitulos: dados.length,
        totalAberto: dados.filter(tituloNaoRecebido).reduce((s, d) => s + saldoPendente(d), 0),
        totalRecebido: dados.reduce((s, d) => s + d.valorRecebido, 0),
        totalVencido,
        totalJuros: dados.reduce((s, d) => s + d.juros, 0),
        totalMultas: dados.reduce((s, d) => s + d.multa, 0),
        totalDescontos: dados.reduce((s, d) => s + d.desconto, 0),
        valorTotalGeral,
        valorReceberHoje: dados.filter((d) => tituloNaoRecebido(d) && d.vencimento === hoje).reduce((s, d) => s + saldoPendente(d), 0),
        valorAVencer: dados.filter((d) => tituloNaoRecebido(d) && d.vencimento > hoje).reduce((s, d) => s + saldoPendente(d), 0),
        recebidoPeriodo: dados.reduce((s, d) => s + d.valorRecebido, 0),
      };
      const inadimplenciaPercentual = valorTotalGeral > 0 ? (totalVencido / valorTotalGeral) * 100 : 0;

      function totaisPor(campo: string) {
        const map = new Map<string, number>();
        for (const row of dados) {
          const key = String(row[campo] ?? "Nao informado");
          map.set(key, (map.get(key) ?? 0) + row.saldo);
        }
        return Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
      }

      return {
        dados,
        resumo: { ...resumo, inadimplenciaPercentual },
        totais: {
          formasPagamento: totaisPor("formaPagamento"),
          contasFinanceiras: totaisPor("contaFinanceira"),
          centrosCusto: totaisPor("centroCusto"),
          naturezasFinanceiras: totaisPor("naturezaFinanceira"),
        },
      };
    }),

  filtrosContasPagar: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "contas-pagar",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });

    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [fornecedores, contas, centros, naturezas, formas] = await Promise.all([
      req().query(`
        SELECT DISTINCT CAST(p.GUIDPESSOA AS NVARCHAR(36)) AS guidFornecedor, COALESCE(p.FANTASIA, p.NOME) AS nome
        FROM KS0003.KS00004 cp
        INNER JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cp.GUIDCREDOR AND p.GUIDENTIDADE=cp.GUIDENTIDADE
        WHERE cp.GUIDENTIDADE=@guidentidade AND cp.STATUS <> 'CANCELADO'
        ORDER BY COALESCE(p.FANTASIA, p.NOME)
      `),
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CONTA AS nome
        FROM KS0003.KS00001
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CENTRO AS nome
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CENTRO
      `),
      req().query(`
        SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA AS nome
        FROM KS0003.KS00003
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY NATUREZA
      `),
      req().query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS nome
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
    ]);

    return {
      fornecedores: fornecedores.recordset,
      contas: contas.recordset,
      centros: centros.recordset,
      naturezas: naturezas.recordset,
      formas: formas.recordset,
    };
  }),

  contasPagarRelatorio: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidFornecedor: z.string().uuid().optional(),
      guidConta: z.string().uuid().optional(),
      guidCentro: z.string().uuid().optional(),
      guidNatureza: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      situacao: z.enum(["ABERTO", "PAGO", "VENCIDO", "TODOS"]).default("TODOS"),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "contas-pagar",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });

      const where = [
        "cp.GUIDENTIDADE=@guidentidade",
        "cp.STATUS <> 'CANCELADO'",
        "CONVERT(DATE, cp.DTVENCIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
      ];
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input.guidFornecedor) { where.push("cp.GUIDCREDOR=@guidFornecedor"); req.input("guidFornecedor", sql.UniqueIdentifier, input.guidFornecedor); }
      if (input.guidConta) { where.push("cp.GUIDCONTA=@guidConta"); req.input("guidConta", sql.UniqueIdentifier, input.guidConta); }
      if (input.guidCentro) { where.push("cp.GUIDCENTRO=@guidCentro"); req.input("guidCentro", sql.UniqueIdentifier, input.guidCentro); }
      if (input.guidNatureza) { where.push("cp.GUIDNATUREZA=@guidNatureza"); req.input("guidNatureza", sql.UniqueIdentifier, input.guidNatureza); }
      if (input.guidFormaPagamento) { where.push("cp.GUIDPAGAMENTO=@guidFormaPagamento"); req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento); }
      if (input.situacao === "ABERTO") where.push("cp.STATUS IN ('ABERTO','PARCIAL') AND cp.DTVENCIMENTO >= CAST(GETDATE() AS DATE)");
      if (input.situacao === "PAGO") where.push("cp.STATUS='PAGO'");
      if (input.situacao === "VENCIDO") where.push("cp.STATUS IN ('ABERTO','PARCIAL') AND cp.DTVENCIMENTO < CAST(GETDATE() AS DATE)");

      const result = await req.query(`
        SELECT
          CAST(cp.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          cp.NUMERODOC AS documento,
          CONCAT(ISNULL(cp.PARCELA,1), '/', ISNULL(cp.TOTALPARCELAS,1)) AS parcela,
          COALESCE(p.FANTASIA, p.NOME, cp.NOMECREDOR) AS fornecedor,
          CONVERT(NVARCHAR(10), cp.DTLANCAMENTO, 23) AS emissao,
          CONVERT(NVARCHAR(10), cp.DTVENCIMENTO, 23) AS vencimento,
          CONVERT(NVARCHAR(10), cp.DTPAGAMENTO, 23) AS dataPagamento,
          fp.PAGAMENTO AS formaPagamento,
          pc.CONTA AS contaFinanceira,
          n.NATUREZA AS naturezaFinanceira,
          cc.CENTRO AS centroCusto,
          CAST(ISNULL(cp.VALOR,0) AS DECIMAL(18,2)) AS valorOriginal,
          CAST(0 AS DECIMAL(18,2)) AS juros,
          CAST(0 AS DECIMAL(18,2)) AS multa,
          CAST(0 AS DECIMAL(18,2)) AS desconto,
          CAST(ISNULL(cp.VALORPAGO,0) AS DECIMAL(18,2)) AS valorPago,
          CAST(ISNULL(cp.VALOR,0) - ISNULL(cp.VALORPAGO,0) AS DECIMAL(18,2)) AS saldo,
          CASE
            WHEN cp.STATUS IN ('ABERTO','PARCIAL') AND cp.DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
            WHEN cp.STATUS='PAGO' THEN 'PAGO'
            WHEN cp.STATUS='PARCIAL' THEN 'PARCIAL'
            ELSE cp.STATUS
          END AS situacao
        FROM KS0003.KS00004 cp
        LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cp.GUIDCREDOR AND p.GUIDENTIDADE=cp.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=cp.GUIDPAGAMENTO AND fp.GUIDENTIDADE=cp.GUIDENTIDADE AND fp.SITUACAO='A'
        LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=cp.GUIDCONTA AND pc.GUIDENTIDADE=cp.GUIDENTIDADE
        LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO=cp.GUIDCENTRO AND cc.GUIDENTIDADE=cp.GUIDENTIDADE
        LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=cp.GUIDNATUREZA AND n.GUIDENTIDADE=cp.GUIDENTIDADE
        WHERE ${where.join(" AND ")}
        ORDER BY cp.DTVENCIMENTO, cp.NUMERODOC, cp.PARCELA
      `);

      const dados = result.recordset.map((row) => ({
        ...row,
        valorOriginal: Number(row.valorOriginal ?? 0),
        juros: Number(row.juros ?? 0),
        multa: Number(row.multa ?? 0),
        desconto: Number(row.desconto ?? 0),
        valorPago: Number(row.valorPago ?? 0),
        saldo: Number(row.saldo ?? 0),
      }));
      const hoje = new Date().toISOString().slice(0, 10);
      const saldoPendente = (d: typeof dados[number]) => Math.max(Number(d.saldo ?? 0), 0);
      const tituloNaoPago = (d: typeof dados[number]) => saldoPendente(d) > 0 && d.situacao !== "PAGO";
      const valorTotalGeral = dados.reduce((s, d) => s + d.valorOriginal, 0);
      const totalVencido = dados.filter((d) => tituloNaoPago(d) && d.vencimento < hoje).reduce((s, d) => s + saldoPendente(d), 0);
      const totalPago = dados.reduce((s, d) => s + d.valorPago, 0);
      const totalAberto = dados.filter(tituloNaoPago).reduce((s, d) => s + saldoPendente(d), 0);
      const valorAPagarHoje = dados.filter((d) => tituloNaoPago(d) && d.vencimento === hoje).reduce((s, d) => s + saldoPendente(d), 0);
      const valorAVencer = dados.filter((d) => tituloNaoPago(d) && d.vencimento > hoje).reduce((s, d) => s + saldoPendente(d), 0);
      const inadimplenciaPercentual = valorTotalGeral > 0 ? (totalVencido / valorTotalGeral) * 100 : 0;

      function totaisPor(campo: string) {
        const map = new Map<string, number>();
        for (const row of dados) {
          const key = String(row[campo] ?? "Nao informado");
          map.set(key, (map.get(key) ?? 0) + saldoPendente(row));
        }
        return Array.from(map.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
      }

      return {
        dados,
        resumo: {
          quantidadeTitulos: dados.length,
          totalAberto,
          totalPago,
          totalVencido,
          valorAPagarHoje,
          valorAVencer,
          inadimplenciaPercentual,
          valorTotalGeral,
          totalJuros: dados.reduce((s, d) => s + d.juros, 0),
          totalMultas: dados.reduce((s, d) => s + d.multa, 0),
          totalDescontos: dados.reduce((s, d) => s + d.desconto, 0),
          percentualPago: valorTotalGeral > 0 ? (totalPago / valorTotalGeral) * 100 : 0,
          percentualAtraso: inadimplenciaPercentual,
        },
        totais: {
          fornecedores: totaisPor("fornecedor"),
          formasPagamento: totaisPor("formaPagamento"),
          contasFinanceiras: totaisPor("contaFinanceira"),
          centrosCusto: totaisPor("centroCusto"),
          naturezasFinanceiras: totaisPor("naturezaFinanceira"),
        },
      };
    }),

  filtrosExtratoFluxoCaixa: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "fluxo-caixa",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
    await garantirCamposFluxoCaixa(pool);
    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [contas, caixas, centros, naturezas, formas] = await Promise.all([
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CONTA AS nome
        FROM KS0003.KS00008
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        IF OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO', 'U') IS NOT NULL
        BEGIN
          SELECT DISTINCT CAST(GUIDCAIXA AS NVARCHAR(36)) AS guidCaixa,
            COALESCE(DESCRICAO, CONCAT('Caixa ', NUMEROCAIXA)) AS nome
          FROM KS0005.KS_CAIXA_MOVIMENTO
          WHERE GUIDENTIDADE=@guidentidade
          ORDER BY nome
        END
      `),
      req().query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CENTRO AS nome
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CENTRO
      `),
      req().query(`
        SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA AS nome
        FROM KS0003.KS00003
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY NATUREZA
      `),
      req().query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS nome
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
    ]);
    return { contas: contas.recordset, caixas: caixas.recordset, centros: centros.recordset, naturezas: naturezas.recordset, formas: formas.recordset };
  }),

  extratoFluxoCaixa: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidConta: z.string().uuid().optional(),
      guidCaixa: z.string().uuid().optional(),
      guidCentro: z.string().uuid().optional(),
      guidNatureza: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "fluxo-caixa",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      await garantirCamposFluxoCaixa(pool);

      const filters: string[] = ["m.GUIDENTIDADE=@guidentidade"];
      const reqBase = (r: ReturnType<typeof pool.request>) => {
        r.input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
        if (input.guidConta) r.input("guidConta", sql.UniqueIdentifier, input.guidConta);
        if (input.guidCaixa) r.input("guidCaixa", sql.UniqueIdentifier, input.guidCaixa);
        if (input.guidCentro) r.input("guidCentro", sql.UniqueIdentifier, input.guidCentro);
        if (input.guidNatureza) r.input("guidNatureza", sql.UniqueIdentifier, input.guidNatureza);
        if (input.guidFormaPagamento) r.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento);
        return r;
      };
      if (input.guidConta) filters.push("m.GUIDCONTA=@guidConta");
      if (input.guidCaixa) filters.push("m.GUIDCAIXA=@guidCaixa");
      if (input.guidCentro) filters.push("m.GUIDCENTRO=@guidCentro");
      if (input.guidNatureza) filters.push("m.GUIDNATUREZA=@guidNatureza");
      if (input.guidFormaPagamento) filters.push("m.GUIDFORMAPAGAMENTO=@guidFormaPagamento");
      const baseWhere = filters.join(" AND ");

      const saldoInicialR = await reqBase(pool.request())
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .query(`
          SELECT ISNULL(SUM(CASE WHEN m.TIPO='E' THEN m.VALOR ELSE -m.VALOR END),0) AS saldoInicial
          FROM KS0003.KS00010 m
          WHERE ${baseWhere} AND CONVERT(DATE, m.DTLANCAMENTO) < CONVERT(DATE, @dtInicio)
        `);
      const saldoInicial = Number(saldoInicialR.recordset[0]?.saldoInicial ?? 0);

      const rowsR = await reqBase(pool.request())
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim)
        .input("saldoInicial", sql.Decimal(18, 2), saldoInicial)
        .query(`
          SELECT
            CAST(m.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidMovimento,
            CONVERT(NVARCHAR(10), m.DTLANCAMENTO, 23) AS data,
            m.NUMERODOC AS documento,
            m.DESCRICAO AS historico,
            ISNULL(m.ORIGEM, CASE WHEN m.GUIDVENDA IS NOT NULL THEN 'VENDA' ELSE 'FINANCEIRO' END) AS origem,
            COALESCE(cli.FANTASIA, cli.NOME, '-') AS clienteFornecedor,
            cb.CONTA AS contaFinanceira,
            COALESCE(cx.DESCRICAO, CASE WHEN cx.NUMEROCAIXA IS NOT NULL THEN CONCAT('Caixa ', cx.NUMEROCAIXA) END, '-') AS caixa,
            fp.PAGAMENTO AS formaPagamento,
            n.NATUREZA AS naturezaFinanceira,
            cc.CENTRO AS centroCusto,
            CASE WHEN m.TIPO='E' THEN CAST(m.VALOR AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS entrada,
            CASE WHEN m.TIPO='S' THEN CAST(m.VALOR AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS saida,
            @saldoInicial + SUM(CASE WHEN m.TIPO='E' THEN m.VALOR ELSE -m.VALOR END)
              OVER (ORDER BY m.DTLANCAMENTO, m.DATACADASTRO, m.GUIDLANCAMENTO ROWS UNBOUNDED PRECEDING) AS saldoAcumulado
          FROM KS0003.KS00010 m
          LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA=m.GUIDCONTA AND cb.GUIDENTIDADE=m.GUIDENTIDADE
          LEFT JOIN KS0005.KS_CAIXA_MOVIMENTO cx ON cx.GUIDCAIXA=m.GUIDCAIXA AND cx.GUIDENTIDADE=m.GUIDENTIDADE
          LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=m.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE=m.GUIDENTIDADE AND fp.SITUACAO='A'
          LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA=m.GUIDNATUREZA AND n.GUIDENTIDADE=m.GUIDENTIDADE
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO=m.GUIDCENTRO AND cc.GUIDENTIDADE=m.GUIDENTIDADE
          LEFT JOIN KS0005.KS00016 v ON v.GUIDVENDA=m.GUIDVENDA AND v.GUIDENTIDADE=m.GUIDENTIDADE
          LEFT JOIN KS0002.KS00001 cli ON cli.GUIDPESSOA=v.GUIDCLIENTE AND cli.GUIDENTIDADE=v.GUIDENTIDADE
          WHERE ${baseWhere}
            AND CONVERT(DATE, m.DTLANCAMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)
          ORDER BY m.DTLANCAMENTO, m.DATACADASTRO, m.GUIDLANCAMENTO
        `);
      const dados = rowsR.recordset.map((row) => ({
        ...row,
        entrada: Number(row.entrada ?? 0),
        saida: Number(row.saida ?? 0),
        saldoAcumulado: Number(row.saldoAcumulado ?? 0),
      }));
      const totalEntradas = dados.reduce((s, d) => s + d.entrada, 0);
      const totalSaidas = dados.reduce((s, d) => s + d.saida, 0);
      return {
        dados,
        resumo: {
          saldoInicial,
          totalEntradas,
          totalSaidas,
          saldoFinal: saldoInicial + totalEntradas - totalSaidas,
        },
      };
    }),

  filtrosComissoes: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "comissoes",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
    await ensureVendasTables();

    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [vendedores, vendas, clientes] = await Promise.all([
      req().query(`
        SELECT DISTINCT CAST(f.GUIDPESSOA AS NVARCHAR(36)) AS guidVendedor, f.NOME AS nome
        FROM KS0005.KS00001 m
        INNER JOIN KS0002.KS00001 f ON f.GUIDPESSOA=m.GUIDFUNCIONARIO AND f.GUIDENTIDADE=m.GUIDENTIDADE
        WHERE m.GUIDENTIDADE=@guidentidade
          AND m.TIPO='COMISSAO'
          AND ISNULL(m.STATUS,'ABERTO') <> 'CANCELADO'
        ORDER BY f.NOME
      `),
      req().query(`
        SELECT DISTINCT
          CAST(v.GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
          COALESCE(CAST(v.NUMEROVENDA AS NVARCHAR(30)), CAST(v.CODPREVENDA AS NVARCHAR(30)), CAST(v.GUIDVENDA AS NVARCHAR(36))) AS venda
        FROM KS0005.KS00001 m
        OUTER APPLY (
          SELECT LTRIM(RTRIM(CASE WHEN CHARINDEX('GUIDVENDA:', ISNULL(m.OBSERVACAO,'')) > 0
            THEN SUBSTRING(m.OBSERVACAO, CHARINDEX('GUIDVENDA:', m.OBSERVACAO) + 10, 36)
          END)) AS guidVendaTexto
        ) parsed
        INNER JOIN KS0005.KS00016 v ON CAST(v.GUIDVENDA AS NVARCHAR(36))=parsed.guidVendaTexto AND v.GUIDENTIDADE=m.GUIDENTIDADE
        WHERE m.GUIDENTIDADE=@guidentidade
          AND m.TIPO='COMISSAO'
          AND ISNULL(m.STATUS,'ABERTO') <> 'CANCELADO'
          AND ISNULL(v.SITUACAO,'F') <> 'CANCELADO'
          AND ISNULL(v.STATUSNFE,'') <> 'CANCELADA'
        ORDER BY venda
      `),
      req().query(`
        SELECT DISTINCT CAST(c.GUIDPESSOA AS NVARCHAR(36)) AS guidCliente, COALESCE(c.FANTASIA, c.NOME) AS nome
        FROM KS0005.KS00001 m
        OUTER APPLY (
          SELECT LTRIM(RTRIM(CASE WHEN CHARINDEX('GUIDVENDA:', ISNULL(m.OBSERVACAO,'')) > 0
            THEN SUBSTRING(m.OBSERVACAO, CHARINDEX('GUIDVENDA:', m.OBSERVACAO) + 10, 36)
          END)) AS guidVendaTexto
        ) parsed
        INNER JOIN KS0005.KS00016 v ON CAST(v.GUIDVENDA AS NVARCHAR(36))=parsed.guidVendaTexto AND v.GUIDENTIDADE=m.GUIDENTIDADE
        INNER JOIN KS0002.KS00001 c ON c.GUIDPESSOA=v.GUIDCLIENTE AND c.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE m.GUIDENTIDADE=@guidentidade
          AND m.TIPO='COMISSAO'
          AND ISNULL(m.STATUS,'ABERTO') <> 'CANCELADO'
          AND ISNULL(v.SITUACAO,'F') <> 'CANCELADO'
          AND ISNULL(v.STATUSNFE,'') <> 'CANCELADA'
        ORDER BY COALESCE(c.FANTASIA, c.NOME)
      `),
    ]);

    return {
      vendedores: vendedores.recordset,
      vendas: vendas.recordset,
      clientes: clientes.recordset,
    };
  }),

  comissoesRelatorio: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidVendedor: z.string().uuid().optional(),
      situacao: z.enum(["PENDENTE", "PAGO", "PARCIAL", "TODOS"]).default("TODOS"),
      guidVenda: z.string().uuid().optional(),
      guidCliente: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "comissoes",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      await ensureVendasTables();
      await garantirTabelaFinanceiroAnexos(pool);

      const where = [
        "m.GUIDENTIDADE=@guidentidade",
        "m.TIPO='COMISSAO'",
        "ISNULL(m.STATUS,'ABERTO') <> 'CANCELADO'",
        "CONVERT(DATE, m.DATAMOVIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
        "(parsed.guidVendaTexto IS NULL OR (ISNULL(v.SITUACAO,'F') <> 'CANCELADO' AND ISNULL(v.STATUSNFE,'') <> 'CANCELADA'))",
      ];
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input.guidVendedor) { where.push("m.GUIDFUNCIONARIO=@guidVendedor"); req.input("guidVendedor", sql.UniqueIdentifier, input.guidVendedor); }
      if (input.guidVenda) { where.push("parsed.guidVendaTexto=@guidVenda"); req.input("guidVenda", sql.NVarChar(36), input.guidVenda); }
      if (input.guidCliente) { where.push("v.GUIDCLIENTE=@guidCliente"); req.input("guidCliente", sql.UniqueIdentifier, input.guidCliente); }

      const situacaoSql = `
        CASE
          WHEN cp.STATUS='PAGO' THEN 'PAGO'
          WHEN cp.STATUS='PARCIAL' OR (ISNULL(cp.VALORPAGO,0) > 0 AND ISNULL(cp.VALORPAGO,0) < ISNULL(cp.VALOR,0)) THEN 'PARCIAL'
          ELSE 'PENDENTE'
        END
      `;
      if (input.situacao !== "TODOS") where.push(`${situacaoSql}=@situacao`);
      if (input.situacao !== "TODOS") req.input("situacao", sql.NVarChar(20), input.situacao);

      const result = await req.query(`
        SELECT
          CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
          CONVERT(NVARCHAR(10), m.DATAMOVIMENTO, 23) AS data,
          COALESCE(CAST(v.NUMEROVENDA AS NVARCHAR(30)), CAST(v.CODPREVENDA AS NVARCHAR(30)), parsed.guidVendaTexto, '-') AS venda,
          parsed.guidVendaTexto AS guidVenda,
          COALESCE(c.FANTASIA, c.NOME, '-') AS cliente,
          f.NOME AS vendedor,
          CAST(m.GUIDFUNCIONARIO AS NVARCHAR(36)) AS guidVendedor,
          m.OBSERVACAO AS observacao,
          CAST(ISNULL(v.TOTALVENDA, 0) AS DECIMAL(18,2)) AS baseCalculo,
          CAST(ISNULL(m.VALOR,0) AS DECIMAL(18,2)) AS valorComissao,
          CAST(
            CASE
              WHEN cp.STATUS='PAGO' THEN ISNULL(m.VALOR,0)
              WHEN (cp.STATUS='PARCIAL' OR (ISNULL(cp.VALORPAGO,0) > 0 AND ISNULL(cp.VALORPAGO,0) < ISNULL(cp.VALOR,0))) AND ISNULL(cp.VALOR,0) > 0
                THEN (ISNULL(cp.VALORPAGO,0) / NULLIF(cp.VALOR,0)) * ISNULL(m.VALOR,0)
              ELSE 0
            END AS DECIMAL(18,2)
          ) AS valorPago,
          CAST(ISNULL(m.VALOR,0) -
            CASE
              WHEN cp.STATUS='PAGO' THEN ISNULL(m.VALOR,0)
              WHEN (cp.STATUS='PARCIAL' OR (ISNULL(cp.VALORPAGO,0) > 0 AND ISNULL(cp.VALORPAGO,0) < ISNULL(cp.VALOR,0))) AND ISNULL(cp.VALOR,0) > 0
                THEN (ISNULL(cp.VALORPAGO,0) / NULLIF(cp.VALOR,0)) * ISNULL(m.VALOR,0)
              ELSE 0
            END AS DECIMAL(18,2)
          ) AS saldo,
          CONVERT(NVARCHAR(10), cp.DTPAGAMENTO, 23) AS dataPagamento,
          ${situacaoSql} AS situacao,
          ISNULL(m.COMPETENCIA, CONVERT(VARCHAR(7), m.DATAMOVIMENTO, 120)) AS periodo
        FROM KS0005.KS00001 m
        INNER JOIN KS0002.KS00001 f ON f.GUIDPESSOA=m.GUIDFUNCIONARIO AND f.GUIDENTIDADE=m.GUIDENTIDADE
        OUTER APPLY (
          SELECT
            LTRIM(RTRIM(CASE WHEN CHARINDEX('GUIDVENDA:', ISNULL(m.OBSERVACAO,'')) > 0
              THEN SUBSTRING(m.OBSERVACAO, CHARINDEX('GUIDVENDA:', m.OBSERVACAO) + 10, 36)
            END)) AS guidVendaTexto,
            NULLIF(CHARINDEX('Percentual:', ISNULL(m.OBSERVACAO,'')), 0) AS pctInicio
        ) parsed
        LEFT JOIN KS0005.KS00016 v ON CAST(v.GUIDVENDA AS NVARCHAR(36))=parsed.guidVendaTexto AND v.GUIDENTIDADE=m.GUIDENTIDADE
        LEFT JOIN KS0002.KS00001 c ON c.GUIDPESSOA=v.GUIDCLIENTE AND c.GUIDENTIDADE=v.GUIDENTIDADE
        LEFT JOIN KS0005.KS00003 item ON item.GUIDFECHAMENTO=m.GUIDFECHAMENTO AND item.GUIDFUNCIONARIO=m.GUIDFUNCIONARIO
        LEFT JOIN KS0003.KS00004 cp ON cp.GUIDLANCAMENTO=item.GUIDLANCPAGAR AND cp.GUIDENTIDADE=m.GUIDENTIDADE AND cp.STATUS <> 'CANCELADO'
        WHERE ${where.join(" AND ")}
        ORDER BY m.DATAMOVIMENTO, f.NOME, venda
      `);

      const dados = result.recordset.map((row) => {
        const percentualMatch = String(row.observacao ?? "").match(/Percentual:\s*([\d.,]+)%/i);
        const percentualComissao = percentualMatch
          ? Number(percentualMatch[1].replace(",", "."))
          : 0;
        const { observacao: _observacao, ...rest } = row;
        return {
          ...rest,
          percentualComissao: Number.isFinite(percentualComissao) ? percentualComissao : 0,
          baseCalculo: Number(row.baseCalculo ?? 0),
          valorComissao: Number(row.valorComissao ?? 0),
          valorPago: Number(row.valorPago ?? 0),
          saldo: Number(row.saldo ?? 0),
        };
      });
      const totalComissoes = dados.reduce((s, d) => s + d.valorComissao, 0);
      const totalPago = dados.reduce((s, d) => s + d.valorPago, 0);
      const totalPendente = dados.filter((d) => d.situacao === "PENDENTE").reduce((s, d) => s + d.saldo, 0);
      const totalParcial = dados.filter((d) => d.situacao === "PARCIAL").reduce((s, d) => s + d.saldo, 0);
      const vendedores = new Set(dados.map((d) => d.guidVendedor).filter(Boolean));

      function agruparVendedor() {
        const map = new Map<string, {
          vendedor: string;
          quantidadeVendas: number;
          valorVendido: number;
          comissaoGerada: number;
          comissaoPaga: number;
          comissaoPendente: number;
          vendas: Set<string>;
        }>();
        for (const row of dados) {
          const key = row.guidVendedor ?? row.vendedor ?? "Nao informado";
          const item = map.get(key) ?? {
            vendedor: row.vendedor ?? "Nao informado",
            quantidadeVendas: 0,
            valorVendido: 0,
            comissaoGerada: 0,
            comissaoPaga: 0,
            comissaoPendente: 0,
            vendas: new Set<string>(),
          };
          const vendaKey = row.guidVenda ?? `${row.venda}-${row.guidMovimento}`;
          if (!item.vendas.has(vendaKey)) {
            item.vendas.add(vendaKey);
            item.valorVendido += row.baseCalculo;
          }
          item.comissaoGerada += row.valorComissao;
          item.comissaoPaga += row.valorPago;
          item.comissaoPendente += row.saldo;
          map.set(key, item);
        }
        return Array.from(map.values()).map((item) => ({
          vendedor: item.vendedor,
          quantidadeVendas: item.vendas.size,
          valorVendido: item.valorVendido,
          comissaoGerada: item.comissaoGerada,
          comissaoPaga: item.comissaoPaga,
          comissaoPendente: item.comissaoPendente,
        }));
      }

      const totaisPorVendedor = agruparVendedor().sort((a, b) => b.comissaoGerada - a.comissaoGerada);
      const evolucaoMap = new Map<string, { periodo: string; comissaoGerada: number; comissaoPaga: number }>();
      const situacaoMap = new Map<string, number>();
      for (const row of dados) {
        const periodo = row.periodo ?? row.data?.slice(0, 7) ?? "Sem periodo";
        const evolucao = evolucaoMap.get(periodo) ?? { periodo, comissaoGerada: 0, comissaoPaga: 0 };
        evolucao.comissaoGerada += row.valorComissao;
        evolucao.comissaoPaga += row.valorPago;
        evolucaoMap.set(periodo, evolucao);
        situacaoMap.set(row.situacao, (situacaoMap.get(row.situacao) ?? 0) + row.saldo);
      }

      return {
        dados,
        resumo: {
          quantidadeComissoes: dados.length,
          totalComissoes,
          totalPendente,
          totalPago,
          totalParcial,
          percentualPago: totalComissoes > 0 ? (totalPago / totalComissoes) * 100 : 0,
          percentualPendente: totalComissoes > 0 ? ((totalPendente + totalParcial) / totalComissoes) * 100 : 0,
          totalGeral: totalComissoes,
          quantidadeVendedores: vendedores.size,
          mediaComissaoVendedor: vendedores.size > 0 ? totalComissoes / vendedores.size : 0,
          comissaoGeradaPeriodo: totalComissoes,
          comissaoPagaPeriodo: totalPago,
          comissaoAberto: Math.max(totalComissoes - totalPago, 0),
          percentualLiquidado: totalComissoes > 0 ? (totalPago / totalComissoes) * 100 : 0,
        },
        totaisPorVendedor,
        rankingComissao: [...totaisPorVendedor].sort((a, b) => b.comissaoGerada - a.comissaoGerada),
        rankingValorVendido: [...totaisPorVendedor].sort((a, b) => b.valorVendido - a.valorVendido),
        graficos: {
          comissaoPorVendedor: totaisPorVendedor.map((row) => ({ nome: row.vendedor, valor: row.comissaoGerada })),
          pagoPendente: [
            { nome: "Pago", valor: totalPago },
            { nome: "Pendente", valor: Math.max(totalComissoes - totalPago, 0) },
          ],
          evolucaoMensal: Array.from(evolucaoMap.values()).sort((a, b) => a.periodo.localeCompare(b.periodo)),
          porSituacao: Array.from(situacaoMap.entries()).map(([nome, valor]) => ({ nome, valor })),
        },
      };
    }),

  filtrosDreGerencial: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "dre-gerencial",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [centros, contasFinanceiras, planos, naturezas, formas] = await Promise.all([
      req().query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CENTRO AS nome
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CENTRO
      `),
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidContaFinanceira, CONTA AS nome
        FROM KS0003.KS00008
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidPlanoConta, CONTA AS nome
        FROM KS0003.KS00001
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        SELECT CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza, NATUREZA AS nome
        FROM KS0003.KS00003
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY NATUREZA
      `),
      req().query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS nome
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
    ]);
    return {
      centros: centros.recordset,
      contasFinanceiras: contasFinanceiras.recordset,
      planos: planos.recordset,
      naturezas: naturezas.recordset,
      formas: formas.recordset,
    };
  }),

  dreGerencial: protectedProcedure
    .input(dreGerencialInputSchema)
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "dre-gerencial",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      return obterDreGerencial(ctx.user.guidEntidade, input);
    }),

  filtrosInadimplencia: protectedProcedure.query(async ({ ctx }) => {
    const pool = await getSqlPool();
    const autorizado = await podeAcessarRelatorio(pool, {
      guidEntidade: ctx.user.guidEntidade,
      guidUsuario: ctx.user.guidPessoa,
      isGerente: ctx.user.isGerente,
      reportId: "inadimplencia",
    });
    if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
    await ensureVendasTables();

    const req = () => pool.request().input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade);
    const [clientes, vendedores, formas, contas, centros] = await Promise.all([
      req().query(`
        SELECT DISTINCT CAST(p.GUIDPESSOA AS NVARCHAR(36)) AS guidCliente, COALESCE(p.FANTASIA, p.NOME, cr.NOMEDEVEDOR) AS nome
        FROM KS0003.KS00005 cr
        LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cr.GUIDDEVEDOR AND p.GUIDENTIDADE=cr.GUIDENTIDADE
        WHERE cr.GUIDENTIDADE=@guidentidade
          AND ISNULL(cr.STATUS,'ABERTO') NOT IN ('CANCELADO','ESTORNADO')
          AND ISNULL(cr.VALOR,0) - ISNULL(cr.VALORRECEBIDO,0) > 0
        ORDER BY COALESCE(p.FANTASIA, p.NOME, cr.NOMEDEVEDOR)
      `),
      req().query(`
        SELECT DISTINCT CAST(u.GUIDPESSOA AS NVARCHAR(36)) AS guidVendedor, u.NOME AS nome
        FROM KS0002.KS00001 u
        WHERE u.GUIDENTIDADE=@guidentidade
          AND u.CADUSUARIO=1
          AND u.SITUACAO='A'
        ORDER BY u.NOME
      `),
      req().query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento, PAGAMENTO AS nome
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `),
      req().query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CONTA AS nome
        FROM KS0003.KS00001
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CONTA
      `),
      req().query(`
        SELECT CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro, CENTRO AS nome
        FROM KS0003.KS00002
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY CENTRO
      `),
    ]);
    return {
      clientes: clientes.recordset,
      vendedores: vendedores.recordset,
      formas: formas.recordset,
      contas: contas.recordset,
      centros: centros.recordset,
    };
  }),

  inadimplenciaRelatorio: protectedProcedure
    .input(z.object({
      dtInicio: z.string(),
      dtFim: z.string(),
      guidCliente: z.string().uuid().optional(),
      guidVendedor: z.string().uuid().optional(),
      guidFormaPagamento: z.string().uuid().optional(),
      guidConta: z.string().uuid().optional(),
      guidCentro: z.string().uuid().optional(),
      faixaAtraso: z.enum(["1-30", "31-60", "61-90", "90+", "TODOS"]).default("TODOS"),
      situacao: z.enum(["VENCIDO", "PARCIAL", "ABERTO", "TODOS"]).default("TODOS"),
    }))
    .query(async ({ input, ctx }) => {
      const pool = await getSqlPool();
      const autorizado = await podeAcessarRelatorio(pool, {
        guidEntidade: ctx.user.guidEntidade,
        guidUsuario: ctx.user.guidPessoa,
        isGerente: ctx.user.isGerente,
        reportId: "inadimplencia",
      });
      if (!autorizado) throw new TRPCError({ code: "FORBIDDEN", message: "Relatorio nao liberado para este usuario." });
      await ensureVendasTables();
      await garantirTabelaFinanceiroAnexos(pool);

      const where = [
        "cr.GUIDENTIDADE=@guidentidade",
        "ISNULL(cr.STATUS,'ABERTO') NOT IN ('CANCELADO','ESTORNADO')",
        "ISNULL(cr.VALOR,0) - ISNULL(cr.VALORRECEBIDO,0) > 0",
        "CONVERT(DATE, cr.DTVENCIMENTO) BETWEEN CONVERT(DATE, @dtInicio) AND CONVERT(DATE, @dtFim)",
      ];
      const req = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("dtInicio", sql.NVarChar(10), input.dtInicio)
        .input("dtFim", sql.NVarChar(10), input.dtFim);
      if (input.guidCliente) { where.push("cr.GUIDDEVEDOR=@guidCliente"); req.input("guidCliente", sql.UniqueIdentifier, input.guidCliente); }
      if (input.guidVendedor) { where.push("v.GUIDVENDEDOR=@guidVendedor"); req.input("guidVendedor", sql.UniqueIdentifier, input.guidVendedor); }
      if (input.guidFormaPagamento) { where.push("cr.GUIDPAGAMENTO=@guidFormaPagamento"); req.input("guidFormaPagamento", sql.UniqueIdentifier, input.guidFormaPagamento); }
      if (input.guidConta) { where.push("cr.GUIDCONTA=@guidConta"); req.input("guidConta", sql.UniqueIdentifier, input.guidConta); }
      if (input.guidCentro) { where.push("cr.GUIDCENTRO=@guidCentro"); req.input("guidCentro", sql.UniqueIdentifier, input.guidCentro); }
      if (input.situacao === "VENCIDO") where.push("cr.DTVENCIMENTO < CAST(GETDATE() AS DATE)");
      if (input.situacao === "PARCIAL") where.push("cr.STATUS='PARCIAL'");
      if (input.situacao === "ABERTO") where.push("cr.STATUS IN ('ABERTO','PARCIAL') AND cr.DTVENCIMENTO >= CAST(GETDATE() AS DATE)");
      if (input.faixaAtraso === "1-30") where.push("cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) AND DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 1 AND 30");
      if (input.faixaAtraso === "31-60") where.push("cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) AND DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 31 AND 60");
      if (input.faixaAtraso === "61-90") where.push("cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) AND DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 61 AND 90");
      if (input.faixaAtraso === "90+") where.push("cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) AND DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) > 90");

      const result = await req.query(`
        SELECT
          CAST(cr.GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
          CAST(cr.GUIDDEVEDOR AS NVARCHAR(36)) AS guidCliente,
          COALESCE(p.FANTASIA, p.NOME, cr.NOMEDEVEDOR, 'Cliente nao informado') AS cliente,
          cr.NUMERODOC AS documento,
          CONCAT(ISNULL(cr.PARCELA,1), '/', ISNULL(cr.TOTALPARCELAS,1)) AS parcela,
          CONVERT(NVARCHAR(10), cr.DTLANCAMENTO, 23) AS emissao,
          CONVERT(NVARCHAR(10), cr.DTVENCIMENTO, 23) AS vencimento,
          CASE WHEN cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) ELSE 0 END AS diasAtraso,
          CAST(ISNULL(cr.VALOR,0) AS DECIMAL(18,2)) AS valorOriginal,
          CAST(ISNULL(cr.VALORRECEBIDO,0) AS DECIMAL(18,2)) AS valorRecebido,
          CAST(ISNULL(cr.VALOR,0) - ISNULL(cr.VALORRECEBIDO,0) AS DECIMAL(18,2)) AS saldoDevedor,
          fp.PAGAMENTO AS formaPagamento,
          pc.CONTA AS contaFinanceira,
          cc.CENTRO AS centroCusto,
          vend.NOME AS vendedor,
          ISNULL(ax.QTDANEXOS, 0) AS qtdAnexos,
          CASE
            WHEN cr.DTVENCIMENTO < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
            WHEN cr.STATUS='PARCIAL' THEN 'PARCIAL'
            ELSE 'EM ABERTO'
          END AS situacao,
          CASE
            WHEN cr.DTVENCIMENTO >= CAST(GETDATE() AS DATE) THEN 'A vencer'
            WHEN DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 1 AND 30 THEN '01 a 30 dias'
            WHEN DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 31 AND 60 THEN '31 a 60 dias'
            WHEN DATEDIFF(DAY, cr.DTVENCIMENTO, GETDATE()) BETWEEN 61 AND 90 THEN '61 a 90 dias'
            ELSE 'Acima de 90 dias'
          END AS faixaAtraso,
          CONVERT(VARCHAR(7), cr.DTVENCIMENTO, 120) AS periodo
        FROM KS0003.KS00005 cr
        LEFT JOIN KS0002.KS00001 p ON p.GUIDPESSOA=cr.GUIDDEVEDOR AND p.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0005.KS00016 v ON v.GUIDVENDA=cr.GUIDORIGEM AND v.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0002.KS00001 vend ON vend.GUIDPESSOA=v.GUIDVENDEDOR AND vend.GUIDENTIDADE=v.GUIDENTIDADE
        LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=cr.GUIDPAGAMENTO AND fp.GUIDENTIDADE=cr.GUIDENTIDADE AND fp.SITUACAO='A'
        LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA=cr.GUIDCONTA AND pc.GUIDENTIDADE=cr.GUIDENTIDADE
        LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO=cr.GUIDCENTRO AND cc.GUIDENTIDADE=cr.GUIDENTIDADE
        OUTER APPLY (
          SELECT COUNT(1) AS QTDANEXOS
          FROM FINANCEIROANEXOS a
          WHERE a.GUIDENTIDADE=CAST(cr.GUIDENTIDADE AS CHAR(36))
            AND a.GUIDCONTARECEBER=CAST(cr.GUIDLANCAMENTO AS CHAR(36))
        ) ax
        WHERE ${where.join(" AND ")}
        ORDER BY cr.DTVENCIMENTO, cliente, cr.NUMERODOC, cr.PARCELA
      `);

      const dados = result.recordset.map((row) => ({
        ...row,
        diasAtraso: Number(row.diasAtraso ?? 0),
        valorOriginal: Number(row.valorOriginal ?? 0),
        valorRecebido: Number(row.valorRecebido ?? 0),
        saldoDevedor: Number(row.saldoDevedor ?? 0),
      }));

      const carteiraTotal = dados.reduce((s, d) => s + d.valorOriginal, 0);
      const carteiraRecebida = dados.reduce((s, d) => s + d.valorRecebido, 0);
      const carteiraAberta = dados.reduce((s, d) => s + d.saldoDevedor, 0);
      const vencidos = dados.filter((d) => d.diasAtraso > 0);
      const carteiraVencida = vencidos.reduce((s, d) => s + d.saldoDevedor, 0);
      const clientesInadimplentes = new Set(vencidos.map((d) => d.guidCliente ?? d.cliente).filter(Boolean)).size;
      const diasMediosAtraso = vencidos.length ? vencidos.reduce((s, d) => s + d.diasAtraso, 0) / vencidos.length : 0;

      const rankingMap = new Map<string, { cliente: string; quantidadeTitulos: number; valorAberto: number; diasTotal: number; diasCount: number }>();
      const faixaMap = new Map<string, number>([
        ["01 a 30 dias", 0],
        ["31 a 60 dias", 0],
        ["61 a 90 dias", 0],
        ["Acima de 90 dias", 0],
      ]);
      const evolucaoMap = new Map<string, number>();
      for (const row of dados) {
        const clienteKey = row.guidCliente ?? row.cliente ?? "Cliente nao informado";
        const ranking = rankingMap.get(clienteKey) ?? { cliente: row.cliente ?? "Cliente nao informado", quantidadeTitulos: 0, valorAberto: 0, diasTotal: 0, diasCount: 0 };
        ranking.quantidadeTitulos += 1;
        ranking.valorAberto += row.saldoDevedor;
        if (row.diasAtraso > 0) {
          ranking.diasTotal += row.diasAtraso;
          ranking.diasCount += 1;
          faixaMap.set(row.faixaAtraso, (faixaMap.get(row.faixaAtraso) ?? 0) + row.saldoDevedor);
          evolucaoMap.set(row.periodo, (evolucaoMap.get(row.periodo) ?? 0) + row.saldoDevedor);
        }
        rankingMap.set(clienteKey, ranking);
      }
      const rankingClientes = Array.from(rankingMap.values())
        .map((r) => ({
          cliente: r.cliente,
          quantidadeTitulos: r.quantidadeTitulos,
          valorAberto: r.valorAberto,
          diasMediosAtraso: r.diasCount ? r.diasTotal / r.diasCount : 0,
          percentualCarteira: carteiraTotal > 0 ? (r.valorAberto / carteiraTotal) * 100 : 0,
        }))
        .sort((a, b) => b.valorAberto - a.valorAberto);

      return {
        dados,
        resumo: {
          clientesInadimplentes,
          quantidadeTitulosVencidos: vencidos.length,
          valorTotalVencido: carteiraVencida,
          valorTotalAberto: carteiraAberta,
          percentualInadimplencia: carteiraTotal > 0 ? (carteiraVencida / carteiraTotal) * 100 : 0,
          maiorDevedorValor: rankingClientes[0]?.valorAberto ?? 0,
          maiorDevedorNome: rankingClientes[0]?.cliente ?? "-",
          mediaDiasAtraso: diasMediosAtraso,
          totalCarteira: carteiraTotal,
          carteiraTotal,
          carteiraRecebida,
          carteiraAberta,
          carteiraVencida,
          percentualRecuperacao: carteiraTotal > 0 ? (carteiraRecebida / carteiraTotal) * 100 : 0,
          percentualInadimplenciaResumo: carteiraTotal > 0 ? (carteiraVencida / carteiraTotal) * 100 : 0,
        },
        rankingClientes,
        graficos: {
          faixasAtraso: Array.from(faixaMap.entries()).map(([faixa, valor]) => ({ faixa, valor })),
          evolucaoMensal: Array.from(evolucaoMap.entries()).map(([periodo, valor]) => ({ periodo, valor })).sort((a, b) => a.periodo.localeCompare(b.periodo)),
          topClientes: rankingClientes.slice(0, 10).map((r) => ({ cliente: r.cliente, valor: r.valorAberto })),
          recebidoVencido: [
            { nome: "Recebido", valor: carteiraRecebida },
            { nome: "Vencido", valor: carteiraVencida },
          ],
        },
      };
    }),

  salvarPermissao: protectedProcedure
    .input(z.object({
      guidUsuario: z.string().uuid(),
      reportId: reportIdSchema,
      liberado: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.isGerente) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Somente gerente pode alterar permissoes de relatorios.",
        });
      }

      const pool = await getSqlPool();
      await garantirTabelaPermissoes(pool);

      await pool.request()
        .input("guidpermissao", sql.UniqueIdentifier, crypto.randomUUID())
        .input("guidentidade", sql.UniqueIdentifier, ctx.user.guidEntidade)
        .input("guidusuario", sql.UniqueIdentifier, input.guidUsuario)
        .input("codrelatorio", sql.NVarChar(80), input.reportId)
        .input("liberado", sql.Bit, input.liberado ? 1 : 0)
        .query(`
          MERGE KS0002.KS_RELATORIO_PERMISSAO AS destino
          USING (
            SELECT
              @guidentidade AS GUIDENTIDADE,
              @guidusuario AS GUIDUSUARIO,
              @codrelatorio AS CODRELATORIO
          ) AS origem
          ON destino.GUIDENTIDADE = origem.GUIDENTIDADE
            AND destino.GUIDUSUARIO = origem.GUIDUSUARIO
            AND destino.CODRELATORIO = origem.CODRELATORIO
          WHEN MATCHED THEN
            UPDATE SET LIBERADO = @liberado, ULTIMAALTERACAO = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (GUIDPERMISSAO, GUIDENTIDADE, GUIDUSUARIO, CODRELATORIO, LIBERADO)
            VALUES (@guidpermissao, @guidentidade, @guidusuario, @codrelatorio, @liberado);
        `);

      return { success: true };
    }),
});

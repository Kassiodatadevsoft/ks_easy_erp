import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import crypto from "crypto";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

// ─── Plano de Contas Padrão ────────────────────────────────────────────────
const PLANO_CONTAS_PADRAO = [
  // Nível 1 — Grupos principais
  { cod: "1", conta: "ATIVO", desc: "Ativo Total", tipo: "T", nivel: 1, pai: null },
  { cod: "2", conta: "PASSIVO", desc: "Passivo Total", tipo: "T", nivel: 1, pai: null },
  { cod: "3", conta: "PATRIMÔNIO LÍQUIDO", desc: "Patrimônio Líquido", tipo: "T", nivel: 1, pai: null },
  { cod: "4", conta: "RECEITAS", desc: "Receitas", tipo: "R", nivel: 1, pai: null },
  { cod: "5", conta: "DESPESAS", desc: "Despesas", tipo: "D", nivel: 1, pai: null },
  // Nível 2 — Ativo
  { cod: "1.1", conta: "ATIVO CIRCULANTE", desc: "Ativo Circulante", tipo: "T", nivel: 2, pai: "1" },
  { cod: "1.2", conta: "ATIVO NÃO CIRCULANTE", desc: "Ativo Não Circulante", tipo: "T", nivel: 2, pai: "1" },
  // Nível 2 — Passivo
  { cod: "2.1", conta: "PASSIVO CIRCULANTE", desc: "Passivo Circulante", tipo: "T", nivel: 2, pai: "2" },
  { cod: "2.2", conta: "PASSIVO NÃO CIRCULANTE", desc: "Passivo Não Circulante", tipo: "T", nivel: 2, pai: "2" },
  // Nível 2 — PL
  { cod: "3.1", conta: "CAPITAL SOCIAL", desc: "Capital Social", tipo: "T", nivel: 2, pai: "3" },
  { cod: "3.2", conta: "RESERVAS", desc: "Reservas de Lucros", tipo: "T", nivel: 2, pai: "3" },
  { cod: "3.3", conta: "RESULTADO DO EXERCÍCIO", desc: "Resultado do Exercício", tipo: "T", nivel: 2, pai: "3" },
  // Nível 2 — Receitas
  { cod: "4.1", conta: "RECEITA OPERACIONAL", desc: "Receita Operacional Bruta", tipo: "R", nivel: 2, pai: "4" },
  { cod: "4.2", conta: "RECEITA FINANCEIRA", desc: "Receita Financeira", tipo: "R", nivel: 2, pai: "4" },
  { cod: "4.3", conta: "OUTRAS RECEITAS", desc: "Outras Receitas", tipo: "R", nivel: 2, pai: "4" },
  // Nível 2 — Despesas
  { cod: "5.1", conta: "CUSTO DAS MERCADORIAS", desc: "CMV / CPV", tipo: "D", nivel: 2, pai: "5" },
  { cod: "5.2", conta: "DESPESAS OPERACIONAIS", desc: "Despesas Operacionais", tipo: "D", nivel: 2, pai: "5" },
  { cod: "5.3", conta: "DESPESAS FINANCEIRAS", desc: "Despesas Financeiras", tipo: "D", nivel: 2, pai: "5" },
  { cod: "5.4", conta: "DESPESAS TRIBUTÁRIAS", desc: "Impostos e Taxas", tipo: "D", nivel: 2, pai: "5" },
  { cod: "5.5", conta: "DESPESAS COM PESSOAL", desc: "Salários e Encargos", tipo: "D", nivel: 2, pai: "5" },
  // Nível 3 — Ativo Circulante
  { cod: "1.1.1", conta: "CAIXA E EQUIVALENTES", desc: "Caixa, Bancos e Aplicações", tipo: "T", nivel: 3, pai: "1.1" },
  { cod: "1.1.2", conta: "CONTAS A RECEBER", desc: "Clientes e Duplicatas", tipo: "T", nivel: 3, pai: "1.1" },
  { cod: "1.1.3", conta: "ESTOQUES", desc: "Mercadorias e Produtos", tipo: "T", nivel: 3, pai: "1.1" },
  // Nível 3 — Passivo Circulante
  { cod: "2.1.1", conta: "FORNECEDORES", desc: "Contas a Pagar Fornecedores", tipo: "T", nivel: 3, pai: "2.1" },
  { cod: "2.1.2", conta: "OBRIGAÇÕES FISCAIS", desc: "Impostos a Recolher", tipo: "T", nivel: 3, pai: "2.1" },
  { cod: "2.1.3", conta: "OBRIGAÇÕES TRABALHISTAS", desc: "Salários e Encargos a Pagar", tipo: "T", nivel: 3, pai: "2.1" },
  // Nível 3 — Receita Operacional
  { cod: "4.1.1", conta: "VENDA DE MERCADORIAS", desc: "Receita de Venda de Mercadorias", tipo: "R", nivel: 3, pai: "4.1" },
  { cod: "4.1.2", conta: "PRESTAÇÃO DE SERVIÇOS", desc: "Receita de Serviços", tipo: "R", nivel: 3, pai: "4.1" },
  { cod: "4.1.3", conta: "DEVOLUÇÕES E DESCONTOS", desc: "Deduções da Receita Bruta", tipo: "D", nivel: 3, pai: "4.1" },
  // Nível 3 — Despesas Operacionais
  { cod: "5.2.1", conta: "DESPESAS ADMINISTRATIVAS", desc: "Aluguel, Energia, Telefone", tipo: "D", nivel: 3, pai: "5.2" },
  { cod: "5.2.2", conta: "DESPESAS COMERCIAIS", desc: "Marketing e Comissões", tipo: "D", nivel: 3, pai: "5.2" },
  { cod: "5.2.3", conta: "DEPRECIAÇÃO", desc: "Depreciação de Ativos", tipo: "D", nivel: 3, pai: "5.2" },
];

// ─── Centro de Custo Padrão ────────────────────────────────────────────────
const CENTROS_PADRAO = [
  { cod: "ADM", centro: "ADMINISTRATIVO", desc: "Departamento Administrativo", nivel: 1, pai: null, orc: 0 },
  { cod: "COM", centro: "COMERCIAL", desc: "Departamento Comercial e Vendas", nivel: 1, pai: null, orc: 0 },
  { cod: "OPE", centro: "OPERACIONAL", desc: "Operações e Produção", nivel: 1, pai: null, orc: 0 },
  { cod: "FIN", centro: "FINANCEIRO", desc: "Departamento Financeiro", nivel: 1, pai: null, orc: 0 },
  { cod: "TI", centro: "TECNOLOGIA DA INFORMAÇÃO", desc: "TI e Sistemas", nivel: 1, pai: null, orc: 0 },
  { cod: "RH", centro: "RECURSOS HUMANOS", desc: "Gestão de Pessoas", nivel: 1, pai: null, orc: 0 },
  { cod: "ADM.ALU", centro: "ALUGUEL E INFRAESTRUTURA", desc: "Aluguel, Energia, Água", nivel: 2, pai: "ADM", orc: 0 },
  { cod: "ADM.TEL", centro: "TELEFONIA E INTERNET", desc: "Comunicações", nivel: 2, pai: "ADM", orc: 0 },
  { cod: "COM.VEN", centro: "EQUIPE DE VENDAS", desc: "Vendedores e Representantes", nivel: 2, pai: "COM", orc: 0 },
  { cod: "COM.MKT", centro: "MARKETING", desc: "Publicidade e Propaganda", nivel: 2, pai: "COM", orc: 0 },
];

// ─── Natureza de Caixa Padrão ──────────────────────────────────────────────
const NATUREZAS_PADRAO = [
  // Receitas (R)
  { nat: "VENDA À VISTA", desc: "Receita de vendas pagas no ato", tipo: "R" },
  { nat: "VENDA A PRAZO", desc: "Recebimento de vendas parceladas", tipo: "R" },
  { nat: "PRESTAÇÃO DE SERVIÇOS", desc: "Receita de serviços prestados", tipo: "R" },
  { nat: "JUROS RECEBIDOS", desc: "Juros e encargos de mora recebidos", tipo: "R" },
  { nat: "RENDIMENTO FINANCEIRO", desc: "Rendimentos de aplicações", tipo: "R" },
  { nat: "DEVOLUÇÃO DE FORNECEDOR", desc: "Crédito por devolução a fornecedor", tipo: "R" },
  { nat: "OUTRAS RECEITAS", desc: "Receitas diversas não classificadas", tipo: "R" },
  { nat: "ADIANTAMENTO DE CLIENTE", desc: "Entrada antecipada de cliente", tipo: "R" },
  { nat: "RECEBIMENTO DE EMPRÉSTIMO", desc: "Entrada de empréstimo ou financiamento", tipo: "R" },
  { nat: "APORTE DE CAPITAL", desc: "Integralização de capital pelos sócios", tipo: "R" },
  // Despesas (D)
  { nat: "COMPRA DE MERCADORIAS", desc: "Pagamento a fornecedores de mercadorias", tipo: "D" },
  { nat: "SALÁRIOS E PRÓ-LABORE", desc: "Folha de pagamento e retirada dos sócios", tipo: "D" },
  { nat: "ENCARGOS SOCIAIS", desc: "INSS, FGTS e outros encargos", tipo: "D" },
  { nat: "ALUGUEL", desc: "Aluguel de imóvel comercial", tipo: "D" },
  { nat: "ENERGIA ELÉTRICA", desc: "Conta de energia elétrica", tipo: "D" },
  { nat: "TELEFONIA E INTERNET", desc: "Telefone fixo, celular e internet", tipo: "D" },
  { nat: "IMPOSTOS E TAXAS", desc: "DAS, ICMS, ISS, PIS, COFINS", tipo: "D" },
  { nat: "MATERIAL DE ESCRITÓRIO", desc: "Papelaria e materiais de consumo", tipo: "D" },
  { nat: "MANUTENÇÃO E REPAROS", desc: "Consertos de equipamentos e instalações", tipo: "D" },
  { nat: "MARKETING E PUBLICIDADE", desc: "Gastos com divulgação e propaganda", tipo: "D" },
  { nat: "COMBUSTÍVEL E TRANSPORTE", desc: "Fretes, combustível e pedágios", tipo: "D" },
  { nat: "HONORÁRIOS CONTÁBEIS", desc: "Serviços de contabilidade e assessoria", tipo: "D" },
  { nat: "JUROS E TARIFAS BANCÁRIAS", desc: "IOF, tarifas e juros pagos", tipo: "D" },
  { nat: "DEVOLUÇÃO A CLIENTE", desc: "Estorno de venda ou devolução", tipo: "D" },
  { nat: "ADIANTAMENTO A FORNECEDOR", desc: "Pagamento antecipado a fornecedor", tipo: "D" },
  { nat: "OUTRAS DESPESAS", desc: "Despesas diversas não classificadas", tipo: "D" },
];

export const seedRouter = router({

  /** Verifica se já existem dados padrão para esta empresa */
  status: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM KS0003.KS00001 WHERE GUIDENTIDADE=@guidentidade) AS qtdPlano,
          (SELECT COUNT(*) FROM KS0003.KS00002 WHERE GUIDENTIDADE=@guidentidade) AS qtdCentro,
          (SELECT COUNT(*) FROM KS0003.KS00003 WHERE GUIDENTIDADE=@guidentidade) AS qtdNatureza
      `);
    const row = r.recordset[0];
    return {
      planoContas: Number(row?.qtdPlano ?? 0),
      centroCusto: Number(row?.qtdCentro ?? 0),
      naturezaCaixa: Number(row?.qtdNatureza ?? 0),
    };
  }),

  /** Popula Plano de Contas padrão */
  popularPlanoContas: publicProcedure.mutation(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    // Mapa cod → guid para resolver referências de pai
    const guidMap = new Map<string, string>();

    for (const item of PLANO_CONTAS_PADRAO) {
      const guid = crypto.randomUUID();
      guidMap.set(item.cod, guid);
      const guidPai = item.pai ? (guidMap.get(item.pai) ?? null) : null;
      const mascara = item.cod; // Usa o código como máscara

      await pool.request()
        .input("guid",         sql.UniqueIdentifier, guid)
        .input("codconta",     sql.NVarChar(20),     item.cod)
        .input("conta",        sql.NVarChar(100),    item.conta)
        .input("descricao",    sql.NVarChar(200),    item.desc)
        .input("tipo",         sql.Char(1),          item.tipo)
        .input("nivel",        sql.TinyInt,          item.nivel)
        .input("codcontapai",  sql.NVarChar(20),     item.pai ?? null)
        .input("guidcontapai", sql.UniqueIdentifier, guidPai)
        .input("mascara",      sql.NVarChar(30),     mascara)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM KS0003.KS00001 WHERE CODCONTA=@codconta AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00001
            (GUIDCONTA,CODCONTA,CONTA,DESCRICAO,TIPO,NIVEL,CODCONTAPAI,GUIDCONTAPAI,MASCARA,SITUACAO,GUIDENTIDADE)
          VALUES
            (@guid,@codconta,@conta,@descricao,@tipo,@nivel,@codcontapai,@guidcontapai,@mascara,'A',@guidentidade)
        `);
    }
    return { success: true, inseridos: PLANO_CONTAS_PADRAO.length };
  }),

  /** Popula Centro de Custo padrão */
  popularCentroCusto: publicProcedure.mutation(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    const guidMap = new Map<string, string>();

    for (const item of CENTROS_PADRAO) {
      const guid = crypto.randomUUID();
      guidMap.set(item.cod, guid);
      const guidPai = item.pai ? (guidMap.get(item.pai) ?? null) : null;

      await pool.request()
        .input("guid",         sql.UniqueIdentifier, guid)
        .input("codcentro",    sql.NVarChar(20),     item.cod)
        .input("centro",       sql.NVarChar(100),    item.centro)
        .input("descricao",    sql.NVarChar(200),    item.desc)
        .input("nivel",        sql.TinyInt,          item.nivel)
        .input("guidcentropai",sql.UniqueIdentifier, guidPai)
        .input("orcamento",    sql.Decimal(15,2),    item.orc)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM KS0003.KS00002 WHERE CODCENTRO=@codcentro AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00002
            (GUIDCENTRO,CODCENTRO,CENTRO,DESCRICAO,NIVEL,GUIDCENTROPAI,ORCAMENTO,SITUACAO,GUIDENTIDADE)
          VALUES
            (@guid,@codcentro,@centro,@descricao,@nivel,@guidcentropai,@orcamento,'A',@guidentidade)
        `);
    }
    return { success: true, inseridos: CENTROS_PADRAO.length };
  }),

  /** Popula Natureza de Caixa padrão */
  popularNaturezaCaixa: publicProcedure.mutation(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    for (const item of NATUREZAS_PADRAO) {
      const guid = crypto.randomUUID();
      await pool.request()
        .input("guid",         sql.UniqueIdentifier, guid)
        .input("natureza",     sql.NVarChar(100),    item.nat)
        .input("descricao",    sql.NVarChar(200),    item.desc)
        .input("tipo",         sql.Char(1),          item.tipo)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM KS0003.KS00003 WHERE NATUREZA=@natureza AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00003
            (GUIDNATUREZA,NATUREZA,DESCRICAO,TIPO,SITUACAO,GUIDENTIDADE)
          VALUES
            (@guid,@natureza,@descricao,@tipo,'A',@guidentidade)
        `);
    }
    return { success: true, inseridos: NATUREZAS_PADRAO.length };
  }),

  /** Popula tudo de uma vez */
  popularTudo: publicProcedure.mutation(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();

    // Plano de Contas
    const guidMap = new Map<string, string>();
    for (const item of PLANO_CONTAS_PADRAO) {
      const guid = crypto.randomUUID();
      guidMap.set(item.cod, guid);
      const guidPai = item.pai ? (guidMap.get(item.pai) ?? null) : null;
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guid)
        .input("codconta", sql.NVarChar(20), item.cod)
        .input("conta", sql.NVarChar(100), item.conta)
        .input("descricao", sql.NVarChar(200), item.desc)
        .input("tipo", sql.Char(1), item.tipo)
        .input("nivel", sql.TinyInt, item.nivel)
        .input("codcontapai", sql.NVarChar(20), item.pai ?? null)
        .input("guidcontapai", sql.UniqueIdentifier, guidPai)
        .input("mascara", sql.NVarChar(30), item.cod)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`IF NOT EXISTS (SELECT 1 FROM KS0003.KS00001 WHERE CODCONTA=@codconta AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00001 (GUIDCONTA,CODCONTA,CONTA,DESCRICAO,TIPO,NIVEL,CODCONTAPAI,GUIDCONTAPAI,MASCARA,SITUACAO,GUIDENTIDADE)
          VALUES (@guid,@codconta,@conta,@descricao,@tipo,@nivel,@codcontapai,@guidcontapai,@mascara,'A',@guidentidade)`);
    }

    // Centro de Custo
    const guidMapCC = new Map<string, string>();
    for (const item of CENTROS_PADRAO) {
      const guid = crypto.randomUUID();
      guidMapCC.set(item.cod, guid);
      const guidPai = item.pai ? (guidMapCC.get(item.pai) ?? null) : null;
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guid)
        .input("codcentro", sql.NVarChar(20), item.cod)
        .input("centro", sql.NVarChar(100), item.centro)
        .input("descricao", sql.NVarChar(200), item.desc)
        .input("nivel", sql.TinyInt, item.nivel)
        .input("guidcentropai", sql.UniqueIdentifier, guidPai)
        .input("orcamento", sql.Decimal(15,2), item.orc)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`IF NOT EXISTS (SELECT 1 FROM KS0003.KS00002 WHERE CODCENTRO=@codcentro AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00002 (GUIDCENTRO,CODCENTRO,CENTRO,DESCRICAO,NIVEL,GUIDCENTROPAI,ORCAMENTO,SITUACAO,GUIDENTIDADE)
          VALUES (@guid,@codcentro,@centro,@descricao,@nivel,@guidcentropai,@orcamento,'A',@guidentidade)`);
    }

    // Natureza de Caixa
    for (const item of NATUREZAS_PADRAO) {
      const guid = crypto.randomUUID();
      await pool.request()
        .input("guid", sql.UniqueIdentifier, guid)
        .input("natureza", sql.NVarChar(100), item.nat)
        .input("descricao", sql.NVarChar(200), item.desc)
        .input("tipo", sql.Char(1), item.tipo)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`IF NOT EXISTS (SELECT 1 FROM KS0003.KS00003 WHERE NATUREZA=@natureza AND GUIDENTIDADE=@guidentidade)
          INSERT INTO KS0003.KS00003 (GUIDNATUREZA,NATUREZA,DESCRICAO,TIPO,SITUACAO,GUIDENTIDADE)
          VALUES (@guid,@natureza,@descricao,@tipo,'A',@guidentidade)`);
    }

    return {
      success: true,
      planoContas: PLANO_CONTAS_PADRAO.length,
      centroCusto: CENTROS_PADRAO.length,
      naturezaCaixa: NATUREZAS_PADRAO.length,
    };
  }),
});

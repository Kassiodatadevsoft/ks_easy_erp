import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "../routers/ksAuthRouter";
import { ensureVendasTables } from "../routers/vendasOperacaoRouter";
import { garantirTabelasConciliacaoFinanceira } from "../routers/conciliacaoFinanceiraRouter";

const CONTA_PAGA_MSG = "Não é possível cancelar esta venda porque existe conta a receber já baixada/paga.";
const COMISSAO_PAGA_MSG = "Não é possível cancelar esta venda porque existe comissão já paga.";

type CancelamentoSchema = {
  contasReceberStatus: boolean;
  contasReceberMotivo: boolean;
  contasReceberUltimaAlteracao: boolean;
  caixaStatus: boolean;
  caixaMotivo: boolean;
  caixaOrigem: boolean;
  comissoesStatus: boolean;
  comissoesUltimaAlteracao: boolean;
};

async function getSession(req: Request) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) {
    const error = new Error("Sessão inválida. Faça login novamente.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return session;
}

function sendError(res: Response, error: unknown) {
  const status = (error as Error & { status?: number })?.status ?? 400;
  const message = error instanceof Error ? error.message : "Não foi possível processar a solicitação.";
  res.status(status).json({ success: false, sucesso: false, message, mensagem: message });
}

function textParam(req: Request, key: string) {
  const value = req.query[key];
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function bindOptionalLike(request: sql.Request, name: string, value: string) {
  if (value) request.input(name, sql.NVarChar(160), `%${value}%`);
}

function bindOptionalGuid(request: sql.Request, name: string, value: string) {
  if (value && value !== "todos") request.input(name, sql.UniqueIdentifier, value);
}

function limitarTexto(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

async function garantirSuporteCancelamento(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  await garantirTabelasConciliacaoFinanceira(pool);
  await pool.request().query(`
    IF OBJECT_ID('KS0003.KS00010', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0003.KS00010','STATUS') IS NULL ALTER TABLE KS0003.KS00010 ADD STATUS nvarchar(20) NULL;
      IF COL_LENGTH('KS0003.KS00010','MOTIVOCANCELAMENTO') IS NULL ALTER TABLE KS0003.KS00010 ADD MOTIVOCANCELAMENTO nvarchar(500) NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','ORIGEM') IS NULL ALTER TABLE KS0003.KS00010 ADD ORIGEM nvarchar(30) NULL;
    END;

    IF OBJECT_ID('KS0003.KS00005', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0003.KS00005','STATUS') IS NULL ALTER TABLE KS0003.KS00005 ADD STATUS nvarchar(20) NULL;
      IF COL_LENGTH('KS0003.KS00005','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00005 ADD GUIDVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00005','GUIDORIGEM') IS NULL ALTER TABLE KS0003.KS00005 ADD GUIDORIGEM uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00005','MOTIVOCANCELAMENTO') IS NULL ALTER TABLE KS0003.KS00005 ADD MOTIVOCANCELAMENTO nvarchar(500) NULL;
    END;

    IF OBJECT_ID('KS0005.KS00001', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS00001','STATUS') IS NULL ALTER TABLE KS0005.KS00001 ADD STATUS nvarchar(20) NULL CONSTRAINT DF_KS0005_KS00001_STATUS_CANCELAMENTO DEFAULT 'ABERTO';
      IF COL_LENGTH('KS0005.KS00001','ULTIMAALTERACAO') IS NULL ALTER TABLE KS0005.KS00001 ADD ULTIMAALTERACAO datetime NULL;
    END;
  `);
}

async function carregarSchemaCancelamento(pool: Awaited<ReturnType<typeof getSqlPool>>): Promise<CancelamentoSchema> {
  const result = await pool.request().query(`
    SELECT
      CASE WHEN COL_LENGTH('KS0003.KS00005','STATUS') IS NULL THEN 0 ELSE 1 END AS contasReceberStatus,
      CASE WHEN COL_LENGTH('KS0003.KS00005','MOTIVOCANCELAMENTO') IS NULL THEN 0 ELSE 1 END AS contasReceberMotivo,
      CASE WHEN COL_LENGTH('KS0003.KS00005','ULTIMAALTERACAO') IS NULL THEN 0 ELSE 1 END AS contasReceberUltimaAlteracao,
      CASE WHEN COL_LENGTH('KS0003.KS00010','STATUS') IS NULL THEN 0 ELSE 1 END AS caixaStatus,
      CASE WHEN COL_LENGTH('KS0003.KS00010','MOTIVOCANCELAMENTO') IS NULL THEN 0 ELSE 1 END AS caixaMotivo,
      CASE WHEN COL_LENGTH('KS0003.KS00010','ORIGEM') IS NULL THEN 0 ELSE 1 END AS caixaOrigem,
      CASE WHEN COL_LENGTH('KS0005.KS00001','STATUS') IS NULL THEN 0 ELSE 1 END AS comissoesStatus,
      CASE WHEN COL_LENGTH('KS0005.KS00001','ULTIMAALTERACAO') IS NULL THEN 0 ELSE 1 END AS comissoesUltimaAlteracao
  `);
  const row = result.recordset[0] ?? {};
  return {
    contasReceberStatus: Boolean(row.contasReceberStatus),
    contasReceberMotivo: Boolean(row.contasReceberMotivo),
    contasReceberUltimaAlteracao: Boolean(row.contasReceberUltimaAlteracao),
    caixaStatus: Boolean(row.caixaStatus),
    caixaMotivo: Boolean(row.caixaMotivo),
    caixaOrigem: Boolean(row.caixaOrigem),
    comissoesStatus: Boolean(row.comissoesStatus),
    comissoesUltimaAlteracao: Boolean(row.comissoesUltimaAlteracao),
  };
}

async function auditarCancelamento(request: () => sql.Request, params: {
  guidEntidade: string;
  codFilial?: number | null;
  guidUsuario?: string | null;
  acao: string;
  tabela: string;
  guidRegistro?: string | null;
  anterior?: unknown;
  novo?: unknown;
  observacao?: string | null;
  identificacao: string;
}) {
  await request()
    .input("guid", sql.UniqueIdentifier, crypto.randomUUID())
    .input("guidentidade", sql.UniqueIdentifier, params.guidEntidade)
    .input("codfilial", sql.Int, params.codFilial ?? null)
    .input("guidusuario", sql.UniqueIdentifier, params.guidUsuario ?? null)
    .input("origem", sql.NVarChar(60), "VENDAS_GERENCIAL")
    .input("acao", sql.NVarChar(80), limitarTexto(params.acao, 80))
    .input("tabela", sql.NVarChar(80), limitarTexto(params.tabela, 80))
    .input("guidregistro", sql.UniqueIdentifier, params.guidRegistro ?? null)
    .input("anterior", sql.NVarChar(sql.MAX), params.anterior ? JSON.stringify(params.anterior) : null)
    .input("novo", sql.NVarChar(sql.MAX), params.novo ? JSON.stringify(params.novo) : null)
    .input("observacao", sql.NVarChar(500), params.observacao ? limitarTexto(params.observacao, 500) : null)
    .input("identificacao", sql.NVarChar(120), limitarTexto(params.identificacao, 120))
    .query(`
      INSERT INTO KS0003.KS00022
        (GUIDAUDITORIA,GUIDENTIDADE,CODFILIAL,GUIDUSUARIO,ORIGEM,ACAO,TABELAAFETADA,GUIDREGISTRO,VALORANTERIOR,VALORNOVO,OBSERVACAO,IDENTIFICACAO)
      VALUES
        (@guid,@guidentidade,@codfilial,@guidusuario,@origem,@acao,@tabela,@guidregistro,@anterior,@novo,@observacao,@identificacao)
    `);
}

async function carregarDetalhe(guidVenda: string, guidEntidade: string) {
  await ensureVendasTables();
  const pool = await getSqlPool();
  await garantirSuporteCancelamento(pool);
  const schema = await carregarSchemaCancelamento(pool);

  const vendaResult = await pool.request()
    .input("guidvenda", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT TOP 1
        CAST(v.GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
        CAST(v.GUIDENTIDADE AS NVARCHAR(36)) AS guidEntidade,
        ISNULL(v.NUMEROVENDA, v.CODPREVENDA) AS numeroVenda,
        v.DATAVENDA AS dataVenda,
        ISNULL(cli.NOME, CASE WHEN ISNULL(v.CLIENTEPADRAO,0)=1 THEN 'Cliente padrão' ELSE 'Consumidor' END) AS cliente,
        ISNULL(ven.NOME, 'Sem vendedor') AS vendedor,
        CONCAT('Caixa ', ISNULL(v.NUMEROCAIXA, v.CODCAIXA)) AS caixa,
        CAST(ISNULL(v.TOTALPRODUTOS, v.VALORPRODUTOS) AS DECIMAL(18,2)) AS valorBruto,
        CAST(ISNULL(v.DESCONTOVALOR, v.DESCONTO) AS DECIMAL(18,2)) AS desconto,
        CAST(ISNULL(v.TOTALVENDA, v.VALORFINAL) AS DECIMAL(18,2)) AS valorTotal,
        ISNULL(v.SITUACAO, 'F') AS situacao,
        v.OBSERVACAO AS observacao,
        v.MOTIVOCANCELAMENTO AS justificativaCancelamento
      FROM KS0005.KS00016 v
      LEFT JOIN KS0002.KS00001 cli ON cli.GUIDPESSOA=v.GUIDCLIENTE AND cli.GUIDENTIDADE=v.GUIDENTIDADE
      LEFT JOIN KS0002.KS00001 ven ON ven.GUIDPESSOA=v.GUIDVENDEDOR AND ven.GUIDENTIDADE=v.GUIDENTIDADE
      WHERE v.GUIDVENDA=@guidvenda AND v.GUIDENTIDADE=@guidentidade
    `);

  const venda = vendaResult.recordset[0];
  if (!venda) {
    const error = new Error("Venda não encontrada para a empresa logada.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const itens = await pool.request()
    .input("guidvenda", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT
        i.ITEM AS item,
        ISNULL(p.PRODUTO, CONCAT('Produto ', ISNULL(i.CODPRODUTO, i.ITEM))) AS produto,
        CAST(ISNULL(i.QUANTIDADE,0) AS DECIMAL(18,4)) AS quantidade,
        CAST(ISNULL(i.PRECOFINAL, i.PRECOVENDA) AS DECIMAL(18,2)) AS valorUnitario,
        CAST(ISNULL(i.DESCONTOVALOR,0) AS DECIMAL(18,2)) AS desconto,
        CAST(ISNULL(i.TOTALITEM, i.VALORTOTAL) AS DECIMAL(18,2)) AS valorTotal,
        ISNULL(ven.NOME, 'Sem vendedor') AS vendedor,
        CAST(ISNULL(i.COMISSAO,0) AS DECIMAL(18,2)) AS comissao,
        i.OBSERVACAO AS imei,
        i.DESCRICAOTAMANHO AS tamanho,
        COALESCE(i.DESCRICAOFAIXAPRECO, i.FAIXAPRECOAPLICADA) AS faixaPreco,
        i.FAIXAPRECOAPLICADA AS observacao
      FROM KS0005.KS00017 i
      LEFT JOIN KS0000.KS00009 p ON p.GUIDPRODUTO=i.GUIDPRODUTO AND p.GUIDENTIDADE=i.GUIDENTIDADE
      LEFT JOIN KS0002.KS00001 ven ON ven.GUIDPESSOA=i.GUIDVENDEDOR AND ven.GUIDENTIDADE=i.GUIDENTIDADE
      WHERE i.GUIDVENDA=@guidvenda AND i.GUIDENTIDADE=@guidentidade
      ORDER BY i.ITEM
    `);

  const pagamentos = await pool.request()
    .input("guidvenda", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT
        ISNULL(fp.PAGAMENTO, p.DESCRICAOFORMAPAGAMENTO) AS formaPagamento,
        CAST(ISNULL(p.VALORPAGO,0) - ISNULL(p.TROCO,0) AS DECIMAL(18,2)) AS valor,
        ISNULL(p.PARCELAS,1) AS parcelas,
        ISNULL(cb.CONTA, '') AS contaFinanceira,
        'REGISTRADO' AS situacaoFinanceiro
      FROM KS0005.KS00018 p
      LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=p.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE=p.GUIDENTIDADE
      LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA=fp.GUIDCONTABANCARIA AND cb.GUIDENTIDADE=fp.GUIDENTIDADE
      LEFT JOIN KS0003.KS00005 cr ON (cr.GUIDVENDA=p.GUIDVENDA OR cr.GUIDORIGEM=p.GUIDVENDA) AND cr.GUIDENTIDADE=p.GUIDENTIDADE
      LEFT JOIN KS0003.KS00010 lc ON lc.GUIDVENDA=p.GUIDVENDA AND lc.GUIDFORMAPAGAMENTO=p.GUIDFORMAPAGAMENTO AND lc.GUIDENTIDADE=p.GUIDENTIDADE
      WHERE p.GUIDVENDA=@guidvenda AND p.GUIDENTIDADE=@guidentidade
      ORDER BY p.DATAHORA
    `);

  const financeiro = await pool.request()
    .input("guidvenda", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT
        CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS guidLancamento,
        DESCRICAO AS descricao,
        CAST(ISNULL(VALOR,0) AS DECIMAL(18,2)) AS valor,
        CAST(ISNULL(VALORRECEBIDO,0) AS DECIMAL(18,2)) AS valorRecebido,
        'ABERTO' AS situacao,
        DTVENCIMENTO AS vencimento
      FROM KS0003.KS00005
      WHERE GUIDENTIDADE=@guidentidade AND (GUIDVENDA=@guidvenda OR GUIDORIGEM=@guidvenda)
      ORDER BY DTVENCIMENTO
    `);

  const comissoes = await pool.request()
    .input("guidvendaTexto", sql.NVarChar(80), `%GUIDVENDA: ${guidVenda}%`)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT
        CAST(m.GUIDMOVIMENTO AS NVARCHAR(36)) AS guidMovimento,
        ISNULL(f.NOME, '') AS vendedor,
        m.DESCRICAO AS descricao,
        CAST(ISNULL(m.VALOR,0) AS DECIMAL(18,2)) AS valor,
        'ABERTO' AS situacao
      FROM KS0005.KS00001 m
      LEFT JOIN KS0002.KS00001 f ON f.GUIDPESSOA=m.GUIDFUNCIONARIO AND f.GUIDENTIDADE=m.GUIDENTIDADE
      WHERE m.GUIDENTIDADE=@guidentidade AND m.TIPO='COMISSAO' AND ISNULL(m.OBSERVACAO,'') LIKE @guidvendaTexto
      ORDER BY m.DATAMOVIMENTO
    `);

  const identificacao = venda.numeroVenda ? `VENDA ${venda.numeroVenda}` : guidVenda;
  const historico = await pool.request()
    .input("guidvenda", sql.UniqueIdentifier, guidVenda)
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .input("identificacao", sql.NVarChar(120), identificacao)
    .input("guidvendaTexto", sql.NVarChar(80), `%${guidVenda}%`)
    .query(`
      SELECT TOP 100
        CAST(a.GUIDAUDITORIA AS NVARCHAR(36)) AS guidAuditoria,
        a.DATAHORA AS dataHora,
        a.ACAO AS acao,
        a.TABELAAFETADA AS tabela,
        CAST(a.GUIDREGISTRO AS NVARCHAR(36)) AS guidRegistro,
        a.OBSERVACAO AS observacao,
        a.IDENTIFICACAO AS identificacao,
        u.NOME AS usuarioNome,
        u.USUARIO AS usuario
      FROM KS0003.KS00022 a
      LEFT JOIN KS0002.KS00001 u ON u.GUIDPESSOA=a.GUIDUSUARIO AND u.GUIDENTIDADE=a.GUIDENTIDADE
      WHERE a.GUIDENTIDADE=@guidentidade
        AND a.ORIGEM='VENDAS_GERENCIAL'
        AND (
          a.GUIDREGISTRO=@guidvenda
          OR a.IDENTIFICACAO=@identificacao
          OR a.VALORANTERIOR LIKE @guidvendaTexto
          OR a.VALORNOVO LIKE @guidvendaTexto
        )
      ORDER BY a.DATAHORA DESC
    `);

  return {
    venda,
    itens: itens.recordset,
    pagamentos: pagamentos.recordset,
    financeiro: financeiro.recordset,
    comissoes: comissoes.recordset,
    historico: historico.recordset,
  };
}

export function registerVendasGerencialApiRoutes(app: Express) {
  app.get("/api/vendas-gerencial", async (req, res) => {
    try {
      const session = await getSession(req);
      await ensureVendasTables();
      const pool = await getSqlPool();
      await garantirSuporteCancelamento(pool);
      const request = pool.request().input("guidentidade", sql.UniqueIdentifier, session.guidEntidade);
      const where = ["v.GUIDENTIDADE=@guidentidade"];

      const dataInicial = textParam(req, "dataInicial");
      const dataFinal = textParam(req, "dataFinal");
      const guidCliente = textParam(req, "guidCliente");
      const guidVendedor = textParam(req, "guidVendedor");
      const guidFormaPagamento = textParam(req, "guidFormaPagamento");
      const cliente = textParam(req, "cliente");
      const vendedor = textParam(req, "vendedor");
      const caixa = textParam(req, "caixa");
      const formaPagamento = textParam(req, "formaPagamento");
      const numeroVenda = textParam(req, "numeroVenda");
      const situacao = textParam(req, "situacao");

      if (dataInicial) { where.push("CONVERT(date, v.DATAVENDA) >= CONVERT(date, @dataInicial)"); request.input("dataInicial", sql.NVarChar(10), dataInicial); }
      if (dataFinal) { where.push("CONVERT(date, v.DATAVENDA) <= CONVERT(date, @dataFinal)"); request.input("dataFinal", sql.NVarChar(10), dataFinal); }
      if (guidCliente && guidCliente !== "todos") { where.push("v.GUIDCLIENTE=@guidCliente"); bindOptionalGuid(request, "guidCliente", guidCliente); }
      if (guidVendedor && guidVendedor !== "todos") { where.push("v.GUIDVENDEDOR=@guidVendedor"); bindOptionalGuid(request, "guidVendedor", guidVendedor); }
      if (guidFormaPagamento && guidFormaPagamento !== "todos") {
        where.push("EXISTS (SELECT 1 FROM KS0005.KS00018 p WHERE p.GUIDVENDA=v.GUIDVENDA AND p.GUIDENTIDADE=v.GUIDENTIDADE AND p.GUIDFORMAPAGAMENTO=@guidFormaPagamento)");
        bindOptionalGuid(request, "guidFormaPagamento", guidFormaPagamento);
      }
      if (cliente) { where.push("ISNULL(cli.NOME,'Cliente padrão') LIKE @cliente"); bindOptionalLike(request, "cliente", cliente); }
      if (vendedor) { where.push("ISNULL(ven.NOME,'') LIKE @vendedor"); bindOptionalLike(request, "vendedor", vendedor); }
      if (caixa) { where.push("CONCAT('Caixa ', ISNULL(v.NUMEROCAIXA, v.CODCAIXA)) LIKE @caixa"); bindOptionalLike(request, "caixa", caixa); }
      if (formaPagamento) {
        where.push("EXISTS (SELECT 1 FROM KS0005.KS00018 p LEFT JOIN KS0003.KS00006 fp ON fp.GUIDPAGAMENTO=p.GUIDFORMAPAGAMENTO AND fp.GUIDENTIDADE=p.GUIDENTIDADE WHERE p.GUIDVENDA=v.GUIDVENDA AND p.GUIDENTIDADE=v.GUIDENTIDADE AND ISNULL(fp.PAGAMENTO,p.DESCRICAOFORMAPAGAMENTO) LIKE @formaPagamento)");
        bindOptionalLike(request, "formaPagamento", formaPagamento);
      }
      if (numeroVenda) { where.push("CAST(ISNULL(v.NUMEROVENDA, v.CODPREVENDA) AS NVARCHAR(30)) LIKE @numeroVenda"); bindOptionalLike(request, "numeroVenda", numeroVenda); }
      if (situacao && situacao !== "TODAS") {
        where.push("ISNULL(v.SITUACAO,'F')=@situacao");
        request.input("situacao", sql.NVarChar(30), situacao);
      } else {
        where.push("ISNULL(v.SITUACAO,'F') IN ('F','FINALIZADA','FINALIZADO')");
      }

      const result = await request.query(`
        SELECT TOP 300
          CAST(v.GUIDVENDA AS NVARCHAR(36)) AS guidVenda,
          v.DATAVENDA AS dataVenda,
          ISNULL(v.NUMEROVENDA, v.CODPREVENDA) AS numeroVenda,
          ISNULL(cli.NOME, CASE WHEN ISNULL(v.CLIENTEPADRAO,0)=1 THEN 'Cliente padrão' ELSE 'Consumidor' END) AS cliente,
          ISNULL(ven.NOME, 'Sem vendedor') AS vendedor,
          CONCAT('Caixa ', ISNULL(v.NUMEROCAIXA, v.CODCAIXA)) AS caixa,
          CAST(ISNULL(v.TOTALPRODUTOS, v.VALORPRODUTOS) AS DECIMAL(18,2)) AS valorBruto,
          CAST(ISNULL(v.DESCONTOVALOR, v.DESCONTO) AS DECIMAL(18,2)) AS desconto,
          CAST(ISNULL(v.TOTALVENDA, v.VALORFINAL) AS DECIMAL(18,2)) AS valorTotal,
          ISNULL(v.SITUACAO, 'F') AS situacao
        FROM KS0005.KS00016 v
        LEFT JOIN KS0002.KS00001 cli ON cli.GUIDPESSOA=v.GUIDCLIENTE AND cli.GUIDENTIDADE=v.GUIDENTIDADE
        LEFT JOIN KS0002.KS00001 ven ON ven.GUIDPESSOA=v.GUIDVENDEDOR AND ven.GUIDENTIDADE=v.GUIDENTIDADE
        WHERE ${where.join(" AND ")}
        ORDER BY v.DATAVENDA DESC, ISNULL(v.NUMEROVENDA, v.CODPREVENDA) DESC
      `);

      const total = result.recordset.reduce((sum, row) => sum + Number(row.valorTotal ?? 0), 0);
      res.json({ success: true, dados: result.recordset, resumo: { quantidade: result.recordset.length, total } });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/vendas-gerencial/filtros", async (req, res) => {
    try {
      const session = await getSession(req);
      await ensureVendasTables();
      const pool = await getSqlPool();
      await garantirSuporteCancelamento(pool);

      const clientes = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 300
            CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidCliente,
            NOME AS nome,
            DOCUMENTO AS documento
          FROM KS0002.KS00001
          WHERE GUIDENTIDADE=@guidentidade
            AND ISNULL(CADCLIENTE,0)=1
            AND ISNULL(SITUACAO,'A')='A'
          ORDER BY NOME
        `);

      const vendedores = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 300
            CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidVendedor,
            NOME AS nome,
            USUARIO AS usuario
          FROM KS0002.KS00001
          WHERE GUIDENTIDADE=@guidentidade
            AND ISNULL(CADUSUARIO,0)=1
            AND ISNULL(SITUACAO,'A')='A'
          ORDER BY NOME
        `);

      const formasPagamento = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT TOP 300
            CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidFormaPagamento,
            PAGAMENTO AS descricao
          FROM KS0003.KS00006
          WHERE GUIDENTIDADE=@guidentidade
            AND ISNULL(SITUACAO,'A')='A'
          ORDER BY PAGAMENTO
        `);

      res.json({
        success: true,
        dados: {
          clientes: clientes.recordset,
          vendedores: vendedores.recordset,
          formasPagamento: formasPagamento.recordset,
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/vendas-gerencial/:guidVenda", async (req, res) => {
    try {
      const session = await getSession(req);
      res.json({ success: true, dados: await carregarDetalhe(req.params.guidVenda, session.guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/vendas-gerencial/:guidVenda/impressao-a4", async (req, res) => {
    try {
      const session = await getSession(req);
      res.json({ success: true, modelo: "A4", empresa: session, dados: await carregarDetalhe(req.params.guidVenda, session.guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/vendas-gerencial/:guidVenda/impressao-bobina", async (req, res) => {
    try {
      const session = await getSession(req);
      res.json({ success: true, modelo: "BOBINA", empresa: session, dados: await carregarDetalhe(req.params.guidVenda, session.guidEntidade) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/vendas-gerencial/:guidVenda/cancelar", async (req, res) => {
    const pool = await getSqlPool();
    const tx = new sql.Transaction(pool);
    let txStarted = false;
    try {
      const session = await getSession(req);
      const justificativa = limitarTexto(req.body?.justificativa, 80);
      if (!justificativa) throw new Error("Informe a justificativa do cancelamento.");
      if (req.body?.guidEntidade && String(req.body.guidEntidade).toLowerCase() !== session.guidEntidade.toLowerCase()) {
        const error = new Error("GUIDENTIDADE não confere com a empresa logada.");
        (error as Error & { status?: number }).status = 403;
        throw error;
      }

      await ensureVendasTables();
      await garantirSuporteCancelamento(pool);
      const schema = await carregarSchemaCancelamento(pool);
      await tx.begin();
      txStarted = true;
      const request = () => new sql.Request(tx);
      const guidVenda = req.params.guidVenda;
      const guidUsuario = req.body?.guidUsuario ?? session.guidPessoa;

      const venda = await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 GUIDVENDA, ISNULL(NUMEROVENDA,CODPREVENDA) AS NUMEROVENDA, TOTALVENDA, GUIDCAIXA, SITUACAO FROM KS0005.KS00016 WITH (UPDLOCK, HOLDLOCK) WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade");
      const vendaRow = venda.recordset[0];
      if (!vendaRow) throw new Error("Venda não encontrada para a empresa logada.");
      if (["C", "CANCELADA", "CANCELADO"].includes(String(vendaRow.SITUACAO ?? "").toUpperCase())) {
        throw new Error("Venda já está cancelada.");
      }

      const financeiro = await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS GUIDLANCAMENTO,
            DESCRICAO, NUMERODOC, VALOR, VALORRECEBIDO, 'ABERTO' AS STATUS, DTVENCIMENTO,
            CAST(GUIDVENDA AS NVARCHAR(36)) AS GUIDVENDA
          FROM KS0003.KS00005 WITH (UPDLOCK, HOLDLOCK)
          WHERE GUIDENTIDADE=@guidentidade
            AND (GUIDVENDA=@guidvenda OR GUIDORIGEM=@guidvenda)
        `);
      if (financeiro.recordset.some((row) => String(row.STATUS ?? "").toUpperCase() === "PAGO" || Number(row.VALORRECEBIDO ?? 0) > 0)) {
        throw new Error(CONTA_PAGA_MSG);
      }

      const lancamentosCaixa = await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDLANCAMENTO AS NVARCHAR(36)) AS GUIDLANCAMENTO,
            DTLANCAMENTO, TIPO, VALOR, DESCRICAO, NUMERODOC, OBSERVACAO,
            CAST(GUIDCONTA AS NVARCHAR(36)) AS GUIDCONTA,
            CAST(GUIDNATUREZA AS NVARCHAR(36)) AS GUIDNATUREZA,
            CAST(GUIDCENTRO AS NVARCHAR(36)) AS GUIDCENTRO,
            CAST(GUIDVENDA AS NVARCHAR(36)) AS GUIDVENDA,
            CAST(GUIDCAIXA AS NVARCHAR(36)) AS GUIDCAIXA,
            CAST(GUIDFORMAPAGAMENTO AS NVARCHAR(36)) AS GUIDFORMAPAGAMENTO,
            'ABERTO' AS STATUS
          FROM KS0003.KS00010 WITH (UPDLOCK, HOLDLOCK)
          WHERE GUIDENTIDADE=@guidentidade
            AND GUIDVENDA=@guidvenda
        `);

      const comissoes = await request()
        .input("guidvendaTexto", sql.NVarChar(80), `%GUIDVENDA: ${guidVenda}%`)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT CAST(GUIDMOVIMENTO AS NVARCHAR(36)) AS GUIDMOVIMENTO, DESCRICAO, VALOR, 'ABERTO' AS STATUS, OBSERVACAO FROM KS0005.KS00001 WITH (UPDLOCK, HOLDLOCK) WHERE GUIDENTIDADE=@guidentidade AND TIPO='COMISSAO' AND ISNULL(OBSERVACAO,'') LIKE @guidvendaTexto");
      if (comissoes.recordset.some((row) => ["PAGO", "FECHADO"].includes(String(row.STATUS ?? "ABERTO").toUpperCase()))) {
        throw new Error(COMISSAO_PAGA_MSG);
      }

      const identificacao = `VENDA ${vendaRow.NUMEROVENDA ?? guidVenda}`;
      const contasReceberSet = [
        schema.contasReceberMotivo ? "MOTIVOCANCELAMENTO=LEFT(@justificativa, 80)" : null,
        schema.contasReceberUltimaAlteracao ? "ULTIMAALTERACAO=GETDATE()" : null,
      ].filter(Boolean).join(", ") || "GUIDLANCAMENTO=GUIDLANCAMENTO";
      const lancamentosCaixaSet = [
        schema.caixaMotivo ? "MOTIVOCANCELAMENTO=LEFT(@justificativa, 80)" : null,
        schema.caixaOrigem ? "ORIGEM=ISNULL(ORIGEM,'VENDA')" : null,
        "OBSERVACAO=LEFT(CONCAT(ISNULL(CONVERT(nvarchar(max), OBSERVACAO),''), ' | CANC.VENDA: ', @justificativa), 120)",
      ].filter(Boolean).join(", ");
      const comissoesSet = [
        "OBSERVACAO=LEFT(CONCAT(ISNULL(CONVERT(nvarchar(max), OBSERVACAO),''), ' | CANC.: ', @justificativa), 120)",
        schema.comissoesUltimaAlteracao ? "ULTIMAALTERACAO=GETDATE()" : null,
      ].filter(Boolean).join(", ");

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("justificativa", sql.NVarChar(500), justificativa)
        .input("guidusuario", sql.UniqueIdentifier, guidUsuario)
        .query(`
          UPDATE KS0005.KS00016
          SET SITUACAO='C',
              STATUSNFE=CASE WHEN ISNULL(STATUSNFE,'')='' THEN STATUSNFE ELSE 'C' END,
              MOTIVOCANCELAMENTO=LEFT(@justificativa, 80),
              OBSERVACAO=LEFT(CONCAT(ISNULL(CONVERT(nvarchar(max), OBSERVACAO),''), ' | CANC. ', CONVERT(varchar(10), GETDATE(), 120), ': ', @justificativa), 120),
              ULTIMAALTERACAO=GETDATE(),
              SINCRONIZADO=0
          WHERE GUIDVENDA=@guidvenda AND GUIDENTIDADE=@guidentidade
        `);
      await auditarCancelamento(request, {
        guidEntidade: session.guidEntidade,
        codFilial: session.codFilial,
        guidUsuario,
        acao: "CANCELAR_VENDA",
        tabela: "KS0005.KS00016",
        guidRegistro: guidVenda,
        anterior: vendaRow,
        novo: { situacao: "C", justificativa, guidVenda },
        observacao: justificativa,
        identificacao,
      });

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("justificativa", sql.NVarChar(500), justificativa)
        .query(`UPDATE KS0003.KS00005 SET ${contasReceberSet} WHERE GUIDENTIDADE=@guidentidade AND (GUIDVENDA=@guidvenda OR GUIDORIGEM=@guidvenda)`);
      for (const row of financeiro.recordset) {
        await auditarCancelamento(request, {
          guidEntidade: session.guidEntidade,
          codFilial: session.codFilial,
          guidUsuario,
          acao: "CANCELAR_CONTA_RECEBER",
          tabela: "KS0003.KS00005",
          guidRegistro: row.GUIDLANCAMENTO,
          anterior: row,
          novo: { status: "CANCELADO", justificativa, guidVenda },
          observacao: justificativa,
          identificacao,
        });
      }

      for (const row of lancamentosCaixa.recordset) {
        if (row.GUIDCONTA) {
          const delta = String(row.TIPO).toUpperCase() === "E" ? -Number(row.VALOR ?? 0) : Number(row.VALOR ?? 0);
          await request()
            .input("delta", sql.Decimal(15, 2), delta)
            .input("guidconta", sql.UniqueIdentifier, row.GUIDCONTA)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .query("UPDATE KS0003.KS00008 SET SALDOATUAL=ISNULL(SALDOATUAL,0)+@delta, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
        }
      }

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("justificativa", sql.NVarChar(500), justificativa)
        .query(`
          UPDATE KS0003.KS00010
          SET ${lancamentosCaixaSet}
          WHERE GUIDENTIDADE=@guidentidade
            AND GUIDVENDA=@guidvenda
        `);
      for (const row of lancamentosCaixa.recordset) {
        await auditarCancelamento(request, {
          guidEntidade: session.guidEntidade,
          codFilial: session.codFilial,
          guidUsuario,
          acao: "CANCELAR_LANCAMENTO_CAIXA",
          tabela: "KS0003.KS00010",
          guidRegistro: row.GUIDLANCAMENTO,
          anterior: row,
          novo: { status: "CANCELADO", saldoEstornado: true, justificativa, guidVenda },
          observacao: justificativa,
          identificacao,
        });
      }

      await request()
        .input("guidvendaTexto", sql.NVarChar(80), `%GUIDVENDA: ${guidVenda}%`)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("justificativa", sql.NVarChar(500), justificativa)
        .query(`UPDATE KS0005.KS00001 SET ${comissoesSet} WHERE GUIDENTIDADE=@guidentidade AND TIPO='COMISSAO' AND ISNULL(OBSERVACAO,'') LIKE @guidvendaTexto`);
      for (const row of comissoes.recordset) {
        await auditarCancelamento(request, {
          guidEntidade: session.guidEntidade,
          codFilial: session.codFilial,
          guidUsuario,
          acao: "CANCELAR_COMISSAO",
          tabela: "KS0005.KS00001",
          guidRegistro: row.GUIDMOVIMENTO,
          anterior: row,
          novo: { status: "CANCELADO", justificativa, guidVenda },
          observacao: justificativa,
          identificacao,
        });
      }

      await request()
        .input("guidvenda", sql.UniqueIdentifier, guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("justificativa", sql.NVarChar(100), limitarTexto(`Canc. venda ${vendaRow.NUMEROVENDA}: ${justificativa}`, 100))
        .query("UPDATE KS0005.KS_CAIXA_MOVIMENTO_ITEM SET TIPO='CANCELADA', HISTORICO=LEFT(@justificativa, 100), SINCRONIZADO=0 WHERE GUIDENTIDADE=@guidentidade AND GUIDVENDA=@guidvenda");

      await request()
        .input("totalvendas", sql.Decimal(18, 4), Number(vendaRow.TOTALVENDA ?? 0))
        .input("guidcaixa", sql.UniqueIdentifier, vendaRow.GUIDCAIXA)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0005.KS_CAIXA_MOVIMENTO SET TOTALVENDAS=CASE WHEN ISNULL(TOTALVENDAS,0) >= @totalvendas THEN ISNULL(TOTALVENDAS,0)-@totalvendas ELSE 0 END, ULTIMAALTERACAO=GETDATE(), SINCRONIZADO=0 WHERE GUIDCAIXA=@guidcaixa AND GUIDENTIDADE=@guidentidade AND SITUACAO='ABERTO'");

      await auditarCancelamento(request, {
        guidEntidade: session.guidEntidade,
        codFilial: session.codFilial,
        guidUsuario,
        acao: "RESUMO_CANCELAMENTO_VENDA",
        tabela: "MULTIPLAS",
        guidRegistro: guidVenda,
        novo: {
          guidVenda,
          contasReceberCanceladas: financeiro.recordset.length,
          lancamentosCaixaCancelados: lancamentosCaixa.recordset.length,
          comissoesCanceladas: comissoes.recordset.length,
        },
        observacao: `Cancelamento concluído. Financeiro: ${financeiro.recordset.length}; caixa: ${lancamentosCaixa.recordset.length}; comissões: ${comissoes.recordset.length}.`,
        identificacao,
      });

      await tx.commit();
      txStarted = false;
      res.json({
        success: true,
        sucesso: true,
        message: "Venda cancelada com sucesso.",
        mensagem: "Venda cancelada com sucesso.",
        resumo: {
          contasReceberCanceladas: financeiro.recordset.length,
          lancamentosFinanceirosCancelados: lancamentosCaixa.recordset.length,
          comissoesCanceladas: comissoes.recordset.length,
        },
      });
    } catch (error) {
      if (txStarted) {
        try { await tx.rollback(); } catch { /* noop */ }
      }
      sendError(res, error);
    }
  });
}

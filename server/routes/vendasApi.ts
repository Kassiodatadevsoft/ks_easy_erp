import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { finalizarVendaCompleta, type FinalizarVendaInput, type VendaOperacaoSession } from "../routers/vendasOperacaoRouter";
import { ensureCaixaMovimentoTable } from "../routers/caixaMovimentoRouter";
import { getSqlPool, sql } from "../sqlserver";

function sendError(res: Response, error: unknown) {
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
  if (error instanceof TRPCError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 400;
    res.status(status).json({ sucesso: false, success: false, mensagem: error.message, message: error.message, detail });
    return;
  }
  const message = error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.";
  res.status(400).json({ sucesso: false, success: false, mensagem: message, message, detail });
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["1", "S", "SIM", "TRUE", "T"].includes(value.trim().toUpperCase());
  return fallback;
}

function dateValue(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function getGuidEntidadePdv(body: any) {
  return String(firstValue(body?.GUIDENTIDADE, body?.guidEntidade, body?.guidentidade) ?? "").trim();
}

function getVendaPdv(body: any) {
  return body?.venda ?? body?.cabecalho ?? body?.cabecalhoVenda ?? body?.CABECALHO ?? null;
}

function getItensPdv(body: any, venda: any) {
  return body?.ITENS ?? body?.itens ?? body?.vendaItens ?? venda?.ITENS ?? venda?.itens ?? [];
}

function getPagamentosPdv(body: any, venda: any) {
  return body?.PAGAMENTOS ?? body?.pagamentos ?? body?.formasPagamento ?? body?.vendaPagamentos ?? venda?.PAGAMENTOS ?? venda?.pagamentos ?? [];
}

async function buscarEmpresaPdv(guidEntidade: string, guidUsuarioCaixa?: string | null): Promise<VendaOperacaoSession | null> {
  const pool = await getSqlPool();
  const queryName = "buscarEmpresaPdv: SELECT empresa por GUIDENTIDADE";
  const empresa = await pool.request()
    .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
    .query(`
      SELECT TOP 1
        CAST(GUIDENTIDADE AS NVARCHAR(36)) AS guidEntidade,
        CAST(GUIDPESSOA AS NVARCHAR(36)) AS guidPessoa,
        CODENTIDADE,
        NOME,
        FANTASIA,
        DOCUMENTO AS entDocumento
      FROM KS0002.KS00001
      WHERE GUIDENTIDADE=@guidentidade AND CADEMPRESA=1 AND SITUACAO='A'
    `)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${queryName} falhou: ${message}`);
    });
  const row = empresa.recordset[0];
  if (!row) return null;
  return {
    guidEntidade: row.guidEntidade,
    guidPessoa: guidUsuarioCaixa ?? row.guidPessoa ?? row.guidEntidade,
    nomeEmpresa: row.FANTASIA ?? row.NOME ?? "",
    entDocumento: row.entDocumento ?? "",
    validarUsuarioCaixa: false,
  };
}

async function upsertCaixaMovimentoPdv(body: any, session: VendaOperacaoSession, input: FinalizarVendaInput) {
  const venda = getVendaPdv(body);
  const caixa = body?.caixaMovimento ?? body?.caixa ?? body?.CAIXA_MOVIMENTO ?? venda?.caixaMovimento ?? venda?.CAIXA_MOVIMENTO ?? {};
  const guidUsuario = firstValue(caixa?.guidUsuario, caixa?.GUIDUSUARIO, caixa?.guidUsuarioCaixa, caixa?.GUIDUSUARIOCAIXA, session.guidPessoa);
  const dataVenda = input.dataVenda ?? new Date();
  const dataAberturaRaw = firstValue(caixa?.dataAbertura, caixa?.DATAABERTURA);
  const dataAbertura = dataAberturaRaw == null ? dataVenda : dateValue(dataAberturaRaw, dataVenda);
  const dataFechamentoRaw = firstValue(caixa?.dataFechamento, caixa?.DATAFECHAMENTO);
  const dataFechamento = dataFechamentoRaw == null ? null : dateValue(dataFechamentoRaw, dataVenda);
  const situacaoRaw = firstValue(caixa?.situacao, caixa?.SITUACAO);
  const situacao = String(firstValue(situacaoRaw, dataFechamento ? "FECHADO" : "ABERTO")).toUpperCase();
  const situacaoValida = ["ABERTO", "FECHADO", "CANCELADO", "BLOQUEADO"].includes(situacao) ? situacao : "ABERTO";
  const numeroOpcional = (...values: unknown[]) => {
    const value = firstValue(...values);
    return value == null ? null : numberValue(value);
  };

  await ensureCaixaMovimentoTable();
  const pool = await getSqlPool();
  const result = await pool.request()
    .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
    .input("numerocaixa", sql.Int, input.numeroCaixa)
    .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
    .input("guidusuario", sql.UniqueIdentifier, String(guidUsuario))
    .input("codusuario", sql.Int, firstValue(caixa?.codUsuario, caixa?.CODUSUARIO) == null ? null : numberValue(firstValue(caixa?.codUsuario, caixa?.CODUSUARIO)))
    .input("descricao", sql.VarChar(100), firstValue(caixa?.descricao, caixa?.DESCRICAO, `CAIXA ${input.numeroCaixa}`))
    .input("dataabertura", sql.DateTime, dataAbertura)
    .input("dataabertura_update", sql.DateTime, dataAberturaRaw == null ? null : dataAbertura)
    .input("datafechamento", sql.DateTime, dataFechamento)
    .input("datafechamento_update", sql.DateTime, dataFechamentoRaw == null ? null : dataFechamento)
    .input("saldoinicial", sql.Decimal(18, 4), numeroOpcional(caixa?.saldoInicial, caixa?.SALDOINICIAL))
    .input("saldofinal", sql.Decimal(18, 4), numeroOpcional(caixa?.saldoFinal, caixa?.SALDOFINAL))
    .input("totalsuprimento", sql.Decimal(18, 4), numeroOpcional(caixa?.totalSuprimento, caixa?.TOTALSUPRIMENTO))
    .input("totalsangria", sql.Decimal(18, 4), numeroOpcional(caixa?.totalSangria, caixa?.TOTALSANGRIA))
    .input("situacao", sql.VarChar(20), situacaoRaw == null && dataFechamentoRaw == null ? null : situacaoValida)
    .input("observacao", sql.VarChar(sql.MAX), firstValue(caixa?.observacao, caixa?.OBSERVACAO) ?? null)
    .query(`
      DECLARE @guidcaixaefetivo uniqueidentifier;

      SELECT TOP 1 @guidcaixaefetivo = GUIDCAIXA
      FROM KS0005.KS_CAIXA_MOVIMENTO WITH (UPDLOCK, HOLDLOCK)
      WHERE GUIDCAIXA=@guidcaixa AND GUIDENTIDADE=@guidentidade;

      IF @guidcaixaefetivo IS NULL
      BEGIN
        SELECT TOP 1 @guidcaixaefetivo = GUIDCAIXA
        FROM KS0005.KS_CAIXA_MOVIMENTO WITH (UPDLOCK, HOLDLOCK)
        WHERE GUIDENTIDADE=@guidentidade AND GUIDUSUARIO=@guidusuario
        ORDER BY
          CASE WHEN SITUACAO='ABERTO' THEN 0 ELSE 1 END,
          DATAABERTURA DESC;
      END;

      IF @guidcaixaefetivo IS NOT NULL
      BEGIN
        UPDATE KS0005.KS_CAIXA_MOVIMENTO
        SET
          NUMEROCAIXA=@numerocaixa,
          CODUSUARIO=@codusuario,
          DESCRICAO=@descricao,
          DATAABERTURA=COALESCE(@dataabertura_update,DATAABERTURA),
          DATAFECHAMENTO=COALESCE(@datafechamento_update,DATAFECHAMENTO),
          SALDOINICIAL=COALESCE(@saldoinicial,SALDOINICIAL),
          SALDOFINAL=COALESCE(@saldofinal,SALDOFINAL),
          TOTALSUPRIMENTO=COALESCE(@totalsuprimento,TOTALSUPRIMENTO),
          TOTALSANGRIA=COALESCE(@totalsangria,TOTALSANGRIA),
          SITUACAO=COALESCE(@situacao,SITUACAO),
          OBSERVACAO=COALESCE(@observacao,OBSERVACAO),
          ULTIMAALTERACAO=GETDATE(),
          SINCRONIZADO=0
        WHERE GUIDCAIXA=@guidcaixaefetivo;
      END
      ELSE
      BEGIN
        SET @guidcaixaefetivo = @guidcaixa;
        INSERT INTO KS0005.KS_CAIXA_MOVIMENTO
          (GUIDCAIXA,NUMEROCAIXA,GUIDENTIDADE,GUIDUSUARIO,CODUSUARIO,DESCRICAO,DATAABERTURA,DATAFECHAMENTO,
           SALDOINICIAL,SALDOFINAL,TOTALVENDAS,TOTALSUPRIMENTO,TOTALSANGRIA,SITUACAO,OBSERVACAO,ULTIMAALTERACAO,SINCRONIZADO)
        VALUES
          (@guidcaixa,@numerocaixa,@guidentidade,@guidusuario,@codusuario,@descricao,@dataabertura,@datafechamento,
           COALESCE(@saldoinicial,0),COALESCE(@saldofinal,0),0,COALESCE(@totalsuprimento,0),COALESCE(@totalsangria,0),COALESCE(@situacao,'ABERTO'),@observacao,GETDATE(),0);
      END;

      SELECT CAST(@guidcaixaefetivo AS NVARCHAR(36)) AS guidCaixaEfetivo;
    `)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`upsertCaixaMovimentoPdv: upsert caixa por GUIDCAIXA/GUIDUSUARIO falhou: ${message}`);
    });
  return String(result.recordset[0]?.guidCaixaEfetivo ?? input.guidCaixa);
}

function normalizarVendaPdv(body: any): { input: FinalizarVendaInput; guidUsuarioCaixa: string | null } {
  const venda = getVendaPdv(body);
  const caixa = body?.caixaMovimento ?? body?.caixa ?? body?.CAIXA_MOVIMENTO ?? venda?.caixaMovimento ?? venda?.CAIXA_MOVIMENTO ?? {};
  const itens = getItensPdv(body, venda);
  const pagamentos = getPagamentosPdv(body, venda);

  const guidVenda = firstValue(venda?.guidVenda, venda?.GUIDVENDA);
  const guidCaixa = firstValue(caixa?.guidCaixa, caixa?.GUIDCAIXA, venda?.guidCaixa, venda?.GUIDCAIXA);
  const guidCliente = firstValue(venda?.guidCliente, venda?.GUIDCLIENTE, venda?.guidPessoas, venda?.GUIDPESSOAS);
  const guidUsuarioCaixa = firstValue(caixa?.guidUsuario, caixa?.GUIDUSUARIO, caixa?.guidUsuarioCaixa, caixa?.GUIDUSUARIOCAIXA) as string | null;
  const totalProdutos = numberValue(firstValue(venda?.totalProdutos, venda?.valorProdutos, venda?.TOTALPRODUTOS, venda?.VALORPRODUTOS), 0);
  const desconto = numberValue(firstValue(venda?.descontoValor, venda?.valorDesconto, venda?.DESCONTOVALOR, venda?.DESCONTO), 0);
  const acrescimo = numberValue(firstValue(venda?.acrescimoValor, venda?.valorAcrescimo, venda?.ACRESCIMOVALOR), 0);
  const totalVenda = numberValue(firstValue(venda?.totalVenda, venda?.valorTotal, venda?.TOTALVENDA, venda?.VALORFINAL), totalProdutos - desconto + acrescimo);
  const valorPago = numberValue(firstValue(venda?.valorPago, venda?.VALORPAGO), totalVenda);
  const troco = numberValue(firstValue(venda?.troco, venda?.TROCO), 0);
  const dataVenda = dateValue(firstValue(venda?.dataVenda, venda?.DATAVENDA), new Date());

  return {
    guidUsuarioCaixa,
    input: {
      guidVenda: String(guidVenda),
      guidCaixa: String(guidCaixa),
      dataVenda,
      numeroCaixa: numberValue(firstValue(caixa?.numeroCaixa, caixa?.NUMEROCAIXA, venda?.numeroCaixa, venda?.NUMEROCAIXA), 0),
      clientePadrao: boolValue(firstValue(venda?.clientePadrao, venda?.CLIENTEPADRAO), !guidCliente),
      guidCliente: guidCliente ? String(guidCliente) : null,
      codCliente: firstValue(venda?.codCliente, venda?.CODCLIENTE) == null ? null : numberValue(firstValue(venda?.codCliente, venda?.CODCLIENTE)),
      nomeCliente: String(firstValue(venda?.nomeCliente, venda?.cliente, venda?.CLIENTE, "CLIENTE PADRAO")),
      guidVendedor: String(firstValue(venda?.guidVendedor, venda?.GUIDVENDEDOR)),
      codVendedor: firstValue(venda?.codVendedor, venda?.CODVENDEDOR) == null ? null : numberValue(firstValue(venda?.codVendedor, venda?.CODVENDEDOR)),
      vendedorNome: String(firstValue(venda?.vendedorNome, venda?.vendedor, venda?.VENDEDOR, "")),
      observacao: firstValue(venda?.observacao, venda?.OBSERVACAO) as string | undefined,
      totais: {
        bruto: totalProdutos,
        descontoTotal: desconto,
        acrescimos: acrescimo,
        totalLiquido: totalVenda,
        pago: valorPago,
        troco,
      },
      itens: itens.map((item: any, index: number) => {
        const quantidade = numberValue(firstValue(item?.quantidade, item?.QUANTIDADE), 0);
        const precoVenda = numberValue(firstValue(item?.precoVenda, item?.valorUnitario, item?.PRECOVENDA, item?.VALORUNITARIO), 0);
        return {
          guidProduto: String(firstValue(item?.guidProduto, item?.GUIDPRODUTO)),
          codProduto: firstValue(item?.codProduto, item?.CODPRODUTO) == null ? null : numberValue(firstValue(item?.codProduto, item?.CODPRODUTO)),
          descricao: String(firstValue(item?.descricao, item?.produto, item?.PRODUTO, `Item ${index + 1}`)),
          quantidade,
          precoCusto: numberValue(firstValue(item?.precoCusto, item?.PRECOCUSTO), 0),
          precoVenda,
          precoFinal: numberValue(firstValue(item?.precoFinal, item?.valorUnitario, item?.PRECOFINAL, item?.VALORUNITARIO), precoVenda),
          promocao: boolValue(firstValue(item?.promocao, item?.PROMOCAO), false),
          descontoPercentual: numberValue(firstValue(item?.descontoPercentual, item?.DESCONTOPERCENTUAL), 0),
          descontoValor: numberValue(firstValue(item?.descontoValor, item?.valorDesconto, item?.DESCONTOVALOR), 0),
          totalItem: numberValue(firstValue(item?.totalItem, item?.valorTotal, item?.TOTALITEM, item?.VALORTOTAL), quantidade * precoVenda),
          faixaPrecoAplicada: firstValue(item?.faixaPrecoAplicada, item?.FAIXAPRECOAPLICADA) as string | undefined,
          guidTamanho: firstValue(item?.guidTamanho, item?.GUIDTAMANHO) as string | undefined,
          descricaoTamanho: firstValue(item?.descricaoTamanho, item?.DESCRICAOTAMANHO) as string | undefined,
          guidFaixaPreco: firstValue(item?.guidFaixaPreco, item?.GUIDFAIXAPRECO) as string | undefined,
          descricaoFaixaPreco: firstValue(item?.descricaoFaixaPreco, item?.DESCRICAOFAIXAPRECO) as string | undefined,
          guidImei: firstValue(item?.guidImei, item?.GUIDIMEI) as string | undefined,
          imeiLabel: firstValue(item?.imeiLabel, item?.IMEI, item?.OBSERVACAO) as string | undefined,
          permiteVendaSemEstoque: boolValue(firstValue(item?.permiteVendaSemEstoque, item?.PERMITEVENDASEMESTOQUE), false),
        };
      }),
      pagamentos: pagamentos.map((pagamento: any) => ({
        guidFormaPagamento: String(firstValue(pagamento?.guidFormaPagamento, pagamento?.GUIDFORMAPAGAMENTO)),
        codFormaPagamento: firstValue(pagamento?.codFormaPagamento, pagamento?.CODFORMAPAGAMENTO) == null ? null : numberValue(firstValue(pagamento?.codFormaPagamento, pagamento?.CODFORMAPAGAMENTO)),
        descricaoFormaPagamento: String(firstValue(pagamento?.descricaoFormaPagamento, pagamento?.formaPagamento, pagamento?.FORMAPAGAMENTO, pagamento?.DESCRICAOFORMAPAGAMENTO)),
        valorPago: numberValue(firstValue(pagamento?.valorPago, pagamento?.valor, pagamento?.VALORPAGO, pagamento?.VALOR), 0),
        parcelas: numberValue(firstValue(pagamento?.parcelas, pagamento?.PARCELAS), 1),
        troco: numberValue(firstValue(pagamento?.troco, pagamento?.TROCO), 0),
      })),
    },
  };
}

export function registerVendasApiRoutes(app: Express) {
  app.post("/api/vendas/finalizar", async (req: Request, res: Response) => {
    try {
      const caller = appRouter.createCaller({ req, res, user: null });
      const result = await caller.vendasOperacao.finalizar(req.body);
      res.json({
        sucesso: true,
        success: true,
        mensagem: result.mensagem ?? "Venda finalizada com sucesso.",
        message: result.mensagem ?? "Venda finalizada com sucesso.",
        GUIDVENDA: result.guidVenda,
        guidVenda: result.guidVenda,
        CODPREVENDA: result.CODPREVENDA ?? result.numeroVenda,
        codPreVenda: result.CODPREVENDA ?? result.numeroVenda,
        numeroVenda: result.numeroVenda,
        total: result.total,
        comprovante: result.comprovante,
        impressao: result.impressao,
        dataHora: result.dataHora,
        empresa: result.empresa,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/vendas/sincronizar-pdv", async (req: Request, res: Response) => {
    try {
      const guidEntidade = getGuidEntidadePdv(req.body);
      if (!guidEntidade) {
        return res.status(400).json({ sucesso: false, success: false, mensagem: "GUIDENTIDADE não informada.", message: "GUIDENTIDADE não informada." });
      }

      const venda = getVendaPdv(req.body);
      if (!venda) {
        return res.status(400).json({ sucesso: false, success: false, mensagem: "Venda não informada.", message: "Venda não informada." });
      }

      const itens = getItensPdv(req.body, venda);
      if (!Array.isArray(itens) || !itens.length) {
        return res.status(400).json({ sucesso: false, success: false, mensagem: "ITENS não informados.", message: "ITENS não informados." });
      }

      const pagamentos = getPagamentosPdv(req.body, venda);
      if (!Array.isArray(pagamentos) || !pagamentos.length) {
        return res.status(400).json({ sucesso: false, success: false, mensagem: "PAGAMENTOS não informados.", message: "PAGAMENTOS não informados." });
      }

      const { input, guidUsuarioCaixa } = normalizarVendaPdv(req.body);
      const session = await buscarEmpresaPdv(guidEntidade, guidUsuarioCaixa);
      if (!session) {
        return res.status(404).json({ sucesso: false, success: false, mensagem: "Empresa não encontrada.", message: "Empresa não encontrada." });
      }

      input.guidCaixa = await upsertCaixaMovimentoPdv(req.body, session, input);
      const result = await finalizarVendaCompleta(input, session);
      res.json({
        sucesso: true,
        success: true,
        duplicado: Boolean(result.duplicado),
        mensagem: result.duplicado ? result.mensagem : "Venda sincronizada com sucesso",
        message: result.duplicado ? result.mensagem : "Venda sincronizada com sucesso",
        GUIDVENDA: result.guidVenda,
        guidVenda: result.guidVenda,
        GUIDENTIDADE: session.guidEntidade,
        guidEntidade: session.guidEntidade,
        CODPREVENDA: result.CODPREVENDA ?? result.numeroVenda,
        codPreVenda: result.CODPREVENDA ?? result.numeroVenda,
        numeroVenda: result.numeroVenda,
        total: result.total,
        dataHora: result.dataHora,
        aviso: result.aviso,
        avisos: result.avisos,
        caixaMovimentadoPor: "VENDAPAGAMENTO",
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getSqlPool, querySql, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessao invalida. Faca login novamente." });
  return session;
}

async function ensureVendasTables() {
  await querySql(`
    IF SCHEMA_ID('KS0005') IS NULL EXEC('CREATE SCHEMA KS0005');

    IF OBJECT_ID('KS0005.KS00016', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS00016 (
        GUIDVENDA uniqueidentifier NOT NULL PRIMARY KEY,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        NUMEROVENDA int NOT NULL,
        GUIDCLIENTE uniqueidentifier NULL,
        CODCLIENTE int NULL,
        CLIENTEPADRAO bit NOT NULL DEFAULT 1,
        GUIDVENDEDOR uniqueidentifier NOT NULL,
        CODVENDEDOR int NULL,
        GUIDCAIXA uniqueidentifier NOT NULL,
        NUMEROCAIXA int NOT NULL,
        GUIDUSUARIOCAIXA uniqueidentifier NOT NULL,
        CODCAIXA int NULL,
        DATAVENDA datetime NOT NULL,
        TIPOOPERACAO varchar(20) NOT NULL,
        SITUACAO varchar(30) NOT NULL,
        TOTALPRODUTOS numeric(18,4) NOT NULL DEFAULT 0,
        DESCONTOVALOR numeric(18,4) NOT NULL DEFAULT 0,
        DESCONTOPERCENTUAL numeric(18,4) NOT NULL DEFAULT 0,
        ACRESCIMOVALOR numeric(18,4) NOT NULL DEFAULT 0,
        TOTALVENDA numeric(18,4) NOT NULL DEFAULT 0,
        VALORPAGO numeric(18,4) NOT NULL DEFAULT 0,
        TROCO numeric(18,4) NOT NULL DEFAULT 0,
        OBSERVACAO varchar(max) NULL,
        ULTIMAALTERACAO datetime NOT NULL,
        SINCRONIZADO bit NOT NULL DEFAULT 0
      );
    END;

    IF OBJECT_ID('KS0005.KS00017', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS00017 (
        GUIDITEMVENDA uniqueidentifier NOT NULL PRIMARY KEY,
        GUIDVENDA uniqueidentifier NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDPRODUTO uniqueidentifier NOT NULL,
        CODPRODUTO int NULL,
        GUIDIMEI uniqueidentifier NULL,
        ITEM int NOT NULL,
        QUANTIDADE numeric(18,4) NOT NULL,
        PRECOCUSTO numeric(18,4) NOT NULL DEFAULT 0,
        PRECOVENDA numeric(18,4) NOT NULL DEFAULT 0,
        PRECOFINAL numeric(18,4) NOT NULL DEFAULT 0,
        PROMOCAO bit NOT NULL DEFAULT 0,
        DESCONTOPERCENTUAL numeric(18,4) NOT NULL DEFAULT 0,
        DESCONTOVALOR numeric(18,4) NOT NULL DEFAULT 0,
        TOTALITEM numeric(18,4) NOT NULL DEFAULT 0,
        FAIXAPRECOAPLICADA varchar(100) NULL,
        OBSERVACAO varchar(max) NULL,
        ULTIMAALTERACAO datetime NOT NULL,
        SINCRONIZADO bit NOT NULL DEFAULT 0
      );
    END;

    IF OBJECT_ID('KS0005.KS00018', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS00018 (
        GUIDPAGAMENTO uniqueidentifier NOT NULL PRIMARY KEY,
        GUIDPAGAMENTOVENDA uniqueidentifier NULL,
        GUIDVENDA uniqueidentifier NOT NULL,
        GUIDCAIXA uniqueidentifier NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDFORMAPAGAMENTO uniqueidentifier NOT NULL,
        CODFORMAPAGAMENTO int NULL,
        DESCRICAOFORMAPAGAMENTO varchar(100) NULL,
        VALORPAGO numeric(18,4) NOT NULL DEFAULT 0,
        TROCO numeric(18,4) NOT NULL DEFAULT 0,
        PARCELAS int NULL,
        DATAHORA datetime NOT NULL,
        SINCRONIZADO bit NOT NULL DEFAULT 0
      );
    END;

    IF OBJECT_ID('KS0005.KS00018', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS00018','GUIDPAGAMENTO') IS NULL ALTER TABLE KS0005.KS00018 ADD GUIDPAGAMENTO uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00018','GUIDPAGAMENTOVENDA') IS NULL ALTER TABLE KS0005.KS00018 ADD GUIDPAGAMENTOVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00018','GUIDCAIXA') IS NULL ALTER TABLE KS0005.KS00018 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00018','DESCRICAOFORMAPAGAMENTO') IS NULL ALTER TABLE KS0005.KS00018 ADD DESCRICAOFORMAPAGAMENTO varchar(100) NULL;
      IF COL_LENGTH('KS0005.KS00018','VALORPAGO') IS NULL ALTER TABLE KS0005.KS00018 ADD VALORPAGO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_VALORPAGO_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00018','TROCO') IS NULL ALTER TABLE KS0005.KS00018 ADD TROCO numeric(18,4) NOT NULL CONSTRAINT DF_KS00018_TROCO_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00018','DATAHORA') IS NULL ALTER TABLE KS0005.KS00018 ADD DATAHORA datetime NULL;
      IF COL_LENGTH('KS0005.KS00018','SINCRONIZADO') IS NULL ALTER TABLE KS0005.KS00018 ADD SINCRONIZADO bit NOT NULL CONSTRAINT DF_KS00018_SINCRONIZADO_FINAL DEFAULT 0;
    END;

    IF OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO_ITEM', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM (
        GUIDMOVIMENTOCAIXA uniqueidentifier NOT NULL PRIMARY KEY,
        GUIDCAIXA uniqueidentifier NOT NULL,
        GUIDVENDA uniqueidentifier NOT NULL,
        GUIDENTIDADE uniqueidentifier NOT NULL,
        GUIDFORMAPAGAMENTO uniqueidentifier NULL,
        GUIDLANCAMENTOCAIXA uniqueidentifier NULL,
        GUIDCONTA uniqueidentifier NULL,
        GUIDNATUREZA uniqueidentifier NULL,
        GUIDCENTRO uniqueidentifier NULL,
        GUIDCONTABANCARIA uniqueidentifier NULL,
        TIPO varchar(30) NOT NULL,
        VALOR numeric(18,4) NOT NULL,
        DATAHORA datetime NOT NULL,
        HISTORICO varchar(255) NULL,
        SINCRONIZADO bit NOT NULL DEFAULT 0
      );
    END;

    IF OBJECT_ID('KS0005.KS_CAIXA_MOVIMENTO_ITEM', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS_CAIXA_MOVIMENTO_ITEM','GUIDLANCAMENTOCAIXA') IS NULL ALTER TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM ADD GUIDLANCAMENTOCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS_CAIXA_MOVIMENTO_ITEM','GUIDCONTA') IS NULL ALTER TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM ADD GUIDCONTA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS_CAIXA_MOVIMENTO_ITEM','GUIDNATUREZA') IS NULL ALTER TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM ADD GUIDNATUREZA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS_CAIXA_MOVIMENTO_ITEM','GUIDCENTRO') IS NULL ALTER TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM ADD GUIDCENTRO uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS_CAIXA_MOVIMENTO_ITEM','GUIDCONTABANCARIA') IS NULL ALTER TABLE KS0005.KS_CAIXA_MOVIMENTO_ITEM ADD GUIDCONTABANCARIA uniqueidentifier NULL;
    END;

    IF OBJECT_ID('KS0003.KS00010', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0003.KS00010','GUIDVENDA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDVENDA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDCAIXA') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0003.KS00010','GUIDFORMAPAGAMENTO') IS NULL ALTER TABLE KS0003.KS00010 ADD GUIDFORMAPAGAMENTO uniqueidentifier NULL;
    END;

    IF OBJECT_ID('KS0005.KS00016', 'U') IS NOT NULL
    BEGIN
      IF COL_LENGTH('KS0005.KS00016','GUIDENTIDADE') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDENTIDADE uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016','NUMEROVENDA') IS NULL ALTER TABLE KS0005.KS00016 ADD NUMEROVENDA int NULL;
      IF COL_LENGTH('KS0005.KS00016','GUIDCLIENTE') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDCLIENTE uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016','CLIENTEPADRAO') IS NULL ALTER TABLE KS0005.KS00016 ADD CLIENTEPADRAO bit NOT NULL CONSTRAINT DF_KS00016_CLIENTEPADRAO_FINAL DEFAULT 1;
      IF COL_LENGTH('KS0005.KS00016','GUIDVENDEDOR') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDVENDEDOR uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016','CODVENDEDOR') IS NULL ALTER TABLE KS0005.KS00016 ADD CODVENDEDOR int NULL;
      IF COL_LENGTH('KS0005.KS00016','GUIDCAIXA') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016','NUMEROCAIXA') IS NULL ALTER TABLE KS0005.KS00016 ADD NUMEROCAIXA int NULL;
      IF COL_LENGTH('KS0005.KS00016','GUIDUSUARIOCAIXA') IS NULL ALTER TABLE KS0005.KS00016 ADD GUIDUSUARIOCAIXA uniqueidentifier NULL;
      IF COL_LENGTH('KS0005.KS00016','CODCAIXA') IS NULL ALTER TABLE KS0005.KS00016 ADD CODCAIXA int NULL;
      IF COL_LENGTH('KS0005.KS00016','CODCLIENTE') IS NULL ALTER TABLE KS0005.KS00016 ADD CODCLIENTE int NULL;
      IF COL_LENGTH('KS0005.KS00016','DATAVENDA') IS NULL ALTER TABLE KS0005.KS00016 ADD DATAVENDA datetime NULL;
      IF COL_LENGTH('KS0005.KS00016','TIPOOPERACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD TIPOOPERACAO varchar(20) NULL;
      IF COL_LENGTH('KS0005.KS00016','SITUACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD SITUACAO varchar(30) NULL;
      IF COL_LENGTH('KS0005.KS00016','TOTALPRODUTOS') IS NULL ALTER TABLE KS0005.KS00016 ADD TOTALPRODUTOS numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_TOTALPRODUTOS_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','DESCONTOVALOR') IS NULL ALTER TABLE KS0005.KS00016 ADD DESCONTOVALOR numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_DESCONTOVALOR_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','DESCONTOPERCENTUAL') IS NULL ALTER TABLE KS0005.KS00016 ADD DESCONTOPERCENTUAL numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_DESCONTOPERCENTUAL_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','ACRESCIMOVALOR') IS NULL ALTER TABLE KS0005.KS00016 ADD ACRESCIMOVALOR numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_ACRESCIMOVALOR_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','TOTALVENDA') IS NULL ALTER TABLE KS0005.KS00016 ADD TOTALVENDA numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_TOTALVENDA_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','VALORPAGO') IS NULL ALTER TABLE KS0005.KS00016 ADD VALORPAGO numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_VALORPAGO_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','TROCO') IS NULL ALTER TABLE KS0005.KS00016 ADD TROCO numeric(18,4) NOT NULL CONSTRAINT DF_KS00016_TROCO_FINAL DEFAULT 0;
      IF COL_LENGTH('KS0005.KS00016','OBSERVACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD OBSERVACAO varchar(max) NULL;
      IF COL_LENGTH('KS0005.KS00016','ULTIMAALTERACAO') IS NULL ALTER TABLE KS0005.KS00016 ADD ULTIMAALTERACAO datetime NULL;
      IF COL_LENGTH('KS0005.KS00016','SINCRONIZADO') IS NULL ALTER TABLE KS0005.KS00016 ADD SINCRONIZADO bit NOT NULL CONSTRAINT DF_KS00016_SINCRONIZADO_FINAL DEFAULT 0;
    END;
  `);
}

const finalizarInput = z.object({
  guidVenda: z.string().uuid(),
  guidCaixa: z.string().uuid(),
  numeroCaixa: z.number().int(),
  clientePadrao: z.boolean(),
  guidCliente: z.string().uuid().nullable(),
  codCliente: z.number().nullable(),
  nomeCliente: z.string(),
  guidVendedor: z.string().uuid(),
  codVendedor: z.number().nullable(),
  vendedorNome: z.string(),
  observacao: z.string().optional(),
  totais: z.object({
    bruto: z.number(),
    descontoTotal: z.number(),
    acrescimos: z.number(),
    totalLiquido: z.number(),
    pago: z.number(),
    troco: z.number(),
  }),
  itens: z.array(z.object({
    guidProduto: z.string().uuid(),
    codProduto: z.number().nullable(),
    descricao: z.string(),
    quantidade: z.number().positive(),
    precoCusto: z.number(),
    precoVenda: z.number(),
    precoFinal: z.number(),
    promocao: z.boolean(),
    descontoPercentual: z.number(),
    descontoValor: z.number(),
    totalItem: z.number(),
    faixaPrecoAplicada: z.string().optional(),
    guidImei: z.string().uuid().optional(),
    imeiLabel: z.string().optional(),
    permiteVendaSemEstoque: z.boolean(),
  })).min(1),
  pagamentos: z.array(z.object({
    guidFormaPagamento: z.string().uuid(),
    codFormaPagamento: z.number().nullable().optional(),
    descricaoFormaPagamento: z.string(),
    valorPago: z.number().positive(),
    parcelas: z.number().int().positive(),
    troco: z.number().default(0),
  })).min(1),
});

export const vendasOperacaoRouter = router({
  finalizar: publicProcedure.input(finalizarInput).mutation(async ({ ctx, input }) => {
    const session = await getKsSession(ctx.req);
    await ensureVendasTables();

    const pool = await getSqlPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const request = () => new sql.Request(tx);

      const caixa = await request()
        .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("guidusuario", sql.UniqueIdentifier, session.guidPessoa)
        .query(`
          SELECT TOP 1 NUMEROCAIXA, SITUACAO
          FROM KS0005.KS_CAIXA_MOVIMENTO WITH (UPDLOCK, HOLDLOCK)
          WHERE GUIDCAIXA=@guidcaixa AND GUIDENTIDADE=@guidentidade AND GUIDUSUARIO=@guidusuario AND SITUACAO='ABERTO'
        `);
      if (!caixa.recordset[0]) throw new Error("Caixa invalido ou fechado. Abra um caixa antes de finalizar a venda.");

      const vendedor = await request()
        .input("guidvendedor", sql.UniqueIdentifier, input.guidVendedor)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT TOP 1 GUIDPESSOA FROM KS0002.KS00001 WHERE GUIDPESSOA=@guidvendedor AND GUIDENTIDADE=@guidentidade AND CADUSUARIO=1 AND SITUACAO='A'");
      if (!vendedor.recordset[0]) throw new Error("Selecione um vendedor ativo para continuar.");

      const formasFinanceiras = new Map<string, {
        guidConta: string | null;
        guidNatureza: string | null;
        guidCentro: string | null;
        guidContaBancaria: string | null;
      }>();
      for (const pagamento of input.pagamentos) {
        const forma = await request()
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query(`
            SELECT TOP 1
              GUIDPAGAMENTO, PAGAMENTO, SITUACAO,
              GUIDCONTA, GUIDNATUREZA, GUIDCENTRO, GUIDCONTABANCARIA
            FROM KS0003.KS00006
            WHERE GUIDPAGAMENTO=@guidforma AND GUIDENTIDADE=@guidentidade
          `);
        const formaRow = forma.recordset[0];
        if (!formaRow) throw new Error("Forma de pagamento nao vinculada a empresa atual.");
        if (formaRow.SITUACAO !== "A") throw new Error("Forma de pagamento inativa.");
        if (!formaRow.GUIDCONTABANCARIA || !formaRow.GUIDNATUREZA || !formaRow.GUIDCENTRO) {
          throw new Error(`Forma de pagamento sem conta, natureza ou centro de custo configurado: ${pagamento.descricaoFormaPagamento}.`);
        }
        formasFinanceiras.set(pagamento.guidFormaPagamento, {
          guidConta: formaRow.GUIDCONTA ?? null,
          guidNatureza: formaRow.GUIDNATUREZA ?? null,
          guidCentro: formaRow.GUIDCENTRO ?? null,
          guidContaBancaria: formaRow.GUIDCONTABANCARIA ?? null,
        });
      }

      if (input.totais.pago + 0.009 < input.totais.totalLiquido) throw new Error("Total pago menor que total da venda.");

      const numeroVendaResult = await request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT ISNULL(MAX(NUMEROVENDA),0)+1 AS NUMEROVENDA FROM KS0005.KS00016 WHERE GUIDENTIDADE=@guidentidade");
      const numeroVenda = Number(numeroVendaResult.recordset[0]?.NUMEROVENDA ?? 1);

      await request()
        .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("numerovenda", sql.Int, numeroVenda)
        .input("guidcliente", sql.UniqueIdentifier, input.clientePadrao ? null : input.guidCliente)
        .input("codcliente", sql.Int, input.clientePadrao ? null : input.codCliente)
        .input("clientepadrao", sql.Bit, input.clientePadrao ? 1 : 0)
        .input("guidvendedor", sql.UniqueIdentifier, input.guidVendedor)
        .input("codvendedor", sql.Int, input.codVendedor ?? null)
        .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
        .input("numerocaixa", sql.Int, input.numeroCaixa)
        .input("guidusuariocaixa", sql.UniqueIdentifier, session.guidPessoa)
        .input("codcaixa", sql.Int, input.numeroCaixa)
        .input("totalprodutos", sql.Decimal(18, 4), input.totais.bruto)
        .input("descontovalor", sql.Decimal(18, 4), input.totais.descontoTotal)
        .input("descontopercentual", sql.Decimal(18, 4), input.totais.bruto > 0 ? (input.totais.descontoTotal / input.totais.bruto) * 100 : 0)
        .input("acrescimovalor", sql.Decimal(18, 4), input.totais.acrescimos)
        .input("totalvenda", sql.Decimal(18, 4), input.totais.totalLiquido)
        .input("valorpago", sql.Decimal(18, 4), input.totais.pago)
        .input("troco", sql.Decimal(18, 4), input.totais.troco)
        .input("observacao", sql.VarChar(sql.MAX), input.observacao ?? null)
        .query(`
          MERGE KS0005.KS00016 AS t
          USING (SELECT @guidvenda AS GUIDVENDA) AS s ON t.GUIDVENDA=s.GUIDVENDA
          WHEN MATCHED THEN UPDATE SET
            GUIDCLIENTE=@guidcliente, CODCLIENTE=@codcliente, CLIENTEPADRAO=@clientepadrao,
            GUIDVENDEDOR=@guidvendedor, CODVENDEDOR=@codvendedor, GUIDCAIXA=@guidcaixa,
            NUMEROCAIXA=@numerocaixa, GUIDUSUARIOCAIXA=@guidusuariocaixa, CODCAIXA=@codcaixa,
            DATAVENDA=GETDATE(), TIPOOPERACAO='VENDA', SITUACAO='FINALIZADA',
            TOTALPRODUTOS=@totalprodutos, DESCONTOVALOR=@descontovalor, DESCONTOPERCENTUAL=@descontopercentual,
            ACRESCIMOVALOR=@acrescimovalor, TOTALVENDA=@totalvenda, VALORPAGO=@valorpago, TROCO=@troco,
            OBSERVACAO=@observacao, ULTIMAALTERACAO=GETDATE(), SINCRONIZADO=0
          WHEN NOT MATCHED THEN INSERT
            (GUIDVENDA,GUIDENTIDADE,NUMEROVENDA,GUIDCLIENTE,CODCLIENTE,CLIENTEPADRAO,GUIDVENDEDOR,CODVENDEDOR,
             GUIDCAIXA,NUMEROCAIXA,GUIDUSUARIOCAIXA,CODCAIXA,DATAVENDA,TIPOOPERACAO,SITUACAO,
             TOTALPRODUTOS,DESCONTOVALOR,DESCONTOPERCENTUAL,ACRESCIMOVALOR,TOTALVENDA,VALORPAGO,TROCO,OBSERVACAO,ULTIMAALTERACAO,SINCRONIZADO)
          VALUES
            (@guidvenda,@guidentidade,@numerovenda,@guidcliente,@codcliente,@clientepadrao,@guidvendedor,@codvendedor,
             @guidcaixa,@numerocaixa,@guidusuariocaixa,@codcaixa,GETDATE(),'VENDA','FINALIZADA',
             @totalprodutos,@descontovalor,@descontopercentual,@acrescimovalor,@totalvenda,@valorpago,@troco,@observacao,GETDATE(),0);
        `);

      await request().input("guidvenda", sql.UniqueIdentifier, input.guidVenda).query("DELETE FROM KS0005.KS00017 WHERE GUIDVENDA=@guidvenda");
      await request().input("guidvenda", sql.UniqueIdentifier, input.guidVenda).query("DELETE FROM KS0005.KS00018 WHERE GUIDVENDA=@guidvenda");
      await request().input("guidvenda", sql.UniqueIdentifier, input.guidVenda).query("DELETE FROM KS0005.KS_CAIXA_MOVIMENTO_ITEM WHERE GUIDVENDA=@guidvenda");

      for (let index = 0; index < input.itens.length; index += 1) {
        const item = input.itens[index];
        const produto = await request()
          .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("SELECT TOP 1 CODPRODUTO, PRODUTO, SITUACAO, ISNULL(ESTOQUE,0) AS ESTOQUE, ISNULL(SERVICO,0) AS SERVICO FROM KS0000.KS00009 WITH (UPDLOCK, HOLDLOCK) WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade");
        const produtoRow = produto.recordset[0];
        if (!produtoRow || produtoRow.SITUACAO !== "A") throw new Error(`Produto inativo ou nao encontrado: ${item.descricao}`);
        if (!item.permiteVendaSemEstoque && Number(produtoRow.ESTOQUE ?? 0) < item.quantidade) throw new Error(`Produto sem estoque disponivel: ${item.descricao}`);
        if (item.guidImei) {
          const imei = await request()
            .input("guidimei", sql.UniqueIdentifier, item.guidImei)
            .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .query("SELECT TOP 1 SITUACAO FROM KS0005.KS_PRODUTOS_IMEI WITH (UPDLOCK, HOLDLOCK) WHERE GUIDIMEI=@guidimei AND GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade");
          if (!imei.recordset[0] || !["DISPONIVEL", "RESERVADO"].includes(imei.recordset[0].SITUACAO)) throw new Error(`IMEI nao disponivel para venda: ${item.descricao}`);
        }

        await request()
          .input("guiditem", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
          .input("codproduto", sql.Int, item.codProduto)
          .input("guidimei", sql.UniqueIdentifier, item.guidImei ?? null)
          .input("item", sql.Int, index + 1)
          .input("quantidade", sql.Decimal(18, 4), item.quantidade)
          .input("precocusto", sql.Decimal(18, 4), item.precoCusto)
          .input("precovenda", sql.Decimal(18, 4), item.precoVenda)
          .input("precofinal", sql.Decimal(18, 4), item.precoFinal)
          .input("promocao", sql.Bit, item.promocao ? 1 : 0)
          .input("descontopercentual", sql.Decimal(18, 4), item.descontoPercentual)
          .input("descontovalor", sql.Decimal(18, 4), item.descontoValor)
          .input("totalitem", sql.Decimal(18, 4), item.totalItem)
          .input("faixa", sql.VarChar(100), item.faixaPrecoAplicada ?? null)
          .input("observacao", sql.VarChar(sql.MAX), item.imeiLabel ?? null)
          .query(`
            INSERT INTO KS0005.KS00017
              (GUIDITEMVENDA,GUIDVENDA,GUIDENTIDADE,GUIDPRODUTO,CODPRODUTO,GUIDIMEI,ITEM,QUANTIDADE,PRECOCUSTO,PRECOVENDA,
               PRECOFINAL,PROMOCAO,DESCONTOPERCENTUAL,DESCONTOVALOR,TOTALITEM,FAIXAPRECOAPLICADA,OBSERVACAO,ULTIMAALTERACAO,SINCRONIZADO)
            VALUES
              (@guiditem,@guidvenda,@guidentidade,@guidproduto,@codproduto,@guidimei,@item,@quantidade,@precocusto,@precovenda,
               @precofinal,@promocao,@descontopercentual,@descontovalor,@totalitem,@faixa,@observacao,GETDATE(),0)
          `);

        await request()
          .input("quantidade", sql.Decimal(18, 4), item.quantidade)
          .input("guidproduto", sql.UniqueIdentifier, item.guidProduto)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0000.KS00009 SET ESTOQUE = ISNULL(ESTOQUE,0) - @quantidade, ULTIMAALTERACAO=GETDATE() WHERE GUIDPRODUTO=@guidproduto AND GUIDENTIDADE=@guidentidade");

        if (item.guidImei) {
          await request()
            .input("guidimei", sql.UniqueIdentifier, item.guidImei)
            .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
            .query("UPDATE KS0005.KS_PRODUTOS_IMEI SET SITUACAO='VENDIDO', ULTIMAALTERACAO=GETDATE(), SINCRONIZADO=0 WHERE GUIDIMEI=@guidimei AND GUIDENTIDADE=@guidentidade");
        }
      }

      let trocoRestante = input.totais.troco;
      for (const pagamento of input.pagamentos) {
        const trocoPagamento = Math.min(trocoRestante, Math.max(0, pagamento.troco ?? 0));
        trocoRestante -= trocoPagamento;
        const guidPagamento = crypto.randomUUID();
        const guidLancamentoCaixa = crypto.randomUUID();
        const formaFinanceira = formasFinanceiras.get(pagamento.guidFormaPagamento);
        if (!formaFinanceira?.guidContaBancaria || !formaFinanceira.guidNatureza || !formaFinanceira.guidCentro) {
          throw new Error(`Forma de pagamento sem conta, natureza ou centro de custo configurado: ${pagamento.descricaoFormaPagamento}.`);
        }
        const valorMovimento = pagamento.valorPago - trocoPagamento;
        await request()
          .input("guidpagamento", sql.UniqueIdentifier, guidPagamento)
          .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
          .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("codforma", sql.Int, pagamento.codFormaPagamento ?? null)
          .input("descricao", sql.VarChar(100), pagamento.descricaoFormaPagamento)
          .input("valorpago", sql.Decimal(18, 4), pagamento.valorPago)
          .input("troco", sql.Decimal(18, 4), trocoPagamento)
          .input("parcelas", sql.Int, pagamento.parcelas)
          .query(`
            INSERT INTO KS0005.KS00018
              (GUIDPAGAMENTO,GUIDPAGAMENTOVENDA,GUIDVENDA,GUIDCAIXA,GUIDENTIDADE,GUIDFORMAPAGAMENTO,CODFORMAPAGAMENTO,DESCRICAOFORMAPAGAMENTO,VALORPAGO,TROCO,PARCELAS,DATAHORA,SINCRONIZADO)
            VALUES
              (@guidpagamento,@guidpagamento,@guidvenda,@guidcaixa,@guidentidade,@guidforma,@codforma,@descricao,@valorpago,@troco,@parcelas,GETDATE(),0)
          `);

        await request()
          .input("guidmov", sql.UniqueIdentifier, crypto.randomUUID())
          .input("guidlancamento", sql.UniqueIdentifier, guidLancamentoCaixa)
          .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
          .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("guidconta", sql.UniqueIdentifier, formaFinanceira.guidConta)
          .input("guidnatureza", sql.UniqueIdentifier, formaFinanceira.guidNatureza)
          .input("guidcentro", sql.UniqueIdentifier, formaFinanceira.guidCentro)
          .input("guidcontabancaria", sql.UniqueIdentifier, formaFinanceira.guidContaBancaria)
          .input("valor", sql.Decimal(18, 4), valorMovimento)
          .input("historico", sql.VarChar(255), `VENDA ${numeroVenda} - ${pagamento.descricaoFormaPagamento}`)
          .query(`
            INSERT INTO KS0005.KS_CAIXA_MOVIMENTO_ITEM
              (GUIDMOVIMENTOCAIXA,GUIDCAIXA,GUIDVENDA,GUIDENTIDADE,GUIDFORMAPAGAMENTO,GUIDLANCAMENTOCAIXA,
               GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,GUIDCONTABANCARIA,TIPO,VALOR,DATAHORA,HISTORICO,SINCRONIZADO)
            VALUES
              (@guidmov,@guidcaixa,@guidvenda,@guidentidade,@guidforma,@guidlancamento,
               @guidconta,@guidnatureza,@guidcentro,@guidcontabancaria,'VENDA',@valor,GETDATE(),@historico,0)
          `);

        await request()
          .input("guidlancamento", sql.UniqueIdentifier, guidLancamentoCaixa)
          .input("guidvenda", sql.UniqueIdentifier, input.guidVenda)
          .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
          .input("guidforma", sql.UniqueIdentifier, pagamento.guidFormaPagamento)
          .input("dtlancamento", sql.DateTime, new Date())
          .input("tipo", sql.Char(1), "E")
          .input("valor", sql.Decimal(15, 2), valorMovimento)
          .input("descricao", sql.NVarChar(200), `VENDA ${numeroVenda} - ${pagamento.descricaoFormaPagamento}`.toUpperCase())
          .input("guidconta", sql.UniqueIdentifier, formaFinanceira.guidContaBancaria)
          .input("guidnatureza", sql.UniqueIdentifier, formaFinanceira.guidNatureza)
          .input("guidcentro", sql.UniqueIdentifier, formaFinanceira.guidCentro)
          .input("numerodoc", sql.NVarChar(30), String(numeroVenda))
          .input("observacao", sql.NVarChar(500), `Venda ${numeroVenda} finalizada no caixa ${input.numeroCaixa}`)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query(`
            INSERT INTO KS0003.KS00010
              (GUIDLANCAMENTO,DTLANCAMENTO,TIPO,VALOR,DESCRICAO,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,NUMERODOC,OBSERVACAO,GUIDENTIDADE,GUIDVENDA,GUIDCAIXA,GUIDFORMAPAGAMENTO)
            VALUES
              (@guidlancamento,@dtlancamento,@tipo,@valor,@descricao,@guidconta,@guidnatureza,@guidcentro,@numerodoc,@observacao,@guidentidade,@guidvenda,@guidcaixa,@guidforma)
          `);

        await request()
          .input("valor", sql.Decimal(15, 2), valorMovimento)
          .input("guidconta", sql.UniqueIdentifier, formaFinanceira.guidContaBancaria)
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query("UPDATE KS0003.KS00008 SET SALDOATUAL=ISNULL(SALDOATUAL,0)+@valor, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      }

      await request()
        .input("totalvendas", sql.Decimal(18, 4), input.totais.totalLiquido)
        .input("guidcaixa", sql.UniqueIdentifier, input.guidCaixa)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0005.KS_CAIXA_MOVIMENTO SET TOTALVENDAS=ISNULL(TOTALVENDAS,0)+@totalvendas, ULTIMAALTERACAO=GETDATE(), SINCRONIZADO=0 WHERE GUIDCAIXA=@guidcaixa AND GUIDENTIDADE=@guidentidade AND SITUACAO='ABERTO'");

      await tx.commit();
      return {
        success: true,
        numeroVenda,
        dataHora: new Date().toISOString(),
        empresa: {
          nomeFantasia: session.nomeEmpresa ?? "",
          razaoSocial: session.nomeEmpresa ?? "",
          cnpj: session.entDocumento,
        },
      };
    } catch (error) {
      await tx.rollback();
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.",
      });
    }
  }),
});

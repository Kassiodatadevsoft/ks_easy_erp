import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  return await verifyKsSession(match?.[1]);
}

// Códigos fiscais SEFAZ (tMod pagamento NF-e)
export const CODIGOS_SEFAZ = [
  { codigo: "01", descricao: "Dinheiro" },
  { codigo: "02", descricao: "Cheque" },
  { codigo: "03", descricao: "Cartão de Crédito" },
  { codigo: "04", descricao: "Cartão de Débito" },
  { codigo: "05", descricao: "Crédito Loja" },
  { codigo: "10", descricao: "Vale Alimentação" },
  { codigo: "11", descricao: "Vale Refeição" },
  { codigo: "12", descricao: "Vale Presente" },
  { codigo: "13", descricao: "Vale Combustível" },
  { codigo: "15", descricao: "Boleto Bancário" },
  { codigo: "16", descricao: "Depósito Bancário" },
  { codigo: "17", descricao: "Pagamento Instantâneo (PIX)" },
  { codigo: "18", descricao: "Transferência bancária / Carteira Digital" },
  { codigo: "90", descricao: "Sem pagamento" },
];

const pagBase = z.object({
  pagamento:    z.string().min(1).max(100),
  descricao:    z.string().max(255).optional().nullable(),
  codigoSefaz: z.string().length(2, "Codigo fiscal SEFAZ obrigatorio"),
  guidConta:    z.string().uuid("Plano de contas obrigatorio"),
  guidNatureza: z.string().uuid("Natureza de caixa obrigatoria"),
  guidCentro:   z.string().uuid("Centro de custo obrigatorio"),
  guidContaBancaria: z.string().uuid("Conta bancaria obrigatoria"),
  integraTef:   z.boolean().default(false),
  codigoTef:    z.string().max(50).optional().nullable(),
  bandeiraTef:  z.string().max(50).optional().nullable(),
  aceitaTroco:  z.boolean().default(false),
  situacao:     z.enum(["A", "I"]).default("A"),
});

function descricaoFiscal(codigo: string) {
  return CODIGOS_SEFAZ.find((c) => c.codigo === codigo)?.descricao ?? "Sem pagamento";
}

async function garantirCamposVinculoFinanceiro(pool: Awaited<ReturnType<typeof getSqlPool>>) {
  const columns = [
    ["GUIDCONTA", "UNIQUEIDENTIFIER NULL"],
    ["GUIDNATUREZA", "UNIQUEIDENTIFIER NULL"],
    ["GUIDCENTRO", "UNIQUEIDENTIFIER NULL"],
    ["GUIDCONTABANCARIA", "UNIQUEIDENTIFIER NULL"],
  ] as const;
  for (const [column, definition] of columns) {
    await pool.request()
      .input("columnName", sql.NVarChar(128), column)
      .query(`
        IF COL_LENGTH('KS0003.KS00006', @columnName) IS NULL
          ALTER TABLE KS0003.KS00006 ADD ${column} ${definition}
      `);
  }

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.check_constraints
      WHERE name = 'CK_KS00006_GUIDCONTABANCARIA_OBRIGATORIA'
        AND parent_object_id = OBJECT_ID('KS0003.KS00006')
    )
    BEGIN
      ALTER TABLE KS0003.KS00006 WITH NOCHECK
      ADD CONSTRAINT CK_KS00006_GUIDCONTABANCARIA_OBRIGATORIA
      CHECK (GUIDCONTABANCARIA IS NOT NULL)
    END
  `);
}

export const formasPagamentoRouter = router({
  codigosSefaz: publicProcedure.query(() => CODIGOS_SEFAZ),

  listar: publicProcedure
    .input(z.object({ situacao: z.string().optional(), busca: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      await garantirCamposVinculoFinanceiro(pool);
      let where = "fp.GUIDENTIDADE = @guidentidade";
      if (input?.situacao) where += ` AND fp.SITUACAO = '${input.situacao}'`;
      if (input?.busca) where += ` AND fp.PAGAMENTO LIKE '%${input.busca.replace(/'/g, "''")}%'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
            fp.PAGAMENTO, fp.DESCRICAO, fp.CODFISCAL, fp.DESCRICAOFISCAL,
            COALESCE(fp.CODIGOSEFAZ, fp.CODFISCAL) AS CODIGOSEFAZ, fp.INTEGRATEF,
            CAST(fp.GUIDCONTA AS NVARCHAR(36)) AS guidConta,
            pc.CONTA AS nomeConta,
            CAST(fp.GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
            n.NATUREZA AS nomeNatureza,
            CAST(fp.GUIDCENTRO AS NVARCHAR(36)) AS guidCentro,
            cc.CENTRO AS nomeCentro,
            CAST(fp.GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria,
            cb.CONTA AS nomeContaBancaria,
            fp.CODIGOTEF, fp.BANDEIRATEF, fp.ACEITATROCO, fp.SITUACAO,
            fp.DATACADASTRO, fp.ULTIMAALTERACAO
          FROM KS0003.KS00006 fp
          LEFT JOIN KS0003.KS00001 pc ON pc.GUIDCONTA = fp.GUIDCONTA
          LEFT JOIN KS0003.KS00003 n ON n.GUIDNATUREZA = fp.GUIDNATUREZA
          LEFT JOIN KS0003.KS00002 cc ON cc.GUIDCENTRO = fp.GUIDCENTRO
          LEFT JOIN KS0003.KS00008 cb ON cb.GUIDCONTA = fp.GUIDCONTABANCARIA
          WHERE ${where}
          ORDER BY fp.PAGAMENTO
        `);
      return r.recordset;
    }),

  listarTodas: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) return [];
    const pool = await getSqlPool();
    await garantirCamposVinculoFinanceiro(pool);
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT
          CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
          CAST(NULL AS INT) AS CODFORMAPAGAMENTO,
          PAGAMENTO, COALESCE(CODIGOSEFAZ, CODFISCAL) AS CODIGOSEFAZ, INTEGRATEF, SITUACAO,
          CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta,
          CAST(GUIDNATUREZA AS NVARCHAR(36)) AS guidNatureza,
          CAST(GUIDCENTRO AS NVARCHAR(36)) AS guidCentro,
          CAST(GUIDCONTABANCARIA AS NVARCHAR(36)) AS guidContaBancaria
        FROM KS0003.KS00006
        WHERE GUIDENTIDADE=@guidentidade AND SITUACAO='A'
        ORDER BY PAGAMENTO
      `);
    return r.recordset;
  }),

  criar: publicProcedure.input(pagBase).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await garantirCamposVinculoFinanceiro(pool);
    const guid = crypto.randomUUID();
    await garantirCamposVinculoFinanceiro(pool);
    const codFiscal = input.codigoSefaz;
    const descFiscal = descricaoFiscal(codFiscal);
    await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, guid)
      .input("pagamento",     sql.NVarChar(100),    input.pagamento.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("codfiscal",     sql.Char(2),          codFiscal)
      .input("descricaofiscal", sql.NVarChar(100),  descFiscal)
      .input("codigosefaz",   sql.Char(2),          codFiscal)
      .input("guidconta",     sql.UniqueIdentifier, input.guidConta)
      .input("guidnatureza",  sql.UniqueIdentifier, input.guidNatureza)
      .input("guidcentro",    sql.UniqueIdentifier, input.guidCentro)
      .input("guidcontabancaria", sql.UniqueIdentifier, input.guidContaBancaria)
      .input("integratef",    sql.Bit,              input.integraTef ? 1 : 0)
      .input("codigotef",     sql.NVarChar(50),     input.codigoTef ?? null)
      .input("bandeiratef",   sql.NVarChar(50),     input.bandeiraTef ?? null)
      .input("aceitatroco",   sql.Bit,              input.aceitaTroco ? 1 : 0)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00006
          (GUIDPAGAMENTO,PAGAMENTO,DESCRICAO,CODFISCAL,DESCRICAOFISCAL,CODIGOSEFAZ,GUIDCONTA,GUIDNATUREZA,GUIDCENTRO,GUIDCONTABANCARIA,INTEGRATEF,CODIGOTEF,BANDEIRATEF,ACEITATROCO,SITUACAO,GUIDENTIDADE)
        VALUES
          (@guidpagamento,@pagamento,@descricao,@codfiscal,@descricaofiscal,@codigosefaz,@guidconta,@guidnatureza,@guidcentro,@guidcontabancaria,@integratef,@codigotef,@bandeiratef,@aceitatroco,@situacao,@guidentidade)
      `);
    return { success: true, guidPagamento: guid };
  }),

  atualizar: publicProcedure.input(pagBase.extend({ guidPagamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    const codFiscal = input.codigoSefaz;
    const descFiscal = descricaoFiscal(codFiscal);
    await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, input.guidPagamento)
      .input("pagamento",     sql.NVarChar(100),    input.pagamento.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("codfiscal",     sql.Char(2),          codFiscal)
      .input("descricaofiscal", sql.NVarChar(100),  descFiscal)
      .input("codigosefaz",   sql.Char(2),          codFiscal)
      .input("guidconta",     sql.UniqueIdentifier, input.guidConta)
      .input("guidnatureza",  sql.UniqueIdentifier, input.guidNatureza)
      .input("guidcentro",    sql.UniqueIdentifier, input.guidCentro)
      .input("guidcontabancaria", sql.UniqueIdentifier, input.guidContaBancaria)
      .input("integratef",    sql.Bit,              input.integraTef ? 1 : 0)
      .input("codigotef",     sql.NVarChar(50),     input.codigoTef ?? null)
      .input("bandeiratef",   sql.NVarChar(50),     input.bandeiraTef ?? null)
      .input("aceitatroco",   sql.Bit,              input.aceitaTroco ? 1 : 0)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00006 SET
          PAGAMENTO=@pagamento, DESCRICAO=@descricao, CODFISCAL=@codfiscal,
          DESCRICAOFISCAL=@descricaofiscal, CODIGOSEFAZ=@codigosefaz,
          GUIDCONTA=@guidconta, GUIDNATUREZA=@guidnatureza, GUIDCENTRO=@guidcentro,
          GUIDCONTABANCARIA=@guidcontabancaria,
          INTEGRATEF=@integratef, CODIGOTEF=@codigotef, BANDEIRATEF=@bandeiratef,
          ACEITATROCO=@aceitatroco, SITUACAO=@situacao, ULTIMAALTERACAO=GETDATE()
        WHERE GUIDPAGAMENTO=@guidpagamento AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),

  excluir: publicProcedure.input(z.object({ guidPagamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, input.guidPagamento)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00006 SET SITUACAO='I', ULTIMAALTERACAO=GETDATE()
        WHERE GUIDPAGAMENTO=@guidpagamento AND GUIDENTIDADE=@guidentidade
      `);
    return { success: true };
  }),
});

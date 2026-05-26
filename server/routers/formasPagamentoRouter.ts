import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
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
  codigoSefaz: z.string().max(2).optional().nullable(),
  integraTef:   z.boolean().default(false),
  codigoTef:    z.string().max(50).optional().nullable(),
  bandeiraTef:  z.string().max(50).optional().nullable(),
  aceitaTroco:  z.boolean().default(false),
  situacao:     z.enum(["A", "I"]).default("A"),
});

export const formasPagamentoRouter = router({
  codigosSefaz: publicProcedure.query(() => CODIGOS_SEFAZ),

  listar: publicProcedure
    .input(z.object({ situacao: z.string().optional(), busca: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) return [];
      const pool = await getSqlPool();
      let where = "GUIDENTIDADE = @guidentidade";
      if (input?.situacao) where += ` AND SITUACAO = '${input.situacao}'`;
      if (input?.busca) where += ` AND PAGAMENTO LIKE '%${input.busca.replace(/'/g, "''")}%'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento,
            PAGAMENTO, DESCRICAO, CODIGOSEFAZ, INTEGRATEF,
            CODIGOTEF, BANDEIRATEF, ACEITATROCO, SITUACAO,
            DATACADASTRO, ULTIMAALTERACAO
          FROM KS0003.KS00006
          WHERE ${where}
          ORDER BY PAGAMENTO
        `);
      return r.recordset;
    }),

  listarTodas: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) return [];
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(GUIDPAGAMENTO AS NVARCHAR(36)) AS guidPagamento, PAGAMENTO, CODIGOSEFAZ, INTEGRATEF
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
    const guid = crypto.randomUUID();
    await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, guid)
      .input("pagamento",     sql.NVarChar(100),    input.pagamento.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("codigosefaz",   sql.Char(2),          input.codigoSefaz ?? null)
      .input("integratef",    sql.Bit,              input.integraTef ? 1 : 0)
      .input("codigotef",     sql.NVarChar(50),     input.codigoTef ?? null)
      .input("bandeiratef",   sql.NVarChar(50),     input.bandeiraTef ?? null)
      .input("aceitatroco",   sql.Bit,              input.aceitaTroco ? 1 : 0)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        INSERT INTO KS0003.KS00006
          (GUIDPAGAMENTO,PAGAMENTO,DESCRICAO,CODIGOSEFAZ,INTEGRATEF,CODIGOTEF,BANDEIRATEF,ACEITATROCO,SITUACAO,GUIDENTIDADE)
        VALUES
          (@guidpagamento,@pagamento,@descricao,@codigosefaz,@integratef,@codigotef,@bandeiratef,@aceitatroco,@situacao,@guidentidade)
      `);
    return { success: true, guidPagamento: guid };
  }),

  atualizar: publicProcedure.input(pagBase.extend({ guidPagamento: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const session = await getKsSession(ctx.req);
    if (!session) throw new Error("Não autenticado");
    const pool = await getSqlPool();
    await pool.request()
      .input("guidpagamento", sql.UniqueIdentifier, input.guidPagamento)
      .input("pagamento",     sql.NVarChar(100),    input.pagamento.toUpperCase())
      .input("descricao",     sql.NVarChar(255),    input.descricao ?? null)
      .input("codigosefaz",   sql.Char(2),          input.codigoSefaz ?? null)
      .input("integratef",    sql.Bit,              input.integraTef ? 1 : 0)
      .input("codigotef",     sql.NVarChar(50),     input.codigoTef ?? null)
      .input("bandeiratef",   sql.NVarChar(50),     input.bandeiraTef ?? null)
      .input("aceitatroco",   sql.Bit,              input.aceitaTroco ? 1 : 0)
      .input("situacao",      sql.Char(1),          input.situacao)
      .input("guidentidade",  sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        UPDATE KS0003.KS00006 SET
          PAGAMENTO=@pagamento, DESCRICAO=@descricao, CODIGOSEFAZ=@codigosefaz,
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

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";
import { encryptSecret, garantirCamposBoletoContaBancaria } from "../services/boletos";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

const TIPO_CONTA = ["C", "P", "X", "O"] as const; // Corrente, Poupança, Caixa, Outro

const BOLETO_BANCOS = ["ITAU", "CORA"] as const;
const BOLETO_AMBIENTES = ["HOMOLOGACAO", "PRODUCAO"] as const;

const boletoConfigSchema = z.object({
  ativo: z.boolean().default(false),
  banco: z.enum(BOLETO_BANCOS).optional().nullable(),
  ambiente: z.enum(BOLETO_AMBIENTES).default("HOMOLOGACAO"),
  clientId: z.string().max(200).optional().nullable(),
  clientSecret: z.string().max(1000).optional().nullable(),
  apiUrl: z.string().max(300).optional().nullable(),
  tokenUrl: z.string().max(300).optional().nullable(),
  emitirPath: z.string().max(300).optional().nullable(),
  consultarPath: z.string().max(300).optional().nullable(),
  cancelarPath: z.string().max(300).optional().nullable(),
  carteira: z.string().max(50).optional().nullable(),
  convenio: z.string().max(80).optional().nullable(),
}).optional();

export const contasBancariasRouter = router({

  listar: publicProcedure
    .input(z.object({ situacao: z.enum(["A", "I", "todos"]).default("A") }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposBoletoContaBancaria(pool);
      const sit = input?.situacao ?? "A";
      const where = sit === "todos" ? "" : `AND SITUACAO = '${sit}'`;
      const r = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          SELECT
            CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta,
            CODCONTA, CONTA, BANCO, AGENCIA, NUMEROCONTA, TIPOCONTA,
            SALDOINICIAL, SALDOATUAL, SITUACAO,
            ISNULL(BOLETOATIVO, 0) AS BOLETOATIVO,
            BOLETOBANCO, BOLETOAMBIENTE, BOLETOCLIENTID,
            CASE WHEN BOLETOCLIENTSECRET IS NULL OR BOLETOCLIENTSECRET = '' THEN 0 ELSE 1 END AS BOLETOCLIENTSECRETCONFIGURADO,
            BOLETOAPIURL, BOLETOTOKENURL, BOLETOEMITIRPATH, BOLETOCONSULTARPATH,
            BOLETOCANCELARPATH, BOLETOCARTEIRA, BOLETOCONVENIO,
            DATACADASTRO, ULTIMAALTERACAO
          FROM KS0003.KS00008
          WHERE GUIDENTIDADE = @guidentidade ${where}
          ORDER BY CODCONTA
        `);
      return r.recordset;
    }),

  listarTodas: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req);
    const pool = await getSqlPool();
    const r = await pool.request()
      .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
      .query(`
        SELECT CAST(GUIDCONTA AS NVARCHAR(36)) AS guidConta, CODCONTA, CONTA, TIPOCONTA, SALDOATUAL
        FROM KS0003.KS00008
        WHERE GUIDENTIDADE = @guidentidade AND SITUACAO = 'A'
        ORDER BY CODCONTA
      `);
    return r.recordset;
  }),

  criar: publicProcedure
    .input(z.object({
      conta:       z.string().min(1).max(60),
      banco:       z.string().max(60).optional().nullable(),
      agencia:     z.string().max(20).optional().nullable(),
      numeroConta: z.string().max(30).optional().nullable(),
      tipoConta:   z.enum(TIPO_CONTA).default("C"),
      saldoInicial: z.number().default(0),
      situacao:    z.enum(["A", "I"]).default("A"),
      boleto: boletoConfigSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposBoletoContaBancaria(pool);
      const maxR = await pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT ISNULL(MAX(CODCONTA),0)+1 AS next FROM KS0003.KS00008 WHERE GUIDENTIDADE=@guidentidade");
      const cod = maxR.recordset[0]?.next ?? 1;
      const guid = crypto.randomUUID();
      await pool.request()
        .input("guidconta",    sql.UniqueIdentifier, guid)
        .input("codconta",     sql.Int,              cod)
        .input("conta",        sql.NVarChar(60),     input.conta.toUpperCase())
        .input("banco",        sql.NVarChar(60),     input.banco ?? null)
        .input("agencia",      sql.NVarChar(20),     input.agencia ?? null)
        .input("numeroconta",  sql.NVarChar(30),     input.numeroConta ?? null)
        .input("tipoconta",    sql.Char(1),          input.tipoConta)
        .input("saldoinicial", sql.Decimal(15,2),    input.saldoInicial)
        .input("saldoatual",   sql.Decimal(15,2),    input.saldoInicial)
        .input("situacao",     sql.Char(1),          input.situacao)
        .input("boletoativo",  sql.Bit,              input.boleto?.ativo ? 1 : 0)
        .input("boletobanco",  sql.NVarChar(20),     input.boleto?.banco ?? null)
        .input("boletoambiente", sql.NVarChar(20),   input.boleto?.ambiente ?? "HOMOLOGACAO")
        .input("boletoclientid", sql.NVarChar(200),  input.boleto?.clientId ?? null)
        .input("boletoclientsecret", sql.NVarChar(sql.MAX), encryptSecret(input.boleto?.clientSecret))
        .input("boletoapiurl", sql.NVarChar(300),    input.boleto?.apiUrl ?? null)
        .input("boletotokenurl", sql.NVarChar(300),  input.boleto?.tokenUrl ?? null)
        .input("boletoemitirpath", sql.NVarChar(300), input.boleto?.emitirPath ?? null)
        .input("boletoconsultarpath", sql.NVarChar(300), input.boleto?.consultarPath ?? null)
        .input("boletocancelarpath", sql.NVarChar(300), input.boleto?.cancelarPath ?? null)
        .input("boletocarteira", sql.NVarChar(50),   input.boleto?.carteira ?? null)
        .input("boletoconvenio", sql.NVarChar(80),   input.boleto?.convenio ?? null)
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00008
            (GUIDCONTA,CODCONTA,CONTA,BANCO,AGENCIA,NUMEROCONTA,TIPOCONTA,SALDOINICIAL,SALDOATUAL,SITUACAO,
             BOLETOATIVO,BOLETOBANCO,BOLETOAMBIENTE,BOLETOCLIENTID,BOLETOCLIENTSECRET,BOLETOAPIURL,BOLETOTOKENURL,
             BOLETOEMITIRPATH,BOLETOCONSULTARPATH,BOLETOCANCELARPATH,BOLETOCARTEIRA,BOLETOCONVENIO,GUIDENTIDADE)
          VALUES
            (@guidconta,@codconta,@conta,@banco,@agencia,@numeroconta,@tipoconta,@saldoinicial,@saldoatual,@situacao,
             @boletoativo,@boletobanco,@boletoambiente,@boletoclientid,@boletoclientsecret,@boletoapiurl,@boletotokenurl,
             @boletoemitirpath,@boletoconsultarpath,@boletocancelarpath,@boletocarteira,@boletoconvenio,@guidentidade)
        `);
      return { success: true, guidConta: guid };
    }),

  atualizar: publicProcedure
    .input(z.object({
      guidConta:   z.string().uuid(),
      conta:       z.string().min(1).max(60),
      banco:       z.string().max(60).optional().nullable(),
      agencia:     z.string().max(20).optional().nullable(),
      numeroConta: z.string().max(30).optional().nullable(),
      tipoConta:   z.enum(TIPO_CONTA).default("C"),
      situacao:    z.enum(["A", "I"]).default("A"),
      boleto: boletoConfigSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await garantirCamposBoletoContaBancaria(pool);
      const clientSecret = input.boleto?.clientSecret?.trim()
        ? encryptSecret(input.boleto.clientSecret)
        : undefined;
      await pool.request()
        .input("guidconta",   sql.UniqueIdentifier, input.guidConta)
        .input("conta",       sql.NVarChar(60),     input.conta.toUpperCase())
        .input("banco",       sql.NVarChar(60),     input.banco ?? null)
        .input("agencia",     sql.NVarChar(20),     input.agencia ?? null)
        .input("numeroconta", sql.NVarChar(30),     input.numeroConta ?? null)
        .input("tipoconta",   sql.Char(1),          input.tipoConta)
        .input("situacao",    sql.Char(1),          input.situacao)
        .input("boletoativo", sql.Bit,              input.boleto?.ativo ? 1 : 0)
        .input("boletobanco", sql.NVarChar(20),     input.boleto?.banco ?? null)
        .input("boletoambiente", sql.NVarChar(20),  input.boleto?.ambiente ?? "HOMOLOGACAO")
        .input("boletoclientid", sql.NVarChar(200), input.boleto?.clientId ?? null)
        .input("boletoclientsecret", sql.NVarChar(sql.MAX), clientSecret ?? null)
        .input("boletoapiurl", sql.NVarChar(300),   input.boleto?.apiUrl ?? null)
        .input("boletotokenurl", sql.NVarChar(300), input.boleto?.tokenUrl ?? null)
        .input("boletoemitirpath", sql.NVarChar(300), input.boleto?.emitirPath ?? null)
        .input("boletoconsultarpath", sql.NVarChar(300), input.boleto?.consultarPath ?? null)
        .input("boletocancelarpath", sql.NVarChar(300), input.boleto?.cancelarPath ?? null)
        .input("boletocarteira", sql.NVarChar(50),  input.boleto?.carteira ?? null)
        .input("boletoconvenio", sql.NVarChar(80),  input.boleto?.convenio ?? null)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00008 SET
            CONTA=@conta, BANCO=@banco, AGENCIA=@agencia, NUMEROCONTA=@numeroconta,
            TIPOCONTA=@tipoconta, SITUACAO=@situacao,
            BOLETOATIVO=@boletoativo, BOLETOBANCO=@boletobanco, BOLETOAMBIENTE=@boletoambiente,
            BOLETOCLIENTID=@boletoclientid,
            BOLETOCLIENTSECRET=CASE WHEN @boletoclientsecret IS NULL THEN BOLETOCLIENTSECRET ELSE @boletoclientsecret END,
            BOLETOAPIURL=@boletoapiurl, BOLETOTOKENURL=@boletotokenurl,
            BOLETOEMITIRPATH=@boletoemitirpath, BOLETOCONSULTARPATH=@boletoconsultarpath,
            BOLETOCANCELARPATH=@boletocancelarpath, BOLETOCARTEIRA=@boletocarteira,
            BOLETOCONVENIO=@boletoconvenio, ULTIMAALTERACAO=GETDATE()
          WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
        `);
      return { success: true };
    }),

  excluir: publicProcedure
    .input(z.object({ guidConta: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      await pool.request()
        .input("guidconta",   sql.UniqueIdentifier, input.guidConta)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00008 SET SITUACAO='I', ULTIMAALTERACAO=GETDATE()
          WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
        `);
      return { success: true };
    }),

  /** Recalcula SALDOATUAL somando lançamentos e transferências */
  recalcularSaldo: publicProcedure
    .input(z.object({ guidConta: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      // Saldo = SaldoInicial + Entradas - Saídas + TransfEntradas - TransfSaídas
      await pool.request()
        .input("guidconta",   sql.UniqueIdentifier, input.guidConta)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          UPDATE KS0003.KS00008 SET
            SALDOATUAL = SALDOINICIAL
              + ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00010 WHERE GUIDCONTA=@guidconta AND TIPO='E' AND GUIDENTIDADE=@guidentidade),0)
              - ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00010 WHERE GUIDCONTA=@guidconta AND TIPO='S' AND GUIDENTIDADE=@guidentidade),0)
              + ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00009 WHERE GUIDCONTADESTINO=@guidconta AND GUIDENTIDADE=@guidentidade),0)
              - ISNULL((SELECT SUM(VALOR) FROM KS0003.KS00009 WHERE GUIDCONTAORIGEM=@guidconta AND GUIDENTIDADE=@guidentidade),0),
            ULTIMAALTERACAO = GETDATE()
          WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade
        `);
      return { success: true };
    }),
});

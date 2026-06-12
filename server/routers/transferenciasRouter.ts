import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getSqlPool, sql } from "../sqlserver";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const session = await verifyKsSession(match?.[1]);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  return session;
}

export const transferenciasRouter = router({

  listar: publicProcedure
    .input(z.object({
      dtInicio:  z.string().optional(),
      dtFim:     z.string().optional(),
      guidConta: z.string().uuid().optional(),
      pagina:    z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();
      const pagina = input?.pagina ?? 1;
      const porPagina = input?.porPagina ?? 20;
      const offset = (pagina - 1) * porPagina;

      let where = "t.GUIDENTIDADE = @guidentidade";
      if (input?.dtInicio) where += " AND t.DTRANSFERENCIA >= @dtInicio";
      if (input?.dtFim)    where += " AND t.DTRANSFERENCIA <= @dtFim";
      if (input?.guidConta) where += " AND (t.GUIDCONTAORIGEM = @guidConta OR t.GUIDCONTADESTINO = @guidConta)";

      const req2 = pool.request()
        .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
        .input("offset",       sql.Int,              offset)
        .input("limit",        sql.Int,              porPagina);
      if (input?.dtInicio) req2.input("dtInicio", sql.NVarChar(10), input.dtInicio);
      if (input?.dtFim)    req2.input("dtFim",    sql.NVarChar(10), input.dtFim);
      if (input?.guidConta) req2.input("guidConta", sql.UniqueIdentifier, input.guidConta);

      const [rows, countR] = await Promise.all([
        req2.query(`
          SELECT
            CAST(t.GUIDTRANSFERENCIA AS NVARCHAR(36)) AS guidTransferencia,
            t.DTRANSFERENCIA, t.VALOR, t.DESCRICAO, t.OBSERVACAO,
            CAST(t.GUIDCONTAORIGEM  AS NVARCHAR(36)) AS guidContaOrigem,
            CAST(t.GUIDCONTADESTINO AS NVARCHAR(36)) AS guidContaDestino,
            co.CONTA AS nomeContaOrigem,
            cd.CONTA AS nomeContaDestino,
            t.DATACADASTRO
          FROM KS0003.KS00009 t
          LEFT JOIN KS0003.KS00008 co ON co.GUIDCONTA = t.GUIDCONTAORIGEM
          LEFT JOIN KS0003.KS00008 cd ON cd.GUIDCONTA = t.GUIDCONTADESTINO
          WHERE ${where}
          ORDER BY t.DTRANSFERENCIA DESC, t.DATACADASTRO DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
        pool.request()
          .input("guidentidade", sql.UniqueIdentifier, session.guidEntidade)
          .query(`SELECT COUNT(*) AS total FROM KS0003.KS00009 t WHERE ${where.replace("@dtInicio","'${input?.dtInicio??''}'").replace("@dtFim","'${input?.dtFim??''}'").replace("@guidConta","'${input?.guidConta??''}'")}`),
      ]);

      return {
        dados: rows.recordset,
        total: countR.recordset[0]?.total ?? 0,
        pagina,
        porPagina,
      };
    }),

  criar: publicProcedure
    .input(z.object({
      dtransferencia:   z.string().min(1),
      guidContaOrigem:  z.string().uuid(),
      guidContaDestino: z.string().uuid(),
      valor:            z.number().positive(),
      descricao:        z.string().max(200).optional().nullable(),
      observacao:       z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      if (input.guidContaOrigem === input.guidContaDestino) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de origem e destino não podem ser iguais." });
      }

      // Verificar saldo da conta de origem
      const saldoR = await pool.request()
        .input("guidconta",   sql.UniqueIdentifier, input.guidContaOrigem)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT SALDOATUAL FROM KS0003.KS00008 WHERE GUIDCONTA=@guidconta AND GUIDENTIDADE=@guidentidade");
      const saldoOrigem = saldoR.recordset[0]?.SALDOATUAL ?? 0;
      if (saldoOrigem < input.valor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Saldo insuficiente na conta de origem. Saldo atual: R$ ${saldoOrigem.toFixed(2)}` });
      }

      const guid = crypto.randomUUID();
      await pool.request()
        .input("guid",            sql.UniqueIdentifier, guid)
        .input("dtransferencia",  sql.NVarChar(10),             input.dtransferencia)
        .input("guidorigem",      sql.UniqueIdentifier, input.guidContaOrigem)
        .input("guiddestino",     sql.UniqueIdentifier, input.guidContaDestino)
        .input("valor",           sql.Decimal(15,2),    input.valor)
        .input("descricao",       sql.NVarChar(200),    input.descricao ?? null)
        .input("observacao",      sql.NVarChar(500),    input.observacao ?? null)
        .input("guidentidade",    sql.UniqueIdentifier, session.guidEntidade)
        .query(`
          INSERT INTO KS0003.KS00009
            (GUIDTRANSFERENCIA,DTRANSFERENCIA,GUIDCONTAORIGEM,GUIDCONTADESTINO,VALOR,DESCRICAO,OBSERVACAO,GUIDENTIDADE)
          VALUES
            (@guid,@dtransferencia,@guidorigem,@guiddestino,@valor,@descricao,@observacao,@guidentidade)
        `);

      // Atualizar saldos: debitar origem, creditar destino
      await pool.request()
        .input("valor",       sql.Decimal(15,2),    input.valor)
        .input("guidorigem",  sql.UniqueIdentifier, input.guidContaOrigem)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL-@valor, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidorigem AND GUIDENTIDADE=@guidentidade");
      await pool.request()
        .input("valor",       sql.Decimal(15,2),    input.valor)
        .input("guiddestino", sql.UniqueIdentifier, input.guidContaDestino)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@valor, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guiddestino AND GUIDENTIDADE=@guidentidade");

      return { success: true, guidTransferencia: guid };
    }),

  excluir: publicProcedure
    .input(z.object({ guidTransferencia: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const pool = await getSqlPool();

      // Buscar transferência para reverter saldos
      const tR = await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidTransferencia)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("SELECT GUIDCONTAORIGEM, GUIDCONTADESTINO, VALOR FROM KS0003.KS00009 WHERE GUIDTRANSFERENCIA=@guid AND GUIDENTIDADE=@guidentidade");
      const t = tR.recordset[0];
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Transferência não encontrada." });

      // Reverter saldos
      await pool.request()
        .input("valor",      sql.Decimal(15,2),    t.VALOR)
        .input("guidorigem", sql.UniqueIdentifier, t.GUIDCONTAORIGEM)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL+@valor, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guidorigem AND GUIDENTIDADE=@guidentidade");
      await pool.request()
        .input("valor",       sql.Decimal(15,2),    t.VALOR)
        .input("guiddestino", sql.UniqueIdentifier, t.GUIDCONTADESTINO)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("UPDATE KS0003.KS00008 SET SALDOATUAL=SALDOATUAL-@valor, ULTIMAALTERACAO=GETDATE() WHERE GUIDCONTA=@guiddestino AND GUIDENTIDADE=@guidentidade");

      // Excluir registro
      await pool.request()
        .input("guid",        sql.UniqueIdentifier, input.guidTransferencia)
        .input("guidentidade",sql.UniqueIdentifier, session.guidEntidade)
        .query("DELETE FROM KS0003.KS00009 WHERE GUIDTRANSFERENCIA=@guid AND GUIDENTIDADE=@guidentidade");

      return { success: true };
    }),
});

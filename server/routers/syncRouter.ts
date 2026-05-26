import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import { parse as parseCookieHeader } from "cookie";

const KS_SESSION_COOKIE = "ks_session";

async function getKsSession(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  return verifyKsSession(cookies[KS_SESSION_COOKIE]);
}

// ─── Autenticação Basic Auth para o Delphi offline ───────────────────────────
async function autenticarBasic(authHeader: string | undefined) {
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Token de autenticação ausente." });
  }
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  const sep = decoded.indexOf(":");
  const usuario = decoded.slice(0, sep).toUpperCase().trim();
  const senha = decoded.slice(sep + 1).toUpperCase().trim();
  if (!usuario || !senha) throw new TRPCError({ code: "UNAUTHORIZED", message: "Credenciais inválidas." });

  const rows = await querySql<{ GUIDPESSOA: string; GUIDENTIDADE: string; NOME: string }>(
    `SELECT TOP 1 GUIDPESSOA, GUIDENTIDADE, NOME
     FROM KS0002.KS00001
     WHERE UPPER(LTRIM(RTRIM(USUARIO))) = @USUARIO
       AND UPPER(LTRIM(RTRIM(SENHAPRAZO))) = @SENHA
       AND CADUSUARIO = 1 AND SITUACAO = 'A'`,
    {
      USUARIO: { type: sql.VarChar(15), value: usuario },
      SENHA: { type: sql.VarChar(25), value: senha },
    }
  );
  if (!rows || rows.length === 0) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos." });
  return rows[0];
}

/**
 * Router de sincronização entre o sistema Delphi legado e o novo React.
 * Todas as operações respeitam o isolamento por GUIDENTIDADE.
 */
export const syncRouter = router({
  /**
   * Sincronizar dados do servidor para o Delphi offline (Basic Auth).
   * O Delphi envia GUIDENTIDADE + ULTIMAALTERACAO e recebe os registros alterados.
   */
  baixar: publicProcedure
    .input(z.object({
      guidentidade: z.string().uuid(),
      ultimaAlteracao: z.string().optional(), // ISO 8601 — omitir para sync completa
    }))
    .query(async ({ input, ctx }) => {
      const session = await autenticarBasic((ctx.req as { headers: { authorization?: string } }).headers.authorization);
      if (session.GUIDENTIDADE !== input.guidentidade) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para sincronizar esta empresa." });
      }

      const dtFiltro = input.ultimaAlteracao ? new Date(input.ultimaAlteracao) : new Date(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: input.guidentidade },
        DT: { type: sql.DateTime, value: dtFiltro },
      };

      const [pessoas, cargos] = await Promise.all([
        querySql(
          `SELECT GUIDPESSOA, CODIGO, NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO,
             TELEFONE, CELULAR, WHATSAPP, EMAIL, IE, INDIEDEST, CRT, AMBIENTE,
             CEP, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CODCIDADE,
             SITUACAO, CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA,
             LIMITECOMPRA, DIAVENCIMENTO, COSEGMENTO, DATAADMISSAO, DATADEMISSAO,
             VALORNEGOCIADO, VALORSALARIO, MENSALIDADE, CODCARGO, USUARIO,
             DATACADASTRO, ULTIMAALTERACAO
           FROM KS0002.KS00001
           WHERE GUIDENTIDADE = @GUIDENTIDADE AND ULTIMAALTERACAO > @DT
           ORDER BY ULTIMAALTERACAO`, params),
        querySql(
          `SELECT GUIDCARGO, CODCARGO, CARGO, DESCONTOMAXIMO, CODTIPO,
             SITUACAO, ALTERARPRECOPRODUTO, CODPAINEL, COMISSAO, PDV,
             DATACADASTRO, ULTIMAALTERACAO
           FROM KS0000.KS00007
           WHERE GUIDENTIDADE = @GUIDENTIDADE AND ULTIMAALTERACAO > @DT
           ORDER BY ULTIMAALTERACAO`, params),
      ]);

      // Cidades só na sync completa (sem ultimaAlteracao)
      const cidades = !input.ultimaAlteracao
        ? await querySql(`SELECT CODCIDADE, CIDADE, UF FROM KS0000.KS00005 ORDER BY CODCIDADE`)
        : [];

      return {
        timestamp: new Date().toISOString(),
        guidentidade: input.guidentidade,
        ultimaAlteracao: dtFiltro.toISOString(),
        dados: { pessoas, cargos, cidades },
        totais: {
          pessoas: (pessoas as unknown[]).length,
          cargos: (cargos as unknown[]).length,
          cidades: (cidades as unknown[]).length,
        },
      };
    }),

  /**
   * Enviar dados do Delphi para o servidor (pessoas, cargos).
   * Realiza MERGE (INSERT ou UPDATE) por GUID para sincronização bidirecional.
   */
  enviar: publicProcedure
    .input(z.object({
      guidentidade: z.string().uuid(),
      tabela: z.enum(["pessoas", "cargos"]),
      registros: z.array(z.record(z.string(), z.unknown())),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await autenticarBasic((ctx.req as { headers: { authorization?: string } }).headers.authorization);
      if (session.GUIDENTIDADE !== input.guidentidade) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão." });
      }

      const pool = await (await import("../sqlserver")).getSqlPool();
      let processados = 0;
      let erros: string[] = [];

      if (input.tabela === "pessoas") {
        for (const reg of input.registros) {
          try {
            const r = reg as Record<string, unknown>;
            await pool.request()
              .input("GUIDPESSOA",      sql.UniqueIdentifier, r.GUIDPESSOA)
              .input("GUIDENTIDADE",    sql.UniqueIdentifier, input.guidentidade)
              .input("CODIGO",          sql.Int,              Number(r.CODIGO ?? 0))
              .input("NOME",            sql.VarChar(100),     String(r.NOME ?? "").toUpperCase())
              .input("FANTASIA",        sql.VarChar(60),      r.FANTASIA ? String(r.FANTASIA).toUpperCase() : null)
              .input("DOCUMENTO",       sql.VarChar(20),      String(r.DOCUMENTO ?? ""))
              .input("CODTIPODOCUMENTO",sql.Char(1),          String(r.CODTIPODOCUMENTO ?? "J"))
              .input("TELEFONE",        sql.VarChar(15),      r.TELEFONE ? String(r.TELEFONE) : null)
              .input("CELULAR",         sql.VarChar(15),      r.CELULAR ? String(r.CELULAR) : null)
              .input("EMAIL",           sql.VarChar(100),     r.EMAIL ? String(r.EMAIL) : null)
              .input("SITUACAO",        sql.Char(1),          String(r.SITUACAO ?? "A"))
              .input("CADCLIENTE",      sql.TinyInt,          r.CADCLIENTE ? 1 : 0)
              .input("CADFORNECEDOR",   sql.TinyInt,          r.CADFORNECEDOR ? 1 : 0)
              .input("CADUSUARIO",      sql.TinyInt,          r.CADUSUARIO ? 1 : 0)
              .input("CADTRANSPORTADORA",sql.TinyInt,         r.CADTRANSPORTADORA ? 1 : 0)
              .input("CADEMPRESA",      sql.TinyInt,          r.CADEMPRESA ? 1 : 0)
              .input("ULTIMAALTERACAO", sql.DateTime,         r.ULTIMAALTERACAO ? new Date(String(r.ULTIMAALTERACAO)) : new Date())
              .query(`
                MERGE KS0002.KS00001 AS tgt
                USING (SELECT @GUIDPESSOA AS GUIDPESSOA) AS src ON tgt.GUIDPESSOA = src.GUIDPESSOA
                WHEN MATCHED AND tgt.GUIDENTIDADE = @GUIDENTIDADE THEN
                  UPDATE SET
                    NOME=@NOME, FANTASIA=@FANTASIA, DOCUMENTO=@DOCUMENTO,
                    CODTIPODOCUMENTO=@CODTIPODOCUMENTO, TELEFONE=@TELEFONE,
                    CELULAR=@CELULAR, EMAIL=@EMAIL, SITUACAO=@SITUACAO,
                    CADCLIENTE=@CADCLIENTE, CADFORNECEDOR=@CADFORNECEDOR,
                    CADUSUARIO=@CADUSUARIO, CADTRANSPORTADORA=@CADTRANSPORTADORA,
                    CADEMPRESA=@CADEMPRESA, ULTIMAALTERACAO=@ULTIMAALTERACAO
                WHEN NOT MATCHED THEN
                  INSERT (GUIDPESSOA,GUIDENTIDADE,CODIGO,NOME,FANTASIA,DOCUMENTO,
                    CODTIPODOCUMENTO,TELEFONE,CELULAR,EMAIL,SITUACAO,
                    CADCLIENTE,CADFORNECEDOR,CADUSUARIO,CADTRANSPORTADORA,CADEMPRESA,
                    MANTERPROMOCOES,CONSTASPC,LIMITECOMPRA,DIAVENCIMENTO,CODLOCALIDADE,
                    PRECIFICACAO,CODENTIDADE,CODVENDEDOR,ORGANIZACIONAL,GRADE,
                    CADCADASTRO,MATRICULA,QUANTIDADE,COD_BAIRRO,ALIQUOTA,CREDITOCSOSN,
                    MARGEMPADRAO,CODCARGO,ATUALIZARPRECOS,INDIEDEST,CRT,AMBIENTE,
                    ALIQUOTAPIS,ALIQUOTACOFINS,JUROMENSAL,BANCO,
                    DATACADASTRO,ULTIMAALTERACAO,ULTIMOACESSO)
                  VALUES (@GUIDPESSOA,@GUIDENTIDADE,@CODIGO,@NOME,@FANTASIA,@DOCUMENTO,
                    @CODTIPODOCUMENTO,@TELEFONE,@CELULAR,@EMAIL,@SITUACAO,
                    @CADCLIENTE,@CADFORNECEDOR,@CADUSUARIO,@CADTRANSPORTADORA,@CADEMPRESA,
                    1,0,0,0,0,'R',@CODIGO,0,0,0,0,0,0,0,0,0,0,0,1,9,1,0,0,0,0,0,
                    GETDATE(),@ULTIMAALTERACAO,GETDATE());
              `);
            processados++;
          } catch (e) {
            erros.push(String((e as Error).message ?? e));
          }
        }
      } else if (input.tabela === "cargos") {
        for (const reg of input.registros) {
          try {
            const r = reg as Record<string, unknown>;
            await pool.request()
              .input("GUIDCARGO",     sql.UniqueIdentifier, r.GUIDCARGO)
              .input("GUIDENTIDADE",  sql.UniqueIdentifier, input.guidentidade)
              .input("CODCARGO",      sql.VarChar(10),      String(r.CODCARGO ?? "").toUpperCase())
              .input("CARGO",         sql.VarChar(60),      String(r.CARGO ?? "").toUpperCase())
              .input("SITUACAO",      sql.Char(1),          String(r.SITUACAO ?? "A"))
              .input("ULTIMAALTERACAO",sql.DateTime,        r.ULTIMAALTERACAO ? new Date(String(r.ULTIMAALTERACAO)) : new Date())
              .query(`
                MERGE KS0000.KS00007 AS tgt
                USING (SELECT @GUIDCARGO AS GUIDCARGO) AS src ON tgt.GUIDCARGO = src.GUIDCARGO
                WHEN MATCHED AND tgt.GUIDENTIDADE = @GUIDENTIDADE THEN
                  UPDATE SET CARGO=@CARGO, CODCARGO=@CODCARGO, SITUACAO=@SITUACAO, ULTIMAALTERACAO=@ULTIMAALTERACAO
                WHEN NOT MATCHED THEN
                  INSERT (GUIDCARGO,GUIDENTIDADE,CODCARGO,CARGO,SITUACAO,DESCONTOMAXIMO,CODTIPO,ALTERARPRECOPRODUTO,CODPAINEL,COMISSAO,PDV,DATACADASTRO,ULTIMAALTERACAO)
                  VALUES (@GUIDCARGO,@GUIDENTIDADE,@CODCARGO,@CARGO,@SITUACAO,0,1,0,0,0,0,GETDATE(),@ULTIMAALTERACAO);
              `);
            processados++;
          } catch (e) {
            erros.push(String((e as Error).message ?? e));
          }
        }
      }

      return {
        success: erros.length === 0,
        tabela: input.tabela,
        recebidos: input.registros.length,
        processados,
        erros: erros.slice(0, 10), // Limitar a 10 erros no retorno
        timestamp: new Date().toISOString(),
      };
    }),

  /**
   * Status da sincronização — usado pelo Delphi para verificar conectividade.
   */
  status: publicProcedure.query(async ({ ctx }) => {
    const session = await getKsSession(ctx.req.headers.cookie);
    if (!session) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
    }
    return {
      online: true,
      timestamp: new Date().toISOString(),
      guidEntidade: session.guidEntidade,
      empresa: session.nomeEmpresa,
    };
  }),

  /**
   * Lista entidades modificadas após uma data — para sincronização incremental.
   */
  entidadesModificadas: publicProcedure
    .input(
      z.object({
        desde: z.string().datetime().optional(),
        limite: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req.headers.cookie);
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
      }

      const desdeFilter = input.desde
        ? `AND ULTIMAALTERACAO >= @DESDE`
        : "";

      const params: Record<string, { type: unknown; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        LIMITE: { type: sql.Int, value: input.limite },
      };

      if (input.desde) {
        params.DESDE = { type: sql.DateTime, value: new Date(input.desde) };
      }

      const rows = await querySql(
        `SELECT TOP (@LIMITE)
           GUIDPESSOA, NOME, FANTASIA, DOCUMENTO, SITUACAO,
           CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA,
           ULTIMAALTERACAO
         FROM KS0002.KS00001
         WHERE GUIDENTIDADE = @GUIDENTIDADE
           ${desdeFilter}
         ORDER BY ULTIMAALTERACAO DESC`,
        params as Parameters<typeof querySql>[1]
      );

      return {
        total: rows.length,
        ultimaConsulta: new Date().toISOString(),
        dados: rows,
      };
    }),
});

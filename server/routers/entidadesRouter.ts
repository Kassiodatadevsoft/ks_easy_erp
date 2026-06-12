import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

const KS_SESSION_COOKIE = COOKIE_NAME;

/**
 * Middleware que extrai e valida a sessão KS do cookie.
 * Retorna o KsSessionUser com o GUIDENTIDADE da empresa.
 */
async function getKsSession(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[KS_SESSION_COOKIE];
  return verifyKsSession(token);
}

export interface EntidadeRow {
  GUIDPESSOA: string;
  NOME: string;
  FANTASIA: string | null;
  DOCUMENTO: string;
  CODTIPODOCUMENTO: string;
  TELEFONE: string | null;
  CELULAR: string | null;
  EMAIL: string | null;
  SITUACAO: string;
  CADCLIENTE: boolean;
  CADFORNECEDOR: boolean;
  CADUSUARIO: boolean;
  CADTRANSPORTADORA: boolean | null;
  CADEMPRESA: boolean | null;
  ULTIMAALTERACAO: Date;
  DATACADASTRO: Date;
}

export const entidadesRouter = router({
  /**
   * Lista entidades filtradas pelo GUIDENTIDADE da empresa logada.
   * Suporta filtro por tipo (cliente, fornecedor, funcionario, transportadora, empresa).
   */
  list: publicProcedure
    .input(
      z.object({
        tipo: z
          .enum(["todos", "cliente", "fornecedor", "funcionario", "transportadora", "empresa"])
          .default("todos"),
        situacao: z.enum(["A", "I", "todos"]).default("A"),
        busca: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req.headers.cookie);
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
      }

      const { tipo, situacao, busca, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      // Filtro por tipo de entidade
      const tipoFilter: string[] = [];
      if (tipo === "cliente") tipoFilter.push("CADCLIENTE = 1");
      if (tipo === "fornecedor") tipoFilter.push("CADFORNECEDOR = 1");
      if (tipo === "funcionario") tipoFilter.push("CADUSUARIO = 1");
      if (tipo === "transportadora") tipoFilter.push("CADTRANSPORTADORA = 1");
      if (tipo === "empresa") tipoFilter.push("CADEMPRESA = 1");

      // Filtro por situação
      const situacaoFilter =
        situacao === "todos" ? "" : `AND SITUACAO = '${situacao}'`;

      // Filtro por busca
      const buscaFilter = busca
        ? `AND (NOME LIKE @BUSCA OR DOCUMENTO LIKE @BUSCA OR FANTASIA LIKE @BUSCA)`
        : "";

      const tipoWhere =
        tipoFilter.length > 0 ? `AND (${tipoFilter.join(" OR ")})` : "";

      const query = `
        SELECT
          GUIDPESSOA, NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO,
          TELEFONE, CELULAR, EMAIL, SITUACAO,
          CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA, CADEMPRESA,
          ULTIMAALTERACAO, DATACADASTRO
        FROM KS0002.KS00001
        WHERE GUIDENTIDADE = @GUIDENTIDADE
          ${situacaoFilter}
          ${tipoWhere}
          ${buscaFilter}
        ORDER BY NOME
        OFFSET @OFFSET ROWS FETCH NEXT @PAGESIZE ROWS ONLY
      `;

      const countQuery = `
        SELECT COUNT(*) AS TOTAL
        FROM KS0002.KS00001
        WHERE GUIDENTIDADE = @GUIDENTIDADE
          ${situacaoFilter}
          ${tipoWhere}
          ${buscaFilter}
      `;

      const params: Record<string, { type: unknown; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        OFFSET: { type: sql.Int, value: offset },
        PAGESIZE: { type: sql.Int, value: pageSize },
      };

      if (busca) {
        params.BUSCA = { type: sql.VarChar(150), value: `%${busca}%` };
      }

      const [rows, countRows] = await Promise.all([
        querySql<EntidadeRow>(query, params as Parameters<typeof querySql>[1]),
        querySql<{ TOTAL: number }>(countQuery, params as Parameters<typeof querySql>[1]),
      ]);

      return {
        data: rows,
        total: countRows[0]?.TOTAL ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((countRows[0]?.TOTAL ?? 0) / pageSize),
      };
    }),

  /**
   * Busca uma entidade pelo GUIDPESSOA, validando que pertence à empresa logada.
   */
  getById: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req.headers.cookie);
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
      }

      const rows = await querySql<EntidadeRow>(
        `SELECT * FROM KS0002.KS00001
         WHERE GUIDPESSOA = @GUID AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entidade não encontrada" });
      }

      return rows[0];
    }),
});

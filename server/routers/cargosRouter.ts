import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import { COOKIE_NAME } from "@shared/const";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(
  new RegExp(`${COOKIE_NAME}=([^;]+)`)
);
  const token = match?.[1];
  const session = await verifyKsSession(token);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
  }
  return session;
}

// Opções fixas de CODPAINEL
export const PAINEIS = [
  { value: 267, label: "Padrão Cadastro" },
  { value: 268, label: "Padrão" },
  { value: 2501, label: "Financeiro" },
] as const;

// Opções fixas de CODTIPO
export const TIPOS_CARGO = [
  { value: 0, label: "CEO (Chief Executive)" },
  { value: 1, label: "Padrão" },
  { value: 2, label: "Gerente" },
] as const;

export const cargosRouter = router({
  /** Listar cargos filtrados por GUIDENTIDADE da sessão */
  listar: publicProcedure
    .input(z.object({
      busca: z.string().optional(),
      situacao: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const offset = (input.page - 1) * input.pageSize;

      const whereParts: string[] = [
        "GUIDENTIDADE = @GUIDENTIDADE",
      ];
      if (input.situacao && input.situacao !== "") {
        whereParts.push("SITUACAO = @SITUACAO");
      }
      if (input.busca?.trim()) {
        whereParts.push("CARGO LIKE @BUSCA");
      }
      const where = whereParts.join(" AND ");

      const params: Record<string, { type: sql.ISqlTypeFactory; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        OFFSET: { type: sql.Int, value: offset },
        PAGESIZE: { type: sql.Int, value: input.pageSize },
      };
      if (input.situacao && input.situacao !== "") {
        params.SITUACAO = { type: sql.Char(1), value: input.situacao };
      }
      if (input.busca?.trim()) {
        params.BUSCA = { type: sql.VarChar(100), value: `%${input.busca.trim()}%` };
      }

      const rows = await querySql<{
        CODCARGO: number; CARGO: string; CODTIPO: number; SITUACAO: string;
        DESCONTOMAXIMO: number; COMISSAO: number | null; PDV: boolean | null;
        ALTERARPRECOPRODUTO: boolean; CODPAINEL: number | null; GUIDCARGO: string;
      }>(
        `SELECT CODCARGO, CARGO, CODTIPO, SITUACAO, DESCONTOMAXIMO, COMISSAO,
                PDV, ALTERARPRECOPRODUTO, CODPAINEL, GUIDCARGO
         FROM KS0000.KS00007
         WHERE ${where}
         ORDER BY CARGO ASC
         OFFSET @OFFSET ROWS FETCH NEXT @PAGESIZE ROWS ONLY`,
        params
      );

      const countParams: Record<string, { type: sql.ISqlTypeFactory; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
      };
      if (input.situacao && input.situacao !== "") {
        countParams.SITUACAO = { type: sql.Char(1), value: input.situacao };
      }
      if (input.busca?.trim()) {
        countParams.BUSCA = { type: sql.VarChar(100), value: `%${input.busca.trim()}%` };
      }
      const countRows = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00007 WHERE ${where}`,
        countParams
      );
      const total = countRows?.[0]?.TOTAL ?? 0;

      return { rows: rows ?? [], total, page: input.page, pageSize: input.pageSize };
    }),

  /** Buscar cargo por GUIDCARGO */
  buscarPorGuid: publicProcedure
    .input(z.object({ guidCargo: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<Record<string, unknown>>(
        `SELECT CODCARGO, CARGO, CODTIPO, SITUACAO, DESCONTOMAXIMO, COMISSAO,
                PDV, ALTERARPRECOPRODUTO, CODPAINEL, GUIDCARGO
         FROM KS0000.KS00007
         WHERE GUIDCARGO = @GUIDCARGO AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUIDCARGO: { type: sql.UniqueIdentifier, value: input.guidCargo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Cargo não encontrado." });
      return rows[0];
    }),

  /** Validar nome duplicado dentro da mesma empresa */
  validarNome: publicProcedure
    .input(z.object({
      cargo: z.string().min(1),
      guidCargoExcluir: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<{ GUIDCARGO: string; CARGO: string }>(
        `SELECT TOP 1 GUIDCARGO, CARGO
         FROM KS0000.KS00007
         WHERE UPPER(LTRIM(RTRIM(CARGO))) = UPPER(LTRIM(RTRIM(@CARGO)))
           AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          CARGO: { type: sql.VarChar(80), value: input.cargo.trim() },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0) return { disponivel: true };
      const found = rows[0];
      if (input.guidCargoExcluir && found.GUIDCARGO === input.guidCargoExcluir) return { disponivel: true };
      return { disponivel: false, cargo: found.CARGO };
    }),

  /** Criar novo cargo */
  criar: publicProcedure
    .input(z.object({
      cargo: z.string().min(1).max(80),
      codTipo: z.number().int().min(0).max(2),
      situacao: z.enum(["A", "I"]).default("A"),
      descontoMaximo: z.number().min(0).max(100).default(0),
      comissao: z.number().min(0).max(100).optional(),
      pdv: z.boolean().default(false),
      alterarPreco: z.boolean().default(false),
      codPainel: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Verificar duplicidade
      const dup = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00007
         WHERE UPPER(LTRIM(RTRIM(CARGO))) = UPPER(LTRIM(RTRIM(@CARGO)))
           AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          CARGO: { type: sql.VarChar(80), value: input.cargo.trim() },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if ((dup?.[0]?.TOTAL ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe um cargo com o nome "${input.cargo}".` });
      }

      // Próximo CODCARGO global (PK é global na tabela, não por empresa)
      const maxRows = await querySql<{ MAXCOD: number | null }>(
        `SELECT MAX(CODCARGO) AS MAXCOD FROM KS0000.KS00007`,
        {}
      );
      const nextCod = (maxRows?.[0]?.MAXCOD ?? 0) + 1;

      await querySql(
        `INSERT INTO KS0000.KS00007
           (CODCARGO, CARGO, CODTIPO, SITUACAO, DESCONTOMAXIMO, COMISSAO,
            PDV, ALTERARPRECOPRODUTO, CODPAINEL, GUIDENTIDADE,
            DATACADASTRO, ULTIMAALTERACAO)
         VALUES
           (@CODCARGO, @CARGO, @CODTIPO, @SITUACAO, @DESCONTOMAXIMO, @COMISSAO,
            @PDV, @ALTERARPRECOPRODUTO, @CODPAINEL, @GUIDENTIDADE,
            GETDATE(), GETDATE())`,
        {
          CODCARGO: { type: sql.Int, value: nextCod },
          CARGO: { type: sql.VarChar(80), value: input.cargo.trim() },
          CODTIPO: { type: sql.Int, value: input.codTipo },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          DESCONTOMAXIMO: { type: sql.Numeric(18, 2), value: input.descontoMaximo },
          COMISSAO: { type: sql.Numeric(10, 2), value: input.comissao ?? null },
          PDV: { type: sql.Bit, value: input.pdv ? 1 : 0 },
          ALTERARPRECOPRODUTO: { type: sql.Bit, value: input.alterarPreco ? 1 : 0 },
          CODPAINEL: { type: sql.Int, value: input.codPainel ?? null },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      return { success: true, codigo: nextCod };
    }),

  /** Atualizar cargo existente */
  atualizar: publicProcedure
    .input(z.object({
      guidCargo: z.string(),
      cargo: z.string().min(1).max(80),
      codTipo: z.number().int().min(0).max(2),
      situacao: z.enum(["A", "I"]),
      descontoMaximo: z.number().min(0).max(100),
      comissao: z.number().min(0).max(100).optional(),
      pdv: z.boolean(),
      alterarPreco: z.boolean(),
      codPainel: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Verificar duplicidade (excluindo o próprio registro)
      const dup = await querySql<{ GUIDCARGO: string }>(
        `SELECT TOP 1 GUIDCARGO FROM KS0000.KS00007
         WHERE UPPER(LTRIM(RTRIM(CARGO))) = UPPER(LTRIM(RTRIM(@CARGO)))
           AND GUIDENTIDADE = @GUIDENTIDADE
           AND GUIDCARGO <> @GUIDCARGO`,
        {
          CARGO: { type: sql.VarChar(80), value: input.cargo.trim() },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          GUIDCARGO: { type: sql.UniqueIdentifier, value: input.guidCargo },
        }
      );
      if (dup && dup.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Já existe outro cargo com o nome "${input.cargo}".` });
      }

      await querySql(
        `UPDATE KS0000.KS00007
         SET CARGO = @CARGO,
             CODTIPO = @CODTIPO,
             SITUACAO = @SITUACAO,
             DESCONTOMAXIMO = @DESCONTOMAXIMO,
             COMISSAO = @COMISSAO,
             PDV = @PDV,
             ALTERARPRECOPRODUTO = @ALTERARPRECOPRODUTO,
             CODPAINEL = @CODPAINEL,
             ULTIMAALTERACAO = GETDATE()
         WHERE GUIDCARGO = @GUIDCARGO AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          CARGO: { type: sql.VarChar(80), value: input.cargo.trim() },
          CODTIPO: { type: sql.Int, value: input.codTipo },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          DESCONTOMAXIMO: { type: sql.Numeric(18, 2), value: input.descontoMaximo },
          COMISSAO: { type: sql.Numeric(10, 2), value: input.comissao ?? null },
          PDV: { type: sql.Bit, value: input.pdv ? 1 : 0 },
          ALTERARPRECOPRODUTO: { type: sql.Bit, value: input.alterarPreco ? 1 : 0 },
          CODPAINEL: { type: sql.Int, value: input.codPainel ?? null },
          GUIDCARGO: { type: sql.UniqueIdentifier, value: input.guidCargo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      return { success: true };
    }),

  /** Excluir cargo (soft delete: SITUACAO = 'I') */
  excluir: publicProcedure
    .input(z.object({ guidCargo: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      await querySql(
        `UPDATE KS0000.KS00007
         SET SITUACAO = 'I', ULTIMAALTERACAO = GETDATE()
         WHERE GUIDCARGO = @GUIDCARGO AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUIDCARGO: { type: sql.UniqueIdentifier, value: input.guidCargo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      return { success: true };
    }),
});

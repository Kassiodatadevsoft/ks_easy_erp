import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  const token = match?.[1];
  const session = await verifyKsSession(token);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida. Faça login novamente." });
  }
  return session;
}

export const funcionariosRouter = router({
  /**
   * Listar funcionários da empresa logada (CADUSUARIO = 1)
   */
  listar: publicProcedure
    .input(z.object({
      busca: z.string().optional(),
      situacao: z.string().optional(),
      pagina: z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const { busca, situacao, pagina, porPagina } = input;
      const offset = (pagina - 1) * porPagina;

      let where = `WHERE c.CADUSUARIO = 1 AND c.GUIDENTIDADE = @GUIDENTIDADE`;
      const params: Record<string, { type: unknown; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        OFFSET: { type: sql.Int, value: offset },
        LIMIT: { type: sql.Int, value: porPagina },
      };

      if (situacao && situacao !== "all") {
        where += ` AND c.SITUACAO = @SITUACAO`;
        params.SITUACAO = { type: sql.Char(1), value: situacao };
      }
      if (busca && busca.trim() !== "") {
        where += ` AND (c.NOME LIKE @BUSCA OR c.DOCUMENTO LIKE @BUSCA OR c.USUARIO LIKE @BUSCA)`;
        params.BUSCA = { type: sql.VarChar(200), value: `%${busca.trim().toUpperCase()}%` };
      }

      const countQuery = `SELECT COUNT(*) AS total FROM KS0002.KS00001 c ${where}`;
      const dataQuery = `
        SELECT
          c.GUIDPESSOA, c.CODIGO, c.NOME, c.FANTASIA, c.DOCUMENTO,
          c.CODTIPODOCUMENTO, c.TELEFONE, c.CELULAR, c.EMAIL,
          c.SITUACAO, c.DATACADASTRO, c.ULTIMAALTERACAO,
          c.CADUSUARIO, c.USUARIO, c.CODCARGO,
          car.CARGO AS NOMECARGO,
          cid.CIDADE, cid.UF
        FROM KS0002.KS00001 c
        LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
        LEFT JOIN KS0000.KS00007 car ON car.CODCARGO = c.CODCARGO AND car.GUIDENTIDADE = c.GUIDENTIDADE
        ${where}
        ORDER BY c.NOME
        OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [countResult, rows] = await Promise.all([
        querySql<{ total: number }>(countQuery, params as any),
        querySql(dataQuery, params as any),
      ]);

      return {
        dados: rows,
        total: countResult[0]?.total ?? 0,
        pagina,
        porPagina,
        totalPaginas: Math.ceil((countResult[0]?.total ?? 0) / porPagina),
      };
    }),

  /**
   * Buscar funcionário pelo GUIDPESSOA
   */
  buscarPorGuid: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql(
        `SELECT c.*, cid.CIDADE, cid.UF, cid.CIDADE + '-' + cid.UF AS DESCCIDADE,
                car.CARGO AS NOMECARGO
         FROM KS0002.KS00001 c
         LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
         LEFT JOIN KS0000.KS00007 car ON car.CODCARGO = c.CODCARGO AND car.GUIDENTIDADE = c.GUIDENTIDADE
         WHERE c.GUIDPESSOA = @GUID AND c.GUIDENTIDADE = @GUIDENTIDADE AND c.CADUSUARIO = 1`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado." });
      }
      return rows[0];
    }),

  /**
   * Buscar cidades
   */
  buscarCidades: publicProcedure
    .input(z.object({
      nome: z.string().optional(),
      codCidade: z.number().optional(),
    }))
    .query(async ({ input }) => {
      let where = "";
      const params: Record<string, { type: unknown; value: unknown }> = {};
      if (input.nome && input.nome.trim() !== "") {
        where = `WHERE CIDADE LIKE @CIDADE`;
        params.CIDADE = { type: sql.VarChar(100), value: `%${input.nome.trim().toUpperCase()}%` };
      } else if (input.codCidade) {
        where = `WHERE CODCIDADE = @CODCIDADE`;
        params.CODCIDADE = { type: sql.Int, value: input.codCidade };
      } else {
        return [];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return querySql(
        `SELECT TOP 20 CODCIDADE, CIDADE, UF, CIDADE + '-' + UF AS DESCCIDADE
         FROM KS0000.KS00005 ${where} ORDER BY CIDADE`,
        params as any
      );
    }),

  /**
   * Listar cargos ativos para o select do formulário
   */
  listarCargos: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);
      return querySql(
        `SELECT CODCARGO, CARGO, GUIDCARGO
         FROM KS0000.KS00007
         WHERE GUIDENTIDADE = @GUIDENTIDADE AND SITUACAO = 'A'
         ORDER BY CARGO`,
        { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
      );
    }),

  /**
   * Validar documento
   */
  validarDocumento: publicProcedure
    .input(z.object({
      documento: z.string(),
      guidPessoaExcluir: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const docLimpo = input.documento.replace(/\D/g, "");
      const rows = await querySql<{ GUIDPESSOA: string; CODIGO: number; NOME: string }>(
        `SELECT TOP 1 GUIDPESSOA, CODIGO, NOME
         FROM KS0002.KS00001
         WHERE REPLACE(REPLACE(REPLACE(DOCUMENTO,'.',''),'-',''),'/','') = @DOC
           AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          DOC: { type: sql.VarChar(20), value: docLimpo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0) return { existe: false };
      const found = rows[0];
      if (input.guidPessoaExcluir && found.GUIDPESSOA === input.guidPessoaExcluir) return { existe: false };
      return { existe: true, codigo: found.CODIGO, nome: found.NOME };
    }),

  /**
   * Validar usuário — unicidade GLOBAL (multiempresa)
   * Busca em TODA a tabela KS0002.KS00001 sem filtro de GUIDENTIDADE
   */
  validarUsuario: publicProcedure
    .input(z.object({
      usuario: z.string(),
      guidPessoaExcluir: z.string().optional(),
    }))
    .query(async ({ input }) => {
      if (!input.usuario.trim()) return { disponivel: true };
      const rows = await querySql<{ GUIDPESSOA: string; NOME: string; DOCUMENTO: string }>(
        `SELECT TOP 1 GUIDPESSOA, NOME, DOCUMENTO
         FROM KS0002.KS00001
         WHERE UPPER(LTRIM(RTRIM(USUARIO))) = @USUARIO
           AND CADUSUARIO = 1`,
        { USUARIO: { type: sql.VarChar(15), value: input.usuario.trim().toUpperCase() } }
      );
      if (!rows || rows.length === 0) return { disponivel: true };
      const found = rows[0];
      if (input.guidPessoaExcluir && found.GUIDPESSOA === input.guidPessoaExcluir) return { disponivel: true };
      return { disponivel: false, nome: found.NOME };
    }),

  /**
   * Criar funcionário — CADUSUARIO = 1 fixo
   */
  criar: publicProcedure
    .input(z.object({
      nome: z.string().min(1),
      fantasia: z.string().optional(),
      documento: z.string().min(1),
      codTipoDocumento: z.enum(["F", "J"]),
      telefone: z.string().optional(),
      celular: z.string().min(11),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      ie: z.string().optional(),
      indIeDest: z.number().default(9),
      dataNascimento: z.string().optional(),
      cep: z.string().min(8),
      endereco: z.string().min(1),
      numero: z.string().min(1),
      complemento: z.string().optional(),
      bairro: z.string().min(1),
      codCidade: z.number(),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      observacao: z.string().optional(),
      // Cargo — obrigatório
      codCargo: z.number({ message: "Cargo é obrigatório" }),
      // Acesso ao sistema
      usuario: z.string().min(1, "Usuário é obrigatório").max(15),
      senha: z.string().min(4, "Senha deve ter pelo menos 4 caracteres").max(25),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Validar usuário único globalmente
      const dupUsuario = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0002.KS00001
         WHERE UPPER(LTRIM(RTRIM(USUARIO))) = @USUARIO AND CADUSUARIO = 1`,
        { USUARIO: { type: sql.VarChar(15), value: input.usuario.trim().toUpperCase() } }
      );
      if ((dupUsuario?.[0]?.TOTAL ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Usuário "${input.usuario}" já está em uso em outra empresa.` });
      }

      // Validar senha não pode ser igual ao usuário
      if (input.senha.toUpperCase() === input.usuario.toUpperCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha não pode ser igual ao usuário." });
      }

      const maxCod = await querySql<{ maxCod: number }>(
        `SELECT ISNULL(MAX(CODIGO), 0) + 1 AS maxCod FROM KS0002.KS00001 WHERE GUIDENTIDADE = @GUIDENTIDADE`,
        { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
      );
      const novoCodigo = maxCod[0]?.maxCod ?? 1;

      await querySql(
        `INSERT INTO KS0002.KS00001 (
          CODIGO, GUIDPESSOA, GUIDENTIDADE,
          NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO,
          TELEFONE, CELULAR, WHATSAPP, EMAIL,
          IE, INDIEDEST, DATANASCIMENTO,
          CEP, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CODCIDADE,
          SITUACAO, CADUSUARIO, CADFORNECEDOR, CADCLIENTE, CADEMPRESA,
          MANTERPROMOCOES, CONSTASPC, OBSERVACAO,
          USUARIO, SENHAPRAZO, CODCARGO,
          DATACADASTRO, ULTIMAALTERACAO, ULTIMOACESSO,
          CODVENDEDOR, CODENTIDADE,
          CRT, ORGANIZACIONAL, GRADE, CADCADASTRO, MATRICULA,
          QUANTIDADE, COD_BAIRRO, ALIQUOTAPIS, ALIQUOTACOFINS,
          CODLOCALIDADE, PRECIFICACAO, ATUALIZARPRECOS,
          ALIQUOTA, CREDITOCSOSN, JUROMENSAL, MARGEMPADRAO
        ) VALUES (
          @CODIGO, NEWID(), @GUIDENTIDADE,
          @NOME, @FANTASIA, @DOCUMENTO, @CODTIPODOCUMENTO,
          @TELEFONE, @CELULAR, @WHATSAPP, @EMAIL,
          @IE, @INDIEDEST, @DATANASCIMENTO,
          @CEP, @ENDERECO, @NUMERO, @COMPLEMENTO, @BAIRRO, @CODCIDADE,
          @SITUACAO, 1, 0, 0, 0,
          0, 0, @OBSERVACAO,
          @USUARIO, @SENHA, @CODCARGO,
          GETDATE(), GETDATE(), GETDATE(),
          0, 0,
          1, 0, 0, 0, 0,
          0, 0, 0, 0,
          0, 'R', 1,
          0, 0, 0, 0
        )`,
        {
          CODIGO: { type: sql.Int, value: novoCodigo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          NOME: { type: sql.VarChar(100), value: input.nome.toUpperCase() },
          FANTASIA: { type: sql.VarChar(60), value: (input.fantasia ?? null) ? input.fantasia!.toUpperCase() : null },
          DOCUMENTO: { type: sql.VarChar(20), value: input.documento },
          CODTIPODOCUMENTO: { type: sql.Char(1), value: input.codTipoDocumento },
          TELEFONE: { type: sql.VarChar(15), value: input.telefone ?? null },
          CELULAR: { type: sql.VarChar(15), value: input.celular },
          WHATSAPP: { type: sql.VarChar(15), value: input.whatsapp ?? null },
          EMAIL: { type: sql.VarChar(100), value: input.email?.toLowerCase() ?? null },
          IE: { type: sql.VarChar(20), value: input.ie ?? null },
          INDIEDEST: { type: sql.Int, value: input.indIeDest },
          DATANASCIMENTO: { type: sql.Date, value: input.dataNascimento ?? null },
          CEP: { type: sql.VarChar(10), value: input.cep },
          ENDERECO: { type: sql.VarChar(60), value: input.endereco.toUpperCase() },
          NUMERO: { type: sql.VarChar(10), value: input.numero },
          COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento?.toUpperCase() ?? null },
          BAIRRO: { type: sql.VarChar(40), value: input.bairro.toUpperCase() },
          CODCIDADE: { type: sql.Int, value: input.codCidade },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao?.toUpperCase() ?? null },
          USUARIO: { type: sql.VarChar(15), value: input.usuario.toUpperCase() },
          SENHA: { type: sql.VarChar(25), value: input.senha.toUpperCase() },
          CODCARGO: { type: sql.Int, value: input.codCargo },
        }
      );
      return { success: true, codigo: novoCodigo };
    }),

  /**
   * Atualizar funcionário
   */
  atualizar: publicProcedure
    .input(z.object({
      guidPessoa: z.string().uuid(),
      nome: z.string().min(1),
      fantasia: z.string().optional(),
      documento: z.string().min(1),
      codTipoDocumento: z.enum(["F", "J"]),
      telefone: z.string().optional(),
      celular: z.string().min(11),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      ie: z.string().optional(),
      indIeDest: z.number().default(9),
      dataNascimento: z.string().optional(),
      cep: z.string().min(8),
      endereco: z.string().min(1),
      numero: z.string().min(1),
      complemento: z.string().optional(),
      bairro: z.string().min(1),
      codCidade: z.number(),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      observacao: z.string().optional(),
      codCargo: z.number({ message: "Cargo é obrigatório" }),
      usuario: z.string().min(1).max(15),
      senha: z.string().optional(), // opcional no update — só atualiza se preenchida
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Validar usuário único globalmente (excluindo o próprio registro)
      const dupUsuario = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0002.KS00001
         WHERE UPPER(LTRIM(RTRIM(USUARIO))) = @USUARIO
           AND CADUSUARIO = 1
           AND GUIDPESSOA <> @GUID`,
        {
          USUARIO: { type: sql.VarChar(15), value: input.usuario.trim().toUpperCase() },
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
        }
      );
      if ((dupUsuario?.[0]?.TOTAL ?? 0) > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Usuário "${input.usuario}" já está em uso em outra empresa.` });
      }

      // Validar senha não pode ser igual ao usuário (se fornecida)
      if (input.senha && input.senha.toUpperCase() === input.usuario.toUpperCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha não pode ser igual ao usuário." });
      }

      const senhaClause = input.senha ? `, SENHAPRAZO = @SENHA` : "";
      const params: Record<string, { type: unknown; value: unknown }> = {
        GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        NOME: { type: sql.VarChar(100), value: input.nome.toUpperCase() },
        FANTASIA: { type: sql.VarChar(60), value: (input.fantasia ?? null) ? input.fantasia!.toUpperCase() : null },
        DOCUMENTO: { type: sql.VarChar(20), value: input.documento },
        CODTIPODOCUMENTO: { type: sql.Char(1), value: input.codTipoDocumento },
        TELEFONE: { type: sql.VarChar(15), value: input.telefone ?? null },
        CELULAR: { type: sql.VarChar(15), value: input.celular },
        WHATSAPP: { type: sql.VarChar(15), value: input.whatsapp ?? null },
        EMAIL: { type: sql.VarChar(100), value: input.email?.toLowerCase() ?? null },
        IE: { type: sql.VarChar(20), value: input.ie ?? null },
        INDIEDEST: { type: sql.Int, value: input.indIeDest },
        DATANASCIMENTO: { type: sql.Date, value: input.dataNascimento ?? null },
        CEP: { type: sql.VarChar(10), value: input.cep },
        ENDERECO: { type: sql.VarChar(60), value: input.endereco.toUpperCase() },
        NUMERO: { type: sql.VarChar(10), value: input.numero },
        COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento?.toUpperCase() ?? null },
        BAIRRO: { type: sql.VarChar(40), value: input.bairro.toUpperCase() },
        CODCIDADE: { type: sql.Int, value: input.codCidade },
        SITUACAO: { type: sql.Char(1), value: input.situacao },
        OBSERVACAO: { type: sql.VarChar(500), value: input.observacao?.toUpperCase() ?? null },
        USUARIO: { type: sql.VarChar(15), value: input.usuario.toUpperCase() },
        CODCARGO: { type: sql.Int, value: input.codCargo },
      };
      if (input.senha) {
        params.SENHA = { type: sql.VarChar(25), value: input.senha.toUpperCase() };
      }

      await querySql(
        `UPDATE KS0002.KS00001 SET
          NOME = @NOME, FANTASIA = @FANTASIA, DOCUMENTO = @DOCUMENTO,
          CODTIPODOCUMENTO = @CODTIPODOCUMENTO,
          TELEFONE = @TELEFONE, CELULAR = @CELULAR, WHATSAPP = @WHATSAPP,
          EMAIL = @EMAIL, IE = @IE, INDIEDEST = @INDIEDEST,
          DATANASCIMENTO = @DATANASCIMENTO,
          CEP = @CEP, ENDERECO = @ENDERECO, NUMERO = @NUMERO,
          COMPLEMENTO = @COMPLEMENTO, BAIRRO = @BAIRRO, CODCIDADE = @CODCIDADE,
          SITUACAO = @SITUACAO, OBSERVACAO = @OBSERVACAO,
          USUARIO = @USUARIO, CODCARGO = @CODCARGO
          ${senhaClause},
          ULTIMAALTERACAO = GETDATE()
        WHERE GUIDPESSOA = @GUID AND GUIDENTIDADE = @GUIDENTIDADE`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any
      );
      return { success: true };
    }),
});

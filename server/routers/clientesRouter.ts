import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";

// Helper para extrair sessão KS do cookie
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

export const clientesRouter = router({

  /**
   * Listar clientes da empresa logada com filtros e paginação
   */
  listar: publicProcedure
    .input(z.object({
      busca: z.string().optional(),
      situacao: z.enum(["A", "I", "B"]).optional(),
      pagina: z.number().min(1).default(1),
      porPagina: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const { busca, situacao, pagina, porPagina } = input;
      const offset = (pagina - 1) * porPagina;

      let where = `WHERE c.CADCLIENTE = 1 AND c.GUIDENTIDADE = @GUIDENTIDADE`;
      const params: Record<string, { type: unknown; value: unknown }> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        OFFSET: { type: sql.Int, value: offset },
        LIMIT: { type: sql.Int, value: porPagina },
      };

      if (situacao) {
        where += ` AND c.SITUACAO = @SITUACAO`;
        params.SITUACAO = { type: sql.Char(1), value: situacao };
      } else {
        where += ` AND c.SITUACAO IN ('A','I','B')`;
      }

      if (busca && busca.trim() !== "") {
        where += ` AND (
          c.NOME LIKE @BUSCA OR
          c.FANTASIA LIKE @BUSCA OR
          c.DOCUMENTO LIKE @BUSCA OR
          c.TELEFONE LIKE @BUSCA OR
          c.CELULAR LIKE @BUSCA
        )`;
        params.BUSCA = { type: sql.VarChar(200), value: `%${busca.trim()}%` };
      }

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM KS0002.KS00001 c
        ${where}
      `;

      const dataQuery = `
        SELECT
          c.GUIDPESSOA, c.CODIGO, c.NOME, c.FANTASIA, c.DOCUMENTO,
          c.CODTIPODOCUMENTO, c.TELEFONE, c.CELULAR, c.EMAIL,
          c.SITUACAO, c.DATACADASTRO, c.ULTIMAALTERACAO,
          c.CADCLIENTE, c.CADFORNECEDOR, c.CADUSUARIO,
          cid.CIDADE, cid.UF
        FROM KS0002.KS00001 c
        LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
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
   * Buscar um cliente pelo GUIDPESSOA
   */
  buscarPorGuid: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      const rows = await querySql(
        `SELECT c.*, cid.CIDADE, cid.UF, cid.CIDADE + '-' + cid.UF AS DESCCIDADE
         FROM KS0002.KS00001 c
         LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
         WHERE c.GUIDPESSOA = @GUID AND c.GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );

      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      }
      return rows[0];
    }),

  /**
   * Buscar cidades da tabela KS0000.KS00005
   */
  buscarCidades: publicProcedure
    .input(z.object({
      nome: z.string().optional(),
      codCidade: z.number().optional(),
      codIbge: z.string().optional(),
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
      } else if (input.codIbge) {
        where = `WHERE CODIBGE = @CODIBGE`;
        params.CODIBGE = { type: sql.VarChar(20), value: input.codIbge };
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
   * Validar se documento já está cadastrado
   */
  validarDocumento: publicProcedure
    .input(z.object({
      documento: z.string(),
      guidPessoaExcluir: z.string().optional(), // para edição: excluir o próprio registro
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
      if (input.guidPessoaExcluir && found.GUIDPESSOA === input.guidPessoaExcluir) {
        return { existe: false };
      }

      return { existe: true, codigo: found.CODIGO, nome: found.NOME };
    }),

  /**
   * Criar novo cliente
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
      // Endereço
      cep: z.string().min(8),
      endereco: z.string().min(1),
      numero: z.string().min(1),
      complemento: z.string().optional(),
      bairro: z.string().min(1),
      codCidade: z.number(),
      // Financeiro
      limiteCompra: z.number().default(0),
      diaVencimento: z.number().default(0),
      // Flags
      situacao: z.enum(["A", "I", "B"]).default("A"),
      manterPromocoes: z.boolean().default(false),
      cadUsuario: z.boolean().default(false),
      cadFornecedor: z.boolean().default(false),
      constaSpc: z.boolean().default(false),
      // Observação
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Gerar próximo CODIGO
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
          LIMITECOMPRA, DIAVENCIMENTO,
          SITUACAO, CADCLIENTE, MANTERPROMOCOES,
          CADUSUARIO, CADFORNECEDOR, CONSTASPC,
          OBSERVACAO,
          DATACADASTRO, ULTIMAALTERACAO, ULTIMOACESSO,
          CODVENDEDOR, CODENTIDADE,
          CRT, ORGANIZACIONAL, GRADE, CADCADASTRO, MATRICULA,
          QUANTIDADE, COD_BAIRRO, ALIQUOTAPIS, ALIQUOTACOFINS,
          CODLOCALIDADE, PRECIFICACAO, ATUALIZARPRECOS,
          ALIQUOTA, CREDITOCSOSN, JUROMENSAL, MARGEMPADRAO, CODCARGO
        ) VALUES (
          @CODIGO, NEWID(), @GUIDENTIDADE,
          @NOME, @FANTASIA, @DOCUMENTO, @CODTIPODOCUMENTO,
          @TELEFONE, @CELULAR, @WHATSAPP, @EMAIL,
          @IE, @INDIEDEST, @DATANASCIMENTO,
          @CEP, @ENDERECO, @NUMERO, @COMPLEMENTO, @BAIRRO, @CODCIDADE,
          @LIMITECOMPRA, @DIAVENCIMENTO,
          @SITUACAO, 1, @MANTERPROMOCOES,
          @CADUSUARIO, @CADFORNECEDOR, @CONSTASPC,
          @OBSERVACAO,
          GETDATE(), GETDATE(), GETDATE(),
          0, 0,
          1, 0, 0, 0, 0,
          0, 0, 0, 0,
          0, 'R', 1,
          0, 0, 0, 0, 0
        )`,
        {
          CODIGO: { type: sql.Int, value: novoCodigo },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          NOME: { type: sql.VarChar(100), value: input.nome },
          FANTASIA: { type: sql.VarChar(60), value: input.fantasia ?? null },
          DOCUMENTO: { type: sql.VarChar(20), value: input.documento },
          CODTIPODOCUMENTO: { type: sql.Char(1), value: input.codTipoDocumento },
          TELEFONE: { type: sql.VarChar(15), value: input.telefone ?? null },
          CELULAR: { type: sql.VarChar(15), value: input.celular },
          WHATSAPP: { type: sql.VarChar(15), value: input.whatsapp ?? null },
          EMAIL: { type: sql.VarChar(100), value: input.email ?? null },
          IE: { type: sql.VarChar(20), value: input.ie ?? null },
          INDIEDEST: { type: sql.Int, value: input.indIeDest },
          DATANASCIMENTO: { type: sql.Date, value: input.dataNascimento ?? null },
          CEP: { type: sql.VarChar(10), value: input.cep },
          ENDERECO: { type: sql.VarChar(60), value: input.endereco },
          NUMERO: { type: sql.VarChar(10), value: input.numero },
          COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento ?? null },
          BAIRRO: { type: sql.VarChar(40), value: input.bairro },
          CODCIDADE: { type: sql.Int, value: input.codCidade },
          LIMITECOMPRA: { type: sql.Numeric(18, 2), value: input.limiteCompra },
          DIAVENCIMENTO: { type: sql.Int, value: input.diaVencimento },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          MANTERPROMOCOES: { type: sql.Bit, value: input.manterPromocoes },
          CADUSUARIO: { type: sql.Bit, value: input.cadUsuario },
          CADFORNECEDOR: { type: sql.Bit, value: input.cadFornecedor },
          CONSTASPC: { type: sql.Bit, value: input.constaSpc },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
        }
      );

      return { success: true, codigo: novoCodigo };
    }),

  /**
   * Atualizar cliente existente
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
      limiteCompra: z.number().default(0),
      diaVencimento: z.number().default(0),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      manterPromocoes: z.boolean().default(false),
      cadUsuario: z.boolean().default(false),
      cadFornecedor: z.boolean().default(false),
      constaSpc: z.boolean().default(false),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      await querySql(
        `UPDATE KS0002.KS00001 SET
          NOME = @NOME, FANTASIA = @FANTASIA, DOCUMENTO = @DOCUMENTO,
          CODTIPODOCUMENTO = @CODTIPODOCUMENTO,
          TELEFONE = @TELEFONE, CELULAR = @CELULAR, WHATSAPP = @WHATSAPP,
          EMAIL = @EMAIL, IE = @IE, INDIEDEST = @INDIEDEST,
          DATANASCIMENTO = @DATANASCIMENTO,
          CEP = @CEP, ENDERECO = @ENDERECO, NUMERO = @NUMERO,
          COMPLEMENTO = @COMPLEMENTO, BAIRRO = @BAIRRO, CODCIDADE = @CODCIDADE,
          LIMITECOMPRA = @LIMITECOMPRA, DIAVENCIMENTO = @DIAVENCIMENTO,
          SITUACAO = @SITUACAO, MANTERPROMOCOES = @MANTERPROMOCOES,
          CADUSUARIO = @CADUSUARIO, CADFORNECEDOR = @CADFORNECEDOR,
          CONSTASPC = @CONSTASPC, OBSERVACAO = @OBSERVACAO,
          ULTIMAALTERACAO = GETDATE()
        WHERE GUIDPESSOA = @GUID AND GUIDENTIDADE = @GUIDENTIDADE`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
          NOME: { type: sql.VarChar(100), value: input.nome },
          FANTASIA: { type: sql.VarChar(60), value: input.fantasia ?? null },
          DOCUMENTO: { type: sql.VarChar(20), value: input.documento },
          CODTIPODOCUMENTO: { type: sql.Char(1), value: input.codTipoDocumento },
          TELEFONE: { type: sql.VarChar(15), value: input.telefone ?? null },
          CELULAR: { type: sql.VarChar(15), value: input.celular },
          WHATSAPP: { type: sql.VarChar(15), value: input.whatsapp ?? null },
          EMAIL: { type: sql.VarChar(100), value: input.email ?? null },
          IE: { type: sql.VarChar(20), value: input.ie ?? null },
          INDIEDEST: { type: sql.Int, value: input.indIeDest },
          DATANASCIMENTO: { type: sql.Date, value: input.dataNascimento ?? null },
          CEP: { type: sql.VarChar(10), value: input.cep },
          ENDERECO: { type: sql.VarChar(60), value: input.endereco },
          NUMERO: { type: sql.VarChar(10), value: input.numero },
          COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento ?? null },
          BAIRRO: { type: sql.VarChar(40), value: input.bairro },
          CODCIDADE: { type: sql.Int, value: input.codCidade },
          LIMITECOMPRA: { type: sql.Numeric(18, 2), value: input.limiteCompra },
          DIAVENCIMENTO: { type: sql.Int, value: input.diaVencimento },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          MANTERPROMOCOES: { type: sql.Bit, value: input.manterPromocoes },
          CADUSUARIO: { type: sql.Bit, value: input.cadUsuario },
          CADFORNECEDOR: { type: sql.Bit, value: input.cadFornecedor },
          CONSTASPC: { type: sql.Bit, value: input.constaSpc },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
        }
      );

      return { success: true };
    }),
});

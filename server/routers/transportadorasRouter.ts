import { TRPCError } from "@trpc/server";
import { z } from "zod";
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

export const transportadorasRouter = router({
  /**
   * Listar transportadoras da empresa logada (CADTRANSPORTADORA = 1)
   */
  listar: publicProcedure
    .input(z.object({
      pagina: z.number().default(1),
      porPagina: z.number().default(20),
      busca: z.string().optional(),
      situacao: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const offset = (input.pagina - 1) * input.porPagina;

      let where = `WHERE c.CADTRANSPORTADORA = 1 AND c.GUIDENTIDADE = @GUIDENTIDADE`;
      const params: Record<string, unknown> = {
        GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        OFFSET: { type: sql.Int, value: offset },
        LIMIT: { type: sql.Int, value: input.porPagina },
      };

      if (input.busca) {
        where += ` AND (c.NOME LIKE @BUSCA OR c.DOCUMENTO LIKE @BUSCA OR c.FANTASIA LIKE @BUSCA)`;
        params.BUSCA = { type: sql.VarChar(100), value: `%${input.busca}%` };
      }
      if (input.situacao && input.situacao !== "all") {
        where += ` AND c.SITUACAO = @SITUACAO`;
        params.SITUACAO = { type: sql.Char(1), value: input.situacao };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await querySql<{
        CODPESSOA: number; GUIDPESSOA: string; NOME: string; FANTASIA: string | null;
        DOCUMENTO: string; TELEFONE: string | null; CELULAR: string | null;
        EMAIL: string | null; CIDADE: string | null; UF: string | null;
        SITUACAO: string; CADCLIENTE: boolean; CADFORNECEDOR: boolean;
      }>(
        `SELECT c.CODPESSOA, c.GUIDPESSOA, c.NOME, c.FANTASIA, c.DOCUMENTO,
                c.TELEFONE, c.CELULAR, c.EMAIL, c.SITUACAO,
                c.CADCLIENTE, c.CADFORNECEDOR,
                ci.CIDADE, ci.UF
         FROM KS0002.KS00001 c
         LEFT JOIN KS0000.KS00005 ci ON ci.CODCIDADE = c.CODCIDADE
         ${where}
         ORDER BY c.NOME
         OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any
      );

      const countRows = await querySql<{ TOTAL: number }>(
        `SELECT COUNT(*) AS TOTAL FROM KS0002.KS00001 c ${where}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params as any
      );

      return {
        items: rows ?? [],
        total: countRows?.[0]?.TOTAL ?? 0,
        pagina: input.pagina,
        porPagina: input.porPagina,
      };
    }),

  /**
   * Buscar transportadora por GUID para edição
   */
  buscarPorGuid: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<Record<string, unknown>>(
        `SELECT c.*, ci.CIDADE, ci.UF
         FROM KS0002.KS00001 c
         LEFT JOIN KS0000.KS00005 ci ON ci.CODCIDADE = c.CODCIDADE
         WHERE c.GUIDPESSOA = @GUID AND c.GUIDENTIDADE = @GUIDENTIDADE AND c.CADTRANSPORTADORA = 1`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "Transportadora não encontrada." });

      const d = rows[0];
      const toDate = (v: unknown) => v ? new Date(v as string).toISOString().slice(0, 10) : "";

      return {
        ...d,
        DATAADMISSAO: toDate(d.DATAADMISSAO),
        DATANASCIMENTO: toDate(d.DATANASCIMENTO),
      };
    }),

  /**
   * Buscar cidades para autocomplete
   */
  buscarCidades: publicProcedure
    .input(z.object({ busca: z.string().min(2) }))
    .query(async ({ input }) => {
      const rows = await querySql<{ CODCIDADE: number; CIDADE: string; UF: string }>(
        `SELECT TOP 15 CODCIDADE, CIDADE, UF FROM KS0000.KS00005
         WHERE CIDADE LIKE @BUSCA ORDER BY CIDADE`,
        { BUSCA: { type: sql.VarChar(100), value: `%${input.busca}%` } }
      );
      return rows ?? [];
    }),

  /**
   * Validar duplicidade de documento
   */
  validarDocumento: publicProcedure
    .input(z.object({
      documento: z.string(),
      guidPessoaAtual: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const rows = await querySql<{ GUIDPESSOA: string; NOME: string }>(
        `SELECT TOP 1 GUIDPESSOA, NOME FROM KS0002.KS00001
         WHERE DOCUMENTO = @DOCUMENTO AND GUIDENTIDADE = @GUIDENTIDADE AND CADTRANSPORTADORA = 1`,
        {
          DOCUMENTO: { type: sql.VarChar(20), value: input.documento },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      if (!rows || rows.length === 0) return { duplicado: false };
      if (input.guidPessoaAtual && rows[0].GUIDPESSOA === input.guidPessoaAtual) return { duplicado: false };
      return { duplicado: true, nome: rows[0].NOME };
    }),

  /**
   * Criar nova transportadora
   */
  criar: publicProcedure
    .input(z.object({
      nome: z.string().min(1, "Nome obrigatório"),
      fantasia: z.string().optional(),
      documento: z.string().min(1, "Documento obrigatório"),
      codTipoDocumento: z.enum(["F", "J"]),
      telefone: z.string().optional(),
      celular: z.string().min(11, "Celular obrigatório"),
      whatsapp: z.string().optional(),
      email: z.string().optional(),
      ie: z.string().optional(),
      indIeDest: z.number().default(9),
      dataNascimento: z.string().optional(),
      cep: z.string().min(8, "CEP obrigatório"),
      endereco: z.string().min(1, "Endereço obrigatório"),
      numero: z.string().min(1, "Número obrigatório"),
      complemento: z.string().optional(),
      bairro: z.string().min(1, "Bairro obrigatório"),
      codCidade: z.number({ message: "Cidade obrigatória" }),
      limiteCompra: z.number().default(0),
      diaVencimento: z.number().default(0),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      manterPromocoes: z.boolean().default(false),
      cadCliente: z.boolean().default(false),
      cadFornecedor: z.boolean().default(false),
      constaSpc: z.boolean().default(false),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Gerar próximo CODPESSOA
      const maxRows = await querySql<{ MAXCOD: number }>(
        `SELECT ISNULL(MAX(CODPESSOA), 0) + 1 AS MAXCOD FROM KS0002.KS00001`,
        {}
      );
      const novoCodigo = maxRows?.[0]?.MAXCOD ?? 1;

      await querySql(
        `INSERT INTO KS0002.KS00001 (
          CODPESSOA, GUIDPESSOA, GUIDENTIDADE,
          NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO,
          TELEFONE, CELULAR, WHATSAPP, EMAIL, IE, INDIEDEST,
          DATANASCIMENTO, CEP, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CODCIDADE,
          LIMITECOMPRA, DIAVENCIMENTO, SITUACAO, MANTERPROMOCOES,
          CADTRANSPORTADORA, CADCLIENTE, CADFORNECEDOR, CONSTASPC, OBSERVACAO,
          DATACADASTRO, ULTIMAALTERACAO
        ) VALUES (
          @CODPESSOA, NEWID(), @GUIDENTIDADE,
          @NOME, @FANTASIA, @DOCUMENTO, @CODTIPODOCUMENTO,
          @TELEFONE, @CELULAR, @WHATSAPP, @EMAIL, @IE, @INDIEDEST,
          @DATANASCIMENTO, @CEP, @ENDERECO, @NUMERO, @COMPLEMENTO, @BAIRRO, @CODCIDADE,
          @LIMITECOMPRA, @DIAVENCIMENTO, @SITUACAO, @MANTERPROMOCOES,
          1, @CADCLIENTE, @CADFORNECEDOR, @CONSTASPC, @OBSERVACAO,
          GETDATE(), GETDATE()
        )`,
        {
          CODPESSOA: { type: sql.Int, value: novoCodigo },
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
          CADCLIENTE: { type: sql.Bit, value: input.cadCliente },
          CADFORNECEDOR: { type: sql.Bit, value: input.cadFornecedor },
          CONSTASPC: { type: sql.Bit, value: input.constaSpc },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
        }
      );
      return { success: true, codigo: novoCodigo };
    }),

  /**
   * Atualizar transportadora existente
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
      cadCliente: z.boolean().default(false),
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
          CADCLIENTE = @CADCLIENTE, CADFORNECEDOR = @CADFORNECEDOR,
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
          CADCLIENTE: { type: sql.Bit, value: input.cadCliente },
          CADFORNECEDOR: { type: sql.Bit, value: input.cadFornecedor },
          CONSTASPC: { type: sql.Bit, value: input.constaSpc },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
        }
      );
      return { success: true };
    }),

  /**
   * Excluir transportadora (soft delete: SITUACAO = 'I')
   */
  excluir: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      await querySql(
        `UPDATE KS0002.KS00001 SET SITUACAO = 'I', ULTIMAALTERACAO = GETDATE()
         WHERE GUIDPESSOA = @GUID AND GUIDENTIDADE = @GUIDENTIDADE AND CADTRANSPORTADORA = 1`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade },
        }
      );
      return { success: true };
    }),
});

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { querySql, sql } from "../sqlserver";
import { verifyKsSession } from "./ksAuthRouter";
import { COOKIE_NAME } from "@shared/const";

// CNPJ da empresa master DataDev — oculta campos de contrato para outros
const CNPJ_MASTER = "50303631000158";

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function isDataDevAdmin(session: Awaited<ReturnType<typeof verifyKsSession>>) {
  return Boolean(
    session?.isGerente &&
    onlyDigits(session.entDocumento) === CNPJ_MASTER
  );
}

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

export const empresasRouter = router({

  /**
   * Retorna se o usuário logado pertence à empresa master (DataDev)
   * Usado para mostrar/ocultar campos de contrato no formulário
   */
  verificarMaster: publicProcedure
    .query(async ({ ctx }) => {
      const session = await getKsSession(ctx.req);

      const rows = await querySql<{ DOCUMENTO: string }>(
        `SELECT TOP 1 REPLACE(REPLACE(REPLACE(DOCUMENTO,'.',''),'-',''),'/','') AS DOCUMENTO
         FROM KS0002.KS00001
         WHERE GUIDPESSOA = @GUIDPESSOA`,
        { GUIDPESSOA: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
      );

      const docLimpo = onlyDigits(rows[0]?.DOCUMENTO);
      return { isMaster: session.isGerente && docLimpo === CNPJ_MASTER };
    }),

  /**
   * Listar empresas da empresa logada com filtros e paginação
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
      const dataDevAdmin = isDataDevAdmin(session);

      let where = `WHERE c.CADEMPRESA = 1`;
      const params: Record<string, { type: unknown; value: unknown }> = {
        OFFSET: { type: sql.Int, value: offset },
        LIMIT: { type: sql.Int, value: porPagina },
      };

      if (!dataDevAdmin) {
        where += ` AND c.GUIDENTIDADE = @GUIDENTIDADE`;
        params.GUIDENTIDADE = { type: sql.UniqueIdentifier, value: session.guidEntidade };
      }

      if (situacao) {
        where += ` AND c.SITUACAO = @SITUACAO`;
        params.SITUACAO = { type: sql.Char(1), value: situacao };
      } else {
        where += ` AND c.SITUACAO IN ('A','I','B')`;
      }

      if (busca && busca.trim() !== "") {
        where += ` AND (c.NOME LIKE @BUSCA OR c.FANTASIA LIKE @BUSCA OR c.DOCUMENTO LIKE @BUSCA OR c.TELEFONE LIKE @BUSCA OR c.CELULAR LIKE @BUSCA)`;
        params.BUSCA = { type: sql.VarChar(200), value: `%${busca.trim()}%` };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [countResult, rows] = await Promise.all([
        querySql<{ total: number }>(`SELECT COUNT(*) AS total FROM KS0002.KS00001 c ${where}`, params as any),
        querySql(
          `SELECT c.GUIDPESSOA, c.CODIGO, c.CODENTIDADE, c.NOME, c.FANTASIA, c.DOCUMENTO,
            c.CODTIPODOCUMENTO, c.TELEFONE, c.CELULAR, c.EMAIL,
            c.SITUACAO, c.DATACADASTRO, c.ULTIMAALTERACAO,
            c.CADEMPRESA, c.CADCLIENTE, c.CADFORNECEDOR,
            cid.CIDADE, cid.UF
           FROM KS0002.KS00001 c
           LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
           ${where}
           ORDER BY c.NOME
           OFFSET @OFFSET ROWS FETCH NEXT @LIMIT ROWS ONLY`,
          params as any
        ),
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
   * Buscar uma empresa pelo GUIDPESSOA
   */
  buscarPorGuid: publicProcedure
    .input(z.object({ guidPessoa: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const dataDevAdmin = isDataDevAdmin(session);

      let where = `WHERE c.GUIDPESSOA = @GUID`;
      const params: Record<string, { type: unknown; value: unknown }> = {
        GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
      };

      if (!dataDevAdmin) {
        where += ` AND c.GUIDENTIDADE = @GUIDENTIDADE`;
        params.GUIDENTIDADE = { type: sql.UniqueIdentifier, value: session.guidEntidade };
      }

      const rows = await querySql(
        `SELECT c.*, cid.CIDADE, cid.UF, cid.CIDADE + '-' + cid.UF AS DESCCIDADE
         FROM KS0002.KS00001 c
         LEFT JOIN KS0000.KS00005 cid ON cid.CODCIDADE = c.CODCIDADE
         ${where}`,
        params as any
      );

      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
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
        `SELECT TOP 20 CODCIDADE, CIDADE, UF, CIDADE + '-' + UF AS DESCCIDADE FROM KS0000.KS00005 ${where} ORDER BY CIDADE`,
        params as any
      );
    }),

  /**
   * Validar se documento já está cadastrado
   */
  validarDocumento: publicProcedure
    .input(z.object({
      documento: z.string(),
      guidPessoaExcluir: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const docLimpo = input.documento.replace(/\D/g, "");
      const dataDevAdmin = isDataDevAdmin(session);

      let where = `WHERE REPLACE(REPLACE(REPLACE(DOCUMENTO,'.',''),'-',''),'/','') = @DOC`;
      const params: Record<string, { type: unknown; value: unknown }> = {
        DOC: { type: sql.VarChar(20), value: docLimpo },
      };

      if (!dataDevAdmin) {
        where += ` AND GUIDENTIDADE = @GUIDENTIDADE`;
        params.GUIDENTIDADE = { type: sql.UniqueIdentifier, value: session.guidEntidade };
      }

      const rows = await querySql<{ GUIDPESSOA: string; CODIGO: number; NOME: string }>(
        `SELECT TOP 1 GUIDPESSOA, CODIGO, NOME
         FROM KS0002.KS00001
         ${where}`,
        params as any
      );

      if (!rows || rows.length === 0) return { existe: false };
      const found = rows[0];
      if (input.guidPessoaExcluir && found.GUIDPESSOA === input.guidPessoaExcluir) return { existe: false };
      return { existe: true, codigo: found.CODIGO, nome: found.NOME };
    }),

  /**
   * Criar nova empresa — CADEMPRESA = 1 fixo
   * Também insere vínculo em KS0002.KS00013
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
      crt: z.number().default(1),
      ambiente: z.number().default(0),
      aliquotaPis: z.number().default(0),
      aliquotaCofins: z.number().default(0),
      juroMensal: z.number().default(0),
      banco: z.number().default(0),
      agencia: z.string().optional(),
      conta: z.string().optional(),
      pix: z.string().optional(),
      cep: z.string().min(8),
      endereco: z.string().min(1),
      numero: z.string().min(1),
      complemento: z.string().optional(),
      bairro: z.string().min(1),
      codCidade: z.number(),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      // Campos de contrato (visíveis apenas para empresa master)
      segmento: z.number().optional(),
      dataImplantacao: z.string().optional(),
      dataDemissao: z.string().optional(),
      valorNegociado: z.number().optional(),
      valorSalario: z.number().optional(),
      mensalidade: z.number().default(1),
      observacao: z.string().optional(),
      // Campos fiscais NF-e
      certificadoBase64: z.string().optional(),
      dtCertificado: z.string().optional(),
      codPin: z.string().optional(),
      csc: z.string().optional(),
      codCsc: z.string().optional(),
      numNfe: z.number().optional(),
      serieNfe: z.number().optional(),
      usuarioNfe: z.string().optional(),
      senhaNfe: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const dataDevAdmin = isDataDevAdmin(session);

      const maxCod = await querySql<{ maxCod: number }>(
        dataDevAdmin
          ? `SELECT ISNULL(MAX(CODIGO), 0) + 1 AS maxCod FROM KS0002.KS00001 WHERE CADEMPRESA = 1`
          : `SELECT ISNULL(MAX(CODIGO), 0) + 1 AS maxCod FROM KS0002.KS00001 WHERE GUIDENTIDADE = @GUIDENTIDADE`,
        dataDevAdmin
          ? {}
          : { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade } }
      );
      const novoCodigo = maxCod[0]?.maxCod ?? 1;

      // Gerar GUID para a nova empresa
      const guidRows = await querySql<{ GUID: string }>(`SELECT NEWID() AS GUID`, {});
      const novoGuid = guidRows[0]?.GUID ?? "";

      await querySql(
        `INSERT INTO KS0002.KS00001 (
          CODIGO, GUIDPESSOA, GUIDENTIDADE,
          NOME, FANTASIA, DOCUMENTO, CODTIPODOCUMENTO,
          TELEFONE, CELULAR, WHATSAPP, EMAIL,
          IE, INDIEDEST, CRT, AMBIENTE,
          ALIQUOTAPIS, ALIQUOTACOFINS, JUROMENSAL,
          BANCO,
          CEP, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CODCIDADE,
          SITUACAO, CADEMPRESA,
          CADCLIENTE, CADFORNECEDOR, CADUSUARIO, CADTRANSPORTADORA,
          MANTERPROMOCOES, CONSTASPC,
          LIMITECOMPRA, DIAVENCIMENTO, CODLOCALIDADE,
          PRECIFICACAO, CODENTIDADE, CODVENDEDOR,
          ORGANIZACIONAL, GRADE, CADCADASTRO, MATRICULA,
          QUANTIDADE, COD_BAIRRO, ALIQUOTA, CREDITOCSOSN,
          MARGEMPADRAO, CODCARGO, ATUALIZARPRECOS,
          COSEGMENTO, DATAADMISSAO, DATADEMISSAO,
          VALORNEGOCIADO, VALORSALARIO, MENSALIDADE,
          OBSERVACAO,
          CERTIFICADO, DTCERTIFICADO, CODPIN, CSC, CODCSC,
          NUMNFE, SERIENFE, USUARIO, SENHAPRAZO,
          DATACADASTRO, ULTIMAALTERACAO, ULTIMOACESSO
        ) VALUES (
          @CODIGO, @GUIDPESSOA, @GUIDENTIDADE,
          @NOME, @FANTASIA, @DOCUMENTO, @CODTIPODOCUMENTO,
          @TELEFONE, @CELULAR, @WHATSAPP, @EMAIL,
          @IE, @INDIEDEST, @CRT, @AMBIENTE,
          @ALIQUOTAPIS, @ALIQUOTACOFINS, @JUROMENSAL,
          @BANCO,
          @CEP, @ENDERECO, @NUMERO, @COMPLEMENTO, @BAIRRO, @CODCIDADE,
          @SITUACAO, 1,
          0, 0, 0, 0,
          1, 0,
          0, 0, 0,
          'R', @CODIGO, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 1,
          @COSEGMENTO, @DATAADMISSAO, @DATADEMISSAO,
          @VALORNEGOCIADO, @VALORSALARIO, @MENSALIDADE,
          @OBSERVACAO,
          @CERTIFICADO, @DTCERTIFICADO, @CODPIN, @CSC, @CODCSC,
          @NUMNFE, @SERIENFE, @USUARIO, @SENHAPRAZO,
          GETDATE(), GETDATE(), GETDATE()
        )`,
        {
          CODIGO: { type: sql.Int, value: novoCodigo },
          GUIDPESSOA: { type: sql.UniqueIdentifier, value: novoGuid },
          GUIDENTIDADE: { type: sql.UniqueIdentifier, value: novoGuid },
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
          CRT: { type: sql.Int, value: input.crt },
          AMBIENTE: { type: sql.Int, value: input.ambiente },
          ALIQUOTAPIS: { type: sql.Numeric(18, 4), value: input.aliquotaPis },
          ALIQUOTACOFINS: { type: sql.Numeric(18, 4), value: input.aliquotaCofins },
          JUROMENSAL: { type: sql.Numeric(18, 4), value: input.juroMensal },
          BANCO: { type: sql.Int, value: input.banco },
          CEP: { type: sql.VarChar(10), value: input.cep },
          ENDERECO: { type: sql.VarChar(60), value: input.endereco },
          NUMERO: { type: sql.VarChar(10), value: input.numero },
          COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento ?? null },
          BAIRRO: { type: sql.VarChar(40), value: input.bairro },
          CODCIDADE: { type: sql.Int, value: input.codCidade },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          COSEGMENTO: { type: sql.Int, value: input.segmento ?? null },
          DATAADMISSAO: { type: sql.Date, value: input.dataImplantacao ?? null },
          DATADEMISSAO: { type: sql.Date, value: input.dataDemissao ?? null },
          VALORNEGOCIADO: { type: sql.Numeric(18, 2), value: input.valorNegociado ?? 0 },
          VALORSALARIO: { type: sql.Numeric(18, 2), value: input.valorSalario ?? 0 },
          MENSALIDADE: { type: sql.Int, value: input.mensalidade ?? 1 },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
          CERTIFICADO: { type: sql.VarChar(sql.MAX), value: input.certificadoBase64 ?? null },
          DTCERTIFICADO: { type: sql.Date, value: input.dtCertificado ?? null },
          CODPIN: { type: sql.VarChar(25), value: input.codPin ?? null },
          CSC: { type: sql.VarChar(150), value: input.csc ?? null },
          CODCSC: { type: sql.VarChar(20), value: input.codCsc ?? null },
          NUMNFE: { type: sql.Int, value: input.numNfe ?? null },
          SERIENFE: { type: sql.Int, value: input.serieNfe ?? null },
          USUARIO: { type: sql.VarChar(15), value: input.usuarioNfe ?? null },
          SENHAPRAZO: { type: sql.VarChar(25), value: input.senhaNfe ?? null },
        }
      );

      // Inserir vínculo na KS0002.KS00013 (igual ao Delphi)
      await querySql(
        `INSERT INTO KS0002.KS00013 (GUIDVINCULO, GUIDPESSOA, GUIDENTIDADE, DTLANCAMENTO)
         VALUES (NEWID(), @GUIDPESSOA, @GUIDPESSOA, GETDATE())`,
        {
          GUIDPESSOA: { type: sql.UniqueIdentifier, value: novoGuid },
        }
      );

      return { success: true, codigo: novoCodigo };
    }),

  /**
   * Atualizar empresa existente
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
      crt: z.number().default(1),
      ambiente: z.number().default(0),
      aliquotaPis: z.number().default(0),
      aliquotaCofins: z.number().default(0),
      juroMensal: z.number().default(0),
      banco: z.number().default(0),
      cep: z.string().min(8),
      endereco: z.string().min(1),
      numero: z.string().min(1),
      complemento: z.string().optional(),
      bairro: z.string().min(1),
      codCidade: z.number(),
      situacao: z.enum(["A", "I", "B"]).default("A"),
      segmento: z.number().optional(),
      dataImplantacao: z.string().optional(),
      dataDemissao: z.string().optional(),
      valorNegociado: z.number().optional(),
      valorSalario: z.number().optional(),
      mensalidade: z.number().default(1),
      observacao: z.string().optional(),
      // Campos fiscais NF-e
      certificadoBase64: z.string().optional(),
      dtCertificado: z.string().optional(),
      codPin: z.string().optional(),
      csc: z.string().optional(),
      codCsc: z.string().optional(),
      numNfe: z.number().optional(),
      serieNfe: z.number().optional(),
      usuarioNfe: z.string().optional(),
      senhaNfe: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);

      // Se certificadoBase64 for vazio string, não atualizar o campo CERTIFICADO
      const certUpdate = input.certificadoBase64 !== undefined
        ? `, CERTIFICADO = @CERTIFICADO`
        : ``;
      const dataDevAdmin = isDataDevAdmin(session);
      const tenantUpdateWhere = dataDevAdmin ? `` : ` AND GUIDENTIDADE = @GUIDENTIDADE`;

      await querySql(
        `UPDATE KS0002.KS00001 SET
          NOME = @NOME, FANTASIA = @FANTASIA, DOCUMENTO = @DOCUMENTO,
          CODTIPODOCUMENTO = @CODTIPODOCUMENTO,
          TELEFONE = @TELEFONE, CELULAR = @CELULAR, WHATSAPP = @WHATSAPP,
          EMAIL = @EMAIL, IE = @IE, INDIEDEST = @INDIEDEST,
          CRT = @CRT, AMBIENTE = @AMBIENTE,
          ALIQUOTAPIS = @ALIQUOTAPIS, ALIQUOTACOFINS = @ALIQUOTACOFINS,
          JUROMENSAL = @JUROMENSAL, BANCO = @BANCO,
          CEP = @CEP, ENDERECO = @ENDERECO, NUMERO = @NUMERO,
          COMPLEMENTO = @COMPLEMENTO, BAIRRO = @BAIRRO, CODCIDADE = @CODCIDADE,
          SITUACAO = @SITUACAO,
          COSEGMENTO = @COSEGMENTO, DATAADMISSAO = @DATAADMISSAO, DATADEMISSAO = @DATADEMISSAO,
          VALORNEGOCIADO = @VALORNEGOCIADO, VALORSALARIO = @VALORSALARIO, MENSALIDADE = @MENSALIDADE,
          OBSERVACAO = @OBSERVACAO,
          DTCERTIFICADO = @DTCERTIFICADO, CODPIN = @CODPIN,
          CSC = @CSC, CODCSC = @CODCSC,
          NUMNFE = @NUMNFE, SERIENFE = @SERIENFE,
          USUARIO = @USUARIO, SENHAPRAZO = @SENHAPRAZO
          ${certUpdate},
          ULTIMAALTERACAO = GETDATE()
        WHERE GUIDPESSOA = @GUID${tenantUpdateWhere}`,
        {
          GUID: { type: sql.UniqueIdentifier, value: input.guidPessoa },
          ...(dataDevAdmin
            ? {}
            : { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: session.guidEntidade } }),
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
          CRT: { type: sql.Int, value: input.crt },
          AMBIENTE: { type: sql.Int, value: input.ambiente },
          ALIQUOTAPIS: { type: sql.Numeric(18, 4), value: input.aliquotaPis },
          ALIQUOTACOFINS: { type: sql.Numeric(18, 4), value: input.aliquotaCofins },
          JUROMENSAL: { type: sql.Numeric(18, 4), value: input.juroMensal },
          BANCO: { type: sql.Int, value: input.banco },
          CEP: { type: sql.VarChar(10), value: input.cep },
          ENDERECO: { type: sql.VarChar(60), value: input.endereco },
          NUMERO: { type: sql.VarChar(10), value: input.numero },
          COMPLEMENTO: { type: sql.VarChar(60), value: input.complemento ?? null },
          BAIRRO: { type: sql.VarChar(40), value: input.bairro },
          CODCIDADE: { type: sql.Int, value: input.codCidade },
          SITUACAO: { type: sql.Char(1), value: input.situacao },
          COSEGMENTO: { type: sql.Int, value: input.segmento ?? null },
          DATAADMISSAO: { type: sql.Date, value: input.dataImplantacao ?? null },
          DATADEMISSAO: { type: sql.Date, value: input.dataDemissao ?? null },
          VALORNEGOCIADO: { type: sql.Numeric(18, 2), value: input.valorNegociado ?? 0 },
          VALORSALARIO: { type: sql.Numeric(18, 2), value: input.valorSalario ?? 0 },
          MENSALIDADE: { type: sql.Int, value: input.mensalidade ?? 1 },
          OBSERVACAO: { type: sql.VarChar(500), value: input.observacao ?? null },
          DTCERTIFICADO: { type: sql.Date, value: input.dtCertificado ?? null },
          CODPIN: { type: sql.VarChar(25), value: input.codPin ?? null },
          CSC: { type: sql.VarChar(150), value: input.csc ?? null },
          CODCSC: { type: sql.VarChar(20), value: input.codCsc ?? null },
          NUMNFE: { type: sql.Int, value: input.numNfe ?? null },
          SERIENFE: { type: sql.Int, value: input.serieNfe ?? null },
          USUARIO: { type: sql.VarChar(15), value: input.usuarioNfe ?? null },
          SENHAPRAZO: { type: sql.VarChar(25), value: input.senhaNfe ?? null },
          ...(input.certificadoBase64 !== undefined
            ? { CERTIFICADO: { type: sql.VarChar(sql.MAX), value: input.certificadoBase64 || null } }
            : {}),
        }
      );

      return { success: true };
    }),

  /**
   * Validar se o usuário NF-e já está em uso em QUALQUER empresa do sistema (multiempresa)
   * A coluna USUARIO deve ser única globalmente na tabela KS0002.KS00001
   */
  validarUsuario: publicProcedure
    .input(z.object({
      usuario: z.string().min(1),
      guidPessoaExcluir: z.string().optional(), // GUID da empresa atual (para ignorar na edição)
    }))
    .query(async ({ input, ctx }) => {
      // Garante que o chamador tem sessão válida
      await getKsSession(ctx.req);

      const usuarioLimpo = input.usuario.trim().toUpperCase();
      if (!usuarioLimpo) return { disponivel: true };

      // Busca em TODA a tabela — sem filtro de GUIDENTIDADE — pois é multiempresa
      const rows = await querySql<{ GUIDPESSOA: string; NOME: string; DOCUMENTO: string }>(
        `SELECT TOP 1 GUIDPESSOA, NOME, DOCUMENTO
         FROM KS0002.KS00001
         WHERE UPPER(LTRIM(RTRIM(USUARIO))) = @USUARIO
           AND CADEMPRESA = 1`,
        { USUARIO: { type: sql.VarChar(15), value: usuarioLimpo } }
      );

      if (!rows || rows.length === 0) return { disponivel: true };

      const found = rows[0];
      // Se for a própria empresa sendo editada, ignora
      if (input.guidPessoaExcluir && found.GUIDPESSOA === input.guidPessoaExcluir) {
        return { disponivel: true };
      }

      return {
        disponivel: false,
        nome: found.NOME,
        documento: found.DOCUMENTO,
      };
    }),
});

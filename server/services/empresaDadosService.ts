import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { querySql, sql } from "../sqlserver";

const guidSchema = z.string().uuid();
const ultimaAlteracaoSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ultimaAlteracao invalida.",
      });
      return z.NEVER;
    }

    return date;
  });

export type EmpresaDadosNf = {
  CODIGO: number | null;
  CODENTIDADE: number | null;
  GUIDENTIDADE: string;
  GUIDPESSOA: string;
  NOME: string | null;
  FANTASIA: string | null;
  DOCUMENTO: string | null;
  CODTIPODOCUMENTO: string | null;
  IE: string | null;
  INDIEDEST: number | null;
  IM: string | null;
  CRT: number | null;
  CNAE: string | null;
  CEP: string | null;
  ENDERECO: string | null;
  NUMERO: string | null;
  COMPLEMENTO: string | null;
  BAIRRO: string | null;
  CODCIDADE: number | null;
  CODLOCALIDADE: number | null;
  LIMITECOMPRA: number | null;
  MENSALIDADE: number | null;
  TELEFONE: string | null;
  CELULAR: string | null;
  EMAIL: string | null;
  USUARIO: string | null;
  SENHAPRAZO: string | null;
  CERTIFICADO: string | null;
  CODPIN: string | null;
  API: string | null;
  AMBIENTE: number | null;
  CSC: string | null;
  CODCSC: string | null;
  NUMNFE: number | null;
  SERIENFE: number | null;
  ULTIMAALTERACAO: Date | string | null;
  SITUACAO: string | null;
};

export async function listarDadosEmpresaNf(input: {
  guidEntidade: string;
  ultimaAlteracao?: string;
}) {
  const guidEntidade = guidSchema.parse(input.guidEntidade);
  const ultimaAlteracao = ultimaAlteracaoSchema.parse(input.ultimaAlteracao);

  const params = {
    guidEntidade: { type: sql.UniqueIdentifier, value: guidEntidade },
    ultimaAlteracao: { type: sql.DateTime, value: ultimaAlteracao },
  };

  const exists = await querySql<{ existe: number }>(
    `SELECT TOP 1 1 AS existe
     FROM KS0002.KS00001
     WHERE GUIDENTIDADE = @guidEntidade`,
    { guidEntidade: params.guidEntidade }
  );

  if (!exists.length) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Entidade nao encontrada.",
    });
  }

  return querySql<EmpresaDadosNf>(
    `SELECT
        CODIGO,
        CODENTIDADE,
        GUIDENTIDADE,
        GUIDPESSOA,
        NOME,
        FANTASIA,
        DOCUMENTO,
        CODTIPODOCUMENTO,
        IE,
        INDIEDEST,
        IM,
        CRT,
        CNAE,
        CEP,
        ENDERECO,
        NUMERO,
        COMPLEMENTO,
        BAIRRO,
        CODCIDADE,
        CODLOCALIDADE,
        LIMITECOMPRA,
        MENSALIDADE,
        TELEFONE,
        CELULAR,
        EMAIL,
        USUARIO,
        SENHAPRAZO,
        CERTIFICADO,
        CODPIN,
        API,
        AMBIENTE,
        CSC,
        CODCSC,
        NUMNFE,
        SERIENFE,
        ULTIMAALTERACAO,
        SITUACAO
      FROM KS0002.KS00001
      WHERE GUIDENTIDADE = @guidEntidade
        AND (
          @ultimaAlteracao IS NULL
          OR ULTIMAALTERACAO >= @ultimaAlteracao
        )`,
    params
  );
}

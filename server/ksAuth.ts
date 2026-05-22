import { querySql, sql } from "./sqlserver";

export interface KsUser {
  GUIDPESSOA: string;
  GUIDENTIDADE: string;
  NOME: string;
  FANTASIA: string | null;
  DOCUMENTO: string;
  ENTDOCUMENTO: string;
  NOMEFANTASIA: string | null;
  USUARIO: string;
  EMAIL: string | null;
  CODTIPOENTIDADE: string | null;
  SITUACAO: string;
  CADGERENTE: boolean | number;
  CODFILIAL: number | null;
}

/**
 * Autentica o usuário contra a tabela KS0002.KS00001.
 * Retorna os dados do usuário + GUIDENTIDADE da empresa vinculada.
 *
 * Replica exatamente a query do Delphi:
 *   SELECT ent.documento as ENTDOCUMENTO, *
 *   FROM KS0002.KS00001 AS CAD
 *   INNER JOIN KS0002.KS00001 AS ent ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
 *   WHERE CAD.SENHAPRAZO = :SENHA AND CAD.USUARIO = :USUARIO
 *     AND CAD.SITUACAO = 'A' AND ent.SITUACAO = 'A'
 */
export async function authenticateKsUser(
  usuario: string,
  senha: string
): Promise<KsUser | null> {
  const query = `
    SELECT
      ent.DOCUMENTO   AS ENTDOCUMENTO,
      ent.NOME        AS NOMEFANTASIA,
      CAD.GUIDPESSOA,
      CAD.GUIDENTIDADE,
      CAD.NOME,
      CAD.FANTASIA,
      CAD.DOCUMENTO,
      CAD.USUARIO,
      CAD.EMAIL,
      CAD.CODTIPOENTIDADE,
      CAD.SITUACAO,
      CAD.CODGERENTE  AS CADGERENTE,
      CAD.CODFILIAL
    FROM KS0002.KS00001 AS CAD
    INNER JOIN KS0002.KS00001 AS ent
      ON ent.GUIDPESSOA = CAD.GUIDENTIDADE
    WHERE CAD.SENHAPRAZO = @SENHA
      AND CAD.USUARIO    = @USUARIO
      AND CAD.SITUACAO   = 'A'
      AND ent.SITUACAO   = 'A'
  `;

  const rows = await querySql<KsUser>(query, {
    SENHA:   { type: sql.VarChar(25),  value: senha },
    USUARIO: { type: sql.VarChar(15),  value: usuario },
  });

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

/**
 * Atualiza o campo ULTIMOACESSO do usuário após login bem-sucedido.
 */
export async function updateLastAccess(guidPessoa: string): Promise<void> {
  await querySql(
    `UPDATE KS0002.KS00001 SET ULTIMOACESSO = GETDATE() WHERE GUIDPESSOA = @GUID`,
    { GUID: { type: sql.UniqueIdentifier, value: guidPessoa } }
  );
}

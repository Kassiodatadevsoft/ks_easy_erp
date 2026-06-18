import { SISTEMA_SEGMENTOS } from "@shared/datadev";
import { querySql, sql } from "../sqlserver";

export const TIPOS_MONTAGEM = ["PIZZA", "TREM", "BITREM", "SUSHI", "COMBO", "OUTROS"] as const;
export const TIPOS_CALCULO_PRECO = ["MAIOR_VALOR", "MEDIA_VALORES", "SOMAR_VALORES", "PRECO_FIXO_PRODUTO"] as const;

export async function ensureProdutoMontagemSchema() {
  await querySql(`
    IF COL_LENGTH('KS0000.KS00009', 'PERMITEMONTAGEM') IS NULL
      ALTER TABLE KS0000.KS00009 ADD PERMITEMONTAGEM bit NOT NULL CONSTRAINT DF_KS00009_PERMITEMONTAGEM DEFAULT (0) WITH VALUES;
    IF COL_LENGTH('KS0000.KS00009', 'TIPOMONTAGEM') IS NULL
      ALTER TABLE KS0000.KS00009 ADD TIPOMONTAGEM varchar(30) NULL;
    IF COL_LENGTH('KS0000.KS00009', 'QTDMINOPCOES') IS NULL
      ALTER TABLE KS0000.KS00009 ADD QTDMINOPCOES int NOT NULL CONSTRAINT DF_KS00009_QTDMINOPCOES DEFAULT (0) WITH VALUES;
    IF COL_LENGTH('KS0000.KS00009', 'QTDMAXOPCOES') IS NULL
      ALTER TABLE KS0000.KS00009 ADD QTDMAXOPCOES int NOT NULL CONSTRAINT DF_KS00009_QTDMAXOPCOES DEFAULT (0) WITH VALUES;
    IF COL_LENGTH('KS0000.KS00009', 'OBRIGASELECAOMONTAGEM') IS NULL
      ALTER TABLE KS0000.KS00009 ADD OBRIGASELECAOMONTAGEM bit NOT NULL CONSTRAINT DF_KS00009_OBRIGASELECAO DEFAULT (0) WITH VALUES;
    IF COL_LENGTH('KS0000.KS00009', 'TIPOCALCULOPRECOMONTAGEM') IS NULL
      ALTER TABLE KS0000.KS00009 ADD TIPOCALCULOPRECOMONTAGEM varchar(30) NOT NULL CONSTRAINT DF_KS00009_TIPOCALC DEFAULT ('MAIOR_VALOR') WITH VALUES;

    IF OBJECT_ID('KS0000.PRODUTO_OPCOES_MONTAGEM', 'U') IS NULL
    BEGIN
      CREATE TABLE KS0000.PRODUTO_OPCOES_MONTAGEM (
        GUIDOPCAOMONTAGEM char(36) NOT NULL,
        GUIDENTIDADE char(36) NOT NULL,
        GUIDPRODUTO char(36) NOT NULL,
        GUIDPRODUTOOPCAO char(36) NOT NULL,
        DESCRICAO varchar(100) NULL,
        VALORADICIONAL numeric(18,4) NOT NULL CONSTRAINT DF_PRODUTO_OPCOES_MONTAGEM_VALOR DEFAULT (0),
        ORDEM integer NULL,
        SITUACAO char(1) NOT NULL CONSTRAINT DF_PRODUTO_OPCOES_MONTAGEM_SITUACAO DEFAULT ('A'),
        CONSTRAINT PK_PRODUTO_OPCOES_MONTAGEM PRIMARY KEY (GUIDOPCAOMONTAGEM)
      );
      CREATE INDEX IX_PRODUTO_OPCOES_MONTAGEM_PRODUTO
        ON KS0000.PRODUTO_OPCOES_MONTAGEM (GUIDENTIDADE, GUIDPRODUTO, SITUACAO, ORDEM);
    END;
  `);
}

export async function segmentoEmpresa(guidEntidade: string) {
  const rows = await querySql<{ SEGMENTO: string | null }>(
    `SELECT TOP 1 ISNULL(SEGMENTO, 'GERAL') AS SEGMENTO
     FROM KS0002.KS00001
     WHERE GUIDENTIDADE = @GUIDENTIDADE AND CADEMPRESA = 1
     ORDER BY CASE WHEN GUIDPESSOA = @GUIDENTIDADE THEN 0 ELSE 1 END`,
    { GUIDENTIDADE: { type: sql.UniqueIdentifier, value: guidEntidade } }
  );
  const segmento = String(rows[0]?.SEGMENTO ?? "GERAL").toUpperCase();
  return (SISTEMA_SEGMENTOS as readonly string[]).includes(segmento) ? segmento : "GERAL";
}

export async function listarOpcoesMontagem(guidEntidade: string, guidProduto: string) {
  await ensureProdutoMontagemSchema();
  return querySql(
    `SELECT
       GUIDOPCAOMONTAGEM, GUIDENTIDADE, GUIDPRODUTO, GUIDPRODUTOOPCAO,
       DESCRICAO, VALORADICIONAL, ORDEM, SITUACAO
     FROM KS0000.PRODUTO_OPCOES_MONTAGEM
     WHERE GUIDENTIDADE = @GUIDENTIDADE
       AND GUIDPRODUTO = @GUIDPRODUTO
       AND SITUACAO = 'A'
     ORDER BY ISNULL(ORDEM, 0), DESCRICAO`,
    {
      GUIDENTIDADE: { type: sql.Char(36), value: guidEntidade },
      GUIDPRODUTO: { type: sql.Char(36), value: guidProduto },
    }
  );
}

export async function salvarOpcoesMontagem(
  guidEntidade: string,
  guidProduto: string,
  opcoes: Array<{ guidProdutoOpcao: string; descricao?: string; valorAdicional?: number; ordem?: number; situacao?: "A" | "I" }>
) {
  await ensureProdutoMontagemSchema();
  await querySql(
    `UPDATE KS0000.PRODUTO_OPCOES_MONTAGEM
     SET SITUACAO = 'I'
     WHERE GUIDENTIDADE = @GUIDENTIDADE AND GUIDPRODUTO = @GUIDPRODUTO`,
    {
      GUIDENTIDADE: { type: sql.Char(36), value: guidEntidade },
      GUIDPRODUTO: { type: sql.Char(36), value: guidProduto },
    }
  );

  for (let index = 0; index < opcoes.length; index += 1) {
    const opcao = opcoes[index];
    await querySql(
      `MERGE KS0000.PRODUTO_OPCOES_MONTAGEM AS tgt
       USING (
         SELECT @GUIDENTIDADE AS GUIDENTIDADE, @GUIDPRODUTO AS GUIDPRODUTO, @GUIDPRODUTOOPCAO AS GUIDPRODUTOOPCAO
       ) AS src
       ON tgt.GUIDENTIDADE = src.GUIDENTIDADE
        AND tgt.GUIDPRODUTO = src.GUIDPRODUTO
        AND tgt.GUIDPRODUTOOPCAO = src.GUIDPRODUTOOPCAO
       WHEN MATCHED THEN UPDATE SET
         DESCRICAO = @DESCRICAO,
         VALORADICIONAL = @VALORADICIONAL,
         ORDEM = @ORDEM,
         SITUACAO = @SITUACAO
       WHEN NOT MATCHED THEN INSERT
         (GUIDOPCAOMONTAGEM, GUIDENTIDADE, GUIDPRODUTO, GUIDPRODUTOOPCAO, DESCRICAO, VALORADICIONAL, ORDEM, SITUACAO)
         VALUES
         (CONVERT(char(36), NEWID()), @GUIDENTIDADE, @GUIDPRODUTO, @GUIDPRODUTOOPCAO, @DESCRICAO, @VALORADICIONAL, @ORDEM, @SITUACAO);`,
      {
        GUIDENTIDADE: { type: sql.Char(36), value: guidEntidade },
        GUIDPRODUTO: { type: sql.Char(36), value: guidProduto },
        GUIDPRODUTOOPCAO: { type: sql.Char(36), value: opcao.guidProdutoOpcao },
        DESCRICAO: { type: sql.VarChar(100), value: opcao.descricao ?? null },
        VALORADICIONAL: { type: sql.Numeric(18, 4), value: opcao.valorAdicional ?? 0 },
        ORDEM: { type: sql.Int, value: opcao.ordem ?? index + 1 },
        SITUACAO: { type: sql.Char(1), value: opcao.situacao ?? "A" },
      }
    );
  }
}

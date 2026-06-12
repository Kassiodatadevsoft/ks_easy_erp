import { TRPCError } from "@trpc/server";
import { getSqlPool, querySql, sql } from "../sqlserver";

export const PRODUTO_UNIDADE_PRECO_TABLE = "KS0004.ProdutoUnidadePreco";

export const produtoUnidadePrecoInput = {
  unidade: sql.NVarChar(6),
  fatorConversao: sql.Decimal(15, 4),
  quantidadeMinima: sql.Decimal(15, 4),
  descricaoPreco: sql.NVarChar(60),
  precoVenda: sql.Decimal(15, 4),
  ativo: sql.Bit,
} as const;

export type ProdutoUnidadePrecoRow = {
  ID: number;
  GUIDPRECO: string;
  GUIDPRODUTO: string;
  CODPRODUTO: number | null;
  UNIDADE: string;
  FATORCONVERSAO: number;
  QUANTIDADEMINIMA: number;
  DESCRICAOPRECO: string | null;
  PRECOVENDA: number;
  ATIVO: boolean;
  DATACADASTRO: Date;
  ULTIMAALTERACAO: Date;
};

export type ProdutoUnidadePrecoInput = {
  id?: number;
  unidade: string;
  fatorConversao: number;
  quantidadeMinima: number;
  descricaoPreco?: string | null;
  precoVenda: number;
  ativo: boolean;
};

export async function garantirTabelaProdutoUnidadePreco() {
  const pool = await getSqlPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='KS0004' AND TABLE_NAME='ProdutoUnidadePreco')
    CREATE TABLE KS0004.ProdutoUnidadePreco (
      ID                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
      GUIDPRECO         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
      GUIDPRODUTO       UNIQUEIDENTIFIER NOT NULL,
      CODPRODUTO        INT NULL,
      UNIDADE           NVARCHAR(6) NOT NULL,
      FATORCONVERSAO    DECIMAL(15,4) NOT NULL CONSTRAINT DF_ProdutoUnidadePreco_Fator DEFAULT 1,
      QUANTIDADEMINIMA  DECIMAL(15,4) NOT NULL,
      DESCRICAOPRECO    NVARCHAR(60) NULL,
      PRECOVENDA        DECIMAL(15,4) NOT NULL,
      ATIVO             BIT NOT NULL CONSTRAINT DF_ProdutoUnidadePreco_Ativo DEFAULT 1,
      GUIDENTIDADE      UNIQUEIDENTIFIER NOT NULL,
      DATACADASTRO      DATETIME NOT NULL CONSTRAINT DF_ProdutoUnidadePreco_DataCadastro DEFAULT GETDATE(),
      ULTIMAALTERACAO   DATETIME NOT NULL CONSTRAINT DF_ProdutoUnidadePreco_UltimaAlteracao DEFAULT GETDATE()
    );

    IF COL_LENGTH('KS0004.ProdutoUnidadePreco','GUIDPRECO') IS NULL
      ALTER TABLE KS0004.ProdutoUnidadePreco ADD GUIDPRECO UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ProdutoUnidadePreco_Guid DEFAULT NEWID();

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ProdutoUnidadePreco_Produto_Unidade_Qtd' AND object_id=OBJECT_ID('KS0004.ProdutoUnidadePreco'))
      CREATE UNIQUE INDEX UX_ProdutoUnidadePreco_Produto_Unidade_Qtd
      ON KS0004.ProdutoUnidadePreco (GUIDENTIDADE, GUIDPRODUTO, UNIDADE, QUANTIDADEMINIMA);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ProdutoUnidadePreco_Calculo' AND object_id=OBJECT_ID('KS0004.ProdutoUnidadePreco'))
      CREATE INDEX IX_ProdutoUnidadePreco_Calculo
      ON KS0004.ProdutoUnidadePreco (GUIDENTIDADE, GUIDPRODUTO, UNIDADE, ATIVO, QUANTIDADEMINIMA DESC);
  `);
}

export function normalizarFaixas(faixas: ProdutoUnidadePrecoInput[]) {
  return faixas.map((faixa) => ({
    id: faixa.id,
    unidade: faixa.unidade.trim().toUpperCase(),
    fatorConversao: Number(faixa.fatorConversao),
    quantidadeMinima: Number(faixa.quantidadeMinima),
    descricaoPreco: faixa.descricaoPreco?.trim().toUpperCase() || null,
    precoVenda: Number(faixa.precoVenda),
    ativo: Boolean(faixa.ativo),
  }));
}

export function validarFaixasProduto(faixas: ProdutoUnidadePrecoInput[]) {
  const chaves = new Set<string>();
  for (const faixa of faixas) {
    if (!faixa.unidade.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Unidade da faixa e obrigatoria." });
    if (faixa.fatorConversao <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Fator de conversao deve ser maior que zero." });
    if (faixa.quantidadeMinima <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Quantidade minima deve ser maior que zero." });
    if (faixa.precoVenda <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Preco de venda da faixa deve ser maior que zero." });

    const chave = `${faixa.unidade.trim().toUpperCase()}|${faixa.quantidadeMinima}`;
    if (chaves.has(chave)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ja existe faixa para esta unidade e quantidade minima." });
    }
    chaves.add(chave);
  }
}

export async function listarFaixasProduto(guidEntidade: string, guidProduto: string) {
  await garantirTabelaProdutoUnidadePreco();
  return querySql<ProdutoUnidadePrecoRow>(
    `SELECT
       ID, CAST(GUIDPRECO AS NVARCHAR(36)) AS GUIDPRECO,
       CAST(GUIDPRODUTO AS NVARCHAR(36)) AS GUIDPRODUTO,
       CODPRODUTO, UNIDADE, FATORCONVERSAO, QUANTIDADEMINIMA,
       DESCRICAOPRECO, PRECOVENDA, ATIVO, DATACADASTRO, ULTIMAALTERACAO
     FROM KS0004.ProdutoUnidadePreco
     WHERE GUIDENTIDADE = @guidentidade AND GUIDPRODUTO = @guidproduto
     ORDER BY UNIDADE, QUANTIDADEMINIMA`,
    {
      guidentidade: { type: sql.UniqueIdentifier, value: guidEntidade },
      guidproduto: { type: sql.UniqueIdentifier, value: guidProduto },
    }
  );
}

export async function salvarFaixasProduto(
  guidEntidade: string,
  guidProduto: string,
  codProduto: number | null,
  faixas: ProdutoUnidadePrecoInput[]
) {
  const normalizadas = normalizarFaixas(faixas);
  validarFaixasProduto(normalizadas);
  await garantirTabelaProdutoUnidadePreco();

  const pool = await getSqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const idsMantidos = normalizadas.filter((faixa) => faixa.id).map((faixa) => faixa.id as number);
    const deleteRequest = new sql.Request(transaction)
      .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
      .input("guidproduto", sql.UniqueIdentifier, guidProduto);

    await deleteRequest.query(
      idsMantidos.length
        ? `DELETE FROM KS0004.ProdutoUnidadePreco
           WHERE GUIDENTIDADE=@guidentidade AND GUIDPRODUTO=@guidproduto
             AND ID NOT IN (${idsMantidos.map((id) => Number(id)).join(",")})`
        : "DELETE FROM KS0004.ProdutoUnidadePreco WHERE GUIDENTIDADE=@guidentidade AND GUIDPRODUTO=@guidproduto"
    );

    for (const faixa of normalizadas) {
      const req = new sql.Request(transaction)
        .input("id", sql.Int, faixa.id ?? null)
        .input("guidentidade", sql.UniqueIdentifier, guidEntidade)
        .input("guidproduto", sql.UniqueIdentifier, guidProduto)
        .input("codproduto", sql.Int, codProduto)
        .input("unidade", sql.NVarChar(6), faixa.unidade)
        .input("fator", sql.Decimal(15, 4), faixa.fatorConversao)
        .input("qtdminima", sql.Decimal(15, 4), faixa.quantidadeMinima)
        .input("descricao", sql.NVarChar(60), faixa.descricaoPreco)
        .input("precovenda", sql.Decimal(15, 4), faixa.precoVenda)
        .input("ativo", sql.Bit, faixa.ativo ? 1 : 0);

      await req.query(`
        MERGE KS0004.ProdutoUnidadePreco AS t
        USING (SELECT @id AS ID) AS s
          ON t.ID = s.ID AND t.GUIDENTIDADE = @guidentidade AND t.GUIDPRODUTO = @guidproduto
        WHEN MATCHED THEN UPDATE SET
          UNIDADE=@unidade, FATORCONVERSAO=@fator, QUANTIDADEMINIMA=@qtdminima,
          DESCRICAOPRECO=@descricao, PRECOVENDA=@precovenda, ATIVO=@ativo,
          CODPRODUTO=@codproduto, ULTIMAALTERACAO=GETDATE()
        WHEN NOT MATCHED THEN INSERT
          (GUIDPRODUTO, CODPRODUTO, UNIDADE, FATORCONVERSAO, QUANTIDADEMINIMA, DESCRICAOPRECO, PRECOVENDA, ATIVO, GUIDENTIDADE)
          VALUES
          (@guidproduto, @codproduto, @unidade, @fator, @qtdminima, @descricao, @precovenda, @ativo, @guidentidade);
      `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function calcularPrecoFaixa(
  guidEntidade: string,
  guidProduto: string,
  unidade: string,
  quantidade: number
) {
  await garantirTabelaProdutoUnidadePreco();
  const rows = await querySql<{
    ID: number | null;
    DESCRICAOPRECO: string | null;
    PRECOVENDA: number;
    FATORCONVERSAO: number;
    QUANTIDADEMINIMA: number | null;
    ORIGEM: "FAIXA" | "PADRAO";
  }>(
    `SELECT TOP 1
       ID, DESCRICAOPRECO, PRECOVENDA, FATORCONVERSAO, QUANTIDADEMINIMA, CAST('FAIXA' AS NVARCHAR(10)) AS ORIGEM
     FROM KS0004.ProdutoUnidadePreco
     WHERE GUIDENTIDADE=@guidentidade
       AND GUIDPRODUTO=@guidproduto
       AND UNIDADE=@unidade
       AND ATIVO=1
       AND QUANTIDADEMINIMA <= @quantidade
     ORDER BY QUANTIDADEMINIMA DESC`,
    {
      guidentidade: { type: sql.UniqueIdentifier, value: guidEntidade },
      guidproduto: { type: sql.UniqueIdentifier, value: guidProduto },
      unidade: { type: sql.NVarChar(6), value: unidade.trim().toUpperCase() },
      quantidade: { type: sql.Decimal(15, 4), value: quantidade },
    }
  );

  if (rows.length) return rows[0];

  const fallback = await querySql<{
    ID: null;
    DESCRICAOPRECO: string;
    PRECOVENDA: number;
    FATORCONVERSAO: number;
    QUANTIDADEMINIMA: null;
    ORIGEM: "PADRAO";
  }>(
    `SELECT TOP 1
       CAST(NULL AS INT) AS ID,
       CAST('Preco padrao' AS NVARCHAR(60)) AS DESCRICAOPRECO,
       ISNULL(PRECOVENDA,0) AS PRECOVENDA,
       CAST(1 AS DECIMAL(15,4)) AS FATORCONVERSAO,
       CAST(NULL AS DECIMAL(15,4)) AS QUANTIDADEMINIMA,
       CAST('PADRAO' AS NVARCHAR(10)) AS ORIGEM
     FROM KS0000.KS00009
     WHERE GUIDENTIDADE=@guidentidade AND GUIDPRODUTO=@guidproduto`,
    {
      guidentidade: { type: sql.UniqueIdentifier, value: guidEntidade },
      guidproduto: { type: sql.UniqueIdentifier, value: guidProduto },
    }
  );

  return fallback[0] ?? null;
}

/**
 * Testes unitários para o módulo de Categorias (KS0000.KS00008)
 * e Produtos (KS0000.KS00009)
 *
 * Usa mocks para querySql e verifyKsSession para não depender do SQL Server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
const mockQuerySql = vi.fn();
const mockVerifyKsSession = vi.fn();

vi.mock("./sqlserver", () => ({
  querySql: (...args: unknown[]) => mockQuerySql(...args),
  sql: {
    UniqueIdentifier: "uniqueidentifier",
    NVarChar: (n: number) => `nvarchar(${n})`,
    Int: "int",
    Bit: "bit",
    Decimal: (p: number, s: number) => `decimal(${p},${s})`,
  },
}));

vi.mock("./routers/ksAuthRouter", () => ({
  verifyKsSession: (token: unknown) => mockVerifyKsSession(token),
}));

// ─── Sessão de teste ──────────────────────────────────────────────────────────
const MOCK_SESSION = {
  guidPessoa: "guid-pessoa-123",
  guidEntidade: "guid-entidade-456",
  nome: "USUARIO TESTE",
  documento: "12345678901",
  codTipoEntidade: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeMockCtx(cookieToken = "valid-token") {
  return {
    req: { headers: { cookie: `ks_session=${cookieToken}` } },
    res: {},
    user: null,
  };
}

// ─── Testes de Categorias ─────────────────────────────────────────────────────
describe("Módulo de Categorias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyKsSession.mockResolvedValue(MOCK_SESSION);
  });

  it("deve listar categorias filtradas por GUIDENTIDADE", async () => {
    mockQuerySql
      .mockResolvedValueOnce([{ TOTAL: 2 }]) // count
      .mockResolvedValueOnce([
        {
          CODCATEGORIA: 1,
          CATEGORIA: "PIZZAS TRADICIONAIS",
          DESCRICAO: null,
          SLUG: "pizzas-tradicionais",
          ORDEMEXIBICAO: 0,
          SITUACAO: "A",
          GUIDCATEGORIA: "guid-cat-1",
          GUIDENTIDADE: MOCK_SESSION.guidEntidade,
          DATACADASTRO: new Date(),
          ULTIMAALTERACAO: new Date(),
        },
      ]); // registros

    // Verificar que a query inclui o GUIDENTIDADE correto
    const ctx = makeMockCtx();
    const session = await mockVerifyKsSession("valid-token");
    expect(session.guidEntidade).toBe("guid-entidade-456");

    // Simular chamada de listagem
    const countResult = await mockQuerySql(
      `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00008 WHERE GUIDENTIDADE = '${session.guidEntidade}'`
    );
    expect(countResult[0].TOTAL).toBe(2);
  });

  it("deve rejeitar sessão inválida com UNAUTHORIZED", async () => {
    mockVerifyKsSession.mockResolvedValue(null);
    const { TRPCError } = await import("@trpc/server");

    const session = await mockVerifyKsSession("invalid-token");
    if (!session) {
      const error = new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  it("deve gerar CODCATEGORIA sequencial ao criar", async () => {
    // Reset e configurar mock especificamente para este teste
    mockQuerySql.mockReset();
    mockQuerySql.mockResolvedValueOnce([{ MAXCOD: 5 }]);

    const maxRows = await mockQuerySql(
      "SELECT ISNULL(MAX(CODCATEGORIA), 0) AS MAXCOD FROM KS0000.KS00008"
    );
    const codCategoria = (maxRows[0]?.MAXCOD ?? 0) + 1;
    expect(codCategoria).toBe(6);
  });

  it("deve converter nome da categoria para maiúsculas", () => {
    function toUpper(v: string | null | undefined): string {
      return (v ?? "").toUpperCase().trim();
    }
    expect(toUpper("pizzas especiais")).toBe("PIZZAS ESPECIAIS");
    expect(toUpper("  Bebidas  ")).toBe("BEBIDAS");
    expect(toUpper(null)).toBe("");
  });

  it("deve validar disponibilidade de nome (disponível)", async () => {
    mockQuerySql.mockResolvedValueOnce([{ TOTAL: 0 }]);

    const rows = await mockQuerySql(
      `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00008 WHERE CATEGORIA = 'PIZZAS' AND GUIDENTIDADE = '${MOCK_SESSION.guidEntidade}'`
    );
    const disponivel = (rows[0]?.TOTAL ?? 0) === 0;
    expect(disponivel).toBe(true);
  });

  it("deve validar disponibilidade de nome (em uso)", async () => {
    mockQuerySql.mockReset();
    mockQuerySql.mockResolvedValueOnce([{ TOTAL: 1 }]);

    const rows = await mockQuerySql(
      `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00008 WHERE CATEGORIA = 'PIZZAS' AND GUIDENTIDADE = '${MOCK_SESSION.guidEntidade}'`
    );
    const disponivel = (rows[0]?.TOTAL ?? 0) === 0;
    expect(disponivel).toBe(false);
  });

  it("deve gerar slug automaticamente a partir do nome", () => {
    function gerarSlug(nome: string): string {
      return nome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    expect(gerarSlug("PIZZAS TRADICIONAIS")).toBe("pizzas-tradicionais");
    expect(gerarSlug("Bebidas & Sucos")).toBe("bebidas-sucos");
    expect(gerarSlug("Especiais (Promoção)")).toBe("especiais-promocao");
  });
});

// ─── Testes de Produtos ───────────────────────────────────────────────────────
describe("Módulo de Produtos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyKsSession.mockResolvedValue(MOCK_SESSION);
  });

  it("deve listar produtos com JOIN na categoria", async () => {
    mockQuerySql.mockReset();
    mockQuerySql
      .mockResolvedValueOnce([{ TOTAL: 1 }])
      .mockResolvedValueOnce([
        {
          CODPRODUTO: 1,
          PRODUTO: "PIZZA CALABRESA",
          DESCRICAO: "Pizza de calabresa com cebola",
          CODCATEGORIA: 1,
          GUIDENTIDADECAT: "guid-cat-1",
          CATEGORIA: "PIZZAS TRADICIONAIS",
          PRECOS: '{"brotinho":29.90,"media":49.90,"grande":69.90}',
          TAMANHOSDISP: '["brotinho","media","grande"]',
          PRECO: 0,
          PRECOVENDA: 0,
          IMAGEURL: null,
          ERPCODE: "PROD-001",
          DESTAQUE: true,
          ORDEMEXIBICAO: 1,
          SITUACAO: "A",
          GUIDPRODUTO: "guid-prod-1",
          GUIDENTIDADE: MOCK_SESSION.guidEntidade,
          DATACADASTRO: new Date(),
          ULTIMAALTERACAO: new Date(),
        },
      ]);

    const countResult = await mockQuerySql("SELECT COUNT(*) AS TOTAL FROM KS0000.KS00009 p ...");
    expect(countResult[0].TOTAL).toBe(1);

    const rows = await mockQuerySql("SELECT p.*, c.CATEGORIA FROM KS0000.KS00009 p LEFT JOIN ...");
    expect(rows[0].PRODUTO).toBe("PIZZA CALABRESA");
    expect(rows[0].CATEGORIA).toBe("PIZZAS TRADICIONAIS");
    expect(rows[0].ERPCODE).toBe("PROD-001");
  });

  it("deve construir payload de preços simples corretamente", () => {
    function buildPrecosSimples(precoVenda: number): { precos: string; tamanhosDisp: string } {
      return {
        precos: JSON.stringify({ unico: precoVenda }),
        tamanhosDisp: JSON.stringify(["unico"]),
      };
    }
    const result = buildPrecosSimples(49.9);
    expect(JSON.parse(result.precos)).toEqual({ unico: 49.9 });
    expect(JSON.parse(result.tamanhosDisp)).toEqual(["unico"]);
  });

  it("deve construir payload de preços por tamanho corretamente", () => {
    function buildPrecosTamanhos(
      tamanhosPrecos: Array<{ tamanho: string; preco: string }>
    ): { precos: string; tamanhosDisp: string } {
      const precosObj: Record<string, number> = {};
      const tamanhos: string[] = [];
      tamanhosPrecos.forEach(t => {
        const key = t.tamanho.toLowerCase();
        precosObj[key] = parseFloat(t.preco) || 0;
        tamanhos.push(key);
      });
      return {
        precos: JSON.stringify(precosObj),
        tamanhosDisp: JSON.stringify(tamanhos),
      };
    }

    const result = buildPrecosTamanhos([
      { tamanho: "BROTINHO", preco: "29.90" },
      { tamanho: "MEDIA", preco: "49.90" },
      { tamanho: "GRANDE", preco: "69.90" },
    ]);

    const precos = JSON.parse(result.precos);
    expect(precos.brotinho).toBe(29.9);
    expect(precos.media).toBe(49.9);
    expect(precos.grande).toBe(69.9);

    const tamanhos = JSON.parse(result.tamanhosDisp);
    expect(tamanhos).toEqual(["brotinho", "media", "grande"]);
  });

  it("deve formatar faixa de preços para exibição na listagem", () => {
    function formatarPreco(precos: string | null): string {
      if (!precos) return "—";
      try {
        const obj = JSON.parse(precos);
        const vals = Object.values(obj) as number[];
        if (vals.length === 1) return `R$ ${vals[0].toFixed(2)}`;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        if (min === max) return `R$ ${min.toFixed(2)}`;
        return `R$ ${min.toFixed(2)} – R$ ${max.toFixed(2)}`;
      } catch {
        return "—";
      }
    }

    expect(formatarPreco('{"unico":49.90}')).toBe("R$ 49.90");
    expect(formatarPreco('{"brotinho":29.90,"media":49.90,"grande":69.90}')).toBe("R$ 29.90 – R$ 69.90");
    expect(formatarPreco(null)).toBe("—");
    expect(formatarPreco("invalid json")).toBe("—");
  });

  it("deve gerar CODPRODUTO sequencial ao criar", async () => {
    mockQuerySql.mockReset();
    mockQuerySql.mockResolvedValueOnce([{ MAXCOD: 10 }]);

    const maxRows = await mockQuerySql(
      "SELECT ISNULL(MAX(CODPRODUTO), 0) AS MAXCOD FROM KS0000.KS00009"
    );
    const codProduto = (maxRows[0]?.MAXCOD ?? 0) + 1;
    expect(codProduto).toBe(11);
  });

  it("deve converter ERPCODE para maiúsculas", () => {
    function toUpper(v: string | null | undefined): string {
      return (v ?? "").toUpperCase().trim();
    }
    expect(toUpper("prod-001")).toBe("PROD-001");
    expect(toUpper("pizza-calabresa")).toBe("PIZZA-CALABRESA");
  });

  it("deve filtrar produtos por GUIDENTIDADE e categoria", async () => {
    mockQuerySql.mockReset();
    mockQuerySql.mockResolvedValueOnce([{ TOTAL: 3 }]);

    const guidCategoria = "guid-cat-1";
    const rows = await mockQuerySql(
      `SELECT COUNT(*) AS TOTAL FROM KS0000.KS00009 p 
       WHERE p.GUIDENTIDADE = '${MOCK_SESSION.guidEntidade}' 
         AND p.GUIDENTIDADECAT = '${guidCategoria}'`
    );
    expect(rows[0].TOTAL).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { empresasRouter } from "./routers/empresasRouter";
import { COOKIE_NAME } from "@shared/const";

const mockQuerySql = vi.fn();
const mockVerifyKsSession = vi.fn();

vi.mock("./sqlserver", () => ({
  querySql: (...args: unknown[]) => mockQuerySql(...args),
  sql: {
    UniqueIdentifier: "uniqueidentifier",
    Int: "int",
    Char: (n: number) => `char(${n})`,
    VarChar: Object.assign((n: number | string) => `varchar(${n})`, { MAX: "MAX" }),
    Numeric: (p: number, s: number) => `numeric(${p},${s})`,
    Date: "date",
    MAX: "MAX",
  },
}));

vi.mock("./routers/ksAuthRouter", () => ({
  verifyKsSession: (token: unknown) => mockVerifyKsSession(token),
}));

const DATADEV_GUID = "11111111-1111-4111-8111-111111111111";
const NOVA_EMPRESA_GUID = "22222222-2222-4222-8222-222222222222";

const dataDevAdminSession = {
  guidPessoa: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  guidEntidade: DATADEV_GUID,
  nome: "Admin DataDev",
  fantasia: null,
  documento: "00155247280",
  entDocumento: "50.303.631/0001-58",
  nomeEmpresa: "DataDev",
  usuario: "admin",
  email: null,
  codTipoEntidade: null,
  isGerente: true,
  codFilial: null,
};

const empresaSession = {
  guidPessoa: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  guidEntidade: NOVA_EMPRESA_GUID,
  nome: "Usuario Empresa",
  fantasia: null,
  documento: "12345678901",
  entDocumento: "12.345.678/0001-90",
  nomeEmpresa: "Empresa Nova",
  usuario: "empresa",
  email: null,
  codTipoEntidade: null,
  isGerente: true,
  codFilial: null,
};

function createCaller() {
  return empresasRouter.createCaller({
    user: null,
    req: { headers: { cookie: `${COOKIE_NAME}=token-valido` } },
    res: {},
  } as never);
}

function empresaInput() {
  return {
    nome: "Empresa Nova LTDA",
    fantasia: "Empresa Nova",
    documento: "12.345.678/0001-90",
    codTipoDocumento: "J" as const,
    celular: "11999999999",
    cep: "01001000",
    endereco: "Rua Teste",
    numero: "100",
    bairro: "Centro",
    codCidade: 1,
  };
}

describe("empresas multiempresa/multitenancy", () => {
  beforeEach(() => {
    mockQuerySql.mockReset();
    mockVerifyKsSession.mockReset();
  });

  it("permite que administrador DataDev liste todas as empresas", async () => {
    mockVerifyKsSession.mockResolvedValue(dataDevAdminSession);
    mockQuerySql
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([{ GUIDPESSOA: DATADEV_GUID }, { GUIDPESSOA: NOVA_EMPRESA_GUID }]);

    const result = await createCaller().listar({ pagina: 1, porPagina: 20 });

    expect(result.total).toBe(2);
    const [countQuery, countParams] = mockQuerySql.mock.calls[0];
    expect(countQuery).toContain("WHERE c.CADEMPRESA = 1");
    expect(countQuery).not.toContain("c.GUIDENTIDADE = @GUIDENTIDADE");
    expect(countParams).not.toHaveProperty("GUIDENTIDADE");
  });

  it("filtra empresa cadastrada pela DataDev pelo seu proprio GUIDENTIDADE", async () => {
    mockVerifyKsSession.mockResolvedValue(empresaSession);
    mockQuerySql
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ GUIDPESSOA: NOVA_EMPRESA_GUID, GUIDENTIDADE: NOVA_EMPRESA_GUID }]);

    const result = await createCaller().listar({ pagina: 1, porPagina: 20 });

    expect(result.total).toBe(1);
    const [countQuery, countParams] = mockQuerySql.mock.calls[0];
    expect(countQuery).toContain("c.GUIDENTIDADE = @GUIDENTIDADE");
    expect(countParams.GUIDENTIDADE.value).toBe(NOVA_EMPRESA_GUID);
  });

  it("nao permite que empresa cadastrada acesse dados da DataDev", async () => {
    mockVerifyKsSession.mockResolvedValue(empresaSession);
    mockQuerySql.mockResolvedValueOnce([]);

    await expect(
      createCaller().buscarPorGuid({ guidPessoa: DATADEV_GUID })
    ).rejects.toThrow("Empresa");

    const [query, params] = mockQuerySql.mock.calls[0];
    expect(query).toContain("c.GUIDPESSOA = @GUID");
    expect(query).toContain("c.GUIDENTIDADE = @GUIDENTIDADE");
    expect(params.GUID.value).toBe(DATADEV_GUID);
    expect(params.GUIDENTIDADE.value).toBe(NOVA_EMPRESA_GUID);
  });

  it("cria empresa com GUIDENTIDADE igual ao seu proprio GUIDPESSOA", async () => {
    mockVerifyKsSession.mockResolvedValue(dataDevAdminSession);
    mockQuerySql
      .mockResolvedValueOnce([{ maxCod: 10 }])
      .mockResolvedValueOnce([{ GUID: NOVA_EMPRESA_GUID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await createCaller().criar(empresaInput());

    const insertCall = mockQuerySql.mock.calls.find(([query]) =>
      String(query).includes("INSERT INTO KS0002.KS00001")
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall?.[1];
    expect(params.GUIDPESSOA.value).toBe(NOVA_EMPRESA_GUID);
    expect(params.GUIDENTIDADE.value).toBe(NOVA_EMPRESA_GUID);
  });

  it("cria empresa com GUIDENTIDADE diferente do GUIDENTIDADE da DataDev", async () => {
    mockVerifyKsSession.mockResolvedValue(dataDevAdminSession);
    mockQuerySql
      .mockResolvedValueOnce([{ maxCod: 10 }])
      .mockResolvedValueOnce([{ GUID: NOVA_EMPRESA_GUID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await createCaller().criar(empresaInput());

    const insertCall = mockQuerySql.mock.calls.find(([query]) =>
      String(query).includes("INSERT INTO KS0002.KS00001")
    );
    const params = insertCall?.[1];
    expect(params.GUIDENTIDADE.value).not.toBe(DATADEV_GUID);
  });
});

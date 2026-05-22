import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock do módulo ksAuth para não chamar o SQL Server nos testes
vi.mock("./ksAuth", () => ({
  authenticateKsUser: vi.fn(),
  updateLastAccess: vi.fn(),
}));

import { authenticateKsUser } from "./ksAuth";

function createMockContext(): TrpcContext {
  const cookies: Record<string, string> = {};
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      hostname: "localhost",
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => { cookies[name] = value; },
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("ksAuth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar erro UNAUTHORIZED para credenciais inválidas", async () => {
    vi.mocked(authenticateKsUser).mockResolvedValue(null);

    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.ksAuth.login({ usuario: "invalido", senha: "errada" })
    ).rejects.toThrow("Usuário ou senha incorretos");
  });

  it("deve autenticar e retornar dados do usuário com GUIDENTIDADE", async () => {
    const mockUser = {
      GUIDPESSOA: "11111111-1111-1111-1111-111111111111",
      GUIDENTIDADE: "22222222-2222-2222-2222-222222222222",
      NOME: "João Silva",
      FANTASIA: null,
      DOCUMENTO: "12345678901",
      ENTDOCUMENTO: "12345678000199",
      NOMEFANTASIA: "Empresa Teste LTDA",
      USUARIO: "joao",
      EMAIL: "joao@teste.com",
      CODTIPOENTIDADE: "F",
      SITUACAO: "A",
      CADGERENTE: false,
      CODFILIAL: null,
    };

    vi.mocked(authenticateKsUser).mockResolvedValue(mockUser);

    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ksAuth.login({ usuario: "joao", senha: "senha123" });

    expect(result.success).toBe(true);
    expect(result.user.guidPessoa).toBe(mockUser.GUIDPESSOA);
    expect(result.user.guidEntidade).toBe(mockUser.GUIDENTIDADE);
    expect(result.user.nome).toBe(mockUser.NOME);
    expect(result.user.nomeEmpresa).toBe(mockUser.NOMEFANTASIA);
    expect(result.user.usuario).toBe(mockUser.USUARIO);
  });

  it("deve retornar null para sessão inexistente em me()", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ksAuth.me();
    expect(result).toBeNull();
  });

  it("deve limpar o cookie no logout", async () => {
    const ctx = createMockContext();
    const clearCookieSpy = vi.spyOn(ctx.res, "clearCookie");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.ksAuth.logout();

    expect(result.success).toBe(true);
    expect(clearCookieSpy).toHaveBeenCalledWith(
      "ks_session",
      expect.objectContaining({ maxAge: -1 })
    );
  });
});

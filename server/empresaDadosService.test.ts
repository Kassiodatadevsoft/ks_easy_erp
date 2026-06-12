import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuerySql = vi.fn();

vi.mock("./sqlserver", () => ({
  querySql: (...args: unknown[]) => mockQuerySql(...args),
  sql: {
    UniqueIdentifier: "uniqueidentifier",
    DateTime: "datetime",
  },
}));

import { listarDadosEmpresaNf } from "./services/empresaDadosService";

const GUID_ENTIDADE = "22222222-2222-4222-8222-222222222222";

describe("listarDadosEmpresaNf", () => {
  beforeEach(() => {
    mockQuerySql.mockReset();
  });

  it("filtra obrigatoriamente por GUIDENTIDADE usando query parametrizada", async () => {
    mockQuerySql
      .mockResolvedValueOnce([{ existe: 1 }])
      .mockResolvedValueOnce([{ CODIGO: 10, CODENTIDADE: 20, GUIDENTIDADE: GUID_ENTIDADE, GUIDPESSOA: GUID_ENTIDADE }]);

    const result = await listarDadosEmpresaNf({ guidEntidade: GUID_ENTIDADE });

    expect(result).toEqual([expect.objectContaining({ CODIGO: 10, CODENTIDADE: 20 })]);
    const [query, params] = mockQuerySql.mock.calls[1];
    expect(query).toContain("CODIGO,");
    expect(query).toContain("CODENTIDADE,");
    expect(query).toContain("WHERE GUIDENTIDADE = @guidEntidade");
    expect(query).toContain("@ultimaAlteracao IS NULL");
    expect(params.guidEntidade.value).toBe(GUID_ENTIDADE);
    expect(params.ultimaAlteracao.value).toBeNull();
  });

  it("aplica filtro de ULTIMAALTERACAO quando informado", async () => {
    mockQuerySql
      .mockResolvedValueOnce([{ existe: 1 }])
      .mockResolvedValueOnce([]);

    const result = await listarDadosEmpresaNf({
      guidEntidade: GUID_ENTIDADE,
      ultimaAlteracao: "2025-01-01T00:00:00",
    });

    expect(result).toEqual([]);
    const [, params] = mockQuerySql.mock.calls[1];
    expect(params.ultimaAlteracao.value).toBeInstanceOf(Date);
    expect(Number.isNaN(params.ultimaAlteracao.value.getTime())).toBe(false);
  });

  it("retorna NOT_FOUND quando a entidade nao existe", async () => {
    mockQuerySql.mockResolvedValueOnce([]);

    await expect(
      listarDadosEmpresaNf({ guidEntidade: GUID_ENTIDADE })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockQuerySql).toHaveBeenCalledTimes(1);
  });

  it("rejeita GUID invalido antes da consulta", async () => {
    await expect(
      listarDadosEmpresaNf({ guidEntidade: "guid-invalido" })
    ).rejects.toThrow();

    expect(mockQuerySql).not.toHaveBeenCalled();
  });

  it("rejeita ultimaAlteracao invalida antes da consulta", async () => {
    await expect(
      listarDadosEmpresaNf({
        guidEntidade: GUID_ENTIDADE,
        ultimaAlteracao: "data-invalida",
      })
    ).rejects.toThrow();

    expect(mockQuerySql).not.toHaveBeenCalled();
  });
});

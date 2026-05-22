import { describe, it, expect } from "vitest";

describe("SQLSERVER_URL secret", () => {
  it("should have SQLSERVER_URL defined in environment", () => {
    // Validates that the secret was injected
    const url = process.env.SQLSERVER_URL;
    expect(url).toBeDefined();
    expect(typeof url).toBe("string");
    expect(url!.length).toBeGreaterThan(0);
  });

  it("should contain required connection parameters", () => {
    const url = process.env.SQLSERVER_URL ?? "";
    const lower = url.toLowerCase();
    // Must have at least a server/data source key OR be a valid mssql connection string
    // Aceita formato mssql://user:pass@host:port/db OU chave=valor
    const hasServer =
      lower.includes("server=") ||
      lower.includes("data source=") ||
      lower.includes("localhost") ||
      lower.includes("database=") ||
      lower.startsWith("mssql://") ||
      /mssql:\/\/.+@.+/.test(lower);
    expect(hasServer).toBe(true);
  });
});

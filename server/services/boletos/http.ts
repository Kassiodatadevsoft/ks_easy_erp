const SENSITIVE_KEYS = new Set([
  "access_token",
  "token",
  "client_secret",
  "password",
  "senha",
  "authorization",
  "api_key",
  "apikey",
]);

export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? "***" : maskSensitive(item),
    ])
  );
}

export async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configuração ausente: ${name}`);
  }
  return value;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<{ data: T; request: unknown; response: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = (await readJsonSafe(response)) as T;
  if (!response.ok) {
    throw new Error(extractApiMessage(data) ?? `API retornou HTTP ${response.status}`);
  }
  return { data, request: maskSensitive(body), response: maskSensitive(data) };
}

export async function getJson<T>(
  url: string,
  headers: Record<string, string>
): Promise<{ data: T; request: unknown; response: unknown }> {
  const response = await fetch(url, { headers });
  const data = (await readJsonSafe(response)) as T;
  if (!response.ok) {
    throw new Error(extractApiMessage(data) ?? `API retornou HTTP ${response.status}`);
  }
  return { data, request: { url }, response: maskSensitive(data) };
}

export async function deleteJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<{ data: T; request: unknown; response: unknown }> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = (await readJsonSafe(response)) as T;
  if (!response.ok) {
    throw new Error(extractApiMessage(data) ?? `API retornou HTTP ${response.status}`);
  }
  return { data, request: maskSensitive(body), response: maskSensitive(data) };
}

function extractApiMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of ["message", "mensagem", "error_description", "error"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  return null;
}

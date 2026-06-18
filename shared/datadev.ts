export const DATADEV_ADMIN_CNPJ = "50303631000158";

export const SISTEMA_SEGMENTOS = [
  "GERAL",
  "FOOD_DELIVERY",
  "LOJA_CELULAR",
  "ASSISTENCIA_TECNICA",
  "OUTROS",
] as const;

export type SistemaSegmento = typeof SISTEMA_SEGMENTOS[number];

export function normalizeCnpj(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function isDataDevAdminDocument(value: string | null | undefined) {
  return normalizeCnpj(value) === DATADEV_ADMIN_CNPJ;
}

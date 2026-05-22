/**
 * Dados do usuário KS armazenados na sessão JWT.
 * Capturados no momento do login contra KS0002.KS00001.
 */
export interface KsSessionUser {
  /** GUID único do usuário (PK da tabela KS00001) */
  guidPessoa: string;
  /** GUID da empresa vinculada ao usuário — usado para isolar dados */
  guidEntidade: string;
  /** Nome completo do usuário */
  nome: string;
  /** Nome fantasia do usuário (opcional) */
  fantasia: string | null;
  /** CPF/CNPJ do usuário */
  documento: string;
  /** CPF/CNPJ da empresa vinculada */
  entDocumento: string;
  /** Nome da empresa vinculada */
  nomeEmpresa: string | null;
  /** Login do usuário */
  usuario: string;
  /** E-mail do usuário */
  email: string | null;
  /** Tipo de entidade (E=Empresa, C=Cliente, F=Fornecedor, etc.) */
  codTipoEntidade: string | null;
  /** Indica se o usuário é gerente */
  isGerente: boolean;
  /** Código da filial */
  codFilial: number | null;
}

export type EntityType =
  | "todos"
  | "empresa"
  | "cliente"
  | "fornecedor"
  | "funcionario"
  | "transportadora";

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  todos: "Todos",
  empresa: "Empresa",
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  funcionario: "Funcionário",
  transportadora: "Transportadora",
};

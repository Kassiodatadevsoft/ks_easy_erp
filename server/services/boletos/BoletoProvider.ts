export type BoletoBanco = "ITAU" | "CORA";

export type BoletoStatus =
  | "NAO_EMITIDO"
  | "PENDENTE"
  | "REGISTRADO"
  | "PAGO"
  | "CANCELADO"
  | "VENCIDO"
  | "ERRO";

export type BoletoTitulo = {
  guidLancamento: string;
  descricao: string;
  valor: number;
  vencimento: string;
  nomeDevedor: string | null;
  documentoDevedor: string | null;
  emailDevedor: string | null;
  numeroDoc: string | null;
};

export type BoletoEmitido = {
  status: BoletoStatus;
  nossoNumero?: string | null;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  urlPdf?: string | null;
  externalId?: string | null;
  mensagemErro?: string | null;
  request: unknown;
  response: unknown;
};

export type BoletoConsulta = Omit<BoletoEmitido, "request"> & {
  request?: unknown;
};

export type BoletoCancelamento = {
  status: BoletoStatus;
  mensagemErro?: string | null;
  request: unknown;
  response: unknown;
};

export interface BoletoProvider {
  banco: BoletoBanco;
  emitir(titulo: BoletoTitulo): Promise<BoletoEmitido>;
  consultar(externalId: string): Promise<BoletoConsulta>;
  cancelar(externalId: string, motivo?: string): Promise<BoletoCancelamento>;
}

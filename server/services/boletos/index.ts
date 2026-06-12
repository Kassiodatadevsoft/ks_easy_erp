import type { BoletoBanco, BoletoProvider } from "./BoletoProvider";
import type { BoletoProviderConfig } from "./config";
import { CoraBoletoService } from "./CoraBoletoService";
import { ItauBoletoService } from "./ItauBoletoService";

export function getBoletoProvider(banco: BoletoBanco, config?: BoletoProviderConfig | null): BoletoProvider {
  if (banco === "ITAU") return new ItauBoletoService(config);
  if (banco === "CORA") return new CoraBoletoService(config);
  throw new Error("Banco emissor não suportado.");
}

export type {
  BoletoBanco,
  BoletoCancelamento,
  BoletoConsulta,
  BoletoEmitido,
  BoletoProvider,
  BoletoStatus,
  BoletoTitulo,
} from "./BoletoProvider";
export type { BoletoProviderConfig } from "./config";
export { getBoletoConfig, garantirCamposBoletoContaBancaria, encryptSecret } from "./config";

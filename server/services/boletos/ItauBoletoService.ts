import type {
  BoletoCancelamento,
  BoletoConsulta,
  BoletoEmitido,
  BoletoProvider,
  BoletoTitulo,
} from "./BoletoProvider";
import type { BoletoProviderConfig } from "./config";
import { deleteJson, getJson, postJson, requiredEnv } from "./http";

type ItauAuthResponse = { access_token: string; token_type?: string };
type ItauBoletoResponse = Record<string, any>;

export class ItauBoletoService implements BoletoProvider {
  banco = "ITAU" as const;

  private baseUrl: string;
  private tokenUrl: string;
  private emitirPath: string;
  private consultarPath: string;
  private cancelarPath: string;

  constructor(private config?: BoletoProviderConfig | null) {
    this.baseUrl = config?.apiUrl ?? process.env.ITAU_API_URL ?? "https://api.itau.com.br";
    this.tokenUrl = config?.tokenUrl ?? process.env.ITAU_TOKEN_URL ?? `${this.baseUrl}/oauth/token`;
    this.emitirPath = config?.emitirPath ?? process.env.ITAU_BOLETO_EMITIR_PATH ?? "/boletos";
    this.consultarPath = config?.consultarPath ?? process.env.ITAU_BOLETO_CONSULTAR_PATH ?? "/boletos/{id}";
    this.cancelarPath = config?.cancelarPath ?? process.env.ITAU_BOLETO_CANCELAR_PATH ?? "/boletos/{id}";
  }

  async emitir(titulo: BoletoTitulo): Promise<BoletoEmitido> {
    const token = await this.getToken();
    const body = {
      id_titulo_empresa: titulo.guidLancamento,
      numero_documento: titulo.numeroDoc ?? titulo.guidLancamento,
      valor: Number(titulo.valor).toFixed(2),
      data_vencimento: titulo.vencimento,
      pagador: {
        nome: titulo.nomeDevedor,
        documento: onlyDigits(titulo.documentoDevedor),
        email: titulo.emailDevedor,
      },
      mensagem: titulo.descricao,
    };

    const { data, request, response } = await postJson<ItauBoletoResponse>(
      this.url(this.emitirPath),
      body,
      { Authorization: `Bearer ${token}`, "x-itau-correlationID": titulo.guidLancamento }
    );

    return {
      status: mapItauStatus(data.status ?? data.situacao),
      nossoNumero: data.nosso_numero ?? data.nossoNumero ?? null,
      linhaDigitavel: data.linha_digitavel ?? data.linhaDigitavel ?? null,
      codigoBarras: data.codigo_barras ?? data.codigoBarras ?? null,
      urlPdf: data.url_pdf ?? data.pdf ?? data.boleto_pdf ?? null,
      externalId: data.id ?? data.id_boleto ?? data.nosso_numero ?? null,
      request,
      response,
    };
  }

  async consultar(externalId: string): Promise<BoletoConsulta> {
    const token = await this.getToken();
    const { data, request, response } = await getJson<ItauBoletoResponse>(
      this.url(this.consultarPath.replace("{id}", encodeURIComponent(externalId))),
      { Authorization: `Bearer ${token}` }
    );

    return {
      status: mapItauStatus(data.status ?? data.situacao),
      nossoNumero: data.nosso_numero ?? data.nossoNumero ?? null,
      linhaDigitavel: data.linha_digitavel ?? data.linhaDigitavel ?? null,
      codigoBarras: data.codigo_barras ?? data.codigoBarras ?? null,
      urlPdf: data.url_pdf ?? data.pdf ?? data.boleto_pdf ?? null,
      externalId: data.id ?? data.id_boleto ?? externalId,
      request,
      response,
    };
  }

  async cancelar(externalId: string, motivo?: string): Promise<BoletoCancelamento> {
    const token = await this.getToken();
    const body = { motivo: motivo ?? "Cancelado pelo ERP" };
    const { request, response } = await deleteJson<ItauBoletoResponse>(
      this.url(this.cancelarPath.replace("{id}", encodeURIComponent(externalId))),
      body,
      { Authorization: `Bearer ${token}` }
    );

    return { status: "CANCELADO", request, response };
  }

  private async getToken() {
    const clientId = this.config?.clientId ?? requiredEnv("ITAU_CLIENT_ID");
    const clientSecret = this.config?.clientSecret ?? requiredEnv("ITAU_CLIENT_SECRET");
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = (await response.json()) as ItauAuthResponse;
    if (!response.ok || !data.access_token) {
      throw new Error("Não foi possível autenticar na API Itaú.");
    }
    return data.access_token;
  }

  private url(path: string) {
    if (path.startsWith("http")) return path;
    return `${this.baseUrl}${path}`;
  }
}

function mapItauStatus(status: string | undefined) {
  const normalized = (status ?? "").toUpperCase();
  if (["PAGO", "LIQUIDADO", "BAIXADO"].includes(normalized)) return "PAGO";
  if (["CANCELADO", "BAIXA_CANCELAMENTO"].includes(normalized)) return "CANCELADO";
  if (["VENCIDO"].includes(normalized)) return "VENCIDO";
  if (["REGISTRADO", "ATIVO", "EMITIDO"].includes(normalized)) return "REGISTRADO";
  if (["PENDENTE", "EM_PROCESSAMENTO", "CRIADO"].includes(normalized)) return "PENDENTE";
  return "PENDENTE";
}

function onlyDigits(value: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

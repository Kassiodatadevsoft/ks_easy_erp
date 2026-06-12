import type {
  BoletoCancelamento,
  BoletoConsulta,
  BoletoEmitido,
  BoletoProvider,
  BoletoTitulo,
} from "./BoletoProvider";
import type { BoletoProviderConfig } from "./config";
import { deleteJson, getJson, postJson, requiredEnv } from "./http";

type CoraAuthResponse = { access_token: string; token_type?: string };
type CoraInvoiceResponse = Record<string, any>;

export class CoraBoletoService implements BoletoProvider {
  banco = "CORA" as const;

  private baseUrl: string;
  private tokenUrl: string;

  constructor(private config?: BoletoProviderConfig | null) {
    this.baseUrl = config?.apiUrl ?? process.env.CORA_API_URL ?? "https://api.cora.com.br";
    this.tokenUrl = config?.tokenUrl ?? process.env.CORA_TOKEN_URL ?? `${this.baseUrl}/oauth/token`;
  }

  async emitir(titulo: BoletoTitulo): Promise<BoletoEmitido> {
    const token = await this.getToken();
    const body = {
      code: titulo.guidLancamento,
      customer: {
        name: titulo.nomeDevedor,
        email: titulo.emailDevedor,
        document: {
          identity: onlyDigits(titulo.documentoDevedor),
          type: onlyDigits(titulo.documentoDevedor).length > 11 ? "CNPJ" : "CPF",
        },
      },
      services: [{ name: titulo.descricao, amount: toCents(titulo.valor) }],
      payment_terms: {
        due_date: titulo.vencimento,
        fine: { date: titulo.vencimento, amount: 0 },
        interest: { rate: 0 },
      },
      payment_forms: ["BANK_SLIP"],
    };

    const { data, request, response } = await postJson<CoraInvoiceResponse>(
      `${this.baseUrl}/v2/invoices`,
      body,
      { Authorization: `Bearer ${token}`, "Idempotency-Key": titulo.guidLancamento }
    );

    return {
      status: mapCoraStatus(data.status),
      nossoNumero: data.bank_slip?.our_number ?? data.our_number ?? null,
      linhaDigitavel: data.bank_slip?.digitable ?? data.digitable_line ?? null,
      codigoBarras: data.bank_slip?.barcode ?? data.barcode ?? null,
      urlPdf: data.bank_slip?.url ?? data.pdf ?? data.invoice_url ?? null,
      externalId: data.id ?? data.invoice_id ?? null,
      request,
      response,
    };
  }

  async consultar(externalId: string): Promise<BoletoConsulta> {
    const token = await this.getToken();
    const { data, request, response } = await getJson<CoraInvoiceResponse>(
      `${this.baseUrl}/v2/invoices/${externalId}`,
      { Authorization: `Bearer ${token}` }
    );

    return {
      status: mapCoraStatus(data.status),
      nossoNumero: data.bank_slip?.our_number ?? data.our_number ?? null,
      linhaDigitavel: data.bank_slip?.digitable ?? data.digitable_line ?? null,
      codigoBarras: data.bank_slip?.barcode ?? data.barcode ?? null,
      urlPdf: data.bank_slip?.url ?? data.pdf ?? data.invoice_url ?? null,
      externalId: data.id ?? externalId,
      request,
      response,
    };
  }

  async cancelar(externalId: string, motivo?: string): Promise<BoletoCancelamento> {
    const token = await this.getToken();
    const body = { reason: motivo ?? "Cancelado pelo ERP" };
    const { request, response } = await deleteJson<CoraInvoiceResponse>(
      `${this.baseUrl}/v2/invoices/${externalId}`,
      body,
      { Authorization: `Bearer ${token}` }
    );

    return { status: "CANCELADO", request, response };
  }

  private async getToken() {
    const clientId = this.config?.clientId ?? requiredEnv("CORA_CLIENT_ID");
    const clientSecret = this.config?.clientSecret ?? requiredEnv("CORA_CLIENT_SECRET");
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
    const data = (await response.json()) as CoraAuthResponse;
    if (!response.ok || !data.access_token) {
      throw new Error("Não foi possível autenticar na API Cora.");
    }
    return data.access_token;
  }
}

function mapCoraStatus(status: string | undefined) {
  const normalized = (status ?? "").toUpperCase();
  if (["PAID", "PAYMENT_CONFIRMED"].includes(normalized)) return "PAGO";
  if (["CANCELED", "CANCELLED"].includes(normalized)) return "CANCELADO";
  if (["OVERDUE", "LATE"].includes(normalized)) return "VENCIDO";
  if (["OPEN", "DRAFT", "CREATED"].includes(normalized)) return "PENDENTE";
  if (["REGISTERED", "ACTIVE"].includes(normalized)) return "REGISTRADO";
  return "PENDENTE";
}

function toCents(value: number) {
  return Math.round(Number(value) * 100);
}

function onlyDigits(value: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

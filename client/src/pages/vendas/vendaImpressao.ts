import { toast } from "sonner";

const FOOTER_TEXT = "Gerado pela empresa Data Consultoria e desenvolvimento de software | datadevsoft.com.br | Whatsapp (94) 98156-9059";
const LOGO_URL = "/logo.png";

export type VendaImpressao = {
  guidVenda: string;
  dataVenda: string;
  numeroVenda: number;
  cliente: string;
  vendedor: string;
  caixa: string;
  valorBruto: number;
  desconto: number;
  valorTotal: number;
  situacao: string;
  observacao?: string;
  justificativaCancelamento?: string;
};

export type VendaDetalheImpressao = {
  venda: VendaImpressao;
  itens: Array<{
    item: number;
    produto: string;
    quantidade: number;
    valorUnitario: number;
    desconto: number;
    valorTotal: number;
    vendedor: string;
    comissao: number;
    imei?: string;
    tamanho?: string;
    faixaPreco?: string;
    observacao?: string;
  }>;
  pagamentos: Array<{
    formaPagamento: string;
    valor: number;
    parcelas: number;
    contaFinanceira: string;
    situacaoFinanceiro: string;
  }>;
  financeiro: Array<{ guidLancamento: string; descricao: string; valor: number; valorRecebido: number; situacao: string; vencimento: string }>;
  comissoes: Array<{ guidMovimento: string; vendedor: string; descricao: string; valor: number; situacao: string }>;
  historico: Array<{ guidAuditoria: string; dataHora: string; acao: string; tabela: string; guidRegistro: string; observacao: string; identificacao: string; usuarioNome: string; usuario: string }>;
};

type EmpresaImpressao = {
  fantasia?: string | null;
  entDocumento?: string | null;
  documento?: string | null;
};

export type VendaImpressaoPayload = {
  modelo: string;
  empresa: EmpresaImpressao | null;
  dados: VendaDetalheImpressao;
};

function moeda(v: number) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHora(v?: string) {
  return v ? new Date(v).toLocaleString("pt-BR") : "-";
}

function esc(v: unknown) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function situacaoLabel(v?: string) {
  const s = String(v ?? "").toUpperCase();
  if (s === "F") return "Finalizada";
  if (s === "C") return "Cancelada";
  return v || "-";
}

function detalhesItem(item: VendaDetalheImpressao["itens"][number]) {
  return [item.tamanho && `Tamanho: ${item.tamanho}`, item.imei && `IMEI/Serie: ${item.imei}`, item.faixaPreco && `Faixa: ${item.faixaPreco}`, item.observacao]
    .filter(Boolean)
    .map((detalhe) => `<small>${esc(detalhe)}</small>`)
    .join("<br/>");
}

export function htmlImpressaoVenda(payload: VendaImpressaoPayload, nomeEmpresa?: string | null) {
  const { modelo, dados } = payload;
  const bobina = modelo === "BOBINA";
  const venda = dados.venda;
  const itens = dados.itens.map((i) => {
    const detalhes = detalhesItem(i);
    return bobina
      ? `<tr><td>${esc(i.produto)}${detalhes ? `<br/>${detalhes}` : ""}<br/><small>${Number(i.quantidade)} x ${esc(moeda(i.valorUnitario))}</small></td><td class="num">${esc(moeda(i.valorTotal))}</td></tr>`
      : `<tr><td>${i.item}</td><td>${esc(i.produto)}${detalhes ? `<br/>${detalhes}` : ""}</td><td class="num">${Number(i.quantidade).toLocaleString("pt-BR")}</td><td class="num">${esc(moeda(i.valorUnitario))}</td><td class="num">${esc(moeda(i.desconto))}</td><td class="num">${esc(moeda(i.valorTotal))}</td></tr>`;
  }).join("");
  const pagamentos = dados.pagamentos.map((p) => `<tr><td>${esc(p.formaPagamento)}</td><td class="num">${esc(moeda(p.valor))}</td><td class="num">${p.parcelas ?? 1}</td>${bobina ? "" : `<td>${esc(p.contaFinanceira)}</td><td>${esc(p.situacaoFinanceiro)}</td>`}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>venda_${esc(venda.numeroVenda)}</title><style>
      @page{size:${bobina ? "80mm auto" : "A4"};margin:${bobina ? "4mm" : "14mm 10mm 18mm"}}
      body{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:${bobina ? "10px" : "11px"};max-width:${bobina ? "72mm" : "none"}}
      .top{display:grid;grid-template-columns:${bobina ? "1fr" : "130px 1fr 220px"};gap:10px;align-items:start;margin-bottom:10px;text-align:${bobina ? "center" : "left"}}
      .logo{height:${bobina ? "28px" : "36px"};object-fit:contain}.title{text-align:center}.title h1{font-size:${bobina ? "14px" : "18px"};margin:0 0 4px;text-transform:uppercase}.company{text-align:${bobina ? "center" : "right"};font-size:10px;line-height:1.4}
      .box{border:1px solid #d1d5db;padding:7px;margin:8px 0}.grid{display:grid;grid-template-columns:${bobina ? "1fr" : "repeat(4,1fr)"};gap:5px 10px}
      table{border-collapse:collapse;width:100%;margin-top:8px}th{background:#f3f4f6;text-transform:uppercase;font-size:9px}th,td{border:1px solid #d1d5db;padding:5px;text-align:left;vertical-align:top}.num{text-align:right;white-space:nowrap}.totais{margin-top:10px;text-align:right;font-weight:700}.footer{margin-top:14px;border-top:1px solid #d1d5db;padding-top:6px;text-align:center;font-size:9px;font-weight:700}
    </style></head><body><section class="top"><img class="logo" src="${LOGO_URL}"/><div class="title"><h1>${bobina ? "Comprovante de Venda" : "Venda Finalizada"}</h1><p>Venda ${esc(venda.numeroVenda)} - ${esc(dataHora(venda.dataVenda))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? payload.empresa?.fantasia ?? "Empresa logada")}</strong><br/>${esc(payload.empresa?.entDocumento ?? payload.empresa?.documento ?? "")}</div></section><section class="box grid"><div><strong>Cliente:</strong> ${esc(venda.cliente)}</div><div><strong>Vendedor:</strong> ${esc(venda.vendedor)}</div><div><strong>Caixa:</strong> ${esc(venda.caixa)}</div><div><strong>Situação:</strong> ${esc(situacaoLabel(venda.situacao))}</div></section><table><thead><tr>${bobina ? "<th>Item</th><th class='num'>Total</th>" : "<th>#</th><th>Produto</th><th class='num'>Qtd</th><th class='num'>Unitário</th><th class='num'>Desc.</th><th class='num'>Total</th>"}</tr></thead><tbody>${itens || "<tr><td colspan='6'>Sem itens.</td></tr>"}</tbody></table><table><thead><tr><th>Forma</th><th class="num">Valor</th><th class="num">Parc.</th>${bobina ? "" : "<th>Conta financeira</th><th>Situação</th>"}</tr></thead><tbody>${pagamentos || `<tr><td colspan="${bobina ? 3 : 5}">Sem pagamentos.</td></tr>`}</tbody></table><div class="totais">Bruto: ${esc(moeda(venda.valorBruto))}<br/>Desconto: ${esc(moeda(venda.desconto))}<br/>Total: ${esc(moeda(venda.valorTotal))}</div><footer class="footer">${esc(FOOTER_TEXT)}</footer></body></html>`;
}

export async function buscarImpressaoVenda(guidVenda: string, modelo: "a4" | "bobina") {
  const res = await fetch(`/api/vendas-gerencial/${guidVenda}/impressao-${modelo}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.message ?? data?.mensagem ?? "Não foi possível gerar a impressão.");
  return data as VendaImpressaoPayload;
}

export async function imprimirVendaFinalizada(guidVenda: string, modelo: "a4" | "bobina", nomeEmpresa?: string | null) {
  const data = await buscarImpressaoVenda(guidVenda, modelo);
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    toast.error("Não foi possível abrir a impressão.");
    return;
  }
  win.document.open();
  win.document.write(htmlImpressaoVenda(data, nomeEmpresa));
  win.document.close();
  win.focus();
  win.onload = () => win.print();
}

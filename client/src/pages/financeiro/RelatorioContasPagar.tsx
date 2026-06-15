import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useKsAuth } from "@/hooks/useKsAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileDown, FileSpreadsheet, Printer, Search } from "lucide-react";
import { toast } from "sonner";

const LOGO = "/logo.png";
const FOOTER = "Gerado pela empresa Data Consultoria e Desenvolvimento de Software | datadevsoft.com.br | WhatsApp (94) 98156-9059";

type Linha = {
  documento: string | null; parcela: string; fornecedor: string | null; emissao: string; vencimento: string;
  dataPagamento: string | null; formaPagamento: string | null; contaFinanceira: string | null;
  naturezaFinanceira: string | null; centroCusto: string | null;
  valorOriginal: number; juros: number; multa: number; desconto: number; valorPago: number; saldo: number; situacao: string;
};
type Resultado = { dados: Linha[]; resumo: Record<string, number>; totais: Record<string, { nome: string; valor: number }[]> };

function hoje() { return new Date().toISOString().slice(0, 10); }
function mesInicio() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function ymd() { return hoje().replace(/-/g, ""); }
function br(d?: string | null) { if (!d) return "-"; const [a, m, dia] = d.slice(0, 10).split("-"); return dia && m && a ? `${dia}/${m}/${a}` : d; }
function moeda(v: number) { return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function perc(v: number) { return `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; }
function esc(v: unknown) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function baixar(nome: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

function options<T extends Record<string, unknown>>(items: T[] | undefined, value: string, label: string) {
  return (items ?? []).map((item) => <SelectItem key={String(item[value])} value={String(item[value])}>{String(item[label] ?? "")}</SelectItem>);
}

export default function RelatorioContasPagar() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(hoje());
  const [guidFornecedor, setGuidFornecedor] = useState("todos");
  const [guidConta, setGuidConta] = useState("todos");
  const [guidCentro, setGuidCentro] = useState("todos");
  const [guidNatureza, setGuidNatureza] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [situacao, setSituacao] = useState<"ABERTO" | "PAGO" | "VENCIDO" | "TODOS">("TODOS");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosContasPagar.useQuery();
  const params = {
    dtInicio, dtFim, situacao,
    guidFornecedor: guidFornecedor === "todos" ? undefined : guidFornecedor,
    guidConta: guidConta === "todos" ? undefined : guidConta,
    guidCentro: guidCentro === "todos" ? undefined : guidCentro,
    guidNatureza: guidNatureza === "todos" ? undefined : guidNatureza,
    guidFormaPagamento: guidFormaPagamento === "todos" ? undefined : guidFormaPagamento,
  };

  const filtroTexto = useMemo(() => [`Periodo: ${br(dtInicio)} a ${br(dtFim)}`, `Situacao: ${situacao}`], [dtInicio, dtFim, situacao]);

  async function carregar() {
    const data = await utils.financeiroRelatorios.contasPagarRelatorio.fetch(params);
    setResultado(data as Resultado);
    return data as Resultado;
  }

  async function pesquisar() { await carregar(); }

  function html(data = resultado) {
    const linhas = (data?.dados ?? []).map((l) => `<tr><td>${esc(l.documento ?? "-")}</td><td>${esc(l.parcela)}</td><td>${esc(l.fornecedor ?? "-")}</td><td>${esc(br(l.emissao))}</td><td>${esc(br(l.vencimento))}</td><td>${esc(br(l.dataPagamento))}</td><td>${esc(l.formaPagamento ?? "-")}</td><td>${esc(l.contaFinanceira ?? "-")}</td><td>${esc(l.naturezaFinanceira ?? "-")}</td><td>${esc(l.centroCusto ?? "-")}</td><td class="num">${esc(moeda(l.valorOriginal))}</td><td class="num">${esc(moeda(l.valorPago))}</td><td class="num">${esc(moeda(l.saldo))}</td><td>${esc(l.situacao)}</td></tr>`).join("");
    const totals = data?.totais ?? {};
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_contas_pagar_${ymd()}</title><style>@page{size:A4 landscape;margin:15mm 8mm 18mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 240px;gap:12px;align-items:start;margin-bottom:10px}.logo{height:36px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:17px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:9px;line-height:1.4}.filters{border:1px solid #d1d5db;border-radius:4px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px;padding:8px;margin:8px 0 10px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;text-transform:uppercase;font-size:9px}th,td{border:1px solid #d1d5db;padding:4px;text-align:left}.num{text-align:right;white-space:nowrap}.totais{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;page-break-inside:avoid}.totais div{border:1px solid #d1d5db;padding:6px}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 170px;gap:8px;align-items:center;padding-top:5px}.footer img{height:22px}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px}.page:after{content:counter(page) " / " counter(pages)}</style></head><body><section class="top"><img class="logo" src="${LOGO}"/><div class="title"><h1>Contas a Pagar</h1><p>${esc(br(dtInicio))} a ${esc(br(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtroTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><table><thead><tr><th>Documento</th><th>Parcela</th><th>Fornecedor</th><th>Emissao</th><th>Vencimento</th><th>Pagamento</th><th>Forma Pgto.</th><th>Conta</th><th>Natureza</th><th>Centro</th><th class="num">Original</th><th class="num">Pago</th><th class="num">Saldo</th><th>Situacao</th></tr></thead><tbody>${linhas || `<tr><td colspan="14">Nenhum dado encontrado.</td></tr>`}</tbody></table><section class="totais">${Object.entries(totals).map(([k, arr]) => `<div><strong>${esc(k)}</strong><br/>${arr.map((x) => `${esc(x.nome)}: ${esc(moeda(x.valor))}`).join("<br/>")}</div>`).join("")}</section><footer class="footer"><img src="${LOGO}"/><div class="footer-center">${esc(FOOTER)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
  }

  async function imprimir() {
    const data = resultado ?? await carregar();
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return toast.error("Nao foi possivel abrir a impressao.");
    win.document.open(); win.document.write(html(data)); win.document.close(); win.focus(); win.onload = () => win.print();
  }

  async function exportarExcel() {
    const data = resultado ?? await carregar();
    const rows = [
      ["Empresa", nomeEmpresa ?? user?.fantasia ?? ""],
      ["Relatorio", "Contas a Pagar"],
      ...filtroTexto.map((f) => [f]),
      [],
      ["Documento","Parcela","Fornecedor","Emissao","Vencimento","Data Pagamento","Forma de Pagamento","Conta Financeira","Natureza Financeira","Centro de Custo","Valor Original","Juros","Multa","Desconto","Valor Pago","Saldo","Situacao"],
      ...data.dados.map((l) => [l.documento ?? "", l.parcela, l.fornecedor ?? "", br(l.emissao), br(l.vencimento), br(l.dataPagamento), l.formaPagamento ?? "", l.contaFinanceira ?? "", l.naturezaFinanceira ?? "", l.centroCusto ?? "", l.valorOriginal, l.juros, l.multa, l.desconto, l.valorPago, l.saldo, l.situacao]),
    ];
    baixar(`relatorio_contas_pagar_${ymd()}.xls`, new Blob([`<html><meta charset="utf-8"/><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  const resumo = resultado?.resumo ?? {};
  const cards = [
    ["Quantidade de Titulos", resumo.quantidadeTitulos ?? 0, false],
    ["Total em Aberto", resumo.totalAberto ?? 0, true],
    ["Total Pago", resumo.totalPago ?? 0, true],
    ["Total Vencido", resumo.totalVencido ?? 0, true],
    ["Valor a Pagar Hoje", resumo.valorAPagarHoje ?? 0, true],
    ["Valor a Vencer", resumo.valorAVencer ?? 0, true],
    ["Inadimplencia", resumo.inadimplenciaPercentual ?? 0, false],
    ["Valor Total Geral", resumo.valorTotalGeral ?? 0, true],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div><h1 className="text-2xl font-bold">Contas a Pagar</h1><p className="text-sm text-muted-foreground">Despesas, obrigacoes, vencidos e totais dinamicos da empresa logada.</p></div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label>Fornecedor</Label><Select value={guidFornecedor} onValueChange={setGuidFornecedor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{options(filtros?.fornecedores, "guidFornecedor", "nome")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Conta Financeira</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{options(filtros?.contas, "guidConta", "nome")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Centro de Custo</Label><Select value={guidCentro} onValueChange={setGuidCentro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{options(filtros?.centros, "guidCentro", "nome")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Natureza Financeira</Label><Select value={guidNatureza} onValueChange={setGuidNatureza}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{options(filtros?.naturezas, "guidNatureza", "nome")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Forma de Pagamento</Label><Select value={guidFormaPagamento} onValueChange={setGuidFormaPagamento}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{options(filtros?.formas, "guidFormaPagamento", "nome")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Situacao</Label><Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ABERTO">Aberto</SelectItem><SelectItem value="PAGO">Pago</SelectItem><SelectItem value="VENCIDO">Vencido</SelectItem><SelectItem value="TODOS">Todos</SelectItem></SelectContent></Select></div>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-4"><Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button><Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, money]) => <Card key={label}><CardHeader className="py-3"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{label === "Inadimplencia" ? perc(Number(value)) : money ? moeda(Number(value)) : Number(value).toLocaleString("pt-BR")}</p></CardContent></Card>)}</div>
      <Card><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Parcela</TableHead><TableHead>Fornecedor</TableHead><TableHead>Vencimento</TableHead><TableHead>Forma Pgto.</TableHead><TableHead>Conta</TableHead><TableHead>Natureza</TableHead><TableHead>Centro</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="text-right">Pago</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Situacao</TableHead></TableRow></TableHeader><TableBody>{!resultado ? <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Clique em Pesquisar para carregar o relatorio.</TableCell></TableRow> : resultado.dados.length === 0 ? <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">Nenhum dado encontrado.</TableCell></TableRow> : resultado.dados.map((l) => <TableRow key={`${l.documento}-${l.parcela}-${l.vencimento}`}><TableCell>{l.documento ?? "-"}</TableCell><TableCell>{l.parcela}</TableCell><TableCell>{l.fornecedor ?? "-"}</TableCell><TableCell>{br(l.vencimento)}</TableCell><TableCell>{l.formaPagamento ?? "-"}</TableCell><TableCell>{l.contaFinanceira ?? "-"}</TableCell><TableCell>{l.naturezaFinanceira ?? "-"}</TableCell><TableCell>{l.centroCusto ?? "-"}</TableCell><TableCell className="text-right">{moeda(l.valorOriginal)}</TableCell><TableCell className="text-right">{moeda(l.valorPago)}</TableCell><TableCell className="text-right">{moeda(l.saldo)}</TableCell><TableCell>{l.situacao}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}

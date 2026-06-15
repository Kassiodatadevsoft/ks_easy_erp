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
  data: string; documento: string | null; historico: string; origem: string; clienteFornecedor: string | null;
  contaFinanceira: string | null; caixa: string | null; formaPagamento: string | null;
  entrada: number; saida: number; saldoAcumulado: number;
};
type Resultado = { dados: Linha[]; resumo: { saldoInicial: number; totalEntradas: number; totalSaidas: number; saldoFinal: number } };

function hoje() { return new Date().toISOString().slice(0, 10); }
function mesInicio() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function ymd() { return hoje().replace(/-/g, ""); }
function br(d?: string | null) { if (!d) return "-"; const [a, m, dia] = d.slice(0, 10).split("-"); return dia && m && a ? `${dia}/${m}/${a}` : d; }
function moeda(v: number) { return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function esc(v: unknown) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function baixar(nome: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function opts<T extends Record<string, unknown>>(items: T[] | undefined, value: string, label = "nome") {
  return (items ?? []).map((item) => <SelectItem key={String(item[value])} value={String(item[value])}>{String(item[label] ?? "")}</SelectItem>);
}

export default function RelatorioExtratoFluxoCaixa() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(hoje());
  const [guidConta, setGuidConta] = useState("todos");
  const [guidCaixa, setGuidCaixa] = useState("todos");
  const [guidCentro, setGuidCentro] = useState("todos");
  const [guidNatureza, setGuidNatureza] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosExtratoFluxoCaixa.useQuery();
  const params = {
    dtInicio, dtFim,
    guidConta: guidConta === "todos" ? undefined : guidConta,
    guidCaixa: guidCaixa === "todos" ? undefined : guidCaixa,
    guidCentro: guidCentro === "todos" ? undefined : guidCentro,
    guidNatureza: guidNatureza === "todos" ? undefined : guidNatureza,
    guidFormaPagamento: guidFormaPagamento === "todos" ? undefined : guidFormaPagamento,
  };
  const filtroTexto = useMemo(() => [`Periodo: ${br(dtInicio)} a ${br(dtFim)}`], [dtInicio, dtFim]);

  async function carregar() {
    const data = await utils.financeiroRelatorios.extratoFluxoCaixa.fetch(params);
    setResultado(data as Resultado);
    return data as Resultado;
  }

  async function pesquisar() { await carregar(); }

  function html(data = resultado) {
    const linhas = (data?.dados ?? []).map((l) => `<tr><td>${esc(br(l.data))}</td><td>${esc(l.documento ?? "-")}</td><td>${esc(l.historico)}</td><td>${esc(l.origem)}</td><td>${esc(l.clienteFornecedor ?? "-")}</td><td>${esc(l.contaFinanceira ?? "-")}</td><td>${esc(l.formaPagamento ?? "-")}</td><td class="num">${esc(l.entrada ? moeda(l.entrada) : "-")}</td><td class="num">${esc(l.saida ? moeda(l.saida) : "-")}</td><td class="num">${esc(moeda(l.saldoAcumulado))}</td></tr>`).join("");
    const r = data?.resumo;
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_extrato_fluxo_caixa_${ymd()}</title><style>@page{size:A4 landscape;margin:15mm 8mm 18mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 240px;gap:12px;align-items:start;margin-bottom:10px}.logo{height:36px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:17px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:9px;line-height:1.4}.filters{border:1px solid #d1d5db;border-radius:4px;padding:8px;margin:8px 0 10px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;text-transform:uppercase;font-size:9px}th,td{border:1px solid #d1d5db;padding:4px;text-align:left}.num{text-align:right;white-space:nowrap}.totais{display:flex;justify-content:flex-end;gap:14px;margin-top:10px;font-weight:700}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 170px;gap:8px;align-items:center;padding-top:5px}.footer img{height:22px}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px}.page:after{content:counter(page) " / " counter(pages)}</style></head><body><section class="top"><img class="logo" src="${LOGO}"/><div class="title"><h1>Extrato de Fluxo de Caixa</h1><p>${esc(br(dtInicio))} a ${esc(br(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtroTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><table><thead><tr><th>Data</th><th>Documento</th><th>Historico</th><th>Origem</th><th>Cliente/Fornecedor</th><th>Conta Financeira</th><th>Forma Pgto.</th><th class="num">Entrada</th><th class="num">Saida</th><th class="num">Saldo</th></tr></thead><tbody>${linhas || `<tr><td colspan="10">Nenhum dado encontrado.</td></tr>`}</tbody></table><div class="totais"><span>Saldo Inicial: ${esc(moeda(r?.saldoInicial ?? 0))}</span><span>Entradas: ${esc(moeda(r?.totalEntradas ?? 0))}</span><span>Saidas: ${esc(moeda(r?.totalSaidas ?? 0))}</span><span>Saldo Final: ${esc(moeda(r?.saldoFinal ?? 0))}</span></div><footer class="footer"><img src="${LOGO}"/><div class="footer-center">${esc(FOOTER)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
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
      ["Relatorio", "Extrato de Fluxo de Caixa"],
      ...filtroTexto.map((f) => [f]),
      [],
      ["Data","Documento","Historico","Origem","Cliente/Fornecedor","Conta Financeira","Caixa","Forma de Pagamento","Entrada","Saida","Saldo Acumulado"],
      ...data.dados.map((l) => [br(l.data), l.documento ?? "", l.historico, l.origem, l.clienteFornecedor ?? "", l.contaFinanceira ?? "", l.caixa ?? "", l.formaPagamento ?? "", l.entrada, l.saida, l.saldoAcumulado]),
      [],
      ["Saldo Inicial", data.resumo.saldoInicial],
      ["Total Entradas", data.resumo.totalEntradas],
      ["Total Saidas", data.resumo.totalSaidas],
      ["Saldo Final", data.resumo.saldoFinal],
    ];
    baixar(`relatorio_extrato_fluxo_caixa_${ymd()}.xls`, new Blob([`<html><meta charset="utf-8"/><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  const resumo = resultado?.resumo ?? { saldoInicial: 0, totalEntradas: 0, totalSaidas: 0, saldoFinal: 0 };
  const cards = [["Saldo Inicial", resumo.saldoInicial], ["Total Entradas", resumo.totalEntradas], ["Total Saídas", resumo.totalSaidas], ["Saldo Final", resumo.saldoFinal]] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div><h1 className="text-2xl font-bold">Extrato de Fluxo de Caixa</h1><p className="text-sm text-muted-foreground">Extrato analitico das movimentacoes financeiras baseado no fluxo operacional.</p></div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label>Conta Financeira</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.contas, "guidConta")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Caixa</Label><Select value={guidCaixa} onValueChange={setGuidCaixa}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.caixas, "guidCaixa")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Centro de Custo</Label><Select value={guidCentro} onValueChange={setGuidCentro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.centros, "guidCentro")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Natureza Financeira</Label><Select value={guidNatureza} onValueChange={setGuidNatureza}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.naturezas, "guidNatureza")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Forma de Pagamento</Label><Select value={guidFormaPagamento} onValueChange={setGuidFormaPagamento}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.formas, "guidFormaPagamento")}</SelectContent></Select></div>
        <div className="flex flex-wrap items-end gap-2"><Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button><Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <Card key={label}><CardHeader className="py-3"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{moeda(value)}</p></CardContent></Card>)}</div>
      <Card><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Documento</TableHead><TableHead>Histórico</TableHead><TableHead>Origem</TableHead><TableHead>Cliente/Fornecedor</TableHead><TableHead>Conta</TableHead><TableHead>Forma Pgto.</TableHead><TableHead className="text-right">Entrada</TableHead><TableHead className="text-right">Saída</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader><TableBody>{!resultado ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Clique em Pesquisar para carregar o relatorio.</TableCell></TableRow> : resultado.dados.length === 0 ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum dado encontrado.</TableCell></TableRow> : resultado.dados.map((l) => <TableRow key={`${l.data}-${l.documento}-${l.historico}`}><TableCell>{br(l.data)}</TableCell><TableCell>{l.documento ?? "-"}</TableCell><TableCell>{l.historico}</TableCell><TableCell>{l.origem}</TableCell><TableCell>{l.clienteFornecedor ?? "-"}</TableCell><TableCell>{l.contaFinanceira ?? "-"}</TableCell><TableCell>{l.formaPagamento ?? "-"}</TableCell><TableCell className="text-right">{l.entrada ? moeda(l.entrada) : "-"}</TableCell><TableCell className="text-right">{l.saida ? moeda(l.saida) : "-"}</TableCell><TableCell className="text-right">{moeda(l.saldoAcumulado)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}

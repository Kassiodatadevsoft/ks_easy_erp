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

const LOGO_RELATORIO = "/logo.png";
const FOOTER_TEXT = "Gerado pela empresa Data Consultoria e Desenvolvimento de Software | datadevsoft.com.br | WhatsApp (94) 98156-9059";

type Linha = { formaPagamento: string; quantidadeVendas: number; valorTotal: number; percentual: number };
type Opcao = Record<string, string | number | null>;

function hoje() { return new Date().toISOString().slice(0, 10); }
function primeiroDiaMes() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function yyyymmdd() { return hoje().replace(/-/g, ""); }
function moeda(v: number) { return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(v: number) { return `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; }
function dataBr(v: string) { const [a, m, d] = v.split("-"); return d && m && a ? `${d}/${m}/${a}` : v; }
function esc(v: unknown) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RelatorioVendasFormaPagamento() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(primeiroDiaMes());
  const [dtFim, setDtFim] = useState(hoje());
  const [guidCaixa, setGuidCaixa] = useState("todos");
  const [guidVendedor, setGuidVendedor] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [guidCliente, setGuidCliente] = useState("todos");
  const [situacao, setSituacao] = useState("todos");
  const [resultado, setResultado] = useState<{ dados: Linha[]; totalGeral: number; quantidadeVendas: number } | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosVendasFormaPagamento.useQuery();
  const params = {
    dtInicio,
    dtFim,
    guidCaixa: guidCaixa === "todos" ? undefined : guidCaixa,
    guidVendedor: guidVendedor === "todos" ? undefined : guidVendedor,
    guidFormaPagamento: guidFormaPagamento === "todos" ? undefined : guidFormaPagamento,
    guidCliente: guidCliente === "todos" ? undefined : guidCliente,
    situacao: situacao === "todos" ? undefined : situacao,
  };

  const totaisPorForma = useMemo(() => {
    const base: Record<string, number> = {};
    for (const row of resultado?.dados ?? []) {
      base[row.formaPagamento] = (base[row.formaPagamento] ?? 0) + row.valorTotal;
    }
    return base;
  }, [resultado]);

  async function pesquisar() {
    const data = await utils.financeiroRelatorios.vendasFormaPagamento.fetch(params);
    setResultado(data);
  }

  function nomeOpcao(lista: Opcao[] | undefined, id: string, key: string, label: string) {
    if (id === "todos") return "Todos";
    return String(lista?.find((item) => item[key] === id)?.[label] ?? id);
  }

  const filtrosTexto = [
    `Periodo: ${dataBr(dtInicio)} a ${dataBr(dtFim)}`,
    `Caixa: ${nomeOpcao(filtros?.caixas, guidCaixa, "guidCaixa", "descricao")}`,
    `Vendedor: ${nomeOpcao(filtros?.vendedores, guidVendedor, "guidVendedor", "nome")}`,
    `Forma de pagamento: ${nomeOpcao(filtros?.formas, guidFormaPagamento, "guidFormaPagamento", "descricao")}`,
    `Cliente: ${nomeOpcao(filtros?.clientes, guidCliente, "guidCliente", "nome")}`,
    `Situacao: ${situacao === "todos" ? "Finalizadas" : situacao}`,
  ];

  function htmlRelatorio(data = resultado) {
    const linhas = (data?.dados ?? []).map((row) => `<tr><td>${esc(row.formaPagamento)}</td><td class="num">${row.quantidadeVendas}</td><td class="num">${esc(moeda(row.valorTotal))}</td><td class="num">${esc(pct(row.percentual))}</td></tr>`).join("");
    const totais = Object.entries(totaisPorForma).map(([k, v]) => `<span>${esc(k)}: <strong>${esc(moeda(v))}</strong></span>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_vendas_forma_pagamento_${yyyymmdd()}</title><style>
      @page{size:A4;margin:18mm 10mm 20mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 220px;gap:12px;align-items:start;margin-bottom:12px}.logo{height:38px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:18px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:10px;line-height:1.45}.filters{border:1px solid #d1d5db;border-radius:4px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px;padding:8px;margin:10px 0 12px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;text-transform:uppercase;font-size:10px}th,td{border:1px solid #d1d5db;padding:6px;text-align:left}.num{text-align:right;white-space:nowrap}.totais{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-end;margin-top:12px}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 150px;gap:8px;align-items:center;padding-top:6px}.footer img{height:22px;object-fit:contain}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px;line-height:1.4}.page:after{content:counter(page) " / " counter(pages)}
    </style></head><body><main><section class="top"><img class="logo" src="${LOGO_RELATORIO}"/><div class="title"><h1>Vendas por Forma de Pagamento</h1><p>${esc(dataBr(dtInicio))} a ${esc(dataBr(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtrosTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><table><thead><tr><th>Forma de pagamento</th><th class="num">Quantidade de vendas</th><th class="num">Valor total</th><th class="num">Percentual</th></tr></thead><tbody>${linhas || `<tr><td colspan="4">Nenhum dado encontrado.</td></tr>`}</tbody></table><div class="totais">${totais}<span>Total Geral: <strong>${esc(moeda(data?.totalGeral ?? 0))}</strong></span></div></main><footer class="footer"><img src="${LOGO_RELATORIO}"/><div class="footer-center">${esc(FOOTER_TEXT)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
  }

  async function imprimir() {
    const data = resultado ?? await utils.financeiroRelatorios.vendasFormaPagamento.fetch(params);
    setResultado(data);
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return toast.error("Nao foi possivel abrir a impressao.");
    win.document.open(); win.document.write(htmlRelatorio(data)); win.document.close(); win.focus(); win.onload = () => win.print();
  }

  async function exportarExcel() {
    const data = resultado ?? await utils.financeiroRelatorios.vendasFormaPagamento.fetch(params);
    setResultado(data);
    const rows = [
      ["Empresa", nomeEmpresa ?? user?.fantasia ?? ""],
      ["Relatorio", "Vendas por Forma de Pagamento"],
      ...filtrosTexto.map((f) => [f, ""]),
      [],
      ["Forma de Pagamento", "Quantidade de Vendas", "Valor Total", "Percentual"],
      ...data.dados.map((r) => [r.formaPagamento, r.quantidadeVendas, r.valorTotal, `${r.percentual.toFixed(2)}%`]),
      [],
      ...Object.entries(totaisPorForma).map(([k, v]) => [k, "", v, ""]),
      ["Total Geral", "", data.totalGeral, ""],
    ];
    const html = `<html><head><meta charset="utf-8"/></head><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    baixar(`relatorio_vendas_forma_pagamento_${yyyymmdd()}.xls`, new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div><h1 className="text-2xl font-bold">Vendas por Forma de Pagamento</h1><p className="text-sm text-muted-foreground">Vendas finalizadas agrupadas pelas formas cadastradas da empresa logada.</p></div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label>Caixa</Label><Select value={guidCaixa} onValueChange={setGuidCaixa}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{(filtros?.caixas ?? []).map((c: any) => <SelectItem key={c.guidCaixa} value={c.guidCaixa}>{c.descricao}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Vendedor</Label><Select value={guidVendedor} onValueChange={setGuidVendedor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{(filtros?.vendedores ?? []).map((v: any) => <SelectItem key={v.guidVendedor} value={v.guidVendedor}>{v.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Forma de Pagamento</Label><Select value={guidFormaPagamento} onValueChange={setGuidFormaPagamento}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{(filtros?.formas ?? []).map((f: any) => <SelectItem key={f.guidFormaPagamento} value={f.guidFormaPagamento}>{f.descricao}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Cliente</Label><Select value={guidCliente} onValueChange={setGuidCliente}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{(filtros?.clientes ?? []).map((c: any) => <SelectItem key={c.guidCliente} value={c.guidCliente}>{c.nome}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Situação da Venda</Label><Select value={situacao} onValueChange={setSituacao}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Finalizadas</SelectItem>{(filtros?.situacoes ?? []).map((s: any) => <SelectItem key={s.situacao} value={s.situacao}>{s.situacao}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-wrap items-end gap-2"><Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button><Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(totaisPorForma).map(([k, v]) => (
          <Card key={k}>
            <CardHeader className="py-3"><CardTitle className="text-sm">{k}</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold">{moeda(v)}</p></CardContent>
          </Card>
        ))}
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Total Geral</CardTitle></CardHeader><CardContent><p className="text-lg font-bold">{moeda(resultado?.totalGeral ?? 0)}</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Forma de Pagamento</TableHead><TableHead className="text-right">Quantidade de Vendas</TableHead><TableHead className="text-right">Valor Total</TableHead><TableHead className="text-right">Percentual</TableHead></TableRow></TableHeader><TableBody>{!resultado ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Clique em Pesquisar para carregar o relatório.</TableCell></TableRow> : resultado.dados.length === 0 ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum dado encontrado.</TableCell></TableRow> : resultado.dados.map((row) => <TableRow key={row.formaPagamento}><TableCell className="font-medium">{row.formaPagamento}</TableCell><TableCell className="text-right">{row.quantidadeVendas}</TableCell><TableCell className="text-right">{moeda(row.valorTotal)}</TableCell><TableCell className="text-right">{pct(row.percentual)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}

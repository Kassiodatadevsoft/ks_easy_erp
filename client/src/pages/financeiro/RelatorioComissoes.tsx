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
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const LOGO = "/logo.png";
const FOOTER = "Gerado pela empresa Data Consultoria e Desenvolvimento de Software | datadevsoft.com.br | WhatsApp (94) 98156-9059";

type Linha = {
  guidMovimento: string;
  data: string;
  venda: string | null;
  guidVenda: string | null;
  cliente: string | null;
  vendedor: string | null;
  percentualComissao: number;
  baseCalculo: number;
  valorComissao: number;
  valorPago: number;
  saldo: number;
  dataPagamento: string | null;
  situacao: string;
  periodo: string;
};

type TotalVendedor = {
  vendedor: string;
  quantidadeVendas: number;
  valorVendido: number;
  comissaoGerada: number;
  comissaoPaga: number;
  comissaoPendente: number;
};

type Resultado = {
  dados: Linha[];
  resumo: Record<string, number>;
  totaisPorVendedor: TotalVendedor[];
  rankingComissao: TotalVendedor[];
  rankingValorVendido: TotalVendedor[];
  graficos: {
    comissaoPorVendedor: { nome: string; valor: number }[];
    pagoPendente: { nome: string; valor: number }[];
    evolucaoMensal: { periodo: string; comissaoGerada: number; comissaoPaga: number }[];
  };
};

function hoje() { return new Date().toISOString().slice(0, 10); }
function mesInicio() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function ymd() { return hoje().replace(/-/g, ""); }
function br(d?: string | null) { if (!d) return "-"; const [a, m, dia] = d.slice(0, 10).split("-"); return dia && m && a ? `${dia}/${m}/${a}` : d; }
function moeda(v: number) { return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function perc(v: number) { return `${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`; }
function esc(v: unknown) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function baixar(nome: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

function opts<T extends Record<string, unknown>>(items: T[] | undefined, value: string, label = "nome") {
  return (items ?? []).map((item) => <SelectItem key={String(item[value])} value={String(item[value])}>{String(item[label] ?? "")}</SelectItem>);
}

export default function RelatorioComissoes() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(hoje());
  const [guidVendedor, setGuidVendedor] = useState("todos");
  const [situacao, setSituacao] = useState<"PENDENTE" | "PAGO" | "PARCIAL" | "TODOS">("TODOS");
  const [guidVenda, setGuidVenda] = useState("todos");
  const [guidCliente, setGuidCliente] = useState("todos");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosComissoes.useQuery();
  const params = {
    dtInicio,
    dtFim,
    situacao,
    guidVendedor: guidVendedor === "todos" ? undefined : guidVendedor,
    guidVenda: guidVenda === "todos" ? undefined : guidVenda,
    guidCliente: guidCliente === "todos" ? undefined : guidCliente,
  };

  const filtroTexto = useMemo(() => [
    `Periodo: ${br(dtInicio)} a ${br(dtFim)}`,
    `Situacao: ${situacao}`,
  ], [dtInicio, dtFim, situacao]);

  async function carregar() {
    const data = await utils.financeiroRelatorios.comissoesRelatorio.fetch(params);
    setResultado(data as Resultado);
    return data as Resultado;
  }

  async function pesquisar() { await carregar(); }

  function html(data = resultado) {
    const linhas = (data?.dados ?? []).map((l) => `<tr><td>${esc(br(l.data))}</td><td>${esc(l.venda ?? "-")}</td><td>${esc(l.cliente ?? "-")}</td><td>${esc(l.vendedor ?? "-")}</td><td class="num">${esc(perc(l.percentualComissao))}</td><td class="num">${esc(moeda(l.baseCalculo))}</td><td class="num">${esc(moeda(l.valorComissao))}</td><td class="num">${esc(moeda(l.valorPago))}</td><td class="num">${esc(moeda(l.saldo))}</td><td>${esc(br(l.dataPagamento))}</td><td>${esc(l.situacao)}</td></tr>`).join("");
    const r = data?.resumo ?? {};
    const vendedores = data?.totaisPorVendedor ?? [];
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_comissoes_${ymd()}</title><style>@page{size:A4 landscape;margin:15mm 8mm 18mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 240px;gap:12px;align-items:start;margin-bottom:10px}.logo{height:36px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:17px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:9px;line-height:1.4}.filters{border:1px solid #d1d5db;border-radius:4px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px;padding:8px;margin:8px 0 10px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;text-transform:uppercase;font-size:9px}th,td{border:1px solid #d1d5db;padding:4px;text-align:left}.num{text-align:right;white-space:nowrap}.totais{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;page-break-inside:avoid}.totais div{border:1px solid #d1d5db;padding:6px}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 170px;gap:8px;align-items:center;padding-top:5px}.footer img{height:22px}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px}.page:after{content:counter(page) " / " counter(pages)}</style></head><body><section class="top"><img class="logo" src="${LOGO}"/><div class="title"><h1>Comissoes</h1><p>${esc(br(dtInicio))} a ${esc(br(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtroTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><table><thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Vendedor</th><th class="num">% Comissao</th><th class="num">Base</th><th class="num">Comissao</th><th class="num">Pago</th><th class="num">Saldo</th><th>Pagamento</th><th>Situacao</th></tr></thead><tbody>${linhas || `<tr><td colspan="11">Nenhum dado encontrado.</td></tr>`}</tbody></table><section class="totais"><div><strong>Total Geral</strong><br/>${esc(moeda(r.totalGeral ?? 0))}</div><div><strong>Total Pago</strong><br/>${esc(moeda(r.totalPago ?? 0))}</div><div><strong>Total Pendente</strong><br/>${esc(moeda((r.totalPendente ?? 0) + (r.totalParcial ?? 0)))}</div><div><strong>Vendedores</strong><br/>${esc(r.quantidadeVendedores ?? 0)}</div>${vendedores.slice(0, 8).map((v) => `<div><strong>${esc(v.vendedor)}</strong><br/>Vendas: ${esc(v.quantidadeVendas)}<br/>Vendido: ${esc(moeda(v.valorVendido))}<br/>Comissao: ${esc(moeda(v.comissaoGerada))}</div>`).join("")}</section><footer class="footer"><img src="${LOGO}"/><div class="footer-center">${esc(FOOTER)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
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
      ["Relatorio", "Comissoes"],
      ...filtroTexto.map((f) => [f]),
      [],
      ["Data","Venda","Cliente","Vendedor","Percentual Comissao","Base de Calculo","Valor Comissao","Valor Pago","Saldo","Data Pagamento","Situacao"],
      ...data.dados.map((l) => [br(l.data), l.venda ?? "", l.cliente ?? "", l.vendedor ?? "", l.percentualComissao, l.baseCalculo, l.valorComissao, l.valorPago, l.saldo, br(l.dataPagamento), l.situacao]),
      [],
      ["Total Geral", data.resumo.totalGeral ?? 0],
      ["Total Pago", data.resumo.totalPago ?? 0],
      ["Total Pendente", (data.resumo.totalPendente ?? 0) + (data.resumo.totalParcial ?? 0)],
      ["Quantidade de Vendedores", data.resumo.quantidadeVendedores ?? 0],
      [],
      ["Totais por Vendedor"],
      ["Vendedor","Quantidade de Vendas","Valor Vendido","Comissao Gerada","Comissao Paga","Comissao Pendente"],
      ...data.totaisPorVendedor.map((v) => [v.vendedor, v.quantidadeVendas, v.valorVendido, v.comissaoGerada, v.comissaoPaga, v.comissaoPendente]),
    ];
    baixar(`relatorio_comissoes_${ymd()}.xls`, new Blob([`<html><meta charset="utf-8"/><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  const resumo = resultado?.resumo ?? {};
  const cards = [
    ["Quantidade de Comissoes", resumo.quantidadeComissoes ?? 0, "number"],
    ["Total de Comissoes", resumo.totalComissoes ?? 0, "money"],
    ["Total Pendente", resumo.totalPendente ?? 0, "money"],
    ["Total Pago", resumo.totalPago ?? 0, "money"],
    ["Total Parcial", resumo.totalParcial ?? 0, "money"],
    ["Percentual Pago", resumo.percentualPago ?? 0, "percent"],
    ["Percentual Pendente", resumo.percentualPendente ?? 0, "percent"],
    ["Total Geral", resumo.totalGeral ?? 0, "money"],
  ] as const;

  function cardValue(value: number, kind: string) {
    if (kind === "money") return moeda(value);
    if (kind === "percent") return perc(value);
    return Number(value).toLocaleString("pt-BR");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Comissoes</h1>
        <p className="text-sm text-muted-foreground">Comissoes geradas e pagas pelo controle financeiro de funcionarios.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
          <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
          <div className="space-y-1"><Label>Vendedor</Label><Select value={guidVendedor} onValueChange={setGuidVendedor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.vendedores, "guidVendedor")}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Situacao</Label><Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PENDENTE">Pendente</SelectItem><SelectItem value="PAGO">Pago</SelectItem><SelectItem value="PARCIAL">Parcial</SelectItem><SelectItem value="TODOS">Todos</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Venda</Label><Select value={guidVenda} onValueChange={setGuidVenda}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.vendas, "guidVenda", "venda")}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Cliente</Label><Select value={guidCliente} onValueChange={setGuidCliente}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.clientes, "guidCliente")}</SelectContent></Select></div>
          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button>
            <Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
            <Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button>
            <Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, kind]) => (
          <Card key={label}>
            <CardHeader className="py-3"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-lg font-bold">{cardValue(Number(value), kind)}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Comissao por Vendedor</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resultado?.graficos.comissaoPorVendedor ?? []} margin={{ top: 8, right: 12, left: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} />
                <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => moeda(Number(v))} />
                <Bar dataKey="valor" name="Comissao" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Pago x Pendente</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resultado?.graficos.pagoPendente ?? []} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => moeda(Number(v))} />
                <Bar dataKey="valor" name="Valor" fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolucao Mensal</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resultado?.graficos.evolucaoMensal ?? []} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => moeda(Number(v))} />
                <Legend />
                <Bar dataKey="comissaoGerada" name="Gerada" fill="#2563eb" />
                <Bar dataKey="comissaoPaga" name="Paga" fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Venda</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">% Comissao</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Comissao</TableHead><TableHead className="text-right">Pago</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Pagamento</TableHead><TableHead>Situacao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!resultado ? <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Clique em Pesquisar para carregar o relatorio.</TableCell></TableRow> :
                resultado.dados.length === 0 ? <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum dado encontrado.</TableCell></TableRow> :
                resultado.dados.map((l) => (
                  <TableRow key={l.guidMovimento}>
                    <TableCell>{br(l.data)}</TableCell><TableCell>{l.venda ?? "-"}</TableCell><TableCell>{l.cliente ?? "-"}</TableCell><TableCell>{l.vendedor ?? "-"}</TableCell><TableCell className="text-right">{perc(l.percentualComissao)}</TableCell><TableCell className="text-right">{moeda(l.baseCalculo)}</TableCell><TableCell className="text-right">{moeda(l.valorComissao)}</TableCell><TableCell className="text-right">{moeda(l.valorPago)}</TableCell><TableCell className="text-right">{moeda(l.saldo)}</TableCell><TableCell>{br(l.dataPagamento)}</TableCell><TableCell>{l.situacao}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Totais por Vendedor</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table><TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Vendido</TableHead><TableHead className="text-right">Comissao</TableHead><TableHead className="text-right">Pendente</TableHead></TableRow></TableHeader><TableBody>{(resultado?.totaisPorVendedor ?? []).map((v) => <TableRow key={v.vendedor}><TableCell>{v.vendedor}</TableCell><TableCell className="text-right">{v.quantidadeVendas}</TableCell><TableCell className="text-right">{moeda(v.valorVendido)}</TableCell><TableCell className="text-right">{moeda(v.comissaoGerada)}</TableCell><TableCell className="text-right">{moeda(v.comissaoPendente)}</TableCell></TableRow>)}</TableBody></Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por Comissao</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(resultado?.rankingComissao ?? []).slice(0, 8).map((v, i) => <div key={v.vendedor} className="flex items-center justify-between gap-3 text-sm"><span>{i + 1}. {v.vendedor}</span><strong>{moeda(v.comissaoGerada)}</strong></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por Valor Vendido</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(resultado?.rankingValorVendido ?? []).slice(0, 8).map((v, i) => <div key={v.vendedor} className="flex items-center justify-between gap-3 text-sm"><span>{i + 1}. {v.vendedor}</span><strong>{moeda(v.valorVendido)}</strong></div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

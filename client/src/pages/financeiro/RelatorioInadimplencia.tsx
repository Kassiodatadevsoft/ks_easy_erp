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
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const LOGO = "/logo.png";
const FOOTER = "Gerado pela empresa Data Consultoria e Desenvolvimento de Software | datadevsoft.com.br | WhatsApp (94) 98156-9059";

type Linha = {
  guidLancamento: string; cliente: string; documento: string | null; parcela: string; emissao: string; vencimento: string;
  diasAtraso: number; valorOriginal: number; valorRecebido: number; saldoDevedor: number;
  formaPagamento: string | null; vendedor: string | null; situacao: string; faixaAtraso: string; qtdAnexos?: number;
};
type Ranking = { cliente: string; quantidadeTitulos: number; valorAberto: number; diasMediosAtraso: number; percentualCarteira: number };
type Resultado = {
  dados: Linha[];
  resumo: Record<string, number | string>;
  rankingClientes: Ranking[];
  graficos: {
    faixasAtraso: { faixa: string; valor: number }[];
    evolucaoMensal: { periodo: string; valor: number }[];
    topClientes: { cliente: string; valor: number }[];
    recebidoVencido: { nome: string; valor: number }[];
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

function xlsWorkbook(sheets: { name: string; rows: unknown[][] }[]) {
  const cell = (value: unknown) => `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${esc(value)}</Data></Cell>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.map((sheet) => `<Worksheet ss:Name="${esc(sheet.name)}"><Table>${sheet.rows.map((row) => `<Row>${row.map(cell).join("")}</Row>`).join("")}</Table></Worksheet>`).join("")}
</Workbook>`;
}

export default function RelatorioInadimplencia() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(hoje());
  const [guidCliente, setGuidCliente] = useState("todos");
  const [guidVendedor, setGuidVendedor] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [guidConta, setGuidConta] = useState("todos");
  const [guidCentro, setGuidCentro] = useState("todos");
  const [faixaAtraso, setFaixaAtraso] = useState<"1-30" | "31-60" | "61-90" | "90+" | "TODOS">("TODOS");
  const [situacao, setSituacao] = useState<"VENCIDO" | "PARCIAL" | "ABERTO" | "TODOS">("TODOS");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosInadimplencia.useQuery();
  const params = {
    dtInicio, dtFim, faixaAtraso, situacao,
    guidCliente: guidCliente === "todos" ? undefined : guidCliente,
    guidVendedor: guidVendedor === "todos" ? undefined : guidVendedor,
    guidFormaPagamento: guidFormaPagamento === "todos" ? undefined : guidFormaPagamento,
    guidConta: guidConta === "todos" ? undefined : guidConta,
    guidCentro: guidCentro === "todos" ? undefined : guidCentro,
  };
  const filtroTexto = useMemo(() => [`Periodo: ${br(dtInicio)} a ${br(dtFim)}`, `Situacao: ${situacao}`, `Faixa: ${faixaAtraso}`], [dtInicio, dtFim, situacao, faixaAtraso]);

  async function carregar() {
    const data = await utils.financeiroRelatorios.inadimplenciaRelatorio.fetch(params);
    setResultado(data as Resultado);
    return data as Resultado;
  }
  async function pesquisar() {
    try {
      await carregar();
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel pesquisar a inadimplencia.");
    }
  }

  function html(data = resultado) {
    const r = data?.resumo ?? {};
    const cards = [["Clientes Inadimplentes", r.clientesInadimplentes], ["Titulos Vencidos", r.quantidadeTitulosVencidos], ["Valor Vencido", moeda(Number(r.valorTotalVencido ?? 0))], ["Aberto", moeda(Number(r.valorTotalAberto ?? 0))], ["Inadimplencia", perc(Number(r.percentualInadimplencia ?? 0))], ["Maior Devedor", r.maiorDevedorNome], ["Media Atraso", Number(r.mediaDiasAtraso ?? 0).toFixed(0)], ["Carteira", moeda(Number(r.totalCarteira ?? 0))]];
    const ranking = (data?.rankingClientes ?? []).slice(0, 10).map((x) => `<tr><td>${esc(x.cliente)}</td><td class="num">${x.quantidadeTitulos}</td><td class="num">${esc(moeda(x.valorAberto))}</td><td class="num">${esc(x.diasMediosAtraso.toFixed(0))}</td><td class="num">${esc(perc(x.percentualCarteira))}</td></tr>`).join("");
    const linhas = (data?.dados ?? []).map((l) => `<tr><td>${esc(l.cliente)}</td><td>${esc(l.documento ?? "-")}</td><td>${esc(l.parcela)}</td><td>${esc(br(l.emissao))}</td><td>${esc(br(l.vencimento))}</td><td class="num">${l.diasAtraso}</td><td class="num">${esc(moeda(l.valorOriginal))}</td><td class="num">${esc(moeda(l.valorRecebido))}</td><td class="num">${esc(moeda(l.saldoDevedor))}</td><td>${esc(l.formaPagamento ?? "-")}</td><td>${esc(l.vendedor ?? "-")}</td><td>${Number(l.qtdAnexos ?? 0) > 0 ? "Sim" : "Nao"}</td><td>${esc(l.situacao)}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_inadimplencia_${ymd()}</title><style>@page{size:A4 landscape;margin:14mm 8mm 18mm}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 240px;gap:12px;align-items:start}.logo{height:36px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:17px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:9px}.filters{border:1px solid #d1d5db;border-radius:4px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px 14px;padding:8px;margin:10px 0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.card{border:1px solid #d1d5db;border-radius:6px;padding:7px}.card span{display:block;font-size:9px;color:#64748b;text-transform:uppercase}.card strong{display:block;margin-top:4px}.charts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.chart{border:1px solid #d1d5db;border-radius:6px;padding:7px}.bar{display:block;height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-top:4px}.bar span{display:block;height:100%;background:#dc2626}table{border-collapse:collapse;width:100%;margin-top:8px}th{background:#f3f4f6;text-transform:uppercase;font-size:8px}th,td{border:1px solid #d1d5db;padding:4px;text-align:left}.num{text-align:right;white-space:nowrap}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 170px;gap:8px;align-items:center;padding-top:5px}.footer img{height:22px}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px}.page:after{content:counter(page) " / " counter(pages)}</style></head><body><section class="top"><img class="logo" src="${LOGO}"/><div class="title"><h1>Inadimplencia</h1><p>${esc(br(dtInicio))} a ${esc(br(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtroTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><section class="cards">${cards.map(([k, v]) => `<div class="card"><span>${esc(k)}</span><strong>${esc(v ?? "-")}</strong></div>`).join("")}</section><section class="charts">${(data?.graficos.faixasAtraso ?? []).map((x) => `<div class="chart"><strong>${esc(x.faixa)}</strong><span class="bar"><span style="width:${Math.min(100, Number(r.valorTotalVencido ?? 0) > 0 ? (x.valor / Number(r.valorTotalVencido)) * 100 : 0)}%"></span></span>${esc(moeda(x.valor))}</div>`).join("")}</section><h2>Ranking dos Inadimplentes</h2><table><thead><tr><th>Cliente</th><th class="num">Titulos</th><th class="num">Valor Aberto</th><th class="num">Dias Medios</th><th class="num">% Carteira</th></tr></thead><tbody>${ranking || `<tr><td colspan="5">Nenhum dado encontrado.</td></tr>`}</tbody></table><h2>Detalhamento</h2><table><thead><tr><th>Cliente</th><th>Documento</th><th>Parcela</th><th>Emissao</th><th>Vencimento</th><th class="num">Dias</th><th class="num">Original</th><th class="num">Recebido</th><th class="num">Saldo</th><th>Forma</th><th>Vendedor</th><th>Anexo</th><th>Situacao</th></tr></thead><tbody>${linhas || `<tr><td colspan="13">Nenhum dado encontrado.</td></tr>`}</tbody></table><footer class="footer"><img src="${LOGO}"/><div class="footer-center">${esc(FOOTER)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
  }

  async function imprimir() {
    const data = resultado ?? await carregar();
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return toast.error("Nao foi possivel abrir a impressao.");
    win.document.open(); win.document.write(html(data)); win.document.close(); win.focus(); win.onload = () => win.print();
  }

  async function exportarExcel() {
    const data = resultado ?? await carregar();
    const resumo = [
      ["Empresa", nomeEmpresa ?? user?.fantasia ?? ""],
      ["Relatorio", "Inadimplencia"],
      ...filtroTexto.map((f) => [f]),
      [],
      ["Carteira Total", data.resumo.carteiraTotal ?? 0],
      ["Carteira Recebida", data.resumo.carteiraRecebida ?? 0],
      ["Carteira em Aberto", data.resumo.carteiraAberta ?? 0],
      ["Carteira Vencida", data.resumo.carteiraVencida ?? 0],
      ["Percentual de Recuperacao", data.resumo.percentualRecuperacao ?? 0],
      ["Percentual de Inadimplencia", data.resumo.percentualInadimplencia ?? 0],
      ["Clientes Inadimplentes", data.resumo.clientesInadimplentes ?? 0],
      ["Quantidade de Titulos Vencidos", data.resumo.quantidadeTitulosVencidos ?? 0],
      ["Maior Devedor", data.resumo.maiorDevedorNome ?? ""],
      ["Media de Dias em Atraso", data.resumo.mediaDiasAtraso ?? 0],
    ];
    const ranking = [
      ["Cliente","Quantidade de Titulos","Valor em Aberto","Dias Medios de Atraso","Percentual da Carteira"],
      ...data.rankingClientes.map((r) => [r.cliente, r.quantidadeTitulos, r.valorAberto, r.diasMediosAtraso, r.percentualCarteira]),
    ];
    const detalhamento = [
      ["Cliente","Documento","Parcela","Emissao","Vencimento","Dias em Atraso","Valor Original","Valor Recebido","Saldo Devedor","Forma de Pagamento","Vendedor","Anexo","Situacao"],
      ...data.dados.map((l) => [l.cliente, l.documento ?? "", l.parcela, br(l.emissao), br(l.vencimento), l.diasAtraso, l.valorOriginal, l.valorRecebido, l.saldoDevedor, l.formaPagamento ?? "", l.vendedor ?? "", Number(l.qtdAnexos ?? 0) > 0 ? "Sim" : "Nao", l.situacao]),
    ];
    baixar(`relatorio_inadimplencia_${ymd()}.xls`, new Blob([xlsWorkbook([
      { name: "Resumo", rows: resumo },
      { name: "Ranking de Clientes", rows: ranking },
      { name: "Detalhamento dos Titulos", rows: detalhamento },
    ])], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  const resumo = resultado?.resumo ?? {};
  const cards = [
    ["Clientes Inadimplentes", resumo.clientesInadimplentes ?? 0, "number"],
    ["Títulos Vencidos", resumo.quantidadeTitulosVencidos ?? 0, "number"],
    ["Valor Total Vencido", resumo.valorTotalVencido ?? 0, "money"],
    ["Valor Total em Aberto", resumo.valorTotalAberto ?? 0, "money"],
    ["% Inadimplência", resumo.percentualInadimplencia ?? 0, "percent"],
    ["Maior Devedor", resumo.maiorDevedorNome ?? "-", "text"],
    ["Média Dias Atraso", resumo.mediaDiasAtraso ?? 0, "days"],
    ["Total da Carteira", resumo.totalCarteira ?? 0, "money"],
  ] as const;
  const cardValue = (value: string | number, kind: string) => kind === "money" ? moeda(Number(value)) : kind === "percent" ? perc(Number(value)) : kind === "days" ? Number(value).toFixed(0) : String(value);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div><h1 className="text-2xl font-bold">Inadimplencia</h1><p className="text-sm text-muted-foreground">Carteira vencida, clientes inadimplentes, faixas de atraso e risco financeiro.</p></div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label>Cliente</Label><Select value={guidCliente} onValueChange={setGuidCliente}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.clientes, "guidCliente")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Vendedor</Label><Select value={guidVendedor} onValueChange={setGuidVendedor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.vendedores, "guidVendedor")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Forma de Pagamento</Label><Select value={guidFormaPagamento} onValueChange={setGuidFormaPagamento}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.formas, "guidFormaPagamento")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Conta Financeira</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.contas, "guidConta")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Centro de Custo</Label><Select value={guidCentro} onValueChange={setGuidCentro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.centros, "guidCentro")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Faixa de Atraso</Label><Select value={faixaAtraso} onValueChange={(v) => setFaixaAtraso(v as typeof faixaAtraso)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todas</SelectItem><SelectItem value="1-30">01 a 30 dias</SelectItem><SelectItem value="31-60">31 a 60 dias</SelectItem><SelectItem value="61-90">61 a 90 dias</SelectItem><SelectItem value="90+">Acima de 90 dias</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label>Situação</Label><Select value={situacao} onValueChange={(v) => setSituacao(v as typeof situacao)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="VENCIDO">Vencido</SelectItem><SelectItem value="PARCIAL">Parcial</SelectItem><SelectItem value="ABERTO">Em Aberto</SelectItem><SelectItem value="TODOS">Todos</SelectItem></SelectContent></Select></div>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-3"><Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button><Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div>
      </CardContent></Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, kind]) => <Card key={label}><CardHeader className="py-3"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-lg font-bold text-slate-900">{cardValue(value, kind)}</p></CardContent></Card>)}</div>

      {!resultado ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Clique em Pesquisar para carregar o relatorio.</CardContent></Card> : resultado.dados.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum titulo em aberto encontrado para os filtros informados.</CardContent></Card> : <>
        <div className="grid gap-4 xl:grid-cols-2">
          <GraficoBarra titulo="Inadimplencia por Faixa de Atraso" data={resultado.graficos.faixasAtraso} x="faixa" y="valor" cor="#dc2626" />
          <GraficoLinha titulo="Evolucao Mensal da Inadimplencia" data={resultado.graficos.evolucaoMensal} x="periodo" y="valor" />
          <GraficoBarra titulo="Top 10 Clientes Inadimplentes" data={resultado.graficos.topClientes} x="cliente" y="valor" cor="#7c3aed" />
          <GraficoBarra titulo="Valor Recebido x Valor Vencido" data={resultado.graficos.recebidoVencido} x="nome" y="valor" cor="#2563eb" />
        </div>

        <Card><CardHeader><CardTitle className="text-base">Resumo Financeiro</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ResumoItem label="Carteira Total" value={moeda(Number(resumo.carteiraTotal ?? 0))} />
          <ResumoItem label="Carteira Recebida" value={moeda(Number(resumo.carteiraRecebida ?? 0))} />
          <ResumoItem label="Carteira em Aberto" value={moeda(Number(resumo.carteiraAberta ?? 0))} />
          <ResumoItem label="Carteira Vencida" value={moeda(Number(resumo.carteiraVencida ?? 0))} />
          <ResumoItem label="Percentual de Recuperacao" value={perc(Number(resumo.percentualRecuperacao ?? 0))} />
          <ResumoItem label="Percentual de Inadimplencia" value={perc(Number(resumo.percentualInadimplencia ?? 0))} />
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Ranking de Inadimplentes</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead className="text-right">Títulos</TableHead><TableHead className="text-right">Valor em Aberto</TableHead><TableHead className="text-right">Dias Médios</TableHead><TableHead className="text-right">% Carteira</TableHead></TableRow></TableHeader><TableBody>{resultado.rankingClientes.map((r) => <TableRow key={r.cliente}><TableCell>{r.cliente}</TableCell><TableCell className="text-right">{r.quantidadeTitulos}</TableCell><TableCell className="text-right">{moeda(r.valorAberto)}</TableCell><TableCell className="text-right">{r.diasMediosAtraso.toFixed(0)}</TableCell><TableCell className="text-right">{perc(r.percentualCarteira)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

        <Card><CardHeader><CardTitle className="text-base">Detalhamento dos Títulos</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Documento</TableHead><TableHead>Parcela</TableHead><TableHead>Emissao</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="text-right">Recebido</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Forma</TableHead><TableHead>Vendedor</TableHead><TableHead>Anexo</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader><TableBody>{resultado.dados.map((l) => <TableRow key={l.guidLancamento}><TableCell>{l.cliente}</TableCell><TableCell>{l.documento ?? "-"}</TableCell><TableCell>{l.parcela}</TableCell><TableCell>{br(l.emissao)}</TableCell><TableCell>{br(l.vencimento)}</TableCell><TableCell className="text-right">{l.diasAtraso}</TableCell><TableCell className="text-right">{moeda(l.valorOriginal)}</TableCell><TableCell className="text-right">{moeda(l.valorRecebido)}</TableCell><TableCell className="text-right">{moeda(l.saldoDevedor)}</TableCell><TableCell>{l.formaPagamento ?? "-"}</TableCell><TableCell>{l.vendedor ?? "-"}</TableCell><TableCell>{Number(l.qtdAnexos ?? 0) > 0 ? "Sim" : "Nao"}</TableCell><TableCell>{l.situacao}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </>}
    </div>
  );
}

function ResumoItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs font-medium uppercase text-muted-foreground">{label}</div><div className="mt-1 text-base font-semibold">{value}</div></div>;
}

function GraficoBarra({ titulo, data, x, y, cor }: { titulo: string; data: Record<string, string | number>[]; x: string; y: string; cor: string }) {
  return <Card><CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader><CardContent className="h-72">{data.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados para exibir.</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 36 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={x} tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={60} /><YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} /><Tooltip formatter={(v) => moeda(Number(v))} /><Bar dataKey={y} name="Valor">{data.map((_, i) => <Cell key={i} fill={cor} />)}</Bar></BarChart></ResponsiveContainer>}</CardContent></Card>;
}

function GraficoLinha({ titulo, data, x, y }: { titulo: string; data: Record<string, string | number>[]; x: string; y: string }) {
  return <Card><CardHeader><CardTitle className="text-base">{titulo}</CardTitle></CardHeader><CardContent className="h-72">{data.length === 0 ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados para exibir.</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={x} tick={{ fontSize: 11 }} /><YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} /><Tooltip formatter={(v) => moeda(Number(v))} /><Line type="monotone" dataKey={y} name="Valor" stroke="#dc2626" strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>}</CardContent></Card>;
}

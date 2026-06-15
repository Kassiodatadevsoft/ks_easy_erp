import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useKsAuth } from "@/hooks/useKsAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, FileSpreadsheet, Printer, RotateCcw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const LOGO = "/logo.png";
const FOOTER = "Gerado pela empresa Data Consultoria e desenvolvimento de software | datadevsoft.com.br | Whatsapp (94) 98156-9059";

type DreItem = { descricao: string; valor: number; percentual: number };
type DreGrupo = { descricao: string; valor: number; percentual: number; itens: DreItem[] };
type Resultado = {
  periodo: { dataInicial: string; dataFinal: string };
  regime: "competencia" | "caixa";
  grupos: DreGrupo[];
  totais: Record<string, number>;
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

function linhaClasse(descricao: string) {
  if (["RECEITA LIQUIDA", "LUCRO BRUTO", "RESULTADO OPERACIONAL", "RESULTADO FINAL"].includes(descricao)) {
    return "bg-slate-100 font-bold";
  }
  return "font-semibold";
}

function valorClasse(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-700";
}

function periodoLabel(inicio: string, fim: string) {
  return inicio.slice(0, 7) === fim.slice(0, 7) ? inicio.slice(0, 7) : `${inicio.slice(0, 7)} a ${fim.slice(0, 7)}`;
}

export default function RelatorioDreGerencial() {
  const { user, nomeEmpresa } = useKsAuth();
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(hoje());
  const [regime, setRegime] = useState<"competencia" | "caixa">("competencia");
  const [guidCentro, setGuidCentro] = useState("todos");
  const [guidContaFinanceira, setGuidContaFinanceira] = useState("todos");
  const [guidPlanoConta, setGuidPlanoConta] = useState("todos");
  const [guidNatureza, setGuidNatureza] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: filtros } = trpc.financeiroRelatorios.filtrosDreGerencial.useQuery();
  const params = {
    dtInicio,
    dtFim,
    regime,
    guidCentro: guidCentro === "todos" ? undefined : guidCentro,
    guidContaFinanceira: guidContaFinanceira === "todos" ? undefined : guidContaFinanceira,
    guidPlanoConta: guidPlanoConta === "todos" ? undefined : guidPlanoConta,
    guidNatureza: guidNatureza === "todos" ? undefined : guidNatureza,
    guidFormaPagamento: guidFormaPagamento === "todos" ? undefined : guidFormaPagamento,
  };
  const filtroTexto = useMemo(() => [`Periodo: ${br(dtInicio)} a ${br(dtFim)}`, `Regime: ${regime}`], [dtInicio, dtFim, regime]);

  async function carregar() {
    const data = await utils.financeiroRelatorios.dreGerencial.fetch(params);
    setResultado(data as Resultado);
    return data as Resultado;
  }

  async function pesquisar() { await carregar(); }
  function limpar() {
    setDtInicio(mesInicio());
    setDtFim(hoje());
    setRegime("competencia");
    setGuidCentro("todos");
    setGuidContaFinanceira("todos");
    setGuidPlanoConta("todos");
    setGuidNatureza("todos");
    setGuidFormaPagamento("todos");
    setResultado(null);
  }

  function html(data = resultado) {
    const grupos = data?.grupos ?? [];
    const periodo = periodoLabel(dtInicio, dtFim);
    const t = data?.totais ?? {};
    const receita = Number(t.receitaBruta ?? 0);
    const custos = Number(t.custoTotal ?? 0);
    const despesas = Number(t.despesasOperacionais ?? 0);
    const resultadoLiquido = Number(t.resultadoFinal ?? 0);
    const linhas = grupos.map((g) => `
      <tr class="grupo"><td>${esc(g.descricao)}</td><td>-</td><td class="num">${esc(moeda(g.valor))}</td><td class="num">${esc(perc(g.percentual))}</td><td>${esc(periodo)}</td></tr>
      ${g.itens.map((i) => `<tr><td>${esc(g.descricao)}</td><td class="item">${esc(i.descricao)}</td><td class="num">${esc(moeda(i.valor))}</td><td class="num">${esc(perc(i.percentual))}</td><td>${esc(periodo)}</td></tr>`).join("")}
    `).join("");
    const maxBar = Math.max(Math.abs(receita), Math.abs(custos + despesas), Math.abs(resultadoLiquido), 1);
    const bar = (value: number, color: string) => `<span class="bar"><span style="width:${Math.min(100, Math.abs(value) / maxBar * 100)}%;background:${color}"></span></span>`;
    return `<!doctype html><html><head><meta charset="utf-8"/><title>relatorio_dre_gerencial_${ymd()}</title><style>@page{size:A4;margin:14mm 10mm 18mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111827}.top{display:grid;grid-template-columns:150px 1fr 240px;gap:12px;align-items:start;margin-bottom:10px}.logo{height:36px;width:130px;object-fit:contain;object-position:left}.title{text-align:center}.title h1{font-size:17px;margin:0 0 4px;text-transform:uppercase}.company{text-align:right;font-size:9px;line-height:1.4}.filters{border:1px solid #d1d5db;border-radius:4px;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 14px;padding:8px;margin:8px 0 10px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}.card{border:1px solid #d1d5db;border-radius:6px;padding:8px}.card span{display:block;color:#64748b;font-size:9px;text-transform:uppercase}.card strong{display:block;margin-top:4px;font-size:13px}.pos{color:#047857}.neg{color:#b91c1c}.charts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}.chart{border:1px solid #d1d5db;border-radius:6px;padding:8px}.chart h2{font-size:10px;margin:0 0 8px;text-transform:uppercase}.bar{display:block;height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin-top:4px}.bar span{display:block;height:100%}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5e7eb;padding:6px;text-align:left}th{background:#f3f4f6;text-transform:uppercase;font-size:9px}.grupo{background:#f8fafc;font-weight:700}.item{padding-left:18px}.num{text-align:right;white-space:nowrap}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #d1d5db;display:grid;grid-template-columns:95px 1fr 170px;gap:8px;align-items:center;padding-top:5px}.footer img{height:22px}.footer-center{text-align:center;font-weight:700;font-size:9px}.footer-right{text-align:right;font-size:9px}.page:after{content:counter(page) " / " counter(pages)}</style></head><body><section class="top"><img class="logo" src="${LOGO}"/><div class="title"><h1>DRE Gerencial</h1><p>${esc(br(dtInicio))} a ${esc(br(dtFim))}</p></div><div class="company"><strong>${esc(nomeEmpresa ?? user?.fantasia ?? "Empresa logada")}</strong><br/>${esc(user?.entDocumento ?? user?.documento ?? "")}<br/>GUIDENTIDADE: ${esc(user?.guidEntidade ?? "")}</div></section><section class="filters">${filtroTexto.map((f) => `<div>${esc(f)}</div>`).join("")}</section><section class="cards"><div class="card"><span>Receita Bruta</span><strong>${esc(moeda(t.receitaBruta ?? 0))}</strong></div><div class="card"><span>Receita Liquida</span><strong>${esc(moeda(t.receitaLiquida ?? 0))}</strong></div><div class="card"><span>Custos</span><strong>${esc(moeda(t.custoTotal ?? 0))}</strong></div><div class="card"><span>Despesas</span><strong>${esc(moeda(t.despesasOperacionais ?? 0))}</strong></div><div class="card"><span>Resultado Operacional</span><strong class="${(t.resultadoOperacional ?? 0) >= 0 ? "pos" : "neg"}">${esc(moeda(t.resultadoOperacional ?? 0))}</strong></div><div class="card"><span>Resultado Liquido</span><strong class="${resultadoLiquido >= 0 ? "pos" : "neg"}">${esc(moeda(resultadoLiquido))}</strong></div><div class="card"><span>Margem Liquida</span><strong class="${(t.margemLiquida ?? 0) >= 0 ? "pos" : "neg"}">${esc(perc(t.margemLiquida ?? 0))}</strong></div></section><section class="charts"><div class="chart"><h2>Receita x Despesas</h2>Receita ${bar(receita, "#2563eb")}Despesas ${bar(custos + despesas, "#dc2626")}</div><div class="chart"><h2>Resultado Liquido</h2>${esc(periodo)} ${bar(resultadoLiquido, resultadoLiquido >= 0 ? "#059669" : "#dc2626")}</div></section><table><thead><tr><th>Grupo DRE</th><th>Natureza</th><th class="num">Valor</th><th class="num">Percentual</th><th>Periodo</th></tr></thead><tbody>${linhas || `<tr><td colspan="5">Nenhum dado encontrado.</td></tr>`}</tbody></table><footer class="footer"><img src="${LOGO}"/><div class="footer-center">${esc(FOOTER)}</div><div class="footer-right">Usuario: ${esc(user?.nome ?? user?.usuario ?? "")}<br/>Emissao: ${esc(new Date().toLocaleString("pt-BR"))}<br/>Pagina: <span class="page"></span></div></footer></body></html>`;
  }

  async function imprimir() {
    const data = resultado ?? await carregar();
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) return toast.error("Nao foi possivel abrir a impressao.");
    win.document.open(); win.document.write(html(data)); win.document.close(); win.focus(); win.onload = () => win.print();
  }

  async function exportarExcel() {
    const data = resultado ?? await carregar();
    const rows = [
      ["Empresa", nomeEmpresa ?? user?.fantasia ?? ""],
      ["Relatorio", "DRE Gerencial"],
      ...filtroTexto.map((f) => [f]),
      [],
      ["Grupo DRE","Natureza","Valor","Percentual","Periodo"],
      ...data.grupos.flatMap((g) => [[g.descricao, "", g.valor, g.percentual, periodoLabel(data.periodo.dataInicial, data.periodo.dataFinal)], ...g.itens.map((i) => [g.descricao, i.descricao, i.valor, i.percentual, periodoLabel(data.periodo.dataInicial, data.periodo.dataFinal)])]),
      [],
      ["Receita Bruta", data.totais.receitaBruta ?? 0],
      ["Receita Liquida", data.totais.receitaLiquida ?? 0],
      ["Custo Total", data.totais.custoTotal ?? 0],
      ["Lucro Bruto", data.totais.lucroBruto ?? 0],
      ["Despesas Operacionais", data.totais.despesasOperacionais ?? 0],
      ["Resultado Operacional", data.totais.resultadoOperacional ?? 0],
      ["Resultado Final", data.totais.resultadoFinal ?? 0],
      ["Margem Bruta %", data.totais.margemBruta ?? 0],
      ["Margem Liquida %", data.totais.margemLiquida ?? 0],
    ];
    baixar(`relatorio_dre_gerencial_${ymd()}.xls`, new Blob([`<html><meta charset="utf-8"/><body><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`], { type: "application/vnd.ms-excel;charset=utf-8" }));
  }

  const totais = resultado?.totais ?? {};
  const cards = [
    ["Receita Bruta", totais.receitaBruta ?? 0, "money"],
    ["Receita Líquida", totais.receitaLiquida ?? 0, "money"],
    ["Custos", totais.custoTotal ?? 0, "money"],
    ["Despesas", totais.despesasOperacionais ?? 0, "money"],
    ["Resultado Operacional", totais.resultadoOperacional ?? 0, "money"],
    ["Resultado Líquido", totais.resultadoFinal ?? 0, "money"],
    ["Margem Líquida %", totais.margemLiquida ?? 0, "percent"],
  ] as const;
  const periodoGrafico = periodoLabel(dtInicio, dtFim);
  const receitaDespesasData = [{
    periodo: periodoGrafico,
    receita: Number(totais.receitaBruta ?? 0),
    despesas: Number(totais.custoTotal ?? 0) + Number(totais.despesasOperacionais ?? 0),
  }];
  const resultadoLiquidoData = [{ periodo: periodoGrafico, resultado: Number(totais.resultadoFinal ?? 0) }];
  const despesasNaturezaData = (resultado?.grupos.find((g) => g.descricao === "DESPESAS OPERACIONAIS")?.itens ?? [])
    .map((item) => ({ natureza: item.descricao, valor: item.valor }))
    .filter((item) => item.valor !== 0);
  const margemLiquidaData = [{ periodo: periodoGrafico, margem: Number(totais.margemLiquida ?? 0) }];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div><h1 className="text-2xl font-bold">DRE Gerencial</h1><p className="text-sm text-muted-foreground">Receitas, deducoes, custos, despesas e resultado da empresa logada.</p></div>
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label>Data Inicial</Label><Input type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label>Data Final</Label><Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label>Regime</Label><Select value={regime} onValueChange={(v) => setRegime(v as typeof regime)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="competencia">Competencia</SelectItem><SelectItem value="caixa">Caixa</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label>Centro de Custo</Label><Select value={guidCentro} onValueChange={setGuidCentro}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.centros, "guidCentro")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Conta Financeira</Label><Select value={guidContaFinanceira} onValueChange={setGuidContaFinanceira}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.contasFinanceiras, "guidContaFinanceira")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Plano de Contas</Label><Select value={guidPlanoConta} onValueChange={setGuidPlanoConta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem>{opts(filtros?.planos, "guidPlanoConta")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Natureza</Label><Select value={guidNatureza} onValueChange={setGuidNatureza}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.naturezas, "guidNatureza")}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Forma de Pagamento</Label><Select value={guidFormaPagamento} onValueChange={setGuidFormaPagamento}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas</SelectItem>{opts(filtros?.formas, "guidFormaPagamento")}</SelectContent></Select></div>
        <div className="flex flex-wrap items-end gap-2 lg:col-span-4"><Button onClick={pesquisar}><Search className="mr-2 h-4 w-4" />Pesquisar</Button><Button variant="outline" onClick={limpar}><RotateCcw className="mr-2 h-4 w-4" />Limpar</Button><Button variant="outline" onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir</Button><Button variant="outline" onClick={imprimir}><FileDown className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button></div>
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, kind]) => {
          const numeric = Number(value);
          const isResult = label.includes("Resultado") || label.includes("Margem");
          return (
            <Card key={label} className="rounded-lg">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-xl font-bold ${isResult ? valorClasse(numeric) : "text-slate-900"}`}>
                  {kind === "percent" ? perc(numeric) : moeda(numeric)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!resultado ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Clique em Pesquisar para carregar o relatorio.</CardContent></Card>
      ) : resultado.grupos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum dado encontrado para os filtros informados.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Receita x Despesas por Periodo</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={receitaDespesasData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => moeda(Number(v))} />
                    <Bar dataKey="receita" name="Receita" fill="#2563eb" />
                    <Bar dataKey="despesas" name="Despesas" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Evolucao do Resultado Liquido</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={resultadoLiquidoData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => moeda(Number(v))} />
                    <Line type="monotone" dataKey="resultado" name="Resultado Liquido" stroke={Number(totais.resultadoFinal ?? 0) >= 0 ? "#059669" : "#dc2626"} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Despesas por Natureza Financeira</CardTitle></CardHeader>
              <CardContent className="h-72">
                {despesasNaturezaData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem despesas no periodo.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={despesasNaturezaData} margin={{ top: 8, right: 12, left: 8, bottom: 36 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="natureza" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={60} />
                      <YAxis tickFormatter={(v) => Number(v).toLocaleString("pt-BR")} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => moeda(Number(v))} />
                      <Bar dataKey="valor" name="Despesa">
                        {despesasNaturezaData.map((entry) => <Cell key={entry.natureza} fill={entry.valor >= 0 ? "#dc2626" : "#059669"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Margem Liquida por Mes</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={margemLiquidaData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${Number(v).toLocaleString("pt-BR")}%`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => perc(Number(v))} />
                    <Line type="monotone" dataKey="margem" name="Margem Liquida" stroke={Number(totais.margemLiquida ?? 0) >= 0 ? "#059669" : "#dc2626"} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Tabela Analitica</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <div className="min-w-[760px] divide-y">
                <div className="grid grid-cols-[220px_1fr_160px_120px_130px] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                  <span>Grupo DRE</span><span>Natureza</span><span className="text-right">Valor</span><span className="text-right">Percentual</span><span>Periodo</span>
                </div>
                {resultado.grupos.map((grupo) => (
                  <div key={grupo.descricao}>
                    <div className={`grid grid-cols-[220px_1fr_160px_120px_130px] gap-3 px-4 py-3 text-sm ${linhaClasse(grupo.descricao)}`}>
                      <span>{grupo.descricao}</span><span>-</span><span className={`text-right ${valorClasse(grupo.valor)}`}>{moeda(grupo.valor)}</span><span className="text-right">{perc(grupo.percentual)}</span><span>{periodoGrafico}</span>
                    </div>
                    {grupo.itens.map((item) => (
                      <div key={`${grupo.descricao}-${item.descricao}`} className="grid grid-cols-[220px_1fr_160px_120px_130px] gap-3 px-4 py-2 text-sm">
                        <span className="text-muted-foreground">{grupo.descricao}</span><span>{item.descricao}</span><span className={`text-right ${valorClasse(item.valor)}`}>{moeda(item.valor)}</span><span className="text-right">{perc(item.percentual)}</span><span>{periodoGrafico}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

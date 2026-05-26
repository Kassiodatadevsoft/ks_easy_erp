import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react";

function fmt(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0); }
function fmtDate(d: string | null) { if (!d) return "—"; return new Date(d + "T00:00:00").toLocaleDateString("pt-BR"); }
function mesInicio() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function mesFim() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()}`; }

type MovItem = { guidMovimento?: string; DATA: string; TIPO: string; DESCRICAO: string; nomeNatureza?: string | null; nomeCentro?: string | null; VALOR: number; };
type DreItem = { NATUREZA: string; TIPO: string; TOTAL: number; };
type Resumo = { TOTAL_ENTRADAS?: number; TOTAL_SAIDAS?: number; SALDO_PERIODO?: number; };
type DiarioItem = { DT: string; ENTRADAS: number; SAIDAS: number; SALDO_DIA: number; };

export default function FluxoCaixa() {
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(mesFim());
  const [visao, setVisao] = useState<"fluxo"|"dre"|"grafico">("fluxo");
  const [guidCentro, setGuidCentro] = useState<string>("todos");

  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();
  const { data: resumoData } = trpc.fluxoCaixa.resumoPeriodo.useQuery({ dtInicio, dtFim });
  const { data: movData, isLoading } = trpc.fluxoCaixa.movimentacoes.useQuery({ dtInicio, dtFim, page: 1, pageSize: 100 });
  const { data: dreData } = trpc.fluxoCaixa.dre.useQuery({ dtInicio, dtFim });
  const { data: diarioData = [] } = trpc.fluxoCaixa.fluxoDiario.useQuery({ dtInicio, dtFim });

  const resumo: Resumo = resumoData ?? {};
  const totalEntradas = Number(resumo.TOTAL_ENTRADAS ?? 0);
  const totalSaidas = Number(resumo.TOTAL_SAIDAS ?? 0);
  const saldo = Number(resumo.SALDO_PERIODO ?? (totalEntradas - totalSaidas));

  const movimentos: MovItem[] = (movData as { items: MovItem[] } | undefined)?.items ?? [];

  type DreResult = { receitas: DreItem[]; despesas: DreItem[]; totalReceitas: number; totalDespesas: number; resultado: number };
  const dreResult = dreData as DreResult | null;
  const receitas: DreItem[] = dreResult?.receitas ?? [];
  const despesas: DreItem[] = dreResult?.despesas ?? [];

  const graficoDados = useMemo(() => {
    return (diarioData as DiarioItem[]).map(g => ({
      dia: g.DT ? g.DT.substring(5) : "",
      Entradas: Number(g.ENTRADAS) || 0,
      Saídas: Number(g.SAIDAS) || 0,
      Saldo: Number(g.SALDO_DIA) || 0,
    }));
  }, [diarioData]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><Activity className="h-6 w-6 text-blue-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">Fluxo de Caixa</h1>
            <p className="text-sm text-muted-foreground">Movimentação financeira e DRE simplificado</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(["fluxo","dre","grafico"] as const).map(v => (
            <Button key={v} variant={visao === v ? "default" : "outline"} size="sm" onClick={() => setVisao(v)}>
              {v === "fluxo" ? "Fluxo" : v === "dre" ? "DRE" : "Gráfico"}
            </Button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} className="w-40" />
        <Input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} className="w-40" />
        <Select value={guidCentro} onValueChange={setGuidCentro}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos os centros" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os centros</SelectItem>
            {(centros as Array<{ guidCentro: string; CODCENTRO: string; CENTRO: string }>).map(c => (
              <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Entradas", value: totalEntradas, icon: ArrowUpRight, cls: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Total Saídas", value: totalSaidas, icon: ArrowDownRight, cls: "text-red-400", bg: "bg-red-500/10" },
          { label: "Saldo do Período", value: saldo, icon: DollarSign, cls: saldo >= 0 ? "text-blue-400" : "text-orange-400", bg: saldo >= 0 ? "bg-blue-500/10" : "bg-orange-500/10" },
        ].map(t => (
          <div key={t.label} className="rounded-xl border border-white/10 bg-card p-4 flex items-center gap-4">
            <div className={`p-2.5 rounded-lg ${t.bg}`}><t.icon className={`h-5 w-5 ${t.cls}`} /></div>
            <div>
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className={`text-xl font-bold font-mono ${t.cls}`}>{fmt(t.value)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Visão: Fluxo */}
      {visao === "fluxo" && (
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-left">Natureza</th>
                  <th className="px-4 py-3 text-left">Centro</th>
                  <th className="px-4 py-3 text-center">Tipo</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
                ) : movimentos.length === 0 ? (
                  <tr><td colSpan={6} className="p-12 text-center">
                    <Activity className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">Nenhuma movimentação no período</p>
                  </td></tr>
                ) : movimentos.map((m, i) => (
                  <tr key={m.guidMovimento ?? i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(m.DATA)}</td>
                    <td className="px-4 py-3 font-medium">{m.DESCRICAO}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.nomeNatureza ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.nomeCentro ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={`text-xs ${m.TIPO === "R" ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
                        {m.TIPO === "R" ? <><TrendingUp className="h-3 w-3 inline mr-1" />Entrada</> : <><TrendingDown className="h-3 w-3 inline mr-1" />Saída</>}
                      </Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${m.TIPO === "R" ? "text-emerald-400" : "text-red-400"}`}>
                      {m.TIPO === "R" ? "+" : "-"}{fmt(m.VALOR)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visão: DRE */}
      {visao === "dre" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-card p-4 space-y-3">
            <h3 className="font-semibold text-emerald-400 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Receitas</h3>
            {receitas.length === 0 ? <p className="text-sm text-muted-foreground">Sem receitas no período</p> : receitas.map((d, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b border-white/5">
                <span className="text-muted-foreground">{d.NATUREZA}</span>
                <span className="font-mono font-semibold text-emerald-400">{fmt(d.TOTAL)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2">
              <span>Total Receitas</span>
              <span className="font-mono text-emerald-400">{fmt(totalEntradas)}</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-card p-4 space-y-3">
            <h3 className="font-semibold text-red-400 flex items-center gap-2"><TrendingDown className="h-4 w-4" /> Despesas</h3>
            {despesas.length === 0 ? <p className="text-sm text-muted-foreground">Sem despesas no período</p> : despesas.map((d, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b border-white/5">
                <span className="text-muted-foreground">{d.NATUREZA}</span>
                <span className="font-mono font-semibold text-red-400">{fmt(d.TOTAL)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2">
              <span>Total Despesas</span>
              <span className="font-mono text-red-400">{fmt(totalSaidas)}</span>
            </div>
          </div>
          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-card p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">Resultado do Período</span>
              <span className={`font-mono font-bold text-2xl ${saldo >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(saldo)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Visão: Gráfico */}
      {visao === "grafico" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-card p-4">
            <h3 className="font-semibold mb-4">Entradas vs Saídas por Dia</h3>
            {graficoDados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={graficoDados} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="Entradas" fill="#34d399" radius={[4,4,0,0]} />
                  <Bar dataKey="Saídas" fill="#f87171" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-card p-4">
            <h3 className="font-semibold mb-4">Saldo Diário Acumulado</h3>
            {graficoDados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={graficoDados} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="Saldo" stroke="#60a5fa" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

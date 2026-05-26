import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Users, AlertCircle, Calendar, RefreshCw,
} from "lucide-react";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v: number) {
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
}

function KpiCard({ titulo, valor, ant, icon: Icon, cor, sufixo }: {
  titulo: string; valor: number; ant?: number; icon: React.ElementType; cor: string; sufixo?: string;
}) {
  const var_ = ant != null && ant > 0 ? ((valor - ant) / ant) * 100 : null;
  return (
    <Card className="border-white/10 bg-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{titulo}</p>
            <p className="text-2xl font-bold">{sufixo ? `${valor.toLocaleString("pt-BR")}${sufixo}` : fmt(valor)}</p>
            {var_ != null && (
              <div className={`flex items-center gap-1 text-xs ${var_ >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {var_ >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{fmtPct(var_)} vs período anterior</span>
              </div>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${cor}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-white/10 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

export default function DashboardVendas() {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [dtInicio, setDtInicio] = useState(inicioMes);
  const [dtFim, setDtFim] = useState(hoje);
  const [filtroAtivo, setFiltroAtivo] = useState<"mes" | "trim" | "ano" | "custom">("mes");

  const params = useMemo(() => ({ dtInicio, dtFim }), [dtInicio, dtFim]);

  const { data: kpis, isLoading: loadKpis, refetch: refetchKpis } = trpc.vendasDashboard.kpis.useQuery(params);
  const { data: mensal = [], isLoading: loadMensal } = trpc.vendasDashboard.faturamentoMensal.useQuery();
  const { data: topClientes = [], isLoading: loadTop } = trpc.vendasDashboard.topClientes.useQuery(params);
  const { data: porNatureza = [] } = trpc.vendasDashboard.receitasPorNatureza.useQuery(params);
  const { data: statusRec } = trpc.vendasDashboard.statusReceber.useQuery();

  function aplicarFiltro(tipo: "mes" | "trim" | "ano" | "custom") {
    setFiltroAtivo(tipo);
    const now = new Date();
    if (tipo === "mes") {
      setDtInicio(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setDtFim(now.toISOString().slice(0, 10));
    } else if (tipo === "trim") {
      setDtInicio(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10));
      setDtFim(now.toISOString().slice(0, 10));
    } else if (tipo === "ano") {
      setDtInicio(`${now.getFullYear()}-01-01`);
      setDtFim(now.toISOString().slice(0, 10));
    }
  }

  const totalNatureza = porNatureza.reduce((s, n) => s + n.total, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <TrendingUp className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard de Vendas</h1>
            <p className="text-sm text-muted-foreground">Análise de faturamento e recebimentos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["mes","trim","ano"] as const).map(t => (
            <Button key={t} size="sm" variant={filtroAtivo === t ? "default" : "outline"}
              onClick={() => aplicarFiltro(t)} className="text-xs">
              {t === "mes" ? "Mês Atual" : t === "trim" ? "Trimestre" : "Ano"}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input type="date" value={dtInicio} onChange={e => { setDtInicio(e.target.value); setFiltroAtivo("custom"); }} className="w-36 text-xs h-8" />
            <span className="text-muted-foreground text-xs">até</span>
            <Input type="date" value={dtFim} onChange={e => { setDtFim(e.target.value); setFiltroAtivo("custom"); }} className="w-36 text-xs h-8" />
          </div>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => refetchKpis()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Faturamento" valor={kpis?.faturamento ?? 0} ant={kpis?.faturamentoAnt} icon={DollarSign} cor="bg-blue-500/10 text-blue-400" />
        <KpiCard titulo="Ticket Médio" valor={kpis?.ticketMedio ?? 0} ant={kpis?.ticketMedioAnt} icon={ShoppingCart} cor="bg-emerald-500/10 text-emerald-400" />
        <KpiCard titulo="Pedidos" valor={kpis?.qtdPedidos ?? 0} ant={kpis?.qtdPedidosAnt} icon={Calendar} cor="bg-purple-500/10 text-purple-400" sufixo="" />
        <KpiCard titulo="Clientes Ativos" valor={kpis?.clientesAtivos ?? 0} icon={Users} cor="bg-amber-500/10 text-amber-400" sufixo="" />
      </div>

      {/* Alertas de recebimento */}
      {statusRec && statusRec.vencido > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-red-400">Atenção: </span>
            <span className="text-muted-foreground">
              {fmt(statusRec.vencido)} em recebimentos <strong>vencidos</strong> · {fmt(statusRec.venceHoje)} vencem hoje · {fmt(statusRec.vence7d)} nos próximos 7 dias
            </span>
          </div>
        </div>
      )}

      {/* Gráficos principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Faturamento Mensal */}
        <Card className="border-white/10 bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Faturamento Mensal (12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadMensal ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
            ) : mensal.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={mensal} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" name="Faturamento" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Receitas por Natureza */}
        <Card className="border-white/10 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Por Natureza</CardTitle>
          </CardHeader>
          <CardContent>
            {porNatureza.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={porNatureza} dataKey="total" nameKey="natureza" cx="50%" cy="45%" outerRadius={70} label={false}>
                    {porNatureza.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend formatter={(value: string) => <span className="text-xs text-muted-foreground">{value.length > 18 ? value.slice(0,18)+"…" : value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Clientes + Resumo a Receber */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Clientes */}
        <Card className="border-white/10 bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Top 10 Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {loadTop ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
            ) : topClientes.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <div className="space-y-2">
                {topClientes.map((c, i) => {
                  const maxTotal = topClientes[0]?.total ?? 1;
                  const pct = (c.total / maxTotal) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right">{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium truncate">{c.nome}</span>
                          <span className="text-sm font-mono ml-2 shrink-0">{fmt(c.total)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{c.qtdPedidos} ped.</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo a Receber */}
        <Card className="border-white/10 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">A Receber</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Vencido", valor: statusRec?.vencido ?? 0, cor: "text-red-400", bg: "bg-red-500/10" },
              { label: "Vence Hoje", valor: statusRec?.venceHoje ?? 0, cor: "text-amber-400", bg: "bg-amber-500/10" },
              { label: "Próx. 7 dias", valor: statusRec?.vence7d ?? 0, cor: "text-yellow-400", bg: "bg-yellow-500/10" },
              { label: "Próx. 30 dias", valor: statusRec?.vence30d ?? 0, cor: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Total em Aberto", valor: kpis?.totalAberto ?? 0, cor: "text-emerald-400", bg: "bg-emerald-500/10" },
            ].map(item => (
              <div key={item.label} className={`flex items-center justify-between p-3 rounded-lg ${item.bg}`}>
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`text-sm font-semibold font-mono ${item.cor}`}>{fmt(item.valor)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

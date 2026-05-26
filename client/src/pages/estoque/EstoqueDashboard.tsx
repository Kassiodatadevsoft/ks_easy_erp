import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Package, AlertTriangle, TrendingDown, DollarSign,
  ArrowUpCircle, ArrowDownCircle, Settings2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}
function fmtQtd(v: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(v ?? 0);
}

export default function EstoqueDashboard() {
  const [, navigate] = useLocation();
  const { data: resumo, isLoading: loadResumo } = trpc.produtosErp.resumoEstoque.useQuery();
  const { data: criticos, isLoading: loadCriticos } = trpc.produtosErp.produtosCriticos.useQuery();

  // Últimos 6 meses de movimentações (entradas vs saídas)
  const hoje = new Date();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      dtInicio: d.toISOString().slice(0, 10),
      dtFim: fim.toISOString().slice(0, 10),
    };
  });

  const mesAtual = meses[meses.length - 1];
  const { data: totaisMes } = trpc.movimentacoesEstoque.totais.useQuery({
    dtInicio: mesAtual.dtInicio,
    dtFim: mesAtual.dtFim,
  });

  // Dados do gráfico (mock com totais do mês atual para demonstração)
  const chartData = meses.map((m, i) => ({
    mes: m.label,
    entradas: i === 5 ? (totaisMes?.entradas ?? 0) : 0,
    saidas:   i === 5 ? (totaisMes?.saidas ?? 0) : 0,
  }));

  const kpis = [
    {
      title: "Total de Produtos",
      value: loadResumo ? "..." : String(resumo?.totalProdutos ?? 0),
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950",
      action: () => navigate("/estoque/produtos-erp"),
    },
    {
      title: "Valor em Estoque",
      value: loadResumo ? "..." : fmt(resumo?.valorEstoque ?? 0),
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950",
      action: () => navigate("/estoque/produtos-erp"),
    },
    {
      title: "Abaixo do Mínimo",
      value: loadResumo ? "..." : String(resumo?.abaixoMinimo ?? 0),
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950",
      action: () => navigate("/estoque/produtos-erp"),
    },
    {
      title: "Sem Estoque",
      value: loadResumo ? "..." : String(resumo?.semEstoque ?? 0),
      icon: TrendingDown,
      color: "text-red-500",
      bg: "bg-red-50 dark:bg-red-950",
      action: () => navigate("/estoque/produtos-erp"),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Estoque</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral do estoque e movimentações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/estoque/movimentacoes")}>
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Movimentações
          </Button>
          <Button size="sm" onClick={() => navigate("/estoque/produtos-erp")}>
            <Package className="h-4 w-4 mr-2" />
            Produtos
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={kpi.action}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                </div>
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de movimentações */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Movimentações do Mês (Valor R$)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[4,4,0,0]} />
                <Bar dataKey="saidas"   name="Saídas"   fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">Entradas:</span>
                <span className="text-sm font-semibold text-emerald-600">{fmt(totaisMes?.entradas ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-muted-foreground">Saídas:</span>
                <span className="text-sm font-semibold text-red-600">{fmt(totaisMes?.saidas ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Produtos críticos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Produtos Críticos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadCriticos ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            ) : !criticos || criticos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum produto crítico
              </div>
            ) : (
              <div className="divide-y max-h-[280px] overflow-y-auto">
                {(criticos as { guidProduto: string; PRODUTO: string; ESTOQUE: number; ESTOQUEMINIMO: number; UNIDADE: string; status: string }[]).map((p) => (
                  <div key={p.guidProduto} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.PRODUTO}</p>
                      <p className="text-xs text-muted-foreground">
                        Estoque: {fmtQtd(p.ESTOQUE)} {p.UNIDADE}
                        {p.ESTOQUEMINIMO > 0 && ` / Mín: ${fmtQtd(p.ESTOQUEMINIMO)}`}
                      </p>
                    </div>
                    <Badge
                      variant={p.status === "SEM_ESTOQUE" ? "destructive" : "outline"}
                      className={p.status === "SEM_ESTOQUE" ? "" : "border-amber-400 text-amber-600"}
                    >
                      {p.status === "SEM_ESTOQUE" ? "Sem estoque" : "Baixo"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="p-3 border-t">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/estoque/produtos-erp")}>
                <Settings2 className="h-3 w-3 mr-1" /> Ver todos os produtos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

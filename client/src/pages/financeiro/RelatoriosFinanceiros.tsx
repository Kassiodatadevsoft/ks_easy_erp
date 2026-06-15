import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CreditCard,
  DollarSign,
  Loader2,
  Percent,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ReportCard = {
  id: ReportId;
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  available: boolean;
};

type ReportId =
  | "movimentacao-caixa"
  | "vendas-forma-pagamento"
  | "contas-receber"
  | "contas-pagar"
  | "fluxo-caixa"
  | "comissoes"
  | "dre-gerencial"
  | "inadimplencia";

const REPORT_CARDS: ReportCard[] = [
  {
    id: "movimentacao-caixa",
    title: "Movimentação de Caixa",
    description: "Entradas, saídas, contas e naturezas dos lançamentos financeiros.",
    path: "/financeiro/relatorios/movimentacao-caixa",
    icon: ReceiptText,
    available: true,
  },
  {
    id: "vendas-forma-pagamento",
    title: "Vendas por Forma de Pagamento",
    description: "Totais de vendas agrupados por dinheiro, cartão, PIX e demais formas.",
    path: "/financeiro/relatorios/vendas-forma-pagamento",
    icon: CreditCard,
    available: true,
  },
  {
    id: "contas-receber",
    title: "Contas a Receber",
    description: "Títulos em aberto, recebidos, vencidos e previsão de recebimento.",
    path: "/financeiro/relatorios/contas-receber",
    icon: TrendingUp,
    available: true,
  },
  {
    id: "contas-pagar",
    title: "Contas a Pagar",
    description: "Compromissos em aberto, pagos, vencidos e programação de pagamentos.",
    path: "/financeiro/relatorios/contas-pagar",
    icon: TrendingDown,
    available: true,
  },
  {
    id: "fluxo-caixa",
    title: "Fluxo de Caixa",
    description: "Entradas, saídas e saldo projetado por data de vencimento ou baixa.",
    path: "/financeiro/relatorios/fluxo-caixa",
    icon: CalendarClock,
    available: true,
  },
  {
    id: "comissoes",
    title: "Comissões",
    description: "Apuração de comissões por vendedor, período e origem de venda.",
    path: "/financeiro/relatorios/comissoes",
    icon: Percent,
    available: true,
  },
  {
    id: "dre-gerencial",
    title: "DRE Gerencial",
    description: "Receitas, despesas e resultado gerencial por natureza financeira.",
    path: "/financeiro/relatorios/dre-gerencial",
    icon: Scale,
    available: true,
  },
  {
    id: "inadimplencia",
    title: "Inadimplência",
    description: "Clientes e títulos vencidos com valores em atraso no período.",
    path: "/financeiro/relatorios/inadimplencia",
    icon: AlertTriangle,
    available: false,
  },
];

function monthStart() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEnd() {
  const date = new Date();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function IndicatorCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "blue" | "green" | "red" | "amber" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  }[tone];

  return (
    <Card className="rounded-lg py-4">
      <CardContent className="flex items-center gap-4 px-4">
        <div className={`rounded-lg border p-2.5 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{currency(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RelatoriosFinanceiros() {
  const [, navigate] = useLocation();
  const [dtInicio, setDtInicio] = useState(monthStart());
  const [dtFim, setDtFim] = useState(monthEnd());

  const { data: indicadores, isLoading: loadingIndicadores } =
    trpc.financeiroRelatorios.indicadores.useQuery({ dtInicio, dtFim });
  const { data: relatorios = [], isLoading: loadingRelatorios } =
    trpc.financeiroRelatorios.listar.useQuery();

  const authorizedIds = useMemo(
    () => new Set(relatorios.map((report) => report.id)),
    [relatorios],
  );

  const visibleReports = REPORT_CARDS.filter((report) => authorizedIds.has(report.id));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5">
            <BarChart3 className="h-6 w-6 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Relatórios Financeiros</h1>
            <p className="text-sm text-muted-foreground">
              Indicadores e relatórios da empresa logada.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_160px]">
          <Input type="date" value={dtInicio} onChange={(event) => setDtInicio(event.target.value)} />
          <Input type="date" value={dtFim} onChange={(event) => setDtFim(event.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loadingIndicadores ? (
          <Card className="rounded-lg py-8 sm:col-span-2 xl:col-span-3">
            <CardContent className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando indicadores...
            </CardContent>
          </Card>
        ) : (
          <>
            <IndicatorCard label="Contas a Receber" value={indicadores?.contasReceber ?? 0} icon={TrendingUp} tone="green" />
            <IndicatorCard label="Contas a Pagar" value={indicadores?.contasPagar ?? 0} icon={TrendingDown} tone="red" />
            <IndicatorCard label="Saldo Atual" value={indicadores?.saldoAtual ?? 0} icon={Wallet} tone="blue" />
            <IndicatorCard label="Entradas do Período" value={indicadores?.entradasPeriodo ?? 0} icon={TrendingUp} tone="green" />
            <IndicatorCard label="Saídas do Período" value={indicadores?.saidasPeriodo ?? 0} icon={TrendingDown} tone="red" />
            <IndicatorCard label="Lucro do Período" value={indicadores?.lucroPeriodo ?? 0} icon={DollarSign} tone={(indicadores?.lucroPeriodo ?? 0) >= 0 ? "slate" : "amber"} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loadingRelatorios ? (
          <Card className="rounded-lg py-8 md:col-span-2 xl:col-span-4">
            <CardContent className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando relatórios...
            </CardContent>
          </Card>
        ) : visibleReports.length === 0 ? (
          <Card className="rounded-lg py-8 md:col-span-2 xl:col-span-4">
            <CardContent className="text-center text-sm text-muted-foreground">
              Nenhum relatório liberado para o seu usuário.
            </CardContent>
          </Card>
        ) : (
          visibleReports.map((report) => (
            <Card key={report.id} className="rounded-lg py-5">
              <CardHeader className="gap-3 px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-slate-100 p-2">
                    <report.icon className="h-5 w-5 text-slate-700" />
                  </div>
                  {!report.available && (
                    <Badge variant="secondary" className="text-[10px]">
                      Em desenvolvimento
                    </Badge>
                  )}
                </div>
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    {report.description}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-5">
                <Button
                  className="w-full"
                  variant={report.available ? "default" : "outline"}
                  disabled={!report.available}
                  onClick={() => navigate(report.path)}
                >
                  {report.available ? "Abrir relatório" : "Em desenvolvimento"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

import { useKsAuth } from "@/hooks/useKsAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  ArrowRight,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Dados dos cards de estatísticas ─────────────────────────────────────────
const STAT_CARDS = [
  {
    title: "Clientes Ativos",
    value: "—",
    change: null,
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
    path: "/cadastros/clientes",
  },
  {
    title: "Fornecedores",
    value: "—",
    change: null,
    icon: Building2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    path: "/cadastros/fornecedores",
  },
  {
    title: "Vendas do Mês",
    value: "—",
    change: null,
    icon: ShoppingCart,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
    path: "/vendas",
  },
  {
    title: "Produtos em Estoque",
    value: "—",
    change: null,
    icon: Package,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-100",
    path: "/estoque/produtos",
  },
];

// ─── Atalhos rápidos ──────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Entidades",          icon: Users,        path: "/cadastros/entidades",      color: "text-slate-600",  bg: "bg-slate-100" },
  { label: "Clientes",           icon: Users,        path: "/cadastros/clientes",       color: "text-blue-600",   bg: "bg-blue-50" },
  { label: "Fornecedores",       icon: Building2,    path: "/cadastros/fornecedores",   color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Funcionários",       icon: Users,        path: "/cadastros/funcionarios",   color: "text-cyan-600",   bg: "bg-cyan-50" },
  { label: "Transportadoras",    icon: Truck,        path: "/cadastros/transportadoras",color: "text-orange-600", bg: "bg-orange-50" },
  { label: "Empresas",           icon: Building2,    path: "/cadastros/empresas",       color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "Cargos",             icon: Briefcase,    path: "/cadastros/cargos",         color: "text-amber-600",  bg: "bg-amber-50" },
  { label: "Nova Venda",         icon: ShoppingCart, path: "/vendas",                   color: "text-violet-600", bg: "bg-violet-50" },
  { label: "Contas a Pagar",     icon: CreditCard,   path: "/financeiro/pagar",         color: "text-red-600",    bg: "bg-red-50" },
  { label: "Contas a Receber",   icon: TrendingUp,   path: "/financeiro/receber",       color: "text-teal-600",   bg: "bg-teal-50" },
  { label: "Relatórios",         icon: BarChart3,    path: "/relatorios",               color: "text-slate-600",  bg: "bg-slate-100" },
];

// ─── Status dos módulos ───────────────────────────────────────────────────────
const MODULE_STATUS = [
  { label: "Autenticação",        status: "ok",      desc: "Login e sessão funcionando" },
  { label: "Conexão SQL Server",  status: "ok",      desc: "Banco de dados conectado" },
  { label: "Cadastro de Entidades", status: "dev",   desc: "Em desenvolvimento" },
  { label: "Módulo de Vendas",    status: "pending", desc: "Aguardando implementação" },
  { label: "Módulo Financeiro",   status: "pending", desc: "Aguardando implementação" },
  { label: "Sincronização", status: "dev",    desc: "API base implementada" },
];

export default function Dashboard() {
  const { user, nomeEmpresa, guidEntidade } = useKsAuth();
  const [, navigate] = useLocation();

  const now = new Date();
  const hora = now.getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Boas-vindas ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            {saudacao},{" "}
            <span className="text-blue-600">
              {user?.nome?.split(" ")[0] ?? "Usuário"}
            </span>
            !
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Aqui está o resumo do seu sistema ERP.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs border-emerald-200 text-emerald-700 bg-emerald-50">
            <Activity className="w-3 h-3" />
            Sistema Online
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1 px-3 text-xs">
            <Clock className="w-3 h-3" />
            {now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </Badge>
        </div>
      </div>

      {/* ── Card da empresa ── */}
      <Card className="border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50">
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-200">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-blue-500 font-semibold uppercase tracking-wide">
                Empresa Vinculada
              </p>
              <p className="text-base font-bold text-slate-800 truncate">
                {nomeEmpresa ?? "—"}
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                GUID: {guidEntidade ?? "—"}
              </p>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
              <p className="text-[11px] text-slate-400">Usuário</p>
              <p className="text-sm font-semibold text-slate-700">{user?.usuario}</p>
              <Badge variant={user?.isGerente ? "default" : "secondary"} className="text-[10px] h-4">
                {user?.isGerente ? "Gerente" : "Operador"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cards de estatísticas ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <Card
            key={card.title}
            className={`border ${card.border} hover:shadow-md transition-all duration-200 cursor-pointer group`}
            onClick={() => navigate(card.path)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-slate-500">
                {card.title}
              </CardTitle>
              <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold text-slate-800">{card.value}</div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-400">Em breve</p>
                <ArrowRight className={`w-3 h-3 text-slate-300 group-hover:${card.color} transition-colors`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Atalhos rápidos + Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Atalhos — ocupa 2 colunas */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Acesso Rápido
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
                >
                  <div className={`w-10 h-10 rounded-xl ${action.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                    <action.icon className={`w-5 h-5 ${action.color}`} />
                  </div>
                  <span className="text-xs font-medium text-slate-600 text-center leading-tight">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status dos módulos */}
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Status dos Módulos
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-4 space-y-2">
            {MODULE_STATUS.map((mod) => (
              <div key={mod.label} className="flex items-start gap-2.5">
                {mod.status === "ok" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : mod.status === "dev" ? (
                  <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 leading-none">
                    {mod.label}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{mod.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Dados da sessão ── */}
      <Card className="border-dashed border-slate-200">
        <CardContent className="py-4 px-5">
          <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mb-3">
            Dados da Sessão Atual
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[11px] text-slate-400 block">Usuário</span>
              <p className="font-semibold text-slate-700">{user?.usuario ?? "—"}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Nome</span>
              <p className="font-semibold text-slate-700 truncate">{user?.nome ?? "—"}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Documento (Usuário)</span>
              <p className="font-semibold text-slate-700 font-mono">{user?.documento ?? "—"}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Doc. Empresa</span>
              <p className="font-semibold text-slate-700 font-mono">{user?.entDocumento ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

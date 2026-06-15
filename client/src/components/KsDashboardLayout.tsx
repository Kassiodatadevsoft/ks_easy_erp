import { useKsAuth } from "@/hooks/useKsAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Briefcase,
  Building2,
  ChevronRight,
  CreditCard,
  MonitorCog,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  X,
  BookOpen,
  Target,
  TrendingDown,
  TrendingUp,
  Activity,
  Landmark,
  ArrowRightLeft,
  Wallet,
  Scale,
  BarChart2,
  LayoutGrid,
  ArrowUpDown,
  HandCoins,
  BadgeCheck,
  FileSearch,
  FileUp,
  ShieldCheck,
  MessageCircle,
  ClipboardCheck,
  ClipboardList,
  KeyRound,
  FilePlus2,
  ReceiptText,
  BarChart3,
  CalendarClock,
  Percent,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const LOGO_URL = "/logo.png";
const LICENCAS_ADMIN_CNPJ = "50303631000158";

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  reportId?: string;
  status?: "development";
};

type MenuSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
};

type MenuGroup = {
  label: string;
  items?: MenuItem[];
  sections?: MenuSection[];
};

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    label: "Cadastros",
    sections: [
      {
        id: "cadastros-pessoas",
        label: "Pessoas e parceiros",
        icon: Users,
        items: [
          { icon: Users, label: "Entidades", path: "/cadastros/entidades" },
          { icon: Users, label: "Clientes", path: "/cadastros/clientes" },
          { icon: Building2, label: "Fornecedores", path: "/cadastros/fornecedores" },
          { icon: Users, label: "Funcionários", path: "/cadastros/funcionarios" },
          { icon: Truck, label: "Transportadoras", path: "/cadastros/transportadoras" },
        ],
      },
      {
        id: "cadastros-empresa",
        label: "Empresa e equipe",
        icon: Briefcase,
        items: [
          { icon: Building2, label: "Empresas", path: "/cadastros/empresas" },
          { icon: Briefcase, label: "Cargos", path: "/cadastros/cargos" },
        ],
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      { icon: BarChart2,    label: "Dashboard",  path: "/vendas/dashboard" },
      { icon: MonitorCog, label: "PDV / Operacao", path: "/vendas" },
    ],
  },
  {
    label: "Gerencial",
    items: [
      { icon: ReceiptText, label: "Vendas Finalizadas", path: "/gerencial/vendas-finalizadas" },
    ],
  },
  {
    label: "Fiscal",
    sections: [
      {
        id: "fiscal-cadastros",
        label: "Cadastros",
        icon: BookOpen,
        items: [
          { icon: FileText, label: "Natureza da Operacao / NOP", path: "/fiscal/natureza-operacao" },
        ],
      },
      {
        id: "fiscal-documentos",
        label: "Documentos fiscais",
        icon: FilePlus2,
        items: [
          { icon: FilePlus2, label: "Emissao de NF-e Avulsa", path: "/fiscal/nfe-avulsa" },
        ],
      },
    ],
  },
  {
    label: "Financeiro",
    sections: [
      {
        id: "financeiro-cadastros",
        label: "Cadastros financeiros",
        icon: BookOpen,
        items: [
          { icon: BookOpen, label: "Plano de Contas", path: "/financeiro/plano-contas" },
          { icon: Target, label: "Centro de Custo", path: "/financeiro/centro-custo" },
          { icon: Tag, label: "Natureza de Caixa", path: "/financeiro/natureza-caixa" },
          { icon: CreditCard, label: "Formas de Pagamento", path: "/financeiro/formas-pagamento" },
          { icon: Landmark, label: "Contas Bancárias", path: "/financeiro/contas-bancarias" },
        ],
      },
      {
        id: "financeiro-operacao",
        label: "Contas e caixa",
        icon: Wallet,
        items: [
          { icon: TrendingDown, label: "Contas a Pagar", path: "/financeiro/pagar" },
          { icon: TrendingUp, label: "Contas a Receber", path: "/financeiro/receber" },
          { icon: Wallet, label: "Controle de Caixas", path: "/financeiro/controle-caixas" },
          { icon: Wallet, label: "Lançamentos de Caixa", path: "/financeiro/lancamentos-caixa" },
          { icon: ArrowRightLeft, label: "Transferências", path: "/financeiro/transferencias" },
          { icon: Activity, label: "Fluxo de Caixa", path: "/financeiro/fluxo-caixa" },
        ],
      },
      {
        id: "financeiro-conciliacao",
        label: "Conciliação e importação",
        icon: BadgeCheck,
        items: [
          { icon: BadgeCheck, label: "Conciliação Cartões/PIX", path: "/financeiro/conciliacao-cartoes-pix" },
          { icon: FileSearch, label: "Conciliação Bancária", path: "/financeiro/conciliacao-bancaria" },
          { icon: FileUp, label: "Importar Extrato OFX", path: "/financeiro/importar-ofx" },
          { icon: FileUp, label: "Importar CNAB", path: "/financeiro/importar-cnab" },
        ],
      },
      {
        id: "financeiro-controle",
        label: "Controle e cobrança",
        icon: ShieldCheck,
        items: [
          { icon: ShieldCheck, label: "Auditoria Financeira", path: "/financeiro/auditoria-financeira" },
          { icon: MessageCircle, label: "Cobrança Automática", path: "/financeiro/cobranca-automatica" },
          { icon: ClipboardCheck, label: "Aprovação de Pagamentos", path: "/financeiro/aprovacao-pagamentos" },
        ],
      },
      {
        id: "financeiro-relatorios",
        label: "Relatórios",
        icon: BarChart3,
        items: [
          { icon: LayoutDashboard, label: "Visão Geral", path: "/financeiro/relatorios" },
          { icon: ReceiptText, label: "Movimentação de Caixa", path: "/financeiro/relatorios/movimentacao-caixa", reportId: "movimentacao-caixa" },
          { icon: CreditCard, label: "Vendas por Forma de Pagamento", path: "/financeiro/relatorios/vendas-forma-pagamento", reportId: "vendas-forma-pagamento" },
          { icon: TrendingUp, label: "Contas a Receber", path: "/financeiro/relatorios/contas-receber", reportId: "contas-receber" },
          { icon: TrendingDown, label: "Contas a Pagar", path: "/financeiro/relatorios/contas-pagar", reportId: "contas-pagar" },
          { icon: CalendarClock, label: "Fluxo de Caixa", path: "/financeiro/relatorios/fluxo-caixa", reportId: "fluxo-caixa" },
          { icon: Percent, label: "Comissões", path: "/financeiro/relatorios/comissoes", reportId: "comissoes" },
          { icon: Scale, label: "DRE Gerencial", path: "/financeiro/relatorios/dre-gerencial", reportId: "dre-gerencial" },
          { icon: AlertTriangle, label: "Inadimplência", path: "/financeiro/relatorios/inadimplencia", reportId: "inadimplencia" },
          { icon: Scale, label: "Balanço Patrimonial", path: "/financeiro/balanco-patrimonial" },
          { icon: HandCoins, label: "Funcionários e Pagamentos", path: "/financeiro/funcionarios-pagamentos" },
        ],
      },
    ],
  },
  {
    label: "Estoque",
    sections: [
      {
        id: "estoque-cardapio",
        label: "Cardápio",
        icon: ShoppingBag,
        items: [
          { icon: Tag, label: "Categorias", path: "/estoque/categorias" },
          { icon: Package, label: "Produtos", path: "/estoque/produtos" },
        ],
      },
      {
        id: "estoque-operacao",
        label: "Operação ERP",
        icon: LayoutGrid,
        items: [
          { icon: LayoutGrid, label: "Dashboard", path: "/estoque/dashboard" },
          { icon: Package, label: "Produtos ERP", path: "/estoque/produtos-erp" },
          { icon: ArrowUpDown, label: "Movimentações", path: "/estoque/movimentacoes" },
          { icon: ClipboardList, label: "Sugestão de Compra", path: "/estoque/sugestao-compra" },
        ],
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      { icon: ShoppingBag, label: "Pedidos Online", path: "/delivery/pedidos" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { icon: KeyRound, label: "Gerenciador de Licenças", path: "/licencas" },
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
    ],
  },
];

function normalizeCnpj(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function canViewLicencas(user: { entDocumento?: string | null; documento?: string | null } | null | undefined) {
  return normalizeCnpj(user?.entDocumento) === LICENCAS_ADMIN_CNPJ || normalizeCnpj(user?.documento) === LICENCAS_ADMIN_CNPJ;
}

function getVisibleMenuGroups(
  user: { entDocumento?: string | null; documento?: string | null } | null | undefined,
  authorizedReportIds?: Set<string>,
) {
  const showLicencas = canViewLicencas(user);
  const canViewItem = (item: MenuItem) => {
    if (item.path === "/licencas" && !showLicencas) return false;
    if (!item.reportId || !authorizedReportIds) return true;
    return authorizedReportIds.has(item.reportId);
  };

  return MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items?.filter(canViewItem),
    sections: group.sections?.map((section) => ({
      ...section,
      items: section.items.filter(canViewItem),
    })).filter((section) => section.items.length > 0),
  })).filter((group) => (group.items?.length ?? 0) > 0 || (group.sections?.length ?? 0) > 0);
}

function getGroupItems(group: MenuGroup) {
  return group.sections?.flatMap((section) => section.items) ?? group.items ?? [];
}

function getAllMenuItems(groups = MENU_GROUPS) {
  return groups.flatMap(getGroupItems);
}

function getActiveSectionIds(path: string, groups = MENU_GROUPS) {
  return groups.flatMap((group) =>
    group.sections
      ?.filter((section) => section.items.some((item) => item.path === path))
      .map((section) => section.id) ?? [],
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function KsDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useKsAuth();
  const [, navigate] = useLocation();

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    navigate("/login");
    return null;
  }

  return <KsLayoutInner>{children}</KsLayoutInner>;
}

// ─── Layout interno ───────────────────────────────────────────────────────────
function KsLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, nomeEmpresa, logout } = useKsAuth();
  const [location, setLocation] = useLocation();
  const { data: relatoriosAutorizados } = trpc.financeiroRelatorios.listar.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
  const authorizedReportIds = useMemo(
    () => new Set((relatoriosAutorizados ?? []).map((report) => report.id)),
    [relatoriosAutorizados],
  );
  const menuGroups = useMemo(
    () => getVisibleMenuGroups(user, authorizedReportIds),
    [user?.entDocumento, user?.documento, authorizedReportIds],
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(getActiveSectionIds(location, menuGroups)),
  );

  useEffect(() => {
    const activeSectionIds = getActiveSectionIds(location, menuGroups);
    if (!activeSectionIds.length) return;

    setOpenSections((current) => {
      const next = new Set(current);
      activeSectionIds.forEach((id) => next.add(id));
      return next;
    });
  }, [location, menuGroups]);

  const initials = (user?.nome ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  const activeLabel =
    getAllMenuItems(menuGroups).find((i) => i.path === location)?.label ??
    "Dashboard";

  const sidebarWidth = collapsed ? 64 : 240;

  // ─── Sidebar compartilhada ────────────────────────────────────────────────
  function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
    const showText = !collapsed || isMobile;

    function toggleSection(sectionId: string) {
      setOpenSections((current) => {
        const next = new Set(current);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
    }

    function renderMenuItem(item: MenuItem, nested = false) {
      const isActive = location === item.path;

      return (
        <button
          key={item.path}
          onClick={() => {
            setLocation(item.path);
            onNavigate?.();
          }}
          title={!showText ? item.label : undefined}
          className={`
            w-full flex items-center gap-3 rounded-lg h-9 text-sm font-medium
            transition-all duration-150 group relative
            ${showText ? (nested ? "px-3 pl-8" : "px-3") : "justify-center px-0"}
            ${
              isActive
                ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                : "text-white/60 hover:text-white hover:bg-white/8"
            }
          `}
        >
          <item.icon
            className={`w-4 h-4 shrink-0 transition-colors ${
              isActive ? "text-white" : "text-white/50 group-hover:text-white/80"
            }`}
          />
          {showText && <span className="flex-1 text-left truncate">{item.label}</span>}
          {showText && item.status === "development" && (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/45">
              Dev
            </span>
          )}
        </button>
      );
    }

    function renderSection(section: MenuSection) {
      const isOpen = openSections.has(section.id);
      const hasActiveItem = section.items.some((item) => item.path === location);

      if (!showText) {
        return section.items.map((item) => renderMenuItem(item));
      }

      return (
        <div key={section.id} className="space-y-0.5">
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className={`
              w-full flex items-center gap-2 rounded-lg px-3 h-9 text-xs font-semibold
              transition-all duration-150
              ${
                hasActiveItem
                  ? "text-white bg-white/10"
                  : "text-white/50 hover:text-white hover:bg-white/8"
              }
            `}
          >
            <section.icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">{section.label}</span>
            <ChevronRight
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                isOpen ? "rotate-90" : ""
              }`}
            />
          </button>
          {isOpen && (
            <div className="space-y-0.5">
              {section.items.map((item) => renderMenuItem(item, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div
          className={`flex items-center h-14 border-b border-white/8 shrink-0 px-4 ${
            collapsed && !isMobile ? "justify-center px-0" : "gap-2.5"
          }`}
        >
          {(!collapsed || isMobile) ? (
            <img
              src={LOGO_URL}
              alt="DataDev"
              className="h-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <img
              src={LOGO_URL}
              alt="DataDev"
              className="h-6 w-6 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          {(!collapsed || isMobile) && (
            <span className="text-white/40 text-xs font-medium">ERP</span>
          )}
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {menuGroups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && showText && (
                <div className="px-3 pt-4 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {group.label}
                  </span>
                </div>
              )}
              {gi > 0 && !showText && (
                <div className="my-2 mx-2">
                  <Separator className="bg-white/10" />
                </div>
              )}
              <div className="space-y-0.5">
                {group.items?.map((item) => renderMenuItem(item))}
                {group.sections?.map((section) => renderSection(section))}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé com usuário */}
        <div className="shrink-0 p-2 border-t border-white/8">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`
                  w-full flex items-center gap-2.5 rounded-lg px-2 py-2
                  hover:bg-white/8 transition-colors focus:outline-none
                  ${collapsed && !isMobile ? "justify-center px-0" : ""}
                `}
              >
                <Avatar className="h-7 w-7 shrink-0 border border-white/20">
                  <AvatarFallback className="text-[10px] font-bold bg-blue-600 text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {(!collapsed || isMobile) && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-white truncate leading-none">
                      {user?.nome?.split(" ")[0] ?? "Usuário"}
                    </p>
                    <p className="text-[10px] text-white/40 truncate mt-0.5">
                      {nomeEmpresa ?? user?.entDocumento ?? "—"}
                    </p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
              <DropdownMenuLabel className="pb-1">
                <p className="text-sm font-semibold truncate">{user?.nome}</p>
                <p className="text-xs text-muted-foreground font-normal truncate">
                  {user?.usuario}
                </p>
                {nomeEmpresa && (
                  <Badge variant="secondary" className="mt-1.5 text-[10px] h-4">
                    {nomeEmpresa}
                  </Badge>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair do sistema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── Sidebar desktop ── */}
      {!isMobile && (
        <aside
          className="hidden md:flex flex-col bg-[#0f1623] border-r border-white/5 shrink-0 transition-all duration-200"
          style={{ width: sidebarWidth }}
        >
          <SidebarContent />
        </aside>
      )}

      {/* ── Drawer mobile ── */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0f1623] z-50 flex flex-col shadow-2xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            {!isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500 hover:text-slate-700"
                onClick={() => setCollapsed((c) => !c)}
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-500"
                onClick={() => setMobileOpen((o) => !o)}
              >
                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
            )}

            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-400 hidden sm:inline">DataDev ERP</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
              <span className="font-semibold text-slate-700">{activeLabel}</span>
            </div>
          </div>

          {/* Lado direito */}
          <div className="flex items-center gap-3">
            {nomeEmpresa && (
              <Badge
                variant="secondary"
                className="hidden sm:flex gap-1.5 py-1 px-2.5 text-xs"
              >
                <Building2 className="w-3 h-3" />
                {nomeEmpresa}
              </Badge>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors focus:outline-none">
                  <Avatar className="h-7 w-7 border border-slate-200">
                    <AvatarFallback className="text-[10px] font-bold bg-blue-600 text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-slate-700 hidden sm:inline">
                    {user?.nome?.split(" ")[0]}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="pb-1">
                  <p className="text-sm font-semibold">{user?.nome}</p>
                  <p className="text-xs text-muted-foreground font-normal">
                    {user?.usuario}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair do sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Conteúdo da página */}
        <main className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}

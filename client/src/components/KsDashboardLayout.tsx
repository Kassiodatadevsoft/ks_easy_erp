import { useKsAuth } from "@/hooks/useKsAuth";
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
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const LOGO_URL = "/manus-storage/datadev-logo-clean_3b290173.png";

// ─── Definição do menu ────────────────────────────────────────────────────────
const MENU_GROUPS = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { icon: Users,     label: "Clientes",        path: "/cadastros/clientes" },
      { icon: Building2, label: "Fornecedores",     path: "/cadastros/fornecedores" },
      { icon: Users,     label: "Funcionários",     path: "/cadastros/funcionarios" },
      { icon: Truck,     label: "Transportadoras",  path: "/cadastros/transportadoras" },
      { icon: Building2, label: "Empresas",         path: "/cadastros/empresas" },
      { icon: Briefcase, label: "Cargos",            path: "/cadastros/cargos" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { icon: ShoppingCart, label: "Vendas",   path: "/vendas" },
      { icon: FileText,     label: "Pedidos",  path: "/pedidos" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { icon: CreditCard, label: "Contas a Pagar",   path: "/financeiro/pagar" },
      { icon: CreditCard, label: "Contas a Receber", path: "/financeiro/receber" },
    ],
  },
  {
    label: "Estoque / Cardápio",
    items: [
      { icon: Tag,     label: "Categorias", path: "/estoque/categorias" },
      { icon: Package, label: "Produtos",   path: "/estoque/produtos" },
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
      { icon: Settings, label: "Configurações", path: "/configuracoes" },
    ],
  },
];

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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const initials = (user?.nome ?? "U")
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  const activeLabel =
    MENU_GROUPS.flatMap((g) => g.items).find((i) => i.path === location)?.label ??
    "Dashboard";

  const sidebarWidth = collapsed ? 64 : 240;

  // ─── Sidebar compartilhada ────────────────────────────────────────────────
  function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
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
          {MENU_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && (!collapsed || isMobile) && (
                <div className="px-3 pt-4 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                    {group.label}
                  </span>
                </div>
              )}
              {gi > 0 && (collapsed && !isMobile) && (
                <div className="my-2 mx-2">
                  <Separator className="bg-white/10" />
                </div>
              )}
              {group.items.map((item) => {
                const isActive = location === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      setLocation(item.path);
                      onNavigate?.();
                    }}
                    title={collapsed && !isMobile ? item.label : undefined}
                    className={`
                      w-full flex items-center gap-3 rounded-lg px-3 h-9 text-sm font-medium
                      transition-all duration-150 group relative
                      ${collapsed && !isMobile ? "justify-center px-0" : ""}
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
                    {(!collapsed || isMobile) && (
                      <>
                        <span className="flex-1 text-left truncate">{item.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
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

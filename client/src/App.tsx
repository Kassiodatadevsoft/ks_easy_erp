import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import Clientes from "./pages/Clientes";
import Fornecedores from "./pages/Fornecedores";
import Empresas from "./pages/Empresas";
import Cargos from "./pages/Cargos";
import Funcionarios from "./pages/Funcionarios";
import Transportadoras from "./pages/Transportadoras";
import KsDashboardLayout from "./components/KsDashboardLayout";
import { useKsAuth } from "./hooks/useKsAuth";
import { useEffect } from "react";

/**
 * Rota protegida: redireciona para /login se não houver sessão KS válida.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useKsAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  if (loading) return null;
  if (!user) return null;

  return <KsDashboardLayout>{children}</KsDashboardLayout>;
}

function RedirectToLogin() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/login"); }, [navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      {/* Rota pública */}
      <Route path="/" component={RedirectToLogin} />
      <Route path="/login" component={Login} />

      {/* Dashboard */}
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>

      {/* Cadastros */}
      <Route path="/cadastros/clientes">
        <ProtectedRoute><Clientes /></ProtectedRoute>
      </Route>
      <Route path="/cadastros/fornecedores">
        <ProtectedRoute><Fornecedores /></ProtectedRoute>
      </Route>
      <Route path="/cadastros/funcionarios">
        <ProtectedRoute><Funcionarios /></ProtectedRoute>
      </Route>
      <Route path="/cadastros/transportadoras">
        <ProtectedRoute><Transportadoras /></ProtectedRoute>
      </Route>
      <Route path="/cadastros/empresas">
        <ProtectedRoute><Empresas /></ProtectedRoute>
      </Route>
      <Route path="/cadastros/cargos">
        <ProtectedRoute><Cargos /></ProtectedRoute>
      </Route>

      {/* Comercial */}
      <Route path="/vendas">
        <ProtectedRoute><ComingSoon title="Módulo de Vendas" /></ProtectedRoute>
      </Route>
      <Route path="/pedidos">
        <ProtectedRoute><ComingSoon title="Módulo de Pedidos" /></ProtectedRoute>
      </Route>

      {/* Financeiro */}
      <Route path="/financeiro/pagar">
        <ProtectedRoute><ComingSoon title="Contas a Pagar" /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/receber">
        <ProtectedRoute><ComingSoon title="Contas a Receber" /></ProtectedRoute>
      </Route>

      {/* Estoque */}
      <Route path="/estoque/produtos">
        <ProtectedRoute><ComingSoon title="Cadastro de Produtos" /></ProtectedRoute>
      </Route>

      {/* Configurações */}
      <Route path="/configuracoes">
        <ProtectedRoute><ComingSoon title="Configurações do Sistema" /></ProtectedRoute>
      </Route>

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

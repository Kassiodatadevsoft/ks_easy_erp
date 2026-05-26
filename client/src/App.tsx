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
import Entidades from "./pages/Entidades";
import Categorias from "./pages/Categorias";
import Produtos from "./pages/Produtos";
import KsDashboardLayout from "./components/KsDashboardLayout";
import { useKsAuth } from "./hooks/useKsAuth";
import { useEffect } from "react";
// Delivery
import { DeliveryCartProvider } from "./contexts/DeliveryCartContext";
import DeliveryCartDrawer from "./components/delivery/DeliveryCartDrawer";
import Cardapio from "./pages/delivery/Cardapio";
import CheckoutDelivery from "./pages/delivery/Checkout";
import PedidoTracking from "./pages/delivery/PedidoTracking";
import PedidosOnline from "./pages/delivery/PedidosOnline";
// Financeiro
import PlanoContas from "./pages/financeiro/PlanoContas";
import CentroCusto from "./pages/financeiro/CentroCusto";
import NaturezaCaixa from "./pages/financeiro/NaturezaCaixa";
import ContasPagar from "./pages/financeiro/ContasPagar";
import ContasReceber from "./pages/financeiro/ContasReceber";
import FluxoCaixa from "./pages/financeiro/FluxoCaixa";
import FormasPagamento from "./pages/financeiro/FormasPagamento";

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
      <Route path="/cadastros/entidades">
        <ProtectedRoute><Entidades /></ProtectedRoute>
      </Route>
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
      <Route path="/financeiro/plano-contas">
        <ProtectedRoute><PlanoContas /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/centro-custo">
        <ProtectedRoute><CentroCusto /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/natureza-caixa">
        <ProtectedRoute><NaturezaCaixa /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/pagar">
        <ProtectedRoute><ContasPagar /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/receber">
        <ProtectedRoute><ContasReceber /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/fluxo-caixa">
        <ProtectedRoute><FluxoCaixa /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/formas-pagamento">
        <ProtectedRoute><FormasPagamento /></ProtectedRoute>
      </Route>

      {/* Estoque / Cardápio */}
      <Route path="/estoque/categorias">
        <ProtectedRoute><Categorias /></ProtectedRoute>
      </Route>
      <Route path="/estoque/produtos">
        <ProtectedRoute><Produtos /></ProtectedRoute>
      </Route>

      {/* Delivery — admin */}
      <Route path="/delivery/pedidos">
        <ProtectedRoute><PedidosOnline /></ProtectedRoute>
      </Route>

      {/* Delivery — público (cardápio, checkout, rastreamento) */}
      <Route path="/cardapio" component={Cardapio} />
      <Route path="/checkout" component={CheckoutDelivery} />
      <Route path="/pedido/:token" component={PedidoTracking} />

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
          <DeliveryCartProvider>
            <Toaster />
            <Router />
            <DeliveryCartDrawer />
          </DeliveryCartProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

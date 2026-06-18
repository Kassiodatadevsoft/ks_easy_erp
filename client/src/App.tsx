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
import Licencas from "./pages/Licencas";
import SeriesNiveis from "./pages/SeriesNiveis";
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
import ContasBancarias from "./pages/financeiro/ContasBancarias";
import Transferencias from "./pages/financeiro/Transferencias";
import LancamentosCaixa from "./pages/financeiro/LancamentosCaixa";
import ControleCaixas from "./pages/financeiro/ControleCaixas";
import BalancoPatrimonial from "./pages/financeiro/BalancoPatrimonial";
import FuncionariosPagamentos from "./pages/financeiro/FuncionariosPagamentos";
import ConciliacaoCartoesPix from "./pages/financeiro/ConciliacaoCartoesPix";
import ConciliacaoBancaria from "./pages/financeiro/ConciliacaoBancaria";
import ImportarExtratoOfx from "./pages/financeiro/ImportarExtratoOfx";
import ImportarCnab from "./pages/financeiro/ImportarCnab";
import AuditoriaFinanceira from "./pages/financeiro/AuditoriaFinanceira";
import CobrancaAutomatica from "./pages/financeiro/CobrancaAutomatica";
import AprovacaoPagamentos from "./pages/financeiro/AprovacaoPagamentos";
import RelatoriosFinanceiros from "./pages/financeiro/RelatoriosFinanceiros";
import RelatorioVendasFormaPagamento from "./pages/financeiro/RelatorioVendasFormaPagamento";
import RelatorioContasReceber from "./pages/financeiro/RelatorioContasReceber";
import RelatorioContasPagar from "./pages/financeiro/RelatorioContasPagar";
import RelatorioExtratoFluxoCaixa from "./pages/financeiro/RelatorioExtratoFluxoCaixa";
import RelatorioComissoes from "./pages/financeiro/RelatorioComissoes";
import RelatorioDreGerencial from "./pages/financeiro/RelatorioDreGerencial";
import RelatorioInadimplencia from "./pages/financeiro/RelatorioInadimplencia";
// Vendas
import DashboardVendas from "./pages/vendas/DashboardVendas";
import VendasOperacao from "./pages/vendas/VendasOperacao";
import VendasFinalizadas from "./pages/vendas/VendasFinalizadas";
import NfeAvulsa from "./pages/fiscal/NfeAvulsa";
import NaturezaOperacao from "./pages/fiscal/NaturezaOperacao";
// Estoque ERP
import EstoqueDashboard from "./pages/estoque/EstoqueDashboard";
import MovimentacoesEstoque from "./pages/estoque/MovimentacoesEstoque";
import SugestaoCompra from "./pages/estoque/SugestaoCompra";

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
      <Route path="/cadastros/series-niveis">
        <ProtectedRoute><SeriesNiveis /></ProtectedRoute>
      </Route>

      {/* Comercial */}
      <Route path="/vendas">
        <ProtectedRoute><VendasOperacao /></ProtectedRoute>
      </Route>
      <Route path="/vendas/dashboard">
        <ProtectedRoute><DashboardVendas /></ProtectedRoute>
      </Route>
      <Route path="/gerencial/vendas-finalizadas">
        <ProtectedRoute><VendasFinalizadas /></ProtectedRoute>
      </Route>
      <Route path="/pedidos">
        <ProtectedRoute><ComingSoon title="Módulo de Pedidos" /></ProtectedRoute>
      </Route>

      {/* Fiscal */}
      <Route path="/fiscal/natureza-operacao">
        <ProtectedRoute><NaturezaOperacao /></ProtectedRoute>
      </Route>
      <Route path="/fiscal/nfe-avulsa">
        <ProtectedRoute><NfeAvulsa /></ProtectedRoute>
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
      <Route path="/financeiro/contas-bancarias">
        <ProtectedRoute><ContasBancarias /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/transferencias">
        <ProtectedRoute><Transferencias /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/lancamentos-caixa">
        <ProtectedRoute><LancamentosCaixa /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/controle-caixas">
        <ProtectedRoute><ControleCaixas /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/conciliacao-cartoes-pix">
        <ProtectedRoute><ConciliacaoCartoesPix /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/conciliacao-bancaria">
        <ProtectedRoute><ConciliacaoBancaria /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/importar-ofx">
        <ProtectedRoute><ImportarExtratoOfx /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/importar-cnab">
        <ProtectedRoute><ImportarCnab /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/auditoria-financeira">
        <ProtectedRoute><AuditoriaFinanceira /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/cobranca-automatica">
        <ProtectedRoute><CobrancaAutomatica /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/aprovacao-pagamentos">
        <ProtectedRoute><AprovacaoPagamentos /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios">
        <ProtectedRoute><RelatoriosFinanceiros /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/movimentacao-caixa">
        <ProtectedRoute><LancamentosCaixa /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/vendas-forma-pagamento">
        <ProtectedRoute><RelatorioVendasFormaPagamento /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/contas-receber">
        <ProtectedRoute><RelatorioContasReceber /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/contas-pagar">
        <ProtectedRoute><RelatorioContasPagar /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/fluxo-caixa">
        <ProtectedRoute><RelatorioExtratoFluxoCaixa /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/comissoes">
        <ProtectedRoute><RelatorioComissoes /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/dre-gerencial">
        <ProtectedRoute><RelatorioDreGerencial /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/relatorios/inadimplencia">
        <ProtectedRoute><RelatorioInadimplencia /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/balanco-patrimonial">
        <ProtectedRoute><BalancoPatrimonial /></ProtectedRoute>
      </Route>
      <Route path="/financeiro/funcionarios-pagamentos">
        <ProtectedRoute><FuncionariosPagamentos /></ProtectedRoute>
      </Route>

      {/* Estoque / Cardápio */}
      <Route path="/estoque/categorias">
        <ProtectedRoute><Categorias /></ProtectedRoute>
      </Route>
      <Route path="/estoque/produtos">
        <ProtectedRoute><Produtos /></ProtectedRoute>
      </Route>

      {/* Estoque ERP */}
      <Route path="/estoque/dashboard">
        <ProtectedRoute><EstoqueDashboard /></ProtectedRoute>
      </Route>
      <Route path="/estoque/produtos-erp">
        <ProtectedRoute><Produtos /></ProtectedRoute>
      </Route>
      <Route path="/estoque/movimentacoes">
        <ProtectedRoute><MovimentacoesEstoque /></ProtectedRoute>
      </Route>
      <Route path="/estoque/sugestao-compra">
        <ProtectedRoute><SugestaoCompra /></ProtectedRoute>
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
      <Route path="/licencas">
        <ProtectedRoute><Licencas /></ProtectedRoute>
      </Route>
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

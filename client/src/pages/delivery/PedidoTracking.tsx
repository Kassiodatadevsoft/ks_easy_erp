import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, Clock, ChefHat, Truck, Package, XCircle, Store
} from "lucide-react";

type StatusPedido = "RECEBIDO" | "PREPARANDO" | "SAIU_ENTREGA" | "ENTREGUE" | "CANCELADO" | "PRONTO_RETIRADA";

const STATUS_STEPS: { key: StatusPedido; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "RECEBIDO",        label: "Pedido Recebido",     icon: <Package className="w-5 h-5" />,      desc: "Seu pedido foi confirmado" },
  { key: "PREPARANDO",      label: "Em Preparo",           icon: <ChefHat className="w-5 h-5" />,      desc: "Nossa equipe está preparando" },
  { key: "SAIU_ENTREGA",    label: "Saiu para Entrega",    icon: <Truck className="w-5 h-5" />,        desc: "Está a caminho!" },
  { key: "PRONTO_RETIRADA", label: "Pronto para Retirada", icon: <Store className="w-5 h-5" />,       desc: "Pode vir buscar!" },
  { key: "ENTREGUE",        label: "Entregue",             icon: <CheckCircle2 className="w-5 h-5" />, desc: "Bom apetite!" },
];

const STATUS_ORDER: Record<StatusPedido, number> = {
  RECEBIDO: 0, PREPARANDO: 1, SAIU_ENTREGA: 2, PRONTO_RETIRADA: 2, ENTREGUE: 3, CANCELADO: -1,
};

const PAYMENT_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro", CARTAO_CREDITO: "Cartão Crédito", CARTAO_DEBITO: "Cartão Débito", PIX: "PIX",
};

export default function PedidoTracking() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = trpc.delivery.pedidoPorToken.useQuery(
    { token: params.token ?? "" },
    { enabled: !!params.token, refetchInterval: 15000 }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando seu pedido...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Pedido não encontrado</h2>
          <p className="text-muted-foreground mb-6">Verifique o link e tente novamente.</p>
          <Button onClick={() => navigate("/cardapio")} className="bg-primary text-primary-foreground">
            Voltar ao cardápio
          </Button>
        </div>
      </div>
    );
  }

  const status = data.STATUS as StatusPedido;
  const currentStep = STATUS_ORDER[status] ?? 0;
  const isCancelled = status === "CANCELADO";
  const isRetirada = data.TIPOENTREGA === "RETIRADA";

  // Filtrar steps relevantes por tipo de entrega
  const steps = STATUS_STEPS.filter(s => {
    if (isRetirada) return s.key !== "SAIU_ENTREGA";
    return s.key !== "PRONTO_RETIRADA";
  });

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container max-w-2xl mx-auto px-4 pt-8">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-primary text-sm font-medium uppercase tracking-widest mb-2">
            Acompanhamento
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-1">
            Pedido #{data.IDPEDIDO}
          </h1>
          <p className="text-muted-foreground text-sm">
            Olá, <span className="text-foreground font-medium">{data.NOMECLIENTE}</span>! Acompanhe seu pedido abaixo.
          </p>
        </div>

        {/* Status */}
        {isCancelled ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 text-center mb-8">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
            <p className="font-bold text-foreground text-lg">Pedido Cancelado</p>
            <p className="text-muted-foreground text-sm mt-1">
              Entre em contato conosco para mais informações.
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-6 mb-6">
            <div className="space-y-4">
              {steps.map((step, idx) => {
                const stepOrder = STATUS_ORDER[step.key] ?? idx;
                const isDone = stepOrder < currentStep;
                const isActive = stepOrder === currentStep;
                return (
                  <div key={step.key} className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isDone ? "bg-primary text-primary-foreground" :
                      isActive ? "bg-primary/20 text-primary border-2 border-primary" :
                      "bg-secondary text-muted-foreground"
                    }`}>
                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : step.icon}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className={`font-semibold text-sm ${isActive ? "text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                        {isActive && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                            <Clock className="w-3 h-3" /> Agora
                          </span>
                        )}
                      </p>
                      <p className={`text-xs mt-0.5 ${isActive ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detalhes do pedido */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
          {/* Endereço */}
          {data.TIPOENTREGA === "ENTREGA" && data.LOGRADOURO && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Endereço de Entrega</p>
              <p className="text-sm text-foreground">
                {data.LOGRADOURO}, {data.NUMERO}
                {data.COMPLEMENTO ? ` — ${data.COMPLEMENTO}` : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.BAIRRO}{data.CIDADE ? `, ${data.CIDADE}` : ""}
              </p>
            </div>
          )}
          {data.TIPOENTREGA === "RETIRADA" && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tipo</p>
              <p className="text-sm text-foreground">Retirada no local</p>
            </div>
          )}

          <Separator />

          {/* Itens */}
          {data.itens && data.itens.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Itens</p>
              <div className="space-y-2">
                {data.itens.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-tight">
                        {item.QUANTIDADE}x {item.NOMEPRODUTO}
                      </p>
                      {item.TAMANHO && item.TAMANHO !== "UNICO" && (
                        <p className="text-xs text-muted-foreground">{item.TAMANHO}</p>
                      )}
                    </div>
                    <span className="text-foreground font-medium shrink-0">
                      R$ {(item.TOTALITEM ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Totais */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>R$ {(data.SUBTOTAL ?? 0).toFixed(2)}</span>
            </div>
            {data.TAXAENTREGA > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Taxa de entrega</span>
                <span>R$ {(data.TAXAENTREGA ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground">
              <span>Total</span>
              <span>R$ {(data.TOTAL ?? 0).toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Pagamento */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pagamento</span>
            <span className="text-foreground font-medium">
              {PAYMENT_LABELS[data.FORMAPAGAMENTO] ?? data.FORMAPAGAMENTO}
            </span>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Button variant="outline" onClick={() => navigate("/cardapio")}>
            Fazer novo pedido
          </Button>
        </div>
      </div>
    </div>
  );
}

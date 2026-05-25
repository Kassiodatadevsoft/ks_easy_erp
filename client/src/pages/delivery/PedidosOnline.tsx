import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Eye, ChevronRight, Truck, Store } from "lucide-react";
import { toast } from "sonner";
import { useKsAuth } from "@/hooks/useKsAuth";

type StatusPedido = "RECEBIDO" | "PREPARANDO" | "SAIU_ENTREGA" | "ENTREGUE" | "CANCELADO" | "PRONTO_RETIRADA";

const STATUS_LABELS: Record<StatusPedido, string> = {
  RECEBIDO: "Recebido",
  PREPARANDO: "Em Preparo",
  SAIU_ENTREGA: "Saiu para Entrega",
  PRONTO_RETIRADA: "Pronto p/ Retirada",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const STATUS_COLORS: Record<StatusPedido, string> = {
  RECEBIDO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PREPARANDO: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  SAIU_ENTREGA: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  PRONTO_RETIRADA: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ENTREGUE: "bg-green-500/20 text-green-400 border-green-500/30",
  CANCELADO: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_NEXT: Record<string, StatusPedido[]> = {
  RECEBIDO: ["PREPARANDO", "CANCELADO"],
  PREPARANDO: ["SAIU_ENTREGA", "PRONTO_RETIRADA", "CANCELADO"],
  SAIU_ENTREGA: ["ENTREGUE", "CANCELADO"],
  PRONTO_RETIRADA: ["ENTREGUE", "CANCELADO"],
  ENTREGUE: [],
  CANCELADO: [],
};

const PAYMENT_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro", CARTAO_CREDITO: "Crédito", CARTAO_DEBITO: "Débito", PIX: "PIX",
};

export default function PedidosOnline() {
  const { user } = useKsAuth();
  const guidentidade = user?.guidEntidade ?? "";
  const utils = trpc.useUtils();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: pedidos, isLoading, refetch } = trpc.delivery.pedidosAdmin.useQuery(
    { guidentidade },
    { enabled: !!guidentidade, refetchInterval: 30000 }
  );

  const { data: detalhe } = trpc.delivery.pedidoComItens.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const atualizarStatus = trpc.delivery.atualizarStatusPedido.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.delivery.pedidosAdmin.invalidate();
      if (selectedId) utils.delivery.pedidoComItens.invalidate({ id: selectedId });
    },
    onError: (err) => toast.error("Erro ao atualizar", { description: err.message }),
  });

  const filtered = filterStatus === "all"
    ? pedidos
    : pedidos?.filter(p => p.STATUS === filterStatus);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pedidos Online</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie os pedidos do delivery em tempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} className="border-border">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <span className="text-5xl block mb-4">📦</span>
          <p className="font-semibold text-foreground mb-1">Nenhum pedido encontrado</p>
          <p className="text-sm">Os pedidos aparecerão aqui assim que forem realizados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(pedido => {
            const status = pedido.STATUS as StatusPedido;
            const colorClass = STATUS_COLORS[status] ?? "bg-secondary text-muted-foreground";
            const isEntrega = pedido.TIPOENTREGA === "ENTREGA";
            return (
              <div
                key={pedido.IDPEDIDO}
                className="bg-card rounded-xl border border-border p-4 flex items-center gap-4 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setSelectedId(pedido.IDPEDIDO)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground text-sm">#{pedido.IDPEDIDO}</span>
                    <Badge className={`text-xs border ${colorClass}`}>
                      {STATUS_LABELS[status] ?? status}
                    </Badge>
                    <Badge variant="outline" className="text-xs gap-1">
                      {isEntrega ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                      {isEntrega ? "Entrega" : "Retirada"}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mt-1 font-medium">{pedido.NOMECLIENTE}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>{pedido.TELEFONE}</span>
                    <span>·</span>
                    <span>R$ {(pedido.TOTAL ?? 0).toFixed(2)}</span>
                    <span>·</span>
                    <span>{PAYMENT_LABELS[pedido.FORMAPAGAMENTO] ?? pedido.FORMAPAGAMENTO}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="icon" className="border-border h-8 w-8">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog de detalhe */}
      <Dialog open={!!selectedId} onOpenChange={v => !v && setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Pedido #{detalhe?.IDPEDIDO}
              {detalhe && (
                <Badge className={`ml-2 text-xs border ${STATUS_COLORS[detalhe.STATUS as StatusPedido] ?? "bg-secondary"}`}>
                  {STATUS_LABELS[detalhe.STATUS as StatusPedido] ?? detalhe.STATUS}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detalhe && (
            <div className="space-y-4">
              {/* Cliente */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-sm text-foreground font-medium">{detalhe.NOMECLIENTE}</p>
                {detalhe.TELEFONE && <p className="text-sm text-muted-foreground">{detalhe.TELEFONE}</p>}
                {detalhe.EMAIL && <p className="text-sm text-muted-foreground">{detalhe.EMAIL}</p>}
              </div>

              {/* Endereço */}
              {detalhe.TIPOENTREGA === "ENTREGA" && detalhe.LOGRADOURO && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Endereço</p>
                  <p className="text-sm text-foreground">
                    {detalhe.LOGRADOURO}, {detalhe.NUMERO}
                    {detalhe.COMPLEMENTO ? ` — ${detalhe.COMPLEMENTO}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {detalhe.BAIRRO}{detalhe.CIDADE ? `, ${detalhe.CIDADE}` : ""}
                    {detalhe.CEP ? ` — ${detalhe.CEP}` : ""}
                  </p>
                </div>
              )}
              {detalhe.TIPOENTREGA === "RETIRADA" && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tipo</p>
                  <p className="text-sm text-foreground">Retirada no local</p>
                </div>
              )}

              <Separator />

              {/* Itens */}
              {detalhe.itens && detalhe.itens.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Itens</p>
                  <div className="space-y-2">
                    {detalhe.itens.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground">{item.QUANTIDADE}x {item.NOMEPRODUTO}</p>
                          {item.TAMANHO && item.TAMANHO !== "UNICO" && (
                            <p className="text-xs text-muted-foreground">{item.TAMANHO}</p>
                          )}
                          {item.OBSERVACAO && (
                            <p className="text-xs text-muted-foreground italic">{item.OBSERVACAO}</p>
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
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>R$ {(detalhe.SUBTOTAL ?? 0).toFixed(2)}</span>
                </div>
                {detalhe.TAXAENTREGA > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxa de entrega</span>
                    <span>R$ {(detalhe.TAXAENTREGA ?? 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-foreground">
                  <span>Total</span>
                  <span>R$ {(detalhe.TOTAL ?? 0).toFixed(2)}</span>
                </div>
              </div>

              <Separator />

              {/* Pagamento */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pagamento</span>
                <span className="text-foreground font-medium">
                  {PAYMENT_LABELS[detalhe.FORMAPAGAMENTO] ?? detalhe.FORMAPAGAMENTO}
                  {detalhe.TROCOPARA && ` (troco p/ R$ ${detalhe.TROCOPARA.toFixed(2)})`}
                </span>
              </div>

              {detalhe.OBSERVACAO && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Observação</p>
                    <p className="text-sm text-foreground">{detalhe.OBSERVACAO}</p>
                  </div>
                </>
              )}

              {/* Avançar status */}
              {STATUS_NEXT[detalhe.STATUS]?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Atualizar Status</p>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_NEXT[detalhe.STATUS].map(nextStatus => (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant={nextStatus === "CANCELADO" ? "destructive" : "default"}
                          disabled={atualizarStatus.isPending}
                          onClick={() => atualizarStatus.mutate({ id: detalhe.IDPEDIDO, status: nextStatus })}
                          className={nextStatus !== "CANCELADO" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                        >
                          {STATUS_LABELS[nextStatus]}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

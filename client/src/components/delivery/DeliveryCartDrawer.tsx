import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useDeliveryCart } from "@/contexts/DeliveryCartContext";
import { useLocation } from "wouter";

const DELIVERY_FEE = 5;

export default function DeliveryCartDrawer() {
  const { items, totalItems, subtotal, removeItem, updateQuantity, isOpen, closeCart } = useDeliveryCart();
  const [, navigate] = useLocation();
  const total = subtotal + DELIVERY_FEE;

  return (
    <Sheet open={isOpen} onOpenChange={v => !v && closeCart()}>
      <SheetContent side="right" className="w-full sm:w-96 flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Carrinho
            {totalItems > 0 && (
              <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-5xl">🛒</span>
            <p className="text-foreground font-semibold">Carrinho vazio</p>
            <p className="text-muted-foreground text-sm">Adicione produtos do cardápio para começar.</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => { closeCart(); navigate("/cardapio"); }}
            >
              Ver Cardápio
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {items.map(item => (
                <div key={item.id} className="flex gap-3">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.nomeProduto}
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
                      🛍️
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
                      {item.nomeProduto}
                    </p>
                    {item.tamanhoLabel && item.tamanhoLabel !== "Único" && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.tamanhoLabel}</p>
                    )}
                    {item.observacao && (
                      <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">{item.observacao}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantidade - 1)}
                          className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:border-primary/40 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-bold text-foreground w-4 text-center">
                          {item.quantidade}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantidade + 1)}
                          className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:border-primary/40 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">
                          R$ {item.totalItem.toFixed(2)}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-border space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>R$ {DELIVERY_FEE.toFixed(2)}</span>
                </div>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-foreground">
                <span>Total</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-semibold"
                onClick={() => { closeCart(); navigate("/checkout"); }}
              >
                Finalizar Pedido
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

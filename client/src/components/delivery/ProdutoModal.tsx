import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useDeliveryCart } from "@/contexts/DeliveryCartContext";
import { toast } from "sonner";
import type { ProdutoRow } from "./ProdutoCard";
import { getSizes, getPrices } from "./ProdutoCard";

export const SIZE_CONFIG: Record<string, { label: string; desc: string }> = {
  BROTINHO: { label: "Brotinho",  desc: "Pequena individual" },
  PEQUENA:  { label: "Pequena",   desc: "2–3 fatias" },
  MEDIA:    { label: "Média",     desc: "4–6 fatias" },
  GRANDE:   { label: "Grande",    desc: "6–8 fatias" },
  TREM:     { label: "Trem",      desc: "8–10 fatias" },
  BITREM:   { label: "Bitrem",    desc: "10–12 fatias" },
  UNICO:    { label: "Único",     desc: "Tamanho padrão" },
};

// Tamanhos que permitem meio a meio
const HALF_HALF_SIZES = ["MEDIA", "GRANDE", "TREM", "BITREM"];

interface Props {
  produto: ProdutoRow;
  allProdutos: ProdutoRow[];
  open: boolean;
  onClose: () => void;
}

export default function ProdutoModal({ produto, allProdutos, open, onClose }: Props) {
  const sizes = getSizes(produto);
  const prices = getPrices(produto);
  const { addItem } = useDeliveryCart();

  const [selectedSize, setSelectedSize] = useState<string>(sizes[0] ?? "UNICO");
  const [quantidade, setQuantidade] = useState(1);
  const [halfHalf, setHalfHalf] = useState(false);
  const [metade2, setMetade2] = useState<ProdutoRow | null>(null);
  const [observacao, setObservacao] = useState("");
  const [halfSearch, setHalfSearch] = useState("");

  const canHalfHalf = HALF_HALF_SIZES.includes(selectedSize);
  const basePrice = prices[selectedSize] ?? 0;

  // Meio a meio: preço = média dos dois sabores
  function getMetade2Price(p: ProdutoRow): number {
    const p2prices = getPrices(p);
    return p2prices[selectedSize] ?? 0;
  }
  const halfPrice = metade2 ? (basePrice + getMetade2Price(metade2)) / 2 : basePrice;
  const precoUnitario = halfHalf && metade2 ? halfPrice : basePrice;
  const total = precoUnitario * quantidade;

  const otherProdutos = allProdutos.filter(
    p => p.GUIDPRODUTO !== produto.GUIDPRODUTO && getSizes(p).includes(selectedSize)
  );
  const filteredOthers = halfSearch
    ? otherProdutos.filter(p => p.PRODUTO.toLowerCase().includes(halfSearch.toLowerCase()))
    : otherProdutos;

  function handleAdd() {
    if (halfHalf && !metade2) {
      toast.error("Selecione o segundo sabor para meio a meio.");
      return;
    }
    const sizeLabel = SIZE_CONFIG[selectedSize]?.label ?? selectedSize;
    addItem({
      guidProduto: produto.GUIDPRODUTO,
      nomeProduto: halfHalf && metade2
        ? `${produto.PRODUTO} / ${metade2.PRODUTO}`
        : produto.PRODUTO,
      imageUrl: produto.IMAGEURL ?? undefined,
      tamanho: selectedSize,
      tamanhoLabel: sizeLabel,
      quantidade,
      precoUnitario,
      observacao: observacao || undefined,
      metade2Guid: halfHalf && metade2 ? metade2.GUIDPRODUTO : undefined,
      metade2Nome: halfHalf && metade2 ? metade2.PRODUTO : undefined,
    });
    toast.success("Adicionado ao carrinho!", {
      description: `${halfHalf && metade2 ? `${produto.PRODUTO} / ${metade2.PRODUTO}` : produto.PRODUTO} (${sizeLabel}) x${quantidade}`,
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{produto.PRODUTO}</DialogTitle>
          {produto.DESCRICAO && (
            <p className="text-sm text-muted-foreground">{produto.DESCRICAO}</p>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Seleção de tamanho */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Tamanho</p>
            <div className="grid grid-cols-2 gap-2">
              {sizes.map(size => {
                const cfg = SIZE_CONFIG[size];
                const price = prices[size] ?? 0;
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    onClick={() => { setSelectedSize(size); setHalfHalf(false); setMetade2(null); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <p className={`font-semibold text-sm ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                      {cfg?.label ?? size}
                    </p>
                    {cfg?.desc && (
                      <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                    )}
                    <p className={`text-sm font-bold mt-1 ${isSelected ? "text-primary" : "text-foreground"}`}>
                      R$ {price.toFixed(2)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meio a meio */}
          {canHalfHalf && otherProdutos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => { setHalfHalf(!halfHalf); setMetade2(null); }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${halfHalf ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${halfHalf ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <p className="text-sm font-semibold text-foreground">Meio a meio</p>
              </div>
              {halfHalf && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    1ª metade: <strong>{produto.PRODUTO}</strong>
                  </p>
                  <input
                    type="text"
                    placeholder="Buscar 2ª metade..."
                    value={halfSearch}
                    onChange={e => setHalfSearch(e.target.value)}
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredOthers.map(p => (
                      <button
                        key={p.GUIDPRODUTO}
                        onClick={() => setMetade2(p)}
                        className={`w-full p-2 rounded-lg border text-left text-sm transition-all ${
                          metade2?.GUIDPRODUTO === p.GUIDPRODUTO
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border hover:border-primary/40 text-muted-foreground"
                        }`}
                      >
                        {p.PRODUTO}
                        <span className="ml-2 text-xs">
                          R$ {(getPrices(p)[selectedSize] ?? 0).toFixed(2)}
                        </span>
                      </button>
                    ))}
                    {filteredOthers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Nenhum produto encontrado</p>
                    )}
                  </div>
                  {metade2 && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                      <Badge variant="outline" className="text-xs">½ + ½</Badge>
                      <span className="text-xs text-foreground">
                        {produto.PRODUTO} + {metade2.PRODUTO}
                      </span>
                      <span className="text-xs text-primary font-bold ml-auto">
                        R$ {halfPrice.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Observação */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Observação (opcional)</p>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: sem cebola, bem passado..."
              rows={2}
              maxLength={300}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Quantidade e total */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:border-primary/40 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-bold text-lg text-foreground w-6 text-center">{quantidade}</span>
              <button
                onClick={() => setQuantidade(q => q + 1)}
                className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:border-primary/40 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <Button
              onClick={handleAdd}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar · R$ {total.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

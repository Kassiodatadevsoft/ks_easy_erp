import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeliveryCart } from "@/contexts/DeliveryCartContext";
import { ShoppingCart, Settings2, Star, Tag } from "lucide-react";
import { toast } from "sonner";
import ProdutoModal, { SIZE_CONFIG } from "./ProdutoModal";

export interface ProdutoRow {
  CODPRODUTO: number;
  GUIDPRODUTO: string;
  PRODUTO: string;
  DESCRICAO?: string | null;
  CODCATEGORIA?: number;
  CATEGORIA?: string;
  PRECOS?: string | null;
  TAMANHOSDISP?: string | null;
  PRECO?: number | null;
  PRECOVENDA?: number | null;
  IMAGEURL?: string | null;
  DESTAQUE?: boolean | number;
  ORDEMEXIBICAO?: number;
  PERCDESCONTO?: number | null;
  PRECOPROMO?: number | null;
  DTINICIOPROMO?: string | null;
  DTFIMPROMO?: string | null;
  BALANCA?: boolean | number;
  FRACIONADO?: boolean | number;
}

interface Props {
  produto: ProdutoRow;
  allProdutos?: ProdutoRow[];
}

function isPromoAtiva(produto: ProdutoRow): boolean {
  if (!produto.PRECOPROMO || !produto.PERCDESCONTO) return false;
  const now = Date.now();
  if (produto.DTINICIOPROMO && new Date(produto.DTINICIOPROMO).getTime() > now) return false;
  if (produto.DTFIMPROMO && new Date(produto.DTFIMPROMO).getTime() < now) return false;
  return true;
}

function getPrecoExibicao(produto: ProdutoRow): { preco: number; precoOriginal?: number; promoAtiva: boolean } {
  const promoAtiva = isPromoAtiva(produto);
  const precoBase = produto.PRECOVENDA ?? produto.PRECO ?? 0;
  if (promoAtiva && produto.PRECOPROMO) {
    return { preco: produto.PRECOPROMO, precoOriginal: precoBase, promoAtiva: true };
  }
  return { preco: precoBase, promoAtiva: false };
}

function getPrecoMinimo(produto: ProdutoRow): { preco: number; precoOriginal?: number; promoAtiva: boolean } {
  const sizes = getSizes(produto);
  const prices = getPrices(produto);
  if (sizes.length <= 1) return getPrecoExibicao(produto);
  const vals = sizes.map(s => prices[s] ?? 0).filter(v => v > 0);
  if (vals.length === 0) return getPrecoExibicao(produto);
  const min = Math.min(...vals);
  return { preco: min, promoAtiva: false };
}

/**
 * Suporta dois formatos de PRECOS:
 *  - Novo: array [{nome, preco, qtd}] — vem do novo cadastro de produtos
 *  - Legado: objeto {tamanho: preco} — formato antigo da pizzaria
 */
export function getSizes(produto: ProdutoRow): string[] {
  try {
    if (produto.PRECOS) {
      const parsed = JSON.parse(produto.PRECOS);
      // Novo formato: array de objetos
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
        return parsed.map((t: { nome: string }) => t.nome).filter(Boolean);
      }
    }
    // Legado: TAMANHOSDISP
    if (produto.TAMANHOSDISP) {
      const parsed = JSON.parse(produto.TAMANHOSDISP);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return ["UNICO"];
}

export function getPrices(produto: ProdutoRow): Record<string, number> {
  try {
    if (produto.PRECOS) {
      const parsed = JSON.parse(produto.PRECOS);
      // Novo formato: array [{nome, preco, qtd}]
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
        const map: Record<string, number> = {};
        for (const t of parsed as { nome: string; preco: number }[]) {
          if (t.nome) map[t.nome] = Number(t.preco) || 0;
        }
        return map;
      }
      // Legado: {tamanho: preco} ou {unico: preco}
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, number>;
      }
    }
  } catch { /* ignore */ }
  const preco = produto.PRECOVENDA ?? produto.PRECO ?? 0;
  return { UNICO: preco };
}

export default function ProdutoCard({ produto, allProdutos = [] }: Props) {
  const sizes = getSizes(produto);
  const prices = getPrices(produto);
  const { addItem } = useDeliveryCart();
  const [modalOpen, setModalOpen] = useState(false);
  const isMultiSize = sizes.length > 1;
  const isSinglePrice = sizes.length === 1;
  const { preco, precoOriginal, promoAtiva } = getPrecoMinimo(produto);
  const firstSize = sizes[0] ?? "UNICO";
  const firstPrice = prices[firstSize] ?? preco;
  const imageUrl = produto.IMAGEURL;
  const isDestaque = Boolean(produto.DESTAQUE);

  function handleDirectAdd() {
    const sizeLabel = SIZE_CONFIG[firstSize]?.label ?? firstSize;
    addItem({
      guidProduto: produto.GUIDPRODUTO,
      nomeProduto: produto.PRODUTO,
      imageUrl: imageUrl ?? undefined,
      tamanho: firstSize,
      tamanhoLabel: sizeLabel,
      quantidade: 1,
      precoUnitario: firstPrice,
    });
    toast.success(`${produto.PRODUTO} adicionado!`, {
      description: `${sizeLabel} — R$ ${firstPrice.toFixed(2)}`,
    });
  }

  return (
    <>
      <div className="group relative bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 flex flex-col">
        {/* Image */}
        <div className="relative aspect-[4/3] bg-secondary overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={produto.PRODUTO}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl select-none">
              🛍️
            </div>
          )}
          {isDestaque && (
            <div className="absolute top-2 left-2">
              <Badge className="bg-amber-500/90 text-white border-0 text-xs gap-1">
                <Star className="w-3 h-3 fill-white" /> Destaque
              </Badge>
            </div>
          )}
          {promoAtiva && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-green-600/90 text-white border-0 text-xs gap-1">
                <Tag className="w-3 h-3" /> Promoção
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col flex-1 gap-2">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">
              {produto.PRODUTO}
            </h3>
            {produto.DESCRICAO && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{produto.DESCRICAO}</p>
            )}
          </div>

          <div className="flex items-end justify-between gap-2 mt-auto">
            <div>
              {isMultiSize && (
                <p className="text-xs text-muted-foreground mb-0.5">A partir de</p>
              )}
              <div className="flex items-baseline gap-1.5">
                {promoAtiva && precoOriginal && (
                  <span className="text-xs text-muted-foreground line-through">
                    R$ {precoOriginal.toFixed(2)}
                  </span>
                )}
                <span className={`font-bold text-base ${promoAtiva ? "text-green-500" : "text-foreground"}`}>
                  R$ {preco.toFixed(2)}
                </span>
              </div>
            </div>

            {isSinglePrice ? (
              <Button
                size="sm"
                onClick={handleDirectAdd}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 shrink-0"
              >
                <ShoppingCart className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setModalOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 shrink-0"
              >
                <Settings2 className="w-4 h-4 mr-1" />
                Escolher
              </Button>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <ProdutoModal
          produto={produto}
          allProdutos={allProdutos}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

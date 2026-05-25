import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingBag } from "lucide-react";
import ProdutoCard from "@/components/delivery/ProdutoCard";
import { useDeliveryCart } from "@/contexts/DeliveryCartContext";
import { useKsAuth } from "@/hooks/useKsAuth";

export default function Cardapio() {
  const { user } = useKsAuth();
  const guidentidade = user?.guidEntidade ?? "";
  const { totalItems, openCart } = useDeliveryCart();
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [busca, setBusca] = useState("");

  const { data: categoriasRaw, isLoading: loadingCats } = trpc.delivery.categorias.useQuery(
    { guidentidade },
    { enabled: !!guidentidade }
  );
  const categorias = categoriasRaw as Array<{ CODCATEGORIA: number; CATEGORIA: string; DESCRICAO?: string; SLUG?: string; ORDEMEXIBICAO?: number }> | undefined;

  const { data: produtosRaw, isLoading: loadingProdutos } = trpc.delivery.produtos.useQuery(
    { guidentidade },
    { enabled: !!guidentidade }
  );
  const produtos = produtosRaw as import("@/components/delivery/ProdutoCard").ProdutoRow[] | undefined;

  const filtered = useMemo(() => {
    if (!produtos) return [];
    let list = produtos;
    if (activeCat !== null) list = list.filter(p => p.CODCATEGORIA === activeCat);
    if (busca.trim()) {
      const q = busca.toLowerCase();
      list = list.filter(p =>
        p.PRODUTO.toLowerCase().includes(q) ||
        (p.DESCRICAO ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [produtos, activeCat, busca]);

  const isLoading = loadingCats || loadingProdutos;

  return (
    <div className="min-h-screen bg-background">
      {/* Header fixo */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="container max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar produto..."
                className="pl-9 bg-input"
              />
            </div>
            <Button
              variant="outline"
              className="relative shrink-0"
              onClick={openCart}
            >
              <ShoppingBag className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Button>
          </div>

          {/* Filtros de categoria */}
          {!loadingCats && categorias && categorias.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setActiveCat(null)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCat === null
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {categorias.map(cat => (
                <button
                  key={cat.CODCATEGORIA}
                  onClick={() => setActiveCat(activeCat === cat.CODCATEGORIA ? null : cat.CODCATEGORIA)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeCat === cat.CODCATEGORIA
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat.CATEGORIA}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="container max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-72 rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <span className="text-5xl block mb-4">🔍</span>
            <p className="font-semibold text-foreground mb-1">Nenhum produto encontrado</p>
            <p className="text-sm">Tente outra categoria ou termo de busca.</p>
          </div>
        ) : activeCat === null && !busca ? (
          // Agrupado por categoria
          <>
            {categorias?.map(cat => {
              const catProdutos = filtered.filter(p => p.CODCATEGORIA === cat.CODCATEGORIA);
              if (catProdutos.length === 0) return null;
              return (
                <div key={cat.CODCATEGORIA} className="mb-12">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-foreground">{cat.CATEGORIA}</h2>
                    <div className="flex-1 h-px bg-border" />
                    <Badge variant="secondary" className="text-xs">{catProdutos.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {catProdutos.map(p => (
                      <ProdutoCard key={p.GUIDPRODUTO} produto={p} allProdutos={catProdutos} />
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Produtos sem categoria */}
            {(() => {
              const semCat = filtered.filter(p => !p.CODCATEGORIA || !categorias?.find(c => c.CODCATEGORIA === p.CODCATEGORIA));
              if (semCat.length === 0) return null;
              return (
                <div className="mb-12">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-foreground">Outros</h2>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {semCat.map(p => (
                      <ProdutoCard key={p.GUIDPRODUTO} produto={p} allProdutos={semCat} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          // Grid flat (filtrado)
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map(p => (
              <ProdutoCard key={p.GUIDPRODUTO} produto={p} allProdutos={filtered} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

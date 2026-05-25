import React, { createContext, useContext, useState, useCallback } from "react";

export interface CartItem {
  id: string;           // guidProduto + tamanho
  guidProduto: string;
  nomeProduto: string;
  imageUrl?: string;
  // Meio a meio (produtos com tamanhos tipo pizza)
  metade2Guid?: string;
  metade2Nome?: string;
  tamanho: string;      // BROTINHO | PEQUENA | MEDIA | GRANDE | TREM | BITREM | UNICO | ""
  tamanhoLabel: string;
  quantidade: number;
  precoUnitario: number;
  totalItem: number;
  observacao?: string;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "id" | "totalItem">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantidade: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function makeItemId(item: Omit<CartItem, "id" | "totalItem">): string {
  const parts = [item.guidProduto, item.tamanho];
  if (item.metade2Guid) parts.push(item.metade2Guid);
  return parts.join("|");
}

export function DeliveryCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((item: Omit<CartItem, "id" | "totalItem">) => {
    const id = makeItemId(item);
    setItems((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (existing) {
        const newQty = existing.quantidade + item.quantidade;
        return prev.map((i) =>
          i.id === id ? { ...i, quantidade: newQty, totalItem: newQty * i.precoUnitario } : i
        );
      }
      return [...prev, { ...item, id, totalItem: item.quantidade * item.precoUnitario }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantidade: number) => {
    if (quantidade <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    setItems((prev) =>
      prev.map((i) => i.id === id ? { ...i, quantidade, totalItem: quantidade * i.precoUnitario } : i)
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantidade, 0);
  const subtotal = items.reduce((sum, i) => sum + i.totalItem, 0);

  return (
    <CartContext.Provider
      value={{ items, totalItems, subtotal, addItem, removeItem, updateQuantity, clearCart, isOpen, openCart, closeCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useDeliveryCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useDeliveryCart must be used within DeliveryCartProvider");
  return ctx;
}

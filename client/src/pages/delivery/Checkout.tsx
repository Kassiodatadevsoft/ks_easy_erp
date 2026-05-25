import { useState } from "react";
import { useDeliveryCart } from "@/contexts/DeliveryCartContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, Banknote, QrCode, Truck, Store } from "lucide-react";
import { toast } from "sonner";
import { useKsAuth } from "@/hooks/useKsAuth";

type PaymentMethod = "DINHEIRO" | "CARTAO_CREDITO" | "CARTAO_DEBITO" | "PIX";
type TipoEntrega = "ENTREGA" | "RETIRADA";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "PIX",           label: "PIX",            icon: <QrCode className="w-5 h-5" />,    desc: "Aprovação instantânea" },
  { value: "CARTAO_CREDITO",label: "Cartão Crédito", icon: <CreditCard className="w-5 h-5" />, desc: "Parcelamento disponível" },
  { value: "CARTAO_DEBITO", label: "Cartão Débito",  icon: <CreditCard className="w-5 h-5" />, desc: "Débito na hora" },
  { value: "DINHEIRO",      label: "Dinheiro",        icon: <Banknote className="w-5 h-5" />,  desc: "Troco na entrega" },
];

const DELIVERY_FEE = 5;

export default function CheckoutDelivery() {
  const { items, subtotal, clearCart } = useDeliveryCart();
  const [, navigate] = useLocation();
  const { user } = useKsAuth();
  const guidentidade = user?.guidEntidade ?? "";

  const [form, setForm] = useState({
    nomeCliente: user?.nome ?? "",
    telefone: "",
    email: "",
    tipoEntrega: "ENTREGA" as TipoEntrega,
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
    formaPagamento: "PIX" as PaymentMethod,
    trocoPara: "",
    observacao: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const total = subtotal + (form.tipoEntrega === "ENTREGA" ? DELIVERY_FEE : 0);

  const criarPedido = trpc.delivery.criarPedido.useMutation({
    onSuccess: (data) => {
      clearCart();
      navigate(`/pedido/${data.token}`);
    },
    onError: (err) => {
      toast.error("Erro ao finalizar pedido", { description: err.message });
    },
  });

  const set = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nomeCliente.trim()) e.nomeCliente = "Nome é obrigatório";
    if (!form.telefone.trim()) e.telefone = "Telefone é obrigatório";
    else if (!/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(form.telefone.replace(/\s/g, "")))
      e.telefone = "Telefone inválido";
    if (form.tipoEntrega === "ENTREGA") {
      if (!form.logradouro.trim()) e.logradouro = "Rua é obrigatória";
      if (!form.numero.trim()) e.numero = "Número é obrigatório";
      if (!form.bairro.trim()) e.bairro = "Bairro é obrigatório";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.error("Carrinho vazio!"); return; }
    if (!validate()) return;
    criarPedido.mutate({
      guidentidade,
      nomeCliente: form.nomeCliente,
      telefone: form.telefone || undefined,
      email: form.email || undefined,
      tipoEntrega: form.tipoEntrega,
      logradouro: form.logradouro || undefined,
      numero: form.numero || undefined,
      complemento: form.complemento || undefined,
      bairro: form.bairro || undefined,
      cidade: form.cidade || undefined,
      uf: form.uf || undefined,
      cep: form.cep || undefined,
      subtotal,
      taxaEntrega: form.tipoEntrega === "ENTREGA" ? DELIVERY_FEE : 0,
      total,
      formaPagamento: form.formaPagamento,
      trocoPara: form.trocoPara ? parseFloat(form.trocoPara) : undefined,
      observacao: form.observacao || undefined,
      itens: items.map(item => ({
        guidProduto: item.guidProduto,
        nomeProduto: item.nomeProduto,
        tamanho: item.tamanho || undefined,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        observacao: item.observacao,
        metade1Guid: item.guidProduto,
        metade1Nome: item.nomeProduto,
        metade2Guid: item.metade2Guid,
        metade2Nome: item.metade2Nome,
      })),
    });
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <span className="text-6xl block mb-4">🛒</span>
          <h2 className="text-2xl font-bold text-foreground mb-2">Carrinho vazio</h2>
          <p className="text-muted-foreground mb-6">Adicione produtos antes de finalizar o pedido.</p>
          <Button onClick={() => navigate("/cardapio")} className="bg-primary text-primary-foreground">
            Ver Cardápio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-6 pb-16 bg-background">
      <div className="container max-w-5xl mx-auto px-4">
        <button
          onClick={() => navigate("/cardapio")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao cardápio
        </button>
        <h1 className="text-2xl font-bold text-foreground mb-6">Finalizar Pedido</h1>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ── Formulário ─────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-5">

              {/* Tipo de entrega */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-semibold text-foreground mb-3">Como deseja receber?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "ENTREGA", label: "Entrega", icon: <Truck className="w-5 h-5" />, desc: "Receba em casa" },
                    { value: "RETIRADA", label: "Retirada", icon: <Store className="w-5 h-5" />, desc: "Buscar no local" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("tipoEntrega", opt.value)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        form.tipoEntrega === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className={`mb-1 ${form.tipoEntrega === opt.value ? "text-primary" : "text-muted-foreground"}`}>
                        {opt.icon}
                      </div>
                      <p className={`font-semibold text-sm ${form.tipoEntrega === opt.value ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dados do cliente */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-semibold text-foreground mb-4">Seus Dados</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label htmlFor="nomeCliente" className="text-sm mb-1.5 block">Nome completo *</Label>
                    <Input
                      id="nomeCliente"
                      value={form.nomeCliente}
                      onChange={e => set("nomeCliente", e.target.value)}
                      placeholder="Seu nome"
                      className={errors.nomeCliente ? "border-destructive" : ""}
                    />
                    {errors.nomeCliente && <p className="text-destructive text-xs mt-1">{errors.nomeCliente}</p>}
                  </div>
                  <div>
                    <Label htmlFor="telefone" className="text-sm mb-1.5 block">Telefone / Celular *</Label>
                    <Input
                      id="telefone"
                      value={form.telefone}
                      onChange={e => set("telefone", e.target.value)}
                      placeholder="(11) 99999-9999"
                      className={errors.telefone ? "border-destructive" : ""}
                    />
                    {errors.telefone && <p className="text-destructive text-xs mt-1">{errors.telefone}</p>}
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm mb-1.5 block">E-mail (opcional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={e => set("email", e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>
              </div>

              {/* Endereço (só para entrega) */}
              {form.tipoEntrega === "ENTREGA" && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h2 className="font-semibold text-foreground mb-4">Endereço de Entrega</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Label htmlFor="logradouro" className="text-sm mb-1.5 block">Rua / Avenida *</Label>
                      <Input
                        id="logradouro"
                        value={form.logradouro}
                        onChange={e => set("logradouro", e.target.value)}
                        placeholder="Nome da rua"
                        className={errors.logradouro ? "border-destructive" : ""}
                      />
                      {errors.logradouro && <p className="text-destructive text-xs mt-1">{errors.logradouro}</p>}
                    </div>
                    <div>
                      <Label htmlFor="numero" className="text-sm mb-1.5 block">Número *</Label>
                      <Input
                        id="numero"
                        value={form.numero}
                        onChange={e => set("numero", e.target.value)}
                        placeholder="123"
                        className={errors.numero ? "border-destructive" : ""}
                      />
                      {errors.numero && <p className="text-destructive text-xs mt-1">{errors.numero}</p>}
                    </div>
                    <div>
                      <Label htmlFor="complemento" className="text-sm mb-1.5 block">Complemento</Label>
                      <Input
                        id="complemento"
                        value={form.complemento}
                        onChange={e => set("complemento", e.target.value)}
                        placeholder="Apto, bloco..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="bairro" className="text-sm mb-1.5 block">Bairro *</Label>
                      <Input
                        id="bairro"
                        value={form.bairro}
                        onChange={e => set("bairro", e.target.value)}
                        placeholder="Seu bairro"
                        className={errors.bairro ? "border-destructive" : ""}
                      />
                      {errors.bairro && <p className="text-destructive text-xs mt-1">{errors.bairro}</p>}
                    </div>
                    <div>
                      <Label htmlFor="cidade" className="text-sm mb-1.5 block">Cidade</Label>
                      <Input
                        id="cidade"
                        value={form.cidade}
                        onChange={e => set("cidade", e.target.value)}
                        placeholder="Sua cidade"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cep" className="text-sm mb-1.5 block">CEP</Label>
                      <Input
                        id="cep"
                        value={form.cep}
                        onChange={e => set("cep", e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="00000-000"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pagamento */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-semibold text-foreground mb-4">Forma de Pagamento</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PAYMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("formaPagamento", opt.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.formaPagamento === opt.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className={`mb-1.5 ${form.formaPagamento === opt.value ? "text-primary" : "text-muted-foreground"}`}>
                        {opt.icon}
                      </div>
                      <p className={`font-semibold text-xs ${form.formaPagamento === opt.value ? "text-foreground" : "text-muted-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground hidden sm:block">{opt.desc}</p>
                    </button>
                  ))}
                </div>
                {form.formaPagamento === "DINHEIRO" && (
                  <div className="mt-4">
                    <Label htmlFor="trocoPara" className="text-sm mb-1.5 block">Troco para quanto?</Label>
                    <Input
                      id="trocoPara"
                      type="number"
                      min={total}
                      step="0.01"
                      value={form.trocoPara}
                      onChange={e => set("trocoPara", e.target.value)}
                      placeholder={`Mínimo R$ ${total.toFixed(2)}`}
                      className="max-w-xs"
                    />
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="bg-card rounded-2xl border border-border p-5">
                <h2 className="font-semibold text-foreground mb-3">Observações</h2>
                <textarea
                  value={form.observacao}
                  onChange={e => set("observacao", e.target.value)}
                  placeholder="Alguma observação sobre o pedido? (opcional)"
                  rows={3}
                  maxLength={500}
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            </div>

            {/* ── Resumo ─────────────────────────────────────────────── */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-2xl border border-border p-5 sticky top-6">
                <h2 className="font-semibold text-foreground mb-4">Resumo do Pedido</h2>
                <div className="space-y-2.5 mb-4">
                  {items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground leading-tight line-clamp-2">
                          {item.quantidade}x {item.nomeProduto}
                        </p>
                        {item.tamanhoLabel && item.tamanhoLabel !== "Único" && (
                          <p className="text-muted-foreground text-xs">{item.tamanhoLabel}</p>
                        )}
                      </div>
                      <span className="text-foreground font-medium shrink-0">
                        R$ {item.totalItem.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxa de entrega</span>
                    <span>{form.tipoEntrega === "ENTREGA" ? `R$ ${DELIVERY_FEE.toFixed(2)}` : "Grátis"}</span>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="flex justify-between font-bold text-foreground mb-4">
                  <span>Total</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                <Button
                  type="submit"
                  disabled={criarPedido.isPending}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-semibold"
                >
                  {criarPedido.isPending ? "Enviando..." : "Confirmar Pedido"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Search, Trash2, ArrowUpCircle, ArrowDownCircle, Settings2,
  ChevronLeft, ChevronRight, RefreshCw
} from "lucide-react";

type Mov = {
  guidMovimento: string;
  dtMovimento: string;
  TIPO: string;
  guidProduto: string;
  NOMEPRODUTO: string;
  QUANTIDADE: number;
  VALORUNITARIO: number;
  VALORTOTAL: number;
  guidFornecedor: string | null;
  NOMEFORNECEDOR: string | null;
  NUMERODOC: string | null;
  MOTIVO: string | null;
  OBSERVACAO: string | null;
};

type Produto = { guidProduto: string; PRODUTO: string; CODBARRAS: string; UNIDADE: string; ESTOQUE: number; PRECOVENDA: number };

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}
function fmtQtd(v: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(v ?? 0);
}
function fmtData(s: string) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const tipoLabel: Record<string, string> = { E: "Entrada", S: "Saída", A: "Ajuste" };
const tipoCor: Record<string, string> = {
  E: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  S: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  A: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export default function MovimentacoesEstoque() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [tipo, setTipo] = useState("");
  const [dtInicio, setDtInicio] = useState(primeiroDia);
  const [dtFim, setDtFim] = useState(ultimoDia);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [open, setOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null);
  const [form, setForm] = useState({
    dtMovimento: hoje.toISOString().slice(0, 10),
    tipo: "E" as "E" | "S" | "A",
    quantidade: 1,
    valorUnitario: 0,
    numerodoc: "",
    motivo: "",
    observacao: "",
  });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.movimentacoesEstoque.listar.useQuery({
    tipo: tipo || undefined,
    dtInicio: dtInicio || undefined,
    dtFim: dtFim || undefined,
    busca: busca || undefined,
    page, pageSize,
  });
  const { data: totais } = trpc.movimentacoesEstoque.totais.useQuery({
    dtInicio: dtInicio || undefined,
    dtFim: dtFim || undefined,
  });
  const { data: produtos } = trpc.produtos.buscar.useQuery(
    { q: buscaProduto },
    { enabled: buscaProduto.length >= 2 }
  );

  const criar = trpc.movimentacoesEstoque.criar.useMutation({
    onSuccess: () => {
      utils.movimentacoesEstoque.listar.invalidate();
      utils.movimentacoesEstoque.totais.invalidate();
      utils.produtos.resumoEstoque.invalidate();
      utils.produtos.listar.invalidate();
      setOpen(false);
      toast.success("Movimentação registrada!");
    },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.movimentacoesEstoque.excluir.useMutation({
    onSuccess: () => {
      utils.movimentacoesEstoque.listar.invalidate();
      utils.movimentacoesEstoque.totais.invalidate();
      utils.produtos.resumoEstoque.invalidate();
      utils.produtos.listar.invalidate();
      toast.success("Movimentação excluída e estoque revertido!");
    },
    onError: (e) => toast.error(e.message),
  });

  const abrirNovo = useCallback(() => {
    setProdutoSelecionado(null);
    setBuscaProduto("");
    setForm({
      dtMovimento: new Date().toISOString().slice(0, 10),
      tipo: "E", quantidade: 1, valorUnitario: 0,
      numerodoc: "", motivo: "", observacao: "",
    });
    setOpen(true);
  }, []);

  const salvar = () => {
    if (!produtoSelecionado) { toast.error("Selecione um produto"); return; }
    if (form.quantidade <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }
    criar.mutate({
      dtMovimento: form.dtMovimento,
      tipo: form.tipo,
      guidProduto: produtoSelecionado.guidProduto,
      nomeProduto: produtoSelecionado.PRODUTO,
      quantidade: form.quantidade,
      valorUnitario: form.valorUnitario,
      numerodoc: form.numerodoc || undefined,
      motivo: form.motivo || undefined,
      observacao: form.observacao || undefined,
    });
  };

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Movimentações de Estoque</h1>
          <p className="text-muted-foreground text-sm mt-1">Entradas, saídas e ajustes de estoque</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" /> Nova Movimentação
        </Button>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Entradas", value: fmt(totais?.entradas ?? 0), icon: ArrowUpCircle, color: "text-emerald-500" },
          { label: "Saídas",   value: fmt(totais?.saidas ?? 0),   icon: ArrowDownCircle, color: "text-red-500" },
          { label: "Ajustes",  value: fmt(totais?.ajustes ?? 0),  icon: Settings2, color: "text-blue-500" },
          { label: "Saldo",    value: fmt(totais?.saldo ?? 0),    icon: ArrowUpCircle, color: (totais?.saldo ?? 0) >= 0 ? "text-emerald-500" : "text-red-500" },
        ].map(t => (
          <Card key={t.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <t.icon className={`h-6 w-6 ${t.color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{t.label}</p>
                <p className="font-bold">{t.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto, doc, motivo..."
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={tipo || "TODOS"} onValueChange={v => { setTipo(v === "TODOS" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos tipos</SelectItem>
                <SelectItem value="E">Entradas</SelectItem>
                <SelectItem value="S">Saídas</SelectItem>
                <SelectItem value="A">Ajustes</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dtInicio} onChange={e => { setDtInicio(e.target.value); setPage(1); }} className="w-[150px]" />
            <Input type="date" value={dtFim} onChange={e => { setDtFim(e.target.value); setPage(1); }} className="w-[150px]" />
            <Button variant="outline" size="icon" onClick={() => utils.movimentacoesEstoque.listar.invalidate()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : !data?.items.length ? (
            <div className="p-12 text-center">
              <ArrowUpCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground">Nenhuma movimentação no período</p>
              <Button className="mt-4" onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Registrar movimentação</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-right px-4 py-3 font-medium">Qtd.</th>
                    <th className="text-right px-4 py-3 font-medium">Vl. Unit.</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-left px-4 py-3 font-medium">Doc / Motivo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(data.items as Mov[]).map(m => (
                    <tr key={m.guidMovimento} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">{fmtData(m.dtMovimento)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoCor[m.TIPO]}`}>
                          {tipoLabel[m.TIPO]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{m.NOMEPRODUTO}</td>
                      <td className="px-4 py-3 text-right">{fmtQtd(m.QUANTIDADE)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{fmt(m.VALORUNITARIO)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(m.VALORTOTAL)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {m.NUMERODOC && <div>Doc: {m.NUMERODOC}</div>}
                        {m.MOTIVO && <div>{m.MOTIVO}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Excluir movimentação e reverter estoque?")) excluir.mutate({ guidMovimento: m.guidMovimento }); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total ?? 0} movimentação(ões)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Pág. {page} de {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal Nova Movimentação */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Movimentação de Estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v as "E" | "S" | "A" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="E">Entrada</SelectItem>
                    <SelectItem value="S">Saída</SelectItem>
                    <SelectItem value="A">Ajuste de Estoque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.dtMovimento} onChange={e => setForm(p => ({ ...p, dtMovimento: e.target.value }))} />
              </div>
            </div>

            {/* Busca de produto */}
            <div>
              <Label>Produto *</Label>
              {produtoSelecionado ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{produtoSelecionado.PRODUTO}</p>
                    <p className="text-xs text-muted-foreground">Estoque atual: {fmtQtd(produtoSelecionado.ESTOQUE)} {produtoSelecionado.UNIDADE}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setProdutoSelecionado(null); setBuscaProduto(""); }}>
                    Trocar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar produto por nome ou código de barras..."
                      value={buscaProduto}
                      onChange={e => setBuscaProduto(e.target.value.toUpperCase())}
                      className="pl-9"
                    />
                  </div>
                  {produtos && produtos.length > 0 && (
                    <div className="border rounded-md max-h-40 overflow-y-auto">
                      {produtos.map(p => (
                        <button
                          key={p.guidProduto}
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm border-b last:border-0"
                          onClick={() => {
                            setProdutoSelecionado(p);
                            setForm(prev => ({ ...prev, valorUnitario: p.PRECOVENDA }));
                          }}
                        >
                          <span className="font-medium">{p.PRODUTO}</span>
                          {p.CODBARRAS && <span className="text-muted-foreground ml-2 text-xs">{p.CODBARRAS}</span>}
                          <span className="float-right text-muted-foreground text-xs">Estoque: {fmtQtd(p.ESTOQUE)} {p.UNIDADE}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  value={form.quantidade}
                  onChange={e => setForm(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))}
                  min={0.001} step={0.001}
                />
                {form.tipo === "A" && (
                  <p className="text-xs text-muted-foreground mt-1">Para ajuste, informe o estoque final desejado</p>
                )}
              </div>
              <div>
                <Label>Valor Unitário (R$)</Label>
                <Input
                  type="number"
                  value={form.valorUnitario}
                  onChange={e => setForm(p => ({ ...p, valorUnitario: parseFloat(e.target.value) || 0 }))}
                  min={0} step={0.01}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº Documento</Label>
                <Input
                  value={form.numerodoc}
                  onChange={e => setForm(p => ({ ...p, numerodoc: e.target.value.toUpperCase() }))}
                  placeholder="NF-001234"
                />
              </div>
              <div>
                <Label>Motivo</Label>
                <Input
                  value={form.motivo}
                  onChange={e => setForm(p => ({ ...p, motivo: e.target.value.toUpperCase() }))}
                  placeholder="COMPRA, VENDA, INVENTÁRIO..."
                />
              </div>
            </div>

            <div>
              <Label>Observação</Label>
              <Textarea
                value={form.observacao}
                onChange={e => setForm(p => ({ ...p, observacao: e.target.value.toUpperCase() }))}
                rows={2}
                placeholder="OBSERVAÇÕES ADICIONAIS..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending}>
              {criar.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

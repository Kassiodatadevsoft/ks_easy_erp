import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useKsAuth } from "@/hooks/useKsAuth";
import { cn } from "@/lib/utils";
import { AlertTriangle, Ban, Check, ChevronsUpDown, Eye, Printer, ReceiptText, RefreshCw, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { imprimirVendaFinalizada } from "./vendaImpressao";

type Venda = {
  guidVenda: string;
  dataVenda: string;
  numeroVenda: number;
  cliente: string;
  vendedor: string;
  caixa: string;
  valorBruto: number;
  desconto: number;
  valorTotal: number;
  situacao: string;
};

type VendaDetalhe = {
  venda: Venda & { observacao?: string; justificativaCancelamento?: string };
  itens: Array<{ item: number; produto: string; quantidade: number; valorUnitario: number; desconto: number; valorTotal: number; vendedor: string; comissao: number }>;
  pagamentos: Array<{ formaPagamento: string; valor: number; parcelas: number; contaFinanceira: string; situacaoFinanceiro: string }>;
  financeiro: Array<{ guidLancamento: string; descricao: string; valor: number; valorRecebido: number; situacao: string; vencimento: string }>;
  comissoes: Array<{ guidMovimento: string; vendedor: string; descricao: string; valor: number; situacao: string }>;
  historico: Array<{ guidAuditoria: string; dataHora: string; acao: string; tabela: string; guidRegistro: string; observacao: string; identificacao: string; usuarioNome: string; usuario: string }>;
};

type FiltrosVendas = {
  clientes: Array<{ guidCliente: string; nome: string; documento?: string | null }>;
  vendedores: Array<{ guidVendedor: string; nome: string; usuario?: string | null }>;
  formasPagamento: Array<{ guidFormaPagamento: string; descricao: string }>;
};

type SearchOption = {
  value: string;
  label: string;
  description?: string | null;
};

function hoje() { return new Date().toISOString().slice(0, 10); }
function primeiroDiaMes() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function moeda(v: number) { return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function dataHora(v?: string) { return v ? new Date(v).toLocaleString("pt-BR") : "-"; }
function esc(v: unknown) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function situacaoLabel(v?: string) {
  const s = String(v ?? "").toUpperCase();
  if (s === "F") return "Finalizada";
  if (s === "C") return "Cancelada";
  return v || "-";
}
function badgeVariant(v?: string) {
  const s = String(v ?? "").toUpperCase();
  return ["C", "CANCELADA", "CANCELADO"].includes(s) ? "destructive" : "secondary";
}

function SearchableFilter({
  label,
  value,
  onChange,
  options,
  allLabel,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  allLabel: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value === "todos" ? undefined : options.find((option) => option.value === value);

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
            <span className="truncate text-left">{selected?.label ?? allLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
              <CommandEmpty>Nenhum registro encontrado.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={`${allLabel} todos`}
                  onSelect={() => {
                    onChange("todos");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === "todos" ? "opacity-100" : "opacity-0")} />
                  {allLabel}
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description ?? ""}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <p className="truncate">{option.label}</p>
                      {option.description ? <p className="truncate text-xs text-slate-500">{option.description}</p> : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.message ?? data?.mensagem ?? "Falha na solicitação.");
  return data as T;
}

function detalheRows(rows: Array<[string, unknown]>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{String(value ?? "-")}</p>
        </div>
      ))}
    </div>
  );
}

export default function VendasFinalizadas() {
  const { user, nomeEmpresa } = useKsAuth();
  const [dataInicial, setDataInicial] = useState(primeiroDiaMes());
  const [dataFinal, setDataFinal] = useState(hoje());
  const [guidCliente, setGuidCliente] = useState("todos");
  const [guidVendedor, setGuidVendedor] = useState("todos");
  const [guidFormaPagamento, setGuidFormaPagamento] = useState("todos");
  const [caixa, setCaixa] = useState("");
  const [numeroVenda, setNumeroVenda] = useState("");
  const [situacao, setSituacao] = useState("TODAS");
  const [filtros, setFiltros] = useState<FiltrosVendas>({ clientes: [], vendedores: [], formasPagamento: [] });
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);
  const [detalhe, setDetalhe] = useState<VendaDetalhe | null>(null);
  const [cancelarVenda, setCancelarVenda] = useState<Venda | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const resumo = useMemo(() => ({
    quantidade: vendas.length,
    bruto: vendas.reduce((s, v) => s + Number(v.valorBruto ?? 0), 0),
    desconto: vendas.reduce((s, v) => s + Number(v.desconto ?? 0), 0),
    total: vendas.reduce((s, v) => s + Number(v.valorTotal ?? 0), 0),
  }), [vendas]);

  const clienteOptions = useMemo(() => filtros.clientes.map((cliente) => ({
    value: cliente.guidCliente,
    label: cliente.nome,
    description: cliente.documento,
  })), [filtros.clientes]);

  const vendedorOptions = useMemo(() => filtros.vendedores.map((vendedor) => ({
    value: vendedor.guidVendedor,
    label: vendedor.nome,
    description: vendedor.usuario,
  })), [filtros.vendedores]);

  const formaPagamentoOptions = useMemo(() => filtros.formasPagamento.map((forma) => ({
    value: forma.guidFormaPagamento,
    label: forma.descricao,
  })), [filtros.formasPagamento]);

  async function carregarFiltros() {
    try {
      const data = await api<{ dados: FiltrosVendas }>("/api/vendas-gerencial/filtros");
      setFiltros(data.dados ?? { clientes: [], vendedores: [], formasPagamento: [] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os filtros.");
    }
  }

  async function carregar() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dataInicial, dataFinal, situacao });
      if (guidCliente !== "todos") params.set("guidCliente", guidCliente);
      if (guidVendedor !== "todos") params.set("guidVendedor", guidVendedor);
      if (caixa) params.set("caixa", caixa);
      if (guidFormaPagamento !== "todos") params.set("guidFormaPagamento", guidFormaPagamento);
      if (numeroVenda) params.set("numeroVenda", numeroVenda);
      const data = await api<{ dados: Venda[] }>(`/api/vendas-gerencial?${params}`);
      setVendas(data.dados ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as vendas.");
    } finally {
      setLoading(false);
    }
  }

  async function abrirDetalhe(venda: Venda) {
    try {
      const data = await api<{ dados: VendaDetalhe }>(`/api/vendas-gerencial/${venda.guidVenda}`);
      setDetalhe(data.dados);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os detalhes.");
    }
  }

  async function confirmarCancelamento() {
    if (!cancelarVenda) return;
    if (!justificativa.trim()) {
      toast.error("Informe a justificativa do cancelamento.");
      return;
    }
    setCancelando(true);
    try {
      const data = await api<{ message: string; resumo?: { contasReceberCanceladas: number; lancamentosFinanceirosCancelados: number; comissoesCanceladas: number } }>(`/api/vendas-gerencial/${cancelarVenda.guidVenda}/cancelar`, {
        method: "POST",
        body: JSON.stringify({ guidEntidade: user?.guidEntidade, guidUsuario: user?.guidPessoa, justificativa }),
      });
      const r = data.resumo;
      toast.success(r
        ? `${data.message ?? "Venda cancelada com sucesso."} Financeiro: ${r.contasReceberCanceladas + r.lancamentosFinanceirosCancelados}; comissões: ${r.comissoesCanceladas}.`
        : data.message ?? "Venda cancelada com sucesso.");
      setCancelarVenda(null);
      setJustificativa("");
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar a venda.");
    } finally {
      setCancelando(false);
    }
  }

  async function imprimir(venda: Venda, modelo: "a4" | "bobina") {
    try {
      await imprimirVendaFinalizada(venda.guidVenda, modelo, nomeEmpresa);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a impressão.");
    }
  }

  useEffect(() => {
    void carregarFiltros();
    void carregar();
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Vendas Finalizadas</h1>
          <p className="text-sm text-slate-500">Gerenciamento de vendas, pagamentos, impressão e cancelamento controlado.</p>
        </div>
        <Button variant="outline" onClick={carregar} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="py-3"><CardTitle className="flex items-center gap-2 text-sm"><ShoppingCart className="h-4 w-4 text-blue-600" /> Vendas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{resumo.quantidade}</p></CardContent></Card>
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Valor bruto</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{moeda(resumo.bruto)}</p></CardContent></Card>
        <Card><CardHeader className="py-3"><CardTitle className="text-sm">Descontos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{moeda(resumo.desconto)}</p></CardContent></Card>
        <Card><CardHeader className="py-3"><CardTitle className="flex items-center gap-2 text-sm"><ReceiptText className="h-4 w-4 text-emerald-600" /> Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{moeda(resumo.total)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>Data inicial</Label><Input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} /></div>
          <div className="space-y-1"><Label>Data final</Label><Input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></div>
          <SearchableFilter label="Cliente" value={guidCliente} onChange={setGuidCliente} options={clienteOptions} allLabel="Todos os clientes" placeholder="Pesquisar cliente..." />
          <SearchableFilter label="Vendedor" value={guidVendedor} onChange={setGuidVendedor} options={vendedorOptions} allLabel="Todos os vendedores" placeholder="Pesquisar vendedor..." />
          <div className="space-y-1"><Label>Caixa</Label><Input value={caixa} onChange={(e) => setCaixa(e.target.value)} /></div>
          <SearchableFilter label="Forma de pagamento" value={guidFormaPagamento} onChange={setGuidFormaPagamento} options={formaPagamentoOptions} allLabel="Todas as formas" placeholder="Pesquisar forma..." />
          <div className="space-y-1"><Label>Número da venda</Label><Input value={numeroVenda} onChange={(e) => setNumeroVenda(e.target.value)} /></div>
          <div className="space-y-1"><Label>Situação</Label><Select value={situacao} onValueChange={setSituacao}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Finalizadas</SelectItem><SelectItem value="F">F</SelectItem><SelectItem value="FINALIZADA">Finalizada</SelectItem></SelectContent></Select></div>
          <div className="flex items-end"><Button onClick={carregar} disabled={loading}><Search className="mr-2 h-4 w-4" /> Pesquisar</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead><TableHead>Caixa</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Desconto</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {vendas.length === 0 ? <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">{loading ? "Carregando..." : "Nenhuma venda encontrada."}</TableCell></TableRow> : vendas.map((venda) => (
                <TableRow key={venda.guidVenda}>
                  <TableCell>{dataHora(venda.dataVenda)}</TableCell><TableCell>{venda.numeroVenda}</TableCell><TableCell className="min-w-48">{venda.cliente}</TableCell><TableCell>{venda.vendedor}</TableCell><TableCell>{venda.caixa}</TableCell><TableCell className="text-right">{moeda(venda.valorBruto)}</TableCell><TableCell className="text-right">{moeda(venda.desconto)}</TableCell><TableCell className="text-right font-semibold">{moeda(venda.valorTotal)}</TableCell><TableCell><Badge variant={badgeVariant(venda.situacao)}>{situacaoLabel(venda.situacao)}</Badge></TableCell>
                  <TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Visualizar" onClick={() => abrirDetalhe(venda)}><Eye className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Imprimir A4" onClick={() => imprimir(venda, "a4")}><Printer className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Imprimir bobina" onClick={() => imprimir(venda, "bobina")}><ReceiptText className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Cancelar venda" className="text-red-600 hover:text-red-700" onClick={() => setCancelarVenda(venda)}><Ban className="h-4 w-4" /></Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detalhe)} onOpenChange={(open) => !open && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle>Venda {detalhe?.venda.numeroVenda}</DialogTitle><DialogDescription>Detalhes da venda, itens, pagamentos e vínculos financeiros.</DialogDescription></DialogHeader>
          {detalhe && <Tabs defaultValue="dados"><TabsList className="flex-wrap"><TabsTrigger value="dados">Dados</TabsTrigger><TabsTrigger value="itens">Itens</TabsTrigger><TabsTrigger value="pagamentos">Pagamentos</TabsTrigger><TabsTrigger value="vinculos">Vínculos</TabsTrigger><TabsTrigger value="historico">Histórico</TabsTrigger></TabsList>
            <TabsContent value="dados" className="pt-3">{detalheRows([["Cliente", detalhe.venda.cliente], ["Vendedor", detalhe.venda.vendedor], ["Caixa", detalhe.venda.caixa], ["Data/hora", dataHora(detalhe.venda.dataVenda)], ["Valor bruto", moeda(detalhe.venda.valorBruto)], ["Desconto", moeda(detalhe.venda.desconto)], ["Total", moeda(detalhe.venda.valorTotal)], ["Situação", situacaoLabel(detalhe.venda.situacao)]])}</TabsContent>
            <TabsContent value="itens" className="pt-3"><Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Unitário</TableHead><TableHead className="text-right">Desconto</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Comissão</TableHead></TableRow></TableHeader><TableBody>{detalhe.itens.map((i) => <TableRow key={`${i.item}-${i.produto}`}><TableCell>{i.produto}</TableCell><TableCell className="text-right">{Number(i.quantidade).toLocaleString("pt-BR")}</TableCell><TableCell className="text-right">{moeda(i.valorUnitario)}</TableCell><TableCell className="text-right">{moeda(i.desconto)}</TableCell><TableCell className="text-right">{moeda(i.valorTotal)}</TableCell><TableCell>{i.vendedor}</TableCell><TableCell className="text-right">{moeda(i.comissao)}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
            <TabsContent value="pagamentos" className="pt-3"><Table><TableHeader><TableRow><TableHead>Forma</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Parcelas</TableHead><TableHead>Conta financeira</TableHead><TableHead>Situação financeiro</TableHead></TableRow></TableHeader><TableBody>{detalhe.pagamentos.map((p, i) => <TableRow key={`${p.formaPagamento}-${i}`}><TableCell>{p.formaPagamento}</TableCell><TableCell className="text-right">{moeda(p.valor)}</TableCell><TableCell className="text-right">{p.parcelas}</TableCell><TableCell>{p.contaFinanceira || "-"}</TableCell><TableCell><Badge variant={badgeVariant(p.situacaoFinanceiro)}>{p.situacaoFinanceiro}</Badge></TableCell></TableRow>)}</TableBody></Table></TabsContent>
            <TabsContent value="vinculos" className="grid gap-4 pt-3 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Contas a receber</h3><Table><TableBody>{detalhe.financeiro.length === 0 ? <TableRow><TableCell>Nenhum vínculo financeiro.</TableCell></TableRow> : detalhe.financeiro.map((f) => <TableRow key={f.guidLancamento}><TableCell>{f.descricao}</TableCell><TableCell className="text-right">{moeda(f.valor)}</TableCell><TableCell><Badge variant={badgeVariant(f.situacao)}>{f.situacao}</Badge></TableCell></TableRow>)}</TableBody></Table></div><div><h3 className="mb-2 text-sm font-semibold">Comissões</h3><Table><TableBody>{detalhe.comissoes.length === 0 ? <TableRow><TableCell>Nenhuma comissão vinculada.</TableCell></TableRow> : detalhe.comissoes.map((c) => <TableRow key={c.guidMovimento}><TableCell>{c.vendedor || c.descricao}</TableCell><TableCell className="text-right">{moeda(c.valor)}</TableCell><TableCell><Badge variant={badgeVariant(c.situacao)}>{c.situacao}</Badge></TableCell></TableRow>)}</TableBody></Table></div></TabsContent>
            <TabsContent value="historico" className="pt-3"><Table><TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Ação</TableHead><TableHead>Tabela</TableHead><TableHead>Usuário</TableHead><TableHead>Observação</TableHead></TableRow></TableHeader><TableBody>{detalhe.historico.length === 0 ? <TableRow><TableCell colSpan={5} className="py-6 text-center text-slate-500">Nenhum histórico registrado para esta venda.</TableCell></TableRow> : detalhe.historico.map((h) => <TableRow key={h.guidAuditoria}><TableCell>{dataHora(h.dataHora)}</TableCell><TableCell><Badge variant="secondary">{h.acao}</Badge></TableCell><TableCell>{h.tabela}</TableCell><TableCell>{h.usuarioNome || h.usuario || "-"}</TableCell><TableCell className="max-w-md truncate" title={h.observacao}>{h.observacao || "-"}</TableCell></TableRow>)}</TableBody></Table></TabsContent>
          </Tabs>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelarVenda)} onOpenChange={(open) => { if (!open) { setCancelarVenda(null); setJustificativa(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" /> Cancelar venda</DialogTitle><DialogDescription>Esta ação registra auditoria, estorna vínculos em aberto e não exclui registros físicos.</DialogDescription></DialogHeader>
          <div className="space-y-3"><div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">A venda só será cancelada se não houver conta a receber baixada/paga e nenhuma comissão paga.</div><div className="space-y-1"><Label>Justificativa obrigatória</Label><Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={4} /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setCancelarVenda(null)}>Voltar</Button><Button variant="destructive" onClick={confirmarCancelamento} disabled={cancelando}>Confirmar Cancelamento</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


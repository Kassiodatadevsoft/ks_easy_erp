import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, TrendingDown, AlertTriangle, Clock } from "lucide-react";

type Lanc = {
  CODLANCAMENTO: number; DESCRICAO: string; NOMECREDOR: string | null;
  GUIDCREDOR: string | null;
  VALOR: number; VALORPAGO: number; DESCONTO: number; JUROS: number; MULTA: number;
  DTLANCAMENTO: string; DTVENCIMENTO: string; DTPAGAMENTO: string | null;
  NOMENATUREZA: string | null; NOMECENTRO: string | null;
  NUMERODOC: string | null; PARCELA: number; TOTALPARCELAS: number;
  STATUS: string; FORMAPAGAMENTO: string | null; OBSERVACAO: string | null;
  GUIDLANCAMENTO: string;
};

type Fornecedor = { guidPessoa: string; nome: string; documento: string };

function fmt(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0); }
function fmtDate(d: string | null) { if (!d) return "—"; return new Date(d).toLocaleDateString("pt-BR"); }
function hoje() { return new Date().toISOString().slice(0, 10); }
function mesInicio() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function mesFim() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()}`; }

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  ABERTO: { label: "Aberto", cls: "text-yellow-400 border-yellow-500/30" },
  PAGO: { label: "Pago", cls: "text-emerald-400 border-emerald-500/30" },
  PARCIAL: { label: "Parcial", cls: "text-blue-400 border-blue-500/30" },
  CANCELADO: { label: "Cancelado", cls: "text-muted-foreground" },
};

const FORM_INICIAL = {
  descricao: "", guidCredor: "" as string, nomeCredor: "",
  valor: 0, dtLancamento: hoje(), dtVencimento: hoje(),
  guidNatureza: "" as string, guidCentro: "" as string, guidConta: "" as string,
  numerodoc: "", parcela: 1, totalParcelas: 1, observacao: "",
  gerarParcelas: false, intervaloDias: 30,
};

const BAIXA_INICIAL = {
  valorPago: 0, desconto: 0, juros: 0, multa: 0,
  dtPagamento: hoje(), formaPagamento: "DINHEIRO", contaBancaria: "", observacao: "",
};

export default function ContasPagar() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ABERTO");
  const [dtInicio, setDtInicio] = useState(mesInicio());
  const [dtFim, setDtFim] = useState(mesFim());
  const [pagina, setPagina] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalBaixa, setModalBaixa] = useState<Lanc | null>(null);
  const [editando, setEditando] = useState<Lanc | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [baixa, setBaixa] = useState(BAIXA_INICIAL);
  const [buscaCredor, setBuscaCredor] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.contasPagar.listar.useQuery({ status: filtroStatus !== "todos" ? filtroStatus : undefined, dtInicio, dtFim, busca: busca || undefined, page: pagina, pageSize: 50 });
  const { data: totaisData } = trpc.contasPagar.totais.useQuery({ dtInicio, dtFim });
  const { data: naturezas = [] } = trpc.naturezaCaixa.listarTodas.useQuery({ tipo: "D" });
  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();
  const { data: contas = [] } = trpc.planoContas.listarTodas.useQuery();
  const { data: fornecedoresSugestoes = [] } = trpc.contasPagar.buscarFornecedores.useQuery(
    { busca: buscaCredor },
    { enabled: buscaCredor.length >= 2 }
  );

  const criar = trpc.contasPagar.criar.useMutation({ onSuccess: () => { utils.contasPagar.listar.invalidate(); toast.success("Lançamento criado!"); fecharModal(); } });
  const atualizar = trpc.contasPagar.atualizar.useMutation({ onSuccess: () => { utils.contasPagar.listar.invalidate(); toast.success("Lançamento atualizado!"); fecharModal(); } });
  const baixarMut = trpc.contasPagar.baixar.useMutation({ onSuccess: (r) => { utils.contasPagar.listar.invalidate(); toast.success(`Baixa registrada! Status: ${r.status}`); setModalBaixa(null); setBaixa(BAIXA_INICIAL); } });
  const cancelar = trpc.contasPagar.cancelar.useMutation({ onSuccess: () => { utils.contasPagar.listar.invalidate(); toast.success("Lançamento cancelado!"); } });
  const excluir = trpc.contasPagar.excluir.useMutation({ onSuccess: () => { utils.contasPagar.listar.invalidate(); toast.success("Lançamento excluído!"); } });

  const itens: Lanc[] = (data as { items?: Lanc[] } | undefined)?.items ?? [];
  const total = (data as { total?: number } | undefined)?.total ?? 0;
  const tots = totaisData;

  function isVencido(l: Lanc) { return l.STATUS === "ABERTO" && new Date(l.DTVENCIMENTO) < new Date(hoje()); }

  function abrirNova() { setEditando(null); setForm(FORM_INICIAL); setModalAberto(true); }
  function abrirEditar(l: Lanc) {
    setEditando(l);
    setBuscaCredor(l.NOMECREDOR ?? "");
    setForm({ ...FORM_INICIAL, descricao: l.DESCRICAO, guidCredor: l.GUIDCREDOR ?? "", nomeCredor: l.NOMECREDOR ?? "", valor: Number(l.VALOR), dtLancamento: l.DTLANCAMENTO?.slice(0,10) ?? hoje(), dtVencimento: l.DTVENCIMENTO?.slice(0,10) ?? hoje(), numerodoc: l.NUMERODOC ?? "", parcela: l.PARCELA, totalParcelas: l.TOTALPARCELAS, observacao: l.OBSERVACAO ?? "" });
    setModalAberto(true);
  }
  function fecharModal() { setModalAberto(false); setEditando(null); setForm(FORM_INICIAL); setBuscaCredor(""); setMostrarSugestoes(false); }

  function salvar() {
    if (!form.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (!form.valor || form.valor <= 0) { toast.error("Informe o valor"); return; }
    if (!form.dtVencimento) { toast.error("Informe o vencimento"); return; }
    const payload = { ...form, guidCredor: form.guidCredor || undefined, guidNatureza: form.guidNatureza || undefined, guidCentro: form.guidCentro || undefined, guidConta: form.guidConta || undefined };
    if (editando) atualizar.mutate({ ...payload, guidLancamento: editando.GUIDLANCAMENTO });
    else criar.mutate(payload);
  }

  function registrarBaixa() {
    if (!modalBaixa) return;
    if (!baixa.valorPago || baixa.valorPago <= 0) { toast.error("Informe o valor pago"); return; }
    baixarMut.mutate({ guidLancamento: modalBaixa.GUIDLANCAMENTO, ...baixa });
  }

  const totalPaginas = Math.ceil(total / 50);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10"><TrendingDown className="h-6 w-6 text-red-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">Contas a Pagar</h1>
            <p className="text-sm text-muted-foreground">Controle de obrigações financeiras</p>
          </div>
        </div>
        <Button onClick={abrirNova} className="gap-2"><Plus className="h-4 w-4" /> Novo Lançamento</Button>
      </div>

      {/* Totalizadores */}
      {tots && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Lançado", value: tots.total, icon: TrendingDown, cls: "text-foreground" },
            { label: "Total Pago", value: tots.pago, icon: CheckCircle, cls: "text-emerald-400" },
            { label: "Total Aberto", value: tots.aberto, icon: Clock, cls: "text-yellow-400" },
            { label: "Total Vencido", value: tots.vencido, icon: AlertTriangle, cls: "text-red-400" },
          ].map(t => (
            <div key={t.label} className="rounded-xl border border-white/10 bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <t.icon className={`h-4 w-4 ${t.cls}`} />
                <span className="text-xs text-muted-foreground">{t.label}</span>
              </div>
              <p className={`text-xl font-bold font-mono ${t.cls}`}>{fmt(Number(t.value) || 0)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} className="pl-9" />
        </div>
        <Select value={filtroStatus} onValueChange={v => { setFiltroStatus(v); setPagina(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ABERTO">Aberto</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="PARCIAL">Parcial</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} className="w-40" />
        <Input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} className="w-40" />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground text-xs">
                <th className="px-4 py-3 text-left">Descrição</th>
                <th className="px-4 py-3 text-left">Credor</th>
                <th className="px-4 py-3 text-left">Natureza</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-right">Pago</th>
                <th className="px-4 py-3 text-center">Vencimento</th>
                <th className="px-4 py-3 text-center">Parcela</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan={9} className="p-12 text-center">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Nenhum lançamento encontrado</p>
                  <Button variant="outline" className="mt-4" onClick={abrirNova}><Plus className="h-4 w-4 mr-2" /> Novo Lançamento</Button>
                </td></tr>
              ) : itens.map((l: Lanc) => (
                <tr key={l.GUIDLANCAMENTO} className={`hover:bg-white/5 transition-colors group ${isVencido(l) ? "bg-red-500/5" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{l.DESCRICAO}</p>
                    {l.NUMERODOC && <p className="text-xs text-muted-foreground">Doc: {l.NUMERODOC}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.NOMECREDOR ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{l.NOMENATUREZA ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(l.VALOR)}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{l.VALORPAGO > 0 ? fmt(l.VALORPAGO) : "—"}</td>
                  <td className={`px-4 py-3 text-center text-xs ${isVencido(l) ? "text-red-400 font-semibold" : ""}`}>
                    {isVencido(l) && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                    {fmtDate(l.DTVENCIMENTO)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-muted-foreground">{l.TOTALPARCELAS > 1 ? `${l.PARCELA}/${l.TOTALPARCELAS}` : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={`text-xs ${STATUS_CONFIG[l.STATUS]?.cls ?? ""}`}>{STATUS_CONFIG[l.STATUS]?.label ?? l.STATUS}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {(l.STATUS === "ABERTO" || l.STATUS === "PARCIAL") && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400 hover:text-emerald-300" title="Registrar Baixa" onClick={() => { setModalBaixa(l); setBaixa({ ...BAIXA_INICIAL, valorPago: Number(l.VALOR) - Number(l.VALORPAGO) }); }}><CheckCircle className="h-3.5 w-3.5" /></Button>
                      )}
                      {l.STATUS === "ABERTO" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEditar(l)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      )}
                      {l.STATUS === "ABERTO" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-400 hover:text-orange-300" title="Cancelar" onClick={() => cancelar.mutate({ guidLancamento: l.GUIDLANCAMENTO })}><XCircle className="h-3.5 w-3.5" /></Button>
                      )}
                      {(l.STATUS === "ABERTO" || l.STATUS === "CANCELADO") && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => excluir.mutate({ guidLancamento: l.GUIDLANCAMENTO })}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} lançamentos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
              <span className="px-2 py-1">{pagina} / {totalPaginas}</span>
              <Button variant="outline" size="sm" disabled={pagina === totalPaginas} onClick={() => setPagina(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo/Editar */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editando ? "Editar Lançamento" : "Novo Lançamento — Contas a Pagar"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Descrição *</Label>
                <Input placeholder="EX: ALUGUEL OUTUBRO 2025" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5 relative">
                <Label>Credor (Fornecedor)</Label>
                <div className="relative">
                  <Input
                    placeholder="Digite para buscar fornecedor..."
                    value={buscaCredor}
                    onChange={e => { setBuscaCredor(e.target.value); setMostrarSugestoes(true); setForm(f => ({ ...f, guidCredor: "", nomeCredor: e.target.value })); }}
                    onFocus={() => setMostrarSugestoes(true)}
                    onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)}
                  />
                  {form.guidCredor && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400">✓</span>}
                </div>
                {mostrarSugestoes && buscaCredor.length >= 2 && (fornecedoresSugestoes as Fornecedor[]).length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-lg border border-white/10 bg-popover shadow-lg overflow-hidden">
                    {(fornecedoresSugestoes as Fornecedor[]).map((f: Fornecedor) => (
                      <button key={f.guidPessoa} type="button" className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors" onMouseDown={() => { setForm(fm => ({ ...fm, guidCredor: f.guidPessoa, nomeCredor: f.nome })); setBuscaCredor(f.nome); setMostrarSugestoes(false); }}>
                        <p className="font-medium text-sm">{f.nome}</p>
                        <p className="text-xs text-muted-foreground">{f.documento}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nº Documento</Label>
                <Input placeholder="NF, boleto, etc." value={form.numerodoc} onChange={e => setForm(f => ({ ...f, numerodoc: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Total (R$) *</Label>
                <Input type="number" min={0} step={0.01} value={form.valor} onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Lançamento *</Label>
                <Input type="date" value={form.dtLancamento} onChange={e => setForm(f => ({ ...f, dtLancamento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de Vencimento *</Label>
                <Input type="date" value={form.dtVencimento} onChange={e => setForm(f => ({ ...f, dtVencimento: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Natureza de Caixa</Label>
<Select value={form.guidNatureza || "none"} onValueChange={v => setForm(f => ({ ...f, guidNatureza: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(naturezas as Array<{guidNatureza:string;NATUREZA:string}>).map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Centro de Custo</Label>
<Select value={form.guidCentro || "none"} onValueChange={v => setForm(f => ({ ...f, guidCentro: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {(centros as Array<{guidCentro:string;CENTRO:string}>).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!editando && (
                <>
                  <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-lg border border-white/10">
                    <Switch checked={form.gerarParcelas} onCheckedChange={v => setForm(f => ({ ...f, gerarParcelas: v }))} />
                    <Label className="cursor-pointer">Gerar parcelas automaticamente</Label>
                  </div>
                  {form.gerarParcelas && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Número de Parcelas</Label>
                        <Input type="number" min={2} max={60} value={form.totalParcelas} onChange={e => setForm(f => ({ ...f, totalParcelas: Number(e.target.value) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Intervalo (dias)</Label>
                        <Input type="number" min={1} value={form.intervaloDias} onChange={e => setForm(f => ({ ...f, intervaloDias: Number(e.target.value) }))} />
                      </div>
                      {form.totalParcelas > 1 && form.valor > 0 && (
                        <div className="sm:col-span-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
                          {form.totalParcelas}x de {fmt(form.valor / form.totalParcelas)} (1ª parcela em {fmtDate(form.dtVencimento)})
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Observação</Label>
                <Textarea placeholder="Observações..." value={form.observacao ?? ""} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>{editando ? "Salvar" : "Criar Lançamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Baixa */}
      <Dialog open={!!modalBaixa} onOpenChange={v => { if (!v) { setModalBaixa(null); setBaixa(BAIXA_INICIAL); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {modalBaixa && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-white/5 text-sm">
                <p className="font-medium">{modalBaixa.DESCRICAO}</p>
                <p className="text-muted-foreground text-xs mt-1">Valor original: {fmt(modalBaixa.VALOR)} | Já pago: {fmt(modalBaixa.VALORPAGO)} | Restante: {fmt(Number(modalBaixa.VALOR) - Number(modalBaixa.VALORPAGO))}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Valor Pago (R$) *</Label>
                  <Input type="number" min={0} step={0.01} value={baixa.valorPago} onChange={e => setBaixa(b => ({ ...b, valorPago: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data do Pagamento *</Label>
                  <Input type="date" value={baixa.dtPagamento} onChange={e => setBaixa(b => ({ ...b, dtPagamento: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Desconto (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={baixa.desconto} onChange={e => setBaixa(b => ({ ...b, desconto: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Juros (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={baixa.juros} onChange={e => setBaixa(b => ({ ...b, juros: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Multa (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={baixa.multa} onChange={e => setBaixa(b => ({ ...b, multa: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Forma de Pagamento</Label>
                  <Select value={baixa.formaPagamento} onValueChange={v => setBaixa(b => ({ ...b, formaPagamento: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["DINHEIRO","PIX","BOLETO","CARTAO_DEBITO","CARTAO_CREDITO","TED","DOC","CHEQUE"].map(f => <SelectItem key={f} value={f}>{f.replace("_"," ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Conta Bancária</Label>
                  <Input placeholder="Ex: Bradesco CC 1234-5" value={baixa.contaBancaria} onChange={e => setBaixa(b => ({ ...b, contaBancaria: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea rows={2} value={baixa.observacao} onChange={e => setBaixa(b => ({ ...b, observacao: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalBaixa(null); setBaixa(BAIXA_INICIAL); }}>Cancelar</Button>
            <Button onClick={registrarBaixa} disabled={baixarMut.isPending} className="gap-2"><CheckCircle className="h-4 w-4" /> Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Search } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const EMPTY = { dtLancamento: hoje(), tipo: "E" as "E"|"S", valor: "", descricao: "", guidConta: "", guidNatureza: "", guidCentro: "", numerodoc: "", observacao: "" };
type NaturezaOpcao = { guidNatureza: string; NATUREZA?: string; natureza?: string; TIPO?: string; guidConta?: string | null };
type CentroOpcao = { guidCentro: string; CENTRO?: string; centro?: string };

export default function LancamentosCaixa() {
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(primeiroDiaMes());
  const [dtFim, setDtFim] = useState(hoje());
  const [tipoFiltro, setTipoFiltro] = useState<"E"|"S"|"todos">("todos");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 30;

  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const { data: naturezas = [] } = trpc.naturezaCaixa.listarTodas.useQuery();
  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();

  const { data, isLoading } = trpc.lancamentosCaixa.listar.useQuery({
    tipo: tipoFiltro, dtInicio, dtFim, busca: busca || undefined, pagina, porPagina: POR_PAGINA,
  });

  const criar = trpc.lancamentosCaixa.criar.useMutation({
    onSuccess: () => { utils.lancamentosCaixa.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Lançamento registrado!"); setModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.lancamentosCaixa.excluir.useMutation({
    onSuccess: () => { utils.lancamentosCaixa.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Lançamento excluído!"); },
    onError: (e) => toast.error(e.message),
  });

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const totalPaginas = Math.ceil((data?.total ?? 0) / POR_PAGINA);
  const saldo = (data?.totalEntradas ?? 0) - (data?.totalSaidas ?? 0);
  const tipoNatureza = form.tipo === "E" ? "R" : "D";
  const naturezasFiltradas = (naturezas as NaturezaOpcao[]).filter(n => (n.TIPO ?? tipoNatureza) === tipoNatureza);
  const naturezaSelecionada = naturezasFiltradas.find(n => n.guidNatureza === form.guidNatureza);

  function salvar() {
    if (!form.descricao.trim()) { toast.error("Informe a descrição."); return; }
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0) { toast.error("Informe um valor válido."); return; }
    if (!form.guidConta) { toast.error("Selecione a conta/caixa."); return; }
    if (!form.guidNatureza) { toast.error("Selecione a natureza de caixa."); return; }
    if (!form.guidCentro) { toast.error("Selecione o centro de custo."); return; }
    if (!naturezaSelecionada?.guidConta) { toast.error("A natureza precisa estar vinculada ao plano de contas."); return; }
    criar.mutate({
      dtLancamento: form.dtLancamento, tipo: form.tipo, valor, descricao: form.descricao,
      guidConta: form.guidConta, guidNatureza: form.guidNatureza, guidCentro: form.guidCentro,
      numerodoc: form.numerodoc || null, observacao: form.observacao || null,
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lançamentos de Caixa</h1>
          <p className="text-muted-foreground text-sm">Entradas e saídas financeiras diretas</p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY }); setModal(true); }}><Plus className="w-4 h-4 mr-2" />Novo Lançamento</Button>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" />Entradas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-green-600">R$ {(data?.totalEntradas ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />Saídas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-red-600">R$ {(data?.totalSaidas ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        <Card className={`border-${saldo >= 0 ? "blue" : "orange"}-500/30 bg-${saldo >= 0 ? "blue" : "orange"}-500/5`}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="w-4 h-4" />Saldo do Período</CardTitle></CardHeader>
          <CardContent><p className={`text-xl font-bold ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}>R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Data Início</Label>
          <Input type="date" value={dtInicio} onChange={e => { setDtInicio(e.target.value); setPagina(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data Fim</Label>
          <Input type="date" value={dtFim} onChange={e => { setDtFim(e.target.value); setPagina(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipoFiltro} onValueChange={v => { setTipoFiltro(v as "E"|"S"|"todos"); setPagina(1); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="E">Entradas</SelectItem>
              <SelectItem value="S">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Busca</Label>
            <Input value={buscaInput} onChange={e => setBuscaInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (setBusca(buscaInput), setPagina(1))} placeholder="Descrição ou doc..." className="w-48" />
          </div>
          <Button variant="outline" size="icon" onClick={() => { setBusca(buscaInput); setPagina(1); }}><Search className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Nº Doc</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && (data?.dados ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
              {(data?.dados ?? []).map(l => (
                <TableRow key={l.guidLancamento}>
                  <TableCell className="text-sm">{new Date(l.DTLANCAMENTO).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant={l.TIPO === "E" ? "default" : "destructive"} className="text-xs">
                      {l.TIPO === "E" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{l.DESCRICAO}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.nomeConta ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.nomeNatureza ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.NUMERODOC ?? "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${l.TIPO === "E" ? "text-green-600" : "text-red-600"}`}>
                    {l.TIPO === "S" ? "- " : "+ "}R$ {Number(l.VALOR).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Excluir este lançamento?")) excluir.mutate({ guidLancamento: l.guidLancamento }); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total ?? 0} lançamentos</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="px-2 py-1">{pagina}/{totalPaginas}</span>
            <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Lançamento de Caixa</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.dtLancamento} onChange={e => setForm(f => ({ ...f, dtLancamento: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as "E"|"S", guidNatureza: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E">Entrada</SelectItem>
                  <SelectItem value="S">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.toUpperCase() }))} placeholder="Descrição do lançamento" />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Nº Documento</Label>
              <Input value={form.numerodoc} onChange={e => setForm(f => ({ ...f, numerodoc: e.target.value }))} placeholder="NF, recibo..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Conta/Caixa *</Label>
              <Select value={form.guidConta} onValueChange={v => setForm(f => ({ ...f, guidConta: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta/caixa" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Natureza de Caixa *</Label>
              <Select value={form.guidNatureza} onValueChange={v => setForm(f => ({ ...f, guidNatureza: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {naturezasFiltradas.map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA ?? n.natureza}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.guidNatureza && !naturezaSelecionada?.guidConta && (
                <p className="text-xs text-destructive">Vincule esta natureza a uma conta do plano de contas.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Centro de Custo *</Label>
              <Select value={form.guidCentro} onValueChange={v => setForm(f => ({ ...f, guidCentro: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(centros as CentroOpcao[]).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO ?? c.centro}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm">
              <p className="font-medium text-blue-300">Regra contabil automatica</p>
              <p className="mt-1 text-muted-foreground">A conta/caixa movimenta o saldo financeiro; a natureza define a conta do plano de contas para os relatórios contábeis.</p>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observações adicionais" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Edit2, XCircle, Tag, Sparkles } from "lucide-react";

type Natureza = {
  NATUREZA: string; DESCRICAO: string | null;
  TIPO: string; guidConta: string | null; nomeConta: string | null;
  SITUACAO: string; GUIDNATUREZA: string; guidNatureza: string;
};

const FORM_INICIAL = { natureza: "", descricao: "", tipo: "D" as "R"|"D", guidConta: "" as string, situacao: "A" as "A"|"I" };

export default function NaturezaCaixa() {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Natureza | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const utils = trpc.useUtils();

  const { data: naturezas = [], isLoading } = trpc.naturezaCaixa.listar.useQuery({
    tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
    situacao: "A",
    busca: busca || undefined,
  });
  const { data: contas = [] } = trpc.planoContas.listarTodas.useQuery();

  const criar = trpc.naturezaCaixa.criar.useMutation({ onSuccess: () => { utils.naturezaCaixa.listar.invalidate(); toast.success("Natureza criada!"); fecharModal(); } });
  const atualizar = trpc.naturezaCaixa.atualizar.useMutation({ onSuccess: () => { utils.naturezaCaixa.listar.invalidate(); toast.success("Natureza atualizada!"); fecharModal(); } });
  const cancelar = trpc.naturezaCaixa.cancelar.useMutation({ onSuccess: () => { utils.naturezaCaixa.listar.invalidate(); toast.success("Natureza cancelada. O histórico foi preservado."); } });
  const seedStatus = trpc.seed.status.useQuery();
  const popularNat = trpc.seed.popularNaturezaCaixa.useMutation({
    onSuccess: (r) => { utils.naturezaCaixa.listar.invalidate(); seedStatus.refetch(); toast.success(`${r.inseridos} naturezas padrão inseridas!`); },
    onError: (e) => toast.error(e.message),
  });

  function abrirNova() { setEditando(null); setForm(FORM_INICIAL); setModalAberto(true); }
  function abrirEditar(n: Natureza) {
    setEditando(n);
    setForm({ natureza: n.NATUREZA, descricao: n.DESCRICAO ?? "", tipo: n.TIPO as "R"|"D", guidConta: n.guidConta ?? "", situacao: n.SITUACAO as "A"|"I" });
    setModalAberto(true);
  }
  function fecharModal() { setModalAberto(false); setEditando(null); setForm(FORM_INICIAL); }
  function salvar() {
    if (!form.natureza.trim()) { toast.error("Informe o nome da natureza"); return; }
    if (!form.guidConta) { toast.error("Selecione a conta do plano de contas"); return; }
    if (editando) atualizar.mutate({ ...form, guidNatureza: editando.GUIDNATUREZA ?? editando.guidNatureza });
    else criar.mutate(form);
  }

  const receitas = (naturezas as Natureza[]).filter(n => n.TIPO === "R");
  const despesas = (naturezas as Natureza[]).filter(n => n.TIPO === "D");

  function GrupoNatureza({ titulo, itens, cor }: { titulo: string; itens: Natureza[]; cor: string }) {
    return (
      <div className="space-y-2">
        <h3 className={`text-sm font-semibold ${cor} px-1`}>{titulo} ({itens.length})</h3>
        {itens.map((n: Natureza) => (
          <div key={n.GUIDNATUREZA ?? n.guidNatureza} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/10 bg-card hover:bg-white/5 group transition-colors">
            <div className="flex-1">
              <p className="font-medium text-sm">{n.NATUREZA}</p>
              {n.DESCRICAO && <p className="text-xs text-muted-foreground mt-0.5">{n.DESCRICAO}</p>}
              {n.nomeConta && <p className="text-xs text-muted-foreground/70 mt-0.5">Conta: {n.nomeConta}</p>}
            </div>
            <Badge variant="outline" className={`text-xs ${n.TIPO === "R" ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>{n.TIPO === "R" ? "Receita" : "Despesa"}</Badge>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEditar(n)}><Edit2 className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" title="Cancelar natureza" className="h-7 w-7 text-orange-400 hover:text-orange-300" onClick={() => cancelar.mutate({ guidNatureza: n.GUIDNATUREZA ?? n.guidNatureza })}><XCircle className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/10"><Tag className="h-6 w-6 text-orange-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">Natureza de Caixa</h1>
            <p className="text-sm text-muted-foreground">Classificação de receitas e despesas</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(seedStatus.data?.naturezaCaixa ?? 0) === 0 && (
            <Button variant="outline" onClick={() => popularNat.mutate()} disabled={popularNat.isPending} className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
              <Sparkles className="h-4 w-4" /> {popularNat.isPending ? "Inserindo..." : "Dados Padrão"}
            </Button>
          )}
          <Button onClick={abrirNova} className="gap-2"><Plus className="h-4 w-4" /> Nova Natureza</Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar natureza..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="R">Receitas</SelectItem>
            <SelectItem value="D">Despesas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : naturezas.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-white/10">
          <Tag className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nenhuma natureza cadastrada</p>
          <Button variant="outline" className="mt-4" onClick={abrirNova}><Plus className="h-4 w-4 mr-2" /> Criar primeira natureza</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(filtroTipo === "todos" || filtroTipo === "R") && receitas.length > 0 && (
            <GrupoNatureza titulo="Receitas" itens={receitas} cor="text-emerald-400" />
          )}
          {(filtroTipo === "todos" || filtroTipo === "D") && despesas.length > 0 && (
            <GrupoNatureza titulo="Despesas" itens={despesas} cor="text-red-400" />
          )}
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editando ? "Editar Natureza" : "Nova Natureza de Caixa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da Natureza *</Label>
              <Input placeholder="EX: VENDA DE PRODUTOS" value={form.natureza} onChange={e => setForm(f => ({ ...f, natureza: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as "R"|"D" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="R">Receita (entrada)</SelectItem>
                  <SelectItem value="D">Despesa (saída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conta do Plano de Contas *</Label>
              {contas.length > 0 ? (
                <Select value={form.guidConta || "none"} onValueChange={v => setForm(f => ({ ...f, guidConta: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma conta</SelectItem>
                    {(contas as Array<{ guidConta: string; MASCARA?: string | null; CONTA: string; TIPO: string }>)
                      .map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.MASCARA ? `${c.MASCARA} — ` : ""}{c.CONTA}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Cadastre uma conta no plano de contas antes de salvar a natureza.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea placeholder="Descrição da natureza..." value={form.descricao ?? ""} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            {editando && (
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={form.situacao} onValueChange={v => setForm(f => ({ ...f, situacao: v as "A"|"I" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Ativa</SelectItem>
                    <SelectItem value="I">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>{editando ? "Salvar" : "Criar Natureza"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

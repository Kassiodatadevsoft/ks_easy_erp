import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, ChevronRight, ChevronDown, Edit2, XCircle, BookOpen, Sparkles } from "lucide-react";

type Conta = {
  CODCONTA: string;
  CONTA: string;
  DESCRICAO: string | null;
  TIPO: string;
  NIVEL: number;
  GUIDCONTAPAI: string | null;
  guidContaPai: string | null;
  contaPai: string | null;
  MASCARA: string | null;
  SITUACAO: string;
  GUIDCONTA: string;
  guidConta: string;
};

const TIPO_LABEL: Record<string, string> = { R: "Receita", D: "Despesa", T: "Transferência" };
const TIPO_COLOR: Record<string, string> = {
  R: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  D: "bg-red-500/20 text-red-400 border-red-500/30",
  T: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const FORM_INICIAL = {
  codConta: "",
  conta: "",
  descricao: "",
  tipo: "D" as "R" | "D" | "T",
  nivel: 1,
  guidContaPai: undefined as string | undefined,
  mascara: "",
  situacao: "A" as "A" | "I",
};

function ContaNode({ conta, todasContas, nivel, busca, onEdit, onCancel }: {
  conta: Conta; todasContas: Conta[]; nivel: number; busca: string;
  onEdit: (c: Conta) => void; onCancel: (c: Conta) => void;
}) {
  const [aberto, setAberto] = useState(nivel < 2);
  const guidC = conta.GUIDCONTA ?? conta.guidConta;
  const filhos = todasContas.filter(f => (f.GUIDCONTAPAI ?? f.guidContaPai) === guidC);
  const temFilhos = filhos.length > 0;
  const match = !busca || conta.CONTA.toLowerCase().includes(busca.toLowerCase()) || conta.CODCONTA.toLowerCase().includes(busca.toLowerCase());
  if (!match && !temFilhos) return null;
  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 group transition-colors ${nivel === 1 ? "font-semibold" : ""}`}
        style={{ paddingLeft: `${(nivel - 1) * 20 + 12}px` }}
      >
        <button onClick={() => setAberto(!aberto)} className="w-5 h-5 flex items-center justify-center text-muted-foreground">
          {temFilhos ? (aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
        </button>
        <span className="text-xs text-muted-foreground font-mono w-24 shrink-0">{conta.MASCARA ?? conta.CODCONTA}</span>
        <span className="flex-1 text-sm">{conta.CONTA}</span>
        <Badge variant="outline" className={`text-xs ${TIPO_COLOR[conta.TIPO] ?? ""}`}>{TIPO_LABEL[conta.TIPO]}</Badge>
        {conta.SITUACAO === "I" && <Badge variant="outline" className="text-xs text-muted-foreground">Inativa</Badge>}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(conta)}><Edit2 className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" title="Cancelar conta" className="h-7 w-7 text-orange-400 hover:text-orange-300" onClick={() => onCancel(conta)}><XCircle className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {aberto && filhos.map(f => (
        <ContaNode key={f.GUIDCONTA ?? f.guidConta} conta={f} todasContas={todasContas} nivel={nivel + 1} busca={busca} onEdit={onEdit} onCancel={onCancel} />
      ))}
    </div>
  );
}

export default function PlanoContas() {
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Conta | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const utils = trpc.useUtils();

  const { data: contas = [], isLoading } = trpc.planoContas.listar.useQuery({
    tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
    situacao: "A",
  });

  const criar = trpc.planoContas.criar.useMutation({
    onSuccess: () => { utils.planoContas.listar.invalidate(); toast.success("Conta criada!"); fecharModal(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.planoContas.atualizar.useMutation({
    onSuccess: () => { utils.planoContas.listar.invalidate(); toast.success("Conta atualizada!"); fecharModal(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelar = trpc.planoContas.cancelar.useMutation({
    onSuccess: () => { utils.planoContas.listar.invalidate(); toast.success("Conta cancelada. O histórico foi preservado."); },
    onError: (e) => toast.error(e.message),
  });
  const seedStatus = trpc.seed.status.useQuery();
  const popularPlano = trpc.seed.popularPlanoContas.useMutation({
    onSuccess: (r) => { utils.planoContas.listar.invalidate(); seedStatus.refetch(); toast.success(`${r.inseridos} contas padrão inseridas!`); },
    onError: (e) => toast.error(e.message),
  });

  const arvore = useMemo(() => {
    return (contas as Conta[]).filter(c => !c.GUIDCONTAPAI && !c.guidContaPai);
  }, [contas]);

  function abrirNova() { setEditando(null); setForm(FORM_INICIAL); setModalAberto(true); }
  function abrirEditar(c: Conta) {
    setEditando(c);
    setForm({
      codConta: c.CODCONTA,
      conta: c.CONTA,
      descricao: c.DESCRICAO ?? "",
      tipo: c.TIPO as "R" | "D" | "T",
      nivel: c.NIVEL,
      guidContaPai: c.GUIDCONTAPAI ?? c.guidContaPai ?? undefined,
      mascara: c.MASCARA ?? "",
      situacao: c.SITUACAO as "A" | "I",
    });
    setModalAberto(true);
  }
  function fecharModal() { setModalAberto(false); setEditando(null); setForm(FORM_INICIAL); }

  function salvar() {
    if (!form.codConta.trim()) { toast.error("Informe o código da conta"); return; }
    if (!form.conta.trim()) { toast.error("Informe o nome da conta"); return; }
    if (editando) {
      atualizar.mutate({ ...form, guidConta: editando.GUIDCONTA ?? editando.guidConta });
    } else {
      criar.mutate(form);
    }
  }

  function cancelarConta(c: Conta) {
    cancelar.mutate({ guidConta: c.GUIDCONTA ?? c.guidConta });
  }

  const contasSinteticas = (contas as Conta[]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><BookOpen className="h-6 w-6 text-blue-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">Plano de Contas</h1>
            <p className="text-sm text-muted-foreground">Estrutura hierárquica de contas contábeis</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(seedStatus.data?.planoContas ?? 0) === 0 && (
            <Button variant="outline" onClick={() => popularPlano.mutate()} disabled={popularPlano.isPending} className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
              <Sparkles className="h-4 w-4" /> {popularPlano.isPending ? "Inserindo..." : "Dados Padrão"}
            </Button>
          )}
          <Button onClick={abrirNova} className="gap-2"><Plus className="h-4 w-4" /> Nova Conta</Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar conta..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="R">Receita</SelectItem>
            <SelectItem value="D">Despesa</SelectItem>
            <SelectItem value="T">Transferência</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 grid grid-cols-[20px_96px_1fr_100px_80px] gap-2 text-xs text-muted-foreground font-medium">
          <span />
          <span>Cód/Máscara</span>
          <span>Conta</span>
          <span>Tipo</span>
          <span />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : arvore.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma conta cadastrada</p>
            <Button variant="outline" className="mt-4" onClick={abrirNova}><Plus className="h-4 w-4 mr-2" /> Criar primeira conta</Button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {arvore.map((c: Conta) => (
              <ContaNode
                key={c.GUIDCONTA ?? c.guidConta}
                conta={c}
                todasContas={contas as Conta[]}
                nivel={1}
                busca={busca}
                onEdit={abrirEditar}
                onCancel={cancelarConta}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editando ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Código da Conta *</Label>
                <Input
                  placeholder="EX: 1.1.01"
                  value={form.codConta}
                  onChange={e => setForm(f => ({ ...f, codConta: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Máscara (ex: 1.1.01)</Label>
                <Input placeholder="1.1.01" value={form.mascara} onChange={e => setForm(f => ({ ...f, mascara: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome da Conta *</Label>
                <Input
                  placeholder="EX: RECEITAS OPERACIONAIS"
                  value={form.conta}
                  onChange={e => setForm(f => ({ ...f, conta: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as "R" | "D" | "T" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R">Receita</SelectItem>
                    <SelectItem value="D">Despesa</SelectItem>
                    <SelectItem value="T">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nível</Label>
                <Input type="number" min={1} max={5} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: Number(e.target.value) }))} />
              </div>
              {contasSinteticas.length > 0 && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Conta Pai (agrupadora)</Label>
                  <Select
                    value={form.guidContaPai ?? "none"}
                    onValueChange={v => setForm(f => ({ ...f, guidContaPai: v === "none" ? undefined : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Nenhuma (conta raiz)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma (conta raiz)</SelectItem>
                      {contasSinteticas.map((c: Conta) => {
                        const g = c.GUIDCONTA ?? c.guidConta;
                        return (
                          <SelectItem key={g} value={g}>
                            {c.MASCARA ? `${c.MASCARA} — ` : ""}{c.CONTA}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  placeholder="Descrição detalhada da conta..."
                  value={form.descricao ?? ""}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  rows={2}
                />
              </div>
              {editando && (
                <div className="space-y-1.5">
                  <Label>Situação</Label>
                  <Select value={form.situacao} onValueChange={v => setForm(f => ({ ...f, situacao: v as "A" | "I" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Ativa</SelectItem>
                      <SelectItem value="I">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>
              {editando ? "Salvar" : "Criar Conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

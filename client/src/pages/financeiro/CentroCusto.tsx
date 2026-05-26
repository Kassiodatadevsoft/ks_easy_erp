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
import { Plus, Search, Edit2, Trash2, Target } from "lucide-react";

type Centro = {
  CODCENTRO: string; CENTRO: string; DESCRICAO: string | null;
  guidCentroPai: string | null; NIVEL: number; MASCARA: string | null;
  RESPONSAVEL: string | null; ORCAMENTO: number; SITUACAO: string;
  GUIDCENTRO?: string; guidCentro?: string;
};

const FORM_INICIAL = { codCentro: "", centro: "", descricao: "", guidCentroPai: undefined as string|undefined, nivel: 1, orcamento: 0, situacao: "A" as "A"|"I" };

function fmt(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }

export default function CentroCusto() {
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Centro | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const utils = trpc.useUtils();

  const { data: centros = [], isLoading } = trpc.centroCusto.listar.useQuery({ situacao: "A" });
  const criar = trpc.centroCusto.criar.useMutation({ onSuccess: () => { utils.centroCusto.listar.invalidate(); toast.success("Centro criado!"); fecharModal(); } });
  const atualizar = trpc.centroCusto.atualizar.useMutation({ onSuccess: () => { utils.centroCusto.listar.invalidate(); toast.success("Centro atualizado!"); fecharModal(); } });
  const excluir = trpc.centroCusto.excluir.useMutation({ onSuccess: () => { utils.centroCusto.listar.invalidate(); toast.success("Centro inativado!"); } });

  const filtrados = centros.filter((c: Centro) => !busca || c.CENTRO.toLowerCase().includes(busca.toLowerCase()) || (c.RESPONSAVEL ?? "").toLowerCase().includes(busca.toLowerCase()));

  function abrirNova() { setEditando(null); setForm(FORM_INICIAL); setModalAberto(true); }
  function abrirEditar(c: Centro) {
    setEditando(c);
    setForm({ codCentro: c.CODCENTRO, centro: c.CENTRO, descricao: c.DESCRICAO ?? "", guidCentroPai: c.guidCentroPai ?? undefined, nivel: c.NIVEL, orcamento: c.ORCAMENTO, situacao: c.SITUACAO as "A"|"I" });
    setModalAberto(true);
  }
  function fecharModal() { setModalAberto(false); setEditando(null); setForm(FORM_INICIAL); }
  function salvar() {
    if (!form.centro.trim()) { toast.error("Informe o nome do centro"); return; }
    if (!form.codCentro.trim()) { toast.error("Informe o código do centro"); return; }
    const guidC = editando?.GUIDCENTRO ?? editando?.guidCentro;
    if (editando && guidC) atualizar.mutate({ ...form, guidCentro: guidC });
    else criar.mutate(form);
  }

  const centrosPai = centros.filter((c: Centro) => c.NIVEL < 3);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10"><Target className="h-6 w-6 text-purple-400" /></div>
          <div>
            <h1 className="text-2xl font-bold">Centro de Custo</h1>
            <p className="text-sm text-muted-foreground">Controle orçamentário por departamento ou projeto</p>
          </div>
        </div>
        <Button onClick={abrirNova} className="gap-2"><Plus className="h-4 w-4" /> Novo Centro</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar centro..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted-foreground text-xs">
              <th className="px-4 py-3 text-left">Máscara</th>
              <th className="px-4 py-3 text-left">Centro de Custo</th>
              <th className="px-4 py-3 text-left">Responsável</th>
              <th className="px-4 py-3 text-right">Orçamento</th>
              <th className="px-4 py-3 text-center">Nível</th>
              <th className="px-4 py-3 text-center">Situação</th>
              <th className="px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7} className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhum centro cadastrado</p>
                <Button variant="outline" className="mt-4" onClick={abrirNova}><Plus className="h-4 w-4 mr-2" /> Criar primeiro centro</Button>
              </td></tr>
            ) : filtrados.map((c: Centro) => (
              <tr key={c.GUIDCENTRO} className="hover:bg-white/5 transition-colors group">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.MASCARA ?? c.CODCENTRO}</td>
                <td className="px-4 py-3 font-medium" style={{ paddingLeft: `${(c.NIVEL - 1) * 16 + 16}px` }}>{c.CENTRO}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.RESPONSAVEL ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{c.ORCAMENTO > 0 ? fmt(c.ORCAMENTO) : "—"}</td>
                <td className="px-4 py-3 text-center"><Badge variant="outline" className="text-xs">Nível {c.NIVEL}</Badge></td>
                <td className="px-4 py-3 text-center"><Badge variant="outline" className={`text-xs ${c.SITUACAO === "A" ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>{c.SITUACAO === "A" ? "Ativo" : "Inativo"}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEditar(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => excluir.mutate({ guidCentro: c.GUIDCENTRO ?? c.guidCentro ?? "" })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editando ? "Editar Centro" : "Novo Centro de Custo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input placeholder="EX: ADM" value={form.codCentro} onChange={e => setForm(f => ({ ...f, codCentro: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Nível</Label>
                <Input type="number" min={1} max={5} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: Number(e.target.value) }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do Centro *</Label>
                <Input placeholder="EX: ADMINISTRATIVO" value={form.centro} onChange={e => setForm(f => ({ ...f, centro: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Orçamento Mensal (R$)</Label>
                <Input type="number" min={0} step={0.01} value={form.orcamento} onChange={e => setForm(f => ({ ...f, orcamento: Number(e.target.value) }))} />
              </div>
              {centrosPai.length > 0 && (
                <div className="col-span-2 space-y-1.5">
                  <Label>Centro Pai</Label>
                  <Select value={form.guidCentroPai ?? "none"} onValueChange={v => setForm(f => ({ ...f, guidCentroPai: v === "none" ? undefined : v }))}>
                    <SelectTrigger><SelectValue placeholder="Nenhum (raiz)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (raiz)</SelectItem>
                      {centrosPai.map((c: Centro) => { const g = c.GUIDCENTRO ?? c.guidCentro ?? ""; return <SelectItem key={g} value={g}>{c.MASCARA ? `${c.MASCARA} — ` : ""}{c.CENTRO}</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2 space-y-1.5">
                <Label>Descrição</Label>
                <Textarea placeholder="Descrição do centro de custo..." value={form.descricao ?? ""} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} />
              </div>
              {editando && (
                <div className="space-y-1.5">
                  <Label>Situação</Label>
                  <Select value={form.situacao} onValueChange={v => setForm(f => ({ ...f, situacao: v as "A"|"I" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Ativo</SelectItem>
                      <SelectItem value="I">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>{editando ? "Salvar" : "Criar Centro"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

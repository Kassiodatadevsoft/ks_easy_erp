import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRightLeft, ChevronLeft, ChevronRight } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const EMPTY = { dtransferencia: hoje(), guidContaOrigem: "", guidContaDestino: "", valor: "", descricao: "", observacao: "" };

export default function Transferencias() {
  const utils = trpc.useUtils();
  const [dtInicio, setDtInicio] = useState(primeiroDiaMes());
  const [dtFim, setDtFim] = useState(hoje());
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 20;

  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const { data, isLoading } = trpc.transferencias.listar.useQuery({ dtInicio, dtFim, pagina, porPagina: POR_PAGINA });
  const criar = trpc.transferencias.criar.useMutation({
    onSuccess: () => { utils.transferencias.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Transferência registrada!"); setModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.transferencias.excluir.useMutation({
    onSuccess: () => { utils.transferencias.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Transferência excluída e saldos revertidos!"); },
    onError: (e) => toast.error(e.message),
  });

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  const totalPaginas = Math.ceil((data?.total ?? 0) / POR_PAGINA);

  const contasOpts = useMemo(() => contas.map(c => ({ value: c.guidConta, label: `${c.CONTA} — R$ ${Number(c.saldoAtual ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` })), [contas]);

  function salvar() {
    if (!form.guidContaOrigem || !form.guidContaDestino) { toast.error("Selecione as contas de origem e destino."); return; }
    if (form.guidContaOrigem === form.guidContaDestino) { toast.error("Origem e destino não podem ser iguais."); return; }
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0) { toast.error("Informe um valor válido."); return; }
    criar.mutate({ dtransferencia: form.dtransferencia, guidContaOrigem: form.guidContaOrigem, guidContaDestino: form.guidContaDestino, valor, descricao: form.descricao || null, observacao: form.observacao || null });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferências entre Contas</h1>
          <p className="text-muted-foreground text-sm">Movimentações entre contas bancárias e caixas</p>
        </div>
        <Button onClick={() => { setForm({ ...EMPTY }); setModal(true); }}><Plus className="w-4 h-4 mr-2" />Nova Transferência</Button>
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
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="w-8 text-center"><ArrowRightLeft className="w-4 h-4 mx-auto" /></TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && (data?.dados ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma transferência no período.</TableCell></TableRow>}
              {(data?.dados ?? []).map(t => (
                <TableRow key={t.guidTransferencia}>
                  <TableCell className="text-sm">{new Date(t.DTRANSFERENCIA).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-medium text-red-600">{t.nomeContaOrigem ?? "—"}</TableCell>
                  <TableCell className="text-center text-muted-foreground">→</TableCell>
                  <TableCell className="font-medium text-green-600">{t.nomeContaDestino ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">R$ {Number(t.VALOR).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.DESCRICAO ?? "—"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Excluir esta transferência? Os saldos serão revertidos.")) excluir.mutate({ guidTransferencia: t.guidTransferencia }); }}>
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
          <span>{data?.total ?? 0} transferências</span>
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
          <DialogHeader><DialogTitle>Nova Transferência</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.dtransferencia} onChange={e => setForm(f => ({ ...f, dtransferencia: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Conta de Origem *</Label>
              <Select value={form.guidContaOrigem} onValueChange={v => setForm(f => ({ ...f, guidContaOrigem: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta de origem" /></SelectTrigger>
                <SelectContent>{contasOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Conta de Destino *</Label>
              <Select value={form.guidContaDestino} onValueChange={v => setForm(f => ({ ...f, guidContaDestino: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta de destino" /></SelectTrigger>
                <SelectContent>{contasOpts.filter(o => o.value !== form.guidContaOrigem).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.toUpperCase() }))} placeholder="Motivo da transferência" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observações adicionais" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending}>{criar.isPending ? "Salvando..." : "Transferir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

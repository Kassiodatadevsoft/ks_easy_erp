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
import { Plus, Pencil, Landmark, Wallet, PiggyBank, CircleDollarSign, RefreshCw } from "lucide-react";

const TIPO_LABEL: Record<string, string> = { C: "Corrente", P: "Poupança", X: "Caixa", O: "Outro" };
const TIPO_ICON: Record<string, React.ReactNode> = {
  C: <Landmark className="w-5 h-5" />,
  P: <PiggyBank className="w-5 h-5" />,
  X: <Wallet className="w-5 h-5" />,
  O: <CircleDollarSign className="w-5 h-5" />,
};

type FormState = { conta: string; banco: string; agencia: string; numeroConta: string; tipoConta: "C"|"P"|"X"|"O"; saldoInicial: number; situacao: "A"|"I" };
const EMPTY: FormState = { conta: "", banco: "", agencia: "", numeroConta: "", tipoConta: "C", saldoInicial: 0, situacao: "A" };

export default function ContasBancarias() {
  const utils = trpc.useUtils();
  const { data: contas = [], isLoading } = trpc.contasBancarias.listar.useQuery({ situacao: "todos" });
  const criar = trpc.contasBancarias.criar.useMutation({
    onSuccess: () => { utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Conta criada!"); setModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.contasBancarias.atualizar.useMutation({
    onSuccess: () => { utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Conta atualizada!"); setModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.contasBancarias.excluir.useMutation({
    onSuccess: () => { utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Conta inativada!"); },
    onError: (e) => toast.error(e.message),
  });

  const [modal, setModal] = useState(false);
  const [editGuid, setEditGuid] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY });

  function abrirNovo() { setEditGuid(null); setForm({ ...EMPTY }); setModal(true); }
  function abrirEditar(c: typeof contas[0]) {
    setEditGuid(c.guidConta);
    setForm({ conta: c.CONTA, banco: c.BANCO ?? "", agencia: c.AGENCIA ?? "", numeroConta: c.NUMEROCONTA ?? "", tipoConta: (c.TIPOCONTA as "C"|"P"|"X"|"O") ?? "C", saldoInicial: Number(c.SALDOINICIAL), situacao: (c.SITUACAO as "A"|"I") ?? "A" });
    setModal(true);
  }
  function salvar() {
    if (!form.conta.trim()) { toast.error("Informe o nome da conta."); return; }
    if (editGuid) {
      atualizar.mutate({ guidConta: editGuid, conta: form.conta, banco: form.banco || null, agencia: form.agencia || null, numeroConta: form.numeroConta || null, tipoConta: form.tipoConta, situacao: form.situacao });
    } else {
      criar.mutate({ conta: form.conta, banco: form.banco || null, agencia: form.agencia || null, numeroConta: form.numeroConta || null, tipoConta: form.tipoConta, saldoInicial: form.saldoInicial, situacao: form.situacao });
    }
  }

  const ativas = contas.filter(c => c.SITUACAO === "A");
  const totalSaldo = ativas.reduce((s, c) => s + (Number(c.SALDOATUAL) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contas Bancárias</h1>
          <p className="text-muted-foreground text-sm">Gerencie contas correntes, poupança e caixas</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="w-4 h-4 mr-2" />Nova Conta</Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-full sm:col-span-2 lg:col-span-1 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">R$ {totalSaldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        {ativas.map(c => (
          <Card key={c.guidConta} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => abrirEditar(c)}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{TIPO_ICON[c.TIPOCONTA] ?? TIPO_ICON.O}</span>
                <CardTitle className="text-sm truncate">{c.CONTA}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className={`text-xl font-semibold ${Number(c.SALDOATUAL) >= 0 ? "text-green-600" : "text-red-600"}`}>
                R$ {Number(c.SALDOATUAL).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{TIPO_LABEL[c.TIPOCONTA] ?? "Outro"}{c.BANCO ? ` · ${c.BANCO}` : ""}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Banco / Agência</TableHead>
                <TableHead>Nº Conta</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right">Saldo Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && contas.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma conta cadastrada.</TableCell></TableRow>
              )}
              {contas.map(c => (
                <TableRow key={c.guidConta}>
                  <TableCell className="font-medium">{c.CONTA}</TableCell>
                  <TableCell>{TIPO_LABEL[c.TIPOCONTA] ?? c.TIPOCONTA}</TableCell>
                  <TableCell className="text-muted-foreground">{[c.BANCO, c.AGENCIA].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.NUMEROCONTA || "—"}</TableCell>
                  <TableCell className="text-right">R$ {Number(c.SALDOINICIAL).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className={`text-right font-semibold ${Number(c.SALDOATUAL) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    R$ {Number(c.SALDOATUAL).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell><Badge variant={c.SITUACAO === "A" ? "default" : "secondary"}>{c.SITUACAO === "A" ? "Ativa" : "Inativa"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => abrirEditar(c)}><Pencil className="w-4 h-4" /></Button>
                      {c.SITUACAO === "A" && (
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Inativar esta conta?")) excluir.mutate({ guidConta: c.guidConta }); }}>
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editGuid ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Nome da Conta *</Label>
              <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value.toUpperCase() }))} placeholder="Ex: CAIXA GERAL" />
            </div>
            <div className="space-y-1">
              <Label>Tipo de Conta *</Label>
              <Select value={form.tipoConta} onValueChange={v => setForm(f => ({ ...f, tipoConta: v as "C"|"P"|"X"|"O" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="C">Corrente</SelectItem>
                  <SelectItem value="P">Poupança</SelectItem>
                  <SelectItem value="X">Caixa</SelectItem>
                  <SelectItem value="O">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Banco</Label>
              <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value.toUpperCase() }))} placeholder="Ex: BRADESCO" />
            </div>
            <div className="space-y-1">
              <Label>Agência</Label>
              <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000-0" />
            </div>
            <div className="space-y-1">
              <Label>Número da Conta</Label>
              <Input value={form.numeroConta} onChange={e => setForm(f => ({ ...f, numeroConta: e.target.value }))} placeholder="00000-0" />
            </div>
            {!editGuid && (
              <div className="space-y-1">
                <Label>Saldo Inicial (R$)</Label>
                <Input type="number" step="0.01" value={form.saldoInicial} onChange={e => setForm(f => ({ ...f, saldoInicial: parseFloat(e.target.value) || 0 }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Situação</Label>
              <Select value={form.situacao} onValueChange={v => setForm(f => ({ ...f, situacao: v as "A"|"I" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Ativa</SelectItem>
                  <SelectItem value="I">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || atualizar.isPending}>
              {(criar.isPending || atualizar.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

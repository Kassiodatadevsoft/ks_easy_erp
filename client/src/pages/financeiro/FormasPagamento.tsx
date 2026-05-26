import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2, CreditCard, Wifi, WifiOff, Search } from "lucide-react";
import { toast } from "sonner";

interface FormData {
  pagamento: string;
  descricao: string;
  codigoSefaz: string;
  integraTef: boolean;
  codigoTef: string;
  bandeiraTef: string;
  aceitaTroco: boolean;
  situacao: "A" | "I";
}

const FORM_INICIAL: FormData = {
  pagamento: "",
  descricao: "",
  codigoSefaz: "",
  integraTef: false,
  codigoTef: "",
  bandeiraTef: "",
  aceitaTroco: false,
  situacao: "A",
};

export default function FormasPagamento() {
  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("A");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(FORM_INICIAL);

  const utils = trpc.useUtils();
  const { data: sefazCodigos } = trpc.formasPagamento.codigosSefaz.useQuery();
  const { data: formas = [], isLoading } = trpc.formasPagamento.listar.useQuery({ busca: busca || undefined, situacao: situacaoFiltro !== "todos" ? situacaoFiltro : undefined });

  const criar = trpc.formasPagamento.criar.useMutation({
    onSuccess: () => { utils.formasPagamento.listar.invalidate(); toast.success("Forma de pagamento criada!"); fecharModal(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.formasPagamento.atualizar.useMutation({
    onSuccess: () => { utils.formasPagamento.listar.invalidate(); toast.success("Forma de pagamento atualizada!"); fecharModal(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.formasPagamento.excluir.useMutation({
    onSuccess: () => { utils.formasPagamento.listar.invalidate(); toast.success("Forma de pagamento inativada!"); },
    onError: (e) => toast.error(e.message),
  });

  function abrirNovo() { setForm(FORM_INICIAL); setEditando(null); setModalAberto(true); }
  function abrirEditar(fp: Record<string, unknown>) {
    setForm({
      pagamento: String(fp.PAGAMENTO ?? ""),
      descricao: String(fp.DESCRICAO ?? ""),
      codigoSefaz: String(fp.CODIGOSEFAZ ?? ""),
      integraTef: fp.INTEGRATEF === true || fp.INTEGRATEF === 1,
      codigoTef: String(fp.CODIGOTEF ?? ""),
      bandeiraTef: String(fp.BANDEIRATEF ?? ""),
      aceitaTroco: fp.ACEITATROCO === true || fp.ACEITATROCO === 1,
      situacao: (fp.SITUACAO as "A" | "I") ?? "A",
    });
    setEditando(String(fp.guidPagamento));
    setModalAberto(true);
  }
  function fecharModal() { setModalAberto(false); setEditando(null); setForm(FORM_INICIAL); }

  function handleSalvar() {
    if (!form.pagamento.trim()) { toast.error("Nome da forma de pagamento é obrigatório"); return; }
    const payload = {
      pagamento: form.pagamento,
      descricao: form.descricao || null,
      codigoSefaz: form.codigoSefaz || null,
      integraTef: form.integraTef,
      codigoTef: form.codigoTef || null,
      bandeiraTef: form.bandeiraTef || null,
      aceitaTroco: form.aceitaTroco,
      situacao: form.situacao,
    };
    if (editando) atualizar.mutate({ ...payload, guidPagamento: editando });
    else criar.mutate(payload);
  }

  const sefazLabel = (codigo: string) => {
    const item = sefazCodigos?.find(c => c.codigo === codigo);
    return item ? `${item.codigo} – ${item.descricao}` : codigo;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Formas de Pagamento
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Cadastro de meios de pagamento com código fiscal SEFAZ e integração TEF</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Nova Forma</Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={situacaoFiltro} onValueChange={setSituacaoFiltro}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="A">Ativas</SelectItem>
            <SelectItem value="I">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Código SEFAZ</TableHead>
              <TableHead className="text-center">TEF</TableHead>
              <TableHead className="text-center">Troco</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && formas.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma forma de pagamento cadastrada</TableCell></TableRow>
            )}
            {(formas as Record<string, unknown>[]).map((fp) => (
              <TableRow key={String(fp.guidPagamento)}>
                <TableCell className="font-medium">{String(fp.PAGAMENTO)}</TableCell>
                <TableCell>
                  {fp.CODIGOSEFAZ ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="font-mono">{String(fp.CODIGOSEFAZ)}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>{sefazLabel(String(fp.CODIGOSEFAZ))}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {fp.INTEGRATEF ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><Wifi className="h-4 w-4 text-green-500 mx-auto" /></TooltipTrigger>
                        <TooltipContent>Integra TEF{fp.BANDEIRATEF ? ` — ${fp.BANDEIRATEF}` : ""}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : <WifiOff className="h-4 w-4 text-muted-foreground mx-auto" />}
                </TableCell>
                <TableCell className="text-center">
                  {fp.ACEITATROCO ? <Badge variant="secondary" className="text-xs">Sim</Badge> : <span className="text-muted-foreground text-xs">Não</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={fp.SITUACAO === "A" ? "default" : "secondary"}>
                    {fp.SITUACAO === "A" ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => abrirEditar(fp)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Inativar esta forma de pagamento?")) excluir.mutate({ guidPagamento: String(fp.guidPagamento) }); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Forma de Pagamento" : "Nova Forma de Pagamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Nome <span className="text-destructive">*</span></Label>
                <Input placeholder="EX: DINHEIRO" value={form.pagamento}
                  onChange={e => setForm(f => ({ ...f, pagamento: e.target.value.toUpperCase() }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Input placeholder="Descrição opcional" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
            </div>

            {/* Código SEFAZ */}
            <div>
              <Label>Código Fiscal SEFAZ (NF-e)</Label>
              <Select value={form.codigoSefaz} onValueChange={v => setForm(f => ({ ...f, codigoSefaz: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o código fiscal..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Não informado —</SelectItem>
                  {sefazCodigos?.map(c => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      <span className="font-mono mr-2">{c.codigo}</span> {c.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Código utilizado na NF-e/NFC-e conforme tabela SEFAZ</p>
            </div>

            {/* TEF */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Integração TEF</Label>
                  <p className="text-xs text-muted-foreground">Transferência Eletrônica de Fundos</p>
                </div>
                <Switch checked={form.integraTef} onCheckedChange={v => setForm(f => ({ ...f, integraTef: v }))} />
              </div>
              {form.integraTef && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <Label className="text-xs">Código TEF</Label>
                    <Input placeholder="Ex: CREDITO" value={form.codigoTef}
                      onChange={e => setForm(f => ({ ...f, codigoTef: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Bandeira</Label>
                    <Input placeholder="Ex: VISA, MASTER" value={form.bandeiraTef}
                      onChange={e => setForm(f => ({ ...f, bandeiraTef: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Flags */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Aceita Troco</Label>
                  <p className="text-xs text-muted-foreground">PDV calcula troco</p>
                </div>
                <Switch checked={form.aceitaTroco} onCheckedChange={v => setForm(f => ({ ...f, aceitaTroco: v }))} />
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={form.situacao} onValueChange={v => setForm(f => ({ ...f, situacao: v as "A" | "I" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Ativa</SelectItem>
                    <SelectItem value="I">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={criar.isPending || atualizar.isPending}>
              {editando ? "Salvar Alterações" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

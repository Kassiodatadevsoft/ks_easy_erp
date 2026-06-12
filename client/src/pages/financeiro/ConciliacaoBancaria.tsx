import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Ban, CheckCircle2, FilePlus2, RotateCcw, Search, TriangleAlert } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string | null | undefined) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("pt-BR") : "-";

type Conta = { guidConta: string; CONTA: string };
type Extrato = {
  guidMovimento: string;
  dtMovimento: string;
  dtCompensacao: string | null;
  descricao: string;
  documento: string | null;
  tipo: string;
  valor: number;
  saldo: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  status: string;
  guidContaBancaria: string;
};
type Lanc = { origem: string; guidRegistro: string; data: string; documento: string | null; pessoa: string | null; descricao: string; valor: number; contaBancaria: string | null; status: string };

export default function ConciliacaoBancaria() {
  const utils = trpc.useUtils();
  const [guidConta, setGuidConta] = useState("TODOS");
  const [dtInicio, setDtInicio] = useState(primeiroDiaMes());
  const [dtFim, setDtFim] = useState(hoje());
  const [tipo, setTipo] = useState("TODOS");
  const [status, setStatus] = useState("PENDENTE");
  const [codFilial, setCodFilial] = useState("");
  const [valor, setValor] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [selecionado, setSelecionado] = useState<Extrato | null>(null);
  const [lancSelecionados, setLancSelecionados] = useState<Record<string, Lanc>>({});
  const [modalLancamento, setModalLancamento] = useState<Extrato | null>(null);
  const [novoLanc, setNovoLanc] = useState({ guidNatureza: "", guidCentro: "", descricao: "", observacao: "" });

  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const { data: naturezas = [] } = trpc.naturezaCaixa.listarTodas.useQuery();
  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();
  const params = {
    guidContaBancaria: guidConta !== "TODOS" ? guidConta : undefined,
    codFilial: codFilial ? Number(codFilial) : undefined,
    dtInicio, dtFim,
    tipo: tipo as "TODOS",
    status: status as "PENDENTE",
    valor: valor ? Number(valor) : undefined,
    busca: busca || undefined,
    page,
    pageSize: 50,
  };
  const { data, isLoading } = trpc.conciliacaoFinanceira.listarExtrato.useQuery(params);
  const { data: lancamentos = [] } = trpc.conciliacaoFinanceira.listarLancamentosSistema.useQuery({
    guidContaBancaria: selecionado?.guidContaBancaria,
    dtInicio: selecionado?.dtMovimento,
    dtFim: selecionado?.dtMovimento,
    valor: selecionado ? Math.abs(Number(selecionado.valor)) : undefined,
    busca: selecionado?.documento ?? undefined,
  }, { enabled: !!selecionado });
  const { data: sugestoes = [] } = trpc.conciliacaoFinanceira.sugestoes.useQuery(
    { guidMovimento: selecionado?.guidMovimento ?? "" },
    { enabled: !!selecionado },
  );

  const conciliar = trpc.conciliacaoFinanceira.conciliar.useMutation({
    onSuccess: () => { utils.conciliacaoFinanceira.listarExtrato.invalidate(); toast.success("Conciliação registrada."); setSelecionado(null); setLancSelecionados({}); },
    onError: (e) => toast.error(e.message),
  });
  const statusMov = trpc.conciliacaoFinanceira.atualizarStatusMovimento.useMutation({
    onSuccess: () => { utils.conciliacaoFinanceira.listarExtrato.invalidate(); toast.success("Status atualizado."); },
    onError: (e) => toast.error(e.message),
  });
  const criarLanc = trpc.conciliacaoFinanceira.criarLancamentoPorExtrato.useMutation({
    onSuccess: () => { utils.conciliacaoFinanceira.listarExtrato.invalidate(); utils.lancamentosCaixa.listar.invalidate(); toast.success("Lançamento criado."); setModalLancamento(null); },
    onError: (e) => toast.error(e.message),
  });

  const linhas = (data?.items ?? []) as Extrato[];
  const totalPaginas = Math.ceil((data?.total ?? 0) / 50);
  const lancs = (lancamentos as Lanc[]).length ? lancamentos as Lanc[] : sugestoes as Lanc[];

  function toggleLanc(l: Lanc) {
    setLancSelecionados((old) => {
      const next = { ...old };
      if (next[l.guidRegistro]) delete next[l.guidRegistro];
      else next[l.guidRegistro] = l;
      return next;
    });
  }

  function confirmarConciliacao() {
    if (!selecionado) return;
    const lancsSel = Object.values(lancSelecionados);
    if (!lancsSel.length) { toast.error("Selecione ao menos um lançamento do sistema."); return; }
    conciliar.mutate({
      guidMovimentos: [selecionado.guidMovimento],
      guidContaBancaria: selecionado.guidContaBancaria,
      lancamentos: lancsSel.map((l) => ({ origem: l.origem, guidRegistro: l.guidRegistro, valor: Number(l.valor) })),
      observacao: null,
    });
  }

  function exportarCsv() {
    const csv = ["Data;Descrição;Documento;Tipo;Valor;Status", ...linhas.map((l) => [l.dtMovimento, l.descricao, l.documento ?? "", l.tipo, l.valor, l.status].join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `conciliacao-bancaria-${hoje()}.csv`;
    a.click();
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground">Compare extratos importados com lançamentos financeiros.</p>
        </div>
        <Button variant="outline" onClick={exportarCsv}>Exportar CSV</Button>
      </div>

      <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-3">
        <div className="space-y-1 xl:col-span-2"><Label className="text-xs">Conta bancária</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todas</SelectItem>{(contas as Conta[]).map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Início</Label><Input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Fim</Label><Input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Tipo</Label><Select value={tipo} onValueChange={setTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TODOS","CREDITO","DEBITO","TARIFA","TRANSFERENCIA","PIX","BOLETO","CARTAO","OUTRO"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TODOS","PENDENTE","CONCILIADO","DIVERGENTE","IGNORADO","CANCELADO"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Filial</Label><Input value={codFilial} onChange={e => setCodFilial(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Valor</Label><Input value={valor} onChange={e => setValor(e.target.value)} /></div>
        <div className="space-y-1 xl:col-span-2"><Label className="text-xs">Histórico</Label><Input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === "Enter" && setPage(1)} /></div>
        <div className="flex items-end"><Button onClick={() => setPage(1)} className="w-full"><Search className="w-4 h-4 mr-2" />Pesquisar</Button></div>
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Doc.</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Banco</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8">Carregando...</TableCell></TableRow>}
          {!isLoading && !linhas.length && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum movimento encontrado.</TableCell></TableRow>}
          {linhas.map(l => <TableRow key={l.guidMovimento}>
            <TableCell>{dataBr(l.dtMovimento)}<div className="text-xs text-muted-foreground">{dataBr(l.dtCompensacao)}</div></TableCell>
            <TableCell className="min-w-72">{l.descricao}</TableCell>
            <TableCell>{l.documento ?? "-"}</TableCell>
            <TableCell>{l.tipo}</TableCell>
            <TableCell className={`text-right font-medium ${Number(l.valor) < 0 ? "text-red-600" : "text-emerald-700"}`}>{moeda(l.valor)}</TableCell>
            <TableCell className="text-right">{l.saldo == null ? "-" : moeda(l.saldo)}</TableCell>
            <TableCell>{l.banco ?? "-"}<div className="text-xs text-muted-foreground">{l.agencia ?? ""} {l.conta ?? ""}</div></TableCell>
            <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
            <TableCell><div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" title="Conciliar" onClick={() => { setSelecionado(l); setLancSelecionados({}); }}><CheckCircle2 className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" title="Criar lançamento" onClick={() => { setModalLancamento(l); setNovoLanc({ guidNatureza: "", guidCentro: "", descricao: l.descricao, observacao: "" }); }}><FilePlus2 className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" title="Ignorar" onClick={() => statusMov.mutate({ guidMovimento: l.guidMovimento, status: "IGNORADO" })}><Ban className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" title="Divergente" onClick={() => statusMov.mutate({ guidMovimento: l.guidMovimento, status: "DIVERGENTE", motivo: "OUTRO", observacao: "Marcado manualmente" })}><TriangleAlert className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" title="Desfazer" onClick={() => statusMov.mutate({ guidMovimento: l.guidMovimento, status: "PENDENTE" })}><RotateCcw className="w-4 h-4" /></Button>
            </div></TableCell>
          </TableRow>)}
        </TableBody>
      </Table></CardContent></Card>
      {totalPaginas > 1 && <div className="flex justify-end gap-2 text-sm"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="py-2">{page}/{totalPaginas}</span><Button variant="outline" size="sm" disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)}>Próxima</Button></div>}

      <Dialog open={!!selecionado} onOpenChange={open => !open && setSelecionado(null)}>
        <DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Conciliar movimento</DialogTitle></DialogHeader>
          {selecionado && <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm"><strong>{moeda(selecionado.valor)}</strong> · {selecionado.descricao}<div className="text-muted-foreground">{dataBr(selecionado.dtMovimento)} · {selecionado.documento ?? "sem documento"}</div></div>
            <Table><TableHeader><TableRow><TableHead></TableHead><TableHead>Data</TableHead><TableHead>Origem</TableHead><TableHead>Documento</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>
              {lancs.map(l => <TableRow key={l.guidRegistro} onClick={() => toggleLanc(l)} className="cursor-pointer">
                <TableCell><input type="checkbox" checked={!!lancSelecionados[l.guidRegistro]} readOnly /></TableCell>
                <TableCell>{dataBr(l.data)}</TableCell><TableCell>{l.origem}</TableCell><TableCell>{l.documento ?? "-"}</TableCell><TableCell>{l.descricao}</TableCell><TableCell className="text-right">{moeda(l.valor)}</TableCell>
              </TableRow>)}
              {!lancs.length && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Nenhum lançamento compatível encontrado.</TableCell></TableRow>}
            </TableBody></Table>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSelecionado(null)}>Cancelar</Button><Button onClick={confirmarConciliacao}>Conciliar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalLancamento} onOpenChange={open => !open && setModalLancamento(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Criar lançamento pelo extrato</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1"><Label>Descrição</Label><Input value={novoLanc.descricao} onChange={e => setNovoLanc(f => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Natureza</Label><Select value={novoLanc.guidNatureza} onValueChange={v => setNovoLanc(f => ({ ...f, guidNatureza: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(naturezas as Array<{guidNatureza:string;NATUREZA:string}>).map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label>Centro</Label><Select value={novoLanc.guidCentro} onValueChange={v => setNovoLanc(f => ({ ...f, guidCentro: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(centros as Array<{guidCentro:string;CENTRO:string}>).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO}</SelectItem>)}</SelectContent></Select></div>
            <div className="sm:col-span-2 space-y-1"><Label>Observação</Label><Textarea value={novoLanc.observacao} onChange={e => setNovoLanc(f => ({ ...f, observacao: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setModalLancamento(null)}>Cancelar</Button><Button onClick={() => modalLancamento && criarLanc.mutate({ guidMovimento: modalLancamento.guidMovimento, ...novoLanc })}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileInput, RotateCcw, Search, XCircle } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

type StatusConciliacao = "PENDENTE" | "CONCILIADO" | "DIVERGENTE" | "CANCELADO";
type LinhaConciliacao = {
  guidPagamento: string;
  guidParcela: string;
  codFilial: number | null;
  cliente: string | null;
  numeroVenda: string | null;
  formaPagamento: string | null;
  tipo: "CREDITO" | "DEBITO" | "PIX";
  adquirente: string | null;
  bandeira: string | null;
  nsu: string | null;
  autorizacao: string | null;
  txid: string | null;
  e2eId: string | null;
  parcelas: number;
  numeroParcela: number;
  valorBruto: number;
  taxa: number;
  valorLiquidoPrevisto: number;
  valorRecebido: number | null;
  diferenca: number | null;
  status: StatusConciliacao;
  dataVenda: string;
  previsaoRecebimento: string;
  dataRecebimento: string | null;
  contaBancaria: string | null;
};

type ContaBancaria = { guidConta: string; CONTA: string };
type FormaPagamento = { guidPagamento: string; PAGAMENTO: string; CODIGOSEFAZ?: string | null };

const statusBadge: Record<StatusConciliacao, string> = {
  PENDENTE: "bg-amber-100 text-amber-800 border-amber-200",
  CONCILIADO: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DIVERGENTE: "bg-red-100 text-red-800 border-red-200",
  CANCELADO: "bg-slate-100 text-slate-700 border-slate-200",
};

const motivoLabels = {
  TAXA_DIFERENTE: "Taxa diferente",
  VALOR_RECEBIDO_MENOR: "Valor recebido menor",
  VALOR_RECEBIDO_MAIOR: "Valor recebido maior",
  VENDA_CANCELADA: "Venda cancelada",
  CHARGEBACK: "Chargeback",
  ERRO_OPERACIONAL: "Erro operacional",
  OUTRO: "Outro",
} as const;

function moeda(valor: number | null | undefined) {
  return Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(data: string | null | undefined) {
  if (!data) return "-";
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ConciliacaoCartoesPix() {
  const utils = trpc.useUtils();
  const [dtVendaInicio, setDtVendaInicio] = useState(primeiroDiaMes());
  const [dtVendaFim, setDtVendaFim] = useState(hoje());
  const [dtPrevInicio, setDtPrevInicio] = useState("");
  const [dtPrevFim, setDtPrevFim] = useState("");
  const [guidPagamentoForma, setGuidPagamentoForma] = useState("TODOS");
  const [adquirente, setAdquirente] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [status, setStatus] = useState<StatusConciliacao | "TODOS">("PENDENTE");
  const [codFilial, setCodFilial] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [linhaConciliar, setLinhaConciliar] = useState<LinhaConciliacao | null>(null);
  const [linhaDivergir, setLinhaDivergir] = useState<LinhaConciliacao | null>(null);
  const [conciliacao, setConciliacao] = useState({
    dtRecebimento: hoje(),
    valorRecebido: "",
    taxa: "",
    valorLiquido: "",
    guidContaBancaria: "",
    observacao: "",
  });
  const [divergencia, setDivergencia] = useState({
    motivo: "TAXA_DIFERENTE" as keyof typeof motivoLabels,
    observacao: "",
  });

  const params = {
    dtVendaInicio: dtVendaInicio || undefined,
    dtVendaFim: dtVendaFim || undefined,
    dtPrevInicio: dtPrevInicio || undefined,
    dtPrevFim: dtPrevFim || undefined,
    guidPagamentoForma: guidPagamentoForma !== "TODOS" ? guidPagamentoForma : undefined,
    adquirente: adquirente || undefined,
    bandeira: bandeira || undefined,
    status,
    codFilial: codFilial.trim() ? Number(codFilial) : undefined,
    busca: busca || undefined,
    page,
    pageSize: 50,
  };

  const { data, isLoading } = trpc.conciliacao.listar.useQuery(params);
  const { data: totais } = trpc.conciliacao.totais.useQuery();
  const { data: formas = [] } = trpc.formasPagamento.listarTodas.useQuery();
  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();

  const linhas = (data?.items ?? []) as LinhaConciliacao[];
  const totalPaginas = Math.ceil((data?.total ?? 0) / 50);

  const conciliar = trpc.conciliacao.conciliar.useMutation({
    onSuccess: (r) => {
      utils.conciliacao.listar.invalidate();
      utils.conciliacao.totais.invalidate();
      utils.contasBancarias.listarTodas.invalidate();
      utils.contasReceber.listar.invalidate();
      toast.success(r.status === "DIVERGENTE" ? "Pagamento conciliado com divergencia." : "Pagamento conciliado.");
      setLinhaConciliar(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const marcarDivergencia = trpc.conciliacao.marcarDivergencia.useMutation({
    onSuccess: () => {
      utils.conciliacao.listar.invalidate();
      utils.conciliacao.totais.invalidate();
      toast.success("Divergencia registrada.");
      setLinhaDivergir(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const desfazer = trpc.conciliacao.desfazer.useMutation({
    onSuccess: () => {
      utils.conciliacao.listar.invalidate();
      utils.conciliacao.totais.invalidate();
      utils.contasBancarias.listarTodas.invalidate();
      utils.contasReceber.listar.invalidate();
      toast.success("Conciliação desfeita.");
    },
    onError: (e) => toast.error(e.message),
  });

  const totaisTela = useMemo(() => ({
    pendente: Number(totais?.pendente ?? 0),
    conciliado: Number(totais?.conciliado ?? 0),
    divergente: Number(totais?.divergente ?? 0),
    qtdPendente: Number(totais?.qtdPendente ?? 0),
  }), [totais]);

  function pesquisar() {
    setBusca(buscaInput);
    setPage(1);
  }

  function abrirConciliacao(linha: LinhaConciliacao) {
    setLinhaConciliar(linha);
    const valorRecebido = Number(linha.valorRecebido ?? linha.valorBruto);
    const taxa = Number(linha.taxa ?? 0);
    setConciliacao({
      dtRecebimento: linha.dataRecebimento ?? hoje(),
      valorRecebido: valorRecebido.toFixed(2),
      taxa: taxa.toFixed(2),
      valorLiquido: Number(linha.valorLiquidoPrevisto ?? (valorRecebido - taxa)).toFixed(2),
      guidContaBancaria: "",
      observacao: "",
    });
  }

  function salvarConciliacao() {
    if (!linhaConciliar) return;
    const valorRecebido = Number(conciliacao.valorRecebido);
    const taxa = Number(conciliacao.taxa);
    const valorLiquido = Number(conciliacao.valorLiquido);
    if (!conciliacao.dtRecebimento) { toast.error("Informe a data de recebimento."); return; }
    if (!valorRecebido || valorRecebido <= 0) { toast.error("Informe o valor recebido."); return; }
    if (taxa < 0) { toast.error("A taxa não pode ser negativa."); return; }
    if (valorLiquido < 0) { toast.error("Informe o valor líquido."); return; }
    if (!conciliacao.guidContaBancaria) { toast.error("Selecione a conta bancária."); return; }
    conciliar.mutate({
      guidParcela: linhaConciliar.guidParcela,
      dtRecebimento: conciliacao.dtRecebimento,
      valorRecebido,
      taxa,
      valorLiquido,
      guidContaBancaria: conciliacao.guidContaBancaria,
      observacao: conciliacao.observacao || null,
    });
  }

  function salvarDivergencia() {
    if (!linhaDivergir) return;
    if (!divergencia.observacao.trim()) { toast.error("Informe a observação da divergência."); return; }
    marcarDivergencia.mutate({
      guidParcela: linhaDivergir.guidParcela,
      motivo: divergencia.motivo,
      observacao: divergencia.observacao,
    });
  }

  function exportarCsv() {
    const header = ["Data venda", "Cliente", "Venda", "Forma", "Adquirente", "Bandeira", "NSU", "Autorizacao", "Bruto", "Taxa", "Liquido previsto", "Recebido", "Diferenca", "Status"];
    const body = linhas.map(l => [
      l.dataVenda, l.cliente, l.numeroVenda, l.formaPagamento, l.adquirente, l.bandeira,
      l.nsu, l.autorizacao, l.valorBruto, l.taxa, l.valorLiquidoPrevisto, l.valorRecebido, l.diferenca, l.status,
    ]);
    const csv = [header, ...body].map(row => row.map(csvValue).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacao-cartoes-pix-${hoje()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação de Cartões e PIX</h1>
          <p className="text-sm text-muted-foreground">Conferência dos recebimentos por adquirente, gateway e banco.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarCsv} disabled={!linhas.length}><Download className="w-4 h-4 mr-2" />Exportar</Button>
          <Button variant="outline" disabled><FileInput className="w-4 h-4 mr-2" />Importar extrato</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pendente</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-amber-700">{moeda(totaisTela.pendente)}</p><p className="text-xs text-muted-foreground">{totaisTela.qtdPendente} parcelas</p></CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Conciliado</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-emerald-700">{moeda(totaisTela.conciliado)}</p></CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Diferenças</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-red-700">{moeda(totaisTela.divergente)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Consulta Atual</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{data?.total ?? 0}</p><p className="text-xs text-muted-foreground">registros encontrados</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Venda início</Label>
              <Input type="date" value={dtVendaInicio} onChange={e => setDtVendaInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Venda fim</Label>
              <Input type="date" value={dtVendaFim} onChange={e => setDtVendaFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Previsão início</Label>
              <Input type="date" value={dtPrevInicio} onChange={e => setDtPrevInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Previsão fim</Label>
              <Input type="date" value={dtPrevFim} onChange={e => setDtPrevFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Forma</Label>
              <Select value={guidPagamentoForma} onValueChange={setGuidPagamentoForma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todas</SelectItem>
                  {(formas as FormaPagamento[]).map(f => <SelectItem key={f.guidPagamento} value={f.guidPagamento}>{f.PAGAMENTO}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as StatusConciliacao | "TODOS")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="CONCILIADO">Conciliado</SelectItem>
                  <SelectItem value="DIVERGENTE">Divergente</SelectItem>
                  <SelectItem value="CANCELADO">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Adquirente</Label>
              <Input value={adquirente} onChange={e => setAdquirente(e.target.value)} placeholder="Cielo, Rede..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bandeira</Label>
              <Input value={bandeira} onChange={e => setBandeira(e.target.value)} placeholder="Visa, PIX..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Filial</Label>
              <Input type="number" value={codFilial} onChange={e => setCodFilial(e.target.value)} placeholder="Código" />
            </div>
            <div className="space-y-1 sm:col-span-2 xl:col-span-2">
              <Label className="text-xs">Busca</Label>
              <Input value={buscaInput} onChange={e => setBuscaInput(e.target.value)} onKeyDown={e => e.key === "Enter" && pesquisar()} placeholder="Cliente, venda, NSU, autorização, TXID ou E2E ID" />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={pesquisar}><Search className="w-4 h-4 mr-2" />Pesquisar</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>NSU/Auth</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Previsto</TableHead>
                <TableHead className="text-right">Recebido</TableHead>
                <TableHead className="text-right">Dif.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-36"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && linhas.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow>}
              {linhas.map(linha => (
                <TableRow key={linha.guidParcela}>
                  <TableCell className="min-w-32">
                    <div className="font-medium">{dataBr(linha.dataVenda)}</div>
                    <div className="text-xs text-muted-foreground">{linha.numeroVenda ?? "-"} · Parc. {linha.numeroParcela}/{linha.parcelas}</div>
                    <div className="text-xs text-muted-foreground">Prev. {dataBr(linha.previsaoRecebimento)}</div>
                  </TableCell>
                  <TableCell className="min-w-40">{linha.cliente ?? "-"}</TableCell>
                  <TableCell className="min-w-44">
                    <div className="font-medium">{linha.formaPagamento ?? linha.tipo}</div>
                    <div className="text-xs text-muted-foreground">{linha.adquirente ?? "-"} · {linha.bandeira ?? "-"}</div>
                  </TableCell>
                  <TableCell className="min-w-36 text-xs text-muted-foreground">
                    <div>{linha.tipo === "PIX" ? (linha.txid ?? linha.e2eId ?? "-") : (linha.nsu ?? "-")}</div>
                    <div>{linha.autorizacao ?? "-"}</div>
                  </TableCell>
                  <TableCell className="text-right">{moeda(linha.valorBruto)}</TableCell>
                  <TableCell className="text-right">{moeda(linha.taxa)}</TableCell>
                  <TableCell className="text-right font-medium">{moeda(linha.valorLiquidoPrevisto)}</TableCell>
                  <TableCell className="text-right">{linha.valorRecebido == null ? "-" : moeda(linha.valorRecebido)}</TableCell>
                  <TableCell className={`text-right ${Number(linha.diferenca ?? 0) === 0 ? "" : "text-red-600 font-semibold"}`}>{linha.diferenca == null ? "-" : moeda(linha.diferenca)}</TableCell>
                  <TableCell><Badge variant="outline" className={statusBadge[linha.status]}>{linha.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Conciliar" disabled={linha.status === "CONCILIADO"} onClick={() => abrirConciliacao(linha)}><CheckCircle2 className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" title="Marcar divergência" disabled={linha.status === "CONCILIADO"} onClick={() => { setLinhaDivergir(linha); setDivergencia({ motivo: "TAXA_DIFERENTE", observacao: "" }); }}><AlertTriangle className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" title="Desfazer conciliação" disabled={linha.status === "PENDENTE"} onClick={() => { if (confirm("Desfazer a conciliação deste pagamento?")) desfazer.mutate({ guidParcela: linha.guidParcela }); }}><RotateCcw className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total ?? 0} registros</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <span className="px-2 py-1">{page}/{totalPaginas}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPaginas} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      <Dialog open={!!linhaConciliar} onOpenChange={open => !open && setLinhaConciliar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Conciliar pagamento</DialogTitle></DialogHeader>
          {linhaConciliar && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <div className="sm:col-span-2 rounded-md border p-3 text-sm">
                <div className="font-medium">{linhaConciliar.cliente ?? "Cliente não informado"}</div>
                <div className="text-muted-foreground">{linhaConciliar.formaPagamento ?? linhaConciliar.tipo} · {moeda(linhaConciliar.valorLiquidoPrevisto)} previsto</div>
              </div>
              <div className="space-y-1">
                <Label>Data do recebimento *</Label>
                <Input type="date" value={conciliacao.dtRecebimento} onChange={e => setConciliacao(f => ({ ...f, dtRecebimento: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Valor recebido *</Label>
                <Input type="number" step="0.01" value={conciliacao.valorRecebido} onChange={e => setConciliacao(f => ({ ...f, valorRecebido: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Taxa cobrada</Label>
                <Input type="number" step="0.01" value={conciliacao.taxa} onChange={e => setConciliacao(f => ({ ...f, taxa: e.target.value, valorLiquido: (Number(f.valorRecebido || 0) - Number(e.target.value || 0)).toFixed(2) }))} />
              </div>
              <div className="space-y-1">
                <Label>Valor líquido *</Label>
                <Input type="number" step="0.01" value={conciliacao.valorLiquido} onChange={e => setConciliacao(f => ({ ...f, valorLiquido: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Conta bancária *</Label>
                <Select value={conciliacao.guidContaBancaria} onValueChange={v => setConciliacao(f => ({ ...f, guidContaBancaria: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta de recebimento" /></SelectTrigger>
                  <SelectContent>
                    {(contas as ContaBancaria[]).map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Observação</Label>
                <Textarea value={conciliacao.observacao} onChange={e => setConciliacao(f => ({ ...f, observacao: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinhaConciliar(null)}>Cancelar</Button>
            <Button onClick={salvarConciliacao} disabled={conciliar.isPending}>{conciliar.isPending ? "Salvando..." : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linhaDivergir} onOpenChange={open => !open && setLinhaDivergir(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Marcar divergência</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Motivo *</Label>
              <Select value={divergencia.motivo} onValueChange={v => setDivergencia(f => ({ ...f, motivo: v as keyof typeof motivoLabels }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(motivoLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observação *</Label>
              <Textarea value={divergencia.observacao} onChange={e => setDivergencia(f => ({ ...f, observacao: e.target.value }))} placeholder="Descreva a diferença encontrada" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinhaDivergir(null)}><XCircle className="w-4 h-4 mr-2" />Cancelar</Button>
            <Button onClick={salvarDivergencia} disabled={marcarDivergencia.isPending}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

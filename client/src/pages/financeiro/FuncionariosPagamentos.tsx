import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Banknote, CalendarCheck, CheckCircle, FileText, Plus, Search, XCircle } from "lucide-react";

type TipoMovimento = "SALARIO" | "COMISSAO" | "VALE";

type Funcionario = {
  guidFuncionario: string;
  CODIGO: number;
  NOME: string;
  DOCUMENTO: string;
  cargo: string | null;
};

type Movimento = {
  guidMovimento: string;
  guidFuncionario: string;
  nomeFuncionario: string;
  TIPO: TipoMovimento;
  DESCRICAO: string;
  VALOR: number;
  dataMovimento: string;
  COMPETENCIA: string;
  STATUS: string;
  guidLancCaixa: string | null;
  guidContaCaixa: string | null;
  nomeContaCaixa: string | null;
  nomeNatureza: string | null;
  nomeCentro: string | null;
};

type Fechamento = {
  guidFechamento: string;
  COMPETENCIA: string;
  dtInicio: string;
  dtFim: string;
  dtVencimento: string;
  TOTALSALARIO: number;
  TOTALCOMISSAO: number;
  TOTALVALE: number;
  TOTALLIQUIDO: number;
  STATUS: string;
  qtdFuncionarios: number;
  funcionarios: string | null;
};

type Historico = {
  COMPETENCIA: string;
  nomeFuncionario: string;
  TOTALSALARIO: number;
  TOTALCOMISSAO: number;
  TOTALVALE: number;
  VALORLIQUIDO: number;
  statusPagamento: string | null;
  dtVencimento: string | null;
  dtPagamento: string | null;
  VALORPAGO: number | null;
};

function hoje() { return new Date().toISOString().slice(0, 10); }
function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesInicio(comp: string) { return `${comp}-01`; }
function mesFim(comp: string) {
  const [ano, mes] = comp.split("-").map(Number);
  return `${comp}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
}
function fmt(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR");
}

const tipoLabel: Record<TipoMovimento, string> = {
  SALARIO: "Salário",
  COMISSAO: "Comissão",
  VALE: "Vale",
};

const tipoClass: Record<TipoMovimento, string> = {
  SALARIO: "text-blue-500 border-blue-500/30",
  COMISSAO: "text-emerald-500 border-emerald-500/30",
  VALE: "text-orange-500 border-orange-500/30",
};

const movimentoInicial = {
  guidFuncionario: "",
  tipo: "SALARIO" as TipoMovimento,
  descricao: "",
  valor: 0,
  dataMovimento: hoje(),
  competencia: competenciaAtual(),
  observacao: "",
  guidContaCaixa: "",
  guidNatureza: "",
  guidCentro: "",
};

const fechamentoInicial = {
  competencia: competenciaAtual(),
  dtInicio: mesInicio(competenciaAtual()),
  dtFim: mesFim(competenciaAtual()),
  dtVencimento: hoje(),
  guidNatureza: "",
  guidConta: "",
  guidCentro: "",
  observacao: "",
};

export default function FuncionariosPagamentos() {
  const [aba, setAba] = useState("movimentos");
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("ABERTO");
  const [busca, setBusca] = useState("");
  const [modalMovimento, setModalMovimento] = useState(false);
  const [modalFechamento, setModalFechamento] = useState(false);
  const [movimento, setMovimento] = useState(movimentoInicial);
  const [fechamento, setFechamento] = useState(fechamentoInicial);
  const [cancelando, setCancelando] = useState<Movimento | null>(null);
  const [motivo, setMotivo] = useState("");
  const utils = trpc.useUtils();

  const { data: funcionarios = [] } = trpc.funcionariosPagamentos.listarFuncionarios.useQuery();
  const { data: resumo } = trpc.funcionariosPagamentos.resumo.useQuery({ competencia });
  const { data: movimentos = [], isLoading: loadingMovimentos } = trpc.funcionariosPagamentos.listarMovimentos.useQuery({
    competencia,
    tipo: tipoFiltro !== "todos" ? tipoFiltro as TipoMovimento : undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    busca: busca || undefined,
  });
  const { data: fechamentos = [] } = trpc.funcionariosPagamentos.listarFechamentos.useQuery({ competencia });
  const { data: historico = [] } = trpc.funcionariosPagamentos.historicoPagamentos.useQuery({ competencia });
  const { data: naturezas = [] } = trpc.naturezaCaixa.listarTodas.useQuery({ tipo: "D" });
  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();
  const { data: contas = [] } = trpc.planoContas.listarTodas.useQuery();
  const { data: contasBancarias = [] } = trpc.contasBancarias.listarTodas.useQuery();

  const criarMovimento = trpc.funcionariosPagamentos.criarMovimento.useMutation({
    onSuccess: () => {
      utils.funcionariosPagamentos.listarMovimentos.invalidate();
      utils.funcionariosPagamentos.resumo.invalidate();
      utils.contasBancarias.listarTodas.invalidate();
      utils.lancamentosCaixa.listar.invalidate();
      toast.success("Registro salvo.");
      setModalMovimento(false);
      setMovimento(movimentoInicial);
    },
    onError: e => toast.error(e.message),
  });
  const cancelarMovimento = trpc.funcionariosPagamentos.cancelarMovimento.useMutation({
    onSuccess: () => {
      utils.funcionariosPagamentos.listarMovimentos.invalidate();
      utils.funcionariosPagamentos.resumo.invalidate();
      utils.contasBancarias.listarTodas.invalidate();
      utils.lancamentosCaixa.listar.invalidate();
      toast.success("Registro cancelado.");
      setCancelando(null);
      setMotivo("");
    },
    onError: e => toast.error(e.message),
  });
  const fecharMes = trpc.funcionariosPagamentos.fecharMes.useMutation({
    onSuccess: r => {
      utils.funcionariosPagamentos.invalidate();
      toast.success(`Fechamento criado para ${r.totalFuncionarios} funcionário(s).`);
      setModalFechamento(false);
      setFechamento(fechamentoInicial);
      setAba("fechamentos");
    },
    onError: e => toast.error(e.message),
  });

  const movimentosLista = movimentos as Movimento[];
  const funcionariosLista = funcionarios as Funcionario[];
  const fechamentosLista = fechamentos as Fechamento[];
  const historicoLista = historico as Historico[];

  const funcionarioSelecionado = useMemo(
    () => funcionariosLista.find(f => f.guidFuncionario === movimento.guidFuncionario),
    [funcionariosLista, movimento.guidFuncionario]
  );

  function abrirMovimento(tipo?: TipoMovimento) {
    setMovimento({ ...movimentoInicial, tipo: tipo ?? "SALARIO", competencia, dataMovimento: hoje() });
    setModalMovimento(true);
  }

  function salvarMovimento() {
    if (!movimento.guidFuncionario) { toast.error("Selecione o funcionário"); return; }
    if (!movimento.descricao.trim()) { toast.error("Informe a descrição"); return; }
    if (!movimento.valor || movimento.valor <= 0) { toast.error("Informe o valor"); return; }
    if (!movimento.competencia) { toast.error("Informe a competência"); return; }
    if (movimento.tipo === "VALE") {
      if (!movimento.guidContaCaixa) { toast.error("Selecione a conta/caixa de saida"); return; }
      if (!movimento.guidNatureza) { toast.error("Selecione a natureza de caixa"); return; }
      if (!movimento.guidCentro) { toast.error("Selecione o centro de custo"); return; }
    }
    criarMovimento.mutate({
      ...movimento,
      guidContaCaixa: movimento.tipo === "VALE" ? movimento.guidContaCaixa : null,
      guidNatureza: movimento.tipo === "VALE" ? movimento.guidNatureza : null,
      guidCentro: movimento.tipo === "VALE" ? movimento.guidCentro : null,
    });
  }

  function abrirFechamento() {
    setFechamento({
      ...fechamentoInicial,
      competencia,
      dtInicio: mesInicio(competencia),
      dtFim: mesFim(competencia),
    });
    setModalFechamento(true);
  }

  function confirmarFechamento() {
    if (!fechamento.guidNatureza) { toast.error("Selecione a natureza de caixa"); return; }
    if (!fechamento.guidCentro) { toast.error("Selecione o centro de custo"); return; }
    if (!fechamento.guidConta) { toast.error("Selecione a conta do plano de contas"); return; }
    fecharMes.mutate(fechamento);
  }

  function confirmarCancelamento() {
    if (!cancelando) return;
    if (!motivo.trim()) { toast.error("Informe o motivo do cancelamento"); return; }
    cancelarMovimento.mutate({ guidMovimento: cancelando.guidMovimento, motivo });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10"><Banknote className="h-6 w-6 text-blue-500" /></div>
          <div>
            <h1 className="text-2xl font-bold">Funcionários e Pagamentos</h1>
            <p className="text-sm text-muted-foreground">Salários, comissões, vales e fechamento mensal</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => abrirMovimento("VALE")} className="gap-2"><Plus className="h-4 w-4" /> Vale</Button>
          <Button variant="outline" onClick={() => abrirMovimento("COMISSAO")} className="gap-2"><Plus className="h-4 w-4" /> Comissão</Button>
          <Button onClick={() => abrirMovimento("SALARIO")} className="gap-2"><Plus className="h-4 w-4" /> Salário</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Salários", value: resumo?.salario ?? 0, cls: "text-blue-500" },
          { label: "Comissões", value: resumo?.comissao ?? 0, cls: "text-emerald-500" },
          { label: "Vales", value: resumo?.vale ?? 0, cls: "text-orange-500" },
          { label: "Líquido", value: resumo?.liquido ?? 0, cls: "text-foreground" },
        ].map(item => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-card p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-xl font-bold font-mono ${item.cls}`}>{fmt(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário ou descrição..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
        </div>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="SALARIO">Salário</SelectItem>
            <SelectItem value="COMISSAO">Comissão</SelectItem>
            <SelectItem value="VALE">Vale</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            <SelectItem value="ABERTO">Aberto</SelectItem>
            <SelectItem value="FECHADO">Fechado</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="movimentos">Registros</TabsTrigger>
          <TabsTrigger value="fechamentos">Fechamento mensal</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="movimentos" className="mt-4">
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground text-xs">
                    <th className="px-4 py-3 text-left">Funcionário</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Descrição</th>
                    <th className="px-4 py-3 text-left">Conta/Caixa</th>
                    <th className="px-4 py-3 text-center">Data</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingMovimentos ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
                  ) : movimentosLista.length === 0 ? (
                    <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>
                  ) : movimentosLista.map(m => (
                    <tr key={m.guidMovimento} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{m.nomeFuncionario}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={tipoClass[m.TIPO]}>{tipoLabel[m.TIPO]}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{m.DESCRICAO}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.TIPO === "VALE" ? (m.nomeContaCaixa ?? "-") : "-"}</td>
                      <td className="px-4 py-3 text-center text-xs">{fmtDate(m.dataMovimento)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(m.VALOR)}</td>
                      <td className="px-4 py-3 text-center"><Badge variant="outline">{m.STATUS}</Badge></td>
                      <td className="px-4 py-3 text-center">
                        {m.STATUS === "ABERTO" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500" title="Cancelar" onClick={() => setCancelando(m)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="fechamentos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={abrirFechamento} className="gap-2"><CalendarCheck className="h-4 w-4" /> Fechar competência</Button>
          </div>
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-left">Competência</th>
                  <th className="px-4 py-3 text-center">Período</th>
                  <th className="px-4 py-3 text-right">Vales</th>
                  <th className="px-4 py-3 text-right">Líquido</th>
                  <th className="px-4 py-3 text-left">Funcionários</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {fechamentosLista.length === 0 ? (
                  <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhum fechamento encontrado</td></tr>
                ) : fechamentosLista.map(f => (
                  <tr key={f.guidFechamento} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-medium">{f.COMPETENCIA}</td>
                    <td className="px-4 py-3 text-center text-xs">{fmtDate(f.dtInicio)} até {fmtDate(f.dtFim)}</td>
                    <td className="px-4 py-3 text-right font-mono text-orange-500">{fmt(f.TOTALVALE)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(f.TOTALLIQUIDO)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm">{f.funcionarios ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{f.qtdFuncionarios} funcionário(s)</p>
                    </td>
                    <td className="px-4 py-3 text-center"><Badge variant="outline">{f.STATUS}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Histórico de pagamentos e relatório de vales</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground text-xs">
                    <th className="px-4 py-3 text-left">Funcionário</th>
                    <th className="px-4 py-3 text-right">Salário</th>
                    <th className="px-4 py-3 text-right">Comissão</th>
                    <th className="px-4 py-3 text-right">Vales</th>
                    <th className="px-4 py-3 text-right">Líquido</th>
                    <th className="px-4 py-3 text-center">Pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {historicoLista.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">Nenhum histórico encontrado</td></tr>
                  ) : historicoLista.map((h, index) => (
                    <tr key={`${h.COMPETENCIA}-${h.nomeFuncionario}-${index}`} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{h.nomeFuncionario}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(h.TOTALSALARIO)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-500">{fmt(h.TOTALCOMISSAO)}</td>
                      <td className="px-4 py-3 text-right font-mono text-orange-500">{fmt(h.TOTALVALE)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(h.VALORLIQUIDO)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline">{h.statusPagamento ?? "SEM TÍTULO"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={modalMovimento} onOpenChange={setModalMovimento}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Novo registro</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Funcionário *</Label>
              <Select value={movimento.guidFuncionario || "none"} onValueChange={v => setMovimento(m => ({ ...m, guidFuncionario: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione o funcionário</SelectItem>
                  {funcionariosLista.map(f => <SelectItem key={f.guidFuncionario} value={f.guidFuncionario}>{f.NOME}</SelectItem>)}
                </SelectContent>
              </Select>
              {funcionarioSelecionado?.cargo && <p className="text-xs text-muted-foreground">{funcionarioSelecionado.cargo}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={movimento.tipo} onValueChange={v => setMovimento(m => ({ ...m, tipo: v as TipoMovimento }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALARIO">Salário</SelectItem>
                  <SelectItem value="COMISSAO">Comissão</SelectItem>
                  <SelectItem value="VALE">Vale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Competência *</Label>
              <Input type="month" value={movimento.competencia} onChange={e => setMovimento(m => ({ ...m, competencia: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" value={movimento.dataMovimento} onChange={e => setMovimento(m => ({ ...m, dataMovimento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input type="number" min={0} step={0.01} value={movimento.valor} onChange={e => setMovimento(m => ({ ...m, valor: Number(e.target.value) }))} />
            </div>
            {movimento.tipo === "VALE" && (
              <>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Conta/Caixa de saida *</Label>
                  <Select value={movimento.guidContaCaixa || "none"} onValueChange={v => setMovimento(m => ({ ...m, guidContaCaixa: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a conta/caixa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione a conta/caixa</SelectItem>
                      {(contasBancarias as Array<{guidConta:string;CONTA:string;CODCONTA?:string;SALDOATUAL:number}>).map(c => (
                        <SelectItem key={c.guidConta} value={c.guidConta}>{c.CODCONTA ? `${c.CODCONTA} - ` : ""}{c.CONTA} - {fmt(c.SALDOATUAL)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Natureza de Caixa *</Label>
                  <Select value={movimento.guidNatureza || "none"} onValueChange={v => setMovimento(m => ({ ...m, guidNatureza: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione uma natureza</SelectItem>
                      {(naturezas as Array<{guidNatureza:string;NATUREZA:string}>).map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Centro de Custo *</Label>
                  <Select value={movimento.guidCentro || "none"} onValueChange={v => setMovimento(m => ({ ...m, guidCentro: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione um centro</SelectItem>
                      {(centros as Array<{guidCentro:string;CENTRO:string}>).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={movimento.descricao} onChange={e => setMovimento(m => ({ ...m, descricao: e.target.value.toUpperCase() }))} placeholder="EX: SALÁRIO MENSAL" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Observação</Label>
              <Textarea rows={2} value={movimento.observacao} onChange={e => setMovimento(m => ({ ...m, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMovimento(false)}>Cancelar</Button>
            <Button onClick={salvarMovimento} disabled={criarMovimento.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalFechamento} onOpenChange={setModalFechamento}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Fechamento mensal</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Competência *</Label>
              <Input type="month" value={fechamento.competencia} onChange={e => setFechamento(f => ({ ...f, competencia: e.target.value, dtInicio: mesInicio(e.target.value), dtFim: mesFim(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input type="date" value={fechamento.dtVencimento} onChange={e => setFechamento(f => ({ ...f, dtVencimento: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input type="date" value={fechamento.dtInicio} onChange={e => setFechamento(f => ({ ...f, dtInicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim *</Label>
              <Input type="date" value={fechamento.dtFim} onChange={e => setFechamento(f => ({ ...f, dtFim: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Natureza de Caixa *</Label>
              <Select value={fechamento.guidNatureza || "none"} onValueChange={v => setFechamento(f => ({ ...f, guidNatureza: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione uma natureza</SelectItem>
                  {(naturezas as Array<{guidNatureza:string;NATUREZA:string}>).map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Centro de Custo *</Label>
              <Select value={fechamento.guidCentro || "none"} onValueChange={v => setFechamento(f => ({ ...f, guidCentro: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione um centro</SelectItem>
                  {(centros as Array<{guidCentro:string;CENTRO:string}>).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Conta do Plano de Contas *</Label>
              <Select value={fechamento.guidConta || "none"} onValueChange={v => setFechamento(f => ({ ...f, guidConta: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta de despesa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione uma conta</SelectItem>
                  {(contas as Array<{guidConta:string;CODCONTA:string;CONTA:string;TIPO:string}>).filter(c => c.TIPO === "D").map(c => (
                    <SelectItem key={c.guidConta} value={c.guidConta}>{c.CODCONTA} - {c.CONTA}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-muted-foreground">
              O fechamento gera Contas a Pagar por funcionário, com origem FOLHA, preservando histórico financeiro.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalFechamento(false)}>Cancelar</Button>
            <Button onClick={confirmarFechamento} disabled={fecharMes.isPending} className="gap-2">
              <CheckCircle className="h-4 w-4" /> Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelando} onOpenChange={v => { if (!v) { setCancelando(null); setMotivo(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cancelar registro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{cancelando?.DESCRICAO}</p>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Textarea rows={4} value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelando(null); setMotivo(""); }}>Voltar</Button>
            <Button variant="destructive" onClick={confirmarCancelamento} disabled={cancelarMovimento.isPending}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

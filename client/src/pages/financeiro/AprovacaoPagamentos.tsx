import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, History, RotateCcw, Settings, XCircle } from "lucide-react";

const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Pag = { guidLancamento:string; guidAprovacao:string|null; DESCRICAO:string; NOMECREDOR:string; NUMERODOC:string|null; VALOR:number; dtVencimento:string; nomeCentro:string|null; nomeNatureza:string|null; statusAprovacao:string; NIVELATUAL:number; NIVEISNECESSARIOS:number };

export default function AprovacaoPagamentos() {
  const utils = trpc.useUtils();
  const [fornecedor, setFornecedor] = useState("");
  const [status, setStatus] = useState("AGUARDANDO_APROVACAO");
  const [modalAcao, setModalAcao] = useState<{pag: Pag; acao: "APROVAR"|"REJEITAR"|"DEVOLVER_AJUSTE"} | null>(null);
  const [obs, setObs] = useState("");
  const [modalConfig, setModalConfig] = useState(false);
  const [regra, setRegra] = useState({ descricao: "", valorApartir: "", niveis: "1", bloquearAprovadorOrigem: true });
  const [hist, setHist] = useState<Pag | null>(null);
  const { data: pagamentos = [] } = trpc.cobrancaAprovacao.listarAprovacoes.useQuery({ fornecedor: fornecedor || undefined, status: status as "AGUARDANDO_APROVACAO" });
  const { data: regras = [] } = trpc.cobrancaAprovacao.regrasAprovacao.useQuery();
  const { data: historico = [] } = trpc.cobrancaAprovacao.historicoAprovacao.useQuery({ guidLancamento: hist?.guidLancamento ?? "" }, { enabled: !!hist });
  const acao = trpc.cobrancaAprovacao.acaoAprovacao.useMutation({ onSuccess: (r) => { utils.cobrancaAprovacao.listarAprovacoes.invalidate(); toast.success(`Status: ${r.status}`); setModalAcao(null); setObs(""); }, onError: e => toast.error(e.message) });
  const gerar = trpc.cobrancaAprovacao.gerarAprovacao.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.listarAprovacoes.invalidate(); toast.success("Aprovação verificada."); }, onError: e => toast.error(e.message) });
  const salvarRegra = trpc.cobrancaAprovacao.salvarRegraAprovacao.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.regrasAprovacao.invalidate(); toast.success("Regra salva."); }, onError: e => toast.error(e.message) });

  function confirmar() {
    if (!modalAcao) return;
    acao.mutate({ guidLancamento: modalAcao.pag.guidLancamento, acao: modalAcao.acao, observacao: obs || undefined });
  }

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold">Aprovação de Pagamentos</h1><p className="text-sm text-muted-foreground">Controle de aprovação antes da baixa em Contas a Pagar.</p></div><Button onClick={() => setModalConfig(true)}><Settings className="w-4 h-4 mr-2" />Regras</Button></div>
    <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="space-y-1"><Label>Fornecedor</Label><Input value={fornecedor} onChange={e => setFornecedor(e.target.value)} /></div><div className="space-y-1"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TODOS","LANCADO","AGUARDANDO_APROVACAO","APROVADO","REJEITADO","DEVOLVIDO_AJUSTE","PAGO","CANCELADO"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><Button variant="outline" onClick={() => utils.cobrancaAprovacao.listarAprovacoes.invalidate()}>Pesquisar</Button></div></CardContent></Card>
    <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Título</TableHead><TableHead>Vencimento</TableHead><TableHead>Centro/Natureza</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead>Nível</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
      {(pagamentos as Pag[]).map(p => <TableRow key={p.guidLancamento}><TableCell>{p.NOMECREDOR}</TableCell><TableCell>{p.DESCRICAO}<div className="text-xs text-muted-foreground">{p.NUMERODOC ?? "-"}</div></TableCell><TableCell>{p.dtVencimento}</TableCell><TableCell>{p.nomeCentro ?? "-"}<div className="text-xs text-muted-foreground">{p.nomeNatureza ?? "-"}</div></TableCell><TableCell className="text-right">{moeda(p.VALOR)}</TableCell><TableCell>{p.statusAprovacao}</TableCell><TableCell>{p.NIVELATUAL ?? 0}/{p.NIVEISNECESSARIOS ?? 0}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => gerar.mutate({ guidLancamento: p.guidLancamento })}><RotateCcw className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => setModalAcao({ pag: p, acao: "APROVAR" })}><CheckCircle2 className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => setModalAcao({ pag: p, acao: "REJEITAR" })}><XCircle className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => setModalAcao({ pag: p, acao: "DEVOLVER_AJUSTE" })}><RotateCcw className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => setHist(p)}><History className="w-4 h-4" /></Button></div></TableCell></TableRow>)}
      {!(pagamentos as Pag[]).length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum pagamento encontrado.</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
    <Dialog open={!!modalAcao} onOpenChange={o => !o && setModalAcao(null)}><DialogContent><DialogHeader><DialogTitle>{modalAcao?.acao}</DialogTitle></DialogHeader><div className="space-y-2"><p className="text-sm text-muted-foreground">{modalAcao?.pag.DESCRICAO}</p><Label>Observação {modalAcao?.acao !== "APROVAR" ? "*" : ""}</Label><Textarea value={obs} onChange={e => setObs(e.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setModalAcao(null)}>Cancelar</Button><Button onClick={confirmar}>Confirmar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={modalConfig} onOpenChange={setModalConfig}><DialogContent><DialogHeader><DialogTitle>Regra de aprovação</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Descrição" value={regra.descricao} onChange={e => setRegra(f => ({...f,descricao:e.target.value}))} /><Input placeholder="Valor a partir de" value={regra.valorApartir} onChange={e => setRegra(f => ({...f,valorApartir:e.target.value}))} /><Input placeholder="Níveis" value={regra.niveis} onChange={e => setRegra(f => ({...f,niveis:e.target.value}))} /><label className="flex gap-2 text-sm"><input type="checkbox" checked={regra.bloquearAprovadorOrigem} onChange={e => setRegra(f => ({...f,bloquearAprovadorOrigem:e.target.checked}))} />Usuário que lançou não pode aprovar</label><p className="text-sm text-muted-foreground">{(regras as unknown[]).length} regra(s) cadastrada(s).</p></div><DialogFooter><Button onClick={() => salvarRegra.mutate({ descricao: regra.descricao, valorApartir: regra.valorApartir ? Number(regra.valorApartir) : null, niveis: Number(regra.niveis || 1), bloquearAprovadorOrigem: regra.bloquearAprovadorOrigem, ativa: true, exigeAprovacao: true })}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!hist} onOpenChange={o => !o && setHist(null)}><DialogContent><DialogHeader><DialogTitle>Histórico</DialogTitle></DialogHeader><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Ação</TableHead><TableHead>Nível</TableHead><TableHead>Observação</TableHead></TableRow></TableHeader><TableBody>{(historico as Array<{DATAHORA:string;ACAO:string;NIVEL:number;OBSERVACAO:string}>).map((h,i) => <TableRow key={i}><TableCell>{new Date(h.DATAHORA).toLocaleString("pt-BR")}</TableCell><TableCell>{h.ACAO}</TableCell><TableCell>{h.NIVEL}</TableCell><TableCell>{h.OBSERVACAO}</TableCell></TableRow>)}</TableBody></Table></DialogContent></Dialog>
  </div>;
}

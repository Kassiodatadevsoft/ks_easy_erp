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
import { History, PauseCircle, Send, Settings, Handshake } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Titulo = { guidLancamento:string; guidCliente:string|null; NOMEDEVEDOR:string; DESCRICAO:string; NUMERODOC:string|null; SALDO:number; DTVENCIMENTO:string; faixa:string; ultimoStatus:string|null };
type Modelo = { guidModelo:string; NOME:string; CANAL:string; MENSAGEM:string };

export default function CobrancaAutomatica() {
  const utils = trpc.useUtils();
  const [cliente, setCliente] = useState("");
  const [dtInicio, setDtInicio] = useState("");
  const [dtFim, setDtFim] = useState(hoje());
  const [status, setStatus] = useState("PENDENTE");
  const [valorMin, setValorMin] = useState("");
  const [modalConfig, setModalConfig] = useState(false);
  const [modalHistorico, setModalHistorico] = useState<Titulo | null>(null);
  const [envio, setEnvio] = useState<Titulo | null>(null);
  const [formModelo, setFormModelo] = useState({ nome: "", canal: "WHATSAPP", mensagem: "Olá {{cliente}}, o título {{titulo}} no valor de {{valor}} vence em {{vencimento}}." });
  const [formRegua, setFormRegua] = useState({ diasRelativos: "0", diaVencimento: true, canal: "WHATSAPP", guidModelo: "", valorMinimo: "0", reenviarAposDias: "" });
  const [mensagem, setMensagem] = useState("");
  const [canal, setCanal] = useState<"WHATSAPP"|"EMAIL"|"SMS">("WHATSAPP");

  const { data: titulos = [] } = trpc.cobrancaAprovacao.listarTitulosCobranca.useQuery({ cliente: cliente || undefined, dtInicio: dtInicio || undefined, dtFim: dtFim || undefined, valorMin: valorMin ? Number(valorMin) : undefined, status: status as "PENDENTE" });
  const { data: modelos = [] } = trpc.cobrancaAprovacao.modelos.useQuery();
  const { data: regras = [] } = trpc.cobrancaAprovacao.regrasCobranca.useQuery();
  const { data: historico = [] } = trpc.cobrancaAprovacao.historicoCobranca.useQuery({ guidLancamento: modalHistorico?.guidLancamento ?? "" }, { enabled: !!modalHistorico });
  const salvarModelo = trpc.cobrancaAprovacao.salvarModelo.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.modelos.invalidate(); toast.success("Modelo salvo."); }, onError: e => toast.error(e.message) });
  const salvarRegua = trpc.cobrancaAprovacao.salvarRegua.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.regrasCobranca.invalidate(); toast.success("Régua salva."); }, onError: e => toast.error(e.message) });
  const enviar = trpc.cobrancaAprovacao.enviarCobranca.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.listarTitulosCobranca.invalidate(); toast.success("Cobrança enviada."); setEnvio(null); }, onError: e => toast.error(e.message) });
  const alterar = trpc.cobrancaAprovacao.alterarStatusCobranca.useMutation({ onSuccess: () => { utils.cobrancaAprovacao.listarTitulosCobranca.invalidate(); toast.success("Status registrado."); }, onError: e => toast.error(e.message) });

  function abrirEnvio(t: Titulo) {
    setEnvio(t);
    setCanal("WHATSAPP");
    setMensagem(`Olá ${t.NOMEDEVEDOR}, identificamos o título ${t.NUMERODOC ?? t.DESCRICAO} no valor de ${moeda(t.SALDO)} com vencimento em ${t.DTVENCIMENTO}.`);
  }

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h1 className="text-2xl font-bold">Cobrança Automática</h1><p className="text-sm text-muted-foreground">Régua de cobrança, envio manual e histórico por título.</p></div><Button onClick={() => setModalConfig(true)}><Settings className="w-4 h-4 mr-2" />Configurar régua</Button></div>
    <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
      <div className="space-y-1"><Label>Cliente</Label><Input value={cliente} onChange={e => setCliente(e.target.value)} /></div>
      <div className="space-y-1"><Label>Venc. início</Label><Input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} /></div>
      <div className="space-y-1"><Label>Venc. fim</Label><Input type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} /></div>
      <div className="space-y-1"><Label>Valor mínimo</Label><Input value={valorMin} onChange={e => setValorMin(e.target.value)} /></div>
      <div className="space-y-1"><Label>Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TODOS","PENDENTE","ENVIADO","FALHA","PAUSADO","NEGOCIADO","PAGO","CANCELADO"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
    </CardContent></Card>
    <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Título</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Faixa</TableHead><TableHead>Último status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>
      {(titulos as Titulo[]).map(t => <TableRow key={t.guidLancamento}><TableCell>{t.NOMEDEVEDOR}</TableCell><TableCell>{t.DESCRICAO}<div className="text-xs text-muted-foreground">{t.NUMERODOC ?? "-"}</div></TableCell><TableCell>{t.DTVENCIMENTO}</TableCell><TableCell className="text-right">{moeda(t.SALDO)}</TableCell><TableCell>{t.faixa}</TableCell><TableCell>{t.ultimoStatus ?? "PENDENTE"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => abrirEnvio(t)}><Send className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => alterar.mutate({ guidLancamento: t.guidLancamento, status: "PAUSADO" })}><PauseCircle className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => alterar.mutate({ guidLancamento: t.guidLancamento, status: "NEGOCIADO" })}><Handshake className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => setModalHistorico(t)}><History className="w-4 h-4" /></Button></div></TableCell></TableRow>)}
      {!(titulos as Titulo[]).length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum título encontrado.</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>

    <Dialog open={!!envio} onOpenChange={o => !o && setEnvio(null)}><DialogContent><DialogHeader><DialogTitle>Enviar cobrança</DialogTitle></DialogHeader><div className="space-y-3"><Label>Canal</Label><Select value={canal} onValueChange={v => setCanal(v as typeof canal)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="EMAIL">E-mail</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent></Select><Label>Mensagem</Label><Textarea value={mensagem} onChange={e => setMensagem(e.target.value)} rows={6} /></div><DialogFooter><Button variant="outline" onClick={() => setEnvio(null)}>Cancelar</Button><Button onClick={() => envio && enviar.mutate({ guidLancamento: envio.guidLancamento, canal, mensagem, forcarReenvio: true })}>Enviar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={modalConfig} onOpenChange={setModalConfig}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Configuração da régua</DialogTitle></DialogHeader><div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card><CardContent className="p-4 space-y-2"><h3 className="font-semibold">Modelo de mensagem</h3><Input placeholder="Nome" value={formModelo.nome} onChange={e => setFormModelo(f => ({...f,nome:e.target.value}))} /><Select value={formModelo.canal} onValueChange={v => setFormModelo(f => ({...f,canal:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="EMAIL">E-mail</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent></Select><Textarea value={formModelo.mensagem} onChange={e => setFormModelo(f => ({...f,mensagem:e.target.value}))} /><Button onClick={() => salvarModelo.mutate({ nome: formModelo.nome, canal: formModelo.canal as "WHATSAPP", mensagem: formModelo.mensagem })}>Salvar modelo</Button></CardContent></Card>
      <Card><CardContent className="p-4 space-y-2"><h3 className="font-semibold">Régua</h3><Input placeholder="Dias relativos (- antes, 0 vencimento, + após)" value={formRegua.diasRelativos} onChange={e => setFormRegua(f => ({...f,diasRelativos:e.target.value}))} /><Select value={formRegua.canal} onValueChange={v => setFormRegua(f => ({...f,canal:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="EMAIL">E-mail</SelectItem><SelectItem value="SMS">SMS</SelectItem></SelectContent></Select><Select value={formRegua.guidModelo} onValueChange={v => setFormRegua(f => ({...f,guidModelo:v}))}><SelectTrigger><SelectValue placeholder="Modelo" /></SelectTrigger><SelectContent>{(modelos as Modelo[]).map(m => <SelectItem key={m.guidModelo} value={m.guidModelo}>{m.NOME}</SelectItem>)}</SelectContent></Select><Input placeholder="Valor mínimo" value={formRegua.valorMinimo} onChange={e => setFormRegua(f => ({...f,valorMinimo:e.target.value}))} /><Button onClick={() => salvarRegua.mutate({ diasRelativos: Number(formRegua.diasRelativos), diaVencimento: Number(formRegua.diasRelativos) === 0, canal: formRegua.canal as "WHATSAPP", guidModelo: formRegua.guidModelo || null, valorMinimo: Number(formRegua.valorMinimo || 0), reenviarAposDias: formRegua.reenviarAposDias ? Number(formRegua.reenviarAposDias) : null, ativa: true })}>Salvar régua</Button></CardContent></Card>
      <div className="md:col-span-2 text-sm text-muted-foreground">{(regras as unknown[]).length} regra(s) configurada(s).</div>
    </div></DialogContent></Dialog>
    <Dialog open={!!modalHistorico} onOpenChange={o => !o && setModalHistorico(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Histórico de cobrança</DialogTitle></DialogHeader><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Canal</TableHead><TableHead>Status</TableHead><TableHead>Tentativa</TableHead><TableHead>Retorno</TableHead></TableRow></TableHeader><TableBody>{(historico as Array<{DATAHORA:string;CANAL:string;STATUSENVIO:string;TENTATIVA:number;RETORNO:string}>).map((h,i) => <TableRow key={i}><TableCell>{new Date(h.DATAHORA).toLocaleString("pt-BR")}</TableCell><TableCell>{h.CANAL}</TableCell><TableCell>{h.STATUSENVIO}</TableCell><TableCell>{h.TENTATIVA}</TableCell><TableCell>{h.RETORNO}</TableCell></TableRow>)}</TableBody></Table></DialogContent></Dialog>
  </div>;
}

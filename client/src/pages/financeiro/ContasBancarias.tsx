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
import { Plus, Pencil, Landmark, Wallet, PiggyBank, CircleDollarSign, RefreshCw, ReceiptText, TrendingUp, TrendingDown } from "lucide-react";

const TIPO_LABEL: Record<string, string> = { C: "Corrente", P: "Poupança", X: "Caixa", O: "Outro" };
const TIPO_ICON: Record<string, React.ReactNode> = {
  C: <Landmark className="w-5 h-5" />,
  P: <PiggyBank className="w-5 h-5" />,
  X: <Wallet className="w-5 h-5" />,
  O: <CircleDollarSign className="w-5 h-5" />,
};

type BoletoBanco = "ITAU" | "CORA";
type BoletoAmbiente = "HOMOLOGACAO" | "PRODUCAO";
type BoletoConfigForm = {
  ativo: boolean;
  banco: BoletoBanco | "";
  ambiente: BoletoAmbiente;
  clientId: string;
  clientSecret: string;
  apiUrl: string;
  tokenUrl: string;
  emitirPath: string;
  consultarPath: string;
  cancelarPath: string;
  carteira: string;
  convenio: string;
  secretConfigurado: boolean;
};
type FormState = { conta: string; banco: string; agencia: string; numeroConta: string; tipoConta: "C"|"P"|"X"|"O"; saldoInicial: number; situacao: "A"|"I"; boleto: BoletoConfigForm };
const EMPTY_BOLETO: BoletoConfigForm = {
  ativo: false,
  banco: "",
  ambiente: "HOMOLOGACAO",
  clientId: "",
  clientSecret: "",
  apiUrl: "",
  tokenUrl: "",
  emitirPath: "",
  consultarPath: "",
  cancelarPath: "",
  carteira: "",
  convenio: "",
  secretConfigurado: false,
};
const EMPTY: FormState = { conta: "", banco: "", agencia: "", numeroConta: "", tipoConta: "C", saldoInicial: 0, situacao: "A", boleto: { ...EMPTY_BOLETO } };

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
  const [contaSelecionada, setContaSelecionada] = useState<string | null>(null);
  const { data: movimentacoes, isLoading: carregandoMovimentos } = trpc.contasBancarias.movimentacoes.useQuery({
    guidConta: contaSelecionada ?? undefined,
    limite: 20,
  });

  function abrirNovo() { setEditGuid(null); setForm({ ...EMPTY, boleto: { ...EMPTY_BOLETO } }); setModal(true); }
  function abrirEditar(c: typeof contas[0]) {
    setEditGuid(c.guidConta);
    setForm({
      conta: c.CONTA,
      banco: c.BANCO ?? "",
      agencia: c.AGENCIA ?? "",
      numeroConta: c.NUMEROCONTA ?? "",
      tipoConta: (c.TIPOCONTA as "C"|"P"|"X"|"O") ?? "C",
      saldoInicial: Number(c.SALDOINICIAL),
      situacao: (c.SITUACAO as "A"|"I") ?? "A",
      boleto: {
        ativo: Boolean(c.BOLETOATIVO),
        banco: (c.BOLETOBANCO as BoletoBanco | null) ?? "",
        ambiente: (c.BOLETOAMBIENTE as BoletoAmbiente | null) ?? "HOMOLOGACAO",
        clientId: c.BOLETOCLIENTID ?? "",
        clientSecret: "",
        apiUrl: c.BOLETOAPIURL ?? "",
        tokenUrl: c.BOLETOTOKENURL ?? "",
        emitirPath: c.BOLETOEMITIRPATH ?? "",
        consultarPath: c.BOLETOCONSULTARPATH ?? "",
        cancelarPath: c.BOLETOCANCELARPATH ?? "",
        carteira: c.BOLETOCARTEIRA ?? "",
        convenio: c.BOLETOCONVENIO ?? "",
        secretConfigurado: Boolean(c.BOLETOCLIENTSECRETCONFIGURADO),
      },
    });
    setModal(true);
  }
  function boletoPayload() {
    return {
      ativo: form.boleto.ativo,
      banco: form.boleto.banco || null,
      ambiente: form.boleto.ambiente,
      clientId: form.boleto.clientId || null,
      clientSecret: form.boleto.clientSecret || null,
      apiUrl: form.boleto.apiUrl || null,
      tokenUrl: form.boleto.tokenUrl || null,
      emitirPath: form.boleto.emitirPath || null,
      consultarPath: form.boleto.consultarPath || null,
      cancelarPath: form.boleto.cancelarPath || null,
      carteira: form.boleto.carteira || null,
      convenio: form.boleto.convenio || null,
    };
  }
  function salvar() {
    if (!form.conta.trim()) { toast.error("Informe o nome da conta."); return; }
    if (form.boleto.ativo && !form.boleto.banco) { toast.error("Selecione o banco da integração de boleto."); return; }
    if (form.boleto.ativo && !form.boleto.clientId.trim()) { toast.error("Informe o Client ID da integração de boleto."); return; }
    if (form.boleto.ativo && !form.boleto.clientSecret.trim() && !form.boleto.secretConfigurado) { toast.error("Informe o Client Secret da integração de boleto."); return; }
    if (editGuid) {
      atualizar.mutate({ guidConta: editGuid, conta: form.conta, banco: form.banco || null, agencia: form.agencia || null, numeroConta: form.numeroConta || null, tipoConta: form.tipoConta, situacao: form.situacao, boleto: boletoPayload() });
    } else {
      criar.mutate({ conta: form.conta, banco: form.banco || null, agencia: form.agencia || null, numeroConta: form.numeroConta || null, tipoConta: form.tipoConta, saldoInicial: form.saldoInicial, situacao: form.situacao, boleto: boletoPayload() });
    }
  }

  const ativas = contas.filter(c => c.SITUACAO === "A");
  const totalSaldo = ativas.reduce((s, c) => s + (Number(c.SALDOATUAL) || 0), 0);
  const contaSelecionadaNome = contaSelecionada ? contas.find(c => c.guidConta === contaSelecionada)?.CONTA : null;
  const resumoMovimentos = movimentacoes?.totais ?? { totalEntradas: 0, totalSaidas: 0, totalMovimentos: 0, totalVendas: 0 };

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
        <Card className={`col-span-full sm:col-span-2 lg:col-span-1 border-primary/30 bg-primary/5 cursor-pointer transition-colors ${contaSelecionada === null ? "ring-2 ring-primary/40" : ""}`} onClick={() => setContaSelecionada(null)}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo Total</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-primary">R$ {totalSaldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        {ativas.map(c => (
          <Card key={c.guidConta} className={`cursor-pointer hover:border-primary/40 transition-colors ${contaSelecionada === c.guidConta ? "ring-2 ring-primary/40" : ""}`} onClick={() => setContaSelecionada(c.guidConta)}>
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
              {Boolean(c.BOLETOATIVO) && (
                <Badge variant="outline" className="mt-2 gap-1 text-xs">
                  <ReceiptText className="w-3 h-3" /> Boleto {c.BOLETOBANCO}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Ultimos lancamentos</CardTitle>
              <p className="text-sm text-muted-foreground">
                {contaSelecionadaNome ? `Movimentos da conta ${contaSelecionadaNome}` : "Movimentos de todas as contas"}
              </p>
            </div>
            <Select value={contaSelecionada ?? "__todas__"} onValueChange={v => setContaSelecionada(v === "__todas__" ? null : v)}>
              <SelectTrigger className="w-full md:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas__">Todas as contas</SelectItem>
                {contas.map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="rounded-md border border-green-500/25 bg-green-500/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="w-4 h-4 text-green-600" />Entradas</div>
              <p className="mt-1 text-lg font-semibold text-green-600">R$ {Number(resumoMovimentos.totalEntradas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border border-red-500/25 bg-red-500/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingDown className="w-4 h-4 text-red-600" />Saidas</div>
              <p className="mt-1 text-lg font-semibold text-red-600">R$ {Number(resumoMovimentos.totalSaidas).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Movimentos</p>
              <p className="mt-1 text-lg font-semibold">{Number(resumoMovimentos.totalMovimentos).toLocaleString("pt-BR")}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Vendas lancadas</p>
              <p className="mt-1 text-lg font-semibold">{Number(resumoMovimentos.totalVendas).toLocaleString("pt-BR")}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregandoMovimentos && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando lancamentos...</TableCell></TableRow>
                )}
                {!carregandoMovimentos && (movimentacoes?.dados ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum lancamento localizado.</TableCell></TableRow>
                )}
                {(movimentacoes?.dados ?? []).map(l => (
                  <TableRow key={l.guidLancamento}>
                    <TableCell className="text-sm">{new Date(l.DTLANCAMENTO).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <Badge variant={l.guidVenda ? "default" : "secondary"} className="text-xs">
                        {l.guidVenda ? "Venda" : l.TIPO === "E" ? "Entrada" : "Saida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{l.DESCRICAO}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{l.nomeConta ?? "—"}</TableCell>
                    <TableCell className={`text-right font-semibold ${l.TIPO === "E" ? "text-green-600" : "text-red-600"}`}>
                      {l.TIPO === "S" ? "- " : "+ "}R$ {Number(l.VALOR).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                <TableHead>Boleto</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right">Saldo Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!isLoading && contas.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma conta cadastrada.</TableCell></TableRow>
              )}
              {contas.map(c => (
                <TableRow key={c.guidConta}>
                  <TableCell className="font-medium">{c.CONTA}</TableCell>
                  <TableCell>{TIPO_LABEL[c.TIPOCONTA] ?? c.TIPOCONTA}</TableCell>
                  <TableCell className="text-muted-foreground">{[c.BANCO, c.AGENCIA].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.NUMEROCONTA || "—"}</TableCell>
                  <TableCell>
                    {Boolean(c.BOLETOATIVO) ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <ReceiptText className="w-3 h-3" /> {c.BOLETOBANCO}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
            <div className="col-span-2 border-t pt-4 mt-2 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="flex items-center gap-2">
                    <ReceiptText className="w-4 h-4" /> Integração de Boletos
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">Configure Itaú ou Cora para emissão dentro de Contas a Receber.</p>
                </div>
                <Select value={form.boleto.ativo ? "S" : "N"} onValueChange={v => setForm(f => ({ ...f, boleto: { ...f.boleto, ativo: v === "S" } }))}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">Ativo</SelectItem>
                    <SelectItem value="N">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.boleto.ativo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Banco emissor *</Label>
                    <Select value={form.boleto.banco || "none"} onValueChange={v => setForm(f => ({ ...f, boleto: { ...f.boleto, banco: v === "none" ? "" : v as BoletoBanco } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione</SelectItem>
                        <SelectItem value="ITAU">Itaú</SelectItem>
                        <SelectItem value="CORA">Cora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Ambiente</Label>
                    <Select value={form.boleto.ambiente} onValueChange={v => setForm(f => ({ ...f, boleto: { ...f.boleto, ambiente: v as BoletoAmbiente } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOMOLOGACAO">Homologação</SelectItem>
                        <SelectItem value="PRODUCAO">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Client ID *</Label>
                    <Input value={form.boleto.clientId} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, clientId: e.target.value } }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Client Secret {form.boleto.secretConfigurado ? "(já configurado)" : "*"}</Label>
                    <Input type="password" value={form.boleto.clientSecret} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, clientSecret: e.target.value } }))} placeholder={form.boleto.secretConfigurado ? "Deixe em branco para manter" : ""} />
                  </div>
                  <div className="space-y-1">
                    <Label>API URL</Label>
                    <Input value={form.boleto.apiUrl} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, apiUrl: e.target.value } }))} placeholder="https://api..." />
                  </div>
                  <div className="space-y-1">
                    <Label>Token URL</Label>
                    <Input value={form.boleto.tokenUrl} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, tokenUrl: e.target.value } }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Carteira</Label>
                    <Input value={form.boleto.carteira} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, carteira: e.target.value } }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Convênio</Label>
                    <Input value={form.boleto.convenio} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, convenio: e.target.value } }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Path emissão</Label>
                    <Input value={form.boleto.emitirPath} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, emitirPath: e.target.value } }))} placeholder="/boletos" />
                  </div>
                  <div className="space-y-1">
                    <Label>Path consulta</Label>
                    <Input value={form.boleto.consultarPath} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, consultarPath: e.target.value } }))} placeholder="/boletos/{id}" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Path cancelamento</Label>
                    <Input value={form.boleto.cancelarPath} onChange={e => setForm(f => ({ ...f, boleto: { ...f.boleto, cancelarPath: e.target.value } }))} placeholder="/boletos/{id}" />
                  </div>
                </div>
              )}
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

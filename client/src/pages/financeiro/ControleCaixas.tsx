import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Eye, LockKeyhole, Printer, RefreshCw, Wallet } from "lucide-react";

type CaixaResumo = {
  formasPagamento: Array<{ guidPagamento: string; pagamento: string; valor: number }>;
  totalVendas: number;
  totalEntradas: number;
  totalMovimentado: number;
  totalEsperado: number;
  totalLiquido: number;
  cancelamentos: number;
};

type CaixaLista = {
  GUIDCAIXA: string;
  NUMEROCAIXA: number;
  GUIDUSUARIO: string;
  CODUSUARIO: number | null;
  OPERADOR: string | null;
  DESCRICAO: string | null;
  DATAABERTURA: string | Date;
  DATAFECHAMENTO: string | Date | null;
  SALDOINICIAL: number;
  SALDOFINAL: number;
  TOTALSUPRIMENTO: number;
  TOTALSANGRIA: number;
  SITUACAO: string;
  OBSERVACAO: string | null;
  resumo: CaixaResumo;
};

type CaixaDetalhe = {
  caixa: CaixaLista;
  resumo: CaixaResumo;
  empresa: { nome: string | null };
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "ABERTO") return "bg-emerald-100 text-emerald-800";
  if (status === "FECHADO") return "bg-slate-100 text-slate-800";
  if (status === "BLOQUEADO") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

export default function ControleCaixas() {
  const [situacao, setSituacao] = useState<"ABERTO" | "FECHADO" | "CANCELADO" | "BLOQUEADO" | "TODOS">("ABERTO");
  const [guidDetalhe, setGuidDetalhe] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  const [valorInformado, setValorInformado] = useState("");
  const [observacao, setObservacao] = useState("");
  const utils = trpc.useUtils();
  const fecharCaixa = trpc.caixaMovimento.fechar.useMutation();
  const { data: caixas = [], isLoading, refetch } = trpc.caixaMovimento.listar.useQuery({ situacao });
  const { data: detalhe } = trpc.caixaMovimento.detalhe.useQuery(
    { guidCaixa: guidDetalhe ?? "" },
    { enabled: Boolean(guidDetalhe) },
  );

  const caixaDetalhe = detalhe as CaixaDetalhe | undefined;
  const diferenca = useMemo(() => {
    if (!caixaDetalhe) return 0;
    return (Number(valorInformado) || 0) - caixaDetalhe.resumo.totalEsperado;
  }, [caixaDetalhe, valorInformado]);

  function abrirDetalhe(guidCaixa: string, fechar = false) {
    setGuidDetalhe(guidCaixa);
    setFechando(fechar);
    setValorInformado("");
    setObservacao("");
  }

  async function confirmarFechamento() {
    if (!caixaDetalhe) return;
    if (Math.abs(diferenca) > 0.009 && !observacao.trim()) {
      toast.error("Informe observacao para fechar caixa com diferenca.");
      return;
    }
    try {
      await fecharCaixa.mutateAsync({
        guidCaixa: caixaDetalhe.caixa.GUIDCAIXA,
        saldoFinal: Number(valorInformado) || 0,
        observacao: observacao || undefined,
      });
      toast.success("Caixa fechado com sucesso.");
      setGuidDetalhe(null);
      await utils.caixaMovimento.listar.invalidate();
      await utils.caixaMovimento.atual.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel fechar o caixa.");
    }
  }

  function imprimirFechamento(dados: CaixaDetalhe) {
    const html = `
      <html>
        <head>
          <title>Fechamento Caixa ${dados.caixa.NUMEROCAIXA}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 4px; font-size: 22px; }
            h2 { margin-top: 24px; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
            .right { text-align: right; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 16px; }
            .assinatura { margin-top: 64px; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Relatorio de Fechamento de Caixa</h1>
          <div>${dados.empresa.nome ?? ""}</div>
          <div class="grid">
            <div><strong>Caixa:</strong> ${dados.caixa.NUMEROCAIXA}</div>
            <div><strong>Operador:</strong> ${dados.caixa.OPERADOR ?? "-"}</div>
            <div><strong>Abertura:</strong> ${dateTime(dados.caixa.DATAABERTURA)}</div>
            <div><strong>Fechamento:</strong> ${dateTime(dados.caixa.DATAFECHAMENTO) || dateTime(new Date())}</div>
            <div><strong>Saldo inicial:</strong> ${money(Number(dados.caixa.SALDOINICIAL))}</div>
            <div><strong>Situacao:</strong> ${dados.caixa.SITUACAO}</div>
          </div>
          <h2>Resumo por formas de pagamento</h2>
          <table>
            ${dados.resumo.formasPagamento.map((forma) => `
              <tr><td>${forma.pagamento}</td><td class="right">${money(forma.valor)}</td></tr>
            `).join("")}
            <tr><th>Total Geral</th><th class="right">${money(dados.resumo.totalVendas)}</th></tr>
          </table>
          <h2>Totais</h2>
          <table>
            <tr><td>Total de vendas</td><td class="right">${money(dados.resumo.totalVendas)}</td></tr>
            <tr><td>Total de suprimentos</td><td class="right">${money(Number(dados.caixa.TOTALSUPRIMENTO))}</td></tr>
            <tr><td>Total de sangrias</td><td class="right">${money(Number(dados.caixa.TOTALSANGRIA))}</td></tr>
            <tr><td>Total esperado</td><td class="right">${money(dados.resumo.totalEsperado)}</td></tr>
            <tr><td>Valor informado</td><td class="right">${money(Number(dados.caixa.SALDOFINAL))}</td></tr>
            <tr><td>Diferenca</td><td class="right">${money(Number(dados.caixa.SALDOFINAL) - dados.resumo.totalEsperado)}</td></tr>
          </table>
          <p><strong>Observacao:</strong> ${dados.caixa.OBSERVACAO ?? ""}</p>
          <div class="assinatura">____________________________________<br/>Assinatura do operador</div>
          <script>window.print()</script>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Nao foi possivel abrir a janela de impressao.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <div className="min-h-full bg-slate-100 -m-5 p-3 sm:p-5">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Controle de Caixas</h1>
            <p className="text-sm text-slate-500">Acompanhe caixas abertos, fechamento e resumo por forma de pagamento.</p>
          </div>
          <div className="flex gap-2">
            <Select value={situacao} onValueChange={(value) => setSituacao(value as typeof situacao)}>
              <SelectTrigger className="w-44 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ABERTO">Abertos</SelectItem>
                <SelectItem value="FECHADO">Fechados</SelectItem>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="BLOQUEADO">Bloqueados</SelectItem>
                <SelectItem value="CANCELADO">Cancelados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </div>
        </div>

        <Card className="rounded-md border-slate-200 shadow-sm">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Caixas</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="overflow-auto rounded-md border bg-white">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Abertura</TableHead>
                    <TableHead className="text-right">Saldo inicial</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Sangrias</TableHead>
                    <TableHead className="text-right">Movimentado</TableHead>
                    <TableHead>Situacao</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="h-28 text-center text-slate-500">Carregando caixas...</TableCell></TableRow>
                  ) : caixas.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="h-28 text-center text-slate-500">Nenhum caixa encontrado.</TableCell></TableRow>
                  ) : (
                    (caixas as CaixaLista[]).map((caixa) => (
                      <TableRow key={caixa.GUIDCAIXA}>
                        <TableCell className="font-semibold">{caixa.NUMEROCAIXA}</TableCell>
                        <TableCell>{caixa.OPERADOR ?? "-"}</TableCell>
                        <TableCell>{dateTime(caixa.DATAABERTURA)}</TableCell>
                        <TableCell className="text-right">{money(Number(caixa.SALDOINICIAL))}</TableCell>
                        <TableCell className="text-right">{money(caixa.resumo.totalVendas)}</TableCell>
                        <TableCell className="text-right">{money(caixa.resumo.totalEntradas)}</TableCell>
                        <TableCell className="text-right">{money(Number(caixa.TOTALSANGRIA))}</TableCell>
                        <TableCell className="text-right">{money(caixa.resumo.totalMovimentado)}</TableCell>
                        <TableCell><Badge className={statusClass(caixa.SITUACAO)}>{caixa.SITUACAO}</Badge></TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => abrirDetalhe(caixa.GUIDCAIXA)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" disabled={caixa.SITUACAO !== "ABERTO"} onClick={() => abrirDetalhe(caixa.GUIDCAIXA, true)}>
                              <LockKeyhole className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => abrirDetalhe(caixa.GUIDCAIXA)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(guidDetalhe)} onOpenChange={(open) => !open && setGuidDetalhe(null)}>
        <DialogContent className="max-h-[92vh] w-[96vw] !max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fechando ? "Fechar caixa" : "Visualizar caixa"}</DialogTitle>
          </DialogHeader>
          {caixaDetalhe && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Caixa" value={String(caixaDetalhe.caixa.NUMEROCAIXA)} />
                <Info label="Operador" value={caixaDetalhe.caixa.OPERADOR ?? "-"} />
                <Info label="Abertura" value={dateTime(caixaDetalhe.caixa.DATAABERTURA)} />
                <Info label="Situacao" value={caixaDetalhe.caixa.SITUACAO} />
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Forma de pagamento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caixaDetalhe.resumo.formasPagamento.map((forma) => (
                      <TableRow key={forma.guidPagamento}>
                        <TableCell>{forma.pagamento}</TableCell>
                        <TableCell className="text-right">{money(forma.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Info label="Saldo inicial" value={money(Number(caixaDetalhe.caixa.SALDOINICIAL))} />
                <Info label="Total vendas" value={money(caixaDetalhe.resumo.totalVendas)} />
                <Info label="Suprimentos" value={money(Number(caixaDetalhe.caixa.TOTALSUPRIMENTO))} />
                <Info label="Sangrias" value={money(Number(caixaDetalhe.caixa.TOTALSANGRIA))} />
                <Info label="Cancelamentos" value={money(caixaDetalhe.resumo.cancelamentos)} />
                <Info label="Total esperado" value={money(caixaDetalhe.resumo.totalEsperado)} />
                <Info label="Total liquido" value={money(caixaDetalhe.resumo.totalLiquido)} />
                <Info label="Saldo final" value={money(Number(caixaDetalhe.caixa.SALDOFINAL))} />
              </div>

              {fechando && (
                <div className="grid gap-3 rounded-md border bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Valor informado pelo operador</Label>
                      <Input type="number" value={valorInformado} onChange={(event) => setValorInformado(event.target.value)} />
                    </div>
                    <Info label="Total esperado" value={money(caixaDetalhe.resumo.totalEsperado)} />
                    <Info label="Diferenca" value={money(diferenca)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Observacao {Math.abs(diferenca) > 0.009 ? "(obrigatoria)" : ""}</Label>
                    <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={3} />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {caixaDetalhe && (
              <Button variant="outline" className="gap-2" onClick={() => imprimirFechamento(caixaDetalhe)}>
                <Printer className="h-4 w-4" /> Imprimir fechamento
              </Button>
            )}
            <Button variant="outline" onClick={() => setGuidDetalhe(null)}>Cancelar</Button>
            {fechando && (
              <Button onClick={() => void confirmarFechamento()} disabled={fecharCaixa.isPending}>
                Confirmar fechamento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="text-[11px] uppercase text-slate-500">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

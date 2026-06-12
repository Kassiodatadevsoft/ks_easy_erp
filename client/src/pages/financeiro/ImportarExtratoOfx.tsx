import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileCheck2, Upload } from "lucide-react";

type Conta = { guidConta: string; CONTA: string };
type Preview = {
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  dtInicio: string | null;
  dtFim: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  resumo: { quantidade: number; creditos: number; debitos: number; duplicados: number; novos: number; erros: number };
  movimentos: Array<{ dtMovimento: string; tipo: string; descricao: string; documento: string | null; valor: number; duplicado: boolean }>;
};

const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportarExtratoOfx() {
  const [guidConta, setGuidConta] = useState("");
  const [codFilial, setCodFilial] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const validar = trpc.conciliacaoFinanceira.validarOfx.useMutation({
    onSuccess: (r) => { setPreview(r as Preview); toast.success("Arquivo validado."); },
    onError: (e) => toast.error(e.message),
  });
  const importar = trpc.conciliacaoFinanceira.importarOfx.useMutation({
    onSuccess: (r) => { toast.success(`OFX importado: ${r.inseridos} novos, ${r.duplicados} duplicados.`); setPreview(null); setArquivo(null); },
    onError: (e) => toast.error(e.message),
  });

  async function selecionar(file?: File) {
    if (!file) return;
    const conteudo = await file.text();
    setArquivo({ nome: file.name, conteudo });
    setPreview(null);
  }

  function validarArquivo() {
    if (!guidConta) { toast.error("Selecione a conta bancária."); return; }
    if (!arquivo) { toast.error("Selecione o arquivo OFX."); return; }
    validar.mutate({ nomeArquivo: arquivo.nome, conteudo: arquivo.conteudo, guidContaBancaria: guidConta, codFilial: codFilial ? Number(codFilial) : null });
  }

  function importarArquivo() {
    if (!guidConta || !arquivo) return;
    importar.mutate({ nomeArquivo: arquivo.nome, conteudo: arquivo.conteudo, guidContaBancaria: guidConta, codFilial: codFilial ? Number(codFilial) : null });
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div><h1 className="text-2xl font-bold">Importar Extrato OFX</h1><p className="text-sm text-muted-foreground">Valide o arquivo antes de gravar os movimentos para conciliação.</p></div>
      <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1 md:col-span-2"><Label>Conta bancária *</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(contas as Conta[]).map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Filial</Label><Input value={codFilial} onChange={e => setCodFilial(e.target.value)} /></div>
        <div className="space-y-1"><Label>Arquivo OFX</Label><Input type="file" accept=".ofx,.OFX" onChange={e => selecionar(e.target.files?.[0])} /></div>
        <div className="md:col-span-4 flex gap-2"><Button onClick={validarArquivo} disabled={validar.isPending}><FileCheck2 className="w-4 h-4 mr-2" />Validar</Button><Button onClick={importarArquivo} disabled={!preview || importar.isPending}><Upload className="w-4 h-4 mr-2" />Importar</Button></div>
      </CardContent></Card>
      {preview && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Movimentos</CardTitle></CardHeader><CardContent className="font-bold text-xl">{preview.resumo.quantidade}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Créditos</CardTitle></CardHeader><CardContent className="font-bold text-emerald-700">{moeda(preview.resumo.creditos)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Débitos</CardTitle></CardHeader><CardContent className="font-bold text-red-700">{moeda(preview.resumo.debitos)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Saldo final</CardTitle></CardHeader><CardContent className="font-bold">{preview.saldoFinal == null ? "-" : moeda(preview.saldoFinal)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Duplicados</CardTitle></CardHeader><CardContent className="font-bold">{preview.resumo.duplicados}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Novos</CardTitle></CardHeader><CardContent className="font-bold">{preview.resumo.novos}</CardContent></Card>
        </div>
        <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Descrição</TableHead><TableHead>Doc.</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
          {preview.movimentos.map((m, i) => <TableRow key={i}><TableCell>{m.dtMovimento}</TableCell><TableCell>{m.tipo}</TableCell><TableCell>{m.descricao}</TableCell><TableCell>{m.documento ?? "-"}</TableCell><TableCell className="text-right">{moeda(m.valor)}</TableCell><TableCell>{m.duplicado ? "Duplicado" : "Novo"}</TableCell></TableRow>)}
        </TableBody></Table></CardContent></Card>
      </>}
    </div>
  );
}

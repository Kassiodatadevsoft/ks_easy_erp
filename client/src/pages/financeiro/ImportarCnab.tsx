import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileCheck2, Upload } from "lucide-react";

type Conta = { guidConta: string; CONTA: string };
type Preview = {
  resumo: { quantidade: number; encontrados: number; naoEncontrados: number; erros: number };
  itens: Array<{ linha: number; nossoNumero: string; numeroDoc: string; codigoOcorrencia: string; descricaoOcorrencia: string; valorTitulo: number; valorPago: number; status: string }>;
};
const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportarCnab() {
  const [guidConta, setGuidConta] = useState("");
  const [codFilial, setCodFilial] = useState("");
  const [layout, setLayout] = useState<"CNAB240" | "CNAB400">("CNAB240");
  const [banco, setBanco] = useState("");
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [ultimoCnab, setUltimoCnab] = useState<string | undefined>();
  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const { data: itensImportados = [] } = trpc.conciliacaoFinanceira.listarCnabItens.useQuery({ guidCnab: ultimoCnab }, { enabled: !!ultimoCnab });
  const validar = trpc.conciliacaoFinanceira.validarCnab.useMutation({
    onSuccess: (r) => { setPreview(r as Preview); toast.success("CNAB validado."); },
    onError: (e) => toast.error(e.message),
  });
  const importar = trpc.conciliacaoFinanceira.importarCnab.useMutation({
    onSuccess: (r) => { setUltimoCnab(r.guidCnab); toast.success(`CNAB importado: ${r.encontrados} títulos encontrados.`); },
    onError: (e) => toast.error(e.message),
  });

  async function selecionar(file?: File) {
    if (!file) return;
    setArquivo({ nome: file.name, conteudo: await file.text() });
    setPreview(null);
    setUltimoCnab(undefined);
  }

  function validarArquivo() {
    if (!arquivo) { toast.error("Selecione o arquivo CNAB."); return; }
    validar.mutate({ nomeArquivo: arquivo.nome, conteudo: arquivo.conteudo, layout });
  }

  function importarArquivo() {
    if (!arquivo || !guidConta) { toast.error("Selecione arquivo e conta bancária."); return; }
    importar.mutate({ nomeArquivo: arquivo.nome, conteudo: arquivo.conteudo, layout, banco: banco || null, guidContaBancaria: guidConta, codFilial: codFilial ? Number(codFilial) : null });
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div><h1 className="text-2xl font-bold">Importar CNAB</h1><p className="text-sm text-muted-foreground">Retorno bancário de boletos com pré-validação e log de processamento.</p></div>
      <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="space-y-1"><Label>Layout</Label><Select value={layout} onValueChange={v => setLayout(v as "CNAB240" | "CNAB400")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CNAB240">CNAB 240</SelectItem><SelectItem value="CNAB400">CNAB 400</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label>Banco</Label><Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Itaú, Cora..." /></div>
        <div className="space-y-1"><Label>Conta/Carteira *</Label><Select value={guidConta} onValueChange={setGuidConta}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{(contas as Conta[]).map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Filial</Label><Input value={codFilial} onChange={e => setCodFilial(e.target.value)} /></div>
        <div className="space-y-1"><Label>Arquivo</Label><Input type="file" onChange={e => selecionar(e.target.files?.[0])} /></div>
        <div className="md:col-span-5 flex gap-2"><Button onClick={validarArquivo}><FileCheck2 className="w-4 h-4 mr-2" />Validar arquivo</Button><Button onClick={importarArquivo} disabled={!preview}><Upload className="w-4 h-4 mr-2" />Importar retorno</Button></div>
      </CardContent></Card>
      {preview && <Card><CardContent className="p-0 overflow-x-auto"><div className="p-4 text-sm text-muted-foreground">Registros: {preview.resumo.quantidade} · Erros: {preview.resumo.erros}</div><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Nosso número</TableHead><TableHead>Documento</TableHead><TableHead>Ocorrência</TableHead><TableHead className="text-right">Título</TableHead><TableHead className="text-right">Pago</TableHead></TableRow></TableHeader><TableBody>
        {preview.itens.map(i => <TableRow key={i.linha}><TableCell>{i.linha}</TableCell><TableCell>{i.nossoNumero || "-"}</TableCell><TableCell>{i.numeroDoc || "-"}</TableCell><TableCell>{i.codigoOcorrencia} - {i.descricaoOcorrencia}</TableCell><TableCell className="text-right">{moeda(i.valorTitulo)}</TableCell><TableCell className="text-right">{moeda(i.valorPago)}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>}
      {!!(itensImportados as unknown[]).length && <Card><CardContent className="p-0 overflow-x-auto"><div className="p-4 font-medium">Resultado da importação</div><Table><TableHeader><TableRow><TableHead>Nosso número</TableHead><TableHead>Documento</TableHead><TableHead>Ocorrência</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor pago</TableHead></TableRow></TableHeader><TableBody>
        {(itensImportados as Array<{guidItem:string;nossoNumero:string;numeroDoc:string;descricaoOcorrencia:string;statusProcessamento:string;valorPago:number}>).map(i => <TableRow key={i.guidItem}><TableCell>{i.nossoNumero}</TableCell><TableCell>{i.numeroDoc}</TableCell><TableCell>{i.descricaoOcorrencia}</TableCell><TableCell>{i.statusProcessamento}</TableCell><TableCell className="text-right">{moeda(i.valorPago)}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>}
    </div>
  );
}

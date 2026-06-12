import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const dataHora = (v: string | Date) => new Date(v).toLocaleString("pt-BR");

type Audit = {
  guidAuditoria: string;
  codFilial: number | null;
  guidUsuario: string | null;
  dataHora: string;
  origem: string;
  acao: string;
  tabelaAfetada: string | null;
  guidRegistro: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  observacao: string | null;
  identificacao: string | null;
};

export default function AuditoriaFinanceira() {
  const [filtros, setFiltros] = useState({
    dtInicio: primeiroDiaMes(),
    dtFim: hoje(),
    usuario: "",
    codFilial: "",
    origem: "",
    acao: "",
    tabela: "",
    registro: "",
    busca: "",
  });
  const [aplicado, setAplicado] = useState(filtros);
  const { data = [], isLoading } = trpc.conciliacaoFinanceira.auditoria.useQuery({
    dtInicio: aplicado.dtInicio || undefined,
    dtFim: aplicado.dtFim || undefined,
    usuario: aplicado.usuario || undefined,
    codFilial: aplicado.codFilial ? Number(aplicado.codFilial) : undefined,
    origem: aplicado.origem || undefined,
    acao: aplicado.acao || undefined,
    tabela: aplicado.tabela || undefined,
    registro: aplicado.registro || undefined,
    busca: aplicado.busca || undefined,
  });
  const rows = data as Audit[];

  function setCampo(campo: keyof typeof filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function exportarCsv() {
    const csv = ["Data;Origem;Ação;Tabela;Registro;Usuário;Observação", ...rows.map(r => [r.dataHora, r.origem, r.acao, r.tabelaAfetada ?? "", r.guidRegistro ?? "", r.guidUsuario ?? "", r.observacao ?? ""].join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `auditoria-financeira-${hoje()}.csv`;
    a.click();
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold">Auditoria Financeira</h1><p className="text-sm text-muted-foreground">Histórico de importações, conciliações, baixas e alterações financeiras.</p></div>
        <Button variant="outline" onClick={exportarCsv}>Exportar CSV</Button>
      </div>
      <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-3">
        <div className="space-y-1"><Label className="text-xs">Início</Label><Input type="date" value={filtros.dtInicio} onChange={e => setCampo("dtInicio", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Fim</Label><Input type="date" value={filtros.dtFim} onChange={e => setCampo("dtFim", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Usuário</Label><Input value={filtros.usuario} onChange={e => setCampo("usuario", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Filial</Label><Input value={filtros.codFilial} onChange={e => setCampo("codFilial", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Origem</Label><Input value={filtros.origem} onChange={e => setCampo("origem", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Ação</Label><Input value={filtros.acao} onChange={e => setCampo("acao", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Tabela</Label><Input value={filtros.tabela} onChange={e => setCampo("tabela", e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Registro</Label><Input value={filtros.registro} onChange={e => setCampo("registro", e.target.value)} /></div>
        <div className="space-y-1 xl:col-span-7"><Label className="text-xs">Texto livre</Label><Input value={filtros.busca} onChange={e => setCampo("busca", e.target.value)} /></div>
        <div className="flex items-end"><Button className="w-full" onClick={() => setAplicado(filtros)}><Search className="w-4 h-4 mr-2" />Pesquisar</Button></div>
      </CardContent></Card>
      <Card><CardContent className="p-0 overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Origem</TableHead><TableHead>Ação</TableHead><TableHead>Tabela</TableHead><TableHead>Registro</TableHead><TableHead>Usuário</TableHead><TableHead>Observação</TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>}
          {!isLoading && !rows.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro de auditoria encontrado.</TableCell></TableRow>}
          {rows.map(r => <TableRow key={r.guidAuditoria}><TableCell>{dataHora(r.dataHora)}</TableCell><TableCell>{r.origem}</TableCell><TableCell>{r.acao}</TableCell><TableCell>{r.tabelaAfetada ?? "-"}</TableCell><TableCell className="font-mono text-xs">{r.guidRegistro ?? "-"}</TableCell><TableCell className="font-mono text-xs">{r.guidUsuario ?? "-"}</TableCell><TableCell>{r.observacao ?? r.identificacao ?? "-"}</TableCell></TableRow>)}
        </TableBody>
      </Table></CardContent></Card>
    </div>
  );
}

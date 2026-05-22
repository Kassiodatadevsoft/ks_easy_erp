import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Building2, Plus, Search, ChevronLeft, ChevronRight, Pencil, Loader2 } from "lucide-react";
import EmpresaForm from "@/components/empresas/EmpresaForm";

type Situacao = "A" | "I" | "B" | "TODOS";

const SITUACAO_LABEL: Record<string, { label: string; color: string }> = {
  A: { label: "Ativo", color: "bg-green-100 text-green-700" },
  I: { label: "Inativo", color: "bg-gray-100 text-gray-600" },
  B: { label: "Bloqueado", color: "bg-red-100 text-red-700" },
};

export default function Empresas() {
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("TODOS");
  const [pagina, setPagina] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [guidSelecionado, setGuidSelecionado] = useState<string | null>(null);

  const verificarMaster = trpc.empresas.verificarMaster.useQuery();
  const isMaster = verificarMaster.data?.isMaster ?? false;

  const { data, isLoading, refetch } = trpc.empresas.listar.useQuery({
    busca: busca || undefined,
    situacao: situacao === "TODOS" ? undefined : situacao,
    pagina,
    porPagina: 20,
  });

  const handleBuscar = () => { setBusca(buscaInput); setPagina(1); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleBuscar(); };

  const abrirNovo = () => { setGuidSelecionado(null); setModalAberto(true); };
  const abrirEditar = (guid: string) => { setGuidSelecionado(guid); setModalAberto(true); };
  const fecharModal = (salvo?: boolean) => {
    setModalAberto(false);
    setGuidSelecionado(null);
    if (salvo) refetch();
  };

  const empresas = (data?.dados ?? []) as Record<string, unknown>[];
  const total = data?.total ?? 0;
  const totalPaginas = data?.totalPaginas ?? 1;

  return (
    <div className="flex flex-col h-full">
        {/* Header da página */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Building2 className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
              <p className="text-sm text-gray-500">{total} empresa{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Button onClick={abrirNovo} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
            <Plus className="h-4 w-4" />
            Nova Empresa
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="flex gap-2 flex-1 min-w-[280px]">
            <Input
              placeholder="Buscar por nome, fantasia, documento ou telefone..."
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button variant="outline" onClick={handleBuscar}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select value={situacao} onValueChange={v => { setSituacao(v as Situacao); setPagina(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Situação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas</SelectItem>
              <SelectItem value="A">Ativo</SelectItem>
              <SelectItem value="I">Inativo</SelectItem>
              <SelectItem value="B">Bloqueado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border shadow-sm flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin h-8 w-8 text-purple-600" />
            </div>
          ) : empresas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Building2 className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhuma empresa encontrada</p>
              <p className="text-sm">Tente ajustar os filtros ou cadastre uma nova empresa</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-16">Cód.</TableHead>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>Nome Fantasia</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map(emp => (
                  <TableRow key={String(emp.GUIDPESSOA)} className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirEditar(String(emp.GUIDPESSOA))}>
                    <TableCell className="font-mono text-sm text-gray-500">{String(emp.CODIGO ?? "")}</TableCell>
                    <TableCell className="font-medium text-gray-900">{String(emp.NOME ?? "")}</TableCell>
                    <TableCell className="text-gray-600">{String(emp.FANTASIA ?? "—")}</TableCell>
                    <TableCell className="font-mono text-sm">{String(emp.DOCUMENTO ?? "")}</TableCell>
                    <TableCell className="text-sm">{String(emp.CELULAR ?? "")}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {emp.CIDADE ? `${String(emp.CIDADE)}/${String(emp.UF ?? "")}` : "—"}
                    </TableCell>
                    <TableCell>
                      {emp.SITUACAO ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SITUACAO_LABEL[String(emp.SITUACAO)]?.color ?? ""}`}>
                          {SITUACAO_LABEL[String(emp.SITUACAO)]?.label ?? String(emp.SITUACAO)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); abrirEditar(String(emp.GUIDPESSOA)); }}>
                        <Pencil className="h-4 w-4 text-gray-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              Página {pagina} de {totalPaginas} — {total} registro{total !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      {/* Modal do formulário */}
      <Dialog open={modalAberto} onOpenChange={open => { if (!open) fecharModal(); }}>
        <DialogContent className="w-[95vw] max-w-6xl h-[92vh] max-h-[92vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">Cadastro de Empresa</DialogTitle>
          <EmpresaForm guidPessoa={guidSelecionado} isMaster={isMaster} onClose={fecharModal} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

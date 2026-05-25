import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FuncionarioForm } from "@/components/funcionarios/FuncionarioForm";
import {
  UserCog, Plus, Search, ChevronLeft, ChevronRight,
  Pencil, Loader2,
} from "lucide-react";
import { toast } from "sonner";

const situacaoLabel: Record<string, { label: string; color: string }> = {
  A: { label: "Ativo", color: "bg-green-100 text-green-700 border-green-200" },
  I: { label: "Inativo", color: "bg-gray-100 text-gray-600 border-gray-200" },
  B: { label: "Bloqueado", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function Funcionarios() {
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [situacao, setSituacao] = useState("all");
  const [pagina, setPagina] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [guidSelecionado, setGuidSelecionado] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.funcionarios.listar.useQuery({
    busca: busca || undefined,
    situacao: situacao !== "all" ? situacao : undefined,
    pagina,
    porPagina: 20,
  });

  const handleBuscar = () => {
    setBusca(buscaInput.toUpperCase());
    setPagina(1);
  };

  const handleNovo = () => {
    setGuidSelecionado(null);
    setModalAberto(true);
  };

  const handleEditar = (guid: string) => {
    setGuidSelecionado(guid);
    setModalAberto(true);
  };

  const handleFecharModal = (salvo?: boolean) => {
    setModalAberto(false);
    setGuidSelecionado(null);
    if (salvo) {
      refetch();
      toast.success("Lista atualizada.");
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const funcionarios: any[] = data?.dados ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = data?.totalPaginas ?? 1;

  return (
    <div className="p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow">
            <UserCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Funcionários</h1>
            <p className="text-xs text-gray-400">KS0002.KS00001 — CADUSUARIO = 1</p>
          </div>
        </div>
        <Button onClick={handleNovo} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Novo Funcionário
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1">
          <Input
            className="uppercase"
            placeholder="Buscar por nome, documento ou usuário..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleBuscar()}
          />
          <Button variant="outline" onClick={handleBuscar} className="gap-2 shrink-0">
            <Search className="w-4 h-4" /> Buscar
          </Button>
        </div>
        <Select value={situacao} onValueChange={v => { setSituacao(v); setPagina(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            <SelectItem value="A">Ativo</SelectItem>
            <SelectItem value="I">Inativo</SelectItem>
            <SelectItem value="B">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : funcionarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <UserCog className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Nenhum funcionário encontrado</p>
            <p className="text-sm mt-1">Cadastre o primeiro funcionário clicando em "Novo Funcionário"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Cód.</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Documento</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Cargo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Usuário</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Cidade</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Situação</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {funcionarios.map((f) => {
                  const sit = situacaoLabel[f.SITUACAO] ?? { label: f.SITUACAO, color: "bg-gray-100 text-gray-600 border-gray-200" };
                  return (
                    <tr key={f.GUIDPESSOA} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{f.CODIGO}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{f.NOME}</div>
                        {f.FANTASIA && <div className="text-xs text-gray-400">{f.FANTASIA}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{f.DOCUMENTO}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{f.NOMECARGO ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{f.USUARIO ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{f.CIDADE ? `${f.CIDADE}-${f.UF}` : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs border ${sit.color}`}>{sit.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => handleEditar(f.GUIDPESSOA)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} funcionário{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">Página {pagina} de {totalPaginas}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalAberto} onOpenChange={open => { if (!open) handleFecharModal(); }}>
        <DialogContent className="p-0 border-0 bg-transparent shadow-none max-w-none w-auto">
          <DialogTitle className="sr-only">
            {guidSelecionado ? "Editar Funcionário" : "Novo Funcionário"}
          </DialogTitle>
          {modalAberto && (
            <FuncionarioForm
              guidPessoa={guidSelecionado}
              onClose={handleFecharModal}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

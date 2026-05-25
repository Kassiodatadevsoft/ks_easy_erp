import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Trash2, Loader2, Briefcase,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import CargoForm from "@/components/cargos/CargoForm";

const TIPOS_CARGO: Record<number, string> = {
  0: "CEO",
  1: "Padrão",
  2: "Gerente",
};

const PAINEIS: Record<number, string> = {
  267: "Padrão Cadastro",
  268: "Padrão",
  2501: "Financeiro",
};

export default function Cargos() {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"A" | "I" | "all">("all");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [guidSelecionado, setGuidSelecionado] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.cargos.listar.useQuery(
    { busca: busca || undefined, situacao: situacao === "all" ? undefined : situacao, page, pageSize: 15 },
    {}
  );

  const excluirMutation = trpc.cargos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Cargo inativado com sucesso!");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleNovo = () => {
    setGuidSelecionado(null);
    setModalOpen(true);
  };

  const handleEditar = (guidCargo: string) => {
    setGuidSelecionado(guidCargo);
    setModalOpen(true);
  };

  const handleExcluir = (guidCargo: string, nome: string) => {
    if (!confirm(`Deseja inativar o cargo "${nome}"?`)) return;
    excluirMutation.mutate({ guidCargo });
  };

  const handleFecharModal = (salvo?: boolean) => {
    setModalOpen(false);
    setGuidSelecionado(null);
    if (salvo) refetch();
  };

  const totalPages = data ? Math.ceil(data.total / 15) : 1;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100">
            <Briefcase className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cargos</h1>
            <p className="text-sm text-gray-500">
              {data ? `${data.total} cargo${data.total !== 1 ? "s" : ""} cadastrado${data.total !== 1 ? "s" : ""}` : "Carregando..."}
            </p>
          </div>
        </div>
        <Button onClick={handleNovo} className="bg-purple-600 hover:bg-purple-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Novo Cargo
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome do cargo..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={situacao} onValueChange={v => { setSituacao(v as "A" | "I" | "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="A">Ativo</SelectItem>
            <SelectItem value="I">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin h-8 w-8 text-purple-600" />
          </div>
        ) : !data?.rows.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Briefcase className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhum cargo encontrado</p>
            <p className="text-sm mt-1">Clique em "Novo Cargo" para começar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Cargo</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Classificação</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Dashboard</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Desc. Máx.</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Comissão</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">PDV</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Situação</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.map((row) => (
                  <tr key={row.GUIDCARGO} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.CARGO}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {TIPOS_CARGO[row.CODTIPO] ?? row.CODTIPO}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.CODPAINEL != null ? (PAINEIS[row.CODPAINEL] ?? `Código ${row.CODPAINEL}`) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {Number(row.DESCONTOMAXIMO).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {row.COMISSAO != null ? `${Number(row.COMISSAO).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.PDV
                        ? <Badge className="bg-blue-100 text-blue-700 border-blue-200">Sim</Badge>
                        : <span className="text-gray-400 text-xs">Não</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        className={
                          row.SITUACAO === "A"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-red-100 text-red-700 border-red-200"
                        }
                      >
                        {row.SITUACAO === "A" ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditar(row.GUIDCARGO)}
                          className="h-8 w-8 p-0 hover:bg-purple-50 hover:text-purple-600"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleExcluir(row.GUIDCARGO, row.CARGO)}
                          disabled={excluirMutation.isPending}
                          className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                          title="Inativar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {data && data.total > 15 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-600">
              Página {page} de {totalPages} — {data.total} registros
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={open => { if (!open) handleFecharModal(); }}>
        <DialogContent className="w-[95vw] max-w-2xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {guidSelecionado ? "Editar Cargo" : "Novo Cargo"}
          </DialogTitle>
          <CargoForm
            guidCargo={guidSelecionado}
            onClose={handleFecharModal}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

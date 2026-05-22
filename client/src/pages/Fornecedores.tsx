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
import { Loader2, Plus, Search, Pencil, Truck, ChevronLeft, ChevronRight } from "lucide-react";
import FornecedorForm from "@/components/fornecedores/FornecedorForm";

type Situacao = "A" | "I" | "B";

export default function Fornecedores() {
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [situacao, setSituacao] = useState<Situacao | undefined>(undefined);
  const [pagina, setPagina] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [guidSelecionado, setGuidSelecionado] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.fornecedores.listar.useQuery({
    busca: busca || undefined,
    situacao,
    pagina,
    porPagina: 20,
  });

  const handleBuscar = () => {
    setBusca(buscaInput);
    setPagina(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBuscar();
  };

  const handleNovo = () => {
    setGuidSelecionado(null);
    setModalAberto(true);
  };

  const handleEditar = (guid: string) => {
    setGuidSelecionado(guid);
    setModalAberto(true);
  };

  const handleFechar = (salvo?: boolean) => {
    setModalAberto(false);
    setGuidSelecionado(null);
    if (salvo) refetch();
  };

  const situacaoBadge = (s: string) => {
    if (s === "A") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Ativo</Badge>;
    if (s === "I") return <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">Inativo</Badge>;
    if (s === "B") return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Bloqueado</Badge>;
    return <Badge variant="outline" className="text-xs">{s}</Badge>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data?.dados ?? []) as any[];
  const total = data?.total ?? 0;
  const totalPaginas = data?.totalPaginas ?? 1;

  return (
    <div className="p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center shadow">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fornecedores</h1>
            <p className="text-xs text-gray-400">{total} registro{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Button onClick={handleNovo} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2">
          <Input
            placeholder="Buscar por nome, fantasia, documento ou telefone..."
            value={buscaInput}
            onChange={e => setBuscaInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleBuscar} className="shrink-0 gap-1">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Buscar</span>
          </Button>
        </div>
        <Select
          value={situacao ?? "TODOS"}
          onValueChange={v => {
            setSituacao(v === "TODOS" ? undefined : (v as Situacao));
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="A">Ativo</SelectItem>
            <SelectItem value="I">Inativo</SelectItem>
            <SelectItem value="B">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Truck className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum fornecedor encontrado</p>
            <p className="text-xs mt-1">Tente ajustar os filtros ou cadastre um novo fornecedor</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cód.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome / Razão Social</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Fantasia</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Documento</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Celular</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Cidade</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.GUIDPESSOA} className="hover:bg-orange-50/40 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.CODIGO}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{row.NOME}</td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell max-w-[150px] truncate">{row.FANTASIA || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden md:table-cell">{row.DOCUMENTO || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{row.CELULAR || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">
                      {row.CIDADE ? `${row.CIDADE}-${row.UF}` : "—"}
                    </td>
                    <td className="px-4 py-3">{situacaoBadge(row.SITUACAO)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditar(row.GUIDPESSOA)}
                        className="h-7 w-7 p-0 text-gray-400 hover:text-orange-600 hover:bg-orange-50"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {!isLoading && totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              Página {pagina} de {totalPaginas} ({total} registros)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="h-7 gap-1 text-xs"
              >
                <ChevronLeft className="w-3 h-3" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="h-7 gap-1 text-xs"
              >
                Próxima
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <FornecedorForm guidPessoa={guidSelecionado} onClose={handleFechar} />
      )}
    </div>
  );
}

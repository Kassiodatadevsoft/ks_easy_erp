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
import { Truck, Plus, Search, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import TransportadoraForm from "@/components/transportadoras/TransportadoraForm";

export default function Transportadoras() {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [situacao, setSituacao] = useState("all");
  const [pagina, setPagina] = useState(1);
  const [formAberto, setFormAberto] = useState(false);
  const [guidSelecionado, setGuidSelecionado] = useState<string | null>(null);

  const POR_PAGINA = 20;

  const { data, isLoading, refetch } = trpc.transportadoras.listar.useQuery({
    pagina,
    porPagina: POR_PAGINA,
    busca: buscaAtiva || undefined,
    situacao: situacao !== "all" ? situacao : undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.ceil(total / POR_PAGINA);

  const handleBuscar = () => {
    setBuscaAtiva(busca);
    setPagina(1);
  };

  const handleNovo = () => {
    setGuidSelecionado(null);
    setFormAberto(true);
  };

  const handleEditar = (guid: string) => {
    setGuidSelecionado(guid);
    setFormAberto(true);
  };

  const handleFecharForm = (salvo?: boolean) => {
    setFormAberto(false);
    setGuidSelecionado(null);
    if (salvo) refetch();
  };

  const situacaoLabel = (s: string) => {
    if (s === "A") return <Badge className="bg-green-100 text-green-700 border-green-200">Ativo</Badge>;
    if (s === "I") return <Badge className="bg-gray-100 text-gray-600 border-gray-200">Inativo</Badge>;
    if (s === "B") return <Badge className="bg-red-100 text-red-700 border-red-200">Bloqueado</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {formAberto && (
        <TransportadoraForm
          guidPessoa={guidSelecionado}
          onClose={handleFecharForm}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Truck className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Transportadoras</h1>
            <p className="text-xs text-gray-500">KS0002.KS00001 — CADTRANSPORTADORA = 1</p>
          </div>
        </div>
        <Button onClick={handleNovo} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          Nova Transportadora
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="BUSCAR POR NOME, DOCUMENTO..."
            value={busca}
            onChange={e => setBusca(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleBuscar()}
            className="flex-1"
          />
          <Button variant="outline" onClick={handleBuscar}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
        <Select value={situacao} onValueChange={v => { setSituacao(v); setPagina(1); }}>
          <SelectTrigger className="w-44">
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Cód.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Documento</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Telefone</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Cidade</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Situação</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 uppercase text-xs tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>Nenhuma transportadora encontrada.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.GUIDPESSOA} className="border-b border-gray-100 hover:bg-orange-50/40 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.CODPESSOA}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.NOME}</div>
                      {item.FANTASIA && <div className="text-xs text-gray-400">{item.FANTASIA}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.DOCUMENTO}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{item.CELULAR || item.TELEFONE || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {item.CIDADE ? `${item.CIDADE}${item.UF ? ` - ${item.UF}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">{situacaoLabel(item.SITUACAO)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEditar(item.GUIDPESSOA)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">
              {total} transportadora{total !== 1 ? "s" : ""} encontrada{total !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-600">
                {pagina} / {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

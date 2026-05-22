import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Search, Edit2, ChevronLeft, ChevronRight, Users } from "lucide-react";
import ClienteForm from "@/components/clientes/ClienteForm";

type Situacao = "A" | "I" | "B" | undefined;

function badgeSituacao(s: string) {
  if (s === "A") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Ativo</Badge>;
  if (s === "I") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Inativo</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">Bloqueado</Badge>;
}

function formatDoc(doc: string, tipo: string) {
  if (!doc) return "-";
  const d = doc.replace(/\D/g, "");
  if (tipo === "F" && d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (tipo === "J" && d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

export default function Clientes() {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("A");
  const [pagina, setPagina] = useState(1);
  const [formAberto, setFormAberto] = useState(false);
  const [guidEdicao, setGuidEdicao] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.clientes.listar.useQuery({
    busca: buscaAtiva,
    situacao,
    pagina,
    porPagina: 20,
  });

  const handleBuscar = useCallback(() => {
    setBuscaAtiva(busca);
    setPagina(1);
  }, [busca]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBuscar();
  };

  const abrirNovo = () => {
    setGuidEdicao(null);
    setFormAberto(true);
  };

  const abrirEdicao = (guid: string) => {
    setGuidEdicao(guid);
    setFormAberto(true);
  };

  const fecharForm = (salvo?: boolean) => {
    setFormAberto(false);
    setGuidEdicao(null);
    if (salvo) refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-500">Cadastro de clientes da empresa</p>
          </div>
        </div>
        <Button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <UserPlus className="w-4 h-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Pesquisar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Nome, fantasia, documento ou telefone..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
          <div className="w-40">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Situação</label>
              <Select value={situacao ?? ""} onValueChange={v => { setSituacao(v === "" ? undefined : v as Situacao); setPagina(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="A">Ativo</SelectItem>
                <SelectItem value="I">Inativo</SelectItem>
                <SelectItem value="B">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleBuscar} variant="outline" className="gap-2">
            <Search className="w-4 h-4" />
            Buscar
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold text-gray-700">Cód.</TableHead>
                <TableHead className="font-semibold text-gray-700">Nome / Razão Social</TableHead>
                <TableHead className="font-semibold text-gray-700">Fantasia</TableHead>
                <TableHead className="font-semibold text-gray-700">Documento</TableHead>
                <TableHead className="font-semibold text-gray-700">Telefone</TableHead>
                <TableHead className="font-semibold text-gray-700">Cidade/UF</TableHead>
                <TableHead className="font-semibold text-gray-700">Situação</TableHead>
                <TableHead className="font-semibold text-gray-700 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : data?.dados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-10 h-10 text-gray-300" />
                      <span className="text-sm">Nenhum cliente encontrado</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data?.dados.map((c: any) => (
                  <TableRow key={c.GUIDPESSOA} className="hover:bg-blue-50/40 transition-colors">
                    <TableCell className="font-mono text-sm text-gray-500">{c.CODIGO}</TableCell>
                    <TableCell className="font-medium text-gray-900 max-w-[200px] truncate">{c.NOME}</TableCell>
                    <TableCell className="text-gray-600 max-w-[150px] truncate">{c.FANTASIA || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{formatDoc(c.DOCUMENTO, c.CODTIPODOCUMENTO)}</TableCell>
                    <TableCell className="text-sm">{c.CELULAR || c.TELEFONE || "-"}</TableCell>
                    <TableCell className="text-sm">{c.CIDADE ? `${c.CIDADE}/${c.UF}` : "-"}</TableCell>
                    <TableCell>{badgeSituacao(c.SITUACAO)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-blue-100"
                        onClick={() => abrirEdicao(c.GUIDPESSOA)}
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {data && data.totalPaginas > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              {data.total} cliente{data.total !== 1 ? "s" : ""} encontrado{data.total !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pagina <= 1}
                onClick={() => setPagina(p => p - 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700">
                {pagina} / {data.totalPaginas}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pagina >= data.totalPaginas}
                onClick={() => setPagina(p => p + 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de formulário */}
      {formAberto && (
        <ClienteForm
          guidPessoa={guidEdicao}
          onClose={fecharForm}
        />
      )}
    </div>
  );
}

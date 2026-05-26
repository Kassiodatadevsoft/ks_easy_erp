import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, ChevronLeft, ChevronRight, Building2, Truck, UserCheck, ShoppingCart, Package } from "lucide-react";
import { Link } from "wouter";

type Entidade = {
  GUIDPESSOA: string;
  CODIGO?: number;
  NOME: string;
  FANTASIA: string | null;
  DOCUMENTO: string;
  CODTIPODOCUMENTO: string;
  TELEFONE: string | null;
  CELULAR: string | null;
  EMAIL: string | null;
  SITUACAO: string;
  CADCLIENTE: boolean;
  CADFORNECEDOR: boolean;
  CADUSUARIO: boolean;
  CADTRANSPORTADORA: boolean;
  CADEMPRESA: boolean;
  CIDADE?: string | null;
  UF?: string | null;
};

type TipoFiltro = "todos" | "cliente" | "fornecedor" | "funcionario" | "transportadora" | "empresa";

const SITUACAO_CONFIG: Record<string, { label: string; cls: string }> = {
  A: { label: "Ativo", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  I: { label: "Inativo", cls: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  B: { label: "Bloqueado", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const TIPO_ICONS: Record<TipoFiltro, React.ReactNode> = {
  todos: <Users className="h-4 w-4" />,
  cliente: <ShoppingCart className="h-4 w-4" />,
  fornecedor: <Package className="h-4 w-4" />,
  funcionario: <UserCheck className="h-4 w-4" />,
  transportadora: <Truck className="h-4 w-4" />,
  empresa: <Building2 className="h-4 w-4" />,
};

const TIPO_LABELS: Record<TipoFiltro, string> = {
  todos: "Todos",
  cliente: "Clientes",
  fornecedor: "Fornecedores",
  funcionario: "Funcionários",
  transportadora: "Transportadoras",
  empresa: "Empresas",
};

function getTipoLink(e: Entidade): string {
  if (e.CADEMPRESA) return "/cadastros/empresas";
  if (e.CADTRANSPORTADORA) return "/cadastros/transportadoras";
  if (e.CADFORNECEDOR) return "/cadastros/fornecedores";
  if (e.CADCLIENTE) return "/cadastros/clientes";
  return "/cadastros/funcionarios";
}

function getTipoBadges(e: Entidade) {
  const badges: { label: string; cls: string }[] = [];
  if (e.CADCLIENTE) badges.push({ label: "Cliente", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" });
  if (e.CADFORNECEDOR) badges.push({ label: "Fornecedor", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" });
  if (e.CADTRANSPORTADORA) badges.push({ label: "Transportadora", cls: "bg-purple-500/20 text-purple-400 border-purple-500/30" });
  if (e.CADEMPRESA) badges.push({ label: "Empresa", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" });
  if (e.CADUSUARIO) badges.push({ label: "Usuário", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" });
  return badges;
}

export default function Entidades() {
  const [busca, setBusca] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [situacao, setSituacao] = useState("A");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 25;

  const { data, isLoading } = trpc.entidades.list.useQuery({
    tipo: tipo !== "todos" ? tipo : "todos",
    situacao: situacao !== "todos" ? (situacao as "A" | "I" | "todos") : "todos",
    busca: busca || undefined,
    page: pagina,
    pageSize: POR_PAGINA,
  });

  const itens: Entidade[] = (data?.data ?? []) as unknown as Entidade[];
  const total = data?.total ?? 0;
  const totalPaginas = data?.totalPages ?? 1;

  function handleBuscar() { setBusca(buscaInput); setPagina(1); }
  function handleKeyDown(e: React.KeyboardEvent) { if (e.key === "Enter") handleBuscar(); }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Users className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cadastro de Entidades</h1>
            <p className="text-sm text-muted-foreground">{total} registro{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Filtros de tipo */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(TIPO_LABELS) as TipoFiltro[]).map(t => (
          <Button
            key={t}
            variant={tipo === t ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => { setTipo(t); setPagina(1); }}
          >
            {TIPO_ICONS[t]}
            {TIPO_LABELS[t]}
          </Button>
        ))}
      </div>

      {/* Barra de busca e situação */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, fantasia, documento..."
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-9"
            />
          </div>
          <Button onClick={handleBuscar} variant="outline">Buscar</Button>
        </div>
        <Select value={situacao} onValueChange={v => { setSituacao(v); setPagina(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="A">Ativas</SelectItem>
            <SelectItem value="I">Inativas</SelectItem>
            <SelectItem value="B">Bloqueadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-muted-foreground w-16">Cód.</TableHead>
              <TableHead className="text-muted-foreground">Nome / Fantasia</TableHead>
              <TableHead className="text-muted-foreground">Documento</TableHead>
              <TableHead className="text-muted-foreground">Contato</TableHead>
              <TableHead className="text-muted-foreground">Tipos</TableHead>
              <TableHead className="text-muted-foreground">Situação</TableHead>
              <TableHead className="text-muted-foreground text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">Nenhuma entidade encontrada</p>
                </TableCell>
              </TableRow>
            ) : (
              itens.map(e => {
                const badges = getTipoBadges(e);
                const sit = SITUACAO_CONFIG[e.SITUACAO] ?? { label: e.SITUACAO, cls: "" };
                return (
                  <TableRow key={e.GUIDPESSOA} className="border-white/5 hover:bg-white/5">
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.CODIGO}</TableCell>
                    <TableCell>
                      <div className="font-medium">{e.NOME}</div>
                      {e.FANTASIA && <div className="text-xs text-muted-foreground">{e.FANTASIA}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.DOCUMENTO}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.CELULAR || e.TELEFONE || "—"}
                      {e.EMAIL && <div className="truncate max-w-[160px]">{e.EMAIL}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {badges.map(b => (
                          <Badge key={b.label} variant="outline" className={`text-xs ${b.cls}`}>{b.label}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${sit.cls}`}>{sit.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={getTipoLink(e)}>
                        <Button size="sm" variant="ghost" className="text-xs h-7">
                          Ver módulo
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {pagina} de {totalPaginas} — {total} registros</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

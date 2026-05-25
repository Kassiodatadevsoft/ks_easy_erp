import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, Package, Star } from "lucide-react";
import { ProdutoForm } from "@/components/produtos/ProdutoForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Produtos() {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"TODOS" | "A" | "I">("A");
  const [guidCategoria, setGuidCategoria] = useState<string>("TODOS");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [guidEditando, setGuidEditando] = useState<string | undefined>();
  const [guidExcluindo, setGuidExcluindo] = useState<string | undefined>();

  const utils = trpc.useUtils();

  const { data: categorias } = trpc.categorias.listarTodas.useQuery();

  const { data, isLoading } = trpc.produtos.listar.useQuery({
    busca: busca || undefined,
    situacao,
    guidCategoria: guidCategoria !== "TODOS" ? guidCategoria : undefined,
    pagina,
    porPagina: POR_PAGINA,
  });

  const excluirMutation = trpc.produtos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Produto inativado com sucesso");
      utils.produtos.listar.invalidate();
      setGuidExcluindo(undefined);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao inativar produto");
    },
  });

  const totalPaginas = Math.ceil((data?.total ?? 0) / POR_PAGINA);

  function abrirNovo() {
    setGuidEditando(undefined);
    setFormOpen(true);
  }

  function abrirEditar(guid: string) {
    setGuidEditando(guid);
    setFormOpen(true);
  }

  function handleSalvo() {
    setFormOpen(false);
    setGuidEditando(undefined);
  }

  function formatarPreco(precos: string | null): string {
    if (!precos) return "—";
    try {
      const obj = JSON.parse(precos);
      const vals = Object.values(obj) as number[];
      if (vals.length === 1) return `R$ ${vals[0].toFixed(2)}`;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (min === max) return `R$ ${min.toFixed(2)}`;
      return `R$ ${min.toFixed(2)} – R$ ${max.toFixed(2)}`;
    } catch {
      return "—";
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Produtos</h1>
            <p className="text-sm text-muted-foreground">
              Cardápio de produtos para o delivery e sistema de vendas
            </p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, descrição ou código ERP..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            className="pl-9"
          />
        </div>
        <Select value={guidCategoria} onValueChange={v => { setGuidCategoria(v); setPagina(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas as categorias</SelectItem>
            {categorias?.map(cat => (
              <SelectItem key={cat.GUIDCATEGORIA} value={cat.GUIDCATEGORIA}>
                {cat.CATEGORIA}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={situacao} onValueChange={v => { setSituacao(v as typeof situacao); setPagina(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="A">Ativos</SelectItem>
            <SelectItem value="I">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="w-40">Categoria</TableHead>
              <TableHead className="w-44">Preço(s)</TableHead>
              <TableHead className="w-28">Cód. ERP</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.registros?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {busca ? "Nenhum produto encontrado para esta busca" : "Nenhum produto cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              data.registros.map(prod => (
                <TableRow key={prod.GUIDPRODUTO} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{prod.CODPRODUTO}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {prod.DESTAQUE && (
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0" aria-label="Destaque" />
                      )}
                      <span className="font-medium">{prod.PRODUTO}</span>
                    </div>
                    {prod.DESCRICAO && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{prod.DESCRICAO}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {prod.CATEGORIA ? (
                      <Badge variant="outline" className="text-xs">{prod.CATEGORIA}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatarPreco(prod.PRECOS)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {prod.ERPCODE || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={prod.SITUACAO === "A" ? "default" : "secondary"}>
                      {prod.SITUACAO === "A" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => abrirEditar(prod.GUIDPRODUTO)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setGuidExcluindo(prod.GUIDPRODUTO)}
                        title="Inativar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {(data?.total ?? 0) > POR_PAGINA && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, data?.total ?? 0)} de {data?.total} produtos
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-2">{pagina}/{totalPaginas}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de formulário */}
      <ProdutoForm
        guidProduto={guidEditando}
        open={formOpen}
        onClose={() => { setFormOpen(false); setGuidEditando(undefined); }}
        onSalvo={handleSalvo}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(guidExcluindo)} onOpenChange={v => !v && setGuidExcluindo(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Este produto será inativado e não aparecerá mais no delivery. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => guidExcluindo && excluirMutation.mutate({ guidProduto: guidExcluindo })}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

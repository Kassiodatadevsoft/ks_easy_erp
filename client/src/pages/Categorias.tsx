import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { CategoriaForm } from "@/components/categorias/CategoriaForm";
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

export default function Categorias() {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"TODOS" | "A" | "I">("A");
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [guidEditando, setGuidEditando] = useState<string | undefined>();
  const [guidExcluindo, setGuidExcluindo] = useState<string | undefined>();

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.categorias.listar.useQuery({
    busca: busca || undefined,
    situacao,
    pagina,
    porPagina: POR_PAGINA,
  });

  const excluirMutation = trpc.categorias.excluir.useMutation({
    onSuccess: () => {
      toast.success("Categoria inativada com sucesso");
      utils.categorias.listar.invalidate();
      utils.categorias.listarTodas.invalidate();
      setGuidExcluindo(undefined);
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao inativar categoria");
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

  return (
    <div className="p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Categorias</h1>
            <p className="text-sm text-muted-foreground">
              Categorias de produtos para o cardápio do delivery
            </p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Categoria
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
            className="pl-9"
          />
        </div>
        <Select value={situacao} onValueChange={v => { setSituacao(v as typeof situacao); setPagina(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas</SelectItem>
            <SelectItem value="A">Ativas</SelectItem>
            <SelectItem value="I">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Código</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24">Ordem</TableHead>
              <TableHead className="w-24">Situação</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.registros?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {busca ? "Nenhuma categoria encontrada para esta busca" : "Nenhuma categoria cadastrada"}
                </TableCell>
              </TableRow>
            ) : (
              data.registros.map(cat => (
                <TableRow key={cat.GUIDCATEGORIA} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-sm">{cat.CODCATEGORIA}</TableCell>
                  <TableCell className="font-medium">{cat.CATEGORIA}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cat.DESCRICAO || "—"}
                  </TableCell>
                  <TableCell className="text-center">{cat.ORDEMEXIBICAO}</TableCell>
                  <TableCell>
                    <Badge variant={cat.SITUACAO === "A" ? "default" : "secondary"}>
                      {cat.SITUACAO === "A" ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => abrirEditar(cat.GUIDCATEGORIA)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setGuidExcluindo(cat.GUIDCATEGORIA)}
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
            {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, data?.total ?? 0)} de {data?.total} categorias
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
      <CategoriaForm
        guidCategoria={guidEditando}
        open={formOpen}
        onClose={() => { setFormOpen(false); setGuidEditando(undefined); }}
        onSalvo={handleSalvo}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(guidExcluindo)} onOpenChange={v => !v && setGuidExcluindo(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Esta categoria será inativada e não aparecerá mais no delivery. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => guidExcluindo && excluirMutation.mutate({ guidCategoria: guidExcluindo })}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

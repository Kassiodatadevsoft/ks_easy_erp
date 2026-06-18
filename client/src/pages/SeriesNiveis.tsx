import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useKsAuth } from "@/hooks/useKsAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

type SerieNivel = {
  GUIDSERIE: string;
  GUIDENTIDADE: string;
  DESCRICAO: string;
  ORDEM: number | null;
  SITUACAO: boolean;
  DATACADASTRO: string;
  ULTIMAALTERACAO: string;
};

type SituacaoFiltro = "ATIVAS" | "INATIVAS" | "TODAS";

const FORM_INICIAL = {
  DESCRICAO: "",
  ORDEM: "",
  SITUACAO: true,
};

async function readJson<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok || json?.success === false) {
    throw new Error(json?.message ?? "Falha ao processar solicitacao.");
  }
  return json as T;
}

export default function SeriesNiveis() {
  const { guidEntidade } = useKsAuth();
  const [series, setSeries] = useState<SerieNivel[]>([]);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<SituacaoFiltro>("ATIVAS");
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<SerieNivel | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [excluindo, setExcluindo] = useState<SerieNivel | null>(null);
  const [salvando, setSalvando] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (guidEntidade) params.set("guidEntidade", guidEntidade);
    params.set("situacao", situacao);
    if (busca.trim()) params.set("busca", busca.trim());
    return params.toString();
  }, [guidEntidade, situacao, busca]);

  async function carregar() {
    if (!guidEntidade) return;
    setLoading(true);
    try {
      const json = await readJson<{ success: true; dados: SerieNivel[] }>(await fetch(`/api/series?${query}`));
      setSeries(json.dados);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar series/niveis.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [query]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_INICIAL);
    setModalAberto(true);
  }

  function abrirEditar(serie: SerieNivel) {
    setEditando(serie);
    setForm({
      DESCRICAO: serie.DESCRICAO,
      ORDEM: serie.ORDEM == null ? "" : String(serie.ORDEM),
      SITUACAO: Boolean(serie.SITUACAO),
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setForm(FORM_INICIAL);
  }

  async function salvar() {
    if (!guidEntidade) return;
    if (!form.DESCRICAO.trim()) {
      toast.error("Informe a descricao da Serie/Nivel.");
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        GUIDENTIDADE: guidEntidade,
        DESCRICAO: form.DESCRICAO.trim(),
        ORDEM: form.ORDEM === "" ? null : Number(form.ORDEM),
        SITUACAO: form.SITUACAO,
      };
      const response = await fetch(editando ? `/api/series/${editando.GUIDSERIE}` : "/api/series", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readJson(response);
      toast.success(editando ? "Serie/Nivel atualizada." : "Serie/Nivel cadastrada.");
      fecharModal();
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar Serie/Nivel.");
    } finally {
      setSalvando(false);
    }
  }

  async function inativar() {
    if (!guidEntidade || !excluindo) return;
    setSalvando(true);
    try {
      const params = new URLSearchParams({ guidEntidade });
      await readJson(await fetch(`/api/series/${excluindo.GUIDSERIE}?${params.toString()}`, { method: "DELETE" }));
      toast.success("Serie/Nivel inativada.");
      setExcluindo(null);
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao inativar Serie/Nivel.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Series/Niveis</h1>
            <p className="text-sm text-muted-foreground">Cadastro usado nas turmas regulares, multisseriadas e matriculas.</p>
          </div>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Serie/Nivel
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por descricao"
            className="pl-9"
          />
        </div>
        <Select value={situacao} onValueChange={(value) => setSituacao(value as SituacaoFiltro)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ATIVAS">Ativas</SelectItem>
            <SelectItem value="INATIVAS">Inativas</SelectItem>
            <SelectItem value="TODAS">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descricao</TableHead>
              <TableHead className="w-28 text-center">Ordem</TableHead>
              <TableHead className="w-28 text-center">Situacao</TableHead>
              <TableHead className="w-28 text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : series.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma Serie/Nivel encontrada.</TableCell>
              </TableRow>
            ) : (
              series.map((serie) => (
                <TableRow key={serie.GUIDSERIE}>
                  <TableCell className="font-medium">{serie.DESCRICAO}</TableCell>
                  <TableCell className="text-center">{serie.ORDEM ?? "-"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={serie.SITUACAO ? "default" : "secondary"}>
                      {serie.SITUACAO ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(serie)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setExcluindo(serie)} title="Inativar">
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

      <Dialog open={modalAberto} onOpenChange={(open) => !open && fecharModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Serie/Nivel" : "Nova Serie/Nivel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descricao *</Label>
              <Input
                value={form.DESCRICAO}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, DESCRICAO: event.target.value }))}
                placeholder="Ex: 1 Ano"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                value={form.ORDEM}
                type="number"
                min={0}
                onChange={(event) => setForm((current) => ({ ...current, ORDEM: event.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="serie-situacao">Ativa</Label>
              <Switch
                id="serie-situacao"
                checked={form.SITUACAO}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, SITUACAO: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(open) => !open && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Serie/Nivel</AlertDialogTitle>
            <AlertDialogDescription>
              A Serie/Nivel sera inativada. O sistema bloqueia a operacao se ela estiver usada em turma ou matricula.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={inativar} disabled={salvando}>
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

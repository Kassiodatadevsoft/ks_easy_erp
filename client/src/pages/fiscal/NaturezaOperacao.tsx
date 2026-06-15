import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Edit2, FilePlus2, Plus, RefreshCw, Search, XCircle } from "lucide-react";

type NaturezaOperacaoRow = {
  guidNaturezaOperacao: string;
  descricao: string;
  tipoOperacao: "E" | "S";
  situacao: boolean;
  dataCadastro?: string;
  ultimaAlteracao?: string;
};

const FORM_INICIAL = {
  descricao: "",
  tipoOperacao: "S" as "E" | "S",
  situacao: true,
};

function tipoLabel(tipo: string) {
  return tipo === "E" ? "Entrada" : "Saida";
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message ?? "Nao foi possivel processar a solicitacao.");
  }
  return data as T;
}

export default function NaturezaOperacao() {
  const [naturezas, setNaturezas] = useState<NaturezaOperacaoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<NaturezaOperacaoRow | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);

  async function carregar() {
    setIsLoading(true);
    try {
      const result = await requestJson<{ dados: NaturezaOperacaoRow[] }>("/api/fiscal/natureza-operacao");
      setNaturezas(result.dados ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel listar as naturezas.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    return naturezas.filter((natureza) => {
      if (filtroSituacao === "ativos" && !natureza.situacao) return false;
      if (filtroSituacao === "inativos" && natureza.situacao) return false;
      if (!termo) return true;
      return natureza.descricao.toUpperCase().includes(termo);
    });
  }, [busca, filtroSituacao, naturezas]);

  function abrirNova() {
    setEditando(null);
    setForm(FORM_INICIAL);
    setModalAberto(true);
  }

  function abrirEditar(natureza: NaturezaOperacaoRow) {
    setEditando(natureza);
    setForm({
      descricao: natureza.descricao,
      tipoOperacao: natureza.tipoOperacao,
      situacao: Boolean(natureza.situacao),
    });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setForm(FORM_INICIAL);
  }

  async function salvar() {
    if (!form.descricao.trim()) {
      toast.error("Informe a descricao da natureza da operacao.");
      return;
    }

    try {
      if (editando) {
        await requestJson(`/api/fiscal/natureza-operacao/${editando.guidNaturezaOperacao}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast.success("Natureza da operacao atualizada.");
      } else {
        await requestJson("/api/fiscal/natureza-operacao", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success("Natureza da operacao cadastrada.");
      }
      fecharModal();
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar.");
    }
  }

  async function inativar(natureza: NaturezaOperacaoRow) {
    try {
      await requestJson(`/api/fiscal/natureza-operacao/${natureza.guidNaturezaOperacao}`, { method: "DELETE" });
      toast.success("Natureza da operacao inativada.");
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel inativar.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-blue-50 p-2 text-blue-700">
            <FilePlus2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Natureza da Operacao / NOP</h1>
            <p className="text-sm text-slate-500">Cadastro fiscal de naturezas por empresa.</p>
          </div>
        </div>
        <Button className="gap-2" onClick={abrirNova}>
          <Plus className="h-4 w-4" />
          Nova Natureza
        </Button>
      </div>

      <Card className="rounded-md border-slate-200 shadow-sm">
        <CardHeader className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Cadastros</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input className="pl-9 sm:w-72" placeholder="Buscar descricao" value={busca} onChange={(event) => setBusca(event.target.value)} />
            </div>
            <Select value={filtroSituacao} onValueChange={(value) => setFiltroSituacao(value as "todos" | "ativos" | "inativos")}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void carregar()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Descricao</TableHead>
                  <TableHead className="w-40">Tipo</TableHead>
                  <TableHead className="w-32">Situacao</TableHead>
                  <TableHead className="w-28 text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-20 text-center">Carregando...</TableCell></TableRow>
                ) : filtradas.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-20 text-center text-slate-500">Nenhuma natureza encontrada.</TableCell></TableRow>
                ) : (
                  filtradas.map((natureza) => (
                    <TableRow key={natureza.guidNaturezaOperacao}>
                      <TableCell>
                        <div className="font-medium text-slate-950">{natureza.descricao}</div>
                        <div className="font-mono text-xs text-slate-500">{natureza.guidNaturezaOperacao}</div>
                      </TableCell>
                      <TableCell>{tipoLabel(natureza.tipoOperacao)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={natureza.situacao ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}>
                          {natureza.situacao ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => abrirEditar(natureza)} title="Editar">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => void inativar(natureza)} title="Inativar">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalAberto} onOpenChange={(open) => !open && fecharModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Natureza da Operacao" : "Nova Natureza da Operacao"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descricao da Natureza da Operacao</Label>
              <Input value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo da Operacao</Label>
              <Select value={form.tipoOperacao} onValueChange={(value) => setForm((current) => ({ ...current, tipoOperacao: value as "E" | "S" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E">Entrada</SelectItem>
                  <SelectItem value="S">Saida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <Label>Situacao</Label>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>{form.situacao ? "Ativo" : "Inativo"}</span>
                <Switch checked={form.situacao} onCheckedChange={(checked) => setForm((current) => ({ ...current, situacao: checked }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={() => void salvar()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

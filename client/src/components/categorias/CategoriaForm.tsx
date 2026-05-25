import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface CategoriaFormProps {
  guidCategoria?: string;
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

interface FormData {
  categoria: string;
  descricao: string;
  slug: string;
  ordemExibicao: number;
  situacao: "A" | "I";
}

const FORM_INICIAL: FormData = {
  categoria: "",
  descricao: "",
  slug: "",
  ordemExibicao: 0,
  situacao: "A",
};

export function CategoriaForm({ guidCategoria, open, onClose, onSalvo }: CategoriaFormProps) {
  const isEdicao = Boolean(guidCategoria);
  const [form, setForm] = useState<FormData>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<keyof FormData, string>>>({});

  // Carregar dados para edição
  const { data: categoriaData } = trpc.categorias.buscarPorGuid.useQuery(
    { guidCategoria: guidCategoria! },
    { enabled: isEdicao && open }
  );

  // Validação em tempo real do nome
  const [nomeDebounced, setNomeDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setNomeDebounced(form.categoria), 400);
    return () => clearTimeout(t);
  }, [form.categoria]);

  const { data: validacaoNome } = trpc.categorias.validarNome.useQuery(
    { categoria: nomeDebounced, guidCategoria },
    { enabled: nomeDebounced.length >= 2 }
  );

  // Preencher form ao carregar dados de edição
  useEffect(() => {
    if (categoriaData) {
      setForm({
        categoria: categoriaData.CATEGORIA ?? "",
        descricao: categoriaData.DESCRICAO ?? "",
        slug: categoriaData.SLUG ?? "",
        ordemExibicao: categoriaData.ORDEMEXIBICAO ?? 0,
        situacao: (categoriaData.SITUACAO as "A" | "I") ?? "A",
      });
    } else if (!isEdicao) {
      setForm(FORM_INICIAL);
    }
  }, [categoriaData, isEdicao]);

  // Limpar ao fechar
  useEffect(() => {
    if (!open) {
      setForm(FORM_INICIAL);
      setErros({});
    }
  }, [open]);

  const utils = trpc.useUtils();
  const criarMutation = trpc.categorias.criar.useMutation();
  const atualizarMutation = trpc.categorias.atualizar.useMutation();

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (erros[key]) setErros(prev => ({ ...prev, [key]: undefined }));
  }

  function setTexto(key: keyof FormData, value: string) {
    setField(key, value.toUpperCase() as FormData[typeof key]);
  }

  function gerarSlug(nome: string): string {
    return nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function validar(): boolean {
    const novosErros: Partial<Record<keyof FormData, string>> = {};
    if (!form.categoria.trim()) novosErros.categoria = "Nome da categoria é obrigatório";
    if (validacaoNome && !validacaoNome.disponivel) novosErros.categoria = "Já existe uma categoria com este nome";
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }

  async function handleSalvar() {
    if (!validar()) return;
    setSalvando(true);
    try {
      const payload = {
        categoria: form.categoria,
        descricao: form.descricao || undefined,
        slug: form.slug || gerarSlug(form.categoria) || undefined,
        ordemExibicao: form.ordemExibicao,
        situacao: form.situacao,
      };

      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidCategoria: guidCategoria!, ...payload });
        toast.success("Categoria atualizada com sucesso!");
      } else {
        await criarMutation.mutateAsync(payload);
        toast.success("Categoria criada com sucesso!");
      }
      utils.categorias.listar.invalidate();
      utils.categorias.listarTodas.invalidate();
      onSalvo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar categoria";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  }

  const nomeValido = validacaoNome?.disponivel;
  const nomeEmUso = validacaoNome && !validacaoNome.disponivel;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdicao ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome da Categoria */}
          <div className="space-y-1">
            <Label htmlFor="categoria">
              Nome da Categoria <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                id="categoria"
                value={form.categoria}
                onChange={e => setTexto("categoria", e.target.value)}
                placeholder="EX: PIZZAS TRADICIONAIS"
                maxLength={100}
                className={
                  erros.categoria || nomeEmUso
                    ? "border-destructive pr-8"
                    : nomeValido && form.categoria.length >= 2
                    ? "border-green-500 pr-8"
                    : "pr-8"
                }
              />
              {form.categoria.length >= 2 && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  {nomeValido ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : nomeEmUso ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              )}
            </div>
            {erros.categoria && <p className="text-xs text-destructive">{erros.categoria}</p>}
            {nomeEmUso && !erros.categoria && (
              <p className="text-xs text-destructive">Já existe uma categoria com este nome</p>
            )}
            {nomeValido && form.categoria.length >= 2 && (
              <p className="text-xs text-green-600">Nome disponível</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={form.descricao}
              onChange={e => setTexto("descricao", e.target.value)}
              placeholder="DESCRIÇÃO DA CATEGORIA (OPCIONAL)"
              maxLength={255}
              rows={3}
            />
          </div>

          {/* Slug e Ordem */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={e => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="pizzas-tradicionais"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">Usado na URL do delivery. Gerado automaticamente se vazio.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ordemExibicao">Ordem de Exibição</Label>
              <Input
                id="ordemExibicao"
                type="number"
                min={0}
                max={9999}
                value={form.ordemExibicao}
                onChange={e => setField("ordemExibicao", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Situação */}
          <div className="space-y-1">
            <Label>Situação</Label>
            <Select value={form.situacao} onValueChange={v => setField("situacao", v as "A" | "I")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Ativa</SelectItem>
                <SelectItem value="I">Inativa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando || nomeEmUso}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdicao ? "Salvar Alterações" : "Criar Categoria"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

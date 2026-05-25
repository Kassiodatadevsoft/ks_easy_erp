import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Plus, Trash2 } from "lucide-react";

interface ProdutoFormProps {
  guidProduto?: string;
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

interface TamanhoPreco {
  tamanho: string;
  preco: string;
}

interface FormData {
  produto: string;
  descricao: string;
  guidCategoria: string;
  preco: string;
  precoVenda: string;
  imageUrl: string;
  erpCode: string;
  destaque: boolean;
  ordemExibicao: number;
  situacao: "A" | "I";
  // Modo de preço
  modoPreco: "simples" | "tamanhos";
  tamanhosPrecos: TamanhoPreco[];
}

const FORM_INICIAL: FormData = {
  produto: "",
  descricao: "",
  guidCategoria: "",
  preco: "",
  precoVenda: "",
  imageUrl: "",
  erpCode: "",
  destaque: false,
  ordemExibicao: 0,
  situacao: "A",
  modoPreco: "simples",
  tamanhosPrecos: [{ tamanho: "PEQUENA", preco: "" }, { tamanho: "MEDIA", preco: "" }, { tamanho: "GRANDE", preco: "" }],
};

const TAMANHOS_SUGERIDOS = ["BROTINHO", "PEQUENA", "MEDIA", "GRANDE", "TREM", "BITREM", "UNICO"];

export function ProdutoForm({ guidProduto, open, onClose, onSalvo }: ProdutoFormProps) {
  const isEdicao = Boolean(guidProduto);
  const [form, setForm] = useState<FormData>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<string, string>>>({});
  const [abaAtiva, setAbaAtiva] = useState("dados");

  // Carregar categorias
  const { data: categorias } = trpc.categorias.listarTodas.useQuery();

  // Carregar dados para edição
  const { data: produtoData } = trpc.produtos.buscarPorGuid.useQuery(
    { guidProduto: guidProduto! },
    { enabled: isEdicao && open }
  );

  // Validação em tempo real do nome
  const [nomeDebounced, setNomeDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setNomeDebounced(form.produto), 400);
    return () => clearTimeout(t);
  }, [form.produto]);

  const { data: validacaoNome } = trpc.produtos.validarNome.useQuery(
    { produto: nomeDebounced, guidProduto },
    { enabled: nomeDebounced.length >= 2 }
  );

  // Preencher form ao carregar dados de edição
  useEffect(() => {
    if (produtoData) {
      // Detectar modo de preço
      let modoPreco: "simples" | "tamanhos" = "simples";
      let tamanhosPrecos: TamanhoPreco[] = FORM_INICIAL.tamanhosPrecos;

      if (produtoData.PRECOS) {
        try {
          const precosObj = JSON.parse(produtoData.PRECOS);
          const keys = Object.keys(precosObj);
          if (keys.length > 1 || (keys.length === 1 && keys[0] !== "unico")) {
            modoPreco = "tamanhos";
            tamanhosPrecos = keys.map(k => ({
              tamanho: k.toUpperCase(),
              preco: String(precosObj[k]),
            }));
          }
        } catch {
          // preços inválidos, usar simples
        }
      }

      setForm({
        produto: produtoData.PRODUTO ?? "",
        descricao: produtoData.DESCRICAO ?? "",
        guidCategoria: produtoData.GUIDENTIDADECAT ?? "",
        preco: produtoData.PRECO ? String(produtoData.PRECO) : "",
        precoVenda: produtoData.PRECOVENDA ? String(produtoData.PRECOVENDA) : "",
        imageUrl: produtoData.IMAGEURL ?? "",
        erpCode: produtoData.ERPCODE ?? "",
        destaque: Boolean(produtoData.DESTAQUE),
        ordemExibicao: produtoData.ORDEMEXIBICAO ?? 0,
        situacao: (produtoData.SITUACAO as "A" | "I") ?? "A",
        modoPreco,
        tamanhosPrecos,
      });
    } else if (!isEdicao) {
      setForm(FORM_INICIAL);
    }
  }, [produtoData, isEdicao]);

  // Limpar ao fechar
  useEffect(() => {
    if (!open) {
      setForm(FORM_INICIAL);
      setErros({});
      setAbaAtiva("dados");
    }
  }, [open]);

  const utils = trpc.useUtils();
  const criarMutation = trpc.produtos.criar.useMutation();
  const atualizarMutation = trpc.produtos.atualizar.useMutation();

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (erros[key]) setErros(prev => ({ ...prev, [key]: undefined }));
  }

  function setTexto(key: keyof FormData, value: string) {
    setField(key, value.toUpperCase() as FormData[typeof key]);
  }

  function adicionarTamanho() {
    setForm(prev => ({
      ...prev,
      tamanhosPrecos: [...prev.tamanhosPrecos, { tamanho: "", preco: "" }],
    }));
  }

  function removerTamanho(idx: number) {
    setForm(prev => ({
      ...prev,
      tamanhosPrecos: prev.tamanhosPrecos.filter((_, i) => i !== idx),
    }));
  }

  function atualizarTamanho(idx: number, campo: "tamanho" | "preco", valor: string) {
    setForm(prev => {
      const arr = [...prev.tamanhosPrecos];
      arr[idx] = { ...arr[idx], [campo]: campo === "tamanho" ? valor.toUpperCase() : valor };
      return { ...prev, tamanhosPrecos: arr };
    });
  }

  function buildPrecosPayload(): { precos: string; tamanhosDisp: string } | null {
    if (form.modoPreco === "simples") {
      const p = parseFloat(form.precoVenda || form.preco || "0");
      return {
        precos: JSON.stringify({ unico: p }),
        tamanhosDisp: JSON.stringify(["unico"]),
      };
    }
    // Modo tamanhos
    const validos = form.tamanhosPrecos.filter(t => t.tamanho && t.preco);
    if (!validos.length) return null;
    const precosObj: Record<string, number> = {};
    const tamanhos: string[] = [];
    validos.forEach(t => {
      const key = t.tamanho.toLowerCase();
      precosObj[key] = parseFloat(t.preco) || 0;
      tamanhos.push(key);
    });
    return {
      precos: JSON.stringify(precosObj),
      tamanhosDisp: JSON.stringify(tamanhos),
    };
  }

  function contarErrosAba(aba: string): number {
    const camposAba: Record<string, string[]> = {
      dados: ["produto", "guidCategoria"],
      precos: ["precos"],
      delivery: [],
    };
    return (camposAba[aba] ?? []).filter(c => erros[c]).length;
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {};
    if (!form.produto.trim()) novosErros.produto = "Nome do produto é obrigatório";
    if (validacaoNome && !validacaoNome.disponivel) novosErros.produto = "Já existe um produto com este nome";
    if (form.modoPreco === "tamanhos") {
      const validos = form.tamanhosPrecos.filter(t => t.tamanho && t.preco);
      if (!validos.length) novosErros.precos = "Informe pelo menos um tamanho com preço";
    }
    setErros(novosErros);
    if (novosErros.produto) setAbaAtiva("dados");
    else if (novosErros.precos) setAbaAtiva("precos");
    return Object.keys(novosErros).length === 0;
  }

  async function handleSalvar() {
    if (!validar()) return;
    setSalvando(true);
    try {
      const precosPayload = buildPrecosPayload();
      const catSelecionada = categorias?.find(c => c.GUIDCATEGORIA === form.guidCategoria);

      const payload = {
        produto: form.produto,
        descricao: form.descricao || undefined,
        codCategoria: catSelecionada?.CODCATEGORIA,
        guidentidadeCat: form.guidCategoria || undefined,
        precos: precosPayload?.precos,
        tamanhosDisp: precosPayload?.tamanhosDisp,
        preco: parseFloat(form.preco || "0"),
        precoVenda: parseFloat(form.precoVenda || "0"),
        imageUrl: form.imageUrl || undefined,
        erpCode: form.erpCode || undefined,
        destaque: form.destaque,
        ordemExibicao: form.ordemExibicao,
        situacao: form.situacao,
      };

      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidProduto: guidProduto!, ...payload });
        toast.success("Produto atualizado com sucesso!");
      } else {
        await criarMutation.mutateAsync(payload);
        toast.success("Produto criado com sucesso!");
      }
      utils.produtos.listar.invalidate();
      onSalvo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar produto";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  }

  const nomeValido = validacaoNome?.disponivel;
  const nomeEmUso = validacaoNome && !validacaoNome.disponivel;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdicao ? "Editar Produto" : "Novo Produto"}</DialogTitle>
        </DialogHeader>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-3 shrink-0">
            <TabsTrigger value="dados" className="relative">
              Dados Gerais
              {contarErrosAba("dados") > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs flex items-center justify-center">
                  {contarErrosAba("dados")}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="precos" className="relative">
              Preços / Tamanhos
              {contarErrosAba("precos") > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs flex items-center justify-center">
                  {contarErrosAba("precos")}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="delivery">Delivery / ERP</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* Aba Dados Gerais */}
            <TabsContent value="dados" className="space-y-4 p-1 mt-0">
              {/* Nome */}
              <div className="space-y-1">
                <Label htmlFor="produto">
                  Nome do Produto <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="produto"
                    value={form.produto}
                    onChange={e => setTexto("produto", e.target.value)}
                    placeholder="EX: PIZZA CALABRESA"
                    maxLength={150}
                    className={
                      erros.produto || nomeEmUso
                        ? "border-destructive pr-8"
                        : nomeValido && form.produto.length >= 2
                        ? "border-green-500 pr-8"
                        : "pr-8"
                    }
                  />
                  {form.produto.length >= 2 && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {nomeValido ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : nomeEmUso ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : null}
                    </div>
                  )}
                </div>
                {erros.produto && <p className="text-xs text-destructive">{erros.produto}</p>}
                {nomeEmUso && !erros.produto && (
                  <p className="text-xs text-destructive">Já existe um produto com este nome</p>
                )}
              </div>

              {/* Descrição */}
              <div className="space-y-1">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={form.descricao}
                  onChange={e => setTexto("descricao", e.target.value)}
                  placeholder="DESCRIÇÃO DO PRODUTO (APARECE NO DELIVERY)"
                  maxLength={500}
                  rows={3}
                />
              </div>

              {/* Categoria */}
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.guidCategoria} onValueChange={v => setField("guidCategoria", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEM_CATEGORIA">Sem categoria</SelectItem>
                    {categorias?.map(cat => (
                      <SelectItem key={cat.GUIDCATEGORIA} value={cat.GUIDCATEGORIA}>
                        {cat.CATEGORIA}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ordem e Situação */}
              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-1">
                  <Label>Situação</Label>
                  <Select value={form.situacao} onValueChange={v => setField("situacao", v as "A" | "I")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Ativo</SelectItem>
                      <SelectItem value="I">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Destaque */}
              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Switch
                  id="destaque"
                  checked={form.destaque}
                  onCheckedChange={v => setField("destaque", v)}
                />
                <div>
                  <Label htmlFor="destaque" className="cursor-pointer">Produto em Destaque</Label>
                  <p className="text-xs text-muted-foreground">Aparece na seção de destaques do delivery</p>
                </div>
              </div>
            </TabsContent>

            {/* Aba Preços / Tamanhos */}
            <TabsContent value="precos" className="space-y-4 p-1 mt-0">
              {/* Modo de preço */}
              <div className="space-y-2">
                <Label>Modo de Preço</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setField("modoPreco", "simples")}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      form.modoPreco === "simples"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium text-sm">Preço Único</div>
                    <div className="text-xs text-muted-foreground">Um preço fixo para o produto</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setField("modoPreco", "tamanhos")}
                    className={`p-3 rounded-md border text-left transition-colors ${
                      form.modoPreco === "tamanhos"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium text-sm">Por Tamanho</div>
                    <div className="text-xs text-muted-foreground">Preços diferentes por tamanho (pizza)</div>
                  </button>
                </div>
              </div>

              {form.modoPreco === "simples" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="preco">Preço de Custo (R$)</Label>
                    <Input
                      id="preco"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.preco}
                      onChange={e => setField("preco", e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="precoVenda">Preço de Venda (R$) <span className="text-destructive">*</span></Label>
                    <Input
                      id="precoVenda"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.precoVenda}
                      onChange={e => setField("precoVenda", e.target.value)}
                      placeholder="0,00"
                    />
                    <p className="text-xs text-muted-foreground">Este é o preço exibido no delivery</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tamanhos e Preços</Label>
                    <Button type="button" variant="outline" size="sm" onClick={adicionarTamanho}>
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar Tamanho
                    </Button>
                  </div>

                  {erros.precos && <p className="text-xs text-destructive">{erros.precos}</p>}

                  <div className="space-y-2">
                    {form.tamanhosPrecos.map((tp, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Select
                            value={tp.tamanho}
                            onValueChange={v => atualizarTamanho(idx, "tamanho", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tamanho..." />
                            </SelectTrigger>
                            <SelectContent>
                              {TAMANHOS_SUGERIDOS.map(t => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-36">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={tp.preco}
                            onChange={e => atualizarTamanho(idx, "preco", e.target.value)}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removerTamanho(idx)}
                          disabled={form.tamanhosPrecos.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Tamanhos sugeridos: {TAMANHOS_SUGERIDOS.join(", ")}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Aba Delivery / ERP */}
            <TabsContent value="delivery" className="space-y-4 p-1 mt-0">
              {/* ERP Code */}
              <div className="space-y-1">
                <Label htmlFor="erpCode">Código ERP</Label>
                <Input
                  id="erpCode"
                  value={form.erpCode}
                  onChange={e => setTexto("erpCode", e.target.value)}
                  placeholder="EX: PROD-001"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground">
                  Código usado para sincronização bidirecional com o sistema de delivery.
                  O delivery usa este código para identificar o produto no ERP.
                </p>
              </div>

              {/* URL da Imagem */}
              <div className="space-y-1">
                <Label htmlFor="imageUrl">URL da Imagem</Label>
                <Input
                  id="imageUrl"
                  value={form.imageUrl}
                  onChange={e => setField("imageUrl", e.target.value)}
                  placeholder="https://exemplo.com/imagem.jpg"
                  maxLength={500}
                />
                {form.imageUrl && (
                  <div className="mt-2 rounded-md overflow-hidden border w-32 h-32">
                    <img
                      src={form.imageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
              </div>

              {/* Informações de integração */}
              <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
                <p className="font-medium">Como funciona a integração com o Delivery:</p>
                <ul className="text-muted-foreground space-y-1 text-xs list-disc list-inside">
                  <li>O ERP envia produtos para o delivery via endpoint <code>/api/erp/products/sync</code></li>
                  <li>O campo <strong>Código ERP</strong> é o identificador único do produto no delivery</li>
                  <li>Produtos sem Código ERP não são sincronizados automaticamente</li>
                  <li>O delivery usa os tamanhos e preços definidos aqui para o cardápio</li>
                </ul>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Rodapé */}
        <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando || nomeEmUso}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdicao ? "Salvar Alterações" : "Criar Produto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

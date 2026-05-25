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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Info, Barcode } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProdutoFormProps {
  guidProduto?: string;
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

// Os 7 tamanhos fixos para o modo "Por Tamanho"
const TAMANHOS_FIXOS = ["BROTINHO", "PEQUENA", "MEDIA", "GRANDE", "TREM", "BITREM", "UNICO"] as const;
type TamanhoFixo = typeof TAMANHOS_FIXOS[number];

// CSOSN — Simples Nacional
const CSOSN_OPCOES = [
  { value: "101", label: "101 – Tributada com permissão de crédito" },
  { value: "102", label: "102 – Tributada sem permissão de crédito" },
  { value: "103", label: "103 – Isenção do ICMS (faixa de receita bruta)" },
  { value: "201", label: "201 – Tributada com ST e com crédito" },
  { value: "202", label: "202 – Tributada com ST sem crédito" },
  { value: "203", label: "203 – Isenção com ST" },
  { value: "300", label: "300 – Imune" },
  { value: "400", label: "400 – Não tributada pelo Simples" },
  { value: "500", label: "500 – ICMS cobrado anteriormente por ST" },
  { value: "900", label: "900 – Outros" },
];

// CST ICMS — Regime Normal (Lucro Presumido / Lucro Real)
const CST_ICMS_OPCOES = [
  { value: "000", label: "000 – Tributada integralmente" },
  { value: "010", label: "010 – Tributada com ST" },
  { value: "020", label: "020 – Com redução de base de cálculo" },
  { value: "030", label: "030 – Isenta ou não tributada com ST" },
  { value: "040", label: "040 – Isenta" },
  { value: "041", label: "041 – Não tributada" },
  { value: "050", label: "050 – Suspensão" },
  { value: "051", label: "051 – Diferimento" },
  { value: "060", label: "060 – ICMS cobrado anteriormente por ST" },
  { value: "070", label: "070 – Com redução e ST" },
  { value: "090", label: "090 – Outras" },
];

// Regime de tributação do produto na Reforma Tributária
const REGIME_TRIB_OPCOES = [
  { value: 1, label: "1 – Padrão (alíquota cheia IBS + CBS)" },
  { value: 2, label: "2 – Reduzido (50% de redução)" },
  { value: 3, label: "3 – Isento (alíquota zero)" },
  { value: 4, label: "4 – Monofásico (tributação única na cadeia)" },
  { value: 5, label: "5 – Seletivo (IS – bens e serviços prejudiciais)" },
];

// CFOP mais comuns para saída
const CFOP_OPCOES = [
  { value: "5101", label: "5101 – Venda de produção do estabelecimento" },
  { value: "5102", label: "5102 – Venda de mercadoria adquirida de terceiros" },
  { value: "5405", label: "5405 – Venda de mercadoria com ST" },
  { value: "5933", label: "5933 – Prestação de serviço (Simples)" },
  { value: "6101", label: "6101 – Venda de produção (interestadual)" },
  { value: "6102", label: "6102 – Venda de mercadoria (interestadual)" },
];

// Unidades fiscais
const UNIDADES = ["UN", "KG", "G", "L", "ML", "M", "M2", "M3", "CX", "PC", "PAR", "DZ", "CT", "SC", "FD", "PT"];

interface TamanhosPrecos {
  BROTINHO: string; PEQUENA: string; MEDIA: string;
  GRANDE: string; TREM: string; BITREM: string; UNICO: string;
}

interface FormData {
  produto: string; descricao: string; guidCategoria: string;
  ordemExibicao: number; situacao: "A" | "I"; destaque: boolean;
  modoPreco: "simples" | "tamanhos";
  precoVenda: string; precocusto: string;
  tamanhosPrecos: TamanhosPrecos;
  codBarras: string;
  // Fiscal
  ncm: string; cest: string; cfop: string; unidade: string;
  // Legado
  csosn: string; cst: string;
  aliqIcms: string; aliqPis: string; aliqCofins: string; aliqIpi: string;
  // Reforma Tributária
  aliqIbs: string; aliqCbs: string; aliqIs: string;
  regimeTrib: number; percReducao: string;
  codBenefIbs: string; codRegimeEsp: string;
  // Estoque
  estoque: string; estoqueMinimo: string;
  // Delivery
  imageUrl: string; erpCode: string;
}

const FORM_INICIAL: FormData = {
  produto: "", descricao: "", guidCategoria: "",
  ordemExibicao: 0, situacao: "A", destaque: false,
  modoPreco: "tamanhos",
  precoVenda: "", precocusto: "",
  tamanhosPrecos: { BROTINHO: "", PEQUENA: "", MEDIA: "", GRANDE: "", TREM: "", BITREM: "", UNICO: "" },
  codBarras: "",
  ncm: "", cest: "", cfop: "", unidade: "UN",
  csosn: "", cst: "",
  aliqIcms: "0.00", aliqPis: "0.65", aliqCofins: "3.00", aliqIpi: "0.00",
  aliqIbs: "0.00", aliqCbs: "0.00", aliqIs: "0.00",
  regimeTrib: 1, percReducao: "0.00",
  codBenefIbs: "", codRegimeEsp: "",
  estoque: "0", estoqueMinimo: "0",
  imageUrl: "", erpCode: "",
};

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ProdutoForm({ guidProduto, open, onClose, onSalvo }: ProdutoFormProps) {
  const isEdicao = Boolean(guidProduto);
  const [form, setForm] = useState<FormData>(FORM_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<string, string>>>({});
  const [abaAtiva, setAbaAtiva] = useState("dados");

  const { data: categorias } = trpc.categorias.listarTodas.useQuery();
  const { data: regime } = trpc.produtos.regimeEmpresa.useQuery();

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

  // Preencher alíquotas padrão da empresa ao abrir novo produto
  useEffect(() => {
    if (!isEdicao && regime && open) {
      setForm(prev => ({
        ...prev,
        aliqPis: String(regime.aliquotaPis ?? 0.65),
        aliqCofins: String(regime.aliquotaCofins ?? 3.0),
        csosn: regime.isSimples ? "102" : "",
        cst: regime.isNormal ? "000" : "",
      }));
    }
  }, [regime, isEdicao, open]);

  // Preencher form ao carregar dados de edição
  useEffect(() => {
    if (produtoData) {
      let modoPreco: "simples" | "tamanhos" = "tamanhos";
      const tp: TamanhosPrecos = { BROTINHO: "", PEQUENA: "", MEDIA: "", GRANDE: "", TREM: "", BITREM: "", UNICO: "" };

      if (produtoData.PRECOS) {
        try {
          const precosObj = JSON.parse(produtoData.PRECOS);
          const keys = Object.keys(precosObj);
          if (keys.length === 1 && keys[0] === "unico") {
            modoPreco = "simples";
          } else {
            modoPreco = "tamanhos";
            TAMANHOS_FIXOS.forEach(t => {
              const key = t.toLowerCase();
              if (precosObj[key] !== undefined) tp[t] = String(precosObj[key]);
            });
          }
        } catch { /* usar padrão */ }
      }

      const d = produtoData as Record<string, unknown>;
      setForm({
        produto: String(d.PRODUTO ?? ""),
        descricao: String(d.DESCRICAO ?? ""),
        guidCategoria: String(d.GUIDENTIDADECAT ?? ""),
        ordemExibicao: Number(d.ORDEMEXIBICAO ?? 0),
        situacao: (String(d.SITUACAO ?? "A")) as "A" | "I",
        destaque: Boolean(d.DESTAQUE),
        modoPreco,
        precoVenda: d.PRECOVENDA ? String(d.PRECOVENDA) : "",
        precocusto: d.PRECOCUSTO ? String(d.PRECOCUSTO) : "",
        tamanhosPrecos: tp,
        codBarras: String(d.CODBARRAS ?? ""),
        ncm: String(d.NCM ?? ""),
        cest: String(d.CEST ?? ""),
        cfop: String(d.CFOP ?? ""),
        unidade: String(d.UNIDADE ?? "UN"),
        csosn: String(d.CSOSN ?? ""),
        cst: String(d.CST ?? ""),
        aliqIcms: d.ALIQICMS !== undefined ? String(d.ALIQICMS) : "0.00",
        aliqPis: d.ALIQPIS !== undefined ? String(d.ALIQPIS) : "0.65",
        aliqCofins: d.ALIQCOFINS !== undefined ? String(d.ALIQCOFINS) : "3.00",
        aliqIpi: d.ALIQIPI !== undefined ? String(d.ALIQIPI) : "0.00",
        aliqIbs: d.ALIQIBS !== undefined ? String(d.ALIQIBS) : "0.00",
        aliqCbs: d.ALIQCBS !== undefined ? String(d.ALIQCBS) : "0.00",
        aliqIs: d.ALIQIS !== undefined ? String(d.ALIQIS) : "0.00",
        regimeTrib: Number(d.REGIMETRIB ?? 1),
        percReducao: d.PERCREDUCAO !== undefined ? String(d.PERCREDUCAO) : "0.00",
        codBenefIbs: String(d.CODBENEFIBS ?? ""),
        codRegimeEsp: String(d.CODREGIMEESP ?? ""),
        estoque: d.ESTOQUE !== undefined ? String(d.ESTOQUE) : "0",
        estoqueMinimo: d.ESTOQUEMINIMO !== undefined ? String(d.ESTOQUEMINIMO) : "0",
        imageUrl: String(d.IMAGEURL ?? ""),
        erpCode: String(d.ERPCODE ?? ""),
      });
    } else if (!isEdicao) {
      setForm(FORM_INICIAL);
    }
  }, [produtoData, isEdicao]);

  useEffect(() => {
    if (!open) { setForm(FORM_INICIAL); setErros({}); setAbaAtiva("dados"); }
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
  function setTamanhoPreco(tamanho: TamanhoFixo, valor: string) {
    setForm(prev => ({ ...prev, tamanhosPrecos: { ...prev.tamanhosPrecos, [tamanho]: valor } }));
  }

  function buildPrecosPayload() {
    if (form.modoPreco === "simples") {
      const p = parseFloat(form.precoVenda || "0");
      return { precos: JSON.stringify({ unico: p }), tamanhosDisp: JSON.stringify(["unico"]) };
    }
    const precosObj: Record<string, number> = {};
    const tamanhos: string[] = [];
    TAMANHOS_FIXOS.forEach(t => {
      const key = t.toLowerCase();
      precosObj[key] = parseFloat(form.tamanhosPrecos[t] || "0");
      tamanhos.push(key);
    });
    return { precos: JSON.stringify(precosObj), tamanhosDisp: JSON.stringify(tamanhos) };
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {};
    if (!form.produto.trim()) novosErros.produto = "Nome do produto é obrigatório";
    if (validacaoNome && !validacaoNome.disponivel) novosErros.produto = "Já existe um produto com este nome";
    setErros(novosErros);
    if (novosErros.produto) setAbaAtiva("dados");
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
        precos: precosPayload.precos,
        tamanhosDisp: precosPayload.tamanhosDisp,
        preco: parseFloat(form.precocusto || "0"),
        precoVenda: parseFloat(form.precoVenda || "0"),
        precocusto: parseFloat(form.precocusto || "0"),
        imageUrl: form.imageUrl || undefined,
        erpCode: form.erpCode || undefined,
        destaque: form.destaque,
        ordemExibicao: form.ordemExibicao,
        situacao: form.situacao,
        codBarras: form.codBarras || undefined,
        ncm: form.ncm || undefined,
        cest: form.cest || undefined,
        cfop: form.cfop || undefined,
        unidade: form.unidade || "UN",
        csosn: form.csosn || undefined,
        cst: form.cst || undefined,
        aliqIcms: parseFloat(form.aliqIcms || "0"),
        aliqPis: parseFloat(form.aliqPis || "0"),
        aliqCofins: parseFloat(form.aliqCofins || "0"),
        aliqIpi: parseFloat(form.aliqIpi || "0"),
        aliqIbs: parseFloat(form.aliqIbs || "0"),
        aliqCbs: parseFloat(form.aliqCbs || "0"),
        aliqIs: parseFloat(form.aliqIs || "0"),
        regimeTrib: form.regimeTrib,
        percReducao: parseFloat(form.percReducao || "0"),
        codBenefIbs: form.codBenefIbs || undefined,
        codRegimeEsp: form.codRegimeEsp || undefined,
        estoque: parseFloat(form.estoque || "0"),
        estoqueMinimo: parseFloat(form.estoqueMinimo || "0"),
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
      toast.error(err instanceof Error ? err.message : "Erro ao salvar produto");
    } finally {
      setSalvando(false);
    }
  }

  const nomeValido = validacaoNome?.disponivel;
  const nomeEmUso = validacaoNome && !validacaoNome.disponivel;

  // Badge de regime
  const regimeBadge = regime ? (
    regime.isMEI ? (
      <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">MEI</Badge>
    ) : regime.isSimples ? (
      <Badge variant="outline" className="text-xs border-green-500 text-green-700">Simples Nacional</Badge>
    ) : (
      <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">Regime Normal</Badge>
    )
  ) : null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdicao ? "Editar Produto" : "Novo Produto"}
            {regimeBadge}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-5 shrink-0 h-auto">
            <TabsTrigger value="dados" className="relative text-xs py-2">
              Dados Gerais
              {erros.produto && (
                <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">!</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="precos" className="text-xs py-2">Preços</TabsTrigger>
            <TabsTrigger value="fiscal" className="text-xs py-2">Fiscal</TabsTrigger>
            <TabsTrigger value="estoque" className="text-xs py-2">Estoque</TabsTrigger>
            <TabsTrigger value="delivery" className="text-xs py-2">Delivery / ERP</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">

            {/* ── ABA DADOS GERAIS ─────────────────────────────────────────── */}
            <TabsContent value="dados" className="space-y-4 p-1 mt-0">
              <div className="space-y-1">
                <Label htmlFor="produto">Nome do Produto <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="produto"
                    value={form.produto}
                    onChange={e => setTexto("produto", e.target.value)}
                    placeholder="EX: PIZZA CALABRESA"
                    maxLength={150}
                    className={erros.produto || nomeEmUso ? "border-destructive pr-8" : nomeValido && form.produto.length >= 2 ? "border-green-500 pr-8" : "pr-8"}
                  />
                  {form.produto.length >= 2 && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {nomeValido ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : nomeEmUso ? <XCircle className="h-4 w-4 text-destructive" /> : null}
                    </div>
                  )}
                </div>
                {(erros.produto || nomeEmUso) && (
                  <p className="text-xs text-destructive">{erros.produto ?? "Já existe um produto com este nome"}</p>
                )}
              </div>

              {/* Código de Barras */}
              <div className="space-y-1">
                <Label htmlFor="codBarras" className="flex items-center gap-1">
                  <Barcode className="h-4 w-4" />
                  Código de Barras (EAN / GTIN)
                </Label>
                <Input
                  id="codBarras"
                  value={form.codBarras}
                  onChange={e => setField("codBarras", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="EX: 7891234567890"
                  maxLength={14}
                />
                <p className="text-xs text-muted-foreground">EAN-8, EAN-13 ou GTIN-14. Usado no PDV e na NF-e.</p>
              </div>

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

              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={form.guidCategoria || "SEM_CATEGORIA"} onValueChange={v => setField("guidCategoria", v === "SEM_CATEGORIA" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma categoria..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEM_CATEGORIA">Sem categoria</SelectItem>
                    {categorias?.map(cat => (
                      <SelectItem key={cat.GUIDCATEGORIA} value={cat.GUIDCATEGORIA}>{cat.CATEGORIA}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ordemExibicao">Ordem de Exibição</Label>
                  <Input id="ordemExibicao" type="number" min={0} max={9999} value={form.ordemExibicao} onChange={e => setField("ordemExibicao", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label>Situação</Label>
                  <Select value={form.situacao} onValueChange={v => setField("situacao", v as "A" | "I")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Ativo</SelectItem>
                      <SelectItem value="I">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-md border">
                <Switch id="destaque" checked={form.destaque} onCheckedChange={v => setField("destaque", v)} />
                <div>
                  <Label htmlFor="destaque" className="cursor-pointer">Produto em Destaque</Label>
                  <p className="text-xs text-muted-foreground">Aparece na seção de destaques do delivery</p>
                </div>
              </div>
            </TabsContent>

            {/* ── ABA PREÇOS ───────────────────────────────────────────────── */}
            <TabsContent value="precos" className="space-y-4 p-1 mt-0">
              <div className="space-y-2">
                <Label>Modo de Preço</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["simples", "tamanhos"] as const).map(modo => (
                    <button key={modo} type="button" onClick={() => setField("modoPreco", modo)}
                      className={`p-3 rounded-md border text-left transition-colors ${form.modoPreco === modo ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                      <div className="font-medium text-sm">{modo === "simples" ? "Preço Único" : "Por Tamanho"}</div>
                      <div className="text-xs text-muted-foreground">{modo === "simples" ? "Um preço fixo para o produto" : "Preços por tamanho (pizza/delivery)"}</div>
                    </button>
                  ))}
                </div>
              </div>

              {form.modoPreco === "simples" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="precocusto">Preço de Custo (R$)</Label>
                    <Input id="precocusto" type="number" min={0} step={0.01} value={form.precocusto} onChange={e => setField("precocusto", e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="precoVenda">Preço de Venda (R$) <span className="text-destructive">*</span></Label>
                    <Input id="precoVenda" type="number" min={0} step={0.01} value={form.precoVenda} onChange={e => setField("precoVenda", e.target.value)} placeholder="0,00" />
                    <p className="text-xs text-muted-foreground">Preço exibido no delivery e no PDV</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Preços por Tamanho</Label>
                    <span className="text-xs text-muted-foreground">Informe 0,00 para tamanhos não disponíveis</span>
                  </div>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-1/2">Tamanho</th>
                          <th className="text-left px-3 py-2 font-medium w-1/2">Preço de Venda (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TAMANHOS_FIXOS.map((tamanho, idx) => (
                          <tr key={tamanho} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                            <td className="px-3 py-2 font-medium">{tamanho}</td>
                            <td className="px-3 py-1.5">
                              <Input type="number" min={0} step={0.01} value={form.tamanhosPrecos[tamanho]} onChange={e => setTamanhoPreco(tamanho, e.target.value)} placeholder="0,00" className="h-8" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── ABA FISCAL ───────────────────────────────────────────────── */}
            <TabsContent value="fiscal" className="space-y-4 p-1 mt-0">

              {/* Banner de regime */}
              {regime && (
                <div className={`p-3 rounded-md border text-sm flex items-start gap-2 ${
                  regime.isMEI ? "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300"
                  : regime.isSimples ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                  : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                }`}>
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{regime.descricaoRegime}</span>
                    <span className="text-xs ml-2 opacity-75">(CRT {regime.crt})</span>
                    {regime.isMEI && <p className="text-xs mt-0.5 opacity-80">MEI: isento de ICMS, PIS e COFINS. Preencha apenas NCM, CFOP e campos da Reforma Tributária.</p>}
                    {regime.isSimples && !regime.isMEI && <p className="text-xs mt-0.5 opacity-80">Simples Nacional: use CSOSN. PIS/COFINS inclusos na DAS — alíquotas informativas.</p>}
                    {regime.isNormal && <p className="text-xs mt-0.5 opacity-80">Regime Normal: use CST ICMS. PIS/COFINS pelo regime {regime.regimePisCofins === 1 ? "Cumulativo (3%/0,65%)" : "Não Cumulativo (7,6%/1,65%)"}.</p>}
                  </div>
                </div>
              )}

              {/* NCM, CEST, CFOP, Unidade */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ncm">NCM <InfoTip text="Nomenclatura Comum do Mercosul — 8 dígitos. Obrigatório na NF-e." /></Label>
                  <Input id="ncm" value={form.ncm} onChange={e => setField("ncm", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" maxLength={8} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cest">CEST <InfoTip text="Código Especificador da Substituição Tributária — 7 dígitos. Obrigatório quando há ST." /></Label>
                  <Input id="cest" value={form.cest} onChange={e => setField("cest", e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="0000000" maxLength={7} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>CFOP <InfoTip text="Código Fiscal de Operações e Prestações — define a natureza da operação." /></Label>
                  <Select value={form.cfop || "NENHUM"} onValueChange={v => setField("cfop", v === "NENHUM" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUM">Não definido</SelectItem>
                      {CFOP_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Unidade Fiscal <InfoTip text="Unidade de medida usada na NF-e (UN, KG, L, CX, etc.)" /></Label>
                  <Select value={form.unidade} onValueChange={v => setField("unidade", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* ── Tributação Legada (NF-e) ── */}
              <p className="text-sm font-semibold">Tributação Legada — NF-e (atual)</p>

              {/* Simples / MEI: CSOSN */}
              {(regime?.isSimples || !regime) && (
                <div className="space-y-1">
                  <Label>CSOSN <InfoTip text="Código de Situação da Operação no Simples Nacional. Obrigatório para emissão de NF-e no Simples." /></Label>
                  <Select value={form.csosn || "NENHUM"} onValueChange={v => setField("csosn", v === "NENHUM" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o CSOSN..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUM">Não definido</SelectItem>
                      {CSOSN_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Regime Normal: CST ICMS */}
              {regime?.isNormal && (
                <div className="space-y-1">
                  <Label>CST ICMS <InfoTip text="Código de Situação Tributária do ICMS para Regime Normal (Lucro Presumido / Lucro Real)." /></Label>
                  <Select value={form.cst || "NENHUM"} onValueChange={v => setField("cst", v === "NENHUM" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione o CST..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUM">Não definido</SelectItem>
                      {CST_ICMS_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Alíquotas legadas */}
              {!regime?.isMEI && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="aliqIcms">ICMS (%)</Label>
                    <Input id="aliqIcms" type="number" min={0} max={100} step={0.01} value={form.aliqIcms} onChange={e => setField("aliqIcms", e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="aliqPis">PIS (%)</Label>
                    <Input id="aliqPis" type="number" min={0} max={100} step={0.01} value={form.aliqPis} onChange={e => setField("aliqPis", e.target.value)} placeholder="0.65" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="aliqCofins">COFINS (%)</Label>
                    <Input id="aliqCofins" type="number" min={0} max={100} step={0.01} value={form.aliqCofins} onChange={e => setField("aliqCofins", e.target.value)} placeholder="3.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="aliqIpi">IPI (%)</Label>
                    <Input id="aliqIpi" type="number" min={0} max={100} step={0.01} value={form.aliqIpi} onChange={e => setField("aliqIpi", e.target.value)} placeholder="0.00" />
                  </div>
                </div>
              )}

              <Separator />

              {/* ── Reforma Tributária (vigência 2026+) ── */}
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Reforma Tributária — IBS / CBS / IS</p>
                <Badge className="text-[10px] bg-purple-600 text-white">Vigência 2026+</Badge>
              </div>

              <div className="space-y-1">
                <Label>Regime de Tributação do Produto <InfoTip text="Define como o produto será tributado pelo IBS e CBS na Reforma Tributária." /></Label>
                <Select value={String(form.regimeTrib)} onValueChange={v => setField("regimeTrib", parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIME_TRIB_OPCOES.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="aliqIbs">
                    IBS (%) <InfoTip text="Imposto sobre Bens e Serviços — substitui ICMS e ISS. Alíquota de referência: ~26,5% (federal + estadual + municipal)." />
                  </Label>
                  <Input id="aliqIbs" type="number" min={0} max={100} step={0.0001} value={form.aliqIbs} onChange={e => setField("aliqIbs", e.target.value)} placeholder="0.0000" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="aliqCbs">
                    CBS (%) <InfoTip text="Contribuição sobre Bens e Serviços — substitui PIS e COFINS. Alíquota de referência: ~8,8%." />
                  </Label>
                  <Input id="aliqCbs" type="number" min={0} max={100} step={0.0001} value={form.aliqCbs} onChange={e => setField("aliqCbs", e.target.value)} placeholder="0.0000" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="aliqIs">
                    IS (%) <InfoTip text="Imposto Seletivo — incide sobre bens e serviços considerados prejudiciais à saúde ou ao meio ambiente (cigarros, bebidas alcoólicas, etc.)." />
                  </Label>
                  <Input id="aliqIs" type="number" min={0} max={100} step={0.0001} value={form.aliqIs} onChange={e => setField("aliqIs", e.target.value)} placeholder="0.0000" />
                </div>
              </div>

              {/* Redução de base — só para regime reduzido */}
              {form.regimeTrib === 2 && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="percReducao">
                      Redução da Base (%) <InfoTip text="Percentual de redução da base de cálculo do IBS/CBS. Ex: 50% = alíquota efetiva pela metade." />
                    </Label>
                    <Input id="percReducao" type="number" min={0} max={100} step={0.01} value={form.percReducao} onChange={e => setField("percReducao", e.target.value)} placeholder="50.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="codBenefIbs">
                      Código de Benefício Fiscal <InfoTip text="Código do benefício fiscal IBS/CBS (a ser definido pela Receita Federal)." />
                    </Label>
                    <Input id="codBenefIbs" value={form.codBenefIbs} onChange={e => setTexto("codBenefIbs", e.target.value)} placeholder="EX: BEN0001" maxLength={20} />
                  </div>
                </div>
              )}

              {/* Regime especial */}
              <div className="space-y-1">
                <Label htmlFor="codRegimeEsp">
                  Regime Especial <InfoTip text="Código de regime especial, como cashback obrigatório (previsto na Reforma para produtos da cesta básica)." />
                </Label>
                <Input id="codRegimeEsp" value={form.codRegimeEsp} onChange={e => setTexto("codRegimeEsp", e.target.value)} placeholder="EX: CASHBACK" maxLength={10} />
              </div>
            </TabsContent>

            {/* ── ABA ESTOQUE ──────────────────────────────────────────────── */}
            <TabsContent value="estoque" className="space-y-4 p-1 mt-0">
              <div className="p-3 rounded-md bg-muted/50 border text-sm">
                <p className="font-medium">Controle de Estoque</p>
                <p className="text-muted-foreground text-xs mt-1">
                  O estoque atual é sincronizado com o sistema offline (Delphi/PDV). O estoque mínimo gera alertas de reposição.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <Label htmlFor="estoque">Estoque Atual</Label>
                  <Input id="estoque" type="number" min={0} step={0.001} value={form.estoque} onChange={e => setField("estoque", e.target.value)} placeholder="0" />
                  <p className="text-xs text-muted-foreground">Quantidade atual em estoque</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="estoqueMinimo">Estoque Mínimo</Label>
                  <Input id="estoqueMinimo" type="number" min={0} step={0.001} value={form.estoqueMinimo} onChange={e => setField("estoqueMinimo", e.target.value)} placeholder="0" />
                  <p className="text-xs text-muted-foreground">Nível mínimo para alerta de reposição</p>
                </div>
              </div>

              {parseFloat(form.estoque || "0") < parseFloat(form.estoqueMinimo || "0") && parseFloat(form.estoqueMinimo || "0") > 0 && (
                <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400">
                  ⚠️ Estoque atual abaixo do mínimo — produto precisa de reposição.
                </div>
              )}
            </TabsContent>

            {/* ── ABA DELIVERY / ERP ───────────────────────────────────────── */}
            <TabsContent value="delivery" className="space-y-4 p-1 mt-0">
              <div className="space-y-1">
                <Label htmlFor="erpCode">Código ERP</Label>
                <Input id="erpCode" value={form.erpCode} onChange={e => setTexto("erpCode", e.target.value)} placeholder="EX: PROD-001" maxLength={100} />
                <p className="text-xs text-muted-foreground">Código para sincronização bidirecional com o sistema de delivery.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="imageUrl">URL da Imagem</Label>
                <Input id="imageUrl" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} placeholder="https://exemplo.com/imagem.jpg" maxLength={500} />
                {form.imageUrl && (
                  <div className="mt-2 rounded-md overflow-hidden border w-32 h-32">
                    <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}
              </div>

              <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
                <p className="font-medium">Integração com o Delivery:</p>
                <ul className="text-muted-foreground space-y-1 text-xs list-disc list-inside">
                  <li>Sincronização via endpoint <code>/api/erp/products/sync</code></li>
                  <li>O campo <strong>Código ERP</strong> é o identificador único no delivery</li>
                  <li>Preços por tamanho são enviados como JSON para o cardápio</li>
                </ul>
              </div>
            </TabsContent>

          </div>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando || Boolean(nomeEmUso)}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdicao ? "Salvar Alterações" : "Criar Produto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

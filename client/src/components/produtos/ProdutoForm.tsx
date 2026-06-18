import { useState, useEffect, useCallback } from "react";
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
import { Loader2, CheckCircle2, XCircle, Info, Barcode, Plus, Trash2, Package } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SistemaSegmento } from "@shared/datadev";

interface ProdutoFormProps {
  guidProduto?: string;
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

// Tamanhos dinâmicos — agora gerenciados como array de objetos
interface TamanhoItem { nome: string; preco: number; qtd: number; }
interface FaixaPrecoItem {
  id?: number;
  unidade: string;
  fatorConversao: string;
  quantidadeMinima: string;
  descricaoPreco: string;
  precoVenda: string;
  ativo: boolean;
}

// ─── Tabelas fiscais ──────────────────────────────────────────────────────────
const ORIGEM_OPCOES = [
  { value: 0, label: "0 – Nacional (exceto 3, 4, 5 e 8)" },
  { value: 1, label: "1 – Estrangeira: importação direta (exceto 6)" },
  { value: 2, label: "2 – Estrangeira: adquirida no mercado interno (exceto 7)" },
  { value: 3, label: "3 – Nacional: conteúdo de importação > 40% e ≤ 70%" },
  { value: 4, label: "4 – Nacional: processos produtivos básicos (DL 288/67 e Leis 8.248/91, 8.387/91, 10.176/01, 11.484/07)" },
  { value: 5, label: "5 – Nacional: conteúdo de importação ≤ 40%" },
  { value: 6, label: "6 – Estrangeira: importação direta, sem similar nacional (CAMEX / gás natural)" },
  { value: 7, label: "7 – Estrangeira: mercado interno, sem similar nacional (CAMEX / gás natural)" },
  { value: 8, label: "8 – Nacional: conteúdo de importação > 70%" },
];

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

const REGIME_TRIB_OPCOES = [
  { value: 1, label: "1 – Padrão (alíquota cheia IBS + CBS)" },
  { value: 2, label: "2 – Reduzido (50% de redução)" },
  { value: 3, label: "3 – Isento (alíquota zero)" },
  { value: 4, label: "4 – Monofásico (tributação única na cadeia)" },
  { value: 5, label: "5 – Seletivo (IS – bens e serviços prejudiciais)" },
];

const CFOP_OPCOES = [
  { value: "5101", label: "5101 – Venda de produção do estabelecimento" },
  { value: "5102", label: "5102 – Venda de mercadoria adquirida de terceiros" },
  { value: "5405", label: "5405 – Venda de mercadoria com ST" },
  { value: "5933", label: "5933 – Prestação de serviço (Simples)" },
  { value: "6101", label: "6101 – Venda de produção (interestadual)" },
  { value: "6102", label: "6102 – Venda de mercadoria (interestadual)" },
];

const UNIDADES = ["UN", "KG", "G", "L", "ML", "M", "M2", "M3", "CX", "PC", "PAR", "DZ", "CT", "SC", "FD", "PT"];
const DESCRICOES_PRECO_FAIXA = ["VAREJO", "ATACADO"] as const;
const IMEI_SITUACOES = ["DISPONIVEL", "RESERVADO", "VENDIDO", "MANUTENCAO", "BLOQUEADO", "DEVOLVIDO"] as const;
const IMEI_ESTADOS = ["NOVO", "SEMINOVO", "USADO", "VITRINE", "RECONDICIONADO"] as const;



interface FormData {
  produto: string; referencia: string; descricao: string; guidCategoria: string;
  ordemExibicao: number; situacao: "A" | "I"; destaque: boolean; delivery: boolean;
  modoPreco: "simples" | "tamanhos";
  precoVenda: string; precocusto: string;
  tamanhos: TamanhoItem[];
  faixasPreco: FaixaPrecoItem[];
  // Formação de preço
  aliqIcmsForm: string; percReducaoForm: string; percFreteForm: string; percJurosForm: string;
  codBarras: string;
  codBarraCaixa: string;
  qtdCaixa: string;
  // Fiscal
  ncm: string; cest: string; cfop: string; unidade: string;
  origemProduto: number;
  fracionado: boolean;
  // Legado
  csosn: string; cst: string;
  aliqIcms: string; aliqPis: string; aliqCofins: string; aliqIpi: string;
  // Reforma Tributária
  aliqIbs: string; aliqCbs: string; aliqIs: string;
  regimeTrib: number; percReducao: string;
  codBenefIbs: string; codRegimeEsp: string;
  // Promoção
  percDesconto: string; precoPromo: string;
  dtInicioPromo: string; dtFimPromo: string;
  // Flags de comportamento (PDV)
  balanca: boolean; servico: boolean; alteraDescricao: boolean;
  // Estoque
  estoque: string; estoqueMinimo: string;
  // Delivery
  imageUrl: string; erpCode: string;
  permiteMontagem: boolean;
  tipoMontagem: typeof TIPOS_MONTAGEM[number];
  qtdMinOpcoes: string;
  qtdMaxOpcoes: string;
  obrigaSelecaoMontagem: boolean;
  tipoCalculoPrecoMontagem: typeof TIPOS_CALCULO_PRECO[number];
  opcoesMontagem: MontagemOpcaoItem[];
}
interface MontagemOpcaoItem {
  guidProdutoOpcao: string;
  descricao: string;
  valorAdicional: string;
  ordem: number;
  situacao: "A" | "I";
}

const TIPOS_MONTAGEM = ["PIZZA", "TREM", "BITREM", "SUSHI", "COMBO", "OUTROS"] as const;
const TIPOS_CALCULO_PRECO = ["MAIOR_VALOR", "MEDIA_VALORES", "SOMAR_VALORES", "PRECO_FIXO_PRODUTO"] as const;

interface ImeiFormData {
  guidImei: string;
  imei1: string;
  imei2: string;
  numeroSerie: string;
  cor: string;
  capacidade: string;
  estado: typeof IMEI_ESTADOS[number];
  situacao: typeof IMEI_SITUACOES[number];
  dataEntrada: string;
  custo: string;
  precoVenda: string;
  observacao: string;
}

type ProdutoImei = {
  GUIDIMEI: string;
  IMEI1: string | null;
  IMEI2: string | null;
  NUMEROSERIE: string | null;
  COR: string | null;
  CAPACIDADE: string | null;
  ESTADO: string | null;
  SITUACAO: string | null;
  DATAENTRADA: string | Date | null;
  CUSTO: number | null;
  PRECOVENDA: number | null;
  OBSERVACAO: string | null;
};

const FORM_INICIAL: FormData = {
  produto: "", referencia: "", descricao: "", guidCategoria: "",
  ordemExibicao: 0, situacao: "A", destaque: false, delivery: true,
  modoPreco: "tamanhos",
  precoVenda: "", precocusto: "",
  tamanhos: [],
  faixasPreco: [],
  aliqIcmsForm: "0", percReducaoForm: "0", percFreteForm: "0", percJurosForm: "0",
  codBarras: "",
  codBarraCaixa: "",
  qtdCaixa: "1",
  ncm: "", cest: "", cfop: "", unidade: "UN",
  origemProduto: 0,
  fracionado: false,
  csosn: "", cst: "",
  aliqIcms: "0.00", aliqPis: "0.65", aliqCofins: "3.00", aliqIpi: "0.00",
  aliqIbs: "0.00", aliqCbs: "0.00", aliqIs: "0.00",
  regimeTrib: 1, percReducao: "0.00",
  codBenefIbs: "", codRegimeEsp: "",
  percDesconto: "0", precoPromo: "0",
  dtInicioPromo: "", dtFimPromo: "",
  balanca: false, servico: false, alteraDescricao: false,
  estoque: "0", estoqueMinimo: "0",
  imageUrl: "", erpCode: "",
  permiteMontagem: false,
  tipoMontagem: "PIZZA",
  qtdMinOpcoes: "0",
  qtdMaxOpcoes: "0",
  obrigaSelecaoMontagem: false,
  tipoCalculoPrecoMontagem: "MAIOR_VALOR",
  opcoesMontagem: [],
};

function criarImeiForm(): ImeiFormData {
  return {
    guidImei: crypto.randomUUID(),
    imei1: "",
    imei2: "",
    numeroSerie: "",
    cor: "",
    capacidade: "",
    estado: "NOVO",
    situacao: "DISPONIVEL",
    dataEntrada: new Date().toISOString().slice(0, 10),
    custo: "",
    precoVenda: "",
    observacao: "",
  };
}

function formatDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline ml-1 shrink-0" />
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
  const [buscaImei, setBuscaImei] = useState("");
  const [situacaoImei, setSituacaoImei] = useState<"TODOS" | typeof IMEI_SITUACOES[number]>("TODOS");
  const [imeiForm, setImeiForm] = useState<ImeiFormData>(() => criarImeiForm());
  const [salvandoImei, setSalvandoImei] = useState(false);

  const { data: categorias } = trpc.categorias.listarTodas.useQuery();
  const { data: regime } = trpc.produtos.regimeEmpresa.useQuery();
  const segmentoEmpresa = String((regime as { segmento?: string } | undefined)?.segmento ?? "GERAL") as SistemaSegmento;
  const mostrarAbaImei = segmentoEmpresa === "LOJA_CELULAR" || segmentoEmpresa === "ASSISTENCIA_TECNICA";
  const mostrarAbaFood = segmentoEmpresa === "FOOD_DELIVERY";
  const { data: produtosOpcaoData } = trpc.produtos.listar.useQuery(
    { situacao: "A", pagina: 1, porPagina: 100 },
    { enabled: open && mostrarAbaFood }
  );
  const produtosOpcao = (produtosOpcaoData?.registros ?? []).filter((produto) => String(produto.GUIDPRODUTO) !== String(guidProduto ?? ""));

  const { data: produtoData } = trpc.produtos.buscarPorGuid.useQuery(
    { guidProduto: guidProduto! },
    { enabled: isEdicao && open }
  );

  const [nomeDebounced, setNomeDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setNomeDebounced(form.produto), 400);
    return () => clearTimeout(t);
  }, [form.produto]);

  const { data: validacaoNome } = trpc.produtos.validarNome.useQuery(
    { produto: nomeDebounced, guidProduto },
    { enabled: nomeDebounced.length >= 2 }
  );

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

  useEffect(() => {
    if (produtoData) {
      let modoPreco: "simples" | "tamanhos" = "tamanhos";
      let tamanhos: TamanhoItem[] = [];
      if (produtoData.PRECOS) {
        try {
          const precosObj = JSON.parse(produtoData.PRECOS);
          if (Array.isArray(precosObj)) {
            // Novo formato: array de { nome, preco, qtd }
            tamanhos = precosObj;
            modoPreco = "tamanhos";
          } else if (typeof precosObj === "object" && precosObj !== null) {
            const keys = Object.keys(precosObj);
            if (keys.length === 1 && keys[0] === "unico") {
              modoPreco = "simples";
            } else {
              modoPreco = "tamanhos";
              tamanhos = keys.map(k => ({ nome: k.toUpperCase(), preco: Number(precosObj[k]) || 0, qtd: 1 }));
            }
          }
        } catch { /* usar padrão */ }
      }
      const d = produtoData as Record<string, unknown>;
      const faixasPreco = Array.isArray(d.faixasPreco)
        ? (d.faixasPreco as Record<string, unknown>[]).map(faixa => ({
            id: Number(faixa.ID),
            unidade: String(faixa.UNIDADE ?? "UN"),
            fatorConversao: String(faixa.FATORCONVERSAO ?? "1"),
            quantidadeMinima: String(faixa.QUANTIDADEMINIMA ?? "1"),
            descricaoPreco: DESCRICOES_PRECO_FAIXA.includes(String(faixa.DESCRICAOPRECO ?? "").toUpperCase() as typeof DESCRICOES_PRECO_FAIXA[number])
              ? String(faixa.DESCRICAOPRECO).toUpperCase()
              : "VAREJO",
            precoVenda: String(faixa.PRECOVENDA ?? ""),
            ativo: Boolean(faixa.ATIVO),
          }))
        : [];
      setForm({
        produto: String(d.PRODUTO ?? ""),
        referencia: String(d.REFERENCIA ?? ""),
        descricao: String(d.DESCRICAO ?? ""),
        guidCategoria: String(d.GUIDENTIDADECAT ?? ""),
        ordemExibicao: Number(d.ORDEMEXIBICAO ?? 0),
        situacao: (String(d.SITUACAO ?? "A")) as "A" | "I",
        destaque: Boolean(d.DESTAQUE),
        delivery: d.DELIVERY !== undefined ? Boolean(d.DELIVERY) : true,
        modoPreco,
        precoVenda: d.PRECOVENDA ? String(d.PRECOVENDA) : "",
        precocusto: d.PRECOCUSTO ? String(d.PRECOCUSTO) : "",
        tamanhos,
        faixasPreco,
        aliqIcmsForm: d.ALIQICMSFORM !== undefined ? String(d.ALIQICMSFORM) : "0",
        percReducaoForm: d.PERCREDUCAOFORM !== undefined ? String(d.PERCREDUCAOFORM) : "0",
        percFreteForm: d.PERCFRETEFORM !== undefined ? String(d.PERCFRETEFORM) : "0",
        percJurosForm: d.PERCJUROSFORM !== undefined ? String(d.PERCJUROSFORM) : "0",
        codBarras: String(d.CODBARRAS ?? ""),
        codBarraCaixa: String(d.CODBARRACAIXA ?? ""),
        qtdCaixa: d.QTDCAIXA !== undefined ? String(d.QTDCAIXA) : "1",
        ncm: String(d.NCM ?? ""),
        cest: String(d.CEST ?? ""),
        cfop: String(d.CFOP ?? ""),
        unidade: String(d.UNIDADE ?? "UN"),
        origemProduto: Number(d.ORIGEMPRODUTO ?? 0),
        fracionado: Boolean(d.FRACIONADO),
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
        percDesconto: d.PERCDESCONTO !== undefined ? String(d.PERCDESCONTO) : "0",
        precoPromo: d.PRECOPROMO !== undefined ? String(d.PRECOPROMO) : "0",
        dtInicioPromo: d.DTINICIOPROMO ? new Date(d.DTINICIOPROMO as string).toISOString().slice(0,10) : "",
        dtFimPromo: d.DTFIMPROMO ? new Date(d.DTFIMPROMO as string).toISOString().slice(0,10) : "",
        balanca: Boolean(d.BALANCA),
        servico: Boolean(d.SERVICO),
        alteraDescricao: Boolean(d.ALTERADESCRICAO),
        estoque: d.ESTOQUE !== undefined ? String(d.ESTOQUE) : "0",
        estoqueMinimo: d.ESTOQUEMINIMO !== undefined ? String(d.ESTOQUEMINIMO) : "0",
        imageUrl: String(d.IMAGEURL ?? ""),
        erpCode: String(d.ERPCODE ?? ""),
        permiteMontagem: Boolean(d.PERMITEMONTAGEM),
        tipoMontagem: TIPOS_MONTAGEM.includes(String(d.TIPOMONTAGEM ?? "PIZZA") as typeof TIPOS_MONTAGEM[number])
          ? String(d.TIPOMONTAGEM ?? "PIZZA") as typeof TIPOS_MONTAGEM[number]
          : "PIZZA",
        qtdMinOpcoes: String(d.QTDMINOPCOES ?? "0"),
        qtdMaxOpcoes: String(d.QTDMAXOPCOES ?? "0"),
        obrigaSelecaoMontagem: Boolean(d.OBRIGASELECAOMONTAGEM),
        tipoCalculoPrecoMontagem: TIPOS_CALCULO_PRECO.includes(String(d.TIPOCALCULOPRECOMONTAGEM ?? "MAIOR_VALOR") as typeof TIPOS_CALCULO_PRECO[number])
          ? String(d.TIPOCALCULOPRECOMONTAGEM ?? "MAIOR_VALOR") as typeof TIPOS_CALCULO_PRECO[number]
          : "MAIOR_VALOR",
        opcoesMontagem: Array.isArray(d.opcoesMontagem)
          ? (d.opcoesMontagem as Record<string, unknown>[]).map((opcao, index) => ({
              guidProdutoOpcao: String(opcao.GUIDPRODUTOOPCAO ?? ""),
              descricao: String(opcao.DESCRICAO ?? ""),
              valorAdicional: String(opcao.VALORADICIONAL ?? "0"),
              ordem: Number(opcao.ORDEM ?? index + 1),
              situacao: String(opcao.SITUACAO ?? "A") === "I" ? "I" : "A",
            }))
          : [],
      });
    } else if (!isEdicao) {
      setForm(FORM_INICIAL);
    }
  }, [produtoData, isEdicao]);

  useEffect(() => {
    if (!open) { setForm(FORM_INICIAL); setErros({}); setAbaAtiva("dados"); }
  }, [open]);

  useEffect(() => {
    if (abaAtiva === "imei" && !mostrarAbaImei) setAbaAtiva("dados");
    if (abaAtiva === "foodDelivery" && !mostrarAbaFood) setAbaAtiva("dados");
  }, [abaAtiva, mostrarAbaFood, mostrarAbaImei]);

  const utils = trpc.useUtils();
  const criarMutation = trpc.produtos.criar.useMutation();
  const atualizarMutation = trpc.produtos.atualizar.useMutation();
  const salvarImeiMutation = trpc.produtos.salvarImei.useMutation();
  const excluirImeiMutation = trpc.produtos.excluirImei.useMutation();
  const { data: imeisData, refetch: refetchImeis } = trpc.produtos.listarImeis.useQuery(
    {
      guidProduto: guidProduto!,
      busca: buscaImei || undefined,
      situacao: situacaoImei,
    },
    { enabled: isEdicao && open && Boolean(guidProduto) && mostrarAbaImei }
  );

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (erros[key]) setErros(prev => ({ ...prev, [key]: undefined }));
  }
  function setImeiField<K extends keyof ImeiFormData>(key: K, value: ImeiFormData[K]) {
    setImeiForm(prev => ({ ...prev, [key]: value }));
  }
  function setTexto(key: keyof FormData, value: string) {
    setField(key, value.toUpperCase() as FormData[typeof key]);
  }
  const addTamanho = useCallback(() => setForm(f => ({ ...f, tamanhos: [...f.tamanhos, { nome: "", preco: 0, qtd: 1 }] })), []);
  const removeTamanho = useCallback((i: number) => setForm(f => ({ ...f, tamanhos: f.tamanhos.filter((_, idx) => idx !== i) })), []);
  const updateTamanho = useCallback((i: number, field: keyof TamanhoItem, v: string | number) =>
    setForm(f => { const t = [...f.tamanhos]; t[i] = { ...t[i], [field]: field === "nome" ? String(v).toUpperCase() : Number(v) }; return { ...f, tamanhos: t }; }), []);
  const addFaixaPreco = useCallback(() => setForm(f => ({
    ...f,
    faixasPreco: [...f.faixasPreco, {
      unidade: f.unidade || "UN",
      fatorConversao: f.unidade === "CX" ? (f.qtdCaixa || "1") : "1",
      quantidadeMinima: "1",
      descricaoPreco: "VAREJO",
      precoVenda: f.precoVenda || "",
      ativo: true,
    }],
  })), []);
  const removeFaixaPreco = useCallback((i: number) => setForm(f => ({ ...f, faixasPreco: f.faixasPreco.filter((_, idx) => idx !== i) })), []);
  const updateFaixaPreco = useCallback((i: number, field: keyof FaixaPrecoItem, value: string | boolean) =>
    setForm(f => {
      const faixas = [...f.faixasPreco];
      faixas[i] = {
        ...faixas[i],
        [field]: typeof value === "string" && (field === "unidade" || field === "descricaoPreco")
          ? value.toUpperCase()
          : value,
      };
      return { ...f, faixasPreco: faixas };
    }), []);

  const toggleOpcaoMontagem = useCallback((guidProdutoOpcao: string, descricao: string) => {
    setForm(f => {
      const existe = f.opcoesMontagem.some(opcao => opcao.guidProdutoOpcao === guidProdutoOpcao);
      if (existe) {
        return { ...f, opcoesMontagem: f.opcoesMontagem.filter(opcao => opcao.guidProdutoOpcao !== guidProdutoOpcao) };
      }
      return {
        ...f,
        opcoesMontagem: [
          ...f.opcoesMontagem,
          { guidProdutoOpcao, descricao, valorAdicional: "0", ordem: f.opcoesMontagem.length + 1, situacao: "A" },
        ],
      };
    });
  }, []);

  const updateOpcaoMontagem = useCallback((guidProdutoOpcao: string, field: "valorAdicional" | "ordem", value: string | number) => {
    setForm(f => ({
      ...f,
      opcoesMontagem: f.opcoesMontagem.map(opcao =>
        opcao.guidProdutoOpcao === guidProdutoOpcao ? { ...opcao, [field]: value } : opcao
      ),
    }));
  }, []);

  function buildPrecosPayload() {
    if (form.modoPreco === "simples") {
      const p = parseFloat(form.precoVenda || "0");
      return { precos: JSON.stringify({ unico: p }), tamanhosDisp: JSON.stringify(["unico"]) };
    }
    // Novo formato: array de { nome, preco, qtd }
    const tamanhoKeys = form.tamanhos.map(t => t.nome);
    return { precos: JSON.stringify(form.tamanhos), tamanhosDisp: JSON.stringify(tamanhoKeys) };
  }

  function novoImei() {
    setImeiForm(criarImeiForm());
  }

  function editarImei(row: ProdutoImei) {
    setImeiForm({
      guidImei: row.GUIDIMEI,
      imei1: row.IMEI1 ?? "",
      imei2: row.IMEI2 ?? "",
      numeroSerie: row.NUMEROSERIE ?? "",
      cor: row.COR ?? "",
      capacidade: row.CAPACIDADE ?? "",
      estado: (IMEI_ESTADOS.includes(row.ESTADO as typeof IMEI_ESTADOS[number]) ? row.ESTADO : "NOVO") as typeof IMEI_ESTADOS[number],
      situacao: (IMEI_SITUACOES.includes(row.SITUACAO as typeof IMEI_SITUACOES[number]) ? row.SITUACAO : "DISPONIVEL") as typeof IMEI_SITUACOES[number],
      dataEntrada: formatDateInput(row.DATAENTRADA),
      custo: row.CUSTO != null ? String(row.CUSTO) : "",
      precoVenda: row.PRECOVENDA != null ? String(row.PRECOVENDA) : "",
      observacao: row.OBSERVACAO ?? "",
    });
  }

  async function salvarImei() {
    if (!guidProduto) {
      toast.error("Salve o produto antes de cadastrar IMEI.");
      return;
    }
    if (!imeiForm.guidImei) {
      toast.error("GUIDIMEI obrigatorio.");
      return;
    }
    if (!imeiForm.imei1.trim() && !imeiForm.imei2.trim() && !imeiForm.numeroSerie.trim()) {
      toast.error("Informe IMEI 1, IMEI 2 ou numero de serie.");
      return;
    }

    setSalvandoImei(true);
    try {
      await salvarImeiMutation.mutateAsync({
        guidImei: imeiForm.guidImei,
        guidProduto,
        imei1: imeiForm.imei1.trim() || undefined,
        imei2: imeiForm.imei2.trim() || undefined,
        numeroSerie: imeiForm.numeroSerie.trim() || undefined,
        cor: imeiForm.cor.trim() || undefined,
        capacidade: imeiForm.capacidade.trim() || undefined,
        estado: imeiForm.estado,
        situacao: imeiForm.situacao,
        dataEntrada: imeiForm.dataEntrada || undefined,
        custo: parseFloat(imeiForm.custo || "0"),
        precoVenda: parseFloat(imeiForm.precoVenda || "0"),
        observacao: imeiForm.observacao.trim() || undefined,
      });
      toast.success("IMEI salvo com sucesso!");
      novoImei();
      await refetchImeis();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar IMEI");
    } finally {
      setSalvandoImei(false);
    }
  }

  async function excluirImei(guidImei: string) {
    if (!confirm("Excluir este IMEI do produto?")) return;
    try {
      await excluirImeiMutation.mutateAsync({ guidImei });
      toast.success("IMEI excluido com sucesso!");
      if (imeiForm.guidImei === guidImei) novoImei();
      await refetchImeis();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir IMEI");
    }
  }
  function calcTotalFormacao(): number {
    const custo = parseFloat(form.precocusto || "0");
    const icms = custo * (parseFloat(form.aliqIcmsForm || "0") / 100);
    const red = custo * (parseFloat(form.percReducaoForm || "0") / 100);
    const frete = custo * (parseFloat(form.percFreteForm || "0") / 100);
    const juros = custo * (parseFloat(form.percJurosForm || "0") / 100);
    return custo + icms - red + frete + juros;
  }
  function calcLucro(): { reais: number; perc: number } {
    const venda = parseFloat(form.precoVenda || "0");
    const custo = calcTotalFormacao();
    if (venda <= 0 || custo <= 0) return { reais: 0, perc: 0 };
    const reais = venda - custo;
    const perc = (reais / venda) * 100;
    return { reais, perc };
  }

  function validar(): boolean {
    const novosErros: Record<string, string> = {};
    const ncmLimpo = form.ncm.replace(/\D/g, "");
    if (!form.produto.trim()) novosErros.produto = "Nome do produto é obrigatório";
    if (validacaoNome && !validacaoNome.disponivel) novosErros.produto = "Já existe um produto com este nome";
    if (!form.ncm.trim()) novosErros.ncm = "NCM é obrigatório";
    if (!form.cfop.trim() || form.cfop === "NENHUM") novosErros.cfop = "CFOP é obrigatório";
    if ((regime?.isSimples || !regime) && !form.csosn.trim()) novosErros.csosn = "CSOSN é obrigatório para Simples Nacional";
    if (regime?.isNormal && !form.cst.trim()) novosErros.cst = "CST é obrigatório para Regime Normal";
    if (form.modoPreco === "tamanhos" && form.tamanhos.some(t => !t.nome.trim())) novosErros.tamanhos = "Todos os tamanhos precisam ter um nome";
    if (ncmLimpo && ncmLimpo.length !== 8) novosErros.ncm = "NCM deve ter exatamente 8 dÃ­gitos";
    const chavesFaixas = new Set<string>();
    for (const faixa of form.faixasPreco) {
      const unidade = faixa.unidade.trim().toUpperCase();
      const fator = parseFloat(faixa.fatorConversao || "0");
      const qtdMinima = parseFloat(faixa.quantidadeMinima || "0");
      const precoVenda = parseFloat(faixa.precoVenda || "0");
      if (!unidade) novosErros.faixasPreco = "Informe a unidade em todas as faixas";
      if (fator <= 0) novosErros.faixasPreco = "Fator de conversao deve ser maior que zero";
      if (qtdMinima <= 0) novosErros.faixasPreco = "Quantidade minima deve ser maior que zero";
      if (precoVenda <= 0) novosErros.faixasPreco = "Preco de venda da faixa deve ser maior que zero";
      const chave = `${unidade}|${qtdMinima}`;
      if (chavesFaixas.has(chave)) novosErros.faixasPreco = "Nao pode repetir unidade e quantidade minima";
      chavesFaixas.add(chave);
    }
    setErros(novosErros);
    const fiscalErros = ["ncm", "cfop", "csosn", "cst"];
    if (fiscalErros.some(k => novosErros[k])) setAbaAtiva("fiscal");
    else if (novosErros.produto) setAbaAtiva("dados");
    else if (novosErros.tamanhos || novosErros.faixasPreco) setAbaAtiva("precos");
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
        faixasPreco: form.faixasPreco.map(faixa => ({
          id: faixa.id,
          unidade: faixa.unidade.trim().toUpperCase(),
          fatorConversao: parseFloat(faixa.fatorConversao || "0"),
          quantidadeMinima: parseFloat(faixa.quantidadeMinima || "0"),
          descricaoPreco: faixa.descricaoPreco.trim() || undefined,
          precoVenda: parseFloat(faixa.precoVenda || "0"),
          ativo: faixa.ativo,
        })),
        imageUrl: form.imageUrl || undefined,
        erpCode: form.erpCode || undefined,
        destaque: form.destaque,
        delivery: form.delivery,
        ordemExibicao: form.ordemExibicao,
        situacao: form.situacao,
        referencia: form.referencia || undefined,
        codBarras: form.codBarras || undefined,
        codBarraCaixa: form.codBarraCaixa || undefined,
        qtdCaixa: parseFloat(form.qtdCaixa || "1") || 1,
        aliqIcmsForm: parseFloat(form.aliqIcmsForm || "0"),
        percReducaoForm: parseFloat(form.percReducaoForm || "0"),
        percFreteForm: parseFloat(form.percFreteForm || "0"),
        percJurosForm: parseFloat(form.percJurosForm || "0"),
        ncm: form.ncm.replace(/\D/g, "") || undefined,
        cest: form.cest || undefined,
        cfop: form.cfop || undefined,
        unidade: form.unidade || "UN",
        origemProduto: form.origemProduto,
        fracionado: form.fracionado,
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
        percDesconto: parseFloat(form.percDesconto || "0"),
        precoPromo: parseFloat(form.precoPromo || "0"),
        dtInicioPromo: form.dtInicioPromo || undefined,
        dtFimPromo: form.dtFimPromo || undefined,
        balanca: form.balanca,
        servico: form.servico,
        alteraDescricao: form.alteraDescricao,
        estoque: parseFloat(form.estoque || "0"),
        estoqueMinimo: parseFloat(form.estoqueMinimo || "0"),
        permiteMontagem: form.permiteMontagem,
        tipoMontagem: form.tipoMontagem,
        qtdMinOpcoes: parseInt(form.qtdMinOpcoes || "0") || 0,
        qtdMaxOpcoes: parseInt(form.qtdMaxOpcoes || "0") || 0,
        obrigaSelecaoMontagem: form.obrigaSelecaoMontagem,
        tipoCalculoPrecoMontagem: form.tipoCalculoPrecoMontagem,
        opcoesMontagem: form.opcoesMontagem.map((opcao, index) => ({
          guidProdutoOpcao: opcao.guidProdutoOpcao,
          descricao: opcao.descricao || undefined,
          valorAdicional: parseFloat(opcao.valorAdicional || "0") || 0,
          ordem: Number(opcao.ordem || index + 1),
          situacao: opcao.situacao,
        })),
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
      {/* Modal largo com altura controlada */}
      <DialogContent className="w-screen max-w-none h-[100dvh] max-h-[100dvh] sm:w-[94vw] sm:max-w-[94vw] sm:h-auto sm:max-h-[90vh] lg:w-[88vw] lg:max-w-[88vw] xl:w-[86vw] xl:max-w-[86vw] 2xl:w-[84vw] 2xl:max-w-[84vw] flex flex-col p-0 gap-0">
        {/* Cabeçalho fixo */}
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEdicao ? "Editar Produto" : "Novo Produto"}
            {regimeBadge}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="flex-1 flex flex-col overflow-hidden">
          {/* Abas com scroll horizontal em telas pequenas */}
          <div className="shrink-0 border-b overflow-x-auto">
            <TabsList className="w-full rounded-none h-10 bg-transparent border-0 flex min-w-max lg:min-w-0">
              <TabsTrigger value="dados" className="relative flex-1 min-w-[90px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">
                Dados Gerais
                {erros.produto && <span className="absolute -top-0.5 right-1 w-3.5 h-3.5 bg-destructive text-white text-[9px] rounded-full flex items-center justify-center">!</span>}
              </TabsTrigger>
              <TabsTrigger value="precos" className="flex-1 min-w-[70px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">Preços</TabsTrigger>
              <TabsTrigger value="fiscal" className="flex-1 min-w-[60px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">Fiscal</TabsTrigger>
              <TabsTrigger value="estoque" className="flex-1 min-w-[70px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">Estoque</TabsTrigger>
              {mostrarAbaImei && (
                <TabsTrigger value="imei" className="flex-1 min-w-[100px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">Celular / IMEI</TabsTrigger>
              )}
              {mostrarAbaFood && (
                <TabsTrigger value="foodDelivery" className="flex-1 min-w-[110px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs">Food / Delivery</TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Conteúdo com scroll vertical */}
          <div className="flex-1 overflow-y-auto">

            {/* ── ABA DADOS GERAIS ─────────────────────────────────────────── */}
            <TabsContent value="dados" className="space-y-4 p-4 lg:p-5 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="xl:col-span-2 space-y-1">
                  <Label>Referência</Label>
                  <Input value={form.referencia} onChange={e => setTexto("referencia", e.target.value)} placeholder="REF-001" maxLength={50} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="produto">Nome do Produto <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    id="produto"
                    value={form.produto}
                    onChange={e => setTexto("produto", e.target.value)}
                    placeholder="EX: REFRIGERANTE LATA 350ML"
                    maxLength={150}
                    className={`pr-8 ${erros.produto || nomeEmUso ? "border-destructive" : nomeValido && form.produto.length >= 2 ? "border-green-500" : ""}`}
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

              <div className="space-y-1">
                <Label htmlFor="codBarras" className="flex items-center gap-1">
                  <Barcode className="h-4 w-4" /> Código de Barras (EAN / GTIN)
                </Label>
                <Input
                  id="codBarras"
                  value={form.codBarras}
                  onChange={e => setField("codBarras", e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="EX: 7891234567890"
                  maxLength={14}
                />
                <p className="text-xs text-muted-foreground">EAN-8, EAN-13 ou GTIN-14. Usado no PDV e na NF-e para venda da <strong>unidade</strong>.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 p-3 rounded-md border bg-muted/20">
                <div className="md:col-span-2 xl:col-span-3 space-y-1">
                  <Label htmlFor="codBarraCaixa" className="flex items-center gap-1">
                    <Barcode className="h-4 w-4" /> Cód. de Barras da Caixa / Embalagem
                  </Label>
                  <Input
                    id="codBarraCaixa"
                    value={form.codBarraCaixa}
                    onChange={e => setField("codBarraCaixa", e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="EX: 17891234567890"
                    maxLength={14}
                  />
                  <p className="text-xs text-muted-foreground">EAN da embalagem/caixa. Ao escanear este código no PDV, baixa N unidades do estoque.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="qtdCaixa" className="flex items-center gap-1">
                    Qtd por Caixa <InfoTip text="Quantidade de unidades contidas em cada caixa/embalagem. Ao vender pela caixa, o estoque é baixado por esta quantidade." />
                  </Label>
                  <Input
                    id="qtdCaixa"
                    type="number"
                    min={1}
                    step={1}
                    value={form.qtdCaixa}
                    onChange={e => setField("qtdCaixa", e.target.value)}
                    placeholder="Ex: 12"
                  />
                  <p className="text-xs text-muted-foreground">Unidades/caixa</p>
                </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <Switch id="destaque" checked={form.destaque} onCheckedChange={v => setField("destaque", v)} />
                  <div>
                    <Label htmlFor="destaque" className="cursor-pointer">Produto em Destaque</Label>
                    <p className="text-xs text-muted-foreground">Aparece na seção de destaques</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <Switch id="delivery" checked={form.delivery} onCheckedChange={v => setField("delivery", v)} />
                  <div>
                    <Label htmlFor="delivery" className="cursor-pointer">Vai para o Delivery</Label>
                    <p className="text-xs text-muted-foreground">Exibir no cardápio online</p>
                  </div>
                </div>
              </div>

              <Separator />
              <p className="text-sm font-semibold text-muted-foreground">Configurações do PDV</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <Switch id="balanca" checked={form.balanca} onCheckedChange={v => setField("balanca", v)} />
                  <div>
                    <Label htmlFor="balanca" className="cursor-pointer">Produto para Balança</Label>
                    <p className="text-xs text-muted-foreground">O PDV solicita pesagem ao vender este produto</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <Switch id="servico" checked={form.servico} onCheckedChange={v => setField("servico", v)} />
                  <div>
                    <Label htmlFor="servico" className="cursor-pointer">Produto é Serviço</Label>
                    <p className="text-xs text-muted-foreground">Classifica como serviço na NF-e (NFS-e) e no PDV</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md border">
                  <Switch id="alteraDescricao" checked={form.alteraDescricao} onCheckedChange={v => setField("alteraDescricao", v)} />
                  <div>
                    <Label htmlFor="alteraDescricao" className="cursor-pointer">Permite Alterar Descrição na Venda</Label>
                    <p className="text-xs text-muted-foreground">Operador pode editar a descrição do item na tela de venda</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── ABA PREÇOS ───────────────────────────────────────────────── */}
            <TabsContent value="precos" className="space-y-4 p-4 lg:p-5 mt-0">
              <div className="space-y-2">
                <Label>Modo de Preço</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="precocusto">Preço de Custo (R$)</Label>
                      <Input id="precocusto" type="number" min={0} step={0.01} value={form.precocusto} onChange={e => setField("precocusto", e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="precoVenda">Preço de Venda (R$)</Label>
                      <Input id="precoVenda" type="number" min={0} step={0.01} value={form.precoVenda} onChange={e => setField("precoVenda", e.target.value)} placeholder="0,00" />
                    </div>
                  </div>
                  {/* Formação de preço */}
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <p className="text-sm font-semibold">Formação de Preço (sobre o Custo)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {([
                        { k: "aliqIcmsForm" as const, l: "ICMS (%)" },
                        { k: "percReducaoForm" as const, l: "Redução (%)" },
                        { k: "percFreteForm" as const, l: "Frete (%)" },
                        { k: "percJurosForm" as const, l: "Juros (%)" },
                      ] as const).map(({ k, l }) => (
                        <div key={k} className="space-y-1">
                          <Label className="text-xs">{l}</Label>
                          <Input type="number" min={0} max={100} step={0.01} value={form[k]} onChange={e => setField(k, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Total calculado:</span>
                      <span className="text-lg font-bold text-primary">R$ {calcTotalFormacao().toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Custo + ICMS − Redução + Frete + Juros</p>
                    {/* Lucro */}
                    {parseFloat(form.precoVenda || "0") > 0 && (() => {
                      const { reais, perc } = calcLucro();
                      const positivo = reais >= 0;
                      return (
                        <div className={`flex items-center justify-between pt-2 border-t ${positivo ? "border-green-500/30" : "border-destructive/30"}`}>
                          <div>
                            <span className="text-sm font-medium">Lucro sobre o Preço de Venda</span>
                            <p className="text-xs text-muted-foreground">Preço de Venda − Total calculado</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-bold ${positivo ? "text-green-500" : "text-destructive"}`}>
                              {positivo ? "+" : ""}{reais.toFixed(2)} R$
                            </p>
                            <p className={`text-sm font-semibold ${positivo ? "text-green-500" : "text-destructive"}`}>
                              {positivo ? "+" : ""}{perc.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tamanhos / Variações</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addTamanho} className="gap-1 h-7 text-xs">
                      <Plus className="h-3 w-3" /> Adicionar
                    </Button>
                  </div>
                  {erros.tamanhos && <p className="text-xs text-destructive">{erros.tamanhos}</p>}
                  {form.tamanhos.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-md text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum tamanho cadastrado.</p>
                      <p className="text-xs mt-1">Clique em "Adicionar" para incluir tamanhos, cores ou grades.</p>
                      <p className="text-xs mt-1 opacity-70">Exemplos: P / M / G / GG (roupas) · BROTINHO / GRANDE (pizzas) · 250ML / 1L (bebidas)</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 px-2">
                        <span className="col-span-5 text-xs font-semibold text-muted-foreground">Nome / Variação</span>
                        <span className="col-span-3 text-xs font-semibold text-muted-foreground">Preço (R$)</span>
                        <span className="col-span-3 text-xs font-semibold text-muted-foreground">Qtd Estoque</span>
                        <span className="col-span-1" />
                      </div>
                      {form.tamanhos.map((t, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded p-1.5">
                          <Input className="col-span-5 h-8 text-sm" value={t.nome}
                            onChange={e => updateTamanho(i, "nome", e.target.value)}
                            placeholder="EX: P, M, G / BROTINHO..." />
                          <Input type="number" min={0} step={0.01} className="col-span-3 h-8 text-sm" value={t.preco}
                            onChange={e => updateTamanho(i, "preco", e.target.value)} />
                          <Input type="number" min={0} step={1} className="col-span-3 h-8 text-sm" value={t.qtd}
                            onChange={e => updateTamanho(i, "qtd", e.target.value)} />
                          <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeTamanho(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Exemplos: P / M / G / GG (roupas) · BROTINHO / PEQUENA / GRANDE (pizzas) · 250ML / 500ML / 1L (bebidas)</p>
                  {/* Tamanho não tem uma tabela abaixo — removido o bloco antigo */}
                  <div className="hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-1/2">Tamanho</th>
                          <th className="text-left px-3 py-2 font-medium w-1/2">Preço de Venda (R$)</th>
                        </tr>
                      </thead>
                      <tbody></tbody>
                    </table>
                  </div>
                </div>
              )}

              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Precos por faixa de quantidade</p>
                    <p className="text-xs text-muted-foreground">O PDV aplica automaticamente a maior quantidade minima compativel com a venda.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addFaixaPreco} className="gap-1 h-8 text-xs shrink-0">
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>
                {erros.faixasPreco && <p className="text-xs text-destructive">{erros.faixasPreco}</p>}
                {form.faixasPreco.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Sem faixas cadastradas. O sistema continua usando o preco de venda padrao do produto.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.faixasPreco.map((faixa, i) => (
                      <div key={faixa.id ?? i} className="space-y-3 rounded-md bg-muted/30 p-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[120px_1fr_1fr_40px] xl:items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Unidade</Label>
                            <Select value={faixa.unidade || "UN"} onValueChange={v => updateFaixaPreco(i, "unidade", v)}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Fator conversao</Label>
                            <Input type="number" min={0.0001} step={0.0001} className="h-8" value={faixa.fatorConversao} onChange={e => updateFaixaPreco(i, "fatorConversao", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Qtd minima</Label>
                            <Input type="number" min={0.0001} step={0.0001} className="h-8" value={faixa.quantidadeMinima} onChange={e => updateFaixaPreco(i, "quantidadeMinima", e.target.value)} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeFaixaPreco(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_120px] xl:items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Descricao</Label>
                            <Select value={faixa.descricaoPreco || "VAREJO"} onValueChange={v => updateFaixaPreco(i, "descricaoPreco", v)}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DESCRICOES_PRECO_FAIXA.map(descricao => (
                                  <SelectItem key={descricao} value={descricao}>{descricao}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Preco venda</Label>
                            <Input type="number" min={0.01} step={0.01} className="h-8" value={faixa.precoVenda} onChange={e => updateFaixaPreco(i, "precoVenda", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ativo</Label>
                            <div className="flex h-8 items-center gap-2 rounded-md border bg-background px-3">
                              <Switch checked={faixa.ativo} onCheckedChange={v => updateFaixaPreco(i, "ativo", v)} />
                              <span className="text-xs">{faixa.ativo ? "Sim" : "Nao"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Promoção ── */}
              <Separator />
              <div className="space-y-3">
                <p className="text-sm font-semibold">Promoção</p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="percDesconto">% Desconto <InfoTip text="Percentual de desconto sobre o preço de venda. Ex: 10 = 10% de desconto." /></Label>
                    <Input id="percDesconto" type="number" min={0} max={100} step={0.01} value={form.percDesconto} onChange={e => setField("percDesconto", e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="precoPromo">Preço Promocional (R$) <InfoTip text="Preço com desconto aplicado. Pode ser calculado automaticamente pelo PDV usando o % de desconto." /></Label>
                    <Input id="precoPromo" type="number" min={0} step={0.01} value={form.precoPromo} onChange={e => setField("precoPromo", e.target.value)} placeholder="0,00" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="dtInicioPromo">Data Inicial da Promoção</Label>
                    <Input id="dtInicioPromo" type="date" value={form.dtInicioPromo} onChange={e => setField("dtInicioPromo", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dtFimPromo">Data Final da Promoção</Label>
                    <Input id="dtFimPromo" type="date" value={form.dtFimPromo} onChange={e => setField("dtFimPromo", e.target.value)} />
                    {form.dtFimPromo && new Date(form.dtFimPromo) < new Date() && (
                      <p className="text-xs text-yellow-600">⚠️ Promoção expirada</p>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── ABA FISCAL ───────────────────────────────────────────────── */}
            <TabsContent value="fiscal" className="space-y-4 p-4 lg:p-5 mt-0">

              {/* Banner de regime */}
              {regime && (
                <div className={`p-3 rounded-md border text-sm flex items-start gap-2 ${
                  regime.isMEI ? "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300"
                  : regime.isSimples ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                  : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                }`}>
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium">{regime.descricaoRegime}</span>
                    <span className="text-xs ml-2 opacity-75">(CRT {regime.crt})</span>
                    {regime.isMEI && <p className="text-xs mt-0.5 opacity-80">MEI: isento de ICMS, PIS e COFINS. Preencha apenas NCM, CFOP e campos da Reforma Tributária.</p>}
                    {regime.isSimples && !regime.isMEI && <p className="text-xs mt-0.5 opacity-80">Simples Nacional: use CSOSN. PIS/COFINS inclusos na DAS — alíquotas informativas.</p>}
                    {regime.isNormal && <p className="text-xs mt-0.5 opacity-80">Regime Normal: use CST ICMS. PIS/COFINS pelo regime {regime.regimePisCofins === 1 ? "Cumulativo (3%/0,65%)" : "Não Cumulativo (7,6%/1,65%)"}.</p>}
                  </div>
                </div>
              )}

              {/* Origem do produto — Tabela A */}
              <div className="space-y-1">
                <Label className="flex items-center gap-1">
                  Origem da Mercadoria (Tabela A)
                  <InfoTip text="Define a procedência do produto conforme a Tabela A do ICMS. Obrigatório na NF-e. Código 0 = Nacional é o mais comum." />
                </Label>
                <Select value={String(form.origemProduto)} onValueChange={v => setField("origemProduto", parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORIGEM_OPCOES.map(o => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* NCM e CEST */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ncm">NCM <span className="text-destructive">*</span> <InfoTip text="Nomenclatura Comum do Mercosul — 8 dígitos. Obrigatório na NF-e." /></Label>
                  <Input id="ncm" value={form.ncm} onChange={e => setField("ncm", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" maxLength={8} className={erros.ncm ? "border-destructive" : ""} />
                  {erros.ncm && <p className="text-xs text-destructive">{erros.ncm}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cest">CEST <InfoTip text="Código Especificador da Substituição Tributária — 7 dígitos. Obrigatório quando há ST." /></Label>
                  <Input id="cest" value={form.cest} onChange={e => setField("cest", e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="0000000" maxLength={7} />
                </div>
              </div>

              {/* CFOP, Unidade e Fracionado */}
              <div className="space-y-4">
              <div className="space-y-1 min-w-0">
                <Label className="flex items-center gap-1">CFOP <span className="text-destructive">*</span> <InfoTip text="Código Fiscal de Operações e Prestações — define a natureza da operação." /></Label>
                <Select value={form.cfop || "NENHUM"} onValueChange={v => setField("cfop", v === "NENHUM" ? "" : v)}>
                  <SelectTrigger className={`w-full min-w-0 ${erros.cfop ? "border-destructive" : ""}`}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NENHUM">Não definido</SelectItem>
                    {CFOP_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {erros.cfop && <p className="text-xs text-destructive">{erros.cfop}</p>}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[150px_260px]">
              <div className="space-y-1 min-w-0">
                <Label>Unidade Fiscal <InfoTip text="Unidade de medida usada na NF-e (UN, KG, L, CX, etc.)" /></Label>
                <Select value={form.unidade} onValueChange={v => setField("unidade", v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="flex items-center gap-1">
                  Fracionado <InfoTip text="Produto vendido em frações (ex: kg, litro, metro). Permite quantidades decimais no PDV e na NF-e." />
                </Label>
                <div className="flex h-10 items-center gap-3 rounded-md border px-3">
                  <Switch id="fracionado" checked={form.fracionado} onCheckedChange={v => setField("fracionado", v)} />
                  <span className="text-sm">{form.fracionado ? "Sim — fracionado" : "Não — inteiro"}</span>
                </div>
              </div>
              </div>
              </div>

              <Separator />

              {/* Tributação Legada */}
              <p className="text-sm font-semibold">Tributação Legada — NF-e (atual)</p>

              {(regime?.isSimples || !regime) && (
                <div className="space-y-1">
                  <Label>CSOSN <span className="text-destructive">*</span> <InfoTip text="Código de Situação da Operação no Simples Nacional. Obrigatório para emissão de NF-e no Simples." /></Label>
                  <Select value={form.csosn || "NENHUM"} onValueChange={v => setField("csosn", v === "NENHUM" ? "" : v)}>
                    <SelectTrigger className={erros.csosn ? "border-destructive" : ""}><SelectValue placeholder="Selecione o CSOSN..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUM">Não definido</SelectItem>
                      {CSOSN_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {erros.csosn && <p className="text-xs text-destructive">{erros.csosn}</p>}
                </div>
              )}

              {regime?.isNormal && (
                <div className="space-y-1">
                  <Label>CST ICMS <span className="text-destructive">*</span> <InfoTip text="Código de Situação Tributária do ICMS para Regime Normal (Lucro Presumido / Lucro Real)." /></Label>
                  <Select value={form.cst || "NENHUM"} onValueChange={v => setField("cst", v === "NENHUM" ? "" : v)}>
                    <SelectTrigger className={erros.cst ? "border-destructive" : ""}><SelectValue placeholder="Selecione o CST..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NENHUM">Não definido</SelectItem>
                      {CST_ICMS_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {erros.cst && <p className="text-xs text-destructive">{erros.cst}</p>}
                </div>
              )}

              {!regime?.isMEI && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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

              {/* Reforma Tributária */}
              <div className="flex items-center gap-2 flex-wrap">
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

              <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="aliqIbs">IBS (%) <InfoTip text="Imposto sobre Bens e Serviços — substitui ICMS e ISS. Referência: ~26,5%." /></Label>
                  <Input id="aliqIbs" type="number" min={0} max={100} step={0.0001} value={form.aliqIbs} onChange={e => setField("aliqIbs", e.target.value)} placeholder="0.0000" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="aliqCbs">CBS (%) <InfoTip text="Contribuição sobre Bens e Serviços — substitui PIS e COFINS. Referência: ~8,8%." /></Label>
                  <Input id="aliqCbs" type="number" min={0} max={100} step={0.0001} value={form.aliqCbs} onChange={e => setField("aliqCbs", e.target.value)} placeholder="0.0000" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="aliqIs">IS (%) <InfoTip text="Imposto Seletivo — bens prejudiciais à saúde ou ao meio ambiente." /></Label>
                  <Input id="aliqIs" type="number" min={0} max={100} step={0.0001} value={form.aliqIs} onChange={e => setField("aliqIs", e.target.value)} placeholder="0.0000" />
                </div>
              </div>

              {form.regimeTrib === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="percReducao">Redução da Base (%) <InfoTip text="Percentual de redução da base de cálculo do IBS/CBS." /></Label>
                    <Input id="percReducao" type="number" min={0} max={100} step={0.01} value={form.percReducao} onChange={e => setField("percReducao", e.target.value)} placeholder="50.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="codBenefIbs">Código de Benefício Fiscal <InfoTip text="Código do benefício fiscal IBS/CBS (a ser definido pela Receita Federal)." /></Label>
                    <Input id="codBenefIbs" value={form.codBenefIbs} onChange={e => setTexto("codBenefIbs", e.target.value)} placeholder="EX: BEN0001" maxLength={20} />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="codRegimeEsp">Regime Especial <InfoTip text="Código de regime especial, como cashback obrigatório (previsto na Reforma para produtos da cesta básica)." /></Label>
                <Input id="codRegimeEsp" value={form.codRegimeEsp} onChange={e => setTexto("codRegimeEsp", e.target.value)} placeholder="EX: CASHBACK" maxLength={10} />
              </div>
            </TabsContent>

            {/* ── ABA ESTOQUE ──────────────────────────────────────────────── */}
            <TabsContent value="estoque" className="space-y-4 p-4 lg:p-5 mt-0">
              <div className="p-3 rounded-md bg-muted/50 border text-sm">
                <p className="font-medium">Controle de Estoque</p>
                <p className="text-muted-foreground text-xs mt-1">
                  O estoque atual é sincronizado com o sistema offline (Delphi/PDV). O estoque mínimo gera alertas de reposição.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
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

              <div className="rounded-md border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="fracionado-estoque" className="flex items-center gap-1">
                      Produto fracionado
                      <InfoTip text="Ative para produtos vendidos em fracoes, como kg, litro, metro ou quantidade decimal. No PDV, a quantidade podera ter casas decimais." />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Permite venda com quantidade decimal no PDV.
                    </p>
                  </div>
                  <div className="flex h-10 items-center gap-3 rounded-md bg-muted/50 px-3">
                    <Switch
                      id="fracionado-estoque"
                      checked={form.fracionado}
                      onCheckedChange={v => setField("fracionado", v)}
                    />
                    <span className="text-sm font-medium">
                      {form.fracionado ? "Sim" : "Nao"}
                    </span>
                  </div>
                </div>
              </div>

              {parseFloat(form.estoque || "0") < parseFloat(form.estoqueMinimo || "0") && parseFloat(form.estoqueMinimo || "0") > 0 && (
                <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400">
                  ⚠️ Estoque atual abaixo do mínimo — produto precisa de reposição.
                </div>
              )}
            </TabsContent>

            {/* ── ABA DELIVERY / ERP ───────────────────────────────────────── */}
            <TabsContent value="imei" className="space-y-4 p-4 lg:p-5 mt-0">
              {!isEdicao || !guidProduto ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  Salve o produto primeiro para gerar/preservar o GUIDPRODUTO. Depois disso, os IMEIs poderao ser vinculados a este produto sem criar produtos duplicados.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_180px]">
                    <div className="rounded-md border bg-muted/30 p-3">
                      <p className="text-sm font-semibold">Controle de IMEI por GUIDPRODUTO</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cada aparelho fisico recebe um GUIDIMEI proprio e fica vinculado ao produto atual por GUIDPRODUTO.
                      </p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs uppercase text-muted-foreground">IMEIs disponiveis</p>
                      <p className="text-2xl font-bold text-emerald-600">{imeisData?.disponiveis ?? 0}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs uppercase text-muted-foreground">Total vinculado</p>
                      <p className="text-2xl font-bold">{imeisData?.total ?? 0}</p>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Cadastrar / editar IMEI</p>
                        <p className="text-xs text-muted-foreground">Use IMEI 1, IMEI 2 ou numero de serie para identificar a unidade fisica.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={novoImei}>
                        Novo IMEI
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1">
                        <Label>GUIDIMEI</Label>
                        <Input value={imeiForm.guidImei} readOnly className="font-mono text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label>IMEI 1</Label>
                        <Input value={imeiForm.imei1} onChange={e => setImeiField("imei1", e.target.value.replace(/\D/g, "").slice(0, 20))} />
                      </div>
                      <div className="space-y-1">
                        <Label>IMEI 2</Label>
                        <Input value={imeiForm.imei2} onChange={e => setImeiField("imei2", e.target.value.replace(/\D/g, "").slice(0, 20))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Numero de serie</Label>
                        <Input value={imeiForm.numeroSerie} onChange={e => setImeiField("numeroSerie", e.target.value.toUpperCase().slice(0, 50))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Cor</Label>
                        <Input value={imeiForm.cor} onChange={e => setImeiField("cor", e.target.value.toUpperCase().slice(0, 50))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Capacidade / GB</Label>
                        <Input value={imeiForm.capacidade} onChange={e => setImeiField("capacidade", e.target.value.toUpperCase().slice(0, 20))} placeholder="EX: 128GB" />
                      </div>
                      <div className="space-y-1">
                        <Label>Estado</Label>
                        <Select value={imeiForm.estado} onValueChange={v => setImeiField("estado", v as ImeiFormData["estado"])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IMEI_ESTADOS.map(estado => <SelectItem key={estado} value={estado}>{estado}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Situacao</Label>
                        <Select value={imeiForm.situacao} onValueChange={v => setImeiField("situacao", v as ImeiFormData["situacao"])}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IMEI_SITUACOES.map(situacao => <SelectItem key={situacao} value={situacao}>{situacao}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Data de entrada</Label>
                        <Input type="date" value={imeiForm.dataEntrada} onChange={e => setImeiField("dataEntrada", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Custo individual</Label>
                        <Input type="number" min={0} step={0.01} value={imeiForm.custo} onChange={e => setImeiField("custo", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Preco de venda individual</Label>
                        <Input type="number" min={0} step={0.01} value={imeiForm.precoVenda} onChange={e => setImeiField("precoVenda", e.target.value)} />
                      </div>
                      <div className="space-y-1 md:col-span-2 xl:col-span-1">
                        <Label>Observacao</Label>
                        <Input value={imeiForm.observacao} onChange={e => setImeiField("observacao", e.target.value)} />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="button" onClick={salvarImei} disabled={salvandoImei}>
                        {salvandoImei ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar IMEI
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
                      <div className="space-y-1">
                        <Label>Pesquisar IMEI</Label>
                        <Input value={buscaImei} onChange={e => setBuscaImei(e.target.value)} placeholder="IMEI, serie, cor ou capacidade" />
                      </div>
                      <div className="space-y-1">
                        <Label>Filtrar situacao</Label>
                        <Select value={situacaoImei} onValueChange={v => setSituacaoImei(v as typeof situacaoImei)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TODOS">TODOS</SelectItem>
                            {IMEI_SITUACOES.map(situacao => <SelectItem key={situacao} value={situacao}>{situacao}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[1100px] text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">IMEI 1</th>
                            <th className="px-3 py-2 text-left font-medium">IMEI 2</th>
                            <th className="px-3 py-2 text-left font-medium">Serie</th>
                            <th className="px-3 py-2 text-left font-medium">Cor</th>
                            <th className="px-3 py-2 text-left font-medium">Capacidade</th>
                            <th className="px-3 py-2 text-left font-medium">Estado</th>
                            <th className="px-3 py-2 text-left font-medium">Situacao</th>
                            <th className="px-3 py-2 text-left font-medium">Entrada</th>
                            <th className="px-3 py-2 text-right font-medium">Custo</th>
                            <th className="px-3 py-2 text-right font-medium">Venda</th>
                            <th className="px-3 py-2 text-left font-medium">Observacao</th>
                            <th className="px-3 py-2 text-right font-medium">Acoes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(imeisData?.registros ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                                Nenhum IMEI vinculado a este produto.
                              </td>
                            </tr>
                          ) : (
                            (imeisData?.registros ?? []).map((row: ProdutoImei) => (
                              <tr key={row.GUIDIMEI} className="border-t">
                                <td className="px-3 py-2 font-mono text-xs">{row.IMEI1 || "-"}</td>
                                <td className="px-3 py-2 font-mono text-xs">{row.IMEI2 || "-"}</td>
                                <td className="px-3 py-2 font-mono text-xs">{row.NUMEROSERIE || "-"}</td>
                                <td className="px-3 py-2">{row.COR || "-"}</td>
                                <td className="px-3 py-2">{row.CAPACIDADE || "-"}</td>
                                <td className="px-3 py-2">{row.ESTADO || "-"}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={row.SITUACAO === "DISPONIVEL" ? "default" : "outline"}>{row.SITUACAO || "-"}</Badge>
                                </td>
                                <td className="px-3 py-2">{formatDateInput(row.DATAENTRADA) || "-"}</td>
                                <td className="px-3 py-2 text-right">R$ {Number(row.CUSTO ?? 0).toFixed(2)}</td>
                                <td className="px-3 py-2 text-right">R$ {Number(row.PRECOVENDA ?? 0).toFixed(2)}</td>
                                <td className="px-3 py-2 max-w-[220px] truncate">{row.OBSERVACAO || "-"}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end gap-1">
                                    <Button type="button" size="sm" variant="outline" onClick={() => editarImei(row)}>
                                      Editar
                                    </Button>
                                    <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluirImei(row.GUIDIMEI)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="foodDelivery" className="space-y-4 p-4 lg:p-5 mt-0">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Switch id="permiteMontagem" checked={form.permiteMontagem} onCheckedChange={v => setField("permiteMontagem", v)} />
                  <div>
                    <Label htmlFor="permiteMontagem" className="cursor-pointer">Permite montagem</Label>
                    <p className="text-xs text-muted-foreground">Habilita selecao de sabores ou opcoes</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <Switch id="obrigaSelecaoMontagem" checked={form.obrigaSelecaoMontagem} onCheckedChange={v => setField("obrigaSelecaoMontagem", v)} />
                  <div>
                    <Label htmlFor="obrigaSelecaoMontagem" className="cursor-pointer">Obriga selecao</Label>
                    <p className="text-xs text-muted-foreground">Exige escolha antes da venda</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Tipo de montagem</Label>
                  <Select value={form.tipoMontagem} onValueChange={v => setField("tipoMontagem", v as FormData["tipoMontagem"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_MONTAGEM.map(tipo => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Calculo do preco</Label>
                  <Select value={form.tipoCalculoPrecoMontagem} onValueChange={v => setField("tipoCalculoPrecoMontagem", v as FormData["tipoCalculoPrecoMontagem"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_CALCULO_PRECO.map(tipo => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantidade minima de opcoes</Label>
                  <Input type="number" min={0} value={form.qtdMinOpcoes} onChange={e => setField("qtdMinOpcoes", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Quantidade maxima de opcoes</Label>
                  <Input type="number" min={0} value={form.qtdMaxOpcoes} onChange={e => setField("qtdMaxOpcoes", e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b px-3 py-2">
                  <p className="text-sm font-semibold">Sabores / opcoes permitidas</p>
                </div>
                <div className="max-h-80 overflow-auto">
                  {produtosOpcao.length === 0 ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground">Nenhum produto ativo encontrado para selecionar.</div>
                  ) : (
                    produtosOpcao.map(produtoOpcao => {
                      const guidOpcao = String(produtoOpcao.GUIDPRODUTO);
                      const selecionada = form.opcoesMontagem.find(opcao => opcao.guidProdutoOpcao === guidOpcao);
                      return (
                        <div key={guidOpcao} className="grid grid-cols-1 gap-2 border-b px-3 py-2 md:grid-cols-[1fr_140px_100px] md:items-center">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={Boolean(selecionada)}
                              onChange={() => toggleOpcaoMontagem(guidOpcao, String(produtoOpcao.PRODUTO ?? ""))}
                            />
                            <span className="font-medium">{String(produtoOpcao.PRODUTO ?? "")}</span>
                          </label>
                          <Input
                            type="number"
                            step={0.01}
                            min={0}
                            disabled={!selecionada}
                            value={selecionada?.valorAdicional ?? "0"}
                            onChange={e => updateOpcaoMontagem(guidOpcao, "valorAdicional", e.target.value)}
                            placeholder="Valor adicional"
                          />
                          <Input
                            type="number"
                            min={1}
                            disabled={!selecionada}
                            value={selecionada?.ordem ?? ""}
                            onChange={e => updateOpcaoMontagem(guidOpcao, "ordem", Number(e.target.value) || 1)}
                            placeholder="Ordem"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="erpCode">Código ERP</Label>
                <Input id="erpCode" value={form.erpCode} onChange={e => setTexto("erpCode", e.target.value)} placeholder="EX: PROD-001" maxLength={100} />
                <p className="text-xs text-muted-foreground">Código para sincronização bidirecional com o sistema de delivery.</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="imageUrl">URL da Imagem</Label>
                <Input id="imageUrl" value={form.imageUrl} onChange={e => setField("imageUrl", e.target.value)} placeholder="https://exemplo.com/imagem.jpg" maxLength={500} />
                {form.imageUrl && (
                  <div className="mt-2 rounded-md overflow-hidden border w-28 h-28">
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

        {/* Rodapé fixo */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t shrink-0">
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

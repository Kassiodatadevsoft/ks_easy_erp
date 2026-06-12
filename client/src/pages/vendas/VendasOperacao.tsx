import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import ClienteForm from "@/components/clientes/ClienteForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Barcode,
  Calculator,
  Check,
  ClipboardList,
  CreditCard,
  FileText,
  Lock,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  UserPlus,
  Wrench,
} from "lucide-react";

type TipoOperacao = "VENDA" | "ORCAMENTO" | "ORDEMSERVICO";
type DiscountStatus = "OK" | "AUTHORIZED" | "BLOCKED";
type DiscountMode = "percent" | "value" | "final";

type PriceRange = {
  min: number;
  max?: number;
  price: number;
  label: string;
};

type Product = {
  id: string;
  codigo: string;
  barcode: string;
  referencia: string;
  descricao: string;
  tamanho: string;
  cor: string;
  marca: string;
  categoria: string;
  unidade: string;
  estoqueAtual: number;
  estoqueReservado: number;
  custo: number;
  precoVenda: number;
  precoPromocional?: number;
  promocaoInicio?: string;
  promocaoFim?: string;
  permiteDesconto: boolean;
  descontoMaximo: number;
  permiteVendaSemEstoque: boolean;
  ativo: boolean;
  fracionado: boolean;
  controlaGrade: boolean;
  controlaLote: boolean;
  controlaValidade: boolean;
  controlaImei?: boolean;
  faixas: PriceRange[];
};

type SaleItem = {
  id: string;
  guidVenda: string;
  product: Product;
  quantidade: number;
  custoUnitario: number;
  precoBase: number;
  precoUnitario: number;
  faixa: string;
  descontoPercentual: number;
  descontoValor: number;
  precoFinal: number;
  total: number;
  status: DiscountStatus;
  autorizador?: string;
  motivo?: string;
  observacao?: string;
  guidImei?: string;
  imeiLabel?: string;
  imeiCusto?: number;
  imeiPrecoVenda?: number;
};

type Payment = {
  id: string;
  guidFormaPagamento: string;
  codFormaPagamento?: number | null;
  valor: number;
  parcelas: number;
  jurosPercentual: number;
};

type ImeiVenda = {
  guidImei: string;
  imei1: string;
  imei2: string;
  numeroSerie: string;
  situacao: string;
  dataEntrada?: string;
  custo?: number;
  precoVenda?: number;
};

type ImeiDisponivel = ImeiVenda & {
  cor: string;
  capacidade: string;
  estado: string;
  custo: number;
  precoVenda: number;
  observacao: string;
};

type ImeiOrdenacao = "PRECO_ASC" | "PRECO_DESC" | "DATA_DESC" | "DATA_ASC";

type VendedorAtivo = {
  GUIDVENDEDOR: string;
  CODVENDEDOR: number | null;
  NOME: string;
  USUARIO: string | null;
  SITUACAO: string;
};

type VendaCliente = {
  id: string;
  codCliente: number;
  nome: string;
  documento: string;
  limite: number;
  saldo: number;
  situacao: string;
};

type CaixaAberto = {
  GUIDCAIXA: string;
  NUMEROCAIXA: number;
  GUIDUSUARIO: string;
  CODUSUARIO: number | null;
  DESCRICAO: string | null;
  SITUACAO: string;
  SALDOINICIAL: number;
};

type FormaPagamentoAtiva = {
  guidPagamento: string;
  CODFORMAPAGAMENTO?: number | null;
  PAGAMENTO: string;
  SITUACAO?: string;
};

const products: Product[] = [
  {
    id: "p1",
    codigo: "1001",
    barcode: "7891000100017",
    referencia: "CAM-BASIC",
    descricao: "Camiseta algodao premium",
    tamanho: "M",
    cor: "Preta",
    marca: "DataWear",
    categoria: "Confeccoes",
    unidade: "UN",
    estoqueAtual: 34,
    estoqueReservado: 4,
    custo: 38,
    precoVenda: 100,
    precoPromocional: 89,
    promocaoInicio: "2026-06-01",
    promocaoFim: "2026-06-30",
    permiteDesconto: true,
    descontoMaximo: 10,
    permiteVendaSemEstoque: false,
    ativo: true,
    fracionado: false,
    controlaGrade: true,
    controlaLote: false,
    controlaValidade: false,
    faixas: [
      { min: 1, max: 5, price: 100, label: "1 a 5 un." },
      { min: 6, max: 10, price: 95, label: "6 a 10 un." },
      { min: 11, max: 20, price: 90, label: "11 a 20 un." },
      { min: 21, price: 85, label: "Acima de 20 un." },
    ],
  },
  {
    id: "p2",
    codigo: "2044",
    barcode: "7892044000446",
    referencia: "ARG-20KG",
    descricao: "Argamassa ACIII 20kg",
    tamanho: "20kg",
    cor: "Cinza",
    marca: "Construforte",
    categoria: "Materiais",
    unidade: "SC",
    estoqueAtual: 8,
    estoqueReservado: 1,
    custo: 24.5,
    precoVenda: 42,
    permiteDesconto: true,
    descontoMaximo: 6,
    permiteVendaSemEstoque: false,
    ativo: true,
    fracionado: false,
    controlaGrade: false,
    controlaLote: true,
    controlaValidade: true,
    faixas: [
      { min: 1, max: 9, price: 42, label: "Varejo" },
      { min: 10, max: 29, price: 39.5, label: "Atacado 10+" },
      { min: 30, price: 37.9, label: "Obra 30+" },
    ],
  },
  {
    id: "p3",
    codigo: "3300",
    barcode: "7893300003001",
    referencia: "OLEO-1L",
    descricao: "Oleo motor sintetico 5W30",
    tamanho: "1L",
    cor: "Dourado",
    marca: "AutoMax",
    categoria: "Autopecas",
    unidade: "UN",
    estoqueAtual: 0,
    estoqueReservado: 0,
    custo: 31,
    precoVenda: 58,
    permiteDesconto: false,
    descontoMaximo: 0,
    permiteVendaSemEstoque: true,
    ativo: true,
    fracionado: false,
    controlaGrade: false,
    controlaLote: true,
    controlaValidade: false,
    faixas: [],
  },
  {
    id: "p4",
    codigo: "SERV-01",
    barcode: "SERVICO01",
    referencia: "MAO-OBRA",
    descricao: "Hora tecnica de servico",
    tamanho: "1h",
    cor: "N/A",
    marca: "Oficina",
    categoria: "Servicos",
    unidade: "H",
    estoqueAtual: 999,
    estoqueReservado: 0,
    custo: 55,
    precoVenda: 120,
    permiteDesconto: true,
    descontoMaximo: 15,
    permiteVendaSemEstoque: true,
    ativo: true,
    fracionado: true,
    controlaGrade: false,
    controlaLote: false,
    controlaValidade: false,
    faixas: [],
  },
];

type ProdutoCadastro = {
  GUIDPRODUTO: string;
  CODPRODUTO: number;
  PRODUTO: string;
  DESCRICAO: string | null;
  CATEGORIA: string | null;
  PRECOS: string | null;
  TAMANHOSDISP: string | null;
  PRECO: number;
  PRECOVENDA: number;
  PRECOCUSTO: number;
  ERPCODE: string | null;
  SITUACAO: string;
  CODBARRAS: string | null;
  CODBARRACAIXA: string | null;
  QTDCAIXA: number;
  UNIDADE: string | null;
  PERCDESCONTO: number;
  PRECOPROMO: number;
  DTINICIOPROMO: Date | string | null;
  DTFIMPROMO: Date | string | null;
  FRACIONADO: boolean;
  ESTOQUE: number;
  ESTOQUEMINIMO: number;
  REFERENCIA: string | null;
  SERVICO: boolean;
  BALANCA: boolean;
  faixasPreco?: Array<{
    ID?: number;
    UNIDADE?: string;
    FATORCONVERSAO?: number;
    QUANTIDADEMINIMA?: number | null;
    DESCRICAOPRECO?: string | null;
    PRECOVENDA?: number;
    ATIVO?: boolean;
  }>;
};

const DEFAULT_CLIENT_NAME = "CONSUMIDOR FINAL";

const cargos = [
  { cargo: "Vendedor", limite: 10 },
  { cargo: "Supervisor", limite: 20 },
  { cargo: "Gerente", limite: 30 },
  { cargo: "Administrador", limite: 100 },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDate(value: string | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function dateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parseSizes(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
  } catch {
    return value.split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function mapProdutoCadastro(row: ProdutoCadastro): Product {
  const tamanhos = parseSizes(row.TAMANHOSDISP);
  const precoVenda = Number(row.PRECOVENDA || row.PRECO || 0);
  const faixas = (row.faixasPreco ?? [])
    .filter((faixa) => faixa.ATIVO !== false && Number(faixa.PRECOVENDA ?? 0) > 0)
    .sort((a, b) => Number(a.QUANTIDADEMINIMA ?? 0) - Number(b.QUANTIDADEMINIMA ?? 0))
    .map((faixa, index, array): PriceRange => {
      const min = Number(faixa.QUANTIDADEMINIMA ?? 1);
      const next = array[index + 1];
      const nextMin = next ? Number(next.QUANTIDADEMINIMA ?? 0) : 0;
      return {
        min,
        max: nextMin > min ? nextMin - 0.001 : undefined,
        price: Number(faixa.PRECOVENDA ?? precoVenda),
        label: faixa.DESCRICAOPRECO || `${faixa.UNIDADE ?? row.UNIDADE ?? "UN"} ${min}+`,
      };
    });

  return {
    id: row.GUIDPRODUTO,
    codigo: String(row.CODPRODUTO),
    barcode: row.CODBARRAS || row.CODBARRACAIXA || "",
    referencia: row.REFERENCIA || row.ERPCODE || "",
    descricao: row.PRODUTO || row.DESCRICAO || "Produto sem descricao",
    tamanho: tamanhos[0] || row.UNIDADE || "UN",
    cor: "sem cor",
    marca: "sem marca",
    categoria: row.CATEGORIA || "sem categoria",
    unidade: row.UNIDADE || "UN",
    estoqueAtual: Number(row.ESTOQUE ?? 0),
    estoqueReservado: 0,
    custo: Number(row.PRECOCUSTO ?? 0),
    precoVenda,
    precoPromocional: Number(row.PRECOPROMO ?? 0) > 0 ? Number(row.PRECOPROMO) : undefined,
    promocaoInicio: toIsoDate(row.DTINICIOPROMO),
    promocaoFim: toIsoDate(row.DTFIMPROMO),
    permiteDesconto: Number(row.PERCDESCONTO ?? 0) > 0,
    descontoMaximo: Number(row.PERCDESCONTO ?? 0),
    permiteVendaSemEstoque: Boolean(row.SERVICO),
    ativo: row.SITUACAO === "A",
    fracionado: Boolean(row.FRACIONADO || row.BALANCA),
    controlaGrade: tamanhos.length > 1,
    controlaLote: false,
    controlaValidade: false,
    faixas,
  };
}

function isPromotionValid(product: Product) {
  const today = todayIso();
  return Boolean(
    product.precoPromocional &&
      product.promocaoInicio &&
      product.promocaoFim &&
      today >= product.promocaoInicio &&
      today <= product.promocaoFim,
  );
}

function priceFor(product: Product, quantidade: number) {
  if (isPromotionValid(product)) {
    return { price: product.precoPromocional ?? product.precoVenda, faixa: "Promocao valida" };
  }

  const range = product.faixas.find((f) => quantidade >= f.min && (f.max == null || quantidade <= f.max));
  if (range) return { price: range.price, faixa: range.label };

  return { price: product.precoVenda, faixa: "Preco padrao" };
}

function priceForItem(product: Product, quantidade: number, imeiPrecoVenda?: number) {
  if (imeiPrecoVenda && imeiPrecoVenda > 0) {
    return { price: imeiPrecoVenda, faixa: "Preco IMEI" };
  }

  return priceFor(product, quantidade);
}

function costForItem(product: Product, imeiCusto?: number) {
  return imeiCusto && imeiCusto > 0 ? imeiCusto : product.custo;
}

function stockAvailable(product: Product) {
  return Math.max(0, product.estoqueAtual - product.estoqueReservado);
}

function normalizeQuantity(product: Product, value: number) {
  if (!Number.isFinite(value)) return product.fracionado ? 0.001 : 1;
  const minimum = product.fracionado ? 0.001 : 1;
  const quantity = Math.max(minimum, value);
  return product.fracionado ? quantity : Math.trunc(quantity);
}

function imeiLabel(imei: ImeiVenda) {
  return [imei.imei1, imei.imei2, imei.numeroSerie].filter(Boolean).join(" / ");
}

function makeItem(guidVenda: string, product: Product, quantidade = 1, imei?: ImeiVenda): SaleItem {
  const normalizedQuantity = normalizeQuantity(product, quantidade);
  const imeiCusto = Number(imei?.custo ?? 0);
  const imeiPrecoVenda = Number(imei?.precoVenda ?? 0);
  const priced = priceForItem(product, normalizedQuantity, imeiPrecoVenda);
  return recalcItem({
    id: `${product.id}-${Date.now()}`,
    guidVenda,
    product,
    quantidade: normalizedQuantity,
    custoUnitario: costForItem(product, imeiCusto),
    precoBase: priced.price,
    precoUnitario: priced.price,
    faixa: priced.faixa,
    descontoPercentual: 0,
    descontoValor: 0,
    precoFinal: priced.price,
    total: priced.price * normalizedQuantity,
    status: "OK",
    guidImei: imei?.guidImei,
    imeiLabel: imei ? imeiLabel(imei) : undefined,
    imeiCusto: imeiCusto > 0 ? imeiCusto : undefined,
    imeiPrecoVenda: imeiPrecoVenda > 0 ? imeiPrecoVenda : undefined,
  });
}

function recalcItem(item: SaleItem, mode?: DiscountMode, rawValue?: number): SaleItem {
  const quantity = normalizeQuantity(item.product, item.quantidade);
  const priced = priceForItem(item.product, quantity, item.imeiPrecoVenda);
  let discountValue = item.descontoValor;
  let discountPercent = item.descontoPercentual;

  if (mode === "percent") {
    discountPercent = Math.max(0, rawValue ?? 0);
    discountValue = (priced.price * discountPercent) / 100;
  } else if (mode === "value") {
    discountValue = Math.max(0, rawValue ?? 0);
    discountPercent = priced.price > 0 ? (discountValue / priced.price) * 100 : 0;
  } else if (mode === "final") {
    const finalPrice = Math.max(0, rawValue ?? priced.price);
    discountValue = Math.max(0, priced.price - finalPrice);
    discountPercent = priced.price > 0 ? (discountValue / priced.price) * 100 : 0;
  }

  const hasDiscount = discountPercent > 0.0001 || discountValue > 0.0001;
  const allowed =
    !hasDiscount ||
    (item.product.permiteDesconto && discountPercent <= item.product.descontoMaximo);
  const status: DiscountStatus = allowed ? "OK" : item.status === "AUTHORIZED" ? "AUTHORIZED" : "BLOCKED";
  const finalPrice = Math.max(0, priced.price - discountValue);

  return {
    ...item,
    quantidade: quantity,
    custoUnitario: costForItem(item.product, item.imeiCusto),
    precoBase: priced.price,
    precoUnitario: priced.price,
    faixa: priced.faixa,
    descontoPercentual: discountPercent,
    descontoValor: discountValue,
    precoFinal: finalPrice,
    total: finalPrice * quantity,
    status,
  };
}

function statusStyle(status: DiscountStatus) {
  if (status === "OK") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "AUTHORIZED") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

export default function VendasOperacao() {
  const [guidVenda, setGuidVenda] = useState(() => crypto.randomUUID());
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao>("VENDA");
  const [search, setSearch] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteFormAberto, setClienteFormAberto] = useState(false);
  const [guidVendedor, setGuidVendedor] = useState("");
  const [vendedorInicialAplicado, setVendedorInicialAplicado] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([
    { id: "pay-1", guidFormaPagamento: "", valor: 0, parcelas: 1, jurosPercentual: 0 },
  ]);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [authorizationItemId, setAuthorizationItemId] = useState<string | null>(null);
  const [auth, setAuth] = useState({ usuario: "", senha: "", cargo: "Supervisor", motivo: "" });
  const [observacao, setObservacao] = useState("");
  const [imeiSelectionProduct, setImeiSelectionProduct] = useState<Product | null>(null);
  const [imeiOptions, setImeiOptions] = useState<ImeiDisponivel[]>([]);
  const [imeiBusca, setImeiBusca] = useState("");
  const [imeiCor, setImeiCor] = useState("TODAS");
  const [imeiCapacidade, setImeiCapacidade] = useState("TODAS");
  const [imeiOrdenacao, setImeiOrdenacao] = useState<ImeiOrdenacao>("PRECO_ASC");
  const utils = trpc.useUtils();
  const atualizarSituacaoImei = trpc.produtos.atualizarSituacaoImei.useMutation();
  const finalizarVenda = trpc.vendasOperacao.finalizar.useMutation();
  const abrirCaixa = trpc.caixaMovimento.abrir.useMutation();
  const { data: caixaAbertoData, isLoading: carregandoCaixa } = trpc.caixaMovimento.atual.useQuery();
  const { data: vendedoresData, isLoading: carregandoVendedores } = trpc.funcionarios.listarVendedoresAtivos.useQuery();
  const { data: formasPagamentoData, isLoading: carregandoFormasPagamento } = trpc.formasPagamento.listarTodas.useQuery();
  const { data: clientesData, refetch: refetchClientes } = trpc.clientes.listar.useQuery({
    situacao: "A",
    pagina: 1,
    porPagina: 100,
  });
  const { data: produtosData, isLoading: carregandoProdutos } = trpc.produtos.listar.useQuery({
    busca: search.trim() || undefined,
    situacao: "A",
    pagina: 1,
    porPagina: 100,
  });

  const clientesVenda = useMemo(
    () =>
      ((clientesData?.dados ?? []) as Array<{
        GUIDPESSOA: string;
        CODIGO: number;
        NOME: string;
        DOCUMENTO: string | null;
        SITUACAO: string;
      }>).map((cliente): VendaCliente => ({
        id: cliente.GUIDPESSOA,
        codCliente: Number(cliente.CODIGO ?? 0),
        nome: cliente.NOME,
        documento: cliente.DOCUMENTO ?? "",
        limite: 0,
        saldo: 0,
        situacao: cliente.SITUACAO === "A" ? "Liberado" : cliente.SITUACAO,
      })),
    [clientesData?.dados],
  );
  const clienteSelecionado = clientesVenda.find((c) => c.id === clienteId) ?? null;
  const clientePadrao = !clienteSelecionado;
  const vendaCliente = {
    clientePadrao,
    guidCliente: clienteSelecionado?.id ?? null,
    codCliente: clienteSelecionado?.codCliente ?? null,
    nome: clienteSelecionado?.nome ?? DEFAULT_CLIENT_NAME,
    documento: clienteSelecionado?.documento ?? "",
    limite: clienteSelecionado?.limite ?? 0,
    saldo: clienteSelecionado?.saldo ?? 0,
    situacao: clienteSelecionado?.situacao ?? "Padrao",
  };
  const cadastroProducts = useMemo(
    () => (produtosData?.registros ?? []).map((row) => mapProdutoCadastro(row as ProdutoCadastro)),
    [produtosData?.registros],
  );
  const vendedoresAtivos = useMemo(
    () => ((vendedoresData?.vendedores ?? []) as VendedorAtivo[]).filter((vendedor) => vendedor.SITUACAO === "A"),
    [vendedoresData?.vendedores],
  );
  const vendedorSelecionado = vendedoresAtivos.find((vendedor) => vendedor.GUIDVENDEDOR === guidVendedor) ?? null;
  const formasPagamentoAtivas = useMemo(
    () =>
      ((formasPagamentoData ?? []) as FormaPagamentoAtiva[])
        .filter((forma) => forma.guidPagamento && forma.SITUACAO !== "I"),
    [formasPagamentoData],
  );
  const formasPagamentoMap = useMemo(
    () => new Map(formasPagamentoAtivas.map((forma) => [forma.guidPagamento, forma])),
    [formasPagamentoAtivas],
  );
  const caixaAberto = caixaAbertoData as CaixaAberto | null | undefined;
  const productSource = cadastroProducts;
  const searchTerm = search.trim().toLowerCase();
  const showProductResults = searchTerm.length > 0;
  const filteredProducts = useMemo(
    () =>
      searchTerm
        ? productSource.filter((product) =>
            [
              product.codigo,
              product.barcode,
              product.referencia,
              product.descricao,
              product.tamanho,
              product.cor,
              product.marca,
              product.categoria,
            ].some((field) => field.toLowerCase().includes(searchTerm)),
          )
        : productSource,
    [productSource, searchTerm],
  );

  const totals = useMemo(() => {
    const quantidadeItens = items.length;
    const quantidadeTotal = items.reduce((sum, item) => sum + item.quantidade, 0);
    const bruto = items.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0);
    const descontoItens = items.reduce((sum, item) => sum + item.descontoValor * item.quantidade, 0);
    const descontoGeral = Math.min(generalDiscount, Math.max(0, bruto - descontoItens));
    const acrescimos = payments.reduce((sum, payment) => sum + payment.valor * (payment.jurosPercentual / 100), 0);
    const totalLiquido = Math.max(0, bruto - descontoItens - descontoGeral + acrescimos);
    const pago = payments.reduce((sum, payment) => sum + payment.valor, 0);
    return {
      quantidadeItens,
      quantidadeTotal,
      bruto,
      descontoItens,
      descontoGeral,
      descontoTotal: descontoItens + descontoGeral,
      acrescimos,
      economia: descontoItens + descontoGeral,
      totalLiquido,
      pago,
      troco: Math.max(0, pago - totalLiquido),
      falta: Math.max(0, totalLiquido - pago),
    };
  }, [items, generalDiscount, payments]);

  const filteredImeiOptions = useMemo(() => {
    const term = imeiBusca.trim().toLowerCase();
    return imeiOptions
      .filter((imei) => {
        const matchesText =
          !term ||
          [imei.imei1, imei.imei2, imei.numeroSerie].some((field) =>
            field.toLowerCase().includes(term),
          );
        const matchesCor = imeiCor === "TODAS" || imei.cor === imeiCor;
        const matchesCapacidade = imeiCapacidade === "TODAS" || imei.capacidade === imeiCapacidade;
        return matchesText && matchesCor && matchesCapacidade;
      })
      .sort((a, b) => {
        if (imeiOrdenacao === "PRECO_ASC") return a.precoVenda - b.precoVenda;
        if (imeiOrdenacao === "PRECO_DESC") return b.precoVenda - a.precoVenda;
        const dataA = a.dataEntrada ? new Date(a.dataEntrada).getTime() : 0;
        const dataB = b.dataEntrada ? new Date(b.dataEntrada).getTime() : 0;
        return imeiOrdenacao === "DATA_DESC" ? dataB - dataA : dataA - dataB;
      });
  }, [imeiBusca, imeiCapacidade, imeiCor, imeiOptions, imeiOrdenacao]);

  const imeiCores = useMemo(
    () => Array.from(new Set(imeiOptions.map((imei) => imei.cor).filter(Boolean))),
    [imeiOptions],
  );
  const imeiCapacidades = useMemo(
    () => Array.from(new Set(imeiOptions.map((imei) => imei.capacidade).filter(Boolean))),
    [imeiOptions],
  );

  useEffect(() => {
    if (!vendedoresData || vendedorInicialAplicado) return;

    const vendedorLogado = vendedoresData.vendedorLogado as VendedorAtivo | null;
    const vendedorLogadoAtivo = vendedorLogado?.SITUACAO === "A"
      ? vendedoresAtivos.find((vendedor) => vendedor.GUIDVENDEDOR === vendedorLogado.GUIDVENDEDOR)
      : null;

    if (vendedorLogadoAtivo) {
      setGuidVendedor(vendedorLogadoAtivo.GUIDVENDEDOR);
    } else if (vendedorLogado && vendedorLogado.SITUACAO !== "A") {
      setGuidVendedor("");
      toast.warning("Selecione um vendedor ativo para continuar.");
    } else {
      setGuidVendedor(vendedoresAtivos[0]?.GUIDVENDEDOR ?? "");
    }

    setVendedorInicialAplicado(true);
  }, [vendedorInicialAplicado, vendedoresAtivos, vendedoresData]);

  useEffect(() => {
    if (!guidVendedor || !vendedorInicialAplicado) return;
    if (vendedoresAtivos.some((vendedor) => vendedor.GUIDVENDEDOR === guidVendedor)) return;
    setGuidVendedor("");
    toast.warning("Selecione um vendedor ativo para continuar.");
  }, [guidVendedor, vendedorInicialAplicado, vendedoresAtivos]);

  useEffect(() => {
    if (!formasPagamentoAtivas.length) return;
    setPayments((current) =>
      current.map((payment) =>
        payment.guidFormaPagamento
          ? payment
          : { ...payment, guidFormaPagamento: formasPagamentoAtivas[0].guidPagamento },
      ),
    );
  }, [formasPagamentoAtivas]);

  function mapImeiOption(row: {
    GUIDIMEI: string;
    IMEI1: string | null;
    IMEI2: string | null;
    NUMEROSERIE: string | null;
    COR: string | null;
    CAPACIDADE: string | null;
    ESTADO: string | null;
    SITUACAO: string | null;
    DATAENTRADA: Date | string | null;
    CUSTO: number | null;
    PRECOVENDA: number | null;
    OBSERVACAO: string | null;
  }): ImeiDisponivel {
    return {
      guidImei: row.GUIDIMEI,
      imei1: row.IMEI1 ?? "",
      imei2: row.IMEI2 ?? "",
      numeroSerie: row.NUMEROSERIE ?? "",
      cor: row.COR ?? "",
      capacidade: row.CAPACIDADE ?? "",
      estado: row.ESTADO ?? "",
      situacao: row.SITUACAO ?? "",
      dataEntrada: toIsoDate(row.DATAENTRADA),
      custo: Number(row.CUSTO ?? 0),
      precoVenda: Number(row.PRECOVENDA ?? 0),
      observacao: row.OBSERVACAO ?? "",
    };
  }

  async function reserveAndAddProduct(product: Product, quantidade: number, imei?: ImeiVenda) {
    if (!caixaAberto || caixaAberto.SITUACAO !== "ABERTO") {
      toast.error("Caixa invalido ou fechado. Abra um caixa antes de finalizar a venda.");
      return;
    }
    const normalizedQuantity = normalizeQuantity(product, quantidade);
    if (!product.ativo) {
      toast.error("Produto inativo. Nao e permitido vender este produto.");
      return;
    }
    if (!product.permiteVendaSemEstoque && stockAvailable(product) < normalizedQuantity) {
      toast.error("Produto sem estoque disponivel.");
      return;
    }
    if (imei) {
      if (imei.situacao !== "DISPONIVEL") {
        toast.error("IMEI nao disponivel para venda.");
        return;
      }
      if (items.some((item) => item.guidImei === imei.guidImei)) {
        toast.error("Este IMEI ja foi incluido nesta venda.");
        return;
      }
      await atualizarSituacaoImei.mutateAsync({ guidImei: imei.guidImei, situacao: "RESERVADO" });
      product = { ...product, controlaImei: true };
    }
    if (product.controlaGrade) {
      toast.info(`Grade identificada: ${product.tamanho} / ${product.cor}`);
    }
    setItems((current) => [...current, makeItem(guidVenda, product, normalizedQuantity, imei)]);
    setSearch("");
  }

  async function addProduct(product: Product, quantidade = 1, imei?: ImeiVenda) {
    if (imei) {
      await reserveAndAddProduct(product, quantidade, imei);
      return;
    }

    const todosImeis = await utils.produtos.listarImeis.fetch({
      guidProduto: product.id,
      situacao: "TODOS",
    });
    if ((todosImeis.total ?? 0) > 0) {
      const disponiveis = (todosImeis.registros ?? [])
        .filter((row) => row.SITUACAO === "DISPONIVEL")
        .map(mapImeiOption);

      if (disponiveis.length === 0) {
        toast.error("Produto controla IMEI. Nenhum IMEI disponivel para venda.");
        return;
      }
      if (disponiveis.length === 1) {
        const unico = disponiveis[0];
        toast.info("IMEI disponivel selecionado automaticamente.", {
          description: `${imeiLabel(unico)} - ${unico.cor || "sem cor"} ${unico.capacidade || ""} ${unico.estado || ""} - ${money(unico.precoVenda)}`,
        });
        await reserveAndAddProduct(product, quantidade, disponiveis[0]);
        return;
      }

      setImeiSelectionProduct(product);
      setImeiOptions(disponiveis);
      setImeiBusca("");
      setImeiCor("TODAS");
      setImeiCapacidade("TODAS");
      setImeiOrdenacao("PRECO_ASC");
      return;
    }

    await reserveAndAddProduct(product, quantidade);
  }

  async function handleSearchSubmit() {
    if (!caixaAberto || caixaAberto.SITUACAO !== "ABERTO") {
      toast.error("Caixa invalido ou fechado. Abra um caixa antes de finalizar a venda.");
      return;
    }
    const product = productSource.find((p) => [p.barcode, p.codigo, p.referencia].includes(search.trim()));
    if (product) {
      await addProduct(product);
      return;
    }
    if (filteredProducts.length === 1) {
      await addProduct(filteredProducts[0]);
      return;
    }

    const imeiResult = await utils.produtos.buscarPorImei.fetch({ q: search.trim() });
    if (imeiResult) {
      if (imeiResult.imei.situacao !== "DISPONIVEL") {
        toast.error("IMEI nao disponivel para venda.");
        return;
      }
      await addProduct(
        mapProdutoCadastro(imeiResult.produto as ProdutoCadastro),
        1,
        imeiResult.imei as ImeiVenda,
      );
      return;
    }

    toast.error(/^\d{8,}$/.test(search.trim()) ? "IMEI nao encontrado." : "Produto, IMEI ou numero de serie nao encontrado.");
  }

  function updateItem(itemId: string, patch: Partial<SaleItem>, mode?: DiscountMode, rawValue?: number) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...patch };
        const normalizedQuantity = normalizeQuantity(next.product, next.quantidade ?? item.quantidade);
        if (!next.product.permiteVendaSemEstoque && stockAvailable(next.product) < normalizedQuantity) {
          toast.error("Produto sem estoque disponivel.");
          return item;
        }
        return recalcItem({ ...next, quantidade: normalizedQuantity }, mode, rawValue);
      }),
    );
  }

  function authorizeDiscount() {
    const item = items.find((i) => i.id === authorizationItemId);
    if (!item) return;
    const cargo = cargos.find((c) => c.cargo === auth.cargo);
    if (!auth.usuario || !auth.senha || !auth.motivo) {
      toast.error("Informe usuario, senha e motivo da autorizacao.");
      return;
    }
    if (!cargo || item.descontoPercentual > cargo.limite) {
      toast.error("Desconto superior ao limite permitido para o usuario autorizador.");
      return;
    }
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, status: "AUTHORIZED", autorizador: auth.usuario, motivo: auth.motivo }
          : row,
      ),
    );
    setAuthorizationItemId(null);
    setAuth({ usuario: "", senha: "", cargo: "Supervisor", motivo: "" });
    toast.success("Desconto autorizado e auditado.");
  }

  function convertTo(nextType: TipoOperacao) {
    setTipoOperacao(nextType);
    toast.success("Documento convertido mantendo cliente, produtos, descontos e historico.");
  }

  async function handleAbrirCaixa() {
    try {
      const caixa = await abrirCaixa.mutateAsync({
        guidCaixa: crypto.randomUUID(),
        saldoInicial: 0,
        descricao: "CAIXA PDV",
      });
      await utils.caixaMovimento.atual.invalidate();
      toast.success(`Caixa ${caixa.NUMEROCAIXA} aberto com sucesso.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel abrir o caixa.";
      toast.error(message);
      await utils.caixaMovimento.atual.invalidate();
    }
  }

  async function fecharClienteForm(salvo?: boolean, guidPessoa?: string) {
    setClienteFormAberto(false);
    if (!salvo) return;
    await refetchClientes();
    if (guidPessoa) {
      setClienteId(guidPessoa);
      toast.success("Cliente cadastrado e selecionado na venda.");
    }
  }

  function imprimirVenda(numeroVenda: number, dataHora: string, empresa: { nomeFantasia?: string; razaoSocial?: string; cnpj?: string }) {
    const pagamentosComValor = payments
      .filter((payment) => payment.valor > 0)
      .map((payment) => ({
        ...payment,
        forma: formasPagamentoMap.get(payment.guidFormaPagamento)?.PAGAMENTO ?? "Forma de pagamento",
      }));
    const html = `
      <html>
        <head>
          <title>Venda ${numeroVenda}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; padding: 18px; max-width: 820px; margin: auto; }
            .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 12px; }
            .logo { font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: .5px; }
            .muted { color: #64748b; font-size: 12px; }
            h1 { font-size: 18px; margin: 14px 0 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { padding: 7px 5px; border-bottom: 1px solid #e5e7eb; font-size: 12px; text-align: left; }
            .right { text-align: right; }
            .totals { margin-left: auto; width: 320px; margin-top: 12px; }
            .line { display: flex; justify-content: space-between; padding: 4px 0; }
            .total { font-size: 18px; font-weight: 700; border-top: 1px solid #111827; margin-top: 4px; padding-top: 8px; }
            .footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 12px; display: flex; justify-content: space-between; gap: 12px; }
          </style>
        </head>
        <body>
          <div class="top">
            <div>
              <div class="logo">DataDev</div>
              <div>${empresa.nomeFantasia || empresa.razaoSocial || ""}</div>
              <div class="muted">${empresa.razaoSocial || ""}</div>
              <div class="muted">CNPJ: ${empresa.cnpj || ""}</div>
            </div>
            <div class="right">
              <strong>VENDA / CUPOM NAO FISCAL</strong><br/>
              Venda: ${numeroVenda}<br/>
              Data: ${dateTime(dataHora)}<br/>
              Operador: ${caixaAberto?.GUIDUSUARIO ?? "-"}<br/>
              Vendedor: ${vendedorSelecionado?.NOME ?? "-"}<br/>
              Caixa: ${caixaAberto?.NUMEROCAIXA ?? "-"}
            </div>
          </div>

          <h1>Cliente</h1>
          <div>${vendaCliente.clientePadrao ? "Cliente: CONSUMIDOR FINAL" : `Cliente: ${vendaCliente.nome} - ${vendaCliente.documento}`}</div>

          <h1>Itens</h1>
          <table>
            <thead><tr><th>Item</th><th>Descricao</th><th>IMEI/Serie</th><th class="right">Qtd</th><th class="right">Unit.</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
            <tbody>
              ${items.map((item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.product.descricao}</td>
                  <td>${item.imeiLabel || "-"}</td>
                  <td class="right">${item.quantidade.toLocaleString("pt-BR")}</td>
                  <td class="right">${money(item.precoUnitario)}</td>
                  <td class="right">${money(item.descontoValor * item.quantidade)}</td>
                  <td class="right">${money(item.total)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h1>Pagamentos</h1>
          <table>
            ${pagamentosComValor.map((payment) => `<tr><td>${payment.forma}</td><td class="right">${money(payment.valor)}</td></tr>`).join("")}
          </table>

          <div class="totals">
            <div class="line"><span>Subtotal</span><strong>${money(totals.bruto)}</strong></div>
            <div class="line"><span>Desconto</span><strong>${money(totals.descontoTotal)}</strong></div>
            <div class="line"><span>Acrescimo</span><strong>${money(totals.acrescimos)}</strong></div>
            <div class="line total"><span>Total</span><span>${money(totals.totalLiquido)}</span></div>
            <div class="line"><span>Valor pago</span><strong>${money(totals.pago)}</strong></div>
            <div class="line"><span>Troco</span><strong>${money(totals.troco)}</strong></div>
          </div>

          <div class="footer">
            <div>
              Gerado pela empresa Data Consultoria e desenvolvimento de software<br/>
              datadevsoft.com.br<br/>
              Tim (94) 98146-9059
            </div>
            <div class="logo">DataDev</div>
          </div>
          <script>window.print()</script>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast.error("Venda salva, mas nao foi possivel abrir a impressao.");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }

  async function finishDocument() {
    const blocked = items.some((item) => item.status === "BLOCKED");
    if (!items.length) {
      toast.error("Inclua ao menos um item.");
      return;
    }
    if (!caixaAberto || caixaAberto.SITUACAO !== "ABERTO") {
      toast.error("Caixa invalido ou fechado. Abra um caixa antes de finalizar a venda.");
      return;
    }
    const caixaValido = await utils.caixaMovimento.validarAberto.fetch({ guidCaixa: caixaAberto.GUIDCAIXA });
    if (!caixaValido.valido) {
      await utils.caixaMovimento.atual.invalidate();
      toast.error("Caixa invalido ou fechado. Abra um caixa antes de finalizar a venda.");
      return;
    }
    if (!vendedorSelecionado) {
      toast.error("Selecione um vendedor ativo para continuar.");
      return;
    }
    if (blocked) {
      toast.error("Existe desconto bloqueado pendente de autorizacao.");
      return;
    }
    if (tipoOperacao === "VENDA" && totals.falta > 0.009) {
      toast.error("Informe as formas de pagamento ate completar o total.");
      return;
    }
    if (tipoOperacao === "VENDA") {
      const pagamentosComValor = payments.filter((payment) => payment.valor > 0);
      if (!pagamentosComValor.length) {
        toast.error("Selecione uma forma de pagamento valida.");
        return;
      }
      for (const payment of pagamentosComValor) {
        if (!payment.guidFormaPagamento) {
          toast.error("Selecione uma forma de pagamento valida.");
          return;
        }
        const forma = formasPagamentoMap.get(payment.guidFormaPagamento);
        if (!forma) {
          toast.error("Forma de pagamento nao vinculada a empresa atual.");
          return;
        }
        if (forma.SITUACAO === "I") {
          toast.error("Forma de pagamento inativa.");
          return;
        }
      }
    }
    for (const item of items) {
      if (item.product.controlaImei && !item.guidImei) {
        toast.error("Existe produto com controle por IMEI sem GUIDIMEI selecionado.");
        return;
      }
      if (!item.product.permiteVendaSemEstoque && stockAvailable(item.product) < item.quantidade) {
        toast.error("Produto sem estoque disponivel.");
        return;
      }
    }
    const pagamentosComValor = payments.filter((payment) => payment.valor > 0);
    try {
      const result = await finalizarVenda.mutateAsync({
        guidVenda,
        guidCaixa: caixaAberto.GUIDCAIXA,
        numeroCaixa: caixaAberto.NUMEROCAIXA,
        clientePadrao: vendaCliente.clientePadrao,
        guidCliente: vendaCliente.guidCliente,
        codCliente: vendaCliente.codCliente,
        nomeCliente: vendaCliente.nome,
        guidVendedor: vendedorSelecionado.GUIDVENDEDOR,
        codVendedor: vendedorSelecionado.CODVENDEDOR ?? null,
        vendedorNome: vendedorSelecionado.NOME,
        observacao: observacao || undefined,
        totais: {
          bruto: totals.bruto,
          descontoTotal: totals.descontoTotal,
          acrescimos: totals.acrescimos,
          totalLiquido: totals.totalLiquido,
          pago: totals.pago,
          troco: totals.troco,
        },
        itens: items.map((item) => ({
          guidProduto: item.product.id,
          codProduto: Number.isFinite(Number(item.product.codigo)) ? Number(item.product.codigo) : null,
          descricao: item.product.descricao,
          quantidade: item.quantidade,
          precoCusto: item.custoUnitario,
          precoVenda: item.precoUnitario,
          precoFinal: item.precoFinal,
          promocao: item.faixa === "Promocao valida",
          descontoPercentual: item.descontoPercentual,
          descontoValor: item.descontoValor,
          totalItem: item.total,
          faixaPrecoAplicada: item.faixa,
          guidImei: item.guidImei,
          imeiLabel: item.imeiLabel,
          permiteVendaSemEstoque: item.product.permiteVendaSemEstoque,
        })),
        pagamentos: pagamentosComValor.map((payment, index) => {
          const forma = formasPagamentoMap.get(payment.guidFormaPagamento);
          return {
            guidFormaPagamento: payment.guidFormaPagamento,
            codFormaPagamento: payment.codFormaPagamento ?? null,
            descricaoFormaPagamento: forma?.PAGAMENTO ?? "Forma de pagamento",
            valorPago: payment.valor,
            parcelas: payment.parcelas,
            troco: index === pagamentosComValor.length - 1 ? totals.troco : 0,
          };
        }),
      });
      toast.success(`Venda ${result.numeroVenda} finalizada com sucesso.`);
      imprimirVenda(result.numeroVenda, result.dataHora, result.empresa);
      setItems([]);
      setGeneralDiscount(0);
      setPayments([{ id: `pay-${Date.now()}`, guidFormaPagamento: formasPagamentoAtivas[0]?.guidPagamento ?? "", valor: 0, parcelas: 1, jurosPercentual: 0 }]);
      setGuidVenda(crypto.randomUUID());
      await utils.caixaMovimento.atual.invalidate();
      await utils.produtos.listar.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel finalizar a venda.");
    }
  }

  function setPayment(id: string, patch: Partial<Payment>) {
    setPayments((current) => current.map((payment) => (payment.id === id ? { ...payment, ...patch } : payment)));
  }

  async function removeItem(item: SaleItem) {
    if (item.guidImei) {
      await atualizarSituacaoImei.mutateAsync({ guidImei: item.guidImei, situacao: "DISPONIVEL" });
    }
    setItems((current) => current.filter((row) => row.id !== item.id));
  }

  async function selectImeiAndAdd(imei: ImeiDisponivel) {
    if (!imeiSelectionProduct) return;
    await reserveAndAddProduct(imeiSelectionProduct, 1, imei);
    setImeiSelectionProduct(null);
    setImeiOptions([]);
  }

  async function cancelDocument() {
    for (const item of items) {
      if (item.guidImei) {
        await atualizarSituacaoImei.mutateAsync({ guidImei: item.guidImei, situacao: "DISPONIVEL" });
      }
    }
    setItems([]);
    setGeneralDiscount(0);
    setClienteId("");
    setPayments([{ id: `pay-${Date.now()}`, guidFormaPagamento: formasPagamentoAtivas[0]?.guidPagamento ?? "", valor: 0, parcelas: 1, jurosPercentual: 0 }]);
    setGuidVenda(crypto.randomUUID());
    setImeiSelectionProduct(null);
    setImeiOptions([]);
    toast.success("Venda cancelada. IMEIs reservados retornaram para DISPONIVEL.");
  }

  return (
    <div className="min-h-full bg-slate-100 -m-5 p-3 sm:p-5">
      <div className="mx-auto max-w-[1800px] space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Vendas, orcamentos e OS</h1>
              <p className="text-sm text-slate-500">Operacao unica baseada em TIPOOPERACAO para KS00016 e KS00017</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tipoOperacao} onValueChange={(value) => setTipoOperacao(value as TipoOperacao)}>
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="VENDA" className="gap-1.5"><Banknote className="h-3.5 w-3.5" />Venda</TabsTrigger>
                <TabsTrigger value="ORCAMENTO" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Orcamento</TabsTrigger>
                <TabsTrigger value="ORDEMSERVICO" className="gap-1.5"><Wrench className="h-3.5 w-3.5" />OS</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={() => convertTo("VENDA")} className="gap-2">
              <Check className="h-4 w-4" />
              Converter
            </Button>
            <Button variant="outline" onClick={() => void cancelDocument()} className="gap-2 text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={() => void finishDocument()}
              disabled={!caixaAberto || caixaAberto.SITUACAO !== "ABERTO" || finalizarVenda.isPending}
              className="gap-2 bg-slate-900 hover:bg-slate-800"
            >
              <PackageCheck className="h-4 w-4" />
              {finalizarVenda.isPending ? "Finalizando..." : "Finalizar"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_420px]">
          <div className="space-y-3">
            <Card className="rounded-md border-slate-200 shadow-sm">
              <CardContent className="p-3">
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px]">
                  <div>
                    <Label className="text-xs text-slate-500">Busca rapida por codigo de barras, codigo, referencia ou descricao</Label>
                    <div className="mt-1 flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          disabled={!caixaAberto || caixaAberto.SITUACAO !== "ABERTO"}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void handleSearchSubmit();
                          }}
                          placeholder={caixaAberto ? "Bipe ou digite o produto" : "Abra um caixa para vender"}
                          className="h-11 pl-9 text-base"
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={!caixaAberto || caixaAberto.SITUACAO !== "ABERTO"}
                        onClick={() => void handleSearchSubmit()}
                        className="h-11 gap-2"
                      >
                        <Search className="h-4 w-4" />
                        Buscar
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Vendedor</Label>
                    <Select value={guidVendedor} onValueChange={setGuidVendedor} disabled={carregandoVendedores}>
                      <SelectTrigger className="mt-1 h-11">
                        <SelectValue placeholder="Selecione o vendedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendedoresAtivos.map((vendedor) => (
                          <SelectItem key={vendedor.GUIDVENDEDOR} value={vendedor.GUIDVENDEDOR}>
                            {vendedor.NOME}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Caixa</Label>
                    {caixaAberto ? (
                      <div className="mt-1 flex h-11 items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-emerald-900">
                            Caixa {caixaAberto.NUMEROCAIXA}
                          </p>
                          <p className="truncate text-[11px] text-emerald-700">{caixaAberto.GUIDCAIXA}</p>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800">ABERTO</Badge>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-1 h-11 w-full justify-start border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        disabled={carregandoCaixa || abrirCaixa.isPending}
                        onClick={() => void handleAbrirCaixa()}
                      >
                        {carregandoCaixa ? "Verificando caixa..." : "Abrir caixa"}
                      </Button>
                    )}
                  </div>
                </div>
                {!carregandoCaixa && !caixaAberto && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Abra um caixa para iniciar vendas, orcamentos ou ordem de servico.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className={`grid gap-3 ${showProductResults ? "lg:grid-cols-[minmax(280px,360px)_1fr]" : "lg:grid-cols-1"}`}>
              {showProductResults && (
                <Card className="rounded-md border-slate-200 shadow-sm">
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Search className="h-4 w-4" />
                      Produtos localizados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[380px] space-y-2 overflow-y-auto p-3 pt-0">
                    {carregandoProdutos && (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">
                        Carregando produtos do cadastro da empresa...
                      </div>
                    )}
                    {!carregandoProdutos && filteredProducts.length === 0 && (
                      <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">
                        Nenhum produto cadastrado encontrado para esta pesquisa.
                      </div>
                    )}
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void addProduct(product)}
                        className="w-full rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400 hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{product.descricao}</p>
                            <p className="text-xs text-slate-500">{product.codigo} / {product.barcode}</p>
                          </div>
                          <span className="text-sm font-bold text-slate-950">{money(priceFor(product, 1).price)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge variant="outline">{product.tamanho}</Badge>
                          <Badge variant="outline">{product.cor}</Badge>
                          <Badge className={stockAvailable(product) <= 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}>
                            Estoque {stockAvailable(product)}
                          </Badge>
                          {isPromotionValid(product) && <Badge className="bg-sky-100 text-sky-800">Promocao</Badge>}
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-md border-slate-200 shadow-sm">
                <CardHeader className="flex-row items-center justify-between p-3 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4" />
                    Grade de itens
                  </CardTitle>
                  <Badge variant="outline">{items.length} item(ns)</Badge>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="min-w-10">Item</TableHead>
                          <TableHead className="min-w-48">Produto</TableHead>
                          <TableHead>IMEI / Serie</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead className="w-24">Qtd</TableHead>
                          <TableHead>Estoque</TableHead>
                          <TableHead>Venda</TableHead>
                          <TableHead>Faixa</TableHead>
                          <TableHead className="w-24">Desc %</TableHead>
                          <TableHead className="w-24">Desc R$</TableHead>
                          <TableHead className="w-28">Preco final</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!items.length ? (
                          <TableRow>
                            <TableCell colSpan={14} className="h-40 text-center text-sm text-slate-500">
                              Nenhum item incluido. Use a busca rapida ou toque em um produto.
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item, index) => (
                            <TableRow key={item.id} className={item.status === "BLOCKED" ? "bg-red-50/60" : undefined}>
                              <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                              <TableCell>
                                <p className="font-medium text-slate-900">{item.product.descricao}</p>
                                <p className="text-xs text-slate-500">{item.product.codigo} / {item.product.barcode} / {item.product.referencia}</p>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{item.imeiLabel || "-"}</TableCell>
                              <TableCell className="text-xs">{item.product.tamanho} / {item.product.cor}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={item.product.fracionado ? 0.001 : 1}
                                  step={item.product.fracionado ? 0.001 : 1}
                                  value={item.quantidade}
                                  onChange={(event) => updateItem(item.id, {
                                    quantidade: normalizeQuantity(item.product, Number(event.target.value)),
                                  })}
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell className={stockAvailable(item.product) <= 0 ? "text-red-600" : "text-slate-700"}>{stockAvailable(item.product)}</TableCell>
                              <TableCell>{money(item.precoUnitario)}</TableCell>
                              <TableCell><Badge variant="outline">{item.faixa}</Badge></TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={Number(item.descontoPercentual.toFixed(2))}
                                  onChange={(event) => updateItem(item.id, {}, "percent", Number(event.target.value) || 0)}
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={Number(item.descontoValor.toFixed(2))}
                                  onChange={(event) => updateItem(item.id, {}, "value", Number(event.target.value) || 0)}
                                  className="h-8 w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={Number(item.precoFinal.toFixed(2))}
                                  onChange={(event) => updateItem(item.id, {}, "final", Number(event.target.value) || 0)}
                                  className="h-8 w-24"
                                />
                              </TableCell>
                              <TableCell className="font-semibold">{money(item.total)}</TableCell>
                              <TableCell>
                                <button type="button" onClick={() => item.status === "BLOCKED" && setAuthorizationItemId(item.id)}>
                                  <Badge className={statusStyle(item.status)}>
                                    {item.status === "OK" ? "Dentro limite" : item.status === "AUTHORIZED" ? "Autorizado" : "Bloqueado"}
                                  </Badge>
                                </button>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600"
                                  onClick={() => void removeItem(item)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <Card className="rounded-md border-slate-200 shadow-sm">
              <CardHeader className="flex-row items-center justify-between p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><UserPlus className="h-4 w-4" />Cliente</CardTitle>
                <div className="flex gap-2">
                  {!clientePadrao && (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setClienteId("")}>
                      Limpar Cliente
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setClienteFormAberto(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />Novo
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-3 pt-0">
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente cadastrado" /></SelectTrigger>
                  <SelectContent>
                    {clientesVenda.map((client) => <SelectItem key={client.id} value={client.id}>{client.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase text-slate-500">Cliente atual</p>
                  <p className="text-base font-semibold text-slate-950">{vendaCliente.nome}</p>
                  {clientePadrao && <p className="text-xs text-slate-500">CLIENTEPADRAO = 1</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Info label="Documento" value={vendaCliente.documento || "-"} />
                  <Info label="Situacao" value={vendaCliente.situacao} />
                  <Info label="Limite" value={money(vendaCliente.limite)} />
                  <Info label="Saldo" value={money(vendaCliente.saldo)} />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 shadow-sm">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><Calculator className="h-4 w-4" />Totais em tempo real</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <TotalLine label="Itens" value={`${totals.quantidadeItens} / ${totals.quantidadeTotal.toLocaleString("pt-BR")}`} />
                <TotalLine label="Valor bruto" value={money(totals.bruto)} />
                <TotalLine label="Desconto itens" value={money(totals.descontoItens)} tone="text-emerald-700" />
                <div className="grid grid-cols-[1fr_130px] items-center gap-2">
                  <Label className="text-sm text-slate-600">Desconto geral</Label>
                  <Input type="number" value={generalDiscount} onChange={(event) => setGeneralDiscount(Number(event.target.value) || 0)} className="h-8 text-right" />
                </div>
                <TotalLine label="Acrescimos" value={money(totals.acrescimos)} />
                <TotalLine label="Economia do cliente" value={money(totals.economia)} tone="text-emerald-700" />
                <Separator />
                <div className="rounded-md bg-slate-950 p-3 text-white">
                  <p className="text-xs uppercase text-white/60">Total liquido</p>
                  <p className="text-3xl font-bold">{money(totals.totalLiquido)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 shadow-sm">
              <CardHeader className="flex-row items-center justify-between p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4" />Formas de pagamento</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!formasPagamentoAtivas.length}
                  onClick={() => setPayments((current) => [...current, {
                    id: `pay-${Date.now()}`,
                    guidFormaPagamento: formasPagamentoAtivas[0]?.guidPagamento ?? "",
                    codFormaPagamento: formasPagamentoAtivas[0]?.CODFORMAPAGAMENTO ?? null,
                    valor: 0,
                    parcelas: 1,
                    jurosPercentual: 0,
                  }])}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                {!carregandoFormasPagamento && formasPagamentoAtivas.length === 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                    Nenhuma forma de pagamento ativa cadastrada para esta empresa.
                  </div>
                )}
                {payments.map((payment) => (
                  <div key={payment.id} className="grid grid-cols-[1fr_95px_64px_52px_32px] gap-2">
                    <Select
                      value={payment.guidFormaPagamento}
                      disabled={carregandoFormasPagamento || !formasPagamentoAtivas.length}
                      onValueChange={(value) => {
                        const forma = formasPagamentoMap.get(value);
                        setPayment(payment.id, {
                          guidFormaPagamento: value,
                          codFormaPagamento: forma?.CODFORMAPAGAMENTO ?? null,
                        });
                      }}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a forma" /></SelectTrigger>
                      <SelectContent>
                        {formasPagamentoAtivas.map((forma) => (
                          <SelectItem key={forma.guidPagamento} value={forma.guidPagamento}>
                            {forma.PAGAMENTO}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={payment.valor} onChange={(event) => setPayment(payment.id, { valor: Number(event.target.value) || 0 })} className="h-9" />
                    <Input type="number" value={payment.parcelas} onChange={(event) => setPayment(payment.id, { parcelas: Number(event.target.value) || 1 })} className="h-9" />
                    <Input type="number" value={payment.jurosPercentual} onChange={(event) => setPayment(payment.id, { jurosPercentual: Number(event.target.value) || 0 })} className="h-9" />
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setPayments((current) => current.filter((row) => row.id !== payment.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Info label="Pago" value={money(totals.pago)} />
                  <Info label="Falta" value={money(totals.falta)} />
                  <Info label="Troco" value={money(totals.troco)} />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md border-slate-200 shadow-sm">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Auditoria e indicadores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-3 pt-0">
                <div className="grid gap-2 text-xs">
                  <Legend icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />} text="Desconto dentro do limite." />
                  <Legend icon={<ShieldCheck className="h-4 w-4 text-amber-600" />} text="Desconto autorizado por cargo." />
                  <Legend icon={<AlertTriangle className="h-4 w-4 text-red-600" />} text="Desconto bloqueado ate autorizacao." />
                  <Legend icon={<Smartphone className="h-4 w-4 text-sky-600" />} text="Layout responsivo para computador, tablet e celular." />
                  <Legend icon={<Truck className="h-4 w-4 text-slate-600" />} text="Venda, atacado, distribuicao, materiais, autopecas e servicos." />
                </div>
                <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Observacoes do documento" rows={3} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(authorizationItemId)} onOpenChange={(open) => !open && setAuthorizationItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Autorizacao de desconto</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Usuario</Label>
                <Input value={auth.usuario} onChange={(event) => setAuth((current) => ({ ...current, usuario: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Senha</Label>
                <Input type="password" value={auth.senha} onChange={(event) => setAuth((current) => ({ ...current, senha: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cargo autorizador</Label>
              <Select value={auth.cargo} onValueChange={(value) => setAuth((current) => ({ ...current, cargo: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cargos.map((cargo) => <SelectItem key={cargo.cargo} value={cargo.cargo}>{cargo.cargo} - ate {cargo.limite}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Textarea value={auth.motivo} onChange={(event) => setAuth((current) => ({ ...current, motivo: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuthorizationItemId(null)}>Cancelar</Button>
            <Button onClick={authorizeDiscount}>Autorizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {clienteFormAberto && (
        <ClienteForm
          guidPessoa={null}
          onClose={(salvo, guidPessoa) => void fecharClienteForm(salvo, guidPessoa)}
        />
      )}

      <Dialog open={Boolean(imeiSelectionProduct)} onOpenChange={(open) => {
        if (!open) {
          setImeiSelectionProduct(null);
          setImeiOptions([]);
          setImeiBusca("");
          setImeiCor("TODAS");
          setImeiCapacidade("TODAS");
          setImeiOrdenacao("PRECO_ASC");
        }
      }}>
        <DialogContent className="flex max-h-[92vh] w-[100vw] !max-w-none flex-col gap-3 overflow-hidden rounded-none p-3 sm:w-[90vw] sm:!max-w-[1400px] sm:rounded-lg sm:p-5 lg:w-[86vw]">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>Selecione o IMEI do produto</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(140px,160px)_minmax(140px,160px)_minmax(160px,190px)]">
              <div className="space-y-1">
                <Label>Pesquisar</Label>
                <Input
                  value={imeiBusca}
                  onChange={(event) => setImeiBusca(event.target.value)}
                  placeholder="IMEI ou numero de serie"
                />
              </div>
              <div className="space-y-1">
                <Label>Cor</Label>
                <Select value={imeiCor} onValueChange={setImeiCor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas</SelectItem>
                    {imeiCores.map((cor) => <SelectItem key={cor} value={cor}>{cor}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Capacidade</Label>
                <Select value={imeiCapacidade} onValueChange={setImeiCapacidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas</SelectItem>
                    {imeiCapacidades.map((capacidade) => <SelectItem key={capacidade} value={capacidade}>{capacidade}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ordenar</Label>
                <Select value={imeiOrdenacao} onValueChange={(value) => setImeiOrdenacao(value as ImeiOrdenacao)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRECO_ASC">Menor preco</SelectItem>
                    <SelectItem value="PRECO_DESC">Maior preco</SelectItem>
                    <SelectItem value="DATA_DESC">Entrada recente</SelectItem>
                    <SelectItem value="DATA_ASC">Entrada antiga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="max-w-full overflow-hidden rounded-md border">
              <div className="max-h-[min(56vh,520px)] overflow-auto">
              <Table className="min-w-[1180px] table-fixed">
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-white">
                    <TableHead className="w-[132px]">IMEI 1</TableHead>
                    <TableHead className="w-[132px]">IMEI 2</TableHead>
                    <TableHead className="w-[126px]">Serie</TableHead>
                    <TableHead className="w-[92px]">Cor</TableHead>
                    <TableHead className="w-[104px]">Capacidade</TableHead>
                    <TableHead className="w-[100px]">Estado</TableHead>
                    <TableHead className="w-[108px]">Situacao</TableHead>
                    <TableHead className="w-[92px]">Entrada</TableHead>
                    <TableHead className="w-[100px] text-right">Custo</TableHead>
                    <TableHead className="w-[116px] text-right">Preco</TableHead>
                    <TableHead className="w-[150px]">Observacao</TableHead>
                    <TableHead className="w-[108px] text-right">Acao</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImeiOptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-24 text-center text-sm text-slate-500">
                        Nenhum IMEI disponivel para os filtros informados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredImeiOptions.map((imei) => (
                      <TableRow key={imei.guidImei}>
                        <TableCell className="truncate font-mono text-xs">{imei.imei1 || "-"}</TableCell>
                        <TableCell className="truncate font-mono text-xs">{imei.imei2 || "-"}</TableCell>
                        <TableCell className="truncate font-mono text-xs">{imei.numeroSerie || "-"}</TableCell>
                        <TableCell className="truncate">{imei.cor || "-"}</TableCell>
                        <TableCell className="truncate">{imei.capacidade || "-"}</TableCell>
                        <TableCell className="truncate">{imei.estado || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{imei.situacao}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(imei.dataEntrada)}</TableCell>
                        <TableCell className="text-right">{money(imei.custo)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-base font-bold text-emerald-700">{money(imei.precoVenda)}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{imei.observacao || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" className="w-full" onClick={() => void selectImeiAndAdd(imei)}>
                            Selecionar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-3">
            <Button variant="outline" onClick={() => {
              setImeiSelectionProduct(null);
              setImeiOptions([]);
              setImeiBusca("");
              setImeiCor("TODAS");
              setImeiCapacidade("TODAS");
              setImeiOrdenacao("PRECO_ASC");
            }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-[11px] uppercase text-slate-500">{label}</p>
      <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TotalLine({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function Legend({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2 text-slate-600">
      {icon}
      <span>{text}</span>
    </div>
  );
}

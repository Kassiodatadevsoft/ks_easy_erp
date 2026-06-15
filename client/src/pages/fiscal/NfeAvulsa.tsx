import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Ban,
  Download,
  FileCheck2,
  FileDown,
  FileSearch,
  Printer,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
} from "lucide-react";

type ClienteRow = {
  GUIDPESSOA: string;
  CODIGO: number;
  NOME: string;
  DOCUMENTO: string | null;
};

type NaturezaRow = {
  guidNaturezaOperacao: string;
  descricao: string;
  tipoOperacao: "E" | "S";
  situacao: boolean;
};

type TransportadoraRow = {
  GUIDPESSOA: string;
  NOME: string;
  DOCUMENTO: string | null;
};

type FormaPagamentoRow = {
  guidPagamento: string;
  CODFORMAPAGAMENTO?: number | null;
  PAGAMENTO: string;
  SITUACAO?: string;
};

type ProdutoRow = {
  GUIDPRODUTO: string;
  CODPRODUTO: number;
  PRODUTO: string;
  DESCRICAO: string | null;
  PRECOVENDA: number;
  PRECO: number;
  PRECOCUSTO: number;
  UNIDADE: string | null;
  SITUACAO: string;
  NCM: string | null;
  CFOP: string | null;
  CSOSN: string | null;
  CST: string | null;
  ALIQICMS: number;
  ALIQPIS: number;
  ALIQCOFINS: number;
  ALIQIPI: number;
  ALIQIBS: number;
  ALIQCBS: number;
  ALIQIS: number;
  ORIGEMPRODUTO: number | null;
};

type ProdutoOpcao = {
  guidProduto: string;
  codProduto: number;
  descricao: string;
  precoVenda: number;
  precoCusto: number;
  unidade: string;
  ncm: string;
  cfop: string;
  origemProduto: number | null;
  csosn: string;
  cstIcms: string;
  cstPis: string;
  cstCofins: string;
  cstIpi: string;
  aliqIcms: number;
  aliqPis: number;
  aliqCofins: number;
  aliqIpi: number;
  aliqIbs: number;
  aliqCbs: number;
  aliqIs: number;
};

type NfeItem = ProdutoOpcao & {
  id: string;
  quantidade: number;
  descontoValor: number;
};

type NfeItemCalculado = NfeItem & {
  totalBrutoItem: number;
  descontoItemTotal: number;
  descontoGeralRateado: number;
  totalLiquidoItem: number;
  baseIcms: number;
  valorIcms: number;
  basePis: number;
  valorPis: number;
  baseCofins: number;
  valorCofins: number;
  baseIpi: number;
  valorIpi: number;
  valorIbs: number;
  valorCbs: number;
  valorIs: number;
};

type RegimeEmpresa = {
  crt: number;
  descricaoRegime: string;
  isSimples: boolean;
  isNormal: boolean;
};

type Pagamento = {
  id: string;
  guidFormaPagamento: string;
  codFormaPagamento?: number | null;
  valorPago: number;
  parcelas: number;
};

type NfeDadosAdicionais = {
  tipoNfe: number;
  presencaComprador: number;
  ordemCompra: string;
  complementoObs: string;
  modalidadeFrete: number;
  guidTransportadora: string;
  quantidadeVolume: number;
  numeracaoVolume: string;
  especieVolume: string;
  pesoLiquido: number;
  pesoBruto: number;
};

type NfeListRow = {
  guidVenda: string;
  numeroVenda: number;
  codPreVenda: number | null;
  dataVenda: string;
  tipoOperacao: string;
  situacao: string;
  statusNfe: string | null;
  totalVenda: number;
  naturezaOperacao: string | null;
  cliente: string | null;
  chave: string | null;
  protocolo: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function mapProduto(row: ProdutoRow): ProdutoOpcao {
  return {
    guidProduto: row.GUIDPRODUTO,
    codProduto: Number(row.CODPRODUTO ?? 0),
    descricao: row.PRODUTO || row.DESCRICAO || "Produto sem descricao",
    precoVenda: Number(row.PRECOVENDA || row.PRECO || 0),
    precoCusto: Number(row.PRECOCUSTO ?? 0),
    unidade: row.UNIDADE || "UN",
    ncm: row.NCM || "",
    cfop: row.CFOP || "",
    origemProduto: row.ORIGEMPRODUTO ?? 0,
    csosn: row.CSOSN || "",
    cstIcms: row.CST || "",
    cstPis: Number(row.ALIQPIS ?? 0) > 0 ? "01" : "",
    cstCofins: Number(row.ALIQCOFINS ?? 0) > 0 ? "01" : "",
    cstIpi: Number(row.ALIQIPI ?? 0) > 0 ? "99" : "",
    aliqIcms: Number(row.ALIQICMS ?? 0),
    aliqPis: Number(row.ALIQPIS ?? 0),
    aliqCofins: Number(row.ALIQCOFINS ?? 0),
    aliqIpi: Number(row.ALIQIPI ?? 0),
    aliqIbs: Number(row.ALIQIBS ?? 0),
    aliqCbs: Number(row.ALIQCBS ?? 0),
    aliqIs: Number(row.ALIQIS ?? 0),
  };
}

function statusTone(status: string | null | undefined) {
  if (status === "CANCELADA") return "border-red-200 bg-red-50 text-red-700";
  if (status === "AUTORIZADA") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDENTE_ENVIO") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function tipoOperacaoLabel(tipo: "E" | "S") {
  return tipo === "E" ? "Entrada" : "Saida";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calcularItemFiscal(item: NfeItem, descontoGeralRateado: number): NfeItemCalculado {
  const totalBrutoItem = roundMoney(item.quantidade * item.precoVenda);
  const descontoItemTotal = roundMoney(Math.min(item.descontoValor, item.precoVenda) * item.quantidade);
  const totalLiquidoItem = roundMoney(Math.max(0, totalBrutoItem - descontoItemTotal - descontoGeralRateado));
  const baseIcms = totalLiquidoItem;
  const basePis = totalLiquidoItem;
  const baseCofins = totalLiquidoItem;
  const baseIpi = totalLiquidoItem;
  return {
    ...item,
    totalBrutoItem,
    descontoItemTotal,
    descontoGeralRateado: roundMoney(descontoGeralRateado),
    totalLiquidoItem,
    baseIcms,
    valorIcms: roundMoney(baseIcms * (item.aliqIcms / 100)),
    basePis,
    valorPis: roundMoney(basePis * (item.aliqPis / 100)),
    baseCofins,
    valorCofins: roundMoney(baseCofins * (item.aliqCofins / 100)),
    baseIpi,
    valorIpi: roundMoney(baseIpi * (item.aliqIpi / 100)),
    valorIbs: roundMoney(totalLiquidoItem * (item.aliqIbs / 100)),
    valorCbs: roundMoney(totalLiquidoItem * (item.aliqCbs / 100)),
    valorIs: roundMoney(totalLiquidoItem * (item.aliqIs / 100)),
  };
}

const DADOS_ADICIONAIS_INICIAIS: NfeDadosAdicionais = {
  tipoNfe: 1,
  presencaComprador: 1,
  ordemCompra: "",
  complementoObs: "",
  modalidadeFrete: 9,
  guidTransportadora: "",
  quantidadeVolume: 0,
  numeracaoVolume: "",
  especieVolume: "",
  pesoLiquido: 0,
  pesoBruto: 0,
};

const TIPOS_NFE = [
  { value: 1, label: "NF-e normal" },
  { value: 2, label: "NF-e complementar" },
  { value: 3, label: "NF-e de ajuste" },
  { value: 4, label: "Devolucao de mercadoria" },
];

const PRESENCAS_COMPRADOR = [
  { value: 0, label: "Nao se aplica" },
  { value: 1, label: "Operacao presencial" },
  { value: 2, label: "Nao presencial, Internet" },
  { value: 3, label: "Nao presencial, Teleatendimento" },
  { value: 4, label: "NFC-e com entrega em domicilio" },
  { value: 9, label: "Nao presencial, outros" },
];

const MODALIDADES_FRETE = [
  { value: 0, label: "CIF - por conta do Remetente" },
  { value: 1, label: "FOB - por conta do Destinatario" },
  { value: 2, label: "Por conta de Terceiros" },
  { value: 3, label: "Transporte Proprio Remetente" },
  { value: 4, label: "Transporte Proprio Destinatario" },
  { value: 9, label: "Sem Ocorrencia de Transporte" },
];

async function fetchNaturezasOperacao() {
  const response = await fetch("/api/fiscal/natureza-operacao?ativas=true");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message ?? "Nao foi possivel listar naturezas da operacao.");
  return (data.dados ?? []) as NaturezaRow[];
}

export default function NfeAvulsa() {
  const utils = trpc.useUtils();
  const [guidVenda, setGuidVenda] = useState<string>(() => crypto.randomUUID());
  const [clienteId, setClienteId] = useState("");
  const [guidNatureza, setGuidNatureza] = useState("");
  const [tipoOperacao, setTipoOperacao] = useState<"E" | "S">("S");
  const [naturezasData, setNaturezasData] = useState<NaturezaRow[]>([]);
  const [carregandoNaturezas, setCarregandoNaturezas] = useState(false);
  const [dadosAdicionais, setDadosAdicionais] = useState<NfeDadosAdicionais>(DADOS_ADICIONAIS_INICIAIS);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [itens, setItens] = useState<NfeItem[]>([]);
  const [descontoTotal, setDescontoTotal] = useState(0);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([
    { id: "pay-1", guidFormaPagamento: "", valorPago: 0, parcelas: 1 },
  ]);
  const [observacao, setObservacao] = useState("");
  const [documentoSelecionado, setDocumentoSelecionado] = useState<NfeListRow | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [buscaLista, setBuscaLista] = useState("");

  const { data: clientesData } = trpc.clientes.listar.useQuery({ situacao: "A", pagina: 1, porPagina: 100 });
  const { data: formasPagamentoData = [] } = trpc.formasPagamento.listarTodas.useQuery();
  const { data: transportadorasData } = trpc.transportadoras.listar.useQuery({ pagina: 1, porPagina: 100, situacao: "A" });
  const { data: regimeData } = trpc.produtos.regimeEmpresa.useQuery();
  const { data: produtosData, isLoading: carregandoProdutos } = trpc.produtos.listar.useQuery({
    busca: buscaProduto.trim() || undefined,
    situacao: "A",
    pagina: 1,
    porPagina: 50,
  });
  const { data: documentos = [], isLoading: carregandoDocumentos } = trpc.nfeAvulsa.listar.useQuery({
    busca: buscaLista.trim() || undefined,
  });

  const salvar = trpc.nfeAvulsa.salvar.useMutation({
    onSuccess: async (result) => {
      toast.success(`NF-e Avulsa ${result.codPreVenda} salva.`);
      setGuidVenda(result.guidVenda);
      await utils.nfeAvulsa.listar.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const emitir = trpc.nfeAvulsa.emitir.useMutation({
    onSuccess: async (result) => {
      toast.success(result.message);
      await utils.nfeAvulsa.listar.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelar = trpc.nfeAvulsa.cancelar.useMutation({
    onSuccess: async () => {
      toast.success("NF-e Avulsa cancelada.");
      setDocumentoSelecionado(null);
      setMotivoCancelamento("");
      await utils.nfeAvulsa.listar.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    setCarregandoNaturezas(true);
    fetchNaturezasOperacao()
      .then(setNaturezasData)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Nao foi possivel listar naturezas."))
      .finally(() => setCarregandoNaturezas(false));
  }, []);

  const clientes = (clientesData?.dados ?? []) as ClienteRow[];
  const regimeEmpresa = regimeData as RegimeEmpresa | undefined;
  const naturezas = naturezasData.filter((row) => row.guidNaturezaOperacao && row.situacao);
  const formasPagamento = (formasPagamentoData as FormaPagamentoRow[]).filter((row) => row.guidPagamento);
  const transportadoras = (transportadorasData?.items ?? []) as TransportadoraRow[];
  const produtos = ((produtosData?.registros ?? []) as ProdutoRow[]).map(mapProduto);

  const clienteSelecionado = clientes.find((cliente) => cliente.GUIDPESSOA === clienteId) ?? null;
  const naturezaSelecionada = naturezas.find((natureza) => natureza.guidNaturezaOperacao === guidNatureza) ?? null;
  const formasMap = useMemo(
    () => new Map(formasPagamento.map((forma) => [forma.guidPagamento, forma])),
    [formasPagamento],
  );

  const itensCalculados = useMemo(() => {
    const bases = itens.map((item) => {
      const totalBruto = item.precoVenda * item.quantidade;
      const descontoItem = Math.min(item.descontoValor, item.precoVenda) * item.quantidade;
      return Math.max(0, totalBruto - descontoItem);
    });
    const baseRateio = bases.reduce((sum, value) => sum + value, 0);
    const descontoGeral = Math.min(descontoTotal, baseRateio);
    return itens.map((item, index) => {
      const rateio = baseRateio > 0 ? descontoGeral * (bases[index] / baseRateio) : 0;
      return calcularItemFiscal(item, rateio);
    });
  }, [descontoTotal, itens]);

  const totals = useMemo(() => {
    const bruto = itensCalculados.reduce((sum, item) => sum + item.totalBrutoItem, 0);
    const descontoItens = itensCalculados.reduce((sum, item) => sum + item.descontoItemTotal, 0);
    const descontoGeral = itensCalculados.reduce((sum, item) => sum + item.descontoGeralRateado, 0);
    const total = Math.max(0, itensCalculados.reduce((sum, item) => sum + item.totalLiquidoItem, 0));
    const pago = pagamentos.reduce((sum, pagamento) => sum + pagamento.valorPago, 0);
    return {
      bruto,
      descontoItens,
      descontoGeral,
      descontoTotal: descontoItens + descontoGeral,
      total,
      pago,
      diferencaPagamento: total - pago,
      falta: Math.max(0, total - pago),
    };
  }, [itensCalculados, pagamentos]);
  const pagamentoQuitado = Math.abs(totals.diferencaPagamento) < 0.01;

  function novoDocumento() {
    setGuidVenda(crypto.randomUUID());
    setClienteId("");
    setGuidNatureza("");
    setTipoOperacao("S");
    setDadosAdicionais(DADOS_ADICIONAIS_INICIAIS);
    setItens([]);
    setDescontoTotal(0);
    setPagamentos([{ id: `pay-${Date.now()}`, guidFormaPagamento: formasPagamento[0]?.guidPagamento ?? "", valorPago: 0, parcelas: 1 }]);
    setObservacao("");
  }

  function selecionarNatureza(value: string) {
    setGuidNatureza(value);
    const natureza = naturezas.find((row) => row.guidNaturezaOperacao === value);
    if (natureza) setTipoOperacao(natureza.tipoOperacao);
  }

  function adicionarProduto(produto: ProdutoOpcao) {
    setItens((current) => [
      ...current,
      { ...produto, id: `${produto.guidProduto}-${Date.now()}`, quantidade: 1, descontoValor: 0 },
    ]);
    setBuscaProduto("");
  }

  function atualizarItem(id: string, patch: Partial<NfeItem>) {
    setItens((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              quantidade: Math.max(0.001, patch.quantidade ?? item.quantidade),
              descontoValor: Math.max(0, patch.descontoValor ?? item.descontoValor),
            }
          : item,
      ),
    );
  }

  function validarItensFiscais() {
    for (const item of itensCalculados) {
      if (!item.guidProduto) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} nao foi informado.`;
      if (item.quantidade <= 0) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta com quantidade zerada.`;
      if (item.precoVenda <= 0) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta com valor unitario zerado.`;
      if (!item.ncm.trim()) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem NCM informado.`;
      if (!item.cfop.trim()) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CFOP informado.`;
      if (item.origemProduto === null || item.origemProduto === undefined) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem origem da mercadoria informada.`;
      if (regimeEmpresa?.isSimples && !item.csosn.trim()) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CSOSN para empresa do Simples Nacional.`;
      if (regimeEmpresa?.isNormal && !item.cstIcms.trim()) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem CST ICMS para empresa do Regime Normal.`;
      if (!item.unidade.trim()) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem unidade informada.`;
      if (item.totalLiquidoItem <= 0) return `Nao e possivel emitir a NF-e. O produto ${item.descricao} esta sem total do item calculado.`;
    }
    return null;
  }

  function atualizarPagamento(id: string, patch: Partial<Pagamento>) {
    setPagamentos((current) => current.map((pagamento) => (pagamento.id === id ? { ...pagamento, ...patch } : pagamento)));
  }

  async function salvarDocumento(rascunho: boolean) {
    if (!clienteSelecionado) {
      toast.error("Selecione um cliente cadastrado.");
      return null;
    }
    if (!naturezaSelecionada) {
      toast.error("Selecione a natureza da operacao.");
      return null;
    }
    if (!itens.length) {
      toast.error("Adicione ao menos um produto.");
      return null;
    }
    const erroFiscal = validarItensFiscais();
    if (erroFiscal) {
      toast.error(erroFiscal);
      return null;
    }
    const pagamentosValidos = pagamentos.filter((pagamento) => pagamento.valorPago > 0);
    if (!pagamentosValidos.length || pagamentosValidos.some((pagamento) => !pagamento.guidFormaPagamento)) {
      toast.error("Selecione a forma de pagamento cadastrada para a empresa logada.");
      return null;
    }
    if (totals.falta > 0.009) {
      toast.error("Informe pagamento suficiente para o total da NF-e Avulsa.");
      return null;
    }

    return await salvar.mutateAsync({
      guidVenda,
      guidCliente: clienteSelecionado.GUIDPESSOA,
      codCliente: Number(clienteSelecionado.CODIGO ?? 0),
      nomeCliente: clienteSelecionado.NOME,
      guidNaturezaOperacao: naturezaSelecionada.guidNaturezaOperacao,
      naturezaOperacao: naturezaSelecionada.descricao,
      tipoOperacao,
      tipoNfe: dadosAdicionais.tipoNfe,
      presencaComprador: dadosAdicionais.presencaComprador,
      ordemCompra: dadosAdicionais.ordemCompra || null,
      complementoObs: dadosAdicionais.complementoObs || null,
      modalidadeFrete: dadosAdicionais.modalidadeFrete,
      guidTransportadora: dadosAdicionais.guidTransportadora || null,
      quantidadeVolume: dadosAdicionais.quantidadeVolume || null,
      numeracaoVolume: dadosAdicionais.numeracaoVolume || null,
      especieVolume: dadosAdicionais.especieVolume || null,
      pesoLiquido: dadosAdicionais.pesoLiquido || null,
      pesoBruto: dadosAdicionais.pesoBruto || null,
      descontoTotal,
      observacao: observacao || null,
      rascunho,
      itens: itensCalculados.map((item) => ({
        guidProduto: item.guidProduto,
        codProduto: item.codProduto,
        descricao: item.descricao,
        quantidade: item.quantidade,
        precoCusto: item.precoCusto,
        precoVenda: item.precoVenda,
        descontoValor: item.descontoValor,
        ncm: item.ncm,
        cfop: item.cfop,
        origemProduto: item.origemProduto,
        csosn: item.csosn || null,
        cstIcms: item.cstIcms || null,
        cstPis: item.cstPis || null,
        cstCofins: item.cstCofins || null,
        cstIpi: item.cstIpi || null,
        aliqIcms: item.aliqIcms,
        aliqPis: item.aliqPis,
        aliqCofins: item.aliqCofins,
        aliqIpi: item.aliqIpi,
        aliqIbs: item.aliqIbs,
        aliqCbs: item.aliqCbs,
        aliqIs: item.aliqIs,
        totalBrutoItem: item.totalBrutoItem,
        descontoItemTotal: item.descontoItemTotal,
        descontoGeralRateado: item.descontoGeralRateado,
        totalLiquidoItem: item.totalLiquidoItem,
        baseIcms: item.baseIcms,
        valorIcms: item.valorIcms,
        basePis: item.basePis,
        valorPis: item.valorPis,
        baseCofins: item.baseCofins,
        valorCofins: item.valorCofins,
        baseIpi: item.baseIpi,
        valorIpi: item.valorIpi,
        valorIbs: item.valorIbs,
        valorCbs: item.valorCbs,
        valorIs: item.valorIs,
      })),
      pagamentos: pagamentosValidos.map((pagamento) => {
        const forma = formasMap.get(pagamento.guidFormaPagamento);
        return {
          guidFormaPagamento: pagamento.guidFormaPagamento,
          codFormaPagamento: pagamento.codFormaPagamento ?? forma?.CODFORMAPAGAMENTO ?? null,
          descricaoFormaPagamento: forma?.PAGAMENTO ?? "Forma de pagamento",
          valorPago: pagamento.valorPago,
          parcelas: pagamento.parcelas,
        };
      }),
    });
  }

  async function emitirDocumento() {
    const documento = await salvarDocumento(false);
    if (!documento) return;
    await emitir.mutateAsync({ guidVenda: documento.guidVenda });
  }

  async function consultarDocumento(documento: NfeListRow) {
    const result = await utils.nfeAvulsa.consultar.fetch({ guidVenda: documento.guidVenda });
    toast.info(`Situacao NF-e: ${result.statusNfe}`, {
      description: result.chave ? `Chave: ${result.chave}` : "Documento fiscal avulso sem chave retornada.",
    });
  }

  async function baixarXml(documento: NfeListRow) {
    const result = await utils.nfeAvulsa.obterXml.fetch({ guidVenda: documento.guidVenda });
    if (!result.xml) {
      toast.error("XML ainda nao disponivel para este documento.");
      return;
    }
    const blob = new Blob([result.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nfe-avulsa-${result.numeroVenda || documento.numeroVenda}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function imprimirDanfe(documento: NfeListRow) {
    const result = await utils.nfeAvulsa.obterXml.fetch({ guidVenda: documento.guidVenda });
    const printWindow = window.open("", "_blank", "width=980,height=760");
    if (!printWindow) {
      toast.error("Nao foi possivel abrir a impressao do DANFE.");
      return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>DANFE ${documento.numeroVenda}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
            .box { border: 1px solid #111827; padding: 12px; margin-bottom: 10px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            pre { white-space: pre-wrap; font-size: 11px; background: #f8fafc; padding: 10px; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>DANFE - Documento Auxiliar da NF-e Avulsa</h1>
            <div class="grid">
              <div>Numero: <strong>${documento.numeroVenda}</strong></div>
              <div>Modelo: <strong>55</strong></div>
              <div>Cliente: <strong>${documento.cliente ?? "-"}</strong></div>
              <div>Total: <strong>${money(Number(documento.totalVenda ?? 0))}</strong></div>
              <div>Status: <strong>${documento.statusNfe ?? documento.situacao}</strong></div>
              <div>Chave: <strong>${documento.chave ?? "-"}</strong></div>
            </div>
          </div>
          <div class="box">
            <strong>XML</strong>
            <pre>${(result.xml || "XML ainda nao disponivel.").replace(/[<>&]/g, (char: string) => {
              const map: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;" };
              return map[char] ?? char;
            })}</pre>
          </div>
          <script>window.print()</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Emissao de NF-e Avulsa</h1>
          <p className="text-sm text-slate-500">Documento fiscal avulso gravado em KS00016, KS00017 e KS00018 com origem NTA.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={novoDocumento}>
          <FileCheck2 className="h-4 w-4" />
          Novo
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Dados fiscais</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-0 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clientes.map((cliente) => (
                      <SelectItem key={cliente.GUIDPESSOA} value={cliente.GUIDPESSOA}>
                        {cliente.NOME}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Natureza da operacao</Label>
                <Select value={guidNatureza} onValueChange={selecionarNatureza}>
                  <SelectTrigger><SelectValue placeholder="Selecionar natureza" /></SelectTrigger>
                  <SelectContent>
                    {carregandoNaturezas ? (
                      <SelectItem value="loading" disabled>Carregando naturezas...</SelectItem>
                    ) : naturezas.length === 0 ? (
                      <SelectItem value="empty" disabled>Nenhuma natureza ativa</SelectItem>
                    ) : naturezas.map((natureza) => (
                      <SelectItem key={natureza.guidNaturezaOperacao} value={natureza.guidNaturezaOperacao}>
                        {natureza.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo da operacao</Label>
                <Input value={tipoOperacaoLabel(tipoOperacao)} readOnly />
              </div>
              <div className="space-y-1">
                <Label>Tipo da NF-e</Label>
                <Select
                  value={String(dadosAdicionais.tipoNfe)}
                  onValueChange={(value) => setDadosAdicionais((current) => ({ ...current, tipoNfe: Number(value) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_NFE.map((tipo) => (
                      <SelectItem key={tipo.value} value={String(tipo.value)}>{tipo.value} - {tipo.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Presenca do comprador</Label>
                <Select
                  value={String(dadosAdicionais.presencaComprador)}
                  onValueChange={(value) => setDadosAdicionais((current) => ({ ...current, presencaComprador: Number(value) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESENCAS_COMPRADOR.map((presenca) => (
                      <SelectItem key={presenca.value} value={String(presenca.value)}>{presenca.value} - {presenca.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ordem de compra</Label>
                <Input
                  value={dadosAdicionais.ordemCompra}
                  onChange={(event) => setDadosAdicionais((current) => ({ ...current, ordemCompra: event.target.value }))}
                  maxLength={60}
                />
              </div>
              <div className="space-y-1">
                <Label>GUIDVENDA</Label>
                <Input value={guidVenda} readOnly className="font-mono text-xs" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Transporte e complementos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="space-y-1">
                <Label>Complementos / Observacoes</Label>
                <Textarea
                  value={dadosAdicionais.complementoObs}
                  onChange={(event) => setDadosAdicionais((current) => ({ ...current, complementoObs: event.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label>Modalidade do frete</Label>
                  <Select
                    value={String(dadosAdicionais.modalidadeFrete)}
                    onValueChange={(value) => setDadosAdicionais((current) => ({ ...current, modalidadeFrete: Number(value) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODALIDADES_FRETE.map((modalidade) => (
                        <SelectItem key={modalidade.value} value={String(modalidade.value)}>
                          {modalidade.value} - {modalidade.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-1 xl:col-span-2">
                  <Label>Transportadora</Label>
                  <Select
                    value={dadosAdicionais.guidTransportadora || "sem-transportadora"}
                    onValueChange={(value) => setDadosAdicionais((current) => ({ ...current, guidTransportadora: value === "sem-transportadora" ? "" : value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="F4 / selecionar transportadora" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem-transportadora">Sem transportadora</SelectItem>
                      {transportadoras.map((transportadora) => (
                        <SelectItem key={transportadora.GUIDPESSOA} value={transportadora.GUIDPESSOA}>
                          {transportadora.NOME}{transportadora.DOCUMENTO ? ` - ${transportadora.DOCUMENTO}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantidade volume</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={dadosAdicionais.quantidadeVolume}
                    onChange={(event) => setDadosAdicionais((current) => ({ ...current, quantidadeVolume: Number(event.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Numeracao dos volumes</Label>
                  <Input
                    value={dadosAdicionais.numeracaoVolume}
                    onChange={(event) => setDadosAdicionais((current) => ({ ...current, numeracaoVolume: event.target.value }))}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Especie dos volumes</Label>
                  <Input
                    value={dadosAdicionais.especieVolume}
                    onChange={(event) => setDadosAdicionais((current) => ({ ...current, especieVolume: event.target.value }))}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Peso liquido em KG</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={dadosAdicionais.pesoLiquido}
                    onChange={(event) => setDadosAdicionais((current) => ({ ...current, pesoLiquido: Number(event.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Peso bruto em KG</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.001}
                    value={dadosAdicionais.pesoBruto}
                    onChange={(event) => setDadosAdicionais((current) => ({ ...current, pesoBruto: Number(event.target.value) || 0 }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Produtos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  value={buscaProduto}
                  onChange={(event) => setBuscaProduto(event.target.value)}
                  placeholder="Buscar produto por codigo, nome, referencia ou barras"
                />
              </div>
              {buscaProduto.trim() && (
                <div className="max-h-56 overflow-auto rounded-md border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="w-24 text-right">Preco</TableHead>
                        <TableHead className="w-24 text-right">Acao</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {carregandoProdutos ? (
                        <TableRow><TableCell colSpan={3}>Carregando produtos...</TableCell></TableRow>
                      ) : produtos.length === 0 ? (
                        <TableRow><TableCell colSpan={3}>Nenhum produto encontrado.</TableCell></TableRow>
                      ) : (
                        produtos.map((produto) => (
                          <TableRow key={produto.guidProduto}>
                            <TableCell>
                              <div className="font-medium">{produto.descricao}</div>
                              <div className="text-xs text-slate-500">Cod. {produto.codProduto} / {produto.unidade}</div>
                            </TableCell>
                            <TableCell className="text-right">{money(produto.precoVenda)}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => adicionarProduto(produto)}>Adicionar</Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="overflow-x-auto rounded-md border border-slate-200">
                <Table className="min-w-[1480px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-28 text-right">Qtd</TableHead>
                      <TableHead className="w-32 text-right">Unitario</TableHead>
                      <TableHead className="w-32 text-right">Desc. item</TableHead>
                      <TableHead className="w-28">NCM</TableHead>
                      <TableHead className="w-24">CFOP</TableHead>
                      <TableHead className="w-20">Origem</TableHead>
                      <TableHead className="w-24">CSOSN</TableHead>
                      <TableHead className="w-24">CST</TableHead>
                      <TableHead className="w-24 text-right">ICMS %</TableHead>
                      <TableHead className="w-24 text-right">PIS %</TableHead>
                      <TableHead className="w-24 text-right">COFINS %</TableHead>
                      <TableHead className="w-24 text-right">IPI %</TableHead>
                      <TableHead className="w-32 text-right">Total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15} className="h-24 text-center text-slate-500">
                          Nenhum produto adicionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      itensCalculados.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.descricao}</div>
                            <div className="text-xs text-slate-500">Cod. {item.codProduto} / {item.unidade}</div>
                            <div className="text-xs text-slate-500">Liquido {money(item.totalLiquidoItem)} / Impostos {money(item.valorIcms + item.valorPis + item.valorCofins + item.valorIpi + item.valorIbs + item.valorCbs + item.valorIs)}</div>
                            <div className="text-xs text-slate-500">Desc. item {money(item.descontoItemTotal)} / Geral rateado {money(item.descontoGeralRateado)}</div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0.001}
                              step={0.001}
                              value={item.quantidade}
                              onChange={(event) => atualizarItem(item.id, { quantidade: Number(event.target.value) || 1 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.precoVenda}
                              onChange={(event) => atualizarItem(item.id, { precoVenda: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.descontoValor}
                              onChange={(event) => atualizarItem(item.id, { descontoValor: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input value={item.ncm} onChange={(event) => atualizarItem(item.id, { ncm: event.target.value })} />
                          </TableCell>
                          <TableCell>
                            <Input value={item.cfop} onChange={(event) => atualizarItem(item.id, { cfop: event.target.value })} />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={8}
                              value={item.origemProduto ?? 0}
                              onChange={(event) => atualizarItem(item.id, { origemProduto: Number(event.target.value) })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input value={item.csosn} onChange={(event) => atualizarItem(item.id, { csosn: event.target.value })} />
                          </TableCell>
                          <TableCell>
                            <Input value={item.cstIcms} onChange={(event) => atualizarItem(item.id, { cstIcms: event.target.value })} />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.aliqIcms}
                              onChange={(event) => atualizarItem(item.id, { aliqIcms: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.aliqPis}
                              onChange={(event) => atualizarItem(item.id, { aliqPis: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.aliqCofins}
                              onChange={(event) => atualizarItem(item.id, { aliqCofins: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.aliqIpi}
                              onChange={(event) => atualizarItem(item.id, { aliqIpi: Number(event.target.value) || 0 })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {money(item.totalLiquidoItem)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setItens((current) => current.filter((row) => row.id !== item.id))}>
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

        <div className="space-y-4">
          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Totais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <TotalLine label="Produtos" value={money(totals.bruto)} />
              <TotalLine label="Desconto dos itens" value={money(totals.descontoItens)} />
              <div className="grid grid-cols-[1fr_130px] items-center gap-2">
                <Label className="text-sm text-slate-600">Desconto geral</Label>
                <Input type="number" value={descontoTotal} onChange={(event) => setDescontoTotal(Number(event.target.value) || 0)} className="text-right" />
              </div>
              <TotalLine label="Desconto cabecalho" value={money(totals.descontoTotal)} />
              <Separator />
              <div className="rounded-md bg-slate-950 p-3 text-white">
                <p className="text-xs uppercase text-white/60">Total da NF-e</p>
                <p className="text-3xl font-bold">{money(totals.total)}</p>
              </div>
              <TotalLine label="Pago" value={money(totals.pago)} />
              <TotalLine label="Falta" value={money(totals.falta)} />
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center justify-between p-4 pb-2">
              <CardTitle className="text-base">Pagamento</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagamentos((current) => [...current, { id: `pay-${Date.now()}`, guidFormaPagamento: formasPagamento[0]?.guidPagamento ?? "", valorPago: 0, parcelas: 1 }])}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="hidden grid-cols-[minmax(0,10fr)_minmax(0,5fr)_minmax(0,3fr)_minmax(36px,2fr)] gap-2 px-2 text-xs font-medium uppercase text-slate-500 lg:grid">
                <span>Forma de Pagamento</span>
                <span className="text-right">Valor</span>
                <span className="text-center">Parcelas</span>
                <span className="text-center">Excluir</span>
              </div>
              {pagamentos.map((pagamento) => (
                <div key={pagamento.id} className="grid grid-cols-[minmax(0,1fr)_92px_44px] gap-2 rounded-md border border-slate-200 bg-white p-2 lg:grid-cols-[minmax(0,10fr)_minmax(0,5fr)_minmax(0,3fr)_minmax(36px,2fr)] lg:items-center">
                  <div className="col-span-3 min-w-0 lg:col-span-1">
                    <Select
                      value={pagamento.guidFormaPagamento}
                      onValueChange={(value) => atualizarPagamento(pagamento.id, {
                        guidFormaPagamento: value,
                        codFormaPagamento: formasMap.get(value)?.CODFORMAPAGAMENTO ?? null,
                      })}
                    >
                      <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap [&>span]:min-w-0 [&>span]:truncate [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
                        <SelectValue placeholder="Forma" />
                      </SelectTrigger>
                      <SelectContent>
                        {formasPagamento.map((forma) => (
                          <SelectItem key={forma.guidPagamento} value={forma.guidPagamento} className="max-w-[320px] truncate">{forma.PAGAMENTO}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input type="number" value={pagamento.valorPago} onChange={(event) => atualizarPagamento(pagamento.id, { valorPago: Number(event.target.value) || 0 })} className="min-w-0 text-right" />
                  <Input type="number" value={pagamento.parcelas} onChange={(event) => atualizarPagamento(pagamento.id, { parcelas: Number(event.target.value) || 1 })} className="min-w-0 text-center" />
                  <Button variant="ghost" size="icon" className="w-full min-w-0 justify-self-end text-red-600 hover:text-red-700 sm:w-9" onClick={() => setPagamentos((current) => current.filter((row) => row.id !== pagamento.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Separator />
              <div className="space-y-2 rounded-md bg-slate-50 p-3">
                <TotalLine label="Total dos pagamentos" value={money(totals.pago)} />
                <div className={`flex items-center justify-between text-sm font-semibold ${pagamentoQuitado ? "text-emerald-700" : "text-red-700"}`}>
                  <span>Diferenca</span>
                  <span>{money(totals.diferencaPagamento)}</span>
                </div>
                <Badge variant="outline" className={pagamentoQuitado ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
                  {pagamentoQuitado ? "Quitado" : "Pagamento divergente"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Observacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <Textarea value={observacao} onChange={(event) => setObservacao(event.target.value)} rows={3} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => void salvarDocumento(true)} disabled={salvar.isPending}>
                  <Save className="h-4 w-4" />
                  Salvar
                </Button>
                <Button className="gap-2" onClick={() => void emitirDocumento()} disabled={salvar.isPending || emitir.isPending}>
                  <Send className="h-4 w-4" />
                  Emitir NF-e
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="rounded-md border-slate-200 shadow-sm">
        <CardHeader className="flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">NF-e Avulsas</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Buscar cliente, numero ou chave" value={buscaLista} onChange={(event) => setBuscaLista(event.target.value)} />
            <Button variant="outline" size="icon" onClick={() => void utils.nfeAvulsa.listar.invalidate()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregandoDocumentos ? (
                <TableRow><TableCell colSpan={6} className="h-20 text-center">Carregando documentos...</TableCell></TableRow>
              ) : (documentos as NfeListRow[]).length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-slate-500">Nenhuma NF-e Avulsa encontrada.</TableCell></TableRow>
              ) : (
                (documentos as NfeListRow[]).map((documento) => (
                  <TableRow key={documento.guidVenda}>
                    <TableCell>
                      <div className="font-semibold">NTA {documento.codPreVenda ?? documento.numeroVenda}</div>
                      <div className="text-xs text-slate-500">{documento.dataVenda} / {documento.tipoOperacao}</div>
                    </TableCell>
                    <TableCell>{documento.cliente ?? "-"}</TableCell>
                    <TableCell>{documento.naturezaOperacao ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone(documento.statusNfe)}>
                        {documento.statusNfe ?? documento.situacao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{money(Number(documento.totalVenda ?? 0))}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Consultar" onClick={() => void consultarDocumento(documento)}>
                          <FileSearch className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Cancelar" className="text-red-600" onClick={() => setDocumentoSelecionado(documento)}>
                          <Ban className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Imprimir DANFE" onClick={() => void imprimirDanfe(documento)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Download XML" onClick={() => void baixarXml(documento)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="gap-2" onClick={() => void salvarDocumento(true)}><Save className="h-4 w-4" />Salvar</Button>
        <Button className="gap-2" onClick={() => void emitirDocumento()}><Send className="h-4 w-4" />Emitir NF-e</Button>
        <Button variant="outline" className="gap-2" disabled={!documentos[0]} onClick={() => documentos[0] && void consultarDocumento(documentos[0] as NfeListRow)}><FileSearch className="h-4 w-4" />Consultar</Button>
        <Button variant="outline" className="gap-2" disabled={!documentos[0]} onClick={() => documentos[0] && setDocumentoSelecionado(documentos[0] as NfeListRow)}><Ban className="h-4 w-4" />Cancelar</Button>
        <Button variant="outline" className="gap-2" disabled={!documentos[0]} onClick={() => documentos[0] && void imprimirDanfe(documentos[0] as NfeListRow)}><Printer className="h-4 w-4" />Imprimir DANFE</Button>
        <Button variant="outline" className="gap-2" disabled={!documentos[0]} onClick={() => documentos[0] && void baixarXml(documentos[0] as NfeListRow)}><FileDown className="h-4 w-4" />Download XML</Button>
      </div>

      <Dialog open={Boolean(documentoSelecionado)} onOpenChange={(open) => !open && setDocumentoSelecionado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar NF-e Avulsa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo do cancelamento</Label>
            <Textarea value={motivoCancelamento} onChange={(event) => setMotivoCancelamento(event.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocumentoSelecionado(null)}>Fechar</Button>
            <Button
              variant="destructive"
              disabled={!documentoSelecionado || motivoCancelamento.trim().length < 15 || cancelar.isPending}
              onClick={() => documentoSelecionado && cancelar.mutate({ guidVenda: documentoSelecionado.guidVenda, motivo: motivoCancelamento.trim() })}
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileDown, RefreshCw, ShoppingCart, XCircle } from "lucide-react";

type ItemSugestao = {
  guidProduto: string;
  CODPRODUTO: number | null;
  PRODUTO: string;
  categoria: string | null;
  MARCA: string | null;
  CURVAABC: string | null;
  guidFornecedor: string | null;
  fornecedorPrincipal: string | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  pontoReposicao: number;
  quantidadePedidoCompra: number;
  mediaVendaDiaria: number;
  vendaPeriodo: number;
  sugestaoCompra: number;
  custoMedio: number;
  valorEstimado: number;
  status: string;
};

type Categoria = { guidCategoria: string; CATEGORIA: string };

const moeda = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export default function SugestaoCompra() {
  const utils = trpc.useUtils();
  const [produto, setProduto] = useState("");
  const [guidCategoria, setGuidCategoria] = useState("TODAS");
  const [marca, setMarca] = useState("");
  const [curvaAbc, setCurvaAbc] = useState("TODAS");
  const [situacao, setSituacao] = useState<"A" | "I" | "TODOS">("A");
  const [diasVenda, setDiasVenda] = useState(30);
  const [diasCobertura, setDiasCobertura] = useState(30);
  const [estoqueBaixo, setEstoqueBaixo] = useState(true);
  const [estoqueZerado, setEstoqueZerado] = useState(false);
  const [comVenda, setComVenda] = useState(false);
  const [semPedido, setSemPedido] = useState(false);
  const [considerarPedidos, setConsiderarPedidos] = useState(true);
  const [selecionados, setSelecionados] = useState<Record<string, ItemSugestao>>({});
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});

  const params = {
    produto: produto || undefined,
    guidCategoria: guidCategoria !== "TODAS" ? guidCategoria : undefined,
    marca: marca || undefined,
    curvaAbc: curvaAbc !== "TODAS" ? curvaAbc : undefined,
    situacao,
    diasVenda,
    diasCobertura,
    estoqueBaixo,
    estoqueZerado,
    comVendaUltimosDias: comVenda,
    semPedidoCompra: semPedido,
    considerarPedidos,
    considerarReservado: false,
  };
  const { data: itens = [], isLoading } = trpc.sugestaoCompra.listar.useQuery(params);
  const { data: categorias = [] } = trpc.categoriasEstoque.listarTodas.useQuery();
  const gerar = trpc.sugestaoCompra.gerar.useMutation({
    onSuccess: () => {
      utils.sugestaoCompra.listar.invalidate();
      toast.success("Solicitação gerada pela sugestão de compra.");
      setSelecionados({});
      setQuantidades({});
    },
    onError: (e) => toast.error(e.message),
  });
  const ignorar = trpc.sugestaoCompra.ignorar.useMutation({
    onSuccess: () => toast.success("Sugestão ignorada."),
    onError: (e) => toast.error(e.message),
  });

  const rows = itens as ItemSugestao[];
  const totalSelecionado = useMemo(() => Object.values(selecionados).reduce((s, item) => {
    const q = Number(quantidades[item.guidProduto] || item.sugestaoCompra);
    return s + q * Number(item.custoMedio || 0);
  }, 0), [selecionados, quantidades]);

  function toggle(item: ItemSugestao) {
    setSelecionados((old) => {
      const next = { ...old };
      if (next[item.guidProduto]) delete next[item.guidProduto];
      else next[item.guidProduto] = item;
      return next;
    });
    setQuantidades((old) => ({ ...old, [item.guidProduto]: old[item.guidProduto] ?? String(item.sugestaoCompra) }));
  }

  function gerarCompra(tipo: "SOLICITACAO" | "COTACAO" | "PEDIDO") {
    const selected = Object.values(selecionados);
    if (!selected.length) { toast.error("Selecione ao menos um produto."); return; }
    gerar.mutate({
      tipo,
      diasVenda,
      diasCobertura,
      considerarPedidos,
      considerarReservado: false,
      observacao: "Origem: Sugestão de Compra",
      itens: selected.map((item) => ({
        guidProduto: item.guidProduto,
        produto: item.PRODUTO,
        codProduto: item.CODPRODUTO,
        guidFornecedor: item.guidFornecedor,
        quantidadeSugerida: Number(item.sugestaoCompra),
        quantidadeAlterada: Number(quantidades[item.guidProduto] || item.sugestaoCompra),
        custoMedio: Number(item.custoMedio || 0),
      })),
    });
  }

  function exportarCsv() {
    const csv = [
      "Produto;Código;Categoria;Fornecedor;Estoque;Mínimo;Máximo;Reposição;Pedido;Média;Sugestão;Custo;Valor;Status",
      ...rows.map((r) => [
        r.PRODUTO, r.CODPRODUTO ?? "", r.categoria ?? "", r.fornecedorPrincipal ?? "",
        r.estoqueAtual, r.estoqueMinimo, r.estoqueMaximo, r.pontoReposicao,
        r.quantidadePedidoCompra, r.mediaVendaDiaria, r.sugestaoCompra,
        r.custoMedio, r.valorEstimado, r.status,
      ].join(";")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "sugestao-compra.csv";
    a.click();
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sugestão de Compra</h1>
          <p className="text-sm text-muted-foreground">Produtos com estoque baixo e previsão de reposição por venda média.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarCsv}><FileDown className="w-4 h-4 mr-2" />Exportar CSV</Button>
          <Button variant="outline" onClick={() => utils.sugestaoCompra.listar.invalidate()}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Produtos sugeridos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{rows.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Selecionados</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{Object.keys(selecionados).length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Valor selecionado</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{moeda(totalSelecionado)}</CardContent></Card>
      </div>

      <Card><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-8 gap-3">
        <div className="space-y-1 xl:col-span-2"><Label className="text-xs">Produto</Label><Input value={produto} onChange={e => setProduto(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Categoria</Label><Select value={guidCategoria} onValueChange={setGuidCategoria}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Todas</SelectItem>{(categorias as Categoria[]).map(c => <SelectItem key={c.guidCategoria} value={c.guidCategoria}>{c.CATEGORIA}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Marca</Label><Input value={marca} onChange={e => setMarca(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">Curva ABC</Label><Select value={curvaAbc} onValueChange={setCurvaAbc}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODAS">Todas</SelectItem><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem><SelectItem value="C">C</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Situação</Label><Select value={situacao} onValueChange={v => setSituacao(v as typeof situacao)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A">Ativos</SelectItem><SelectItem value="I">Inativos</SelectItem><SelectItem value="TODOS">Todos</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-xs">Dias venda</Label><Input type="number" value={diasVenda} onChange={e => setDiasVenda(Number(e.target.value || 30))} /></div>
        <div className="space-y-1"><Label className="text-xs">Cobertura</Label><Input type="number" value={diasCobertura} onChange={e => setDiasCobertura(Number(e.target.value || 30))} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={estoqueBaixo} onChange={e => setEstoqueBaixo(e.target.checked)} />Estoque baixo</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={estoqueZerado} onChange={e => setEstoqueZerado(e.target.checked)} />Zerado</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={comVenda} onChange={e => setComVenda(e.target.checked)} />Com venda</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={semPedido} onChange={e => setSemPedido(e.target.checked)} />Sem pedido</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={considerarPedidos} onChange={e => setConsiderarPedidos(e.target.checked)} />Considerar pedidos</label>
      </CardContent></Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => gerarCompra("SOLICITACAO")} disabled={gerar.isPending}><ShoppingCart className="w-4 h-4 mr-2" />Gerar Solicitação</Button>
        <Button variant="outline" onClick={() => gerarCompra("COTACAO")} disabled={gerar.isPending}>Gerar Cotação</Button>
        <Button variant="outline" onClick={() => gerarCompra("PEDIDO")} disabled={gerar.isPending}>Gerar Pedido</Button>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead></TableHead><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead>Fornecedor</TableHead>
            <TableHead className="text-right">Estoque</TableHead><TableHead className="text-right">Mín/Máx</TableHead><TableHead className="text-right">Pedido</TableHead>
            <TableHead className="text-right">Média</TableHead><TableHead className="text-right">Sugestão</TableHead><TableHead className="text-right">Custo</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={13} className="text-center py-8">Carregando...</TableCell></TableRow>}
            {!isLoading && !rows.length && <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Nenhum produto sugerido.</TableCell></TableRow>}
            {rows.map((item) => {
              const checked = !!selecionados[item.guidProduto];
              const manual = quantidades[item.guidProduto] ?? String(item.sugestaoCompra);
              return <TableRow key={item.guidProduto}>
                <TableCell><input type="checkbox" checked={checked} onChange={() => toggle(item)} /></TableCell>
                <TableCell className="min-w-56"><div className="font-medium">{item.PRODUTO}</div><div className="text-xs text-muted-foreground">Cód. {item.CODPRODUTO ?? "-"} · {item.MARCA ?? "sem marca"}</div></TableCell>
                <TableCell>{item.categoria ?? "-"}</TableCell>
                <TableCell>{item.fornecedorPrincipal ?? "-"}</TableCell>
                <TableCell className="text-right">{qtd(item.estoqueAtual)}</TableCell>
                <TableCell className="text-right">{qtd(item.estoqueMinimo)} / {qtd(item.estoqueMaximo || item.pontoReposicao)}</TableCell>
                <TableCell className="text-right">{qtd(item.quantidadePedidoCompra)}</TableCell>
                <TableCell className="text-right">{qtd(item.mediaVendaDiaria)}</TableCell>
                <TableCell className="text-right"><Input className="w-24 text-right ml-auto" type="number" value={manual} onChange={e => setQuantidades(q => ({ ...q, [item.guidProduto]: e.target.value }))} /></TableCell>
                <TableCell className="text-right">{moeda(item.custoMedio)}</TableCell>
                <TableCell className="text-right">{moeda(Number(manual || 0) * item.custoMedio)}</TableCell>
                <TableCell><Badge variant={item.status === "ZERADO" ? "destructive" : "outline"}>{item.status}</Badge></TableCell>
                <TableCell><Button size="icon" variant="ghost" title="Ignorar" onClick={() => ignorar.mutate({ guidProduto: item.guidProduto, motivo: "Ignorado manualmente" })}><XCircle className="w-4 h-4" /></Button></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

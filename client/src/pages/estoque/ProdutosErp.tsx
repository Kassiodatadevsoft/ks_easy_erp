import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Trash2, Package, RefreshCw, ChevronLeft, ChevronRight
} from "lucide-react";

type Produto = {
  guidProduto: string;
  CODPRODUTO: number;
  PRODUTO: string;
  DESCRICAO: string | null;
  guidCategoria: string | null;
  nomeCategoria: string | null;
  UNIDADE: string;
  UNIDADEFISCAL: string | null;
  CODBARRAS: string | null;
  REFERENCIA: string | null;
  NCM: string | null;
  CEST: string | null;
  CFOP: string | null;
  CSOSN: string | null;
  ALIQICMS: number;
  ALIQPIS: number;
  ALIQCOFINS: number;
  PRECO: number;
  PRECOVENDA: number;
  PRECOMINIMO: number;
  ESTOQUE: number;
  ESTOQUEMINIMO: number;
  TAMANHO1: string | null; TAMANHO2: string | null; TAMANHO3: string | null;
  TAMANHO4: string | null; TAMANHO5: string | null; TAMANHO6: string | null;
  TAMANHO7: string | null;
  FRACIONADO: number;
  SITUACAO: string;
};

const emptyForm = {
  produto: "", descricao: "", guidCategoria: "", unidade: "UN", unidadeFiscal: "",
  codBarras: "", referencia: "", ncm: "", cest: "", cfop: "", csosn: "",
  aliqIcms: 0, aliqPis: 0, aliqCofins: 0,
  preco: 0, precoVenda: 0, precoMinimo: 0,
  estoque: 0, estoqueMinimo: 0,
  tamanho1: "", tamanho2: "", tamanho3: "", tamanho4: "",
  tamanho5: "", tamanho6: "", tamanho7: "",
  fracionado: 0, situacao: "A" as "A" | "I",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}
function fmtQtd(v: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(v ?? 0);
}

export default function ProdutosErp() {
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("A");
  const [guidCategoria, setGuidCategoria] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [open, setOpen] = useState(false);
  const [editGuid, setEditGuid] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.produtosErp.listar.useQuery({
    busca: busca || undefined,
    situacao: situacao || undefined,
    guidCategoria: guidCategoria || undefined,
    page, pageSize,
  });
  const { data: categorias } = trpc.categoriasEstoque.listarTodas.useQuery();

  const criar = trpc.produtosErp.criar.useMutation({
    onSuccess: () => { utils.produtosErp.listar.invalidate(); setOpen(false); toast.success("Produto cadastrado!"); },
    onError: (e) => toast.error(e.message),
  });
  const atualizar = trpc.produtosErp.atualizar.useMutation({
    onSuccess: () => { utils.produtosErp.listar.invalidate(); setOpen(false); toast.success("Produto atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.produtosErp.excluir.useMutation({
    onSuccess: () => { utils.produtosErp.listar.invalidate(); toast.success("Produto excluído!"); },
    onError: (e) => toast.error(e.message),
  });

  const abrirNovo = useCallback(() => {
    setEditGuid(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }, []);

  const abrirEditar = useCallback((p: Produto) => {
    setEditGuid(p.guidProduto);
    setForm({
      produto: p.PRODUTO, descricao: p.DESCRICAO ?? "", guidCategoria: p.guidCategoria ?? "",
      unidade: p.UNIDADE, unidadeFiscal: p.UNIDADEFISCAL ?? "",
      codBarras: p.CODBARRAS ?? "", referencia: p.REFERENCIA ?? "",
      ncm: p.NCM ?? "", cest: p.CEST ?? "", cfop: p.CFOP ?? "", csosn: p.CSOSN ?? "",
      aliqIcms: p.ALIQICMS, aliqPis: p.ALIQPIS, aliqCofins: p.ALIQCOFINS,
      preco: p.PRECO, precoVenda: p.PRECOVENDA, precoMinimo: p.PRECOMINIMO,
      estoque: p.ESTOQUE, estoqueMinimo: p.ESTOQUEMINIMO,
      tamanho1: p.TAMANHO1 ?? "", tamanho2: p.TAMANHO2 ?? "", tamanho3: p.TAMANHO3 ?? "",
      tamanho4: p.TAMANHO4 ?? "", tamanho5: p.TAMANHO5 ?? "", tamanho6: p.TAMANHO6 ?? "",
      tamanho7: p.TAMANHO7 ?? "",
      fracionado: p.FRACIONADO, situacao: p.SITUACAO as "A" | "I",
    });
    setOpen(true);
  }, []);

  const salvar = () => {
    if (!form.produto.trim()) { toast.error("Nome do produto é obrigatório"); return; }
    if (!form.unidade.trim()) { toast.error("Unidade é obrigatória"); return; }
    const payload = {
      ...form,
      guidCategoria: form.guidCategoria || undefined,
      descricao: form.descricao || undefined,
      unidadeFiscal: form.unidadeFiscal || undefined,
      codBarras: form.codBarras || undefined,
      referencia: form.referencia || undefined,
      ncm: form.ncm || undefined,
      cest: form.cest || undefined,
      cfop: form.cfop || undefined,
      csosn: form.csosn || undefined,
      tamanho1: form.tamanho1 || undefined,
      tamanho2: form.tamanho2 || undefined,
      tamanho3: form.tamanho3 || undefined,
      tamanho4: form.tamanho4 || undefined,
      tamanho5: form.tamanho5 || undefined,
      tamanho6: form.tamanho6 || undefined,
      tamanho7: form.tamanho7 || undefined,
    };
    if (editGuid) {
      atualizar.mutate({ ...payload, guidProduto: editGuid });
    } else {
      criar.mutate(payload);
    }
  };

  const totalPages = Math.ceil((data?.total ?? 0) / pageSize);
  const isBusy = criar.isPending || atualizar.isPending;

  const f = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value.toUpperCase() }));
  const fn = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }));

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-muted-foreground text-sm mt-1">Cadastro de produtos do ERP</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" /> Novo Produto
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, código de barras ou referência..."
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={guidCategoria} onValueChange={v => { setGuidCategoria(v === "TODAS" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas categorias</SelectItem>
                {categorias?.map(c => (
                  <SelectItem key={c.guidCategoria} value={c.guidCategoria}>{c.CATEGORIA}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={situacao} onValueChange={v => { setSituacao(v === "TODOS" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="A">Ativos</SelectItem>
                <SelectItem value="I">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => utils.produtosErp.listar.invalidate()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : !data?.items.length ? (
            <div className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-muted-foreground">Nenhum produto encontrado</p>
              <Button className="mt-4" onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Cadastrar primeiro produto</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium">Cód.</th>
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 font-medium">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium">Un.</th>
                    <th className="text-right px-4 py-3 font-medium">Estoque</th>
                    <th className="text-right px-4 py-3 font-medium">Preço Venda</th>
                    <th className="text-center px-4 py-3 font-medium">Situação</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(data.items as Produto[]).map(p => (
                    <tr key={p.guidProduto} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{p.CODPRODUTO}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.PRODUTO}</div>
                        {p.CODBARRAS && <div className="text-xs text-muted-foreground">{p.CODBARRAS}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.nomeCategoria ?? "—"}</td>
                      <td className="px-4 py-3">{p.UNIDADE}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={p.ESTOQUE <= 0 ? "text-red-500 font-semibold" : p.ESTOQUEMINIMO > 0 && p.ESTOQUE < p.ESTOQUEMINIMO ? "text-amber-500 font-semibold" : ""}>
                          {fmtQtd(p.ESTOQUE)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.PRECOVENDA)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.SITUACAO === "A" ? "default" : "secondary"}>
                          {p.SITUACAO === "A" ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm(`Excluir "${p.PRODUTO}"?`)) excluir.mutate({ guidProduto: p.guidProduto }); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total ?? 0} produto(s)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Pág. {page} de {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de cadastro/edição */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editGuid ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="geral">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="tributacao">Tributação</TabsTrigger>
              <TabsTrigger value="estoque">Estoque</TabsTrigger>
              <TabsTrigger value="precos">Preços</TabsTrigger>
            </TabsList>

            {/* Aba Geral */}
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Produto *</Label>
                  <Input value={form.produto} onChange={f("produto")} placeholder="NOME DO PRODUTO" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input value={form.descricao} onChange={f("descricao")} placeholder="DESCRIÇÃO DETALHADA" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={form.guidCategoria || "NENHUMA"} onValueChange={v => setForm(p => ({ ...p, guidCategoria: v === "NENHUMA" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NENHUMA">Sem categoria</SelectItem>
                        {categorias?.map(c => (
                          <SelectItem key={c.guidCategoria} value={c.guidCategoria}>{c.CATEGORIA}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Código de Barras</Label>
                    <Input value={form.codBarras} onChange={f("codBarras")} placeholder="EAN-13 / EAN-8" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Unidade *</Label>
                    <Input value={form.unidade} onChange={f("unidade")} placeholder="UN" maxLength={6} />
                  </div>
                  <div>
                    <Label>Unidade Fiscal</Label>
                    <Input value={form.unidadeFiscal} onChange={f("unidadeFiscal")} placeholder="UN" maxLength={6} />
                  </div>
                  <div>
                    <Label>Referência</Label>
                    <Input value={form.referencia} onChange={f("referencia")} placeholder="REF-001" />
                  </div>
                </div>
                <div>
                  <Label>Tamanhos (até 7 variações)</Label>
                  <div className="grid grid-cols-4 gap-2 mt-1">
                    {[1,2,3,4,5,6,7].map(i => (
                      <Input
                        key={i}
                        value={form[`tamanho${i}` as keyof typeof form] as string}
                        onChange={f(`tamanho${i}`)}
                        placeholder={`TAM ${i}`}
                        maxLength={20}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={form.fracionado === 1}
                      onCheckedChange={v => setForm(p => ({ ...p, fracionado: v ? 1 : 0 }))}
                    />
                    <Label>Produto Fracionado</Label>
                  </div>
                  <div>
                    <Label>Situação</Label>
                    <Select value={form.situacao} onValueChange={v => setForm(p => ({ ...p, situacao: v as "A" | "I" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Ativo</SelectItem>
                        <SelectItem value="I">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Aba Tributação */}
            <TabsContent value="tributacao" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>NCM</Label>
                  <Input value={form.ncm} onChange={f("ncm")} placeholder="0000.00.00" maxLength={10} />
                </div>
                <div>
                  <Label>CEST</Label>
                  <Input value={form.cest} onChange={f("cest")} placeholder="00.000.00" maxLength={10} />
                </div>
                <div>
                  <Label>CFOP</Label>
                  <Input value={form.cfop} onChange={f("cfop")} placeholder="5102" maxLength={5} />
                </div>
                <div>
                  <Label>CSOSN (Simples Nacional)</Label>
                  <Input value={form.csosn} onChange={f("csosn")} placeholder="400" maxLength={4} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Alíq. ICMS (%)</Label>
                  <Input type="number" value={form.aliqIcms} onChange={fn("aliqIcms")} min={0} max={100} step={0.01} />
                </div>
                <div>
                  <Label>Alíq. PIS (%)</Label>
                  <Input type="number" value={form.aliqPis} onChange={fn("aliqPis")} min={0} max={100} step={0.01} />
                </div>
                <div>
                  <Label>Alíq. COFINS (%)</Label>
                  <Input type="number" value={form.aliqCofins} onChange={fn("aliqCofins")} min={0} max={100} step={0.01} />
                </div>
              </div>
            </TabsContent>

            {/* Aba Estoque */}
            <TabsContent value="estoque" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Estoque Atual</Label>
                  <Input type="number" value={form.estoque} onChange={fn("estoque")} step={0.001} />
                  <p className="text-xs text-muted-foreground mt-1">Use movimentações para alterar o estoque após o cadastro inicial</p>
                </div>
                <div>
                  <Label>Estoque Mínimo</Label>
                  <Input type="number" value={form.estoqueMinimo} onChange={fn("estoqueMinimo")} min={0} step={0.001} />
                </div>
              </div>
            </TabsContent>

            {/* Aba Preços */}
            <TabsContent value="precos" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Preço de Custo (R$)</Label>
                  <Input type="number" value={form.preco} onChange={fn("preco")} min={0} step={0.01} />
                </div>
                <div>
                  <Label>Preço de Venda (R$) *</Label>
                  <Input type="number" value={form.precoVenda} onChange={fn("precoVenda")} min={0} step={0.01} />
                </div>
                <div>
                  <Label>Preço Mínimo de Venda (R$)</Label>
                  <Input type="number" value={form.precoMinimo} onChange={fn("precoMinimo")} min={0} step={0.01} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={isBusy}>
              {isBusy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

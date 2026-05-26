import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Scale, TrendingUp, TrendingDown, Wallet, Building2 } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);

function fmt(v: number) { return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`; }

function LinhaBalanco({ label, valor, nivel = 0, destaque = false, cor }: { label: string; valor: number; nivel?: number; destaque?: boolean; cor?: string }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${nivel > 0 ? "pl-" + (nivel * 4) : ""} ${destaque ? "font-semibold border-t border-border mt-1 pt-2" : ""}`}>
      <span className={`text-sm ${destaque ? "font-semibold" : "text-muted-foreground"}`} style={{ paddingLeft: nivel * 16 }}>{label}</span>
      <span className={`text-sm font-mono ${cor ?? (valor >= 0 ? "" : "text-red-600")}`}>{fmt(valor)}</span>
    </div>
  );
}

export default function BalancoPatrimonial() {
  const [dtReferencia, setDtReferencia] = useState(hoje());

  const { data: bp, isLoading } = trpc.balancoPatrimonial.obter.useQuery({ dtReferencia });
  const { data: evolucao = [] } = trpc.balancoPatrimonial.evolucaoMensal.useQuery({ meses: 12 });

  const chartData = evolucao.map((e: { mes: string; resultadoAcumulado: number }) => ({
    mes: e.mes?.slice(0, 7) ?? "",
    resultado: Number(e.resultadoAcumulado) || 0,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Balanço Patrimonial</h1>
          <p className="text-muted-foreground text-sm">Posição financeira da empresa na data de referência</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Data de Referência</Label>
            <Input type="date" value={dtReferencia} onChange={e => setDtReferencia(e.target.value)} className="w-44" />
          </div>
          {bp && (
            <Badge variant={bp.equilibrado ? "default" : "destructive"} className="mt-5">
              {bp.equilibrado ? "Equilibrado" : "Desequilibrado"}
            </Badge>
          )}
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-muted-foreground">Calculando balanço...</div>}

      {bp && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-600" />Total do Ativo</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-blue-600">{fmt(bp.ativo.total)}</p></CardContent>
            </Card>
            <Card className="border-red-500/30 bg-red-500/5">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />Total do Passivo</CardTitle></CardHeader>
              <CardContent><p className="text-xl font-bold text-red-600">{fmt(bp.passivo.total)}</p></CardContent>
            </Card>
            <Card className={`border-${bp.patrimonioLiquido.total >= 0 ? "green" : "orange"}-500/30 bg-${bp.patrimonioLiquido.total >= 0 ? "green" : "orange"}-500/5`}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Scale className="w-4 h-4" />Patrimônio Líquido</CardTitle></CardHeader>
              <CardContent><p className={`text-xl font-bold ${bp.patrimonioLiquido.total >= 0 ? "text-green-600" : "text-orange-600"}`}>{fmt(bp.patrimonioLiquido.total)}</p></CardContent>
            </Card>
            <Card className={`border-${bp.patrimonioLiquido.resultadoExercicio >= 0 ? "green" : "red"}-500/30 bg-${bp.patrimonioLiquido.resultadoExercicio >= 0 ? "green" : "red"}-500/5`}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4" />Resultado do Exercício</CardTitle></CardHeader>
              <CardContent><p className={`text-xl font-bold ${bp.patrimonioLiquido.resultadoExercicio >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(bp.patrimonioLiquido.resultadoExercicio)}</p></CardContent>
            </Card>
          </div>

          {/* Estrutura do Balanço */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ATIVO */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-blue-600"><Building2 className="w-5 h-5" />ATIVO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <LinhaBalanco label="Ativo Circulante" valor={bp.ativo.circulante.total} destaque />
                <LinhaBalanco label="Disponível (Contas Bancárias)" valor={bp.ativo.circulante.disponivel.total} nivel={1} />
                {bp.ativo.circulante.disponivel.contas.map(c => (
                  <LinhaBalanco key={c.guidConta} label={c.nome} valor={c.saldo} nivel={2} cor={c.saldo >= 0 ? "text-green-600" : "text-red-600"} />
                ))}
                <LinhaBalanco label="Contas a Receber" valor={bp.ativo.circulante.contasAReceber.total} nivel={1} />
                <LinhaBalanco label="A vencer" valor={bp.ativo.circulante.contasAReceber.aVencer} nivel={2} cor="text-muted-foreground" />
                <LinhaBalanco label="Vencidas" valor={bp.ativo.circulante.contasAReceber.vencido} nivel={2} cor="text-orange-600" />
                <Separator className="my-2" />
                <LinhaBalanco label="Ativo Não Circulante" valor={bp.ativo.naoCirculante.total} destaque />
                <LinhaBalanco label="Imobilizado (não configurado)" valor={0} nivel={1} cor="text-muted-foreground" />
                <Separator className="my-2" />
                <LinhaBalanco label="TOTAL DO ATIVO" valor={bp.ativo.total} destaque cor="text-blue-600" />
              </CardContent>
            </Card>

            {/* PASSIVO + PL */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-600"><Wallet className="w-5 h-5" />PASSIVO + PATRIMÔNIO LÍQUIDO</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <LinhaBalanco label="Passivo Circulante" valor={bp.passivo.circulante.total} destaque />
                <LinhaBalanco label="Contas a Pagar" valor={bp.passivo.circulante.contasAPagar.total} nivel={1} />
                <LinhaBalanco label="A vencer" valor={bp.passivo.circulante.contasAPagar.aVencer} nivel={2} cor="text-muted-foreground" />
                <LinhaBalanco label="Vencidas" valor={bp.passivo.circulante.contasAPagar.vencido} nivel={2} cor="text-red-600" />
                <Separator className="my-2" />
                <LinhaBalanco label="Passivo Não Circulante" valor={bp.passivo.naoCirculante.total} destaque />
                <LinhaBalanco label="Financiamentos (não configurado)" valor={0} nivel={1} cor="text-muted-foreground" />
                <Separator className="my-2" />
                <LinhaBalanco label="Patrimônio Líquido" valor={bp.patrimonioLiquido.total} destaque cor={bp.patrimonioLiquido.total >= 0 ? "text-green-600" : "text-orange-600"} />
                <LinhaBalanco label="Receitas acumuladas" valor={bp.patrimonioLiquido.totalReceitas} nivel={1} cor="text-green-600" />
                <LinhaBalanco label="Despesas acumuladas" valor={bp.patrimonioLiquido.totalDespesas} nivel={1} cor="text-red-600" />
                <LinhaBalanco label="Resultado do Exercício" valor={bp.patrimonioLiquido.resultadoExercicio} nivel={1} cor={bp.patrimonioLiquido.resultadoExercicio >= 0 ? "text-green-600" : "text-red-600"} />
                <Separator className="my-2" />
                <LinhaBalanco label="TOTAL PASSIVO + PL" valor={bp.totalPassivoMaisPL} destaque cor="text-red-600" />
              </CardContent>
            </Card>
          </div>

          {/* Gráfico de evolução */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução do Resultado Acumulado (12 meses)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Resultado"]} />
                    <Bar dataKey="resultado" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.resultado >= 0 ? "#22c55e" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

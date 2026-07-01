import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useKsAuth } from "@/hooks/useKsAuth";

type ImportacaoLog = {
  codigo: string;
  descricao: string;
  descricaoOriginal?: string;
  descricaoGravada?: string;
  acao: "INSERIDO" | "ATUALIZADO" | "IGNORADO" | "ERRO";
  mensagem: string;
};

type ImportacaoResult = {
  sucesso: boolean;
  mensagem: string;
  totalEncontrados: number;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  ajustados: number;
  logs: ImportacaoLog[];
};

type ImportacaoProgress = {
  tipo: "inicio" | "progresso" | "fim";
  totalEncontrados: number;
  processado: number;
  percentual: number;
  produtoAtual: string;
  codigoAtual: string;
  inseridos: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  ajustados: number;
  log?: ImportacaoLog;
  resultado?: ImportacaoResult;
};

const resumoCards = [
  { key: "totalEncontrados", label: "Produtos encontrados" },
  { key: "inseridos", label: "Produtos inseridos" },
  { key: "atualizados", label: "Produtos atualizados" },
  { key: "ajustados", label: "Produtos ajustados" },
  { key: "erros", label: "Produtos com erro" },
] as const;

function badgeClass(acao: ImportacaoLog["acao"]) {
  switch (acao) {
    case "INSERIDO":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "ATUALIZADO":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "IGNORADO":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "ERRO":
      return "border-red-200 bg-red-50 text-red-700";
  }
}

export default function ImportacaoLinx() {
  const { guidEntidade } = useKsAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ImportacaoResult | null>(null);
  const [progresso, setProgresso] = useState<ImportacaoProgress | null>(null);
  const [loading, setLoading] = useState(false);

  function selecionar(file?: File) {
    setResultado(null);
    setProgresso(null);
    if (!file) {
      setArquivo(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".xml")) {
      toast.error("Selecione um arquivo XML.");
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setArquivo(file);
  }

  async function importar() {
    if (!arquivo) {
      toast.error("Selecione o XML da Linx.");
      return;
    }
    if (!guidEntidade) {
      toast.error("Empresa logada sem GUIDENTIDADE. A importacao foi cancelada.");
      return;
    }

    setLoading(true);
    setResultado(null);
    setProgresso(null);

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("guidEntidade", guidEntidade);

      const response = await fetch("/api/configuracoes/importacao-linx/produtos", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.includes("application/x-ndjson")) {
        const data = (await response.json()) as ImportacaoResult;
        setResultado(data);
        toast.error(data.mensagem || "Falha na importacao.");
        return;
      }

      if (!response.body) {
        toast.error("Servidor nao retornou progresso da importacao.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultadoFinal: ImportacaoResult | null = null;

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as ImportacaoProgress;
        setProgresso(event);
        if (event.tipo === "fim" && event.resultado) {
          resultadoFinal = event.resultado;
          setResultado(event.resultado);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handleLine);
        if (done) break;
      }
      handleLine(buffer);

      const final = resultadoFinal as ImportacaoResult | null;
      if (!final) {
        throw new Error("Importacao finalizada sem resumo do servidor.");
      }

      if (!final.sucesso || final.erros > 0) {
        toast.error(final.mensagem || "Importacao finalizada com erros.");
        return;
      }

      toast.success(final.mensagem || "Importacao finalizada.");
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Erro ao importar XML.";
      setResultado({
        sucesso: false,
        mensagem,
        totalEncontrados: 0,
        inseridos: 0,
        atualizados: 0,
        ignorados: 0,
        erros: 1,
        ajustados: 0,
        logs: [],
      });
      toast.error(mensagem);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Importacao Linx</h1>
        <p className="text-sm text-muted-foreground">
          Importacao de produtos a partir do XML exportado pelo Crystal Reports.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Arquivo XML</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              disabled={loading}
              onChange={(event) => selecionar(event.target.files?.[0])}
            />
          </div>
          <Button onClick={importar} disabled={!arquivo || loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar XML
          </Button>
          {(loading || progresso) && (
            <div className="lg:col-span-2 space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">
                  Importando produto {progresso?.processado ?? 0} de {progresso?.totalEncontrados ?? 0}
                </p>
                <p className="text-sm font-semibold">{progresso?.percentual ?? 0}% concluido</p>
              </div>
              <Progress value={progresso?.percentual ?? 0} />
              <p className="min-h-5 text-sm text-muted-foreground">
                {progresso?.produtoAtual || (loading ? "Lendo produtos do XML..." : "Importacao concluida.")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {resultado && (
        <>
          <Alert variant={resultado.sucesso ? "default" : "destructive"}>
            {resultado.sucesso ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertTitle>{resultado.sucesso ? "Importacao concluida" : "Importacao nao concluida"}</AlertTitle>
            <AlertDescription>{resultado.mensagem}</AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {resumoCards.map((card) => (
              <Card key={card.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{resultado[card.key]}</CardContent>
              </Card>
            ))}
          </div>

          {resultado.ignorados > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Produtos ignorados</AlertTitle>
              <AlertDescription>{resultado.ignorados} produto(s) foram ignorados por dados obrigatorios ausentes.</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileUp className="h-4 w-4" />
                Logs da importacao
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Codigo</TableHead>
                    <TableHead>Descricao original</TableHead>
                    <TableHead>Descricao gravada</TableHead>
                    <TableHead>Acao</TableHead>
                    <TableHead>Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado.logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum log retornado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    resultado.logs.map((log, index) => (
                      <TableRow key={`${log.codigo}-${index}`}>
                        <TableCell className="font-mono text-xs">{log.codigo || "-"}</TableCell>
                        <TableCell className="max-w-[300px] whitespace-normal">{log.descricaoOriginal ?? log.descricao ?? "-"}</TableCell>
                        <TableCell className="max-w-[300px] whitespace-normal">{log.descricaoGravada ?? log.descricao ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeClass(log.acao)}>{log.acao}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[420px] whitespace-normal text-muted-foreground">
                          {log.mensagem || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

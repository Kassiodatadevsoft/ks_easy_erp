import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useKsAuth } from "@/hooks/useKsAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, FileDown, FileImage, FileSpreadsheet, History, ImageOff, Plus, Printer, RefreshCw, Trash2, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Search } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDiaMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const EMPTY = { dtLancamento: hoje(), tipo: "E" as "E"|"S", valor: "", descricao: "", guidConta: "", guidNatureza: "", guidCentro: "", numerodoc: "", observacao: "" };
const TIPOS_COMPROVANTE = ["image/png", "image/jpeg", "image/webp"];
const TAMANHO_MAX_COMPROVANTE = 5 * 1024 * 1024;
type NaturezaOpcao = { guidNatureza: string; NATUREZA?: string; natureza?: string; TIPO?: string; guidConta?: string | null };
type CentroOpcao = { guidCentro: string; CENTRO?: string; centro?: string };
type CaixaFiltro = { guidCaixa: string; numeroCaixa?: number; descricao?: string; situacao?: string };
type OperadorFiltro = { guidOperador: string; nome?: string; usuario?: string };
type FormaPagamentoOpcao = { guidPagamento: string; PAGAMENTO?: string; pagamento?: string };
type LinhaRelatorio = {
  data: string;
  caixa: string;
  operador: string;
  historico: string;
  formaPagamento: string | null;
  comprovanteUrl?: string | null;
  entrada: number;
  saida: number;
  saldo: number;
};
type TotaisForma = {
  formaPagamento: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

const LOGO_RELATORIO = "/logo.png";

function formatarMoeda(valor: number) {
  return Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBr(data?: string) {
  if (!data) return "-";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

function yyyymmdd() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function crc32(data: Uint8Array) {
  let crc = -1;
  for (let idx = 0; idx < data.length; idx += 1) {
    const byte = data[idx];
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function zipStore(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const u16 = (value: number) => [value & 255, (value >>> 8) & 255];
  const u32 = (value: number) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  const push = (arr: number[]) => Uint8Array.from(arr);

  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const local = push([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0),
    ]);
    parts.push(local, name, content);
    const centralHeader = push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(content.length), ...u32(content.length), ...u16(name.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
    ]);
    central.push(centralHeader, name);
    offset += local.length + name.length + content.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = push([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const totalLength = [...parts, ...central, end].reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of [...parts, ...central, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function baixarArquivo(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function LancamentosCaixa() {
  const utils = trpc.useUtils();
  const { user, nomeEmpresa } = useKsAuth();
  const [dtInicio, setDtInicio] = useState(primeiroDiaMes());
  const [dtFim, setDtFim] = useState(hoje());
  const [tipoFiltro, setTipoFiltro] = useState<"E"|"S"|"todos">("todos");
  const [guidCaixaFiltro, setGuidCaixaFiltro] = useState("todos");
  const [guidOperadorFiltro, setGuidOperadorFiltro] = useState("todos");
  const [guidFormaPagamentoFiltro, setGuidFormaPagamentoFiltro] = useState("todos");
  const [situacaoFiltro, setSituacaoFiltro] = useState("todos");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [modalAuditoria, setModalAuditoria] = useState(false);
  const POR_PAGINA = 30;

  const { data: contas = [] } = trpc.contasBancarias.listarTodas.useQuery();
  const { data: naturezas = [] } = trpc.naturezaCaixa.listarTodas.useQuery();
  const { data: centros = [] } = trpc.centroCusto.listarTodos.useQuery();
  const { data: filtrosRelatorio } = trpc.lancamentosCaixa.filtrosRelatorio.useQuery();
  const { data: formasPagamento = [] } = trpc.formasPagamento.listarTodas.useQuery();

  const { data, isLoading } = trpc.lancamentosCaixa.listar.useQuery({
    tipo: tipoFiltro,
    dtInicio,
    dtFim,
    busca: busca || undefined,
    pagina,
    porPagina: POR_PAGINA,
    guidCaixa: guidCaixaFiltro === "todos" ? undefined : guidCaixaFiltro,
    guidOperador: guidOperadorFiltro === "todos" ? undefined : guidOperadorFiltro,
    guidFormaPagamento: guidFormaPagamentoFiltro === "todos" ? undefined : guidFormaPagamentoFiltro,
    situacao: situacaoFiltro === "todos" ? undefined : situacaoFiltro,
  });
  const { data: auditoriaData, isLoading: auditoriaLoading } = trpc.lancamentosCaixa.auditoriaExclusoes.useQuery(
    { pagina: 1, porPagina: 20 },
    { enabled: modalAuditoria },
  );

  const criar = trpc.lancamentosCaixa.criar.useMutation({
    onSuccess: () => { utils.lancamentosCaixa.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Lançamento registrado!"); setModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.lancamentosCaixa.excluir.useMutation({
    onSuccess: () => { utils.lancamentosCaixa.listar.invalidate(); utils.contasBancarias.listar.invalidate(); utils.contasBancarias.listarTodas.invalidate(); toast.success("Lançamento excluído!"); },
    onError: (e) => toast.error(e.message),
    onSettled: () => { utils.lancamentosCaixa.auditoriaExclusoes.invalidate(); },
  });

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const inputComprovanteRef = useRef<HTMLInputElement | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [comprovantePreview, setComprovantePreview] = useState<string | null>(null);
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);
  const [comprovanteGuid, setComprovanteGuid] = useState<string | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState(false);

  const totalPaginas = Math.ceil((data?.total ?? 0) / POR_PAGINA);
  const saldo = (data?.totalEntradas ?? 0) - (data?.totalSaidas ?? 0);
  const tipoNatureza = form.tipo === "E" ? "R" : "D";
  const naturezasFiltradas = (naturezas as NaturezaOpcao[]).filter(n => (n.TIPO ?? tipoNatureza) === tipoNatureza);
  const naturezaSelecionada = naturezasFiltradas.find(n => n.guidNatureza === form.guidNatureza);
  const filtrosExportacao = {
    tipo: tipoFiltro,
    dtInicio,
    dtFim,
    busca: busca || undefined,
    guidCaixa: guidCaixaFiltro === "todos" ? undefined : guidCaixaFiltro,
    guidOperador: guidOperadorFiltro === "todos" ? undefined : guidOperadorFiltro,
    guidFormaPagamento: guidFormaPagamentoFiltro === "todos" ? undefined : guidFormaPagamentoFiltro,
    situacao: situacaoFiltro === "todos" ? undefined : situacaoFiltro,
  };
  const empresaRelatorio = nomeEmpresa ?? user?.fantasia ?? "Empresa logada";
  const filtrosTexto = [
    `Periodo: ${formatarDataBr(dtInicio)} a ${formatarDataBr(dtFim)}`,
    `Tipo: ${tipoFiltro === "E" ? "Entradas" : tipoFiltro === "S" ? "Saidas" : "Todos"}`,
    `Caixa: ${guidCaixaFiltro === "todos" ? "Todos" : ((filtrosRelatorio?.caixas as CaixaFiltro[] | undefined)?.find(c => c.guidCaixa === guidCaixaFiltro)?.descricao ?? guidCaixaFiltro)}`,
    `Operador: ${guidOperadorFiltro === "todos" ? "Todos" : ((filtrosRelatorio?.operadores as OperadorFiltro[] | undefined)?.find(o => o.guidOperador === guidOperadorFiltro)?.nome ?? guidOperadorFiltro)}`,
    `Forma de pagamento: ${guidFormaPagamentoFiltro === "todos" ? "Todas" : ((formasPagamento as FormaPagamentoOpcao[]).find(f => f.guidPagamento === guidFormaPagamentoFiltro)?.PAGAMENTO ?? guidFormaPagamentoFiltro)}`,
    `Situacao: ${situacaoFiltro === "todos" ? "Todas" : situacaoFiltro}`,
    busca ? `Busca: ${busca}` : "",
  ].filter(Boolean);

  function limparComprovante() {
    if (comprovantePreview?.startsWith("blob:")) URL.revokeObjectURL(comprovantePreview);
    setComprovanteFile(null);
    setComprovantePreview(null);
    setComprovanteUrl(null);
    setComprovanteGuid(null);
    if (inputComprovanteRef.current) inputComprovanteRef.current.value = "";
  }

  function prepararNovoLancamento() {
    setForm({ ...EMPTY });
    limparComprovante();
    setModal(true);
  }

  function selecionarComprovante(file: File | null) {
    if (!file) return;
    if (!TIPOS_COMPROVANTE.includes(file.type)) {
      toast.error("Anexe somente imagens PNG, JPG, JPEG ou WEBP.");
      return;
    }
    if (file.size > TAMANHO_MAX_COMPROVANTE) {
      toast.error("A imagem do comprovante deve ter no maximo 5MB.");
      return;
    }
    if (comprovantePreview?.startsWith("blob:")) URL.revokeObjectURL(comprovantePreview);
    setComprovanteFile(file);
    setComprovantePreview(URL.createObjectURL(file));
    setComprovanteUrl(null);
    setComprovanteGuid(comprovanteGuid ?? crypto.randomUUID());
  }

  async function enviarComprovante(guidLancamento: string) {
    if (!comprovanteFile) return comprovanteUrl;
    setEnviandoComprovante(true);
    try {
      const formData = new FormData();
      formData.append("comprovante", comprovanteFile);
      const resp = await fetch(`/api/lancamentos-caixa/comprovante/${guidLancamento}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.message ?? "Falha ao enviar comprovante.");
      setComprovanteUrl(json.url);
      return json.url as string;
    } finally {
      setEnviandoComprovante(false);
    }
  }

  async function salvar() {
    if (!form.descricao.trim()) { toast.error("Informe a descrição."); return; }
    const valor = parseFloat(form.valor);
    if (!valor || valor <= 0) { toast.error("Informe um valor válido."); return; }
    if (!form.guidConta) { toast.error("Selecione a conta/caixa."); return; }
    if (!form.guidNatureza) { toast.error("Selecione a natureza de caixa."); return; }
    if (!form.guidCentro) { toast.error("Selecione o centro de custo."); return; }
    if (!naturezaSelecionada?.guidConta) { toast.error("A natureza precisa estar vinculada ao plano de contas."); return; }
    try {
      const guidLancamento = comprovanteGuid ?? crypto.randomUUID();
      const url = await enviarComprovante(guidLancamento);
      await criar.mutateAsync({
        dtLancamento: form.dtLancamento, tipo: form.tipo, valor, descricao: form.descricao,
        guidConta: form.guidConta, guidNatureza: form.guidNatureza, guidCentro: form.guidCentro,
        numerodoc: form.numerodoc || null, observacao: form.observacao || null,
        comprovanteUrl: url ?? null,
        guidLancamento,
      });
      limparComprovante();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o lancamento.");
    }
  }

  function confirmarExclusao(l: { guidLancamento: string; DESCRICAO?: string; origem?: string | null; guidVenda?: string | null }) {
    const origem = String(l.origem ?? (l.guidVenda ? "VENDA" : "FINANCEIRO")).toUpperCase();
    const avisoVenda = origem === "VENDA" || Boolean(l.guidVenda)
      ? "Este lancamento foi gerado por venda e sera bloqueado. Cancele a venda para desfazer o movimento financeiro.\n\n"
      : "";
    const motivo = prompt(`${avisoVenda}Informe o motivo da exclusao para auditoria:`, "");
    if (motivo === null) return;
    excluir.mutate({ guidLancamento: l.guidLancamento, motivo: motivo.trim() || null });
  }

  function resumoAuditoria(valorAnterior: string | null | undefined) {
    if (!valorAnterior) return "Sem detalhes do lancamento.";
    try {
      const parsed = JSON.parse(valorAnterior) as { DESCRICAO?: string; VALOR?: number; TIPO?: string; DTLANCAMENTO?: string; NUMERODOC?: string | null };
      const tipo = parsed.TIPO === "S" ? "Saida" : "Entrada";
      const valor = Number(parsed.VALOR ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return `${parsed.DTLANCAMENTO ?? "-"} - ${tipo} - ${parsed.DESCRICAO ?? "-"} - ${valor}${parsed.NUMERODOC ? ` - Doc ${parsed.NUMERODOC}` : ""}`;
    } catch {
      return valorAnterior.slice(0, 180);
    }
  }

  async function buscarDadosRelatorio() {
    const relatorio = await utils.lancamentosCaixa.relatorioMovimentacaoCaixa.fetch(filtrosExportacao);
    if ((relatorio.dados ?? []).length === 0) {
      toast.warning("Nenhum dado encontrado para os filtros informados.");
    }
    return relatorio as {
      dados: LinhaRelatorio[];
      totaisPorForma: TotaisForma[];
      totalEntradas: number;
      totalSaidas: number;
      saldoGeral: number;
    };
  }

  function htmlRelatorio(relatorio: Awaited<ReturnType<typeof buscarDadosRelatorio>>) {
    const emitidoEm = new Date().toLocaleString("pt-BR");
    const usuario = user?.nome ?? user?.usuario ?? "Usuario logado";
    const linhas = relatorio.dados.map((linha) => `
      <tr>
        <td>${escapeHtml(formatarDataBr(linha.data))}</td>
        <td>${escapeHtml(linha.caixa)}</td>
        <td>${escapeHtml(linha.operador)}</td>
        <td>${escapeHtml(linha.historico)}</td>
        <td>${escapeHtml(linha.formaPagamento ?? "Sem forma informada")}</td>
        <td>${linha.comprovanteUrl ? "Sim" : "Nao"}</td>
        <td class="num">${escapeHtml(formatarMoeda(linha.entrada))}</td>
        <td class="num">${escapeHtml(formatarMoeda(linha.saida))}</td>
        <td class="num">${escapeHtml(formatarMoeda(linha.saldo))}</td>
      </tr>`).join("");
    const comprovantes = relatorio.dados.filter((linha) => linha.comprovanteUrl).map((linha) => `
      <div class="receipt">
        <div><strong>${escapeHtml(formatarDataBr(linha.data))}</strong> - ${escapeHtml(linha.historico)}</div>
        <img src="${escapeHtml(linha.comprovanteUrl)}" alt="Comprovante do lancamento" />
      </div>`).join("");
    const totaisForma = relatorio.totaisPorForma.map((total) => `
      <tr>
        <td>${escapeHtml(total.formaPagamento)}</td>
        <td class="num">${escapeHtml(formatarMoeda(total.entradas))}</td>
        <td class="num">${escapeHtml(formatarMoeda(total.saidas))}</td>
        <td class="num">${escapeHtml(formatarMoeda(total.saldo))}</td>
      </tr>`).join("");

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>relatorio_movimentacao_caixa_${yyyymmdd()}</title>
  <style>
    @page { size: A4; margin: 18mm 10mm 20mm; }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
    .report { padding: 0 0 18mm; }
    .top { align-items: flex-start; display: grid; grid-template-columns: 150px 1fr 220px; gap: 12px; margin-bottom: 12px; }
    .logo { height: 38px; object-fit: contain; object-position: left center; width: 130px; }
    .company { text-align: right; line-height: 1.45; font-size: 10px; }
    .title { text-align: center; }
    .title h1 { font-size: 18px; margin: 0 0 4px; text-transform: uppercase; }
    .title p { color: #4b5563; margin: 0; }
    .filters { border: 1px solid #d1d5db; border-radius: 4px; color: #374151; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 14px; margin: 10px 0 12px; padding: 8px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #f3f4f6; color: #111827; font-size: 10px; text-align: left; text-transform: uppercase; }
    th, td { border: 1px solid #d1d5db; padding: 5px 6px; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-top: 12px; page-break-inside: avoid; }
    .receipts { margin-top: 14px; page-break-before: auto; }
    .receipts h2 { font-size: 13px; margin: 0 0 8px; }
    .receipt { border: 1px solid #d1d5db; margin-bottom: 10px; padding: 8px; page-break-inside: avoid; }
    .receipt img { display: block; max-height: 260px; max-width: 100%; object-fit: contain; margin-top: 6px; }
    .total-geral { align-items: center; display: flex; gap: 16px; justify-content: flex-end; margin-top: 10px; font-weight: 700; }
    .footer { align-items: center; border-top: 1px solid #d1d5db; bottom: 0; display: grid; grid-template-columns: 120px 1fr 230px; gap: 8px; left: 0; padding-top: 6px; position: fixed; right: 0; }
    .footer img { height: 24px; object-fit: contain; object-position: left center; width: 95px; }
    .footer-center { font-weight: 700; text-align: center; }
    .footer-right { font-size: 9px; line-height: 1.45; text-align: right; }
    .page::after { content: counter(page) " / " counter(pages); }
  </style>
</head>
<body>
  <main class="report">
    <section class="top">
      <img class="logo" src="${LOGO_RELATORIO}" alt="DataDev" />
      <div class="title">
        <h1>Relatorio de Movimentacao de Caixa</h1>
        <p>${escapeHtml(formatarDataBr(dtInicio))} a ${escapeHtml(formatarDataBr(dtFim))}</p>
      </div>
      <div class="company">
        <strong>${escapeHtml(empresaRelatorio)}</strong><br />
        ${escapeHtml(user?.entDocumento ?? user?.documento ?? "")}<br />
        GUIDENTIDADE: ${escapeHtml(user?.guidEntidade ?? "")}
      </div>
    </section>
    <section class="filters">
      ${filtrosTexto.map((filtro) => `<div>${escapeHtml(filtro)}</div>`).join("")}
    </section>
    <table>
      <thead>
        <tr>
          <th>Data</th><th>Caixa</th><th>Operador</th><th>Historico</th><th>Forma de pagamento</th><th>Comprovante</th>
          <th class="num">Entrada</th><th class="num">Saida</th><th class="num">Saldo</th>
        </tr>
      </thead>
      <tbody>${linhas || `<tr><td colspan="9">Nenhum dado encontrado.</td></tr>`}</tbody>
    </table>
    ${comprovantes ? `<section class="receipts"><h2>Comprovantes anexados</h2>${comprovantes}</section>` : ""}
    <section class="totals">
      <h2 style="font-size: 13px; margin: 0 0 6px;">Totais por forma de pagamento</h2>
      <table>
        <thead><tr><th>Forma de pagamento</th><th class="num">Entradas</th><th class="num">Saidas</th><th class="num">Saldo</th></tr></thead>
        <tbody>${totaisForma || `<tr><td colspan="4">Sem totais por forma de pagamento.</td></tr>`}</tbody>
      </table>
      <div class="total-geral">
        <span>Entradas: ${escapeHtml(formatarMoeda(relatorio.totalEntradas))}</span>
        <span>Saidas: ${escapeHtml(formatarMoeda(relatorio.totalSaidas))}</span>
        <span>Saldo geral: ${escapeHtml(formatarMoeda(relatorio.saldoGeral))}</span>
      </div>
    </section>
  </main>
  <footer class="footer">
    <img src="${LOGO_RELATORIO}" alt="DataDev" />
    <div class="footer-center">Gerado pela empresa Data Consultoria e desenvolvimento de software | datadevsoft.com.br | Whatsapp (94) 98156-9059</div>
    <div class="footer-right">
      Usuario: ${escapeHtml(usuario)}<br />
      Emissao: ${escapeHtml(emitidoEm)}<br />
      Pagina: <span class="page"></span>
    </div>
  </footer>
</body>
</html>`;
  }

  async function imprimirRelatorio() {
    const relatorio = await buscarDadosRelatorio();
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) {
      toast.error("Nao foi possivel abrir a janela de impressao.");
      return;
    }
    win.document.open();
    win.document.write(htmlRelatorio(relatorio));
    win.document.close();
    win.focus();
    win.onload = () => win.print();
  }

  async function exportarPdf() {
    const relatorio = await buscarDadosRelatorio();
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) {
      toast.error("Nao foi possivel abrir a janela de PDF.");
      return;
    }
    win.document.open();
    win.document.write(htmlRelatorio(relatorio));
    win.document.close();
    win.focus();
    toast.info(`Use salvar como PDF com o nome relatorio_movimentacao_caixa_${yyyymmdd()}.pdf.`);
    win.onload = () => win.print();
  }

  function cellRef(col: number, row: number) {
    let name = "";
    let n = col;
    while (n > 0) {
      const mod = (n - 1) % 26;
      name = String.fromCharCode(65 + mod) + name;
      n = Math.floor((n - mod) / 26);
    }
    return `${name}${row}`;
  }

  function sheetRow(rowIndex: number, values: Array<string | number>, header = false) {
    const cells = values.map((value, index) => {
      const ref = cellRef(index + 1, rowIndex);
      if (typeof value === "number") return `<c r="${ref}" s="${header ? 1 : 2}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${header ? 1 : 0}"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex}">${cells}</row>`;
  }

  async function exportarExcel() {
    const relatorio = await buscarDadosRelatorio();
    let row = 1;
    const rows: string[] = [];
    rows.push(sheetRow(row++, [empresaRelatorio], true));
    rows.push(sheetRow(row++, ["Relatorio de Movimentacao de Caixa"], true));
    for (const filtro of filtrosTexto) rows.push(sheetRow(row++, [filtro]));
    row += 1;
    rows.push(sheetRow(row++, ["Data", "Caixa", "Operador", "Historico", "Forma de pagamento", "Comprovante", "Entrada", "Saida", "Saldo"], true));
    for (const linha of relatorio.dados) {
      rows.push(sheetRow(row++, [
        formatarDataBr(linha.data),
        linha.caixa,
        linha.operador,
        linha.historico,
        linha.formaPagamento ?? "Sem forma informada",
        linha.comprovanteUrl ? "Sim" : "Nao",
        Number(linha.entrada ?? 0),
        Number(linha.saida ?? 0),
        Number(linha.saldo ?? 0),
      ]));
    }
    row += 1;
    rows.push(sheetRow(row++, ["Totais por forma de pagamento"], true));
    rows.push(sheetRow(row++, ["Forma de pagamento", "Entradas", "Saidas", "Saldo"], true));
    for (const total of relatorio.totaisPorForma) {
      rows.push(sheetRow(row++, [total.formaPagamento, total.entradas, total.saidas, total.saldo]));
    }
    row += 1;
    rows.push(sheetRow(row++, ["Total Entradas", relatorio.totalEntradas], true));
    rows.push(sheetRow(row++, ["Total Saidas", relatorio.totalSaidas], true));
    rows.push(sheetRow(row++, ["Saldo Geral", relatorio.saldoGeral], true));

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="5" width="28" customWidth="1"/><col min="6" max="8" width="14" customWidth="1"/></cols>
  <sheetData>${rows.join("")}</sheetData>
</worksheet>`;
    const files = [
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Movimentacao Caixa" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>` },
      { name: "xl/worksheets/sheet1.xml", content: sheet },
    ];
    baixarArquivo(`relatorio_movimentacao_caixa_${yyyymmdd()}.xlsx`, new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lançamentos de Caixa</h1>
          <p className="text-muted-foreground text-sm">Entradas e saídas financeiras diretas</p>
        </div>
        <Button onClick={prepararNovoLancamento}><Plus className="w-4 h-4 mr-2" />Novo Lançamento</Button>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" />Entradas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-green-600">R$ {(data?.totalEntradas ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" />Saídas</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold text-red-600">R$ {(data?.totalSaidas ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
        <Card className={`border-${saldo >= 0 ? "blue" : "orange"}-500/30 bg-${saldo >= 0 ? "blue" : "orange"}-500/5`}>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Wallet className="w-4 h-4" />Saldo do Período</CardTitle></CardHeader>
          <CardContent><p className={`text-xl font-bold ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}>R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <Button variant="outline" onClick={() => setModalAuditoria(true)}>
          <History className="w-4 h-4 mr-2" />
          Historico de exclusoes
        </Button>
        <div className="space-y-1">
          <Label className="text-xs">Data Início</Label>
          <Input type="date" value={dtInicio} onChange={e => { setDtInicio(e.target.value); setPagina(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data Fim</Label>
          <Input type="date" value={dtFim} onChange={e => { setDtFim(e.target.value); setPagina(1); }} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipoFiltro} onValueChange={v => { setTipoFiltro(v as "E"|"S"|"todos"); setPagina(1); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="E">Entradas</SelectItem>
              <SelectItem value="S">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Caixa</Label>
          <Select value={guidCaixaFiltro} onValueChange={v => { setGuidCaixaFiltro(v); setPagina(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {((filtrosRelatorio?.caixas ?? []) as CaixaFiltro[]).map(c => (
                <SelectItem key={c.guidCaixa} value={c.guidCaixa}>{c.descricao ?? `Caixa ${c.numeroCaixa ?? ""}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Operador</Label>
          <Select value={guidOperadorFiltro} onValueChange={v => { setGuidOperadorFiltro(v); setPagina(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {((filtrosRelatorio?.operadores ?? []) as OperadorFiltro[]).map(o => (
                <SelectItem key={o.guidOperador} value={o.guidOperador}>{o.nome ?? o.usuario ?? "Operador"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Forma de pagamento</Label>
          <Select value={guidFormaPagamentoFiltro} onValueChange={v => { setGuidFormaPagamentoFiltro(v); setPagina(1); }}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {(formasPagamento as FormaPagamentoOpcao[]).map(f => (
                <SelectItem key={f.guidPagamento} value={f.guidPagamento}>{f.PAGAMENTO ?? f.pagamento ?? "Forma de pagamento"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Situacao</Label>
          <Select value={situacaoFiltro} onValueChange={v => { setSituacaoFiltro(v); setPagina(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {((filtrosRelatorio?.situacoes ?? []) as { valor: string; descricao: string }[]).map(s => (
                <SelectItem key={s.valor} value={s.valor}>{s.descricao}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Busca</Label>
            <Input value={buscaInput} onChange={e => setBuscaInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (setBusca(buscaInput), setPagina(1))} placeholder="Descrição ou doc..." className="w-48" />
          </div>
          <Button variant="outline" onClick={() => { setBusca(buscaInput); setPagina(1); }}><Search className="w-4 h-4 mr-2" />Pesquisar</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={imprimirRelatorio}><Printer className="w-4 h-4 mr-2" />Imprimir</Button>
          <Button variant="outline" onClick={exportarPdf}><FileDown className="w-4 h-4 mr-2" />Exportar PDF</Button>
          <Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="w-4 h-4 mr-2" />Exportar Excel</Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Comprovante</TableHead>
                <TableHead>Nº Doc</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && (data?.dados ?? []).length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum lançamento no período.</TableCell></TableRow>}
              {(data?.dados ?? []).map(l => (
                <TableRow key={l.guidLancamento}>
                  <TableCell className="text-sm">{new Date(l.DTLANCAMENTO).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant={l.TIPO === "E" ? "default" : "destructive"} className="text-xs">
                      {l.TIPO === "E" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{l.DESCRICAO}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.nomeConta ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.nomeNatureza ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={l.origem === "VENDA" || l.guidVenda ? "secondary" : "outline"} className="text-xs">
                      {l.origem === "VENDA" || l.guidVenda ? "Venda" : "Financeiro"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {l.comprovanteUrl ? (
                      <a href={l.comprovanteUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver</a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nao</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.NUMERODOC ?? "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${l.TIPO === "E" ? "text-green-600" : "text-red-600"}`}>
                    {l.TIPO === "S" ? "- " : "+ "}R$ {Number(l.VALOR).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirmarExclusao(l)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data?.total ?? 0} lançamentos</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="px-2 py-1">{pagina}/{totalPaginas}</span>
            <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Lançamento de Caixa</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.dtLancamento} onChange={e => setForm(f => ({ ...f, dtLancamento: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as "E"|"S", guidNatureza: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E">Entrada</SelectItem>
                  <SelectItem value="S">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value.toUpperCase() }))} placeholder="Descrição do lançamento" />
            </div>
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Nº Documento</Label>
              <Input value={form.numerodoc} onChange={e => setForm(f => ({ ...f, numerodoc: e.target.value }))} placeholder="NF, recibo..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Conta/Caixa *</Label>
              <Select value={form.guidConta} onValueChange={v => setForm(f => ({ ...f, guidConta: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta/caixa" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => <SelectItem key={c.guidConta} value={c.guidConta}>{c.CONTA}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Natureza de Caixa *</Label>
              <Select value={form.guidNatureza} onValueChange={v => setForm(f => ({ ...f, guidNatureza: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {naturezasFiltradas.map(n => <SelectItem key={n.guidNatureza} value={n.guidNatureza}>{n.NATUREZA ?? n.natureza}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.guidNatureza && !naturezaSelecionada?.guidConta && (
                <p className="text-xs text-destructive">Vincule esta natureza a uma conta do plano de contas.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Centro de Custo *</Label>
              <Select value={form.guidCentro} onValueChange={v => setForm(f => ({ ...f, guidCentro: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(centros as CentroOpcao[]).map(c => <SelectItem key={c.guidCentro} value={c.guidCentro}>{c.CENTRO ?? c.centro}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm">
              <p className="font-medium text-blue-300">Regra contabil automatica</p>
              <p className="mt-1 text-muted-foreground">A conta/caixa movimenta o saldo financeiro; a natureza define a conta do plano de contas para os relatórios contábeis.</p>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observações adicionais" />
            </div>
            <div className="col-span-2 space-y-2 rounded-lg border bg-muted/20 p-3">
              <Label className="flex items-center gap-2">
                <FileImage className="h-4 w-4" />
                Comprovante
              </Label>
              <input
                ref={inputComprovanteRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => selecionarComprovante(e.target.files?.[0] ?? null)}
              />
              {!comprovantePreview && (
                <Button type="button" variant="outline" onClick={() => inputComprovanteRef.current?.click()}>
                  <FileImage className="h-4 w-4 mr-2" />
                  Anexar imagem do comprovante
                </Button>
              )}
              {comprovantePreview && (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-md border bg-background">
                    <img src={comprovantePreview} alt="Preview do comprovante" className="max-h-56 w-full object-contain" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => inputComprovanteRef.current?.click()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Trocar imagem
                    </Button>
                    <Button type="button" variant="outline" onClick={limparComprovante}>
                      <ImageOff className="h-4 w-4 mr-2" />
                      Remover imagem
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">PNG, JPG, JPEG ou WEBP ate 5MB. O lancamento pode ser salvo sem comprovante.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending || enviandoComprovante}>
              {criar.isPending || enviandoComprovante ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalAuditoria} onOpenChange={setModalAuditoria}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historico de exclusoes de lancamentos
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3">
            {auditoriaLoading && <p className="text-sm text-muted-foreground py-6 text-center">Carregando historico...</p>}
            {!auditoriaLoading && (auditoriaData?.dados ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum registro de exclusao encontrado.</p>
            )}
            {(auditoriaData?.dados ?? []).map((item) => (
              <div key={item.guidAuditoria} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {item.acao === "EXCLUSAO_BLOQUEADA_VENDA" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      <p className="text-sm font-semibold">
                        {item.acao === "EXCLUSAO_BLOQUEADA_VENDA" ? "Exclusao bloqueada" : "Lancamento excluido"}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">{resumoAuditoria(item.valorAnterior)}</p>
                  </div>
                  <Badge variant={item.acao === "EXCLUSAO_BLOQUEADA_VENDA" ? "secondary" : "destructive"} className="text-[10px]">
                    {item.identificacao ?? "Sem documento"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>Data: {item.dataHora}</span>
                  <span>Usuario: {item.nomeUsuario ?? item.usuario ?? "Nao identificado"}</span>
                  <span>Motivo: {item.observacao ?? "Sem motivo informado"}</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAuditoria(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

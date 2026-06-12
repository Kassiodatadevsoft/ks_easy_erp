import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, X, Search, UserCheck, AlertCircle } from "lucide-react";

interface Props {
  guidPessoa: string | null;
  onClose: (salvo?: boolean, guidPessoa?: string) => void;
}

interface FormData {
  nome: string;
  fantasia: string;
  documento: string;
  codTipoDocumento: "F" | "J";
  telefone: string;
  celular: string;
  whatsapp: string;
  email: string;
  ie: string;
  indIeDest: number;
  dataNascimento: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  codCidade: number | null;
  descCidade: string;
  limiteCompra: number;
  diaVencimento: number;
  situacao: "A" | "I" | "B";
  manterPromocoes: boolean;
  cadUsuario: boolean;
  cadFornecedor: boolean;
  constaSpc: boolean;
  observacao: string;
}

const INITIAL: FormData = {
  nome: "", fantasia: "", documento: "", codTipoDocumento: "J",
  telefone: "", celular: "", whatsapp: "", email: "",
  ie: "", indIeDest: 9, dataNascimento: "",
  cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  codCidade: null, descCidade: "",
  limiteCompra: 0, diaVencimento: 0,
  situacao: "A",
  manterPromocoes: false, cadUsuario: false, cadFornecedor: false, constaSpc: false,
  observacao: "",
};

// ── Validação de CPF ──────────────────────────────────────────────────────────
function validarCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

// ── Validação de CNPJ ─────────────────────────────────────────────────────────
function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let sum = 0;
    let pos = n - 7;
    for (let i = n; i >= 1; i--) {
      sum += parseInt(d[n - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
}

function applyMask(value: string, tipo: "F" | "J") {
  const d = value.replace(/\D/g, "");
  if (tipo === "F") {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2}).*/, "$1.$2.$3-$4").slice(0, 14);
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5").slice(0, 18);
}

function applyCepMask(v: string) {
  return v.replace(/\D/g, "").replace(/(\d{5})(\d{3}).*/, "$1-$2").slice(0, 9);
}

function applyPhoneMask(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{4}).*/, "($1) $2-$3").slice(0, 14);
  return d.replace(/(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3").slice(0, 15);
}

// ── Componente de campo com erro ──────────────────────────────────────────────
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {msg}
    </p>
  );
}

export default function ClienteForm({ guidPessoa, onClose }: Props) {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [activeTab, setActiveTab] = useState("dados");
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [cidadeResultados, setCidadeResultados] = useState<{ CODCIDADE: number; DESCCIDADE: string }[]>([]);
  const [showCidades, setShowCidades] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [docDuplicado, setDocDuplicado] = useState<{ nome: string; codigo: number } | null>(null);
  const cidadeRef = useRef<HTMLDivElement>(null);
  const isEdicao = Boolean(guidPessoa);

  // Fechar dropdown de cidades ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (cidadeRef.current && !cidadeRef.current.contains(e.target as Node)) {
        setShowCidades(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Carregar dados para edição
  const { data: clienteData, isLoading: loadingCliente } = trpc.clientes.buscarPorGuid.useQuery(
    { guidPessoa: guidPessoa! },
    { enabled: isEdicao }
  );

  // Buscar cidades
  const buscarCidadesQuery = trpc.clientes.buscarCidades.useQuery(
    { nome: cidadeBusca },
    { enabled: cidadeBusca.length >= 2 }
  );

  const criarMutation = trpc.clientes.criar.useMutation();
  const atualizarMutation = trpc.clientes.atualizar.useMutation();

  useEffect(() => {
    if (clienteData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = clienteData as any;
      setForm({
        nome: c.NOME ?? "",
        fantasia: c.FANTASIA ?? "",
        documento: c.DOCUMENTO ?? "",
        codTipoDocumento: c.CODTIPODOCUMENTO === "F" ? "F" : "J",
        telefone: c.TELEFONE ?? "",
        celular: c.CELULAR ?? "",
        whatsapp: c.WHATSAPP ?? "",
        email: c.EMAIL ?? "",
        ie: c.IE ?? "",
        indIeDest: c.INDIEDEST ?? 9,
        dataNascimento: c.DATANASCIMENTO ? String(c.DATANASCIMENTO).slice(0, 10) : "",
        cep: c.CEP ?? "",
        endereco: c.ENDERECO ?? "",
        numero: c.NUMERO ?? "",
        complemento: c.COMPLEMENTO ?? "",
        bairro: c.BAIRRO ?? "",
        codCidade: c.CODCIDADE ?? null,
        descCidade: c.DESCCIDADE ?? "",
        limiteCompra: parseFloat(c.LIMITECOMPRA ?? 0),
        diaVencimento: c.DIAVENCIMENTO ?? 0,
        situacao: c.SITUACAO ?? "A",
        manterPromocoes: Boolean(c.MANTERPROMOCOES),
        cadUsuario: Boolean(c.CADUSUARIO),
        cadFornecedor: Boolean(c.CADFORNECEDOR),
        constaSpc: Boolean(c.CONSTASPC),
        observacao: c.OBSERVACAO ?? "",
      });
    }
  }, [clienteData]);

  useEffect(() => {
    if (buscarCidadesQuery.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCidadeResultados(buscarCidadesQuery.data as any);
    }
  }, [buscarCidadesQuery.data]);

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }, []);

  const handleDocChange = (v: string) => {
    const masked = applyMask(v, form.codTipoDocumento);
    set("documento", masked);
    setDocDuplicado(null);
  };

  const handleTipoChange = (v: "F" | "J") => {
    setForm(f => ({ ...f, codTipoDocumento: v, documento: "" }));
    setErrors(e => ({ ...e, documento: undefined }));
    setDocDuplicado(null);
  };

  // Buscar CNPJ na BrasilAPI
  const buscarCnpj = async () => {
    const cnpj = form.documento.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast.error("Informe um CNPJ válido antes de buscar.");
      return;
    }
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      setForm(f => ({
        ...f,
        nome: data.razao_social ?? f.nome,
        fantasia: data.nome_fantasia || data.razao_social?.slice(0, 15) || "",
        telefone: data.ddd_telefone_1 ? applyPhoneMask(data.ddd_telefone_1) : f.telefone,
        cep: data.cep ? applyCepMask(data.cep) : f.cep,
        endereco: `${data.descricao_tipo_de_logradouro ?? ""} ${data.logradouro ?? ""}`.trim(),
        numero: data.numero ?? f.numero,
        complemento: data.complemento ?? f.complemento,
        bairro: data.bairro ?? f.bairro,
      }));
      toast.success("Dados do CNPJ carregados com sucesso!");
    } catch {
      toast.error("Não foi possível buscar o CNPJ. Verifique e tente novamente.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  // ── Validação idêntica ao Delphi ─────────────────────────────────────────────
  const validate = (): { ok: boolean; tab?: string } => {
    const e: Partial<Record<keyof FormData, string>> = {};

    // 1. Documento — mínimo 10 chars (como no Delphi: Length < 10)
    const docLimpo = form.documento.replace(/\D/g, "");
    if (docLimpo.length < 10) {
      e.documento = "Informe o documento!";
    } else if (form.codTipoDocumento === "F" && !validarCPF(form.documento)) {
      e.documento = "CPF inválido!";
    } else if (form.codTipoDocumento === "J" && !validarCNPJ(form.documento)) {
      e.documento = "CNPJ inválido!";
    }

    // 2. Nome
    if (!form.nome.trim()) e.nome = "Informe o Nome!";

    // 3. Celular — mínimo 11 dígitos (como no Delphi: Length < 11)
    const celLimpo = form.celular.replace(/\D/g, "");
    if (celLimpo.length < 11) e.celular = "Informe o número validado para o celular!";

    setErrors(e);

    // Verificar campos de endereço separadamente
    const eEnd: Partial<Record<keyof FormData, string>> = {};
    if (form.cep.replace(/\D/g, "").length < 8) eEnd.cep = "Informe o CEP!";
    if (!form.endereco.trim()) eEnd.endereco = "Informe o Endereço!";
    if (!form.numero.trim()) eEnd.numero = "Informe o Número!";
    if (!form.bairro.trim()) eEnd.bairro = "Informe o Bairro!";
    if (!form.descCidade.trim() || !form.codCidade) eEnd.descCidade = "Informe a Cidade!";

    if (Object.keys(e).length > 0) {
      setErrors(prev => ({ ...prev, ...e }));
      return { ok: false, tab: "dados" };
    }
    if (Object.keys(eEnd).length > 0) {
      setErrors(prev => ({ ...prev, ...eEnd }));
      return { ok: false, tab: "endereco" };
    }

    return { ok: true };
  };

  const handleSalvar = async () => {
    const { ok, tab } = validate();
    if (!ok) {
      if (tab) setActiveTab(tab);
      toast.error("Corrija os campos obrigatórios antes de salvar.");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      fantasia: form.fantasia.trim() || undefined,
      documento: form.documento,
      codTipoDocumento: form.codTipoDocumento,
      telefone: form.telefone.replace(/\D/g, "") || undefined,
      celular: form.celular.replace(/\D/g, ""),
      whatsapp: form.whatsapp.replace(/\D/g, "") || undefined,
      email: form.email.trim() || undefined,
      ie: form.ie.trim() || undefined,
      indIeDest: form.indIeDest,
      dataNascimento: form.dataNascimento || undefined,
      cep: form.cep.replace(/\D/g, ""),
      endereco: form.endereco.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || undefined,
      bairro: form.bairro.trim(),
      codCidade: form.codCidade!,
      limiteCompra: form.limiteCompra < 0 ? 0 : form.limiteCompra,
      diaVencimento: form.diaVencimento,
      situacao: form.situacao,
      manterPromocoes: form.manterPromocoes,
      cadUsuario: form.cadUsuario,
      cadFornecedor: form.cadFornecedor,
      constaSpc: form.constaSpc,
      observacao: form.observacao.trim() || undefined,
    };

    try {
      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidPessoa: guidPessoa!, ...payload });
        toast.success("Alterado com sucesso.");
        onClose(true, guidPessoa!);
      } else {
        const result = await criarMutation.mutateAsync(payload);
        toast.success("Cadastrado com sucesso.");
        onClose(true, result.guidPessoa);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar cliente";
      // Verificar se é erro de documento duplicado
      if (msg.toLowerCase().includes("documento") || msg.toLowerCase().includes("duplicate")) {
        setErrors(prev => ({ ...prev, documento: "Documento já cadastrado para outro cliente!" }));
        setActiveTab("dados");
        toast.error("Documento já cadastrado para outro cliente!");
      } else {
        toast.error(msg);
      }
    }
  };

  const isSaving = criarMutation.isPending || atualizarMutation.isPending;

  // Contar erros por aba para mostrar badge
  const errDados = ["documento", "nome", "celular"].filter(k => errors[k as keyof FormData]).length;
  const errEndereco = ["cep", "endereco", "numero", "bairro", "descCidade"].filter(k => errors[k as keyof FormData]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdicao ? "Editar Cliente" : "Novo Cliente"}
              </h2>
              <p className="text-xs text-gray-400">KS0002.KS00001 — CADCLIENTE = 1</p>
            </div>
          </div>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingCliente ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-5 w-full grid grid-cols-3">
                <TabsTrigger value="dados" className="relative">
                  Dados Gerais
                  {errDados > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {errDados}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="endereco" className="relative">
                  Endereço
                  {errEndereco > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {errEndereco}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              </TabsList>

              {/* ══ ABA: DADOS GERAIS ══ */}
              <TabsContent value="dados" className="space-y-4 mt-0">

                {/* Documento duplicado */}
                {docDuplicado && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Documento já cadastrado: <strong>{docDuplicado.nome}</strong> (Cód. {docDuplicado.codigo})
                  </div>
                )}

                {/* Tipo + Documento */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Tipo de Pessoa <span className="text-red-500">*</span>
                    </Label>
                    <Select value={form.codTipoDocumento} onValueChange={v => handleTipoChange(v as "F" | "J")}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="F">Física (CPF)</SelectItem>
                        <SelectItem value="J">Jurídica (CNPJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {form.codTipoDocumento === "F" ? "CPF" : "CNPJ"} <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={form.documento}
                        onChange={e => handleDocChange(e.target.value)}
                        placeholder={form.codTipoDocumento === "F" ? "000.000.000-00" : "00.000.000/0000-00"}
                        className={errors.documento ? "border-red-400 focus-visible:ring-red-400" : ""}
                      />
                      {form.codTipoDocumento === "J" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={buscarCnpj}
                          disabled={buscandoCnpj}
                          className="shrink-0 gap-1"
                          title="Buscar dados do CNPJ"
                        >
                          {buscandoCnpj
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Search className="w-4 h-4" />}
                          <span className="hidden sm:inline text-xs">Buscar</span>
                        </Button>
                      )}
                    </div>
                    <FieldError msg={errors.documento} />
                  </div>
                </div>

                {/* Nome + Fantasia */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Nome / Razão Social <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.nome ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.nome}
                      onChange={e => set("nome", e.target.value.toUpperCase())}
                      placeholder="NOME COMPLETO OU RAZÃO SOCIAL"
                    />
                    <FieldError msg={errors.nome} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Fantasia / Apelido
                    </Label>
                    <Input
                      className="mt-1"
                      value={form.fantasia}
                      onChange={e => set("fantasia", e.target.value.toUpperCase())}
                      placeholder="NOME FANTASIA"
                    />
                  </div>
                </div>

                {/* Contatos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Telefone</Label>
                    <Input
                      className="mt-1"
                      value={form.telefone}
                      onChange={e => set("telefone", applyPhoneMask(e.target.value))}
                      placeholder="(00) 0000-0000"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Celular <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.celular ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.celular}
                      onChange={e => set("celular", applyPhoneMask(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                    <FieldError msg={errors.celular} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">WhatsApp</Label>
                    <Input
                      className="mt-1"
                      value={form.whatsapp}
                      onChange={e => set("whatsapp", applyPhoneMask(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">E-mail</Label>
                    <Input
                      className="mt-1"
                      type="email"
                      value={form.email}
                      onChange={e => set("email", e.target.value)}
                      placeholder="email@exemplo.com.br"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Data de Nascimento
                    </Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={form.dataNascimento}
                      onChange={e => set("dataNascimento", e.target.value)}
                    />
                  </div>
                </div>

                {/* IE + Indicador */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Indicador IE
                    </Label>
                    <Select value={String(form.indIeDest)} onValueChange={v => set("indIeDest", Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Contribuinte ICMS</SelectItem>
                        <SelectItem value="2">2 — Isento</SelectItem>
                        <SelectItem value="9">9 — Não Contribuinte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Inscrição Estadual
                    </Label>
                    <Input
                      className="mt-1"
                      value={form.ie}
                      onChange={e => set("ie", e.target.value.toUpperCase())}
                      placeholder="SOMENTE NÚMEROS"
                    />
                  </div>
                </div>

                {/* Situação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Situação</Label>
                    <Select value={form.situacao} onValueChange={v => set("situacao", v as "A" | "I" | "B")}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Ativo</SelectItem>
                        <SelectItem value="I">Inativo</SelectItem>
                        <SelectItem value="B">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 pb-1">
                  {[
                    { key: "manterPromocoes" as const, label: "Manter Promoções" },
                    { key: "cadUsuario" as const, label: "Também é Usuário" },
                    { key: "cadFornecedor" as const, label: "Também é Fornecedor" },
                    { key: "constaSpc" as const, label: "Consta no SPC" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <Checkbox
                        id={key}
                        checked={form[key] as boolean}
                        onCheckedChange={v => set(key, Boolean(v))}
                      />
                      <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{label}</span>
                    </label>
                  ))}
                </div>

                {/* Observação */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={3}
                    value={form.observacao}
                    onChange={e => set("observacao", e.target.value.toUpperCase())}
                    placeholder="OBSERVAÇÕES SOBRE O CLIENTE..."
                  />
                </div>
              </TabsContent>

              {/* ══ ABA: ENDEREÇO ══ */}
              <TabsContent value="endereco" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      CEP <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.cep ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.cep}
                      onChange={e => set("cep", applyCepMask(e.target.value))}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    <FieldError msg={errors.cep} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Endereço <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.endereco ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.endereco}
                      onChange={e => set("endereco", e.target.value.toUpperCase())}
                      placeholder="RUA, AVENIDA, ETC."
                    />
                    <FieldError msg={errors.endereco} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Número <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.numero ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.numero}
                      onChange={e => set("numero", e.target.value.toUpperCase())}
                      placeholder="S/N OU NÚMERO"
                    />
                    <FieldError msg={errors.numero} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Complemento</Label>
                    <Input
                      className="mt-1"
                      value={form.complemento}
                      onChange={e => set("complemento", e.target.value.toUpperCase())}
                      placeholder="APTO, SALA, BLOCO..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Bairro <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.bairro ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.bairro}
                      onChange={e => set("bairro", e.target.value.toUpperCase())}
                      placeholder="BAIRRO"
                    />
                    <FieldError msg={errors.bairro} />
                  </div>

                  {/* Cidade com autocomplete */}
                  <div ref={cidadeRef} className="relative">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Cidade <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.descCidade ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.descCidade || cidadeBusca}
                      onChange={e => {
                        const v = e.target.value;
                        setCidadeBusca(v);
                        set("descCidade", v);
                        set("codCidade", null);
                        setShowCidades(true);
                      }}
                      placeholder="Digite para buscar cidade..."
                      onFocus={() => { if (cidadeBusca.length >= 2) setShowCidades(true); }}
                    />
                    <FieldError msg={errors.descCidade} />

                    {/* Dropdown de cidades */}
                    {showCidades && cidadeResultados.length > 0 && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 max-h-52 overflow-y-auto">
                        {buscarCidadesQuery.isFetching && (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
                          </div>
                        )}
                        {cidadeResultados.map(c => (
                          <button
                            key={c.CODCIDADE}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              set("codCidade", c.CODCIDADE);
                              set("descCidade", c.DESCCIDADE);
                              setCidadeBusca("");
                              setShowCidades(false);
                              setErrors(prev => ({ ...prev, descCidade: undefined }));
                            }}
                          >
                            {c.DESCCIDADE}
                          </button>
                        ))}
                      </div>
                    )}
                    {showCidades && cidadeBusca.length >= 2 && cidadeResultados.length === 0 && !buscarCidadesQuery.isFetching && (
                      <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-xl mt-1 px-3 py-2 text-sm text-gray-400">
                        Nenhuma cidade encontrada
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ══ ABA: FINANCEIRO ══ */}
              <TabsContent value="financeiro" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Limite de Compra (R$)
                    </Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.limiteCompra}
                      onChange={e => set("limiteCompra", Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                    <p className="text-xs text-gray-400 mt-1">0 = sem limite definido</p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Dia de Vencimento
                    </Label>
                    <Select value={String(form.diaVencimento)} onValueChange={v => set("diaVencimento", Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sem vencimento fixo</SelectItem>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                          <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-1">Tabela de Preço e Rota</p>
                  <p className="text-xs text-amber-700">
                    Esses campos serão implementados em breve. Por enquanto, configure-os diretamente no sistema Delphi.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
          <p className="text-xs text-gray-400">
            <span className="text-red-500">*</span> Campos obrigatórios
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onClose()} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={isSaving || loadingCliente}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
              ) : (
                isEdicao ? "Salvar Alterações" : "Cadastrar Cliente"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

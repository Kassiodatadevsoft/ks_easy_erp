import { useState, useEffect, useRef } from "react";
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
import { Loader2, X, Search, Truck, AlertCircle } from "lucide-react";

interface Props {
  guidPessoa: string | null;
  onClose: (salvo?: boolean) => void;
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
  cadCliente: boolean;   // "Também é Cliente"
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
  manterPromocoes: false, cadUsuario: false, cadCliente: false, constaSpc: false,
  observacao: "",
};

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
  if (tipo === "F") return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2}).*/, "$1.$2.$3-$4").slice(0, 14);
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

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {msg}
    </p>
  );
}

export default function FornecedorForm({ guidPessoa, onClose }: Props) {
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (cidadeRef.current && !cidadeRef.current.contains(e.target as Node)) {
        setShowCidades(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: fornecedorData, isLoading: loadingFornecedor } = trpc.fornecedores.buscarPorGuid.useQuery(
    { guidPessoa: guidPessoa! },
    { enabled: isEdicao }
  );

  const buscarCidadesQuery = trpc.fornecedores.buscarCidades.useQuery(
    { nome: cidadeBusca },
    { enabled: cidadeBusca.length >= 2 }
  );

  const criarMutation = trpc.fornecedores.criar.useMutation();
  const atualizarMutation = trpc.fornecedores.atualizar.useMutation();

  useEffect(() => {
    if (fornecedorData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = fornecedorData as any;
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
        cadCliente: Boolean(c.CADCLIENTE),
        constaSpc: Boolean(c.CONSTASPC),
        observacao: c.OBSERVACAO ?? "",
      });
    }
  }, [fornecedorData]);

  useEffect(() => {
    if (buscarCidadesQuery.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCidadeResultados((buscarCidadesQuery.data as any[]).map((r: any) => ({
        CODCIDADE: r.CODCIDADE,
        DESCCIDADE: r.DESCCIDADE,
      })));
    }
  }, [buscarCidadesQuery.data]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const handleTipoChange = (tipo: "F" | "J") => {
    setForm(prev => ({ ...prev, codTipoDocumento: tipo, documento: "" }));
    setErrors(prev => ({ ...prev, documento: undefined }));
    setDocDuplicado(null);
  };

  const handleDocChange = (value: string) => {
    const masked = applyMask(value, form.codTipoDocumento);
    set("documento", masked);
    setDocDuplicado(null);
  };

  const buscarCnpj = async () => {
    const cnpj = form.documento.replace(/\D/g, "");
    if (cnpj.length !== 14) { toast.error("CNPJ inválido."); return; }
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        nome: data.razao_social ?? prev.nome,
        fantasia: data.nome_fantasia ?? prev.fantasia,
        telefone: applyPhoneMask(data.ddd_telefone_1 ?? prev.telefone),
        email: data.email ?? prev.email,
        cep: applyCepMask(data.cep ?? prev.cep),
        endereco: data.logradouro ?? prev.endereco,
        numero: data.numero ?? prev.numero,
        complemento: data.complemento ?? prev.complemento,
        bairro: data.bairro ?? prev.bairro,
      }));
      toast.success("Dados do CNPJ preenchidos!");
    } catch {
      toast.error("Não foi possível buscar o CNPJ.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const validate = (): { ok: boolean; tab?: string } => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    const docLimpo = form.documento.replace(/\D/g, "");

    if (docLimpo.length < 10) {
      errs.documento = "Documento deve ter no mínimo 10 dígitos.";
    } else if (form.codTipoDocumento === "F" && !validarCPF(docLimpo)) {
      errs.documento = "CPF inválido.";
    } else if (form.codTipoDocumento === "J" && !validarCNPJ(docLimpo)) {
      errs.documento = "CNPJ inválido.";
    }

    if (!form.nome.trim()) errs.nome = "Nome é obrigatório.";
    const celLimpo = form.celular.replace(/\D/g, "");
    if (celLimpo.length < 11) errs.celular = "Celular deve ter no mínimo 11 dígitos.";

    const cepLimpo = form.cep.replace(/\D/g, "");
    if (cepLimpo.length < 8) errs.cep = "CEP deve ter 8 dígitos.";
    if (!form.endereco.trim()) errs.endereco = "Endereço é obrigatório.";
    if (!form.numero.trim()) errs.numero = "Número é obrigatório.";
    if (!form.bairro.trim()) errs.bairro = "Bairro é obrigatório.";
    if (!form.codCidade) errs.descCidade = "Cidade é obrigatória.";

    setErrors(errs);
    if (Object.keys(errs).length === 0) return { ok: true };

    const dadosErros = ["documento", "nome", "celular"];
    const enderecoErros = ["cep", "endereco", "numero", "bairro", "descCidade"];
    if (dadosErros.some(k => errs[k as keyof FormData])) return { ok: false, tab: "dados" };
    if (enderecoErros.some(k => errs[k as keyof FormData])) return { ok: false, tab: "endereco" };
    return { ok: false };
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
      cadCliente: form.cadCliente,
      constaSpc: form.constaSpc,
      observacao: form.observacao.trim() || undefined,
    };

    try {
      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidPessoa: guidPessoa!, ...payload });
        toast.success("Fornecedor alterado com sucesso.");
      } else {
        await criarMutation.mutateAsync(payload);
        toast.success("Fornecedor cadastrado com sucesso.");
      }
      onClose(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar fornecedor";
      if (msg.toLowerCase().includes("documento") || msg.toLowerCase().includes("duplicate")) {
        setErrors(prev => ({ ...prev, documento: "Documento já cadastrado para outro registro!" }));
        setActiveTab("dados");
        toast.error("Documento já cadastrado!");
      } else {
        toast.error(msg);
      }
    }
  };

  const isSaving = criarMutation.isPending || atualizarMutation.isPending;

  const errDados = ["documento", "nome", "celular"].filter(k => errors[k as keyof FormData]).length;
  const errEndereco = ["cep", "endereco", "numero", "bairro", "descCidade"].filter(k => errors[k as keyof FormData]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center shadow">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdicao ? "Editar Fornecedor" : "Novo Fornecedor"}
              </h2>
              <p className="text-xs text-gray-400">KS0002.KS00001 — CADFORNECEDOR = 1</p>
            </div>
          </div>
          <button
            onClick={() => onClose()}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        {loadingFornecedor ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="dados" className="relative flex-1">
                  Dados Gerais
                  {errDados > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {errDados}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="endereco" className="relative flex-1">
                  Endereço
                  {errEndereco > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {errEndereco}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="financeiro" className="flex-1">Financeiro</TabsTrigger>
              </TabsList>

              {/* ABA: DADOS GERAIS */}
              <TabsContent value="dados" className="space-y-4 mt-0">

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
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                        <Button type="button" variant="outline" size="sm" onClick={buscarCnpj} disabled={buscandoCnpj} className="shrink-0 gap-1">
                          {buscandoCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
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
                      onChange={e => set("nome", e.target.value)}
                      placeholder="Nome completo ou Razão Social"
                    />
                    <FieldError msg={errors.nome} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Fantasia / Apelido</Label>
                    <Input className="mt-1" value={form.fantasia} onChange={e => set("fantasia", e.target.value)} placeholder="Nome fantasia" />
                  </div>
                </div>

                {/* Contatos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Telefone</Label>
                    <Input className="mt-1" value={form.telefone} onChange={e => set("telefone", applyPhoneMask(e.target.value))} placeholder="(00) 0000-0000" />
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
                    <Input className="mt-1" value={form.whatsapp} onChange={e => set("whatsapp", applyPhoneMask(e.target.value))} placeholder="(00) 00000-0000" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">E-mail</Label>
                    <Input className="mt-1" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com.br" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Data de Nascimento / Fundação</Label>
                    <Input className="mt-1" type="date" value={form.dataNascimento} onChange={e => set("dataNascimento", e.target.value)} />
                  </div>
                </div>

                {/* IE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Inscrição Estadual</Label>
                    <Input className="mt-1" value={form.ie} onChange={e => set("ie", e.target.value)} placeholder="Inscrição Estadual" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Indicador IE Destinatário</Label>
                    <Select value={String(form.indIeDest)} onValueChange={v => set("indIeDest", Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Contribuinte ICMS</SelectItem>
                        <SelectItem value="2">2 - Contribuinte Isento</SelectItem>
                        <SelectItem value="9">9 - Não Contribuinte</SelectItem>
                      </SelectContent>
                    </Select>
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

                {/* Checkboxes — CADCLIENTE no lugar de CADFORNECEDOR */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 pb-1">
                  {[
                    { key: "manterPromocoes" as const, label: "Manter Promoções" },
                    { key: "cadUsuario" as const, label: "Também é Usuário" },
                    { key: "cadCliente" as const, label: "Também é Cliente" },
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
                    onChange={e => set("observacao", e.target.value)}
                    placeholder="Observações sobre o fornecedor..."
                  />
                </div>
              </TabsContent>

              {/* ABA: ENDEREÇO */}
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
                      onChange={e => set("endereco", e.target.value)}
                      placeholder="Rua, Avenida, etc."
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
                      onChange={e => set("numero", e.target.value)}
                      placeholder="S/N ou número"
                    />
                    <FieldError msg={errors.numero} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Complemento</Label>
                    <Input className="mt-1" value={form.complemento} onChange={e => set("complemento", e.target.value)} placeholder="Apto, Sala, etc." />
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
                      onChange={e => set("bairro", e.target.value)}
                      placeholder="Bairro"
                    />
                    <FieldError msg={errors.bairro} />
                  </div>
                  <div ref={cidadeRef} className="relative">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Cidade <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.descCidade ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.descCidade || cidadeBusca}
                      onChange={e => {
                        setCidadeBusca(e.target.value);
                        set("descCidade", e.target.value);
                        set("codCidade", null);
                        setShowCidades(true);
                      }}
                      onFocus={() => { if (cidadeBusca.length >= 2) setShowCidades(true); }}
                      placeholder="Digite para buscar..."
                    />
                    <FieldError msg={errors.descCidade} />
                    {showCidades && cidadeResultados.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {cidadeResultados.map(c => (
                          <button
                            key={c.CODCIDADE}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors"
                            onClick={() => {
                              set("codCidade", c.CODCIDADE);
                              set("descCidade", c.DESCCIDADE);
                              setCidadeBusca("");
                              setShowCidades(false);
                            }}
                          >
                            {c.DESCCIDADE}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ABA: FINANCEIRO */}
              <TabsContent value="financeiro" className="space-y-4 mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Limite de Compra (R$)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.limiteCompra}
                      onChange={e => set("limiteCompra", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Dia de Vencimento</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      max={31}
                      value={form.diaVencimento}
                      onChange={e => set("diaVencimento", parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <Button variant="outline" onClick={() => onClose()} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={isSaving}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 min-w-[120px]"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSaving ? "Salvando..." : isEdicao ? "Salvar Alterações" : "Cadastrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

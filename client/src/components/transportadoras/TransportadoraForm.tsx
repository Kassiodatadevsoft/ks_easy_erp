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
  cadCliente: boolean;
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
  manterPromocoes: false, cadCliente: false, cadFornecedor: false, constaSpc: false,
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

export default function TransportadoraForm({ guidPessoa, onClose }: Props) {
  const isEdicao = Boolean(guidPessoa);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [activeTab, setActiveTab] = useState("dados");
  const [isSaving, setIsSaving] = useState(false);
  const [docDuplicado, setDocDuplicado] = useState<string | null>(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [cidadeResultados, setCidadeResultados] = useState<{ CODCIDADE: number; DESCCIDADE: string }[]>([]);
  const [showCidades, setShowCidades] = useState(false);
  const cidadeRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();

  const transportadoraQuery = trpc.transportadoras.buscarPorGuid.useQuery(
    { guidPessoa: guidPessoa! },
    { enabled: isEdicao }
  );

  const buscarCidadesQuery = trpc.transportadoras.buscarCidades.useQuery(
    { busca: cidadeBusca },
    { enabled: cidadeBusca.length >= 2 }
  );

  const criarMutation = trpc.transportadoras.criar.useMutation({
    onSuccess: () => {
      utils.transportadoras.listar.invalidate();
      toast.success("Transportadora cadastrada com sucesso!");
      onClose(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.transportadoras.atualizar.useMutation({
    onSuccess: () => {
      utils.transportadoras.listar.invalidate();
      toast.success("Transportadora atualizada com sucesso!");
      onClose(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const validarDocQuery = trpc.transportadoras.validarDocumento.useQuery(
    { documento: form.documento.replace(/\D/g, ""), guidPessoaAtual: guidPessoa ?? undefined },
    { enabled: form.documento.replace(/\D/g, "").length >= 11 }
  );

  useEffect(() => {
    if (validarDocQuery.data?.duplicado) {
      setDocDuplicado(validarDocQuery.data.nome ?? "outra transportadora");
    } else {
      setDocDuplicado(null);
    }
  }, [validarDocQuery.data]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEffect(() => {
    if (transportadoraQuery.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = transportadoraQuery.data as any;
      const toDate = (v: unknown) => v ? new Date(v as string).toISOString().slice(0, 10) : "";
      setForm({
        nome: c.NOME ?? "",
        fantasia: c.FANTASIA ?? "",
        documento: applyMask(c.DOCUMENTO ?? "", c.CODTIPODOCUMENTO === "F" ? "F" : "J"),
        codTipoDocumento: c.CODTIPODOCUMENTO === "F" ? "F" : "J",
        telefone: applyPhoneMask(c.TELEFONE ?? ""),
        celular: applyPhoneMask(c.CELULAR ?? ""),
        whatsapp: applyPhoneMask(c.WHATSAPP ?? ""),
        email: c.EMAIL ?? "",
        ie: c.IE ?? "",
        indIeDest: c.INDIEDEST ?? 9,
        dataNascimento: toDate(c.DATANASCIMENTO),
        cep: applyCepMask(c.CEP ?? ""),
        endereco: c.ENDERECO ?? "",
        numero: c.NUMERO ?? "",
        complemento: c.COMPLEMENTO ?? "",
        bairro: c.BAIRRO ?? "",
        codCidade: c.CODCIDADE ?? null,
        descCidade: c.CIDADE ? `${c.CIDADE} - ${c.UF}` : "",
        limiteCompra: parseFloat(c.LIMITECOMPRA ?? 0),
        diaVencimento: c.DIAVENCIMENTO ?? 0,
        situacao: c.SITUACAO ?? "A",
        manterPromocoes: Boolean(c.MANTERPROMOCOES),
        cadCliente: Boolean(c.CADCLIENTE),
        cadFornecedor: Boolean(c.CADFORNECEDOR),
        constaSpc: Boolean(c.CONSTASPC),
        observacao: c.OBSERVACAO ?? "",
      });
    }
  }, [transportadoraQuery.data]);

  useEffect(() => {
    if (buscarCidadesQuery.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCidadeResultados((buscarCidadesQuery.data as any[]).map((r: any) => ({
        CODCIDADE: r.CODCIDADE,
        DESCCIDADE: `${r.CIDADE} - ${r.UF}`,
      })));
    }
  }, [buscarCidadesQuery.data]);

  // Fechar dropdown de cidades ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cidadeRef.current && !cidadeRef.current.contains(e.target as Node)) {
        setShowCidades(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        nome: (data.razao_social ?? prev.nome).toUpperCase(),
        fantasia: (data.nome_fantasia ?? prev.fantasia).toUpperCase(),
        telefone: applyPhoneMask(data.ddd_telefone_1 ?? prev.telefone),
        email: (data.email ?? prev.email).toUpperCase(),
        cep: applyCepMask(data.cep ?? prev.cep),
        endereco: (data.logradouro ?? prev.endereco).toUpperCase(),
        numero: (data.numero ?? prev.numero).toUpperCase(),
        complemento: (data.complemento ?? prev.complemento).toUpperCase(),
        bairro: (data.bairro ?? prev.bairro).toUpperCase(),
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
    if (docDuplicado) errs.documento = `Documento já cadastrado: ${docDuplicado}`;
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
      limiteCompra: form.limiteCompra,
      diaVencimento: form.diaVencimento,
      situacao: form.situacao,
      manterPromocoes: form.manterPromocoes,
      cadCliente: form.cadCliente,
      cadFornecedor: form.cadFornecedor,
      constaSpc: form.constaSpc,
      observacao: form.observacao.trim() || undefined,
    };
    setIsSaving(true);
    try {
      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidPessoa: guidPessoa!, ...payload });
      } else {
        await criarMutation.mutateAsync(payload);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isEdicao && transportadoraQuery.isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <Truck className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEdicao ? "Editar Transportadora" : "Nova Transportadora"}
              </h2>
              <p className="text-xs text-gray-500">KS0002.KS00001 — CADTRANSPORTADORA = 1</p>
            </div>
          </div>
          <button
            onClick={() => onClose()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="dados">Dados Gerais</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
                <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              </TabsList>

              {/* ABA: DADOS GERAIS */}
              <TabsContent value="dados" className="space-y-4 mt-0">
                {/* Tipo de Pessoa */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de Pessoa</Label>
                    <Select value={form.codTipoDocumento} onValueChange={(v) => handleTipoChange(v as "F" | "J")}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="J">Jurídica (CNPJ)</SelectItem>
                        <SelectItem value="F">Física (CPF)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Situação</Label>
                    <Select value={form.situacao} onValueChange={(v) => set("situacao", v as "A" | "I" | "B")}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Ativo</SelectItem>
                        <SelectItem value="I">Inativo</SelectItem>
                        <SelectItem value="B">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Documento */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {form.codTipoDocumento === "J" ? "CNPJ" : "CPF"} <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      className={`flex-1 ${errors.documento || docDuplicado ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.documento}
                      onChange={e => handleDocChange(e.target.value)}
                      placeholder={form.codTipoDocumento === "J" ? "00.000.000/0000-00" : "000.000.000-00"}
                    />
                    {form.codTipoDocumento === "J" && (
                      <Button type="button" variant="outline" size="sm" onClick={buscarCnpj} disabled={buscandoCnpj} className="shrink-0">
                        {buscandoCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                  <FieldError msg={errors.documento} />
                  {docDuplicado && !errors.documento && (
                    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Documento já cadastrado: {docDuplicado}
                    </p>
                  )}
                </div>

                {/* Nome / Fantasia */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {form.codTipoDocumento === "J" ? "Razão Social" : "Nome"} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 ${errors.nome ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.nome}
                      onChange={e => set("nome", e.target.value.toUpperCase())}
                      placeholder="NOME COMPLETO"
                    />
                    <FieldError msg={errors.nome} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {form.codTipoDocumento === "J" ? "Nome Fantasia" : "Apelido"}
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
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Celular <span className="text-red-500">*</span></Label>
                    <Input
                      className={`mt-1 ${errors.celular ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.celular}
                      onChange={e => set("celular", applyPhoneMask(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                    <FieldError msg={errors.celular} />
                  </div>
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
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">WhatsApp</Label>
                    <Input
                      className="mt-1"
                      value={form.whatsapp}
                      onChange={e => set("whatsapp", applyPhoneMask(e.target.value))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                {/* Email / IE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">E-mail</Label>
                    <Input
                      className="mt-1"
                      type="email"
                      value={form.email}
                      onChange={e => set("email", e.target.value.toUpperCase())}
                      placeholder="EMAIL@EXEMPLO.COM"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Inscrição Estadual</Label>
                    <Input
                      className="mt-1"
                      value={form.ie}
                      onChange={e => set("ie", e.target.value.toUpperCase())}
                      placeholder="IE OU ISENTO"
                    />
                  </div>
                </div>

                {/* Indicador IE / Data Nascimento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Indicador IE</Label>
                    <Select value={String(form.indIeDest)} onValueChange={v => set("indIeDest", Number(v))}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Contribuinte ICMS</SelectItem>
                        <SelectItem value="2">Contribuinte Isento</SelectItem>
                        <SelectItem value="9">Não Contribuinte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {form.codTipoDocumento === "J" ? "Data de Fundação" : "Data de Nascimento"}
                    </Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={form.dataNascimento}
                      onChange={e => set("dataNascimento", e.target.value)}
                    />
                  </div>
                </div>

                {/* Checkboxes */}
                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.cadCliente} onCheckedChange={v => set("cadCliente", Boolean(v))} />
                    <span className="text-sm text-gray-700">Também é Cliente</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.cadFornecedor} onCheckedChange={v => set("cadFornecedor", Boolean(v))} />
                    <span className="text-sm text-gray-700">Também é Fornecedor</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={form.constaSpc} onCheckedChange={v => set("constaSpc", Boolean(v))} />
                    <span className="text-sm text-gray-700">Consta no SPC</span>
                  </label>
                </div>

                {/* Observação */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={3}
                    value={form.observacao}
                    onChange={e => set("observacao", e.target.value.toUpperCase())}
                    placeholder="OBSERVAÇÕES SOBRE A TRANSPORTADORA..."
                  />
                </div>
              </TabsContent>

              {/* ABA: ENDEREÇO */}
              <TabsContent value="endereco" className="space-y-4 mt-0">
                {/* CEP */}
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
                      placeholder="000"
                    />
                    <FieldError msg={errors.numero} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Complemento</Label>
                    <Input
                      className="mt-1"
                      value={form.complemento}
                      onChange={e => set("complemento", e.target.value.toUpperCase())}
                      placeholder="APTO, SALA, ETC."
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
                      placeholder="DIGITE PARA BUSCAR..."
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
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Limite de Crédito (R$)</Label>
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
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox checked={form.manterPromocoes} onCheckedChange={v => set("manterPromocoes", Boolean(v))} />
                  <span className="text-sm text-gray-700">Manter Promoções</span>
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

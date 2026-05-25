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
import { toast } from "sonner";
import {
  Loader2, X, Search, UserCog, AlertCircle,
  CheckCircle2, XCircle, Eye, EyeOff,
} from "lucide-react";

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
  situacao: "A" | "I" | "B";
  observacao: string;
  // Cargo — obrigatório
  codCargo: number | null;
  // Acesso ao sistema
  usuario: string;
  senha: string;
}

const INITIAL: FormData = {
  nome: "", fantasia: "", documento: "", codTipoDocumento: "F",
  telefone: "", celular: "", whatsapp: "", email: "",
  ie: "", indIeDest: 9, dataNascimento: "",
  cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  codCidade: null, descCidade: "",
  situacao: "A",
  observacao: "",
  codCargo: null,
  usuario: "",
  senha: "",
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
    let sum = 0; let pos = n - 7;
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
      <AlertCircle className="w-3 h-3 shrink-0" />{msg}
    </p>
  );
}

export function FuncionarioForm({ guidPessoa, onClose }: Props) {
  const isEdicao = Boolean(guidPessoa);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [activeTab, setActiveTab] = useState("dados");
  const [docDuplicado, setDocDuplicado] = useState<{ codigo: number; nome: string } | null>(null);
  const [cidadeBusca, setCidadeBusca] = useState("");
  const [cidadeResultados, setCidadeResultados] = useState<{ CODCIDADE: number; DESCCIDADE: string }[]>([]);
  const [showCidades, setShowCidades] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [usuarioStatus, setUsuarioStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [usuarioTakenNome, setUsuarioTakenNome] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const cidadeRef = useRef<HTMLDivElement>(null);
  const usuarioDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Queries
  const { data: funcionarioData, isLoading: loadingFuncionario } = trpc.funcionarios.buscarPorGuid.useQuery(
    { guidPessoa: guidPessoa! },
    { enabled: isEdicao && Boolean(guidPessoa) }
  );
  const { data: cargosData } = trpc.funcionarios.listarCargos.useQuery();
  const buscarCidadesQuery = trpc.funcionarios.buscarCidades.useQuery(
    { nome: cidadeBusca },
    { enabled: cidadeBusca.trim().length >= 2 }
  );
  const validarDocQuery = trpc.funcionarios.validarDocumento.useQuery(
    { documento: form.documento, guidPessoaExcluir: guidPessoa ?? undefined },
    { enabled: form.documento.replace(/\D/g, "").length >= 11 }
  );
  const validarUsuarioQuery = trpc.funcionarios.validarUsuario.useQuery(
    { usuario: form.usuario, guidPessoaExcluir: guidPessoa ?? undefined },
    { enabled: form.usuario.trim().length >= 3 }
  );

  // Mutations
  const criarMutation = trpc.funcionarios.criar.useMutation();
  const atualizarMutation = trpc.funcionarios.atualizar.useMutation();

  // Preencher formulário ao editar
  useEffect(() => {
    if (funcionarioData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = funcionarioData as any;
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
        dataNascimento: c.DATANASCIMENTO ? new Date(c.DATANASCIMENTO).toISOString().slice(0, 10) : "",
        cep: c.CEP ?? "",
        endereco: c.ENDERECO ?? "",
        numero: c.NUMERO ?? "",
        complemento: c.COMPLEMENTO ?? "",
        bairro: c.BAIRRO ?? "",
        codCidade: c.CODCIDADE ?? null,
        descCidade: c.DESCCIDADE ?? "",
        situacao: c.SITUACAO ?? "A",
        observacao: c.OBSERVACAO ?? "",
        codCargo: c.CODCARGO ?? null,
        usuario: c.USUARIO ?? "",
        senha: "", // nunca preencher senha na edição
      });
    }
  }, [funcionarioData]);

  // Atualizar lista de cidades
  useEffect(() => {
    if (buscarCidadesQuery.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCidadeResultados((buscarCidadesQuery.data as any[]).map((r: any) => ({
        CODCIDADE: r.CODCIDADE,
        DESCCIDADE: r.DESCCIDADE,
      })));
    }
  }, [buscarCidadesQuery.data]);

  // Validação de documento duplicado
  useEffect(() => {
    if (validarDocQuery.data?.existe) {
      setDocDuplicado({ codigo: validarDocQuery.data.codigo!, nome: validarDocQuery.data.nome! });
    } else {
      setDocDuplicado(null);
    }
  }, [validarDocQuery.data]);

  // Validação de usuário em tempo real
  useEffect(() => {
    if (!form.usuario.trim() || form.usuario.trim().length < 3) {
      setUsuarioStatus("idle");
      return;
    }
    if (validarUsuarioQuery.isFetching) {
      setUsuarioStatus("checking");
      return;
    }
    if (validarUsuarioQuery.data) {
      if (validarUsuarioQuery.data.disponivel) {
        setUsuarioStatus("ok");
      } else {
        setUsuarioStatus("taken");
        setUsuarioTakenNome(validarUsuarioQuery.data.nome ?? "");
      }
    }
  }, [validarUsuarioQuery.data, validarUsuarioQuery.isFetching, form.usuario]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const setUpper = <K extends keyof FormData>(key: K, value: string) => {
    set(key, value.toUpperCase() as FormData[K]);
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

  const handleUsuarioChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15);
    set("usuario", upper);
    setUsuarioStatus("idle");
    if (usuarioDebounceRef.current) clearTimeout(usuarioDebounceRef.current);
  };

  const handleSenhaChange = (value: string) => {
    set("senha", value.toUpperCase().slice(0, 25));
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
        email: data.email ?? prev.email,
        cep: applyCepMask(data.cep ?? prev.cep),
        endereco: (data.logradouro ?? prev.endereco).toUpperCase(),
        numero: data.numero ?? prev.numero,
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
    if (!form.nome.trim()) errs.nome = "Nome é obrigatório.";
    const celLimpo = form.celular.replace(/\D/g, "");
    if (celLimpo.length < 11) errs.celular = "Celular deve ter no mínimo 11 dígitos.";
    const cepLimpo = form.cep.replace(/\D/g, "");
    if (cepLimpo.length < 8) errs.cep = "CEP deve ter 8 dígitos.";
    if (!form.endereco.trim()) errs.endereco = "Endereço é obrigatório.";
    if (!form.numero.trim()) errs.numero = "Número é obrigatório.";
    if (!form.bairro.trim()) errs.bairro = "Bairro é obrigatório.";
    if (!form.codCidade) errs.descCidade = "Cidade é obrigatória.";
    if (!form.codCargo) errs.codCargo = "Cargo é obrigatório.";
    if (!form.usuario.trim()) errs.usuario = "Usuário é obrigatório.";
    if (!isEdicao && !form.senha.trim()) errs.senha = "Senha é obrigatória.";
    if (form.senha && form.senha.length < 4) errs.senha = "Senha deve ter pelo menos 4 caracteres.";
    if (form.senha && form.senha.toUpperCase() === form.usuario.toUpperCase()) {
      errs.senha = "Senha não pode ser igual ao usuário.";
    }
    if (usuarioStatus === "taken") errs.usuario = `Usuário já em uso por: ${usuarioTakenNome}`;
    setErrors(errs);
    if (Object.keys(errs).length === 0) return { ok: true };
    const dadosErros = ["documento", "nome", "celular", "codCargo"];
    const enderecoErros = ["cep", "endereco", "numero", "bairro", "descCidade"];
    const acessoErros = ["usuario", "senha"];
    if (dadosErros.some(k => errs[k as keyof FormData])) return { ok: false, tab: "dados" };
    if (enderecoErros.some(k => errs[k as keyof FormData])) return { ok: false, tab: "endereco" };
    if (acessoErros.some(k => errs[k as keyof FormData])) return { ok: false, tab: "acesso" };
    return { ok: false };
  };

  const handleSalvar = async () => {
    const { ok, tab } = validate();
    if (!ok) {
      if (tab) setActiveTab(tab);
      toast.error("Corrija os campos destacados em vermelho.");
      return;
    }
    if (docDuplicado) {
      toast.error("Documento já cadastrado para outro funcionário.");
      setActiveTab("dados");
      return;
    }
    try {
      const payload = {
        nome: form.nome.toUpperCase(),
        fantasia: form.fantasia.toUpperCase() || undefined,
        documento: form.documento,
        codTipoDocumento: form.codTipoDocumento,
        telefone: form.telefone || undefined,
        celular: form.celular,
        whatsapp: form.whatsapp || undefined,
        email: form.email || undefined,
        ie: form.ie || undefined,
        indIeDest: form.indIeDest,
        dataNascimento: form.dataNascimento || undefined,
        cep: form.cep,
        endereco: form.endereco.toUpperCase(),
        numero: form.numero,
        complemento: form.complemento.toUpperCase() || undefined,
        bairro: form.bairro.toUpperCase(),
        codCidade: form.codCidade!,
        situacao: form.situacao,
        observacao: form.observacao.toUpperCase() || undefined,
        codCargo: form.codCargo!,
        usuario: form.usuario.toUpperCase(),
        senha: form.senha.toUpperCase() || undefined,
      };
      if (isEdicao) {
        await atualizarMutation.mutateAsync({ guidPessoa: guidPessoa!, ...payload });
        toast.success("Funcionário atualizado com sucesso.");
      } else {
        await criarMutation.mutateAsync({ ...payload, senha: form.senha.toUpperCase() });
        toast.success("Funcionário cadastrado com sucesso.");
      }
      onClose(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar funcionário";
      if (msg.toLowerCase().includes("usuário") || msg.toLowerCase().includes("usuario")) {
        setErrors(prev => ({ ...prev, usuario: msg }));
        setActiveTab("acesso");
        toast.error(msg);
      } else if (msg.toLowerCase().includes("documento") || msg.toLowerCase().includes("duplicate")) {
        setErrors(prev => ({ ...prev, documento: "Documento já cadastrado!" }));
        setActiveTab("dados");
        toast.error("Documento já cadastrado!");
      } else {
        toast.error(msg);
      }
    }
  };

  const isSaving = criarMutation.isPending || atualizarMutation.isPending;
  const errDados = ["documento", "nome", "celular", "codCargo"].filter(k => errors[k as keyof FormData]).length;
  const errEndereco = ["cep", "endereco", "numero", "bairro", "descCidade"].filter(k => errors[k as keyof FormData]).length;
  const errAcesso = ["usuario", "senha"].filter(k => errors[k as keyof FormData]).length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cargos = (cargosData as any[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-4xl h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shadow">
              <UserCog className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {isEdicao ? "Editar Funcionário" : "Novo Funcionário"}
              </h2>
              <p className="text-xs text-gray-400">KS0002.KS00001 — CADUSUARIO = 1</p>
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
        {loadingFuncionario ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="dados" className="relative flex-1">
                  Dados Gerais
                  {errDados > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{errDados}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="endereco" className="relative flex-1">
                  Endereço
                  {errEndereco > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{errEndereco}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="acesso" className="relative flex-1">
                  Acesso ao Sistema
                  {errAcesso > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">{errAcesso}</span>
                  )}
                </TabsTrigger>
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
                        className={errors.documento ? "border-red-400 focus-visible:ring-red-400" : ""}
                        value={form.documento}
                        onChange={e => handleDocChange(e.target.value)}
                        placeholder={form.codTipoDocumento === "F" ? "000.000.000-00" : "00.000.000/0000-00"}
                      />
                      {form.codTipoDocumento === "J" && (
                        <Button type="button" variant="outline" size="icon" onClick={buscarCnpj} disabled={buscandoCnpj} title="Buscar CNPJ">
                          {buscandoCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
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
                      Nome <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 uppercase ${errors.nome ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.nome}
                      onChange={e => setUpper("nome", e.target.value)}
                      placeholder="Nome completo"
                    />
                    <FieldError msg={errors.nome} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Apelido / Nome Fantasia</Label>
                    <Input className="mt-1 uppercase" value={form.fantasia} onChange={e => setUpper("fantasia", e.target.value)} placeholder="Apelido" />
                  </div>
                </div>

                {/* Cargo */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Cargo <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.codCargo ? String(form.codCargo) : ""}
                    onValueChange={v => { set("codCargo", parseInt(v)); }}
                  >
                    <SelectTrigger className={`mt-1 ${errors.codCargo ? "border-red-400 focus-visible:ring-red-400" : ""}`}>
                      <SelectValue placeholder="Selecione o cargo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cargos.map((c: { CODCARGO: number; CARGO: string }) => (
                        <SelectItem key={c.CODCARGO} value={String(c.CODCARGO)}>{c.CARGO}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError msg={errors.codCargo} />
                </div>

                {/* Contato */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Telefone</Label>
                    <Input className="mt-1" value={form.telefone} onChange={e => set("telefone", applyPhoneMask(e.target.value))} placeholder="(00) 0000-0000" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">WhatsApp</Label>
                    <Input className="mt-1" value={form.whatsapp} onChange={e => set("whatsapp", applyPhoneMask(e.target.value))} placeholder="(00) 00000-0000" />
                  </div>
                </div>

                {/* Email + Nascimento */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">E-mail</Label>
                    <Input className="mt-1" type="email" value={form.email} onChange={e => set("email", e.target.value.toLowerCase())} placeholder="email@exemplo.com" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Data de Nascimento</Label>
                    <Input className="mt-1" type="date" value={form.dataNascimento} onChange={e => set("dataNascimento", e.target.value)} />
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

                {/* Observação */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação</Label>
                  <Textarea
                    className="mt-1 uppercase"
                    rows={3}
                    value={form.observacao}
                    onChange={e => setUpper("observacao", e.target.value)}
                    placeholder="Observações sobre o funcionário"
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
                      className={`mt-1 uppercase ${errors.endereco ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.endereco}
                      onChange={e => setUpper("endereco", e.target.value)}
                      placeholder="Rua, Avenida..."
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
                      placeholder="123"
                    />
                    <FieldError msg={errors.numero} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Complemento</Label>
                    <Input className="mt-1 uppercase" value={form.complemento} onChange={e => setUpper("complemento", e.target.value)} placeholder="Apto, Sala, etc." />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Bairro <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      className={`mt-1 uppercase ${errors.bairro ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.bairro}
                      onChange={e => setUpper("bairro", e.target.value)}
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
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
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

              {/* ABA: ACESSO AO SISTEMA */}
              <TabsContent value="acesso" className="space-y-5 mt-0">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
                  <strong>Atenção:</strong> O usuário e a senha são únicos em todo o sistema (multiempresa). Somente letras maiúsculas e números são permitidos.
                </div>

                {/* Usuário */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Usuário <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      className={`pr-8 uppercase ${errors.usuario ? "border-red-400 focus-visible:ring-red-400" : usuarioStatus === "ok" ? "border-green-400 focus-visible:ring-green-400" : ""}`}
                      value={form.usuario}
                      onChange={e => handleUsuarioChange(e.target.value)}
                      placeholder="USUARIO"
                      maxLength={15}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      {usuarioStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {usuarioStatus === "ok" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      {usuarioStatus === "taken" && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  {usuarioStatus === "ok" && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Disponível
                    </p>
                  )}
                  {usuarioStatus === "taken" && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Em uso por: <strong>{usuarioTakenNome}</strong>
                    </p>
                  )}
                  <FieldError msg={errors.usuario} />
                  <p className="text-xs text-gray-400 mt-1">Máx. 15 caracteres. Apenas letras maiúsculas e números.</p>
                </div>

                {/* Senha */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Senha {!isEdicao && <span className="text-red-500">*</span>}
                    {isEdicao && <span className="text-gray-400 font-normal normal-case"> (deixe em branco para não alterar)</span>}
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type={showSenha ? "text" : "password"}
                      className={`pr-10 uppercase ${errors.senha ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                      value={form.senha}
                      onChange={e => handleSenhaChange(e.target.value)}
                      placeholder={isEdicao ? "Nova senha (opcional)" : "SENHA"}
                      maxLength={25}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowSenha(v => !v)}
                    >
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <FieldError msg={errors.senha} />
                  <p className="text-xs text-gray-400 mt-1">Mín. 4 caracteres. Não pode ser igual ao usuário.</p>
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
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 min-w-[120px]"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSaving ? "Salvando..." : isEdicao ? "Salvar Alterações" : "Cadastrar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

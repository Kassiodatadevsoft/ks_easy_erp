import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, X, Search, Building2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SISTEMA_SEGMENTOS, type SistemaSegmento } from "@shared/datadev";

interface Props {
  guidPessoa: string | null;
  isMaster: boolean;
  onClose: (salvo?: boolean) => void;
}

interface EmpresaFormData {
  nome: string; fantasia: string; documento: string;
  codTipoDocumento: "F" | "J";
  telefone: string; celular: string; whatsapp: string; email: string;
  ie: string; indIeDest: number;
  crt: number; ambiente: number;
  aliquotaPis: number; aliquotaCofins: number; juroMensal: number;
  banco: number;
  cep: string; endereco: string; numero: string;
  complemento: string; bairro: string;
  codCidade: number | null; descCidade: string;
  situacao: "A" | "I" | "B";
  segmentoSistema: SistemaSegmento;
  // Contrato — visível só para master
  segmento: number; dataImplantacao: string; dataDemissao: string;
  valorNegociado: number; valorSalario: number;
  mensalidade: number; // 1=Mensal, 2=Anual
  observacao: string;
  // Fiscal NF-e — visível só para master
  certificado: string;       // nome/key do arquivo salvo
  certificadoBase64: string; // conteúdo base64 para upload
  dtCertificado: string;     // data de vencimento do certificado
  codPin: string;
  csc: string; codCsc: string;
  numNfe: number; serieNfe: number;
  usuarioNfe: string; senhaNfe: string;
}

const INITIAL: EmpresaFormData = {
  nome: "", fantasia: "", documento: "", codTipoDocumento: "J",
  telefone: "", celular: "", whatsapp: "", email: "",
  ie: "", indIeDest: 9,
  crt: 1, ambiente: 0,
  aliquotaPis: 0, aliquotaCofins: 0, juroMensal: 0,
  banco: 0,
  cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  codCidade: null, descCidade: "",
  situacao: "A",
  segmentoSistema: "GERAL",
  segmento: 0, dataImplantacao: "", dataDemissao: "",
  valorNegociado: 0, valorSalario: 0, mensalidade: 1,
  observacao: "",
  certificado: "", certificadoBase64: "", dtCertificado: "",
  codPin: "",
  csc: "", codCsc: "",
  numNfe: 0, serieNfe: 1,
  usuarioNfe: "", senhaNfe: "",
};

function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * w1[i];
  let r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (r !== parseInt(d[12])) return false;
  sum = 0;
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) sum += parseInt(d[i]) * w2[i];
  r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return r === parseInt(d[13]);
}

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

/**
 * Tenta extrair a data de vencimento de um certificado .pfx/.p12 (base64).
 * Procura por sequências ASN.1 GeneralizedTime (YYYYMMDDHHMMSSZ) no binário.
 * Retorna a data mais futura encontrada no formato YYYY-MM-DD, ou null.
 */
function extractPfxExpiry(base64: string): string | null {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Tag 0x18 = GeneralizedTime em ASN.1
    const dates: Date[] = [];
    for (let i = 0; i < bytes.length - 16; i++) {
      if (bytes[i] === 0x18) {
        const len = bytes[i + 1];
        if (len >= 13 && len <= 17) {
          let str = "";
          for (let j = 0; j < len; j++) str += String.fromCharCode(bytes[i + 2 + j]);
          // Formato: YYYYMMDDHHMMSSZ ou YYYYMMDDHHMMSS.sZ
          const m = str.match(/^(\d{4})(\d{2})(\d{2})/);
          if (m) {
            const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
            if (!isNaN(d.getTime()) && d.getFullYear() > 2000) dates.push(d);
          }
        }
      }
    }
    if (dates.length === 0) return null;
    // Retorna a data mais futura (data de vencimento)
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    return maxDate.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function maskDoc(val: string, tipo: "F" | "J") {
  const d = val.replace(/\D/g, "");
  if (tipo === "F") {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").slice(0, 14);
  }
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").slice(0, 18);
}

export default function EmpresaForm({ guidPessoa, isMaster, onClose }: Props) {
  const isEdit = !!guidPessoa;
  const [form, setForm] = useState<EmpresaFormData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("dados");
  const [cidadeQuery, setCidadeQuery] = useState("");
  const [cidadeSugestoes, setCidadeSugestoes] = useState<{ CODCIDADE: number; DESCCIDADE: string }[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const cidadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarPorGuid = trpc.empresas.buscarPorGuid.useQuery(
    { guidPessoa: guidPessoa! },
    { enabled: isEdit && !!guidPessoa }
  );
  const buscarCidades = trpc.empresas.buscarCidades.useQuery(
    { nome: cidadeQuery },
    { enabled: cidadeQuery.length >= 2 }
  );
  const validarDoc = trpc.empresas.validarDocumento.useQuery(
    { documento: form.documento, guidPessoaExcluir: guidPessoa ?? undefined },
    { enabled: form.documento.replace(/\D/g, "").length >= 11 }
  );
  const validarUsuario = trpc.empresas.validarUsuario.useQuery(
    { usuario: form.usuarioNfe.trim(), guidPessoaExcluir: guidPessoa ?? undefined },
    { enabled: form.usuarioNfe.trim().length >= 3 }
  );
  const criarMutation = trpc.empresas.criar.useMutation();
  const atualizarMutation = trpc.empresas.atualizar.useMutation();

  useEffect(() => {
    if (buscarPorGuid.data) {
      const d = buscarPorGuid.data as Record<string, unknown>;
      setForm({
        nome: String(d.NOME ?? ""),
        fantasia: String(d.FANTASIA ?? ""),
        documento: String(d.DOCUMENTO ?? ""),
        codTipoDocumento: (d.CODTIPODOCUMENTO as "F" | "J") ?? "J",
        telefone: String(d.TELEFONE ?? ""),
        celular: String(d.CELULAR ?? ""),
        whatsapp: String(d.WHATSAPP ?? ""),
        email: String(d.EMAIL ?? ""),
        ie: String(d.IE ?? ""),
        indIeDest: Number(d.INDIEDEST ?? 9),
        crt: Number(d.CRT ?? 1),
        ambiente: Number(d.AMBIENTE ?? 0),
        aliquotaPis: Number(d.ALIQUOTAPIS ?? 0),
        aliquotaCofins: Number(d.ALIQUOTACOFINS ?? 0),
        juroMensal: Number(d.JUROMENSAL ?? 0),
        banco: Number(d.BANCO ?? 0),
        cep: String(d.CEP ?? ""),
        endereco: String(d.ENDERECO ?? ""),
        numero: String(d.NUMERO ?? ""),
        complemento: String(d.COMPLEMENTO ?? ""),
        bairro: String(d.BAIRRO ?? ""),
        codCidade: Number(d.CODCIDADE ?? null) || null,
        descCidade: d.DESCCIDADE ? String(d.DESCCIDADE) : "",
        situacao: (d.SITUACAO as "A" | "I" | "B") ?? "A",
        segmentoSistema: SISTEMA_SEGMENTOS.includes(String(d.SEGMENTO ?? "GERAL") as SistemaSegmento)
          ? (String(d.SEGMENTO ?? "GERAL") as SistemaSegmento)
          : "GERAL",
        segmento: Number(d.COSEGMENTO ?? 0),
        dataImplantacao: d.DATAADMISSAO ? new Date(d.DATAADMISSAO as string).toISOString().slice(0, 10) : "",
        dataDemissao: d.DATADEMISSAO ? new Date(d.DATADEMISSAO as string).toISOString().slice(0, 10) : "",
        valorNegociado: Number(d.VALORNEGOCIADO ?? 0),
        valorSalario: Number(d.VALORSALARIO ?? 0),
        mensalidade: Number(d.MENSALIDADE ?? 1),
        observacao: String(d.OBSERVACAO ?? ""),
        certificado: String(d.CERTIFICADO ?? ""),
        certificadoBase64: "",
        dtCertificado: d.DTCERTIFICADO ? new Date(d.DTCERTIFICADO as string).toISOString().slice(0, 10) : "",
        codPin: String(d.CODPIN ?? ""),
        csc: String(d.CSC ?? ""),
        codCsc: String(d.CODCSC ?? ""),
        numNfe: Number(d.NUMNFE ?? 0),
        serieNfe: Number(d.SERIENFE ?? 1),
        usuarioNfe: String(d.USUARIO ?? ""),
        senhaNfe: String(d.SENHAPRAZO ?? ""),
      });
      if (d.DESCCIDADE) setCidadeQuery(String(d.DESCCIDADE));
    }
  }, [buscarPorGuid.data]);

  useEffect(() => {
    if (buscarCidades.data) {
      setCidadeSugestoes(buscarCidades.data as { CODCIDADE: number; DESCCIDADE: string }[]);
      setShowSugestoes(true);
    }
  }, [buscarCidades.data]);

  const set = (field: keyof EmpresaFormData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  const handleCidadeInput = useCallback((val: string) => {
    setCidadeQuery(val);
    set("descCidade", val);
    set("codCidade", null);
    if (cidadeTimer.current) clearTimeout(cidadeTimer.current);
    cidadeTimer.current = setTimeout(() => { /* query auto-dispara */ }, 300);
  }, []);

  const selecionarCidade = (cod: number, desc: string) => {
    set("codCidade", cod);
    set("descCidade", desc);
    setCidadeQuery(desc);
    setShowSugestoes(false);
  };

  const buscarCnpj = async () => {
    const doc = form.documento.replace(/\D/g, "");
    if (doc.length !== 14) { toast.error("Digite um CNPJ válido para buscar"); return; }
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setForm(prev => ({
        ...prev,
        nome: data.razao_social ?? prev.nome,
        fantasia: data.nome_fantasia || (data.razao_social?.slice(0, 15) ?? ""),
        cep: data.cep?.replace(/\D/g, "") ?? prev.cep,
        endereco: `${data.descricao_tipo_de_logradouro ?? ""} ${data.logradouro ?? ""}`.trim(),
        numero: data.numero ?? prev.numero,
        complemento: data.complemento ?? prev.complemento,
        bairro: data.bairro ?? prev.bairro,
        telefone: data.ddd_telefone_1 ?? prev.telefone,
        ie: data.inscricao_estadual ?? prev.ie,
        indIeDest: data.inscricao_estadual === "ISENTO" ? 2 : data.inscricao_estadual ? 1 : 9,
      }));
      toast.success("Dados do CNPJ carregados!");
    } catch {
      toast.error("CNPJ não encontrado na Receita Federal.");
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome é obrigatório";
    const docLimpo = form.documento.replace(/\D/g, "");
    if (!docLimpo) {
      e.documento = "Documento é obrigatório";
    } else if (form.codTipoDocumento === "J" && !validarCNPJ(form.documento)) {
      e.documento = "CNPJ inválido";
    } else if (form.codTipoDocumento === "F" && !validarCPF(form.documento)) {
      e.documento = "CPF inválido";
    } else if (docLimpo.length < 10) {
      e.documento = "Documento muito curto";
    }
    if (validarDoc.data?.existe) e.documento = `Documento já cadastrado (Cód. ${validarDoc.data.codigo} - ${validarDoc.data.nome})`;
    if (!form.celular.replace(/\D/g, "") || form.celular.replace(/\D/g, "").length < 11) e.celular = "Celular inválido (mínimo 11 dígitos)";
    if (!form.cep.replace(/\D/g, "") || form.cep.replace(/\D/g, "").length < 8) e.cep = "CEP inválido";
    if (!form.endereco.trim()) e.endereco = "Endereço é obrigatório";
    if (!form.numero.trim()) e.numero = "Número é obrigatório";
    if (!form.bairro.trim()) e.bairro = "Bairro é obrigatório";
    if (!form.codCidade) e.codCidade = "Cidade é obrigatória";
    if (isMaster) {
      if (!form.dataImplantacao) e.dataImplantacao = "Data de implantação é obrigatória";
      if (!form.valorNegociado) e.valorNegociado = "Valor negociado é obrigatório";
      if (!form.valorSalario) e.valorSalario = "Valor salário é obrigatório";
      if (!form.mensalidade) e.mensalidade = "Tipo de mensalidade é obrigatório";
      // Validação de usuário duplicado (multiempresa — verifica em todo o sistema)
      if (form.usuarioNfe.trim() && validarUsuario.data && !validarUsuario.data.disponivel) {
        e.usuarioNfe = `Usuário já cadastrado na empresa: ${validarUsuario.data.nome}`;
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const dadosErros = ["nome","documento","codTipoDocumento","telefone","celular","whatsapp","email","ie","indIeDest"];
      const enderecoErros = ["cep","endereco","numero","bairro","codCidade"];
      const contratoErros = ["dataImplantacao","valorNegociado","valorSalario","usuarioNfe"];
      const hasErrosDados = dadosErros.some(k => e[k]);
      const hasErrosEndereco = enderecoErros.some(k => e[k]);
      const hasErrosContrato = contratoErros.some(k => e[k]);
      if (hasErrosDados) setActiveTab("dados");
      else if (hasErrosEndereco) setActiveTab("endereco");
      else if (hasErrosContrato) setActiveTab("contrato");
    }
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    if (!validate()) return;
    const payload = {
      nome: form.nome, fantasia: form.fantasia || undefined,
      documento: form.documento, codTipoDocumento: form.codTipoDocumento,
      telefone: form.telefone || undefined, celular: form.celular,
      whatsapp: form.whatsapp || undefined, email: form.email || undefined,
      ie: form.ie || undefined, indIeDest: form.indIeDest,
      crt: form.crt, ambiente: form.ambiente,
      aliquotaPis: form.aliquotaPis, aliquotaCofins: form.aliquotaCofins,
      juroMensal: form.juroMensal, banco: form.banco,
      cep: form.cep, endereco: form.endereco, numero: form.numero,
      complemento: form.complemento || undefined, bairro: form.bairro,
      codCidade: form.codCidade!,
      situacao: form.situacao,
      segmentoSistema: form.segmentoSistema,
      segmento: form.segmento || undefined,
      dataImplantacao: form.dataImplantacao || undefined,
      dataDemissao: form.dataDemissao || undefined,
      valorNegociado: form.valorNegociado || undefined,
      valorSalario: form.valorSalario || undefined,
      mensalidade: form.mensalidade,
      observacao: form.observacao || undefined,
      certificado: form.certificado || undefined,
      certificadoBase64: form.certificadoBase64 || undefined,
      dtCertificado: form.dtCertificado || undefined,
      codPin: form.codPin || undefined,
      csc: form.csc || undefined,
      codCsc: form.codCsc || undefined,
      numNfe: form.numNfe || undefined,
      serieNfe: form.serieNfe || undefined,
      usuarioNfe: form.usuarioNfe || undefined,
      senhaNfe: form.senhaNfe || undefined,
    };
    try {
      if (isEdit) {
        await atualizarMutation.mutateAsync({ guidPessoa: guidPessoa!, ...payload });
        toast.success("Empresa atualizada com sucesso!");
      } else {
        const res = await criarMutation.mutateAsync(payload);
        toast.success(`Empresa cadastrada! Código: ${res.codigo}`);
      }
      onClose(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar empresa";
      toast.error(msg);
    }
  };

  const isLoading = buscarPorGuid.isLoading;
  const isSaving = criarMutation.isPending || atualizarMutation.isPending;

  const errCount = (fields: string[]) => fields.filter(f => errors[f]).length;
  const dadosFields = ["nome","documento","celular","email","ie","indIeDest"];
  const enderecoFields = ["cep","endereco","numero","bairro","codCidade"];
  const fiscalFields = ["crt","ambiente","aliquotaPis","aliquotaCofins","juroMensal"];
  const contratoFields = ["dataImplantacao","valorNegociado","valorSalario","usuarioNfe"];

  // Status da validação do usuário em tempo real
  const usuarioStatus = (() => {
    if (!form.usuarioNfe.trim() || form.usuarioNfe.trim().length < 3) return null;
    if (validarUsuario.isLoading) return "checking";
    if (validarUsuario.data?.disponivel === false) return "taken";
    if (validarUsuario.data?.disponivel === true) return "available";
    return null;
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100">
            <Building2 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? "Editar Empresa" : "Nova Empresa"}
            </h2>
            <p className="text-sm text-gray-500">CADEMPRESA</p>
          </div>
        </div>
        <button onClick={() => onClose()} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 flex gap-1 bg-gray-100 p-1 rounded-lg w-full">
            {[
              { id: "dados", label: "Dados Gerais", fields: dadosFields },
              { id: "endereco", label: "Endereço", fields: enderecoFields },
              { id: "fiscal", label: "Fiscal / Financeiro", fields: fiscalFields },
              ...(isMaster ? [{ id: "contrato", label: "Contrato", fields: contratoFields }] : []),
            ].map(tab => {
              const cnt = errCount(tab.fields);
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.id ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                  {cnt > 0 && <Badge variant="destructive" className="h-5 w-5 p-0 text-xs flex items-center justify-center">{cnt}</Badge>}
                </button>
              );
            })}
          </TabsList>

          {/* ABA DADOS GERAIS */}
          <TabsContent value="dados" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Pessoa</Label>
                <Select value={form.codTipoDocumento} onValueChange={v => { set("codTipoDocumento", v); set("documento", ""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="J">Jurídica (CNPJ)</SelectItem>
                    <SelectItem value="F">Física (CPF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={form.situacao} onValueChange={v => set("situacao", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Ativo</SelectItem>
                    <SelectItem value="I">Inativo</SelectItem>
                    <SelectItem value="B">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Documento ({form.codTipoDocumento === "J" ? "CNPJ" : "CPF"}) *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.documento}
                  onChange={e => set("documento", maskDoc(e.target.value, form.codTipoDocumento))}
                  placeholder={form.codTipoDocumento === "J" ? "00.000.000/0000-00" : "000.000.000-00"}
                  className={errors.documento ? "border-red-500" : ""}
                />
                {form.codTipoDocumento === "J" && (
                  <Button type="button" variant="outline" onClick={buscarCnpj} disabled={buscandoCnpj} className="shrink-0">
                    {buscandoCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {errors.documento && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.documento}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Razão Social / Nome *</Label>
                <Input value={form.nome} onChange={e => set("nome", e.target.value.toUpperCase())} className={errors.nome ? "border-red-500" : ""} />
                {errors.nome && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.nome}</p>}
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input value={form.fantasia} onChange={e => set("fantasia", e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={e => set("telefone", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(00) 0000-0000" />
              </div>
              <div>
                <Label>Celular / WhatsApp *</Label>
                <Input value={form.celular} onChange={e => set("celular", e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="(00) 00000-0000" className={errors.celular ? "border-red-500" : ""} />
                {errors.celular && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.celular}</p>}
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={form.ie} onChange={e => set("ie", e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Indicador IE</Label>
                <Select value={String(form.indIeDest)} onValueChange={v => set("indIeDest", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Contribuinte</SelectItem>
                    <SelectItem value="2">Isento</SelectItem>
                    <SelectItem value="9">Não Contribuinte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Observação</Label>
              <Textarea value={form.observacao} onChange={e => set("observacao", e.target.value.toUpperCase())} rows={3} />
            </div>
          </TabsContent>

          {/* ABA ENDEREÇO */}
          <TabsContent value="endereco" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>CEP *</Label>
                <Input value={form.cep} onChange={e => set("cep", e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="00000000" className={errors.cep ? "border-red-500" : ""} />
                {errors.cep && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.cep}</p>}
              </div>
              <div className="col-span-2">
                <Label>Endereço *</Label>
                <Input value={form.endereco} onChange={e => set("endereco", e.target.value.toUpperCase())} className={errors.endereco ? "border-red-500" : ""} />
                {errors.endereco && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.endereco}</p>}
              </div>
              <div>
                <Label>Número *</Label>
                <Input value={form.numero} onChange={e => set("numero", e.target.value.toUpperCase())} className={errors.numero ? "border-red-500" : ""} />
                {errors.numero && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.numero}</p>}
              </div>
              <div>
                <Label>Complemento</Label>
                <Input value={form.complemento} onChange={e => set("complemento", e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Bairro *</Label>
                <Input value={form.bairro} onChange={e => set("bairro", e.target.value.toUpperCase())} className={errors.bairro ? "border-red-500" : ""} />
                {errors.bairro && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.bairro}</p>}
              </div>
              <div className="col-span-3 relative">
                <Label>Cidade *</Label>
                <Input
                  value={cidadeQuery}
                  onChange={e => handleCidadeInput(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSugestoes(false), 200)}
                  placeholder="Digite para buscar..."
                  className={errors.codCidade ? "border-red-500" : ""}
                />
                {errors.codCidade && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.codCidade}</p>}
                {showSugestoes && cidadeSugestoes.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg mt-1 max-h-48 overflow-auto">
                    {cidadeSugestoes.map(c => (
                      <button key={c.CODCIDADE} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                        onMouseDown={() => selecionarCidade(c.CODCIDADE, c.DESCCIDADE)}>
                        {c.DESCCIDADE}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ABA FISCAL / FINANCEIRO */}
          <TabsContent value="fiscal" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CRT (Regime Tributário)</Label>
                <Select value={String(form.crt)} onValueChange={v => set("crt", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Simples Nacional</SelectItem>
                    <SelectItem value="2">Simples Nacional — Excesso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ambiente NF-e</Label>
                <Select value={String(form.ambiente)} onValueChange={v => set("ambiente", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Homologação (Teste)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alíquota PIS (%)</Label>
                <Input type="number" step="0.01" value={form.aliquotaPis} onChange={e => set("aliquotaPis", Number(e.target.value))} />
              </div>
              <div>
                <Label>Alíquota COFINS (%)</Label>
                <Input type="number" step="0.01" value={form.aliquotaCofins} onChange={e => set("aliquotaCofins", Number(e.target.value))} />
              </div>
              <div>
                <Label>Juro Mensal (%)</Label>
                <Input type="number" step="0.01" value={form.juroMensal} onChange={e => set("juroMensal", Number(e.target.value))} />
              </div>
              <div>
                <Label>Banco</Label>
                <Select value={String(form.banco)} onValueChange={v => set("banco", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Banco do Brasil</SelectItem>
                    <SelectItem value="2">Bradesco</SelectItem>
                    <SelectItem value="6">Sicoob</SelectItem>
                    <SelectItem value="7">Sicredi</SelectItem>
                    <SelectItem value="8">Nubank</SelectItem>
                    <SelectItem value="9">Inter</SelectItem>
                    <SelectItem value="10">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ABA CONTRATO — visível apenas para empresa master */}
          {isMaster && (
            <TabsContent value="contrato" className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-purple-700 font-medium">Campos exclusivos para gestão de contratos DataDev</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Segmento do sistema</Label>
                  <Select
                    value={form.segmentoSistema}
                    onValueChange={v => set("segmentoSistema", SISTEMA_SEGMENTOS.includes(v as SistemaSegmento) ? v as SistemaSegmento : "GERAL")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GERAL">GERAL</SelectItem>
                      <SelectItem value="FOOD_DELIVERY">FOOD_DELIVERY</SelectItem>
                      <SelectItem value="LOJA_CELULAR">LOJA_CELULAR</SelectItem>
                      <SelectItem value="ASSISTENCIA_TECNICA">ASSISTENCIA_TECNICA</SelectItem>
                      <SelectItem value="OUTROS">OUTROS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data de Implantação *</Label>
                  <Input type="date" value={form.dataImplantacao} onChange={e => set("dataImplantacao", e.target.value)} className={errors.dataImplantacao ? "border-red-500" : ""} />
                  {errors.dataImplantacao && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.dataImplantacao}</p>}
                </div>
                <div>
                  <Label>Data de Rescisão</Label>
                  <Input type="date" value={form.dataDemissao} onChange={e => set("dataDemissao", e.target.value)} />
                </div>
                <div>
                  <Label>Valor Negociado (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valorNegociado} onChange={e => set("valorNegociado", Number(e.target.value))} className={errors.valorNegociado ? "border-red-500" : ""} />
                  {errors.valorNegociado && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.valorNegociado}</p>}
                </div>
                <div>
                  <Label>Valor Salário (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valorSalario} onChange={e => set("valorSalario", Number(e.target.value))} className={errors.valorSalario ? "border-red-500" : ""} />
                  {errors.valorSalario && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.valorSalario}</p>}
                </div>
                <div>
                  <Label>Tipo de Mensalidade *</Label>
                  <Select value={String(form.mensalidade)} onValueChange={v => set("mensalidade", Number(v))}>
                    <SelectTrigger className={errors.mensalidade ? "border-red-500" : ""}>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Mensal</SelectItem>
                      <SelectItem value="2">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.mensalidade && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.mensalidade}</p>}
                </div>
              </div>

              {/* Campos Fiscais NF-e */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-purple-700 mb-3 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                  Configurações Fiscais / NF-e
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Certificado Digital (.pfx / .p12)</Label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm bg-white hover:bg-gray-50 transition-colors">
                          <span className="text-gray-500">{form.certificado ? form.certificado : "Selecionar arquivo .pfx ou .p12"}</span>
                        </div>
                        <input
                          type="file"
                          accept=".pfx,.p12"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const base64 = (ev.target?.result as string).split(",")[1] ?? "";
                              set("certificado", file.name);
                              set("certificadoBase64", base64);
                              // Tentar extrair data de vencimento automaticamente
                              const expiry = extractPfxExpiry(base64);
                              if (expiry) {
                                set("dtCertificado", expiry);
                                toast.info(`Vencimento do certificado: ${new Date(expiry + "T12:00:00").toLocaleDateString("pt-BR")}`);
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      {form.certificado && (
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 border rounded"
                          onClick={() => { set("certificado", ""); set("certificadoBase64", ""); }}
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Data de Vencimento do Certificado</Label>
                    <Input
                      type="date"
                      value={form.dtCertificado}
                      onChange={e => set("dtCertificado", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>PIN do Certificado</Label>
                    <Input type="password" value={form.codPin} onChange={e => set("codPin", e.target.value)} placeholder="PIN" />
                  </div>
                  <div>
                    <Label>Número NF-e</Label>
                    <Input type="number" value={form.numNfe} onChange={e => set("numNfe", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Série NF-e</Label>
                    <Input type="number" value={form.serieNfe} onChange={e => set("serieNfe", Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>CSC (NFC-e — após credenciamento)</Label>
                    <Input value={form.csc} onChange={e => set("csc", e.target.value.toUpperCase())} placeholder="Token CSC" />
                  </div>
                  <div>
                    <Label>Código CSC</Label>
                    <Input value={form.codCsc} onChange={e => set("codCsc", e.target.value.toUpperCase())} />
                  </div>
                  <div className="col-span-2">
                    <Label>Usuário *</Label>
                    <div className="relative">
                      <Input
                        value={form.usuarioNfe}
                        onChange={e => set("usuarioNfe", e.target.value.toUpperCase().slice(0, 15))}
                        placeholder="Máx. 15 caracteres"
                        className={errors.usuarioNfe ? "border-red-500 pr-8" : usuarioStatus === "available" ? "border-green-500 pr-8" : usuarioStatus === "taken" ? "border-red-500 pr-8" : ""}
                        maxLength={15}
                      />
                      {usuarioStatus === "checking" && (
                        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-gray-400" />
                      )}
                      {usuarioStatus === "available" && (
                        <span className="absolute right-2 top-2 text-green-600 text-xs font-semibold">✓ Disponível</span>
                      )}
                      {usuarioStatus === "taken" && (
                        <span className="absolute right-2 top-2 text-red-500 text-xs font-semibold">✗ Em uso</span>
                      )}
                    </div>
                    {errors.usuarioNfe && (
                      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />{errors.usuarioNfe}
                      </p>
                    )}
                    {usuarioStatus === "taken" && !errors.usuarioNfe && validarUsuario.data && (
                      <p className="text-orange-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Usuário já utilizado pela empresa: <strong>{validarUsuario.data.nome}</strong>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input type="password" value={form.senhaNfe} onChange={e => set("senhaNfe", e.target.value)} placeholder="Senha de acesso" />
                  </div>
                </div>
              </div>

              {/* GUID da Empresa — para configuração do sistema offline */}
              {isEdit && guidPessoa && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
                    Identificador para Sistema Offline
                  </p>
                  <div>
                    <Label className="text-xs text-gray-500">GUID da Empresa (GUIDPESSOA)</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        readOnly
                        value={guidPessoa}
                        className="font-mono text-xs bg-gray-50 text-gray-600 cursor-default select-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(guidPessoa);
                          toast.success("GUID copiado!");
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Use este GUID para configurar a sincronização offline no sistema Delphi.</p>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
        <Button variant="outline" onClick={() => onClose()} disabled={isSaving}>Cancelar</Button>
        <Button onClick={handleSalvar} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white min-w-[120px]">
          {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : isEdit ? "Salvar Alterações" : "Cadastrar Empresa"}
        </Button>
      </div>
    </div>
  );
}

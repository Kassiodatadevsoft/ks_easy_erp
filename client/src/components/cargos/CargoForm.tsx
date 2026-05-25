import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, AlertCircle, Briefcase } from "lucide-react";

interface Props {
  guidCargo: string | null;
  onClose: (salvo?: boolean) => void;
}

interface CargoFormData {
  cargo: string;
  codTipo: number;
  situacao: "A" | "I";
  descontoMaximo: number;
  comissao: number;
  pdv: boolean;
  alterarPreco: boolean;
  codPainel: number | null;
}

const INITIAL: CargoFormData = {
  cargo: "",
  codTipo: 1,
  situacao: "A",
  descontoMaximo: 0,
  comissao: 0,
  pdv: false,
  alterarPreco: false,
  codPainel: 268,
};

const TIPOS_CARGO = [
  { value: 0, label: "CEO (Chief Executive)" },
  { value: 1, label: "Padrão" },
  { value: 2, label: "Gerente" },
];

const PAINEIS = [
  { value: 267, label: "Padrão Cadastro" },
  { value: 268, label: "Padrão" },
  { value: 2501, label: "Financeiro" },
];

export default function CargoForm({ guidCargo, onClose }: Props) {
  const isEdit = !!guidCargo;
  const [form, setForm] = useState<CargoFormData>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const buscarPorGuid = trpc.cargos.buscarPorGuid.useQuery(
    { guidCargo: guidCargo! },
    { enabled: isEdit && !!guidCargo }
  );

  const validarNome = trpc.cargos.validarNome.useQuery(
    { cargo: form.cargo.trim(), guidCargoExcluir: guidCargo ?? undefined },
    { enabled: form.cargo.trim().length >= 2 }
  );

  const criarMutation = trpc.cargos.criar.useMutation();
  const atualizarMutation = trpc.cargos.atualizar.useMutation();

  useEffect(() => {
    if (buscarPorGuid.data) {
      const d = buscarPorGuid.data as Record<string, unknown>;
      setForm({
        cargo: String(d.CARGO ?? ""),
        codTipo: Number(d.CODTIPO ?? 1),
        situacao: (d.SITUACAO as "A" | "I") ?? "A",
        descontoMaximo: Number(d.DESCONTOMAXIMO ?? 0),
        comissao: Number(d.COMISSAO ?? 0),
        pdv: Boolean(d.PDV),
        alterarPreco: Boolean(d.ALTERARPRECOPRODUTO),
        codPainel: d.CODPAINEL != null ? Number(d.CODPAINEL) : null,
      });
    }
  }, [buscarPorGuid.data]);

  const set = <K extends keyof CargoFormData>(key: K, value: CargoFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.cargo.trim()) e.cargo = "Nome do cargo é obrigatório";
    if (validarNome.data?.disponivel === false) {
      e.cargo = `Já existe um cargo com o nome "${form.cargo.trim()}"`;
    }
    if (form.descontoMaximo < 0 || form.descontoMaximo > 100) e.descontoMaximo = "Desconto deve ser entre 0 e 100%";
    if (form.comissao < 0 || form.comissao > 100) e.comissao = "Comissão deve ser entre 0 e 100%";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSalvar = async () => {
    if (!validate()) return;
    const payload = {
      cargo: form.cargo.trim(),
      codTipo: form.codTipo,
      situacao: form.situacao,
      descontoMaximo: form.descontoMaximo,
      comissao: form.comissao || undefined,
      pdv: form.pdv,
      alterarPreco: form.alterarPreco,
      codPainel: form.codPainel ?? undefined,
    };
    try {
      if (isEdit) {
        await atualizarMutation.mutateAsync({ guidCargo: guidCargo!, ...payload });
        toast.success("Cargo atualizado com sucesso!");
      } else {
        const res = await criarMutation.mutateAsync(payload);
        toast.success(`Cargo cadastrado! Código: ${res.codigo}`);
      }
      onClose(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar cargo";
      toast.error(msg);
    }
  };

  const isLoading = buscarPorGuid.isLoading;
  const isSaving = criarMutation.isPending || atualizarMutation.isPending;

  // Status da validação do nome em tempo real
  const nomeStatus = (() => {
    if (!form.cargo.trim() || form.cargo.trim().length < 2) return null;
    if (validarNome.isLoading) return "checking";
    if (validarNome.data?.disponivel === false) return "taken";
    if (validarNome.data?.disponivel === true) return "available";
    return null;
  })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin h-8 w-8 text-purple-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-white">
        <div className="p-2 rounded-lg bg-purple-100">
          <Briefcase className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? "Editar Cargo" : "Novo Cargo"}
          </h2>
          <p className="text-sm text-gray-500">
            {isEdit ? "Atualize as informações do cargo" : "Preencha os dados para cadastrar um novo cargo"}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Nome do Cargo */}
          <div className="md:col-span-2">
            <Label>Cargo *</Label>
            <div className="relative mt-1">
              <Input
                value={form.cargo}
                onChange={e => set("cargo", e.target.value.toUpperCase())}
                placeholder="Nome do cargo"
                maxLength={80}
                className={
                  errors.cargo
                    ? "border-red-500"
                    : nomeStatus === "available"
                    ? "border-green-500"
                    : nomeStatus === "taken"
                    ? "border-red-500"
                    : ""
                }
              />
              {nomeStatus === "checking" && (
                <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-gray-400" />
              )}
              {nomeStatus === "available" && (
                <span className="absolute right-2 top-2 text-green-600 text-xs font-semibold">✓ Disponível</span>
              )}
              {nomeStatus === "taken" && (
                <span className="absolute right-2 top-2 text-red-500 text-xs font-semibold">✗ Em uso</span>
              )}
            </div>
            {errors.cargo && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{errors.cargo}
              </p>
            )}
          </div>

          {/* Classificação (CODTIPO) */}
          <div>
            <Label>Classificação *</Label>
            <Select
              value={String(form.codTipo)}
              onValueChange={v => set("codTipo", Number(v))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a classificação" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_CARGO.map(t => (
                  <SelectItem key={t.value} value={String(t.value)}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Situação */}
          <div>
            <Label>Situação *</Label>
            <Select
              value={form.situacao}
              onValueChange={v => set("situacao", v as "A" | "I")}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Ativo</SelectItem>
                <SelectItem value="I">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dashboard inicial (CODPAINEL) */}
          <div className="md:col-span-2">
            <Label>Dashboard inicial *</Label>
            <Select
              value={form.codPainel != null ? String(form.codPainel) : ""}
              onValueChange={v => set("codPainel", v ? Number(v) : null)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o dashboard" />
              </SelectTrigger>
              <SelectContent>
                {PAINEIS.map(p => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desconto Máximo */}
          <div>
            <Label>Desconto máximo (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.descontoMaximo}
              onChange={e => set("descontoMaximo", Number(e.target.value))}
              className={`mt-1 ${errors.descontoMaximo ? "border-red-500" : ""}`}
            />
            {errors.descontoMaximo && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{errors.descontoMaximo}
              </p>
            )}
          </div>

          {/* Comissão */}
          <div>
            <Label>Comissão (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.comissao}
              onChange={e => set("comissao", Number(e.target.value))}
              className={`mt-1 ${errors.comissao ? "border-red-500" : ""}`}
            />
            {errors.comissao && (
              <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />{errors.comissao}
              </p>
            )}
          </div>

          {/* Checkboxes */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Abrir como PDV</p>
                <p className="text-xs text-gray-500">Abre o sistema no modo ponto de venda</p>
              </div>
              <Switch
                checked={form.pdv}
                onCheckedChange={v => set("pdv", v)}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-900">Alterar preço do produto</p>
                <p className="text-xs text-gray-500">Permite alterar preços na venda</p>
              </div>
              <Switch
                checked={form.alterarPreco}
                onCheckedChange={v => set("alterarPreco", v)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
        <Button variant="outline" onClick={() => onClose()} disabled={isSaving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSalvar}
          disabled={isSaving}
          className="bg-purple-600 hover:bg-purple-700 text-white min-w-[140px]"
        >
          {isSaving
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
            : isEdit ? "Salvar Alterações" : "Cadastrar Cargo"
          }
        </Button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useKsAuth } from "@/hooks/useKsAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Ban, CheckCircle2, CalendarClock, Monitor, Pencil, Plus, Trash2 } from "lucide-react";

const CNPJ_GERENCIADOR = "50303631000158";

type FormState = {
  cnpj: string;
  codEntidade: number;
  guidPessoa: string;
  status: "A" | "I";
  dataInicio: string;
  dataValidade: string;
  diasTolerancia: number;
  qtdeTerminaisMax: number;
  bloqueado: boolean;
  motivoBloqueio: string;
};

const hoje = new Date().toISOString().slice(0, 10);
const EMPTY: FormState = {
  cnpj: "",
  codEntidade: 0,
  guidPessoa: "",
  status: "A",
  dataInicio: hoje,
  dataValidade: hoje,
  diasTolerancia: 0,
  qtdeTerminaisMax: 1,
  bloqueado: false,
  motivoBloqueio: "",
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function dateInput(value: unknown) {
  if (!value) return hoje;
  return new Date(value as string).toISOString().slice(0, 10);
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return new Date(value as string).toLocaleDateString("pt-BR");
}

export default function Licencas() {
  const { user } = useKsAuth();
  const autorizado = onlyDigits(user?.entDocumento ?? "") === CNPJ_GERENCIADOR;
  const utils = trpc.useUtils();
  const { data: licencas = [], isLoading } = trpc.licencas.listar.useQuery(undefined, {
    enabled: autorizado,
  });
  const { data: empresasData } = trpc.empresas.listar.useQuery({
    situacao: "A",
    pagina: 1,
    porPagina: 100,
  }, {
    enabled: autorizado,
  });
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => licencas.find((l) => l.idLicenca === selectedId) ?? licencas[0],
    [licencas, selectedId],
  );
  const idLicencaSelecionada = selected?.idLicenca ?? 0;
  const empresas = empresasData?.dados ?? [];
  const { data: terminais = [] } = trpc.licencas.terminais.useQuery(
    { idLicenca: idLicencaSelecionada },
    { enabled: autorizado && Boolean(idLicencaSelecionada) },
  );

  const salvar = trpc.licencas.salvar.useMutation({
    onSuccess: async () => {
      await utils.licencas.listar.invalidate();
      toast.success("Licenca salva.");
      setModal(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const bloquear = trpc.licencas.bloquear.useMutation({
    onSuccess: () => utils.licencas.listar.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const desbloquear = trpc.licencas.desbloquear.useMutation({
    onSuccess: () => utils.licencas.listar.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const renovarPorBoletoPago = trpc.licencas.renovarPorBoletoPago.useMutation({
    onSuccess: async (result) => {
      if (result.atualizado) {
        await utils.licencas.listar.invalidate();
        toast.success(`Licenca renovada ate ${formatDate(result.dataValidade)}.`);
      } else {
        toast.warning(result.message);
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const renovarTodasPorBoletoPago = trpc.licencas.renovarTodasPorBoletoPago.useMutation({
    onSuccess: async (result) => {
      await utils.licencas.listar.invalidate();
      toast.success(`${result.renovadas} de ${result.total} licenca(s) renovada(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const bloquearTerminal = trpc.licencas.bloquearTerminal.useMutation({
    onSuccess: async () => {
      await utils.licencas.terminais.invalidate({ idLicenca: idLicencaSelecionada });
      await utils.licencas.listar.invalidate();
      toast.success("Computador bloqueado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const desbloquearTerminal = trpc.licencas.desbloquearTerminal.useMutation({
    onSuccess: async () => {
      await utils.licencas.terminais.invalidate({ idLicenca: idLicencaSelecionada });
      await utils.licencas.listar.invalidate();
      toast.success("Computador desbloqueado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const desabilitarTerminal = trpc.licencas.desabilitarTerminal.useMutation({
    onSuccess: async () => {
      await utils.licencas.terminais.invalidate({ idLicenca: idLicencaSelecionada });
      await utils.licencas.listar.invalidate();
      toast.success("Terminal desabilitado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const reativarTerminal = trpc.licencas.reativarTerminal.useMutation({
    onSuccess: async () => {
      await utils.licencas.terminais.invalidate({ idLicenca: idLicencaSelecionada });
      await utils.licencas.listar.invalidate();
      toast.success("Terminal reativado.");
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.licencas.removerTerminal.useMutation({
    onSuccess: async () => {
      await utils.licencas.terminais.invalidate({ idLicenca: idLicencaSelecionada });
      await utils.licencas.listar.invalidate();
      toast.success("Terminal removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  function abrirNovo() {
    setEditId(null);
    setForm(EMPTY);
    setModal(true);
  }

  function abrirEditar(licenca: (typeof licencas)[number]) {
    setEditId(licenca.idLicenca);
    setForm({
      cnpj: licenca.cnpj ?? "",
      codEntidade: Number(licenca.codEntidade ?? 0),
      guidPessoa: licenca.guidPessoa ?? "",
      status: (licenca.status as "A" | "I") ?? "A",
      dataInicio: dateInput(licenca.dataInicio),
      dataValidade: dateInput(licenca.dataValidade),
      diasTolerancia: Number(licenca.diasTolerancia ?? 0),
      qtdeTerminaisMax: Number(licenca.qtdeTerminaisMax ?? 1),
      bloqueado: Boolean(licenca.bloqueado),
      motivoBloqueio: licenca.motivoBloqueio ?? "",
    });
    setModal(true);
  }

  function selecionarEmpresa(guidPessoa: string) {
    const empresa = empresas.find((item) => String(item.GUIDPESSOA) === guidPessoa);
    if (!empresa) return;

    setForm((current) => ({
      ...current,
      cnpj: onlyDigits(String(empresa.DOCUMENTO ?? "")),
      codEntidade: Number(empresa.CODENTIDADE ?? empresa.CODIGO ?? 0),
      guidPessoa: String(empresa.GUIDPESSOA ?? ""),
    }));
  }

  function salvarForm() {
    if (!form.guidPessoa) return toast.error("Selecione a empresa.");
    if (!onlyDigits(form.cnpj) || !form.codEntidade) return toast.error("Cadastro da empresa sem CNPJ ou CODENTIDADE.");
    salvar.mutate({
      ...form,
      idLicenca: editId ?? undefined,
      cnpj: onlyDigits(form.cnpj),
      motivoBloqueio: form.motivoBloqueio || null,
    });
  }

  if (!autorizado) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Acesso restrito ao Gerenciador de Licencas.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciador de Licencas</h1>
          <p className="text-muted-foreground text-sm">Controle de empresas e terminais liberados para o Delphi</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => renovarTodasPorBoletoPago.mutate()}
            disabled={renovarTodasPorBoletoPago.isPending}
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            {renovarTodasPorBoletoPago.isPending ? "Verificando..." : "Renovar boletos pagos"}
          </Button>
          <Button onClick={abrirNovo}><Plus className="w-4 h-4 mr-2" />Nova Licenca</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>CODENTIDADE</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Terminais</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && licencas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma licenca cadastrada.</TableCell></TableRow>}
                {licencas.map((licenca) => (
                  <TableRow
                    key={licenca.idLicenca}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(licenca.idLicenca)}
                  >
                    <TableCell className="font-medium">{licenca.cnpj}</TableCell>
                    <TableCell>{licenca.codEntidade}</TableCell>
                    <TableCell>{formatDate(licenca.dataValidade)} + {licenca.diasTolerancia} dia(s)</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{licenca.terminaisAtivos ?? 0}/{licenca.qtdeTerminaisMax} ativos</p>
                        <p className="text-xs text-muted-foreground">
                          {licenca.terminaisBloqueados ?? 0} bloq. · {licenca.terminaisDesabilitados ?? 0} desab.
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={licenca.status === "A" && !licenca.bloqueado ? "default" : "secondary"}>
                        {licenca.bloqueado ? "Bloqueada" : licenca.status === "A" ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); abrirEditar(licenca); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {licenca.bloqueado ? (
                          <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); desbloquear.mutate({ idLicenca: licenca.idLicenca }); }}>
                            <CheckCircle2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); bloquear.mutate({ idLicenca: licenca.idLicenca, motivo: "Bloqueio administrativo" }); }}>
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Terminais Vinculados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selected && <p className="text-sm text-muted-foreground">Selecione uma licenca.</p>}
            {selected && (
              <>
                <div className="text-sm">
                  <p className="font-medium">{selected.cnpj}</p>
                  <p className="text-muted-foreground">Licenca #{selected.idLicenca} · validade {formatDate(selected.dataValidade)}</p>
                  <p className="text-muted-foreground">
                    Ativos {selected.terminaisAtivos ?? 0}/{selected.qtdeTerminaisMax} · Bloqueados {selected.terminaisBloqueados ?? 0} · Desabilitados {selected.terminaisDesabilitados ?? 0}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => renovarPorBoletoPago.mutate({ idLicenca: selected.idLicenca })}
                  disabled={renovarPorBoletoPago.isPending}
                >
                  <CalendarClock className="w-4 h-4" />
                  {renovarPorBoletoPago.isPending ? "Verificando pagamento..." : "Renovar se boleto do mes estiver pago"}
                </Button>
                <div className="space-y-2">
                  {terminais.length === 0 && <p className="text-sm text-muted-foreground">Nenhum terminal vinculado.</p>}
                  {terminais.map((terminal) => (
                    <div key={terminal.idTerminal} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {terminal.nomeComputador || "Computador sem nome"}
                          </p>
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            <p className="truncate">Hardware ID: {terminal.hardwareId}</p>
                            <p>Usuario Windows: {terminal.usuarioWindows || "-"}</p>
                            <p>IP: {terminal.ip || "-"}</p>
                            <p>Liberado em: {formatDate(terminal.dataLiberacao)}</p>
                            <p>Ultima validacao: {formatDate(terminal.dataUltimaValidacao)}</p>
                          </div>
                        </div>
                        <Badge variant={terminal.status === "ATIVO" ? "default" : "secondary"}>
                          {terminal.status ?? (terminal.bloqueado ? "BLOQUEADO" : "ATIVO")}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {(terminal.status === "BLOQUEADO" || terminal.bloqueado) ? (
                          <Button size="sm" variant="outline" onClick={() => desbloquearTerminal.mutate({ idTerminal: terminal.idTerminal })}>Desbloquear computador</Button>
                        ) : (
                          terminal.status !== "DESABILITADO" && (
                            <Button size="sm" variant="outline" onClick={() => bloquearTerminal.mutate({ idTerminal: terminal.idTerminal, motivo: "Bloqueio administrativo" })}>Bloquear computador</Button>
                          )
                        )}
                        {terminal.status === "DESABILITADO" ? (
                          <Button size="sm" variant="outline" onClick={() => reativarTerminal.mutate({ idTerminal: terminal.idTerminal })}>Reativar</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => desabilitarTerminal.mutate({ idTerminal: terminal.idTerminal })}>Desabilitar</Button>
                        )}
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remover este terminal?")) remover.mutate({ idTerminal: terminal.idTerminal }); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar Licenca" : "Nova Licenca"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Empresa *</Label>
              <Select value={form.guidPessoa || "none"} onValueChange={(value) => value !== "none" && selecionarEmpresa(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa cadastrada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione uma empresa cadastrada</SelectItem>
                  {empresas.map((empresa) => (
                    <SelectItem key={String(empresa.GUIDPESSOA)} value={String(empresa.GUIDPESSOA)}>
                      {String(empresa.NOME ?? empresa.FANTASIA ?? "Empresa")} - {String(empresa.DOCUMENTO ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">CNPJ, CODENTIDADE e GUIDPESSOA sao preenchidos automaticamente pelo cadastro da empresa.</p>
            </div>
            <div className="space-y-1">
              <Label>CNPJ</Label>
              <Input value={form.cnpj} disabled />
            </div>
            <div className="space-y-1">
              <Label>CODENTIDADE</Label>
              <Input type="number" value={form.codEntidade} disabled />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>GUIDPESSOA</Label>
              <Input value={form.guidPessoa} disabled />
            </div>
            <div className="space-y-1">
              <Label>Data de Inicio</Label>
              <Input type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Validade Mensal</Label>
              <Input type="date" value={form.dataValidade} onChange={(e) => setForm((f) => ({ ...f, dataValidade: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Dias de Tolerancia</Label>
              <Input type="number" min={0} value={form.diasTolerancia} onChange={(e) => setForm((f) => ({ ...f, diasTolerancia: Number(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>Maximo de Terminais</Label>
              <Input type="number" min={1} value={form.qtdeTerminaisMax} onChange={(e) => setForm((f) => ({ ...f, qtdeTerminaisMax: Number(e.target.value) || 1 }))} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "A" | "I" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Ativa</SelectItem>
                  <SelectItem value="I">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Bloqueio</Label>
              <Select value={form.bloqueado ? "S" : "N"} onValueChange={(v) => setForm((f) => ({ ...f, bloqueado: v === "S" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">Desbloqueada</SelectItem>
                  <SelectItem value="S">Bloqueada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label>Motivo do Bloqueio</Label>
              <Textarea value={form.motivoBloqueio} onChange={(e) => setForm((f) => ({ ...f, motivoBloqueio: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={salvarForm} disabled={salvar.isPending}>{salvar.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

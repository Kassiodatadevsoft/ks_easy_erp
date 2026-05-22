import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Lock,
  User,
  AlertCircle,
  ChevronRight,
  BarChart3,
  ShoppingCart,
  Users,
  FileText,
} from "lucide-react";

const loginSchema = z.object({
  usuario: z.string().min(1, "Informe o usuário"),
  senha: z.string().min(1, "Informe a senha"),
});

type LoginForm = z.infer<typeof loginSchema>;

const FEATURES = [
  { icon: BarChart3, label: "Financeiro" },
  { icon: ShoppingCart, label: "Vendas" },
  { icon: Users, label: "Cadastros" },
  { icon: FileText, label: "Fiscal" },
];

export default function Login() {
  const [, navigate] = useLocation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const loginMutation = trpc.ksAuth.login.useMutation({
    onSuccess: async () => {
      await utils.ksAuth.me.invalidate();
      navigate("/dashboard");
    },
    onError: (err) => {
      setErrorMsg(err.message || "Erro ao realizar login. Tente novamente.");
    },
  });

  const onSubmit = (data: LoginForm) => {
    setErrorMsg(null);
    loginMutation.mutate({ usuario: data.usuario, senha: data.senha });
  };

  const loading = isSubmitting || loginMutation.isPending;

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Painel esquerdo — branding (visível apenas em telas médias+) */}
      <div className="hidden md:flex md:w-[45%] lg:w-1/2 flex-col relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900">
        {/* Padrão de grade decorativo */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Círculos de fundo */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl" />

        <div className="relative flex flex-col justify-between h-full p-10 lg:p-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">KS</span>
              <span className="text-blue-200 font-light text-xl"> Easy ERP</span>
            </div>
          </div>

          {/* Conteúdo central */}
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
                Gestão empresarial
                <br />
                <span className="text-blue-200">simples e eficiente</span>
              </h1>
              <p className="text-blue-200/70 mt-4 text-sm lg:text-base leading-relaxed max-w-sm">
                Controle financeiro, vendas, cadastros e emissão fiscal em uma
                única plataforma integrada ao seu sistema legado.
              </p>
            </div>

            {/* Módulos */}
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 bg-white/8 backdrop-blur rounded-xl px-4 py-3 border border-white/10"
                >
                  <Icon className="w-4 h-4 text-blue-200 shrink-0" />
                  <span className="text-white/80 text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé */}
          <p className="text-blue-300/40 text-xs">
            © {new Date().getFullYear()} KS Consulting — Todos os direitos reservados
          </p>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-slate-950">
        {/* Logo mobile */}
        <div className="flex md:hidden items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-xl">KS</span>
          <span className="text-blue-400 font-light text-xl">Easy ERP</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Título */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Bem-vindo de volta</h2>
            <p className="text-slate-400 text-sm mt-1">
              Informe suas credenciais para acessar o sistema
            </p>
          </div>

          {/* Alerta de erro */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-sm leading-snug">{errorMsg}</p>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Usuário */}
            <div className="space-y-1.5">
              <Label htmlFor="usuario" className="text-slate-300 text-sm">
                Usuário
              </Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <Input
                  id="usuario"
                  type="text"
                  autoComplete="username"
                  placeholder="Digite seu usuário"
                  disabled={loading}
                  className="pl-10 h-11 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl"
                  {...register("usuario")}
                />
              </div>
              {errors.usuario && (
                <p className="text-red-400 text-xs">{errors.usuario.message}</p>
              )}
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-slate-300 text-sm">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  disabled={loading}
                  className="pl-10 h-11 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl"
                  {...register("senha")}
                />
              </div>
              {errors.senha && (
                <p className="text-red-400 text-xs">{errors.senha.message}</p>
              )}
            </div>

            {/* Botão */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] mt-2 shadow-lg shadow-blue-900/30"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  Entrar no sistema
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-slate-700 text-xs mt-8">
            KS Easy ERP — Versão 1.0
          </p>
        </div>
      </div>
    </div>
  );
}

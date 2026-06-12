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
} from "lucide-react";

// Logo original com fundo branco (fica perfeito sobre fundo branco)
const LOGO_FULL_URL = "/logo-full.png";
// Robô original com transparência
const ROBOT_URL = "/robot.png";

const loginSchema = z.object({
  usuario: z.string().min(1, "Informe o usuário"),
  senha:   z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

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
      setErrorMsg(err.message || "Usuário ou senha incorretos. Tente novamente.");
    },
  });

  const onSubmit = (data: LoginForm) => {
    setErrorMsg(null);
    loginMutation.mutate({ usuario: data.usuario, senha: data.senha });
  };

  const loading = isSubmitting || loginMutation.isPending;

  return (
    <div className="min-h-screen flex">

      {/* ── Painel esquerdo — branco com logo e robô ── */}
      <div className="hidden md:flex md:w-[48%] lg:w-1/2 flex-col bg-white border-r border-slate-100 relative overflow-hidden">

        {/* Detalhe decorativo sutil no canto */}
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-blue-50 blur-3xl opacity-60 translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-slate-50 blur-2xl opacity-80 -translate-x-1/3 -translate-y-1/3" />

        <div className="relative flex flex-col justify-between h-full p-10 lg:p-14 z-10">

          {/* Logo no topo */}
          <div>
            <img
              src={LOGO_FULL_URL}
              alt="DataDev"
              className="h-14 object-contain object-left"
            />
          </div>

          {/* Robô centralizado + texto */}
          <div className="flex flex-col items-center gap-6">
            <img
              src={ROBOT_URL}
              alt="DataDev Robot"
              className="w-56 lg:w-72 object-contain drop-shadow-xl"
            />
            <div className="text-center">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 leading-tight">
                Gestão empresarial
                <br />
                <span className="text-blue-700">simples e eficiente</span>
              </h1>
              <p className="text-slate-500 text-sm mt-3 max-w-xs mx-auto leading-relaxed">
                Controle financeiro, vendas, cadastros e emissão fiscal
                em uma plataforma simples, segura e integrada.
              </p>
            </div>
          </div>

          {/* Rodapé */}
          <div className="text-center">
            <p className="text-slate-400 text-xs">
              DataDev — Consultoria e Desenvolvimento de Software
            </p>
            <p className="text-slate-300 text-xs mt-0.5">
              © {new Date().getFullYear()} Todos os direitos reservados
            </p>
          </div>
        </div>
      </div>

      {/* ── Painel direito — formulário escuro ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[#0f1623]">

        {/* Logo mobile */}
        <div className="flex md:hidden flex-col items-center gap-3 mb-10">
          <div className="bg-white rounded-xl px-4 py-2">
            <img src={LOGO_FULL_URL} alt="DataDev" className="h-10 object-contain" />
          </div>
          <img src={ROBOT_URL} alt="Robô DataDev" className="w-24 object-contain" />
        </div>

        <div className="w-full max-w-sm">

          {/* Título */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">Bem-vindo de volta</h2>
            <p className="text-slate-500 text-sm mt-1">
              Informe suas credenciais para acessar o sistema
            </p>
          </div>

          {/* Erro */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5">
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
                  className="pl-10 h-11 bg-[#1a2340] border-[#2a3a5c] text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl"
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
                  className="pl-10 h-11 bg-[#1a2340] border-[#2a3a5c] text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl"
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
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] mt-2 shadow-lg shadow-blue-900/40"
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
            DataDev ERP — Versão 1.0
          </p>
        </div>
      </div>
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";
import type { KsSessionUser } from "@shared/ksTypes";

export type { KsSessionUser };

/**
 * Hook principal de autenticação do KS ERP.
 * Fornece o usuário logado (com GUIDENTIDADE), estado de loading e logout.
 *
 * O GUIDENTIDADE é o identificador da empresa vinculada ao usuário e deve
 * ser propagado para TODAS as queries para garantir isolamento de dados.
 */
export function useKsAuth() {
  const utils = trpc.useUtils();

  const meQuery = trpc.ksAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  const logoutMutation = trpc.ksAuth.logout.useMutation({
    onSuccess: () => {
      utils.ksAuth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      utils.ksAuth.me.setData(undefined, null);
      await utils.ksAuth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    const user = meQuery.data ?? null;
    return {
      /** Dados completos do usuário KS logado */
      user: user as KsSessionUser | null,
      /** GUIDENTIDADE da empresa — use em TODAS as queries para isolamento */
      guidEntidade: user?.guidEntidade ?? null,
      /** Nome da empresa vinculada ao usuário */
      nomeEmpresa: user?.nomeEmpresa ?? user?.fantasia ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(user),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmbeddedSignupInput, MetaConnection, MetaWabaOption } from '@genon/shared';
import { api, notifyError } from '../lib/api';
import { orgKeys } from './organizations';

export const metaKeys = {
  connection: (orgId: string) => ['meta-setup', orgId] as const,
  phones: (orgId: string) => ['meta-setup', orgId, 'phones'] as const,
};

export function useMetaConnection(orgId: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: metaKeys.connection(orgId),
    queryFn: async () => (await api.get<MetaConnection>(`/organizations/${orgId}/meta-setup`)).data,
    // Mientras se espera algo de Meta (webhook, entrega de la prueba)
    refetchInterval: options.poll ? 5000 : false,
  });
}

export function usePhoneNumbers(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: metaKeys.phones(orgId),
    queryFn: async () =>
      (await api.get<MetaWabaOption[]>(`/organizations/${orgId}/meta-setup/phone-numbers`)).data,
    enabled,
  });
}

/**
 * Todas las acciones del asistente devuelven la conexión actualizada. Si
 * Meta responde con error, el paso queda marcado y se refresca igual.
 */
export function useMetaAction<T = void>(orgId: string, method: 'put' | 'post', path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: T) =>
      (await api[method]<MetaConnection>(`/organizations/${orgId}/meta-setup/${path}`, body ?? {})).data,
    onSuccess: (conn) => {
      qc.setQueryData(metaKeys.connection(orgId), conn);
      if (path === 'company') qc.invalidateQueries({ queryKey: orgKeys.one(orgId) });
    },
    onError: (e) => {
      notifyError(e);
      qc.invalidateQueries({ queryKey: metaKeys.connection(orgId) });
    },
  });
}

/** Completa el Registro insertado en la API con lo que devolvió Meta en el navegador. */
export function useCompleteEmbeddedSignup(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: EmbeddedSignupInput) =>
      (await api.post<MetaConnection>(`/organizations/${orgId}/meta-setup/embedded-signup`, body)).data,
    onSuccess: (conn) => {
      qc.setQueryData(metaKeys.connection(orgId), conn);
      qc.invalidateQueries({ queryKey: metaKeys.phones(orgId) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: metaKeys.connection(orgId) }),
  });
}

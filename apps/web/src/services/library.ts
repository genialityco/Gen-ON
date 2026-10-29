import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Protocol, ProtocolInput, Template, TemplateInput } from '@genon/shared';
import { api } from '../lib/api';

/** Plantillas y protocolos de una organización o de la biblioteca global. */
export type Scope = { orgId: string } | 'library';

const base = (scope: Scope) => (scope === 'library' ? '/library' : `/organizations/${scope.orgId}`);
const scopeKey = (scope: Scope) => (scope === 'library' ? 'library' : scope.orgId);

export const libKeys = {
  templates: (scope: Scope) => ['templates', scopeKey(scope)] as const,
  protocols: (scope: Scope) => ['protocols', scopeKey(scope)] as const,
};

export function useTemplates(scope: Scope) {
  return useQuery({
    queryKey: libKeys.templates(scope),
    queryFn: async () => (await api.get<Template[]>(`${base(scope)}/templates`)).data,
  });
}

export function useSaveTemplate(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: TemplateInput }) =>
      id
        ? (await api.put<Template>(`${base(scope)}/templates/${id}`, input)).data
        : (await api.post<Template>(`${base(scope)}/templates`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.templates(scope) }),
  });
}

export function useDeleteTemplate(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${base(scope)}/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.templates(scope) }),
  });
}

export function useSubmitTemplate(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<Template>(`/organizations/${orgId}/templates/${id}/submit`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.templates({ orgId }) }),
  });
}

export function useSyncTemplates(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ updated: number; total: number }>(`/organizations/${orgId}/templates/sync`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.templates({ orgId }) }),
  });
}

export function useProtocols(scope: Scope) {
  return useQuery({
    queryKey: libKeys.protocols(scope),
    queryFn: async () => (await api.get<Protocol[]>(`${base(scope)}/protocols`)).data,
  });
}

export function useSaveProtocol(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProtocolInput }) =>
      id
        ? (await api.put<Protocol>(`${base(scope)}/protocols/${id}`, input)).data
        : (await api.post<Protocol>(`${base(scope)}/protocols`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.protocols(scope) }),
  });
}

export function useDeleteProtocol(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`${base(scope)}/protocols/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.protocols(scope) }),
  });
}

export function useCopyProtocol(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (libraryId: string) =>
      (await api.post<Protocol>(`/organizations/${orgId}/protocols/copy`, { library_id: libraryId })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: libKeys.protocols({ orgId }) });
      qc.invalidateQueries({ queryKey: libKeys.templates({ orgId }) });
    },
  });
}

export function useSeedLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post<{ templates: number; protocols: number }>('/library/seed')).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: libKeys.templates('library') });
      qc.invalidateQueries({ queryKey: libKeys.protocols('library') });
    },
  });
}

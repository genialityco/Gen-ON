import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistantSettingsInput, AssistantTestInput, AssistantTestResult, KnowledgeEntry, KnowledgeInput, Organization } from '@genon/shared';
import { api } from '../lib/api';
import { orgKeys } from './organizations';

const knowledgeKey = (orgId: string) => ['assistant', orgId, 'knowledge'] as const;

export function useAssistantSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssistantSettingsInput) => (await api.patch<Organization>(`/organizations/${orgId}/assistant`, input)).data,
    onSuccess: (org) => qc.setQueryData(orgKeys.one(orgId), org),
  });
}

export function useKnowledge(orgId: string, enabled = true) {
  return useQuery({
    queryKey: knowledgeKey(orgId),
    queryFn: async () => (await api.get<KnowledgeEntry[]>(`/organizations/${orgId}/assistant/knowledge`)).data,
    enabled,
  });
}

export function useSaveKnowledge(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: KnowledgeInput }) =>
      id
        ? (await api.put<KnowledgeEntry>(`/organizations/${orgId}/assistant/knowledge/${id}`, input)).data
        : (await api.post<KnowledgeEntry>(`/organizations/${orgId}/assistant/knowledge`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKey(orgId) }),
  });
}

export function useRemoveKnowledge(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/organizations/${orgId}/assistant/knowledge/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeKey(orgId) }),
  });
}

/** Conversación de prueba (opcionalmente como un paciente): muestra lo que respondería sin enviar nada. */
export function useAssistantTest(orgId: string) {
  return useMutation({
    mutationFn: async (input: AssistantTestInput) =>
      (await api.post<AssistantTestResult>(`/organizations/${orgId}/assistant/test`, input)).data,
  });
}

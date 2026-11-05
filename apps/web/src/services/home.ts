import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttentionKind, OrgHome } from '@genon/shared';
import { api } from '../lib/api';

export const homeKey = (orgId: string) => ['home', orgId] as const;

/** Lo que hay que atender y la agenda del día. */
export function useHome(orgId: string) {
  return useQuery({
    queryKey: homeKey(orgId),
    queryFn: async () => (await api.get<OrgHome>(`/organizations/${orgId}/home`)).data,
    refetchInterval: 60_000,
  });
}

export function useResolveAttention(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id }: { kind: AttentionKind; id: string }) =>
      api.post(`/organizations/${orgId}/home/attention/${kind}/${encodeURIComponent(id)}/resolve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: homeKey(orgId) }),
  });
}

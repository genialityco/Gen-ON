import { useQuery } from '@tanstack/react-query';
import type { OrgMetrics } from '@genon/shared';
import { api } from '../lib/api';

/** from y to: fechas locales YYYY-MM-DD, ambas incluidas. `enabled` falso si el plan no las incluye. */
export function useMetrics(orgId: string, from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['metrics', orgId, from, to],
    queryFn: async () => (await api.get<OrgMetrics>(`/organizations/${orgId}/metrics`, { params: { from, to } })).data,
    placeholderData: (prev) => prev,
    enabled,
  });
}

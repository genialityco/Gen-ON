import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClinicalAccess, ClinicalBackground, ClinicalNote, ClinicalNoteInput, ClinicalView } from '@genon/shared';
import { api } from '../lib/api';

const base = (orgId: string, patientId: string) => `/organizations/${orgId}/patients/${patientId}/clinical`;

export const clinicalKeys = {
  one: (orgId: string, patientId: string) => ['clinical', orgId, patientId] as const,
  log: (orgId: string, patientId: string) => ['clinical', orgId, patientId, 'log'] as const,
};

/** Cada consulta queda en el registro de accesos: no se refresca sola. */
export function useClinical(orgId: string, patientId: string, enabled = true) {
  return useQuery({
    queryKey: clinicalKeys.one(orgId, patientId),
    queryFn: async () => (await api.get<ClinicalView>(base(orgId, patientId))).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateBackground(orgId: string, patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClinicalBackground) => (await api.put<ClinicalView>(`${base(orgId, patientId)}/background`, input)).data,
    onSuccess: (view) => qc.setQueryData(clinicalKeys.one(orgId, patientId), view),
  });
}

export function useAddNote(orgId: string, patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClinicalNoteInput) => (await api.post<ClinicalNote>(`${base(orgId, patientId)}/notes`, input)).data,
    onSuccess: (note) =>
      qc.setQueryData<ClinicalView>(clinicalKeys.one(orgId, patientId), (v) => (v ? { ...v, notes: [note, ...v.notes] } : v)),
  });
}

export function useClinicalAccessLog(orgId: string, patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: clinicalKeys.log(orgId, patientId),
    queryFn: async () => (await api.get<ClinicalAccess[]>(`${base(orgId, patientId)}/access-log`)).data,
    enabled,
  });
}

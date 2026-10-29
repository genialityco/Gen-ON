import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddMemberInput,
  CreateOrganizationInput,
  Member,
  OrgRole,
  Organization,
  OrganizationSettingsInput,
  UpdateOrganizationInput,
} from '@genon/shared';
import { api } from '../lib/api';

export const orgKeys = {
  all: ['organizations'] as const,
  one: (orgId: string) => ['organizations', orgId] as const,
  members: (orgId: string) => ['organizations', orgId, 'members'] as const,
};

export function useOrganizations() {
  return useQuery({
    queryKey: orgKeys.all,
    queryFn: async () => (await api.get<Organization[]>('/organizations')).data,
  });
}

export function useOrganization(orgId: string | null | undefined) {
  return useQuery({
    queryKey: orgKeys.one(orgId ?? ''),
    queryFn: async () => (await api.get<Organization>(`/organizations/${orgId}`)).data,
    enabled: !!orgId,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) =>
      (await api.post<Organization>('/organizations', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.all }),
  });
}

export function useUpdateOrganization(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationInput) =>
      (await api.patch<Organization>(`/organizations/${orgId}`, input)).data,
    onSuccess: (org) => {
      qc.setQueryData(orgKeys.one(orgId), org);
      qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateSettings(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrganizationSettingsInput) =>
      (await api.patch<Organization>(`/organizations/${orgId}/settings`, input)).data,
    onSuccess: (org) => qc.setQueryData(orgKeys.one(orgId), org),
  });
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: orgKeys.members(orgId),
    queryFn: async () => (await api.get<Member[]>(`/organizations/${orgId}/members`)).data,
  });
}

export function useAddMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddMemberInput) =>
      (await api.post<Member>(`/organizations/${orgId}/members`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useUpdateMemberRole(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uid, role }: { uid: string; role: OrgRole }) =>
      api.patch(`/organizations/${orgId}/members/${uid}`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useRemoveMember(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uid: string) => api.delete(`/organizations/${orgId}/members/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

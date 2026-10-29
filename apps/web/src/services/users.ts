import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, ManagedUser, MemberRole, UpdateUserInput } from '@genon/shared';
import { api } from '../lib/api';

const usersKey = ['users'] as const;

/** Administración de cuentas (superadmin). */
export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: async () => (await api.get<ManagedUser[]>('/users')).data,
  });
}

function useUserMutation<T>(fn: (input: T) => Promise<ManagedUser>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (user) => {
      qc.setQueryData<ManagedUser[]>(usersKey, (list) => {
        if (!list) return list;
        const rest = list.filter((u) => u.uid !== user.uid);
        return [...rest, user].sort((a, b) => a.email.localeCompare(b.email));
      });
      // Los equipos de las organizaciones cambian con los accesos
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export const useCreateUser = () =>
  useUserMutation(async (input: CreateUserInput) => (await api.post<ManagedUser>('/users', input)).data);

export const useUpdateUser = (uid: string) =>
  useUserMutation(async (input: UpdateUserInput) => (await api.patch<ManagedUser>(`/users/${uid}`, input)).data);

export const useSetMembership = (uid: string) =>
  useUserMutation(
    async ({ orgId, role }: { orgId: string; role: MemberRole }) =>
      (await api.put<ManagedUser>(`/users/${uid}/memberships/${orgId}`, { role })).data,
  );

export const useRemoveMembership = (uid: string) =>
  useUserMutation(async (orgId: string) => (await api.delete<ManagedUser>(`/users/${uid}/memberships/${orgId}`)).data);

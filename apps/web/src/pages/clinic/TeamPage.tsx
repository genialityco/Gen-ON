import { Stack, Title } from '@mantine/core';
import { useOrgId } from '../../auth/guards';
import { MembersPanel } from '../../features/organizations/MembersPanel';

export function TeamPage() {
  const orgId = useOrgId();
  return (
    <Stack>
      <Title order={2}>Equipo</Title>
      <MembersPanel orgId={orgId} />
    </Stack>
  );
}

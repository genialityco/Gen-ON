import { Loader, Stack, Text, Title } from '@mantine/core';
import { hasAtLeast } from '@genon/shared';
import { useOrgRole } from '../../auth/AuthProvider';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { ProtocolsList } from '../../features/protocols/ProtocolsList';

export function ProtocolsPage() {
  const orgId = useOrgId();
  const canEdit = hasAtLeast(useOrgRole(orgId), 'org_admin');
  const { data: org } = useOrganization(orgId);
  if (!org) return <Loader />;
  return (
    <Stack>
      <div>
        <Title order={2}>Protocolos</Title>
        <Text c="dimmed" size="sm">
          Secuencias de mensajes por procedimiento, contadas desde la fecha del procedimiento o la cita.
        </Text>
      </div>
      <ProtocolsList scope={{ orgId }} canEdit={canEdit} defaults={org} />
    </Stack>
  );
}

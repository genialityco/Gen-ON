import { Stack, Text, Title } from '@mantine/core';
import { hasAtLeast } from '@genon/shared';
import { useOrgRole } from '../../auth/AuthProvider';
import { useOrgId } from '../../auth/guards';
import { TemplatesList } from '../../features/templates/TemplatesList';

export function TemplatesPage() {
  const orgId = useOrgId();
  const canEdit = hasAtLeast(useOrgRole(orgId), 'org_admin');
  return (
    <Stack>
      <div>
        <Title order={2}>Plantillas</Title>
        <Text c="dimmed" size="sm">
          Mensajes aprobados por Meta que usan los protocolos. Cada texto debe validarlo un profesional de la salud
          antes de enviarlo a revisión.
        </Text>
      </div>
      <TemplatesList scope={{ orgId }} canEdit={canEdit} />
    </Stack>
  );
}

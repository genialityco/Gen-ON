import { Button, Group, Stack, Tabs, Text, Title } from '@mantine/core';
import { IconListDetails, IconMessage2, IconSparkles } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { TemplatesList } from '../../features/templates/TemplatesList';
import { ProtocolsList } from '../../features/protocols/ProtocolsList';
import { useSeedLibrary } from '../../services/library';
import { notifyError, notifySuccess } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';

const LIBRARY_DEFAULTS = { timezone: 'America/Bogota', default_send_time: '09:00', blocked_weekdays: [0] };

/** Biblioteca global de Gen.iality: las clínicas copian de aquí sus protocolos. */
export function LibraryPage() {
  const { tab = 'protocols' } = useParams();
  const navigate = useNavigate();
  const seed = useSeedLibrary();
  const canEdit = useAuth().role === 'superadmin';

  const onSeed = () =>
    seed.mutate(undefined, {
      onSuccess: (r) => notifySuccess(`Ejemplos cargados: ${r.templates} plantillas y ${r.protocols} protocolos`),
      onError: notifyError,
    });

  return (
    <Stack>
      <Group justify="space-between" align="start">
        <div>
          <Title order={2}>Biblioteca</Title>
          <Text c="dimmed" size="sm">
            Protocolos y plantillas base. Al copiarlos, cada clínica recibe las plantillas en borrador para validarlas
            con su equipo y enviarlas a Meta con su cuenta.
          </Text>
        </div>
        {canEdit && (
          <Button variant="default" leftSection={<IconSparkles size={16} />} loading={seed.isPending} onClick={onSeed}>
            Cargar ejemplos
          </Button>
        )}
      </Group>
      <Tabs value={tab} onChange={(v) => navigate(`/admin/library/${v}`)}>
        <Tabs.List>
          <Tabs.Tab value="protocols" leftSection={<IconListDetails size={16} />}>
            Protocolos
          </Tabs.Tab>
          <Tabs.Tab value="templates" leftSection={<IconMessage2 size={16} />}>
            Plantillas
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="protocols" pt="md">
          <ProtocolsList scope="library" canEdit={canEdit} defaults={LIBRARY_DEFAULTS} />
        </Tabs.Panel>
        <Tabs.Panel value="templates" pt="md">
          <TemplatesList scope="library" canEdit={canEdit} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

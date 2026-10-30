import { Anchor, Badge, Button, Group, Loader, Stack, Tabs, Text, Title } from '@mantine/core';
import { IconArrowRight, IconBrandWhatsapp, IconSettings, IconUsers } from '@tabler/icons-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ORG_STATUS_LABELS, PLANS } from '@genon/shared';
import { useOrganization } from '../../services/organizations';
import { OrganizationSettings } from '../../features/organizations/OrganizationSettings';
import { MembersPanel } from '../../features/organizations/MembersPanel';
import { MetaSetupWizard } from '../../features/meta-setup/MetaSetupWizard';
import { STATUS_COLORS } from './OrganizationsPage';
import { useAuth } from '../../auth/AuthProvider';

const TABS = ['meta', 'members', 'settings'] as const;

export function OrganizationPage() {
  const { orgId = '', tab } = useParams();
  const navigate = useNavigate();
  const { data: org, isLoading } = useOrganization(orgId);
  const isSuper = useAuth().role === 'superadmin';
  const current = TABS.includes(tab as (typeof TABS)[number]) ? tab! : 'meta';

  if (isLoading) return <Loader />;
  if (!org) return <Text>Organización no encontrada.</Text>;

  return (
    <Stack>
      <div>
        <Anchor component={Link} to="/admin/organizations" size="sm">
          ← Organizaciones
        </Anchor>
        <Group justify="space-between" mt={4}>
          <Group gap="sm">
            <Title order={2}>{org.name}</Title>
            <Badge color={STATUS_COLORS[org.status]} variant="light">
              {ORG_STATUS_LABELS[org.status]}
            </Badge>
            <Badge variant="outline">{PLANS[org.plan]?.label}</Badge>
            <Badge variant="outline" color="gray">
              {org.monthly_message_limit === null
                ? 'Mensajes sin límite'
                : `Límite: ${org.monthly_message_limit.toLocaleString('es-CO')} mensajes/mes`}
            </Badge>
          </Group>
          <Button component={Link} to={`/org/${orgId}`} variant="light" rightSection={<IconArrowRight size={16} />}>
            Abrir panel de la clínica
          </Button>
        </Group>
      </div>

      <Tabs value={current} onChange={(v) => navigate(`/admin/organizations/${orgId}/${v}`)}>
        <Tabs.List>
          <Tabs.Tab value="meta" leftSection={<IconBrandWhatsapp size={16} />}>
            Conexión WhatsApp
          </Tabs.Tab>
          <Tabs.Tab value="members" leftSection={<IconUsers size={16} />}>
            Equipo
          </Tabs.Tab>
          {isSuper && (
            <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
              Configuración
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="meta" pt="md">
          <MetaSetupWizard orgId={orgId} />
        </Tabs.Panel>
        <Tabs.Panel value="members" pt="md">
          <MembersPanel orgId={orgId} />
        </Tabs.Panel>
        {isSuper && (
          <Tabs.Panel value="settings" pt="md">
            <OrganizationSettings org={org} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
  );
}

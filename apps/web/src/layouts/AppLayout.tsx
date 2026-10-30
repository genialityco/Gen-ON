import { AppShell, Burger, Divider, Group, Menu, NavLink, ScrollArea, Select, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBook,
  IconBuildingHospital,
  IconCalendarEvent,
  IconCalendarTime,
  IconChevronDown,
  IconHome,
  IconListDetails,
  IconLogout,
  IconMessage2,
  IconSettings,
  IconUserCog,
  IconUserHeart,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { ROLE_LABELS, hasAtLeast } from '@genon/shared';
import { useAuth, useOrgRole } from '../auth/AuthProvider';
import { useOrganization } from '../services/organizations';

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconHome;
  exact?: boolean;
}

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, role, memberships, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // El menú de la clínica aparece dentro de una organización
  const orgMatch = useMatch('/org/:orgId/*');
  const orgId = orgMatch?.params.orgId ?? null;
  const orgRole = useOrgRole(orgId);
  const { data: org } = useOrganization(orgId);

  const adminItems: NavItem[] = role
    ? [
        { to: '/admin/organizations', label: 'Organizaciones', icon: IconBuildingHospital },
        ...(role === 'superadmin' ? [{ to: '/admin/users', label: 'Usuarios', icon: IconUserCog }] : []),
        { to: '/admin/library', label: 'Biblioteca', icon: IconBook },
      ]
    : [];
  const clinicItems: NavItem[] = orgId
    ? [
        { to: `/org/${orgId}`, label: 'Inicio', icon: IconHome, exact: true },
        { to: `/org/${orgId}/patients`, label: 'Pacientes', icon: IconUserHeart },
        { to: `/org/${orgId}/appointments`, label: 'Citas', icon: IconCalendarTime },
        { to: `/org/${orgId}/schedule`, label: 'Parrilla', icon: IconCalendarEvent },
        { to: `/org/${orgId}/protocols`, label: 'Protocolos', icon: IconListDetails },
        { to: `/org/${orgId}/templates`, label: 'Plantillas', icon: IconMessage2 },
        ...(hasAtLeast(orgRole, 'org_admin')
          ? [
              { to: `/org/${orgId}/team`, label: 'Equipo', icon: IconUsers },
              { to: `/org/${orgId}/settings`, label: 'Configuración', icon: IconSettings },
            ]
          : []),
      ]
    : [];

  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      component={RouterLink}
      to={item.to}
      label={item.label}
      leftSection={<item.icon size={18} />}
      active={item.exact ? pathname === item.to : pathname.startsWith(item.to)}
      onClick={close}
    />
  );

  // Selector para quien tiene varias organizaciones (el superadmin usa Organizaciones)
  const switcher = role !== 'superadmin' && memberships.length > 1 && (
    <Select
      size="xs"
      mb="xs"
      placeholder="Elegir organización"
      data={memberships.map((m) => ({ value: m.org_id, label: m.org_name }))}
      value={orgId}
      onChange={(v) => {
        if (v) {
          navigate(`/org/${v}`);
          close();
        }
      }}
      allowDeselect={false}
      searchable
    />
  );

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg">
              Gen<Text span c="teal" inherit>.ON</Text>
            </Text>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap={6} wrap="nowrap">
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm" fw={500} lh={1.2} truncate maw={180}>
                      {user?.displayName || user?.email}
                    </Text>
                    <Text size="xs" c="dimmed" lh={1.2}>
                      {(role && ROLE_LABELS[role]) || (orgRole && ROLE_LABELS[orgRole]) || ''}
                    </Text>
                  </div>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconLogout size={16} />} onClick={logout}>
                Cerrar sesión
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {adminItems.map(renderItem)}
          {(clinicItems.length > 0 || switcher) && (
            <>
              {adminItems.length > 0 && <Divider my="xs" />}
              {switcher}
              {clinicItems.length > 0 && (
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py={6} truncate>
                  {org?.name ?? 'Clínica'}
                </Text>
              )}
              {clinicItems.map(renderItem)}
            </>
          )}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

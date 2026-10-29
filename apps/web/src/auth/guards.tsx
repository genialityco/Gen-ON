import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { hasAtLeast, type GlobalRole, type Role } from '@genon/shared';
import { useAuth, useOrgRole } from './AuthProvider';
import { NoAccessPage } from '../pages/NoAccessPage';

const LAST_ORG_KEY = 'genon:last-org';

export function rememberOrg(orgId: string) {
  try {
    localStorage.setItem(LAST_ORG_KEY, orgId);
  } catch {
    // sin almacenamiento: se entra a la primera
  }
}

function lastOrg(): string | null {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
}

/** Sesión iniciada; con `roles`, además uno de esos roles globales. */
export function RequireAuth({ roles }: { roles?: GlobalRole[] }) {
  const { user, role, memberships, loading, error, logout, refresh } = useAuth();
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (error) {
    return (
      <Center h="100vh" p="md">
        <Stack align="center" maw={420} ta="center">
          <Text fw={600}>No se pudo cargar tu cuenta</Text>
          <Text size="sm" c="dimmed">
            {error}
          </Text>
          <Button onClick={refresh}>Reintentar</Button>
          <Button variant="subtle" onClick={logout}>
            Cerrar sesión
          </Button>
        </Stack>
      </Center>
    );
  }
  if (!role && !memberships.length) return <NoAccessPage />;
  if (roles && (!role || !roles.includes(role))) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Páginas de una organización (/org/:orgId/...): exige al menos `min` en ella. */
export function RequireOrg({ min = 'operator' }: { min?: Role }) {
  const { orgId = '' } = useParams();
  const orgRole = useOrgRole(orgId);
  if (!orgRole) return <Navigate to="/" replace />;
  if (!hasAtLeast(orgRole, min)) return <Navigate to={`/org/${orgId}`} replace />;
  rememberOrg(orgId);
  return <Outlet />;
}

/** Gen.iality entra a la administración; la clínica, a su última organización. */
export function HomeRedirect() {
  const { role, memberships } = useAuth();
  if (role) return <Navigate to="/admin/organizations" replace />;
  const last = lastOrg();
  const target = memberships.find((m) => m.org_id === last) ?? memberships[0];
  return <Navigate to={`/org/${target.org_id}`} replace />;
}

/** orgId de la ruta /org/:orgId. */
export function useOrgId(): string {
  return useParams().orgId ?? '';
}

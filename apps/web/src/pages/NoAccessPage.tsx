import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../auth/AuthProvider';

export function NoAccessPage() {
  const { user, logout, refresh } = useAuth();
  return (
    <Center h="100vh" p="md">
      <Stack align="center" maw={420} ta="center">
        <Title order={3}>Sin acceso</Title>
        <Text c="dimmed">
          La cuenta {user?.email} no tiene organizaciones asignadas. Pide al administrador de tu clínica que te agregue
          al equipo.
        </Text>
        <Button variant="light" onClick={refresh}>
          Ya me agregaron
        </Button>
        <Button variant="subtle" onClick={logout}>
          Cerrar sesión
        </Button>
      </Stack>
    </Center>
  );
}

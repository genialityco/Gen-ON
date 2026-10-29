import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconMail, IconPlus, IconSearch, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  ROLE_LABELS,
  type GlobalRole,
  type ManagedUser,
  type MemberRole,
  type Membership,
} from '@genon/shared';
import { useAuth } from '../../auth/AuthProvider';
import { useOrganizations } from '../../services/organizations';
import { useCreateUser, useRemoveMembership, useSetMembership, useUpdateUser, useUsers } from '../../services/users';
import { auth } from '../../lib/firebase';
import { notifyError, notifySuccess } from '../../lib/api';

type AccountType = 'superadmin' | 'staff' | 'clinic';

const TYPE_OPTIONS = [
  { value: 'clinic', label: 'Usuario de clínica' },
  { value: 'staff', label: 'Equipo Gen.iality' },
  { value: 'superadmin', label: 'Superadmin' },
];
const TYPE_COLORS: Record<AccountType, string> = { superadmin: 'red', staff: 'grape', clinic: 'blue' };
const CLINIC_ROLES = [
  { value: 'org_admin', label: ROLE_LABELS.org_admin },
  { value: 'operator', label: ROLE_LABELS.operator },
];

const typeOf = (u: Pick<ManagedUser, 'role'>): AccountType => u.role ?? 'clinic';
const roleOfType = (t: AccountType): GlobalRole | null => (t === 'clinic' ? null : t);
const typeLabel = (t: AccountType) => TYPE_OPTIONS.find((o) => o.value === t)!.label;

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nunca';

/** Cuentas de la plataforma y sus accesos a organizaciones (solo superadmin). */
export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const [type, setType] = useState<'all' | AccountType>('all');
  const [q, setQ] = useState('');
  const [query] = useDebouncedValue(q, 200);
  const [creating, setCreating] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const open = users?.find((u) => u.uid === openUid) ?? null;

  const visible = useMemo(() => {
    const n = query.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (type === 'all' || typeOf(u) === type) &&
        (!n ||
          u.email.includes(n) ||
          (u.name ?? '').toLowerCase().includes(n) ||
          u.memberships.some((m) => m.org_name.toLowerCase().includes(n))),
    );
  }, [users, type, query]);

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Usuarios</Title>
          <Text c="dimmed" size="sm">
            Cuentas del equipo Gen.iality y de las clínicas, y a qué organizaciones entra cada una.
          </Text>
        </div>
        <Button leftSection={<IconUserPlus size={16} />} onClick={() => setCreating(true)}>
          Nueva cuenta
        </Button>
      </Group>

      <Group>
        <SegmentedControl
          value={type}
          onChange={(v) => setType(v as typeof type)}
          data={[{ value: 'all', label: 'Todas' }, ...TYPE_OPTIONS.map((o) => ({ ...o, label: o.label.replace('Usuario de clínica', 'Clínicas') }))]}
        />
        <TextInput
          placeholder="Buscar por correo, nombre u organización"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          w={320}
        />
      </Group>

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : !visible.length ? (
          <Text c="dimmed" p="md">
            Sin cuentas.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Persona</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Organizaciones</Table.Th>
                  <Table.Th>Último ingreso</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((u) => (
                  <Table.Tr key={u.uid} style={{ cursor: 'pointer', opacity: u.disabled ? 0.55 : 1 }} onClick={() => setOpenUid(u.uid)}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {u.name || u.email}
                      </Text>
                      {u.name && (
                        <Text size="xs" c="dimmed">
                          {u.email}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Badge variant="light" color={TYPE_COLORS[typeOf(u)]}>
                          {typeLabel(typeOf(u))}
                        </Badge>
                        {u.disabled && (
                          <Badge variant="outline" color="gray">
                            Desactivada
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <MembershipBadges user={u} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {fmt(u.last_sign_in)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nueva cuenta" size="lg">
        <CreateUserForm
          onCreated={(uid) => {
            setCreating(false);
            setOpenUid(uid);
          }}
        />
      </Modal>

      <Drawer opened={!!open} onClose={() => setOpenUid(null)} position="right" size="lg" title={open?.email}>
        {open && <UserEditor key={open.uid} user={open} />}
      </Drawer>
    </Stack>
  );
}

function MembershipBadges({ user }: { user: ManagedUser }) {
  if (user.role === 'superadmin') {
    return (
      <Text size="sm" c="dimmed">
        Todas
      </Text>
    );
  }
  if (!user.memberships.length) {
    return (
      <Text size="sm" c="orange">
        Sin organizaciones
      </Text>
    );
  }
  const shown = user.memberships.slice(0, 3);
  const rest = user.memberships.length - shown.length;
  return (
    <Group gap={4}>
      {shown.map((m) => (
        <Badge key={m.org_id} variant="outline" color="gray" tt="none">
          {m.org_name}
          {m.role !== 'staff' && ` · ${ROLE_LABELS[m.role]}`}
        </Badge>
      ))}
      {rest > 0 && (
        <Tooltip label={user.memberships.slice(3).map((m) => m.org_name).join(', ')}>
          <Badge variant="light" color="gray">
            +{rest}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}

function CreateUserForm({ onCreated }: { onCreated: (uid: string) => void }) {
  const create = useCreateUser();
  const { data: orgs = [] } = useOrganizations();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('clinic');
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState<{ org_id: string; role: MemberRole }[]>([]);
  const [pickOrg, setPickOrg] = useState<string | null>(null);
  const [pickRole, setPickRole] = useState<MemberRole>('org_admin');

  const validEmail = /^\S+@\S+\.\S+$/.test(email);
  const validPassword = !password || password.length >= 8;
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const submit = async () => {
    try {
      const user = await create.mutateAsync({
        email,
        name: name || null,
        role: roleOfType(type),
        password: password || null,
        memberships: type === 'superadmin' ? [] : access.map((a) => ({ ...a, role: type === 'staff' ? 'staff' : a.role })),
      });
      if (!password) await sendPasswordResetEmail(auth, user.email).catch(() => undefined);
      notifySuccess(password ? 'Cuenta creada con contraseña' : 'Cuenta creada: le llegará un correo para definir su contraseña');
      onCreated(user.uid);
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Stack>
      <Group grow>
        <TextInput label="Correo" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.currentTarget.value)} />
      </Group>
      <Select
        label="Tipo de cuenta"
        data={TYPE_OPTIONS}
        value={type}
        onChange={(v) => v && setType(v as AccountType)}
        allowDeselect={false}
        description={
          type === 'superadmin'
            ? 'Acceso total: todas las organizaciones, usuarios y biblioteca.'
            : type === 'staff'
              ? 'Configura WhatsApp, plantillas y protocolos solo en las organizaciones asignadas.'
              : 'Personal de una o varias clínicas, con un rol en cada una.'
        }
      />
      <PasswordInput
        label="Contraseña (opcional)"
        description="Vacío: le llega un correo para definirla"
        value={password}
        onChange={(e) => setPassword(e.currentTarget.value)}
        error={!validPassword ? 'Mínimo 8 caracteres' : undefined}
      />

      {type !== 'superadmin' && (
        <>
          <Divider label="Organizaciones" labelPosition="left" />
          {access.map((a) => (
            <Group key={a.org_id} justify="space-between">
              <Text size="sm">
                {orgName(a.org_id)}
                {type === 'clinic' && ` · ${ROLE_LABELS[a.role]}`}
              </Text>
              <ActionIcon variant="subtle" color="red" onClick={() => setAccess(access.filter((x) => x.org_id !== a.org_id))}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Group align="end" gap="xs">
            <Select
              style={{ flex: 1 }}
              size="xs"
              placeholder="Organización"
              data={orgs.filter((o) => !access.some((a) => a.org_id === o.id)).map((o) => ({ value: o.id, label: o.name }))}
              value={pickOrg}
              onChange={setPickOrg}
              searchable
            />
            {type === 'clinic' && (
              <Select size="xs" w={150} data={CLINIC_ROLES} value={pickRole} onChange={(v) => v && setPickRole(v as MemberRole)} allowDeselect={false} />
            )}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              disabled={!pickOrg}
              onClick={() => {
                setAccess([...access, { org_id: pickOrg!, role: pickRole }]);
                setPickOrg(null);
              }}
            >
              Agregar
            </Button>
          </Group>
        </>
      )}

      <Button onClick={submit} loading={create.isPending} disabled={!validEmail || !validPassword}>
        Crear cuenta
      </Button>
    </Stack>
  );
}

function UserEditor({ user }: { user: ManagedUser }) {
  const { user: me } = useAuth();
  const self = me?.uid === user.uid;
  const update = useUpdateUser(user.uid);
  const setMembership = useSetMembership(user.uid);
  const removeMembership = useRemoveMembership(user.uid);
  const { data: orgs = [] } = useOrganizations();
  const [name, setName] = useState(user.name ?? '');
  const [password, setPassword] = useState('');
  const [pickOrg, setPickOrg] = useState<string | null>(null);
  const [pickRole, setPickRole] = useState<MemberRole>('org_admin');
  const type = typeOf(user);

  const run = <T,>(m: { mutate: (v: T, o: object) => void }, v: T, msg: string) =>
    m.mutate(v, { onSuccess: () => notifySuccess(msg), onError: notifyError });

  const addAccess = () => {
    if (!pickOrg) return;
    setMembership.mutate(
      { orgId: pickOrg, role: type === 'staff' ? 'staff' : pickRole },
      { onSuccess: () => (setPickOrg(null), notifySuccess('Acceso agregado')), onError: notifyError },
    );
  };

  return (
    <Stack>
      <Group align="end">
        <TextInput style={{ flex: 1 }} label="Nombre" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Button variant="default" disabled={name === (user.name ?? '')} loading={update.isPending} onClick={() => run(update, { name: name || null }, 'Nombre guardado')}>
          Guardar
        </Button>
      </Group>

      <Select
        label="Tipo de cuenta"
        data={TYPE_OPTIONS}
        value={type}
        disabled={self}
        description={self ? 'No puedes cambiar tu propio tipo de cuenta' : 'Al cambiarlo se cierran sus sesiones abiertas'}
        onChange={(v) => v && v !== type && run(update, { role: roleOfType(v as AccountType) }, 'Tipo de cuenta actualizado')}
        allowDeselect={false}
      />

      <Switch
        label="Cuenta activa"
        description={self ? 'No puedes desactivar tu propia cuenta' : 'Desactivada: no puede iniciar sesión y se cierran sus sesiones'}
        checked={!user.disabled}
        disabled={self}
        onChange={(e) => run(update, { disabled: !e.currentTarget.checked }, e.currentTarget.checked ? 'Cuenta activada' : 'Cuenta desactivada')}
      />

      <Divider label="Contraseña" labelPosition="left" />
      <Group align="end">
        <PasswordInput
          style={{ flex: 1 }}
          label="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={password && password.length < 8 ? 'Mínimo 8 caracteres' : undefined}
        />
        <Button
          variant="default"
          disabled={password.length < 8}
          loading={update.isPending}
          onClick={() => update.mutate({ password }, { onSuccess: () => (setPassword(''), notifySuccess('Contraseña definida')), onError: notifyError })}
        >
          Definir
        </Button>
      </Group>
      <Button
        variant="subtle"
        leftSection={<IconMail size={16} />}
        w="fit-content"
        onClick={() =>
          sendPasswordResetEmail(auth, user.email)
            .then(() => notifySuccess(`Correo enviado a ${user.email}`))
            .catch(notifyError)
        }
      >
        Enviarle correo para definir la contraseña
      </Button>

      <Divider label="Organizaciones" labelPosition="left" />
      {type === 'superadmin' ? (
        <Alert color="gray">Un superadmin entra a todas las organizaciones.</Alert>
      ) : (
        <>
          {!user.memberships.length && (
            <Text size="sm" c="orange">
              Sin organizaciones: no puede entrar a ninguna.
            </Text>
          )}
          {user.memberships.map((m: Membership) => (
            <Group key={m.org_id} justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500} truncate>
                {m.org_name}
              </Text>
              <Group gap="xs" wrap="nowrap">
                {type === 'staff' ? (
                  <Badge variant="light" color="grape">
                    {ROLE_LABELS.staff}
                  </Badge>
                ) : (
                  <Select
                    size="xs"
                    w={150}
                    data={CLINIC_ROLES}
                    value={m.role}
                    allowDeselect={false}
                    onChange={(v) => v && v !== m.role && run(setMembership, { orgId: m.org_id, role: v as MemberRole }, 'Rol actualizado')}
                  />
                )}
                <ActionIcon variant="subtle" color="red" onClick={() => run(removeMembership, m.org_id, 'Acceso quitado')}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
          <Group align="end" gap="xs">
            <Select
              style={{ flex: 1 }}
              size="xs"
              placeholder="Agregar organización"
              data={orgs.filter((o) => !user.memberships.some((m) => m.org_id === o.id)).map((o) => ({ value: o.id, label: o.name }))}
              value={pickOrg}
              onChange={setPickOrg}
              searchable
            />
            {type === 'clinic' && (
              <Select size="xs" w={150} data={CLINIC_ROLES} value={pickRole} onChange={(v) => v && setPickRole(v as MemberRole)} allowDeselect={false} />
            )}
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={!pickOrg} loading={setMembership.isPending} onClick={addAccess}>
              Agregar
            </Button>
          </Group>
        </>
      )}

      <Text size="xs" c="dimmed">
        Creada {fmt(user.created_at)} · último ingreso {fmt(user.last_sign_in)}
      </Text>
    </Stack>
  );
}

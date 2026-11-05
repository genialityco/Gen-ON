import { useMemo, useState } from 'react';
import { Badge, Button, Drawer, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFileExport, IconFileImport, IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { usePatients } from '../../services/patients';
import { useProtocols, useTemplates } from '../../services/library';
import { NewPatientForm } from '../../features/patients/NewPatientForm';
import { PatientDrawer } from '../../features/patients/PatientDrawer';
import { ImportPatients } from '../../features/patients/ImportPatients';
import { fmtDateTime } from '../../lib/format';
import { exportPatients } from '../../lib/patientsExcel';
import { notifyError } from '../../lib/api';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function PatientsPage() {
  const orgId = useOrgId();
  const { data: org } = useOrganization(orgId);
  const { data: patients, isLoading } = usePatients(orgId);
  const { data: protocols = [] } = useProtocols({ orgId });
  const { data: templates = [] } = useTemplates({ orgId });
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [query] = useDebouncedValue(q, 200);
  const openId = params.get('p');

  const filtered = useMemo(() => {
    const n = normalize(query.trim());
    if (!n) return patients ?? [];
    const digits = n.replace(/\D/g, '');
    return (patients ?? []).filter(
      (p) =>
        normalize(`${p.first_name} ${p.last_name}`).includes(n) ||
        (digits.length >= 3 && p.phone.includes(digits)) ||
        (p.document && p.document.includes(n)),
    );
  }, [patients, query]);

  const open = (id: string | null) => setParams(id ? { p: id } : {});

  if (!org) return <Loader />;

  // Exporta lo que se ve: todos o el resultado de la búsqueda
  const exportExcel = () => {
    setExporting(true);
    exportPatients(filtered, org.timezone, org.name)
      .catch(notifyError)
      .finally(() => setExporting(false));
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Pacientes</Title>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
            Importar
          </Button>
          <Button
            variant="default"
            leftSection={<IconFileExport size={16} />}
            loading={exporting}
            disabled={!filtered.length}
            onClick={exportExcel}
          >
            Exportar
          </Button>
          <Button leftSection={<IconUserPlus size={16} />} onClick={() => setCreating(true)}>
            Nuevo paciente
          </Button>
        </Group>
      </Group>
      <TextInput
        placeholder="Buscar por nombre, celular o documento"
        leftSection={<IconSearch size={16} />}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        maw={420}
      />

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : !filtered.length ? (
          <Text c="dimmed" p="md">
            {patients?.length ? 'Sin resultados.' : 'Aún no hay pacientes registrados.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Paciente</Table.Th>
                  <Table.Th>Celular</Table.Th>
                  <Table.Th>Protocolo</Table.Th>
                  <Table.Th>Registrado</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((p) => (
                  <Table.Tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => open(p.id)}>
                    <Table.Td fw={500}>
                      {p.first_name} {p.last_name}
                    </Table.Td>
                    <Table.Td>+{p.phone}</Table.Td>
                    <Table.Td>
                      {p.active_protocols.length ? (
                        <Group gap={4}>
                          {p.active_protocols.map((pr) => (
                            <Badge key={pr.id} variant="light" size="sm">
                              {pr.name}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {fmtDateTime(p.created_at, org.timezone)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {p.opted_out && (
                        <Badge color="red" variant="light" size="sm">
                          Baja
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={creating} onClose={() => setCreating(false)} title="Nuevo paciente" size="lg">
        <NewPatientForm
          org={org}
          protocols={protocols}
          onDone={(id) => {
            setCreating(false);
            open(id);
          }}
        />
      </Modal>

      <Modal opened={importing} onClose={() => setImporting(false)} title="Importar pacientes desde Excel" size="lg">
        <ImportPatients org={org} onDone={() => setImporting(false)} />
      </Modal>

      <Drawer opened={!!openId} onClose={() => open(null)} position="right" size="lg" title="Paciente">
        {openId && (
          <PatientDrawer key={openId} org={org} patientId={openId} protocols={protocols} templates={templates} initialTab={params.get('t') ?? undefined} />
        )}
      </Drawer>
    </Stack>
  );
}

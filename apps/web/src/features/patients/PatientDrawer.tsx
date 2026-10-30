import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Spoiler,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Timeline,
  Title,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconBan,
  IconCalendarTime,
  IconListDetails,
  IconMessage2,
  IconPencil,
  IconPlus,
  IconSend,
  IconStethoscope,
} from '@tabler/icons-react';
import {
  CONSENT_METHOD_LABELS,
  ENROLLMENT_STATUS_LABELS,
  canReadClinical,
  dayOffsetLabel,
  type Appointment,
  type Organization,
  type Patient,
  type PatientInput,
  type Protocol,
  type Template,
} from '@genon/shared';
import {
  useCancelEnrollment,
  useEnroll,
  useManualSend,
  useOptOut,
  usePatientDetail,
  useUpdatePatient,
} from '../../services/patients';
import { notifyError, notifySuccess } from '../../lib/api';
import { fmtDateTime, fmtDay } from '../../lib/format';
import { EnrollmentFields, emptyEnrollment, toEnrollmentInput } from './EnrollmentFields';
import { OutboxActions } from './OutboxActions';
import { OutboxBadges, OUTBOX_COLORS } from './OutboxBadges';
import { patientValidators } from './NewPatientForm';
import { useOrgRole } from '../../auth/AuthProvider';
import { AppointmentCard } from '../appointments/AppointmentCard';
import { AppointmentForm } from '../appointments/AppointmentForm';
import { ClinicalRecordPanel } from '../clinical/ClinicalRecordPanel';

interface Props {
  org: Organization;
  patientId: string;
  protocols: Protocol[];
  templates: Template[];
}

export function PatientDrawer({ org, patientId, protocols, templates }: Props) {
  const { data, isLoading } = usePatientDetail(org.id, patientId);
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('appointments');
  const [appointment, setAppointment] = useState<Appointment | 'new' | null>(null);
  const role = useOrgRole(org.id);
  const cancelEnrollment = useCancelEnrollment(org.id);
  const optOut = useOptOut(org.id, patientId);

  if (isLoading || !data) return <Loader />;
  const { patient, enrollments, appointments, outbox } = data;
  const tz = org.timezone;

  const confirmOptOut = () =>
    modals.openConfirmModal({
      title: 'Dar de baja',
      children: <Text size="sm">{patient.first_name} no recibirá más mensajes y se cancelan los envíos pendientes.</Text>,
      labels: { confirm: 'Dar de baja', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: () => optOut.mutate('Solicitada a la clínica', { onError: notifyError }),
    });

  return (
    <Stack>
      <Group justify="space-between" align="start">
        <div>
          <Title order={3}>
            {patient.first_name} {patient.last_name}
          </Title>
          <Text c="dimmed" size="sm">
            +{patient.phone}
            {patient.document && ` · Doc. ${patient.document}`}
            {patient.email && ` · ${patient.email}`}
          </Text>
        </div>
        <Group gap="xs">
          {patient.opted_out ? (
            <Badge color="red" variant="light">
              Dado de baja
            </Badge>
          ) : (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconBan size={14} />} onClick={confirmOptOut}>
              Dar de baja
            </Button>
          )}
          <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => setEditing((v) => !v)}>
            Editar
          </Button>
        </Group>
      </Group>

      <Collapse in={editing}>
        <EditPatient orgId={org.id} patient={patient} onDone={() => setEditing(false)} />
      </Collapse>

      {patient.notes && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {patient.notes}
        </Text>
      )}

      {patient.consent && (
        <Paper withBorder p="sm" bg="gray.0">
          <Text size="sm" fw={600}>
            Autorización de datos · versión {patient.consent.version}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {CONSENT_METHOD_LABELS[patient.consent.method]} · {fmtDateTime(patient.consent.granted_at, tz)} · registró{' '}
            {patient.consent.registered_by_name}
            {patient.consent.note && ` · ${patient.consent.note}`}
          </Text>
          <Spoiler maxHeight={36} showLabel="Ver texto" hideLabel="Ocultar">
            <Text size="xs">{patient.consent.text}</Text>
          </Spoiler>
        </Paper>
      )}

      <Tabs value={tab} onChange={(v) => setTab(v ?? 'appointments')} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="appointments" leftSection={<IconCalendarTime size={14} />}>
            Citas
          </Tabs.Tab>
          <Tabs.Tab value="protocols" leftSection={<IconListDetails size={14} />}>
            Protocolos
          </Tabs.Tab>
          <Tabs.Tab value="messages" leftSection={<IconMessage2 size={14} />}>
            Mensajes
          </Tabs.Tab>
          {canReadClinical(role) && (
            <Tabs.Tab value="clinical" leftSection={<IconStethoscope size={14} />}>
              Ficha clínica
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="appointments" pt="sm">
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>Citas</Text>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setAppointment('new')}>
                Agendar cita
              </Button>
            </Group>
            {!appointments.length && (
              <Text size="sm" c="dimmed">
                Sin citas. Agenda una para programar sus recordatorios por WhatsApp.
              </Text>
            )}
            {appointments.map((a) => (
              <AppointmentCard key={a.id} orgId={org.id} appointment={a} onEdit={() => setAppointment(a)} />
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="protocols" pt="sm">
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>Protocolos</Text>
              {!patient.opted_out && (
                <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEnrolling((v) => !v)}>
                  Inscribir
                </Button>
              )}
            </Group>
            <Collapse in={enrolling}>
              <EnrollForm orgId={org.id} patientId={patient.id} protocols={protocols} onDone={() => setEnrolling(false)} />
            </Collapse>
            {!enrollments.length && (
              <Text size="sm" c="dimmed">
                Sin inscripciones.
              </Text>
            )}
            {enrollments.map((e) => (
              <Card key={e.id} withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={500}>
                      {e.protocol_name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {fmtDay(e.reference_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {e.reference_time && ` · ${e.reference_time}`}
                      {e.procedure && ` · ${e.procedure}`}
                      {e.professional && ` · ${e.professional}`}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Badge variant="light" color={e.status === 'active' ? 'teal' : 'gray'}>
                      {ENROLLMENT_STATUS_LABELS[e.status]}
                    </Badge>
                    {e.status === 'active' && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() =>
                          modals.openConfirmModal({
                            title: 'Cancelar inscripción',
                            children: <Text size="sm">Se cancelan los envíos pendientes de este protocolo.</Text>,
                            labels: { confirm: 'Cancelar inscripción', cancel: 'Volver' },
                            confirmProps: { color: 'red' },
                            onConfirm: () => cancelEnrollment.mutate(e.id, { onError: notifyError }),
                          })
                        }
                      >
                        Cancelar
                      </Button>
                    )}
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="messages" pt="sm">
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>Mensajes</Text>
              {!patient.opted_out && (
                <Button size="xs" variant="light" leftSection={<IconSend size={14} />} onClick={() => setSending((v) => !v)}>
                  Enviar plantilla
                </Button>
              )}
            </Group>
            <Collapse in={sending}>
              <ManualSend orgId={org.id} patientId={patient.id} templates={templates} onDone={() => setSending(false)} />
            </Collapse>
            {!outbox.length ? (
              <Text size="sm" c="dimmed">
                Sin mensajes.
              </Text>
            ) : (
              <Timeline bulletSize={12} lineWidth={2}>
                {outbox.map((o) => (
                  <Timeline.Item key={o.id} color={OUTBOX_COLORS[o.status]}>
                    <Group justify="space-between" wrap="nowrap" align="start">
                      <div>
                        <Text size="sm" fw={500}>
                          {o.step_label}
                          {o.day_offset !== null && (
                            <Text span size="xs" c="dimmed">
                              {' '}
                              · {dayOffsetLabel(o.day_offset)}
                            </Text>
                          )}
                          {o.manual && (
                            <Text span size="xs" c="dimmed">
                              {' '}
                              · {o.appointment_id ? 'cita' : 'manual'}
                            </Text>
                          )}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {fmtDateTime(o.sent_at ?? o.send_at, tz)}
                          {o.protocol_name && ` · ${o.protocol_name}`}
                        </Text>
                        <OutboxBadges item={o} />
                      </div>
                      <OutboxActions orgId={org.id} item={o} />
                    </Group>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Stack>
        </Tabs.Panel>

        {canReadClinical(role) && (
          <Tabs.Panel value="clinical" pt="sm">
            <ClinicalRecordPanel orgId={org.id} patientId={patient.id} timezone={tz} role={role!} />
          </Tabs.Panel>
        )}
      </Tabs>

      <Modal
        opened={!!appointment}
        onClose={() => setAppointment(null)}
        title={appointment === 'new' ? 'Agendar cita' : 'Editar cita'}
        size="lg"
      >
        {appointment && (
          <AppointmentForm
            org={org}
            templates={templates}
            patientId={patient.id}
            appointment={appointment === 'new' ? undefined : appointment}
            onDone={() => setAppointment(null)}
          />
        )}
      </Modal>
    </Stack>
  );
}

function EditPatient({ orgId, patient, onDone }: { orgId: string; patient: Patient; onDone: () => void }) {
  const update = useUpdatePatient(orgId, patient.id);
  const form = useForm<PatientInput>({
    initialValues: {
      first_name: patient.first_name,
      last_name: patient.last_name,
      phone: patient.phone,
      document: patient.document ?? '',
      email: patient.email ?? '',
      notes: patient.notes ?? '',
    },
    validate: patientValidators(),
  });
  return (
    <Paper withBorder p="sm">
      <form
        onSubmit={form.onSubmit((v) =>
          update.mutate(v, {
            onSuccess: () => {
              notifySuccess('Paciente actualizado');
              onDone();
            },
            onError: notifyError,
          }),
        )}
      >
        <Stack gap="xs">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Nombres" {...form.getInputProps('first_name')} />
            <TextInput label="Apellidos" {...form.getInputProps('last_name')} />
            <TextInput label="Celular" {...form.getInputProps('phone')} />
            <TextInput label="Documento" {...form.getInputProps('document')} />
            <TextInput label="Correo" {...form.getInputProps('email')} />
          </SimpleGrid>
          <Textarea label="Notas" autosize {...form.getInputProps('notes')} />
          <Button type="submit" size="xs" w="fit-content" loading={update.isPending}>
            Guardar
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}

function EnrollForm({ orgId, patientId, protocols, onDone }: { orgId: string; patientId: string; protocols: Protocol[]; onDone: () => void }) {
  const enroll = useEnroll(orgId, patientId);
  const [draft, setDraft] = useState(emptyEnrollment());
  const input = toEnrollmentInput(draft);
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <EnrollmentFields value={draft} onChange={setDraft} protocols={protocols} />
        <Button
          size="xs"
          w="fit-content"
          disabled={!input}
          loading={enroll.isPending}
          onClick={() =>
            enroll.mutate(input!, {
              onSuccess: (r) => {
                notifySuccess(`Inscrito: ${r.scheduled} mensajes programados`);
                for (const w of r.warnings) notifications.show({ color: 'yellow', message: w, autoClose: 10_000 });
                setDraft(emptyEnrollment());
                onDone();
              },
              onError: notifyError,
            })
          }
        >
          Inscribir
        </Button>
      </Stack>
    </Paper>
  );
}

function ManualSend({ orgId, patientId, templates, onDone }: { orgId: string; patientId: string; templates: Template[]; onDone: () => void }) {
  const send = useManualSend(orgId);
  const [key, setKey] = useState<string | null>(null);
  const [when, setWhen] = useState<Date | null>(null);
  const approved = templates.filter((t) => t.approved);
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        {!approved.length && <Alert color="gray">No hay plantillas aprobadas por Meta todavía.</Alert>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Plantilla" data={approved.map((t) => ({ value: t.key, label: t.label }))} value={key} onChange={setKey} />
          <DateTimePicker
            label="Cuándo (vacío = ahora)"
            value={when}
            onChange={setWhen}
            minDate={new Date()}
            clearable
            valueFormat="ddd D MMM YYYY, HH:mm"
          />
        </SimpleGrid>
        <Button
          size="xs"
          w="fit-content"
          disabled={!key}
          loading={send.isPending}
          onClick={() =>
            send.mutate(
              { patient_id: patientId, template_key: key!, send_at: when ? when.toISOString() : null },
              {
                onSuccess: () => {
                  notifySuccess(when ? 'Envío programado' : 'Se enviará en el próximo minuto');
                  onDone();
                },
                onError: notifyError,
              },
            )
          }
        >
          {when ? 'Programar' : 'Enviar'}
        </Button>
      </Stack>
    </Paper>
  );
}

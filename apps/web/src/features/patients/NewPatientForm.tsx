import { useState } from 'react';
import { Alert, Button, Checkbox, Divider, Paper, Select, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconShieldLock } from '@tabler/icons-react';
import {
  CONSENT_METHOD_LABELS,
  normalizePatientPhone,
  type ConsentMethod,
  type Organization,
  type PatientInput,
  type Protocol,
} from '@genon/shared';
import { useCreatePatient } from '../../services/patients';
import { notifyError } from '../../lib/api';
import { EnrollmentFields, emptyEnrollment, toEnrollmentInput } from './EnrollmentFields';

const methodOptions = Object.entries(CONSENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));

export function patientValidators() {
  return {
    first_name: (v: string) => (v.trim() ? null : 'Obligatorio'),
    last_name: (v: string) => (v.trim() ? null : 'Obligatorio'),
    phone: (v: string) => (normalizePatientPhone(v) ? null : 'Celular inválido (10 dígitos o con indicativo)'),
    email: (v: string | null | undefined) => (!v || /^\S+@\S+$/.test(v) ? null : 'Correo inválido'),
  };
}

export function NewPatientForm({
  org,
  protocols,
  onDone,
}: {
  org: Organization;
  protocols: Protocol[];
  onDone: (patientId: string) => void;
}) {
  const create = useCreatePatient(org.id);
  const form = useForm<PatientInput>({
    initialValues: { first_name: '', last_name: '', phone: '', document: '', email: '', notes: '' },
    validate: patientValidators(),
  });
  const [method, setMethod] = useState<ConsentMethod>('written');
  const [accepted, setAccepted] = useState(false);
  const [consentNote, setConsentNote] = useState('');
  const [enrollNow, setEnrollNow] = useState(true);
  const [enrollment, setEnrollment] = useState(emptyEnrollment());
  const consentText = org.consent_text.replace(/\{\{\s*clinica\s*\}\}/g, org.name);
  const enrollmentInput = toEnrollmentInput(enrollment);

  const submit = form.onSubmit(async (values) => {
    try {
      const r = await create.mutateAsync({
        ...values,
        consent: { method, note: consentNote || null },
        enrollment: enrollNow ? enrollmentInput : null,
      });
      if (r.enrollment_error) {
        notifications.show({
          color: 'orange',
          title: 'Paciente creado, sin inscribir',
          message: r.enrollment_error,
          autoClose: 10_000,
        });
      } else {
        notifications.show({
          color: 'teal',
          message: r.enrollment ? `Paciente inscrito: ${r.scheduled} mensajes programados.` : 'Paciente creado.',
        });
      }
      for (const w of r.warnings) notifications.show({ color: 'yellow', message: w, autoClose: 10_000 });
      onDone(r.patient.id);
    } catch (e) {
      notifyError(e);
    }
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Nombres" {...form.getInputProps('first_name')} />
          <TextInput label="Apellidos" {...form.getInputProps('last_name')} />
          <TextInput label="Celular (WhatsApp)" placeholder="300 123 4567" {...form.getInputProps('phone')} />
          <TextInput label="Documento (opcional)" {...form.getInputProps('document')} />
          <TextInput label="Correo (opcional)" {...form.getInputProps('email')} />
        </SimpleGrid>
        <Textarea label="Notas (opcional)" autosize {...form.getInputProps('notes')} />

        <Paper withBorder p="md" bg="gray.0">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              <IconShieldLock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Autorización de tratamiento de datos (versión {org.consent_version})
            </Text>
            <Text size="sm">{consentText}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label="Cómo la dio"
                data={methodOptions}
                value={method}
                onChange={(v) => v && setMethod(v as ConsentMethod)}
                allowDeselect={false}
              />
              <TextInput label="Nota (opcional)" placeholder="Formato firmado en la historia" value={consentNote} onChange={(e) => setConsentNote(e.currentTarget.value)} />
            </SimpleGrid>
            <Checkbox
              label="El paciente aceptó esta autorización"
              checked={accepted}
              onChange={(e) => setAccepted(e.currentTarget.checked)}
            />
          </Stack>
        </Paper>

        <Divider />
        <Switch label="Inscribir ahora a un protocolo" checked={enrollNow} onChange={(e) => setEnrollNow(e.currentTarget.checked)} />
        {enrollNow &&
          (protocols.length ? (
            <EnrollmentFields value={enrollment} onChange={setEnrollment} protocols={protocols} />
          ) : (
            <Alert color="gray">Aún no hay protocolos: créalos o cópialos de la biblioteca.</Alert>
          ))}

        <Button type="submit" loading={create.isPending} disabled={!accepted || (enrollNow && !enrollmentInput)}>
          {enrollNow ? 'Crear e inscribir' : 'Crear paciente'}
        </Button>
        {!accepted && (
          <Text size="xs" c="dimmed">
            Sin autorización no se pueden enviar mensajes (Ley 1581 de 2012).
          </Text>
        )}
      </Stack>
    </form>
  );
}

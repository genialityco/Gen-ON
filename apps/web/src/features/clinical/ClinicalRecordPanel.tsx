import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Timeline,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconEye, IconLock, IconPencil, IconPlus } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
  BACKGROUND_FIELDS,
  CLINICAL_ACCESS_LABELS,
  GUIDANCE_FIELDS,
  GUIDANCE_MAX_LENGTH,
  NOTE_KIND_LABELS,
  ROLE_LABELS,
  hasGuidance,
  type ClinicalBackground,
  type ClinicalNote,
  type NoteKind,
  type PatientGuidance,
  type Role,
} from '@genon/shared';
import { useAddNote, useClinical, useClinicalAccessLog, useUpdateBackground } from '../../services/clinical';
import { notifyError, notifySuccess } from '../../lib/api';
import { fmtDateTime, fmtDay } from '../../lib/format';

const NOTE_COLORS: Record<NoteKind, string> = { evolution: 'blue', procedure: 'grape', control: 'teal', addendum: 'orange' };

interface Props {
  orgId: string;
  patientId: string;
  timezone: string;
  role: Role;
}

/** Ficha clínica de seguimiento: antecedentes y notas que no se editan ni se borran. */
export function ClinicalRecordPanel({ orgId, patientId, timezone, role }: Props) {
  const { data, isLoading, error } = useClinical(orgId, patientId);
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [showLog, setShowLog] = useState(false);

  if (isLoading) return <Loader />;
  if (error || !data) return <Alert color="red">No se pudo abrir la ficha clínica.</Alert>;
  const { record, notes, can_write } = data;
  const main = notes.filter((n) => n.kind !== 'addendum');
  const addenda = (id: string) => notes.filter((n) => n.amends === id).reverse();
  const hasBackground = BACKGROUND_FIELDS.some((f) => record.background[f.key]);

  return (
    <Stack>
      <Alert color="gray" icon={<IconLock size={16} />} p="xs">
        <Text size="xs">
          Ficha de seguimiento, visible solo para el equipo de salud. La historia clínica legal sigue en el software de la clínica. Cada
          consulta queda registrada.
        </Text>
      </Alert>

      <Group justify="space-between">
        <Text fw={600}>Antecedentes</Text>
        <Group gap="xs">
          {(role === 'org_admin' || role === 'superadmin') && (
            <Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={() => setShowLog(true)}>
              Accesos
            </Button>
          )}
          {can_write && (
            <Button size="xs" variant="default" leftSection={<IconPencil size={14} />} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cerrar' : 'Actualizar'}
            </Button>
          )}
        </Group>
      </Group>
      {editing ? (
        <BackgroundForm orgId={orgId} patientId={patientId} initial={record.background} onDone={() => setEditing(false)} />
      ) : (
        <Paper withBorder p="sm">
          {!hasBackground ? (
            <Text size="sm" c="dimmed">
              Sin antecedentes registrados.
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {BACKGROUND_FIELDS.map((f) => (
                <div key={f.key}>
                  <Text size="xs" c="dimmed">
                    {f.label}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {record.background[f.key] || '—'}
                  </Text>
                </div>
              ))}
            </SimpleGrid>
          )}
          {record.updated_at && (
            <Text size="xs" c="dimmed" mt="xs">
              Actualizado por {record.updated_by_name} · {fmtDateTime(record.updated_at, timezone)}
            </Text>
          )}
        </Paper>
      )}

      <Group justify="space-between" mt="sm">
        <Text fw={600}>Notas</Text>
        {can_write && (
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setWriting((v) => !v)}>
            Nueva nota
          </Button>
        )}
      </Group>
      <Collapse in={writing}>
        <NoteForm orgId={orgId} patientId={patientId} onDone={() => setWriting(false)} />
      </Collapse>
      {!main.length ? (
        <Text size="sm" c="dimmed">
          Sin notas.
        </Text>
      ) : (
        <Timeline bulletSize={12} lineWidth={2}>
          {main.map((n) => (
            <Timeline.Item key={n.id} color={NOTE_COLORS[n.kind]}>
              <NoteView note={n} timezone={timezone} />
              {addenda(n.id).map((a) => (
                <Paper key={a.id} withBorder p="xs" mt="xs" ml="md" bg="orange.0">
                  <NoteView note={a} timezone={timezone} />
                </Paper>
              ))}
              {can_write && <AddendumForm orgId={orgId} patientId={patientId} amends={n.id} />}
            </Timeline.Item>
          ))}
        </Timeline>
      )}

      <Modal opened={showLog} onClose={() => setShowLog(false)} title="Registro de accesos a la ficha" size="lg">
        {showLog && <AccessLog orgId={orgId} patientId={patientId} timezone={timezone} />}
      </Modal>
    </Stack>
  );
}

function NoteView({ note: n, timezone }: { note: ClinicalNote; timezone: string }) {
  return (
    <div>
      <Group gap="xs">
        <Badge size="sm" variant="light" color={NOTE_COLORS[n.kind]}>
          {NOTE_KIND_LABELS[n.kind]}
        </Badge>
        <Text size="sm" fw={500}>
          {fmtDay(n.date, { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </Group>
      {n.procedure && (
        <Text size="sm" mt={4}>
          <b>{n.procedure.name}</b>
          {[
            n.procedure.area && `Zona: ${n.procedure.area}`,
            n.procedure.product && `Producto: ${n.procedure.product}`,
            n.procedure.lot && `Lote: ${n.procedure.lot}`,
            n.procedure.quantity && `Cantidad: ${n.procedure.quantity}`,
          ]
            .filter(Boolean)
            .map((s) => ` · ${s}`)}
        </Text>
      )}
      <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
        {n.body}
      </Text>
      {n.guidance && (
        <Paper withBorder p={6} mt={6} bg="teal.0">
          <Group gap={6} mb={2}>
            <Text size="xs" fw={600}>
              Indicaciones para el paciente
            </Text>
            {n.share_with_assistant && (
              <Badge size="xs" variant="light" color="teal">
                Las usa el asistente IA
              </Badge>
            )}
          </Group>
          {GUIDANCE_FIELDS.filter((f) => n.guidance![f.key]).map((f) => (
            <Text key={f.key} size="xs" style={{ whiteSpace: 'pre-wrap' }}>
              <b>{f.label}:</b> {n.guidance![f.key]}
            </Text>
          ))}
          {n.guidance.next_control && (
            <Text size="xs">
              <b>Próximo control sugerido:</b> {fmtDay(n.guidance.next_control, { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          )}
        </Paper>
      )}
      <Text size="xs" c="dimmed" mt={2}>
        {n.author_name} · {ROLE_LABELS[n.author_role] ?? n.author_role} · {fmtDateTime(n.created_at, timezone)}
      </Text>
    </div>
  );
}

function BackgroundForm({
  orgId,
  patientId,
  initial,
  onDone,
}: {
  orgId: string;
  patientId: string;
  initial: ClinicalBackground;
  onDone: () => void;
}) {
  const update = useUpdateBackground(orgId, patientId);
  const [value, setValue] = useState<ClinicalBackground>(initial);
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        {BACKGROUND_FIELDS.map((f) => (
          <Textarea
            key={f.key}
            label={f.label}
            autosize
            minRows={1}
            value={value[f.key] ?? ''}
            onChange={(e) => setValue({ ...value, [f.key]: e.currentTarget.value })}
          />
        ))}
        <Text size="xs" c="dimmed">
          La versión anterior queda guardada.
        </Text>
        <Button
          size="xs"
          w="fit-content"
          loading={update.isPending}
          onClick={() =>
            update.mutate(value, {
              onSuccess: () => {
                notifySuccess('Antecedentes actualizados');
                onDone();
              },
              onError: notifyError,
            })
          }
        >
          Guardar
        </Button>
      </Stack>
    </Paper>
  );
}

const emptyProcedure = { name: '', area: '', product: '', lot: '', quantity: '' };

type GuidanceDraft = Record<(typeof GUIDANCE_FIELDS)[number]['key'], string> & { next_control: Date | null };
const emptyGuidance: GuidanceDraft = { instructions: '', medications: '', restrictions: '', warning_signs: '', next_control: null };

function toGuidance(g: GuidanceDraft): PatientGuidance | null {
  const out: PatientGuidance = {
    instructions: g.instructions.trim() || null,
    medications: g.medications.trim() || null,
    restrictions: g.restrictions.trim() || null,
    warning_signs: g.warning_signs.trim() || null,
    next_control: g.next_control ? dayjs(g.next_control).format('YYYY-MM-DD') : null,
  };
  return hasGuidance(out) ? out : null;
}

const GUIDANCE_HINTS: Record<(typeof GUIDANCE_FIELDS)[number]['key'], string> = {
  instructions: 'Lavados nasales con suero 3 veces al día; dormir con la cabeza elevada.',
  medications: 'Acetaminofén 500 mg cada 8 horas por 3 días.',
  restrictions: 'No usar gafas ni hacer ejercicio hasta el control.',
  warning_signs: 'Sangrado que no para en 10 minutos, fiebre mayor a 38 °C.',
};

/** Lo que se le indicó al paciente, escrito para él: el asistente IA lo puede repetir. */
function GuidanceFields({
  value,
  onChange,
  share,
  onShare,
}: {
  value: GuidanceDraft;
  onChange: (g: GuidanceDraft) => void;
  share: boolean;
  onShare: (v: boolean) => void;
}) {
  return (
    <Paper withBorder p="xs" bg="gray.0">
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Indicaciones para el paciente (opcional)
        </Text>
        <Text size="xs" c="dimmed">
          Escritas para el paciente. El asistente IA las puede repetir tal cual si la clínica activó el uso de la ficha; el
          texto de la nota nunca se comparte.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {GUIDANCE_FIELDS.map((f) => (
            <Textarea
              key={f.key}
              size="xs"
              label={f.label}
              placeholder={GUIDANCE_HINTS[f.key]}
              autosize
              minRows={2}
              maxLength={GUIDANCE_MAX_LENGTH}
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.currentTarget.value })}
            />
          ))}
        </SimpleGrid>
        <Group align="end" justify="space-between">
          <DatePickerInput
            size="xs"
            label="Próximo control sugerido"
            value={value.next_control}
            onChange={(d) => onChange({ ...value, next_control: d })}
            minDate={new Date()}
            valueFormat="D MMM YYYY"
            clearable
            w={200}
          />
          <Checkbox size="xs" label="El asistente IA puede usar estas indicaciones" checked={share} onChange={(e) => onShare(e.currentTarget.checked)} />
        </Group>
      </Stack>
    </Paper>
  );
}

function NoteForm({ orgId, patientId, onDone }: { orgId: string; patientId: string; onDone: () => void }) {
  const add = useAddNote(orgId, patientId);
  const [kind, setKind] = useState<Exclude<NoteKind, 'addendum'>>('evolution');
  const [date, setDate] = useState<Date | null>(new Date());
  const [body, setBody] = useState('');
  const [proc, setProc] = useState(emptyProcedure);
  const [guidance, setGuidance] = useState<GuidanceDraft>(emptyGuidance);
  const [share, setShare] = useState(true);
  const ready = !!date && !!body.trim() && (kind !== 'procedure' || !!proc.name.trim());
  const opt = (v: string) => v.trim() || null;

  const submit = () =>
    add.mutate(
      {
        kind,
        date: dayjs(date).format('YYYY-MM-DD'),
        body,
        procedure:
          kind === 'procedure'
            ? { name: proc.name.trim(), area: opt(proc.area), product: opt(proc.product), lot: opt(proc.lot), quantity: opt(proc.quantity) }
            : null,
        guidance: toGuidance(guidance),
        share_with_assistant: share,
      },
      {
        onSuccess: () => {
          notifySuccess('Nota guardada');
          setBody('');
          setProc(emptyProcedure);
          setGuidance(emptyGuidance);
          onDone();
        },
        onError: notifyError,
      },
    );

  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group align="end">
          <SegmentedControl
            size="xs"
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            data={(['evolution', 'procedure', 'control'] as const).map((k) => ({ value: k, label: NOTE_KIND_LABELS[k] }))}
          />
          <DatePickerInput size="xs" label="Fecha de la atención" value={date} onChange={setDate} maxDate={new Date()} valueFormat="D MMM YYYY" />
        </Group>
        {kind === 'procedure' && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <TextInput size="xs" label="Procedimiento" value={proc.name} onChange={(e) => setProc({ ...proc, name: e.currentTarget.value })} />
            <TextInput size="xs" label="Zona" value={proc.area} onChange={(e) => setProc({ ...proc, area: e.currentTarget.value })} />
            <TextInput size="xs" label="Producto" value={proc.product} onChange={(e) => setProc({ ...proc, product: e.currentTarget.value })} />
            <TextInput size="xs" label="Lote" value={proc.lot} onChange={(e) => setProc({ ...proc, lot: e.currentTarget.value })} />
            <TextInput size="xs" label="Cantidad o dosis" value={proc.quantity} onChange={(e) => setProc({ ...proc, quantity: e.currentTarget.value })} />
          </SimpleGrid>
        )}
        <Textarea label="Nota (uso interno)" autosize minRows={3} value={body} onChange={(e) => setBody(e.currentTarget.value)} />
        <GuidanceFields value={guidance} onChange={setGuidance} share={share} onShare={setShare} />
        <Text size="xs" c="dimmed">
          Las notas no se editan ni se borran: para corregir, agrega una aclaración.
        </Text>
        <Button size="xs" w="fit-content" disabled={!ready} loading={add.isPending} onClick={submit}>
          Guardar nota
        </Button>
      </Stack>
    </Paper>
  );
}

function AddendumForm({ orgId, patientId, amends }: { orgId: string; patientId: string; amends: string }) {
  const add = useAddNote(orgId, patientId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  if (!open) {
    return (
      <Button size="compact-xs" variant="subtle" mt={4} onClick={() => setOpen(true)}>
        Agregar aclaración
      </Button>
    );
  }
  return (
    <Stack gap={4} mt="xs">
      <Textarea size="xs" autosize minRows={2} placeholder="Aclaración o corrección" value={body} onChange={(e) => setBody(e.currentTarget.value)} />
      <Group gap="xs">
        <Button
          size="compact-xs"
          disabled={!body.trim()}
          loading={add.isPending}
          onClick={() =>
            add.mutate(
              { kind: 'addendum', amends, date: dayjs().format('YYYY-MM-DD'), body },
              {
                onSuccess: () => {
                  setBody('');
                  setOpen(false);
                },
                onError: notifyError,
              },
            )
          }
        >
          Guardar aclaración
        </Button>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </Group>
    </Stack>
  );
}

function AccessLog({ orgId, patientId, timezone }: { orgId: string; patientId: string; timezone: string }) {
  const { data, isLoading } = useClinicalAccessLog(orgId, patientId, true);
  if (isLoading) return <Loader />;
  if (!data?.length) return <Text c="dimmed">Sin accesos.</Text>;
  return (
    <Table.ScrollContainer minWidth={480}>
      <Table verticalSpacing={4} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Cuándo</Table.Th>
            <Table.Th>Quién</Table.Th>
            <Table.Th>Rol</Table.Th>
            <Table.Th>Acción</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((a) => (
            <Table.Tr key={a.id}>
              <Table.Td>{fmtDateTime(a.at, timezone)}</Table.Td>
              <Table.Td>{a.name || a.email}</Table.Td>
              <Table.Td>{ROLE_LABELS[a.role] ?? a.role}</Table.Td>
              <Table.Td>{CLINICAL_ACCESS_LABELS[a.action]}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

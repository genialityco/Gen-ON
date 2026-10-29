import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  List,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Timeline,
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
  computeSendAt,
  dayOffsetLabel,
  localTime,
  orderedSteps,
  validateProtocol,
  type Protocol,
  type ProtocolInput,
  type ProtocolStep,
  type Template,
} from '@genon/shared';
import { useSaveProtocol, type Scope } from '../../services/library';
import { notifyError, notifySuccess } from '../../lib/api';
import { fmtDay } from '../../lib/format';

export interface SendDefaults {
  timezone: string;
  default_send_time: string;
  blocked_weekdays: number[];
}

const newId = () => Math.random().toString(36).slice(2, 12);

interface Props {
  scope: Scope;
  protocol: Protocol | null;
  templates: Template[];
  defaults: SendDefaults;
  canEdit: boolean;
  onDone: () => void;
}

export function ProtocolEditor({ scope, protocol, templates, defaults, canEdit, onDone }: Props) {
  const save = useSaveProtocol(scope);
  const [p, setP] = useState<ProtocolInput>(
    protocol
      ? { name: protocol.name, procedure: protocol.procedure, description: protocol.description, steps: protocol.steps, active: protocol.active }
      : { name: '', procedure: '', description: '', steps: [], active: true },
  );
  const [previewDate, setPreviewDate] = useState<Date | null>(dayjs().add(7, 'day').toDate());

  const keys = new Set(templates.map((t) => t.key));
  const errors = validateProtocol(p, keys);
  const templateOptions = templates.map((t) => ({ value: t.key, label: t.label }));
  const byKey = new Map(templates.map((t) => [t.key, t]));

  const setStep = (id: string, patch: Partial<ProtocolStep>) =>
    setP((c) => ({ ...c, steps: c.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const addStep = () => {
    const last = p.steps[p.steps.length - 1];
    setP((c) => ({
      ...c,
      steps: [
        ...c.steps,
        { id: newId(), label: '', day_offset: last ? last.day_offset + 1 : 0, time: null, template_key: '', enabled: true },
      ],
    }));
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({ id: protocol?.id, input: p });
      notifySuccess(protocol ? 'Protocolo guardado' : 'Protocolo creado');
      onDone();
    } catch (e) {
      notifyError(e);
    }
  };

  const ref = previewDate ? dayjs(previewDate).format('YYYY-MM-DD') : null;
  const preview = ref
    ? orderedSteps(p.steps, defaults.default_send_time)
        .filter((s) => Number.isInteger(s.day_offset))
        .map((s) => ({
          s,
          ...computeSendAt({
            referenceDate: ref,
            dayOffset: s.day_offset,
            time: s.time || defaults.default_send_time,
            timeZone: defaults.timezone,
            blockedWeekdays: defaults.blocked_weekdays,
          }),
        }))
    : [];

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Nombre" value={p.name} onChange={(e) => setP({ ...p, name: e.currentTarget.value })} disabled={!canEdit} />
        <TextInput
          label="Procedimiento"
          description="Valor de {{procedimiento}} si la inscripción no indica uno"
          value={p.procedure ?? ''}
          onChange={(e) => setP({ ...p, procedure: e.currentTarget.value })}
          disabled={!canEdit}
        />
      </SimpleGrid>
      <Textarea
        label="Descripción"
        autosize
        value={p.description ?? ''}
        onChange={(e) => setP({ ...p, description: e.currentTarget.value })}
        disabled={!canEdit}
      />
      <Switch
        label="Activo (se pueden inscribir pacientes)"
        checked={p.active !== false}
        onChange={(e) => setP({ ...p, active: e.currentTarget.checked })}
        disabled={!canEdit}
      />

      <Group justify="space-between">
        <div>
          <Text fw={500}>Pasos</Text>
          <Text size="xs" c="dimmed">
            Día relativo a la fecha del procedimiento o cita: -1 = el día anterior, 0 = ese día, 7 = una semana después.
            Sin hora se usa la de la clínica ({defaults.default_send_time}).
          </Text>
        </div>
        {canEdit && (
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={addStep}>
            Agregar paso
          </Button>
        )}
      </Group>

      <Paper withBorder>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={90}>Día</Table.Th>
                <Table.Th w={110}>Hora</Table.Th>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Plantilla</Table.Th>
                <Table.Th w={60}>Activo</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {p.steps.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={s.day_offset}
                      onChange={(v) => setStep(s.id, { day_offset: typeof v === 'number' ? v : Number(v) })}
                      allowDecimal={false}
                      min={-365}
                      max={365}
                      disabled={!canEdit}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TimeInput
                      size="xs"
                      value={s.time ?? ''}
                      onChange={(e) => setStep(s.id, { time: e.currentTarget.value || null })}
                      disabled={!canEdit}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput size="xs" value={s.label} onChange={(e) => setStep(s.id, { label: e.currentTarget.value })} disabled={!canEdit} />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      data={templateOptions}
                      value={s.template_key || null}
                      onChange={(v) => setStep(s.id, { template_key: v ?? '', label: s.label || byKey.get(v ?? '')?.label || '' })}
                      searchable
                      disabled={!canEdit}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Switch size="xs" checked={s.enabled} onChange={(e) => setStep(s.id, { enabled: e.currentTarget.checked })} disabled={!canEdit} />
                  </Table.Td>
                  <Table.Td>
                    {canEdit && (
                      <ActionIcon variant="subtle" color="red" onClick={() => setP({ ...p, steps: p.steps.filter((x) => x.id !== s.id) })}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {!p.steps.length && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text size="sm" c="dimmed">
                      Sin pasos.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm" align="end">
          <Text fw={500}>Vista previa de la parrilla</Text>
          <DatePickerInput
            size="xs"
            label="Fecha del procedimiento"
            value={previewDate}
            onChange={setPreviewDate}
            valueFormat="ddd D MMM YYYY"
          />
        </Group>
        {preview.length ? (
          <Timeline bulletSize={14} lineWidth={2}>
            {preview.map(({ s, date, at, shifted }) => {
              const t = byKey.get(s.template_key);
              return (
                <Timeline.Item
                  key={s.id}
                  color={s.day_offset < 0 ? 'blue' : s.day_offset === 0 ? 'grape' : 'teal'}
                  title={
                    <Group gap={6}>
                      <Text size="sm" fw={500}>
                        {fmtDay(date)} · {localTime(at, defaults.timezone)}
                      </Text>
                      <Badge size="xs" variant="light">
                        {dayOffsetLabel(s.day_offset)}
                      </Badge>
                      {shifted && (
                        <Badge size="xs" color="orange" variant="light">
                          Se corrió por día sin envíos
                        </Badge>
                      )}
                    </Group>
                  }
                >
                  <Text size="xs" c="dimmed">
                    {s.label || 'Sin nombre'} · {t?.label ?? 'Sin plantilla'}
                  </Text>
                </Timeline.Item>
              );
            })}
          </Timeline>
        ) : (
          <Text size="sm" c="dimmed">
            Agrega pasos para ver cuándo saldría cada mensaje.
          </Text>
        )}
      </Paper>

      {errors.length > 0 && (
        <Alert color="orange" icon={<IconAlertTriangle />}>
          <List size="sm">
            {errors.map((e) => (
              <List.Item key={e}>{e}</List.Item>
            ))}
          </List>
        </Alert>
      )}
      {canEdit && (
        <Group>
          <Button onClick={onSave} loading={save.isPending} disabled={errors.length > 0}>
            Guardar
          </Button>
          {protocol && (
            <Text size="xs" c="dimmed">
              Los cambios aplican a las inscripciones nuevas; las ya hechas conservan su parrilla.
            </Text>
          )}
        </Group>
      )}
    </Stack>
  );
}

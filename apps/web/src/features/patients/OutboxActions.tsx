import { useState } from 'react';
import { ActionIcon, Button, Group, Menu, Modal, Stack, Text } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { modals } from '@mantine/modals';
import { IconCalendarTime, IconDots, IconPlayerPlay, IconUser, IconX } from '@tabler/icons-react';
import type { OutboxItem } from '@genon/shared';
import { useOutboxAction } from '../../services/patients';
import { notifyError, notifySuccess } from '../../lib/api';

const RESCHEDULABLE = ['scheduled', 'failed', 'cancelled', 'skipped'];

export function OutboxActions({ orgId, item, onOpenPatient }: { orgId: string; item: OutboxItem; onOpenPatient?: () => void }) {
  const action = useOutboxAction(orgId);
  const [rescheduling, setRescheduling] = useState(false);
  const [when, setWhen] = useState<Date | null>(new Date(item.send_at) > new Date() ? new Date(item.send_at) : null);

  const canReschedule = RESCHEDULABLE.includes(item.status);
  const canCancel = item.status === 'scheduled' || item.status === 'failed';
  if (!canReschedule && !onOpenPatient) return null;

  const run = (a: Parameters<typeof action.mutate>[0], msg: string) =>
    action.mutate(a, { onSuccess: () => notifySuccess(msg), onError: notifyError });

  const confirmSendNow = () =>
    modals.openConfirmModal({
      title: 'Enviar ahora',
      children: (
        <Text size="sm">
          {item.status === 'failed' && item.status_reason?.includes('no se sabe si salió')
            ? 'Este envío se interrumpió y pudo haber llegado. Revisa con el paciente antes de reenviarlo.'
            : `Se envía "${item.step_label}" a ${item.patient_name} en el próximo minuto.`}
        </Text>
      ),
      labels: { confirm: 'Enviar', cancel: 'Cancelar' },
      onConfirm: () => run({ id: item.id, action: 'send-now' }, 'Se enviará en el próximo minuto'),
    });

  return (
    <>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon variant="subtle" size="sm" onClick={(e) => e.stopPropagation()} loading={action.isPending}>
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
          {canReschedule && (
            <>
              <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={confirmSendNow}>
                Enviar ahora
              </Menu.Item>
              <Menu.Item leftSection={<IconCalendarTime size={14} />} onClick={() => setRescheduling(true)}>
                Reprogramar
              </Menu.Item>
            </>
          )}
          {canCancel && (
            <Menu.Item color="red" leftSection={<IconX size={14} />} onClick={() => run({ id: item.id, action: 'cancel' }, 'Envío cancelado')}>
              Cancelar envío
            </Menu.Item>
          )}
          {onOpenPatient && (
            <Menu.Item leftSection={<IconUser size={14} />} onClick={onOpenPatient}>
              Ver paciente
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>

      <Modal opened={rescheduling} onClose={() => setRescheduling(false)} title="Reprogramar envío">
        <Stack>
          <Text size="sm">
            {item.step_label} · {item.patient_name}
          </Text>
          <DateTimePicker label="Nueva fecha y hora" value={when} onChange={setWhen} minDate={new Date()} valueFormat="ddd D MMM YYYY, HH:mm" />
          <Group justify="flex-end">
            <Button
              disabled={!when}
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { id: item.id, action: 'reschedule', send_at: when!.toISOString() },
                  {
                    onSuccess: () => {
                      notifySuccess('Envío reprogramado');
                      setRescheduling(false);
                    },
                    onError: notifyError,
                  },
                )
              }
            >
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

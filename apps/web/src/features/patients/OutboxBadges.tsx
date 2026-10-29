import { Badge, Group, Tooltip } from '@mantine/core';
import { IconHandFinger } from '@tabler/icons-react';
import {
  DELIVERY_STATUS_LABELS,
  OUTBOX_STATUS_LABELS,
  type MessageDeliveryStatus,
  type OutboxItem,
  type OutboxStatus,
} from '@genon/shared';

export const OUTBOX_COLORS: Record<OutboxStatus, string> = {
  scheduled: 'blue',
  sending: 'cyan',
  sent: 'teal',
  failed: 'red',
  cancelled: 'gray',
  skipped: 'gray',
};

const DELIVERY_COLORS: Record<MessageDeliveryStatus, string> = {
  accepted: 'gray',
  sent: 'gray',
  delivered: 'teal',
  read: 'green',
  failed: 'red',
};

/** Estado del envío; si salió, el de entrega; y el botón que tocó el paciente. */
export function OutboxBadges({ item }: { item: OutboxItem }) {
  const showDelivery = item.status === 'sent' && item.delivery_status;
  return (
    <Group gap={4}>
      {showDelivery ? (
        <Tooltip label={item.status_reason ?? 'Estado de entrega en WhatsApp'} disabled={!item.status_reason && item.delivery_status !== 'failed'}>
          <Badge size="xs" variant="light" color={DELIVERY_COLORS[item.delivery_status!]}>
            {DELIVERY_STATUS_LABELS[item.delivery_status!]}
          </Badge>
        </Tooltip>
      ) : (
        <Tooltip label={item.status_reason} disabled={!item.status_reason}>
          <Badge size="xs" variant="light" color={OUTBOX_COLORS[item.status]}>
            {OUTBOX_STATUS_LABELS[item.status]}
            {item.status === 'scheduled' && item.attempts > 0 ? ' (reintento)' : ''}
          </Badge>
        </Tooltip>
      )}
      {item.response && (
        <Badge size="xs" color="grape" variant="filled" leftSection={<IconHandFinger size={10} />}>
          {item.response.text}
        </Badge>
      )}
    </Group>
  );
}

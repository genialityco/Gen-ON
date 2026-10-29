import { Badge } from '@mantine/core';
import { TEMPLATE_STATUS_LABELS, type Template, type TemplateMetaStatus } from '@genon/shared';

const COLORS: Partial<Record<TemplateMetaStatus, string>> = {
  DRAFT: 'gray',
  PENDING: 'yellow',
  APPROVED: 'teal',
  REJECTED: 'red',
  PAUSED: 'orange',
  DISABLED: 'red',
};

export function TemplateStatusBadge({ t }: { t: Pick<Template, 'meta_status'> }) {
  return (
    <Badge color={COLORS[t.meta_status] ?? 'gray'} variant="light">
      {TEMPLATE_STATUS_LABELS[t.meta_status] ?? t.meta_status}
    </Badge>
  );
}

import type { ReactNode } from 'react';
import { Group, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { PLANS, hasFeature, planWith, type Organization, type PlanFeature } from '@genon/shared';

/** Muestra el contenido si el plan lo incluye; si no, qué plan lo trae. */
export function PlanGate({ org, feature, what, children }: { org: Organization; feature: PlanFeature; what: string; children: ReactNode }) {
  if (hasFeature(org.plan, feature)) return <>{children}</>;
  return (
    <Paper withBorder p="md">
      <Group wrap="nowrap" align="start">
        <ThemeIcon variant="light" color="gray" size="lg">
          <IconLock size={18} />
        </ThemeIcon>
        <div>
          <Text fw={600}>
            {what} es parte del plan {planWith(feature)}
          </Text>
          <Text size="sm" c="dimmed">
            Tu plan actual es {PLANS[org.plan].label}. Para activarlo, contacta a Gen.iality.
          </Text>
        </div>
      </Group>
    </Paper>
  );
}

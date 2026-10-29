import type { ReactNode } from 'react';
import { ActionIcon, Anchor, CopyButton, Group, List, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';
import type { MetaConnection, Organization } from '@genon/shared';

export interface StepProps {
  orgId: string;
  conn: MetaConnection;
  org: Organization;
}

export function StepHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack gap={4} mb="md">
      <Title order={3}>{title}</Title>
      {children && (
        <Text size="sm" c="dimmed">
          {children}
        </Text>
      )}
    </Stack>
  );
}

/** Instrucciones numeradas para lo que se hace en Meta. */
export function Guide({ items }: { items: ReactNode[] }) {
  return (
    <List type="ordered" spacing="xs" size="sm" mb="md">
      {items.map((item, i) => (
        <List.Item key={i}>{item}</List.Item>
      ))}
    </List>
  );
}

export function MetaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} target="_blank" rel="noreferrer" size="sm">
      {children} <IconExternalLink size={12} style={{ verticalAlign: 'middle' }} />
    </Anchor>
  );
}

export function CopyField({ label, value }: { label: string; value: string | null }) {
  return (
    <TextInput
      label={label}
      value={value ?? ''}
      readOnly
      styles={{ input: { fontFamily: 'monospace' } }}
      rightSection={
        value ? (
          <CopyButton value={value}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copiado' : 'Copiar'}>
                <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        ) : null
      }
    />
  );
}

/** Datos ya validados con Meta. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!visible.length) return null;
  return (
    <Table withRowBorders={false} mb="md" verticalSpacing={4}>
      <Table.Tbody>
        {visible.map(([k, v]) => (
          <Table.Tr key={k}>
            <Table.Td w={200}>
              <Text size="sm" c="dimmed">
                {k}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{v}</Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <Group mt="md">{children}</Group>;
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : null;

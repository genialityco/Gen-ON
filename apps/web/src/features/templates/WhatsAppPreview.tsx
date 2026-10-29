import { Box, Paper, Stack, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { exampleValues, renderText, type TemplateContent } from '@genon/shared';

/** Cómo se ve el mensaje en WhatsApp, con valores de ejemplo. */
export function WhatsAppPreview({ t, values = exampleValues }: { t: Partial<TemplateContent>; values?: Record<string, string> }) {
  const buttons = t.buttons ?? [];
  return (
    <Box p="md" style={{ background: '#e5ddd5', borderRadius: 12 }}>
      <Stack gap={4} maw={320}>
        <Paper p="sm" radius="md" shadow="xs" style={{ borderTopLeftRadius: 0 }}>
          {t.header && (
            <Text fw={700} size="sm" mb={4}>
              {t.header}
            </Text>
          )}
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {renderText(t.body || 'Escribe el texto del mensaje…', values)}
          </Text>
          {t.footer && (
            <Text size="xs" c="dimmed" mt={6}>
              {t.footer}
            </Text>
          )}
        </Paper>
        {buttons.map((b, i) => (
          <Paper key={i} p={8} radius="md" shadow="xs" ta="center">
            <Text size="sm" c="blue.7" fw={500}>
              {b.type === 'URL' && <IconExternalLink size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              {b.text || 'Botón'}
            </Text>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

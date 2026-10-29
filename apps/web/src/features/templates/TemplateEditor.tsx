import { useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  List,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconSend, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import {
  ALERT_LEVEL_LABELS,
  BUTTON_ACTION_LABELS,
  TEMPLATE_VARIABLES,
  slugKey,
  validateTemplate,
  type ButtonActionType,
  type Template,
  type TemplateButton,
  type TemplateContent,
} from '@genon/shared';
import { useSaveTemplate, useSubmitTemplate, type Scope } from '../../services/library';
import { notifyError, notifySuccess } from '../../lib/api';
import { WhatsAppPreview } from './WhatsAppPreview';
import { TemplateStatusBadge } from './TemplateStatusBadge';

const actionOptions = Object.entries(BUTTON_ACTION_LABELS).map(([value, label]) => ({ value, label }));
const alertOptions = Object.entries(ALERT_LEVEL_LABELS).map(([value, label]) => ({ value, label }));

const EMPTY: TemplateContent = {
  label: '',
  category: 'UTILITY',
  language: 'es',
  header: '',
  body: '',
  footer: '',
  buttons: [],
};

interface Props {
  scope: Scope;
  template: Template | null;
  canEdit: boolean;
  onDone: () => void;
}

export function TemplateEditor({ scope, template, canEdit, onDone }: Props) {
  const save = useSaveTemplate(scope);
  const submit = useSubmitTemplate(scope === 'library' ? '' : scope.orgId);
  const [content, setContent] = useState<TemplateContent>(template ? { ...EMPTY, ...template } : EMPTY);
  const [key, setKey] = useState(template?.key ?? '');
  const [validatedBy, setValidatedBy] = useState(template?.clinical_validated_by ?? '');
  const [revalidated, setRevalidated] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const errors = validateTemplate(content);
  const set = <K extends keyof TemplateContent>(k: K, v: TemplateContent[K]) => setContent((c) => ({ ...c, [k]: v }));
  const setButton = (i: number, patch: Partial<TemplateButton>) =>
    set('buttons', content.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const contentChanged =
    !!template &&
    ((['header', 'body', 'footer', 'category', 'language'] as const).some((k) => content[k] !== template[k]) ||
      JSON.stringify(content.buttons) !== JSON.stringify(template.buttons));
  const keepsOldValidation =
    contentChanged && !!validatedBy && validatedBy === template?.clinical_validated_by && !revalidated;
  const inMeta = scope !== 'library' && template && template.meta_status !== 'DRAFT';
  const canSubmit =
    scope !== 'library' &&
    template &&
    !contentChanged &&
    ['DRAFT', 'REJECTED'].includes(template.meta_status) &&
    !!template.clinical_validated_by &&
    !errors.length;

  const insertVariable = (v: string) => {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) return set('body', content.body + token);
    const start = el.selectionStart ?? content.body.length;
    const end = el.selectionEnd ?? start;
    set('body', content.body.slice(0, start) + token + content.body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({
        id: template?.id,
        input: {
          ...content,
          ...(template ? {} : { key: key || slugKey(content.label) }),
          // Con el texto cambiado, la validación anterior no vale: se borra
          // salvo que se indique de nuevo quién revisó el texto nuevo
          clinical_validated_by: keepsOldValidation ? undefined : validatedBy.trim() || null,
        },
      });
      notifySuccess(template ? 'Plantilla guardada' : 'Plantilla creada');
      onDone();
    } catch (e) {
      notifyError(e);
    }
  };

  const onSubmit = async () => {
    try {
      const t = await submit.mutateAsync(template!.id);
      notifySuccess(t.meta_status === 'APPROVED' ? 'Aprobada por Meta' : 'Enviada a revisión de Meta');
      onDone();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
      <Stack>
        {template && scope !== 'library' && (
          <Group gap="xs">
            <TemplateStatusBadge t={template} />
            <Text size="xs" c="dimmed">
              Versión {template.version}
              {template.meta_name && ` · ${template.meta_name}`}
            </Text>
          </Group>
        )}
        {template?.rejected_reason && (
          <Alert color="red" icon={<IconAlertTriangle />} title="Meta la rechazó">
            {template.rejected_reason}. Ajusta el texto y vuelve a enviarla.
          </Alert>
        )}
        {inMeta && template?.approved && template.approved.version !== template.version && (
          <Alert color="blue" variant="light">
            Mientras esta versión no se apruebe, se sigue enviando la versión {template.approved.version}.
          </Alert>
        )}

        <SimpleGrid cols={2}>
          <TextInput label="Nombre" value={content.label} onChange={(e) => set('label', e.currentTarget.value)} disabled={!canEdit} />
          <TextInput
            label="Clave"
            description={template ? 'No se puede cambiar' : 'La usan los protocolos'}
            value={template ? template.key : key || slugKey(content.label)}
            onChange={(e) => setKey(slugKey(e.currentTarget.value))}
            disabled={!canEdit || !!template}
          />
        </SimpleGrid>
        <Select
          label="Categoría"
          description="Seguimiento clínico = Utilidad. Meta puede recategorizarla."
          data={[
            { value: 'UTILITY', label: 'Utilidad (seguimiento, recordatorios)' },
            { value: 'MARKETING', label: 'Marketing (promociones)' },
          ]}
          value={content.category}
          onChange={(v) => v && set('category', v as TemplateContent['category'])}
          allowDeselect={false}
          disabled={!canEdit}
        />
        <TextInput
          label="Encabezado (opcional)"
          value={content.header}
          onChange={(e) => set('header', e.currentTarget.value)}
          maxLength={60}
          disabled={!canEdit}
        />
        <div>
          <Textarea
            ref={bodyRef}
            label="Texto"
            autosize
            minRows={5}
            value={content.body}
            onChange={(e) => set('body', e.currentTarget.value)}
            disabled={!canEdit}
          />
          {canEdit && (
            <Group gap={6} mt={6}>
              {TEMPLATE_VARIABLES.map((v) => (
                <Tooltip key={v.key} label={`${v.label} · ej.: ${v.example}`}>
                  <Badge variant="light" style={{ cursor: 'pointer', textTransform: 'none' }} onClick={() => insertVariable(v.key)}>
                    {`{{${v.key}}}`}
                  </Badge>
                </Tooltip>
              ))}
            </Group>
          )}
        </div>
        <TextInput
          label="Pie (opcional)"
          value={content.footer}
          onChange={(e) => set('footer', e.currentTarget.value)}
          maxLength={60}
          disabled={!canEdit}
        />

        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              Botones
            </Text>
            {canEdit && content.buttons.length < 10 && (
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPlus size={14} />}
                onClick={() => set('buttons', [...content.buttons, { type: 'QUICK_REPLY', text: '', action: { type: 'none' } }])}
              >
                Agregar
              </Button>
            )}
          </Group>
          {content.buttons.map((b, i) => (
            <Paper key={i} withBorder p="sm">
              <Stack gap="xs">
                <Group gap="xs" wrap="nowrap">
                  <SegmentedControl
                    size="xs"
                    value={b.type}
                    onChange={(v) =>
                      setButton(i, v === 'URL' ? { type: 'URL', url: '', action: null } : { type: 'QUICK_REPLY', url: null, action: { type: 'none' } })
                    }
                    data={[
                      { value: 'QUICK_REPLY', label: 'Respuesta' },
                      { value: 'URL', label: 'Enlace' },
                    ]}
                    disabled={!canEdit}
                  />
                  <TextInput
                    size="xs"
                    style={{ flex: 1 }}
                    placeholder="Texto del botón"
                    maxLength={25}
                    value={b.text}
                    onChange={(e) => setButton(i, { text: e.currentTarget.value })}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <ActionIcon variant="subtle" color="red" onClick={() => set('buttons', content.buttons.filter((_, j) => j !== i))}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
                {b.type === 'URL' ? (
                  <TextInput
                    size="xs"
                    placeholder="https://"
                    value={b.url ?? ''}
                    onChange={(e) => setButton(i, { url: e.currentTarget.value })}
                    disabled={!canEdit}
                  />
                ) : (
                  <>
                    <Group grow gap="xs">
                      <Select
                        size="xs"
                        label="Al tocarlo"
                        data={actionOptions}
                        value={b.action?.type ?? 'none'}
                        onChange={(v) => setButton(i, { action: { ...b.action, type: (v ?? 'none') as ButtonActionType } })}
                        allowDeselect={false}
                        disabled={!canEdit}
                      />
                      {b.action?.type === 'alert' && (
                        <Select
                          size="xs"
                          label="Nivel"
                          data={alertOptions}
                          value={b.action.alert_level ?? null}
                          onChange={(v) => setButton(i, { action: { ...b.action!, alert_level: v as any } })}
                          disabled={!canEdit}
                        />
                      )}
                    </Group>
                    {b.action && b.action.type !== 'none' && (
                      <Textarea
                        size="xs"
                        autosize
                        label={b.action.type === 'reply' ? 'Respuesta automática' : 'Respuesta automática (opcional)'}
                        value={b.action.reply_text ?? ''}
                        onChange={(e) => setButton(i, { action: { ...b.action!, reply_text: e.currentTarget.value } })}
                        disabled={!canEdit}
                      />
                    )}
                  </>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>

        <TextInput
          label="Validación clínica"
          description="Profesional de la salud que revisó y aprobó el texto (requisito para enviarla a Meta)"
          placeholder="Dra. Laura Gómez, dermatóloga"
          leftSection={<IconShieldCheck size={16} />}
          value={validatedBy}
          onChange={(e) => setValidatedBy(e.currentTarget.value)}
          disabled={!canEdit}
        />
        {contentChanged && !!template?.clinical_validated_by && validatedBy === template.clinical_validated_by && (
          <Checkbox
            size="xs"
            color="orange"
            checked={revalidated}
            onChange={(e) => setRevalidated(e.currentTarget.checked)}
            label={`${validatedBy} revisó el texto nuevo (si no, la validación se borra al guardar)`}
          />
        )}
      </Stack>

      <Stack>
        <Text size="sm" fw={500}>
          Vista previa (con datos de ejemplo)
        </Text>
        <WhatsAppPreview t={content} />
        {errors.length > 0 && (
          <Alert color="orange" icon={<IconAlertTriangle />} title="Meta la rechazaría">
            <List size="sm">
              {errors.map((e) => (
                <List.Item key={e}>{e}</List.Item>
              ))}
            </List>
          </Alert>
        )}
        {canEdit && (
          <Group>
            <Button onClick={onSave} loading={save.isPending} disabled={!content.label.trim()}>
              Guardar
            </Button>
            {scope !== 'library' && template && (
              <Tooltip
                disabled={!!canSubmit}
                label={
                  contentChanged
                    ? 'Guarda primero los cambios'
                    : !template.clinical_validated_by
                      ? 'Falta la validación clínica'
                      : errors.length
                        ? 'Corrige los problemas señalados'
                        : 'Ya está en Meta: edítala para crear una versión nueva'
                }
              >
                <Button variant="light" leftSection={<IconSend size={16} />} onClick={onSubmit} loading={submit.isPending} disabled={!canSubmit}>
                  Enviar a Meta
                </Button>
              </Tooltip>
            )}
          </Group>
        )}
        {inMeta && canEdit && (
          <Text size="xs" c="dimmed">
            Si editas el contenido, vuelve a borrador como versión {template!.version + 1} y hay que enviarla otra vez a Meta.
          </Text>
        )}
      </Stack>
    </SimpleGrid>
  );
}

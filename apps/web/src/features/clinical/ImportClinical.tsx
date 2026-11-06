import { useState } from 'react';
import { Alert, Badge, Button, FileInput, Group, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { CLINICAL_IMPORT_MAX, NOTE_KIND_LABELS, hasGuidance, type ClinicalImportResult } from '@genon/shared';
import { useImportClinical } from '../../services/clinical';
import { downloadClinicalTemplate, parseClinicalFile, type ParsedClinical } from '../../lib/clinicalExcel';
import { errorMessage, notifyError } from '../../lib/api';

/**
 * Importar fichas de seguimiento desde Excel (p. ej. lo exportado del software
 * de historia clínica): antecedentes y notas con indicaciones para el paciente.
 */
export function ImportClinical({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const importer = useImportClinical(orgId);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedClinical | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ClinicalImportResult | null>(null);

  const pick = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setReadError(null);
    if (!f) return;
    setReading(true);
    try {
      setParsed(await parseClinicalFile(f));
    } catch {
      setReadError('No se pudo leer el archivo. Debe ser un Excel (.xlsx).');
    } finally {
      setReading(false);
    }
  };

  const submit = () =>
    parsed && importer.mutate({ rows: parsed.rows.map((r) => r.input), source: file?.name ?? 'archivo' }, { onSuccess: setResult });

  if (result && parsed) {
    const issues = result.rows.filter((r) => r.status === 'error');
    return (
      <Stack>
        <Group gap="xs">
          <Badge color="teal" size="lg" variant="light">
            {result.notes} notas creadas
          </Badge>
          <Badge color="teal" size="lg" variant="light">
            {result.backgrounds} antecedentes actualizados
          </Badge>
          {result.errors > 0 && (
            <Badge color="red" size="lg" variant="light">
              {result.errors} filas con errores
            </Badge>
          )}
        </Group>
        {issues.length > 0 && (
          <ScrollArea.Autosize mah={320}>
            <Table striped fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fila</Table.Th>
                  <Table.Th>Paciente</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {issues.map((r) => (
                  <Table.Tr key={r.index}>
                    <Table.Td>{parsed.rows[r.index].line}</Table.Td>
                    <Table.Td>{parsed.rows[r.index].input.patient}</Table.Td>
                    <Table.Td>{r.message}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
        <Text size="sm" c="dimmed">
          Las notas quedan a tu nombre, no se pueden editar (como las demás) y cada ficha registra el cambio en su registro de
          accesos.
        </Text>
        <Group justify="flex-end">
          <Button onClick={onDone}>Listo</Button>
        </Group>
      </Stack>
    );
  }

  const blocked = !parsed || parsed.missing || parsed.tooMany || !parsed.rows.length;
  const withGuidance = parsed?.rows.filter((r) => hasGuidance({ next_control: null, instructions: null, medications: null, restrictions: null, warning_signs: null, ...r.input.guidance })).length ?? 0;

  return (
    <Stack>
      <Text size="sm">
        Una fila por atención. Solo <b>Celular o documento</b> es obligatorio para encontrar al paciente (debe estar
        registrado). Los antecedentes que vengan reemplazan solo esas columnas y se guarda la versión anterior. Si la fila trae
        nota, procedimiento o indicaciones, se crea una nota con la <b>fecha de la atención</b>. Máximo{' '}
        {CLINICAL_IMPORT_MAX.toLocaleString('es-CO')} filas.
      </Text>
      <Group>
        <Button variant="default" size="xs" leftSection={<IconDownload size={14} />} onClick={() => downloadClinicalTemplate().catch(notifyError)}>
          Descargar plantilla
        </Button>
      </Group>

      <FileInput
        label="Archivo de Excel"
        placeholder="Selecciona un archivo .xlsx"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        leftSection={<IconFileSpreadsheet size={16} />}
        value={file}
        onChange={pick}
        clearable
        disabled={reading}
      />

      {readError && <Alert color="red">{readError}</Alert>}
      {parsed?.missing && <Alert color="red">Falta la columna «Celular o documento». Usa la plantilla como guía.</Alert>}
      {parsed?.tooMany && (
        <Alert color="red">El archivo tiene más de {CLINICAL_IMPORT_MAX.toLocaleString('es-CO')} filas. Divídelo en varios archivos.</Alert>
      )}
      {parsed && !parsed.missing && !parsed.tooMany && (
        <>
          <Text size="sm" fw={500}>
            {parsed.rows.length} filas · {withGuidance} con indicaciones para el paciente
          </Text>
          {parsed.rows.length > 0 && (
            <Table fz="xs" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Paciente</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Procedimiento</Table.Th>
                  <Table.Th>Próximo control</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {parsed.rows.slice(0, 5).map(({ line, input }) => (
                  <Table.Tr key={line}>
                    <Table.Td>{input.patient}</Table.Td>
                    <Table.Td>{input.date}</Table.Td>
                    <Table.Td>{input.kind ? NOTE_KIND_LABELS[input.kind] : '—'}</Table.Td>
                    <Table.Td>{input.procedure}</Table.Td>
                    <Table.Td>{input.guidance.next_control}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {parsed.rows.length > 5 && (
            <Text size="xs" c="dimmed">
              y {parsed.rows.length - 5} más
            </Text>
          )}
          <Alert color="gray" p="xs">
            Revisa el archivo antes de importar: las indicaciones marcadas para compartir («Compartir con el asistente IA» vacío o
            «Sí») las puede repetir el asistente al paciente tal cual están escritas.
          </Alert>
        </>
      )}

      {importer.isError && <Alert color="red">{errorMessage(importer.error)}</Alert>}

      <Group justify="flex-end">
        <Button onClick={submit} loading={importer.isPending} disabled={blocked}>
          Importar {parsed?.rows.length ? parsed.rows.length : ''} filas
        </Button>
      </Group>
    </Stack>
  );
}

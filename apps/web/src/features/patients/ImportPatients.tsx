import { useState } from 'react';
import { Alert, Badge, Button, Checkbox, FileInput, Group, Paper, ScrollArea, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import {
  CONSENT_METHOD_LABELS,
  PATIENT_IMPORT_MAX,
  type ConsentMethod,
  type Organization,
  type PatientImportResult,
} from '@genon/shared';
import { useImportPatients } from '../../services/patients';
import { downloadImportTemplate, parsePatientsFile, type ParsedImport } from '../../lib/patientsExcel';
import { errorMessage, notifyError } from '../../lib/api';

const methodOptions = Object.entries(CONSENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const STATUS = {
  duplicate: { label: 'Ya existe', color: 'gray' },
  error: { label: 'Error', color: 'red' },
} as const;

/** Importar pacientes desde Excel con la autorización de datos que ya dieron. */
export function ImportPatients({ org, onDone }: { org: Organization; onDone: () => void }) {
  const importer = useImportPatients(org.id);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [method, setMethod] = useState<ConsentMethod>('written');
  const [note, setNote] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [result, setResult] = useState<PatientImportResult | null>(null);

  const pick = async (f: File | null) => {
    setFile(f);
    setParsed(null);
    setReadError(null);
    if (!f) return;
    setReading(true);
    try {
      setParsed(await parsePatientsFile(f));
    } catch {
      setReadError('No se pudo leer el archivo. Debe ser un Excel (.xlsx).');
    } finally {
      setReading(false);
    }
  };

  const submit = () =>
    parsed &&
    importer.mutate(
      {
        rows: parsed.rows.map((r) => r.input),
        consent: { method, note: note.trim() || `Importado desde Excel (${file?.name ?? 'archivo'})` },
      },
      { onSuccess: setResult },
    );

  if (result && parsed) {
    const issues = result.rows.filter((r) => r.status !== 'created');
    return (
      <Stack>
        <Group gap="xs">
          <Badge color="teal" size="lg" variant="light">
            {result.created} creados
          </Badge>
          {result.duplicates > 0 && (
            <Badge color="gray" size="lg" variant="light">
              {result.duplicates} ya existían
            </Badge>
          )}
          {result.errors > 0 && (
            <Badge color="red" size="lg" variant="light">
              {result.errors} con errores
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
                  <Table.Th>Resultado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {issues.map((r) => {
                  const { line, input } = parsed.rows[r.index];
                  return (
                    <Table.Tr key={r.index}>
                      <Table.Td>{line}</Table.Td>
                      <Table.Td>{`${input.first_name} ${input.last_name}`.trim() || input.phone || '—'}</Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={STATUS[r.status as keyof typeof STATUS].color} mr={6}>
                          {STATUS[r.status as keyof typeof STATUS].label}
                        </Badge>
                        {r.message}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        )}
        <Text size="sm" c="dimmed">
          Los pacientes quedan registrados sin protocolo: inscríbelos desde su ficha o agenda sus citas.
        </Text>
        <Group justify="flex-end">
          <Button onClick={onDone}>Listo</Button>
        </Group>
      </Stack>
    );
  }

  const blocked = !parsed || parsed.missing.length > 0 || parsed.tooMany || !parsed.rows.length;

  return (
    <Stack>
      <Text size="sm">
        La primera fila deben ser los encabezados: <b>Nombres</b>, <b>Apellidos</b> y <b>Celular</b> son obligatorios; Documento,
        Correo y Notas son opcionales. Máximo {PATIENT_IMPORT_MAX.toLocaleString('es-CO')} filas por archivo. Los celulares que ya
        estén registrados se omiten.
      </Text>
      <Group>
        <Button variant="default" size="xs" leftSection={<IconDownload size={14} />} onClick={() => downloadImportTemplate().catch(notifyError)}>
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
      {parsed?.missing.length ? (
        <Alert color="red">Faltan las columnas: {parsed.missing.join(', ')}. Usa la plantilla como guía.</Alert>
      ) : null}
      {parsed?.tooMany && (
        <Alert color="red">El archivo tiene más de {PATIENT_IMPORT_MAX.toLocaleString('es-CO')} filas. Divídelo en varios archivos.</Alert>
      )}
      {parsed && !parsed.missing.length && !parsed.tooMany && (
        <>
          <Text size="sm" fw={500}>
            {parsed.rows.length} pacientes en el archivo
          </Text>
          {parsed.rows.length > 0 && (
            <Table fz="xs" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombres</Table.Th>
                  <Table.Th>Apellidos</Table.Th>
                  <Table.Th>Celular</Table.Th>
                  <Table.Th>Documento</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {parsed.rows.slice(0, 5).map(({ line, input }) => (
                  <Table.Tr key={line}>
                    <Table.Td>{input.first_name}</Table.Td>
                    <Table.Td>{input.last_name}</Table.Td>
                    <Table.Td>{input.phone}</Table.Td>
                    <Table.Td>{input.document}</Table.Td>
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

          <Paper withBorder p="sm" bg="gray.0">
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Autorización de tratamiento de datos (versión {org.consent_version})
              </Text>
              <Text size="xs" c="dimmed">
                Se registra el texto vigente de la clínica para todos los pacientes del archivo. Solo importa pacientes que ya la
                aceptaron.
              </Text>
              <Select label="Cómo la dieron" data={methodOptions} value={method} onChange={(v) => v && setMethod(v as ConsentMethod)} allowDeselect={false} />
              <TextInput label="Nota (opcional)" placeholder="Formatos firmados en las historias clínicas" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
              <Checkbox
                label="Todos los pacientes de este archivo aceptaron la autorización de datos"
                checked={accepted}
                onChange={(e) => setAccepted(e.currentTarget.checked)}
              />
            </Stack>
          </Paper>
        </>
      )}

      {importer.isError && <Alert color="red">{errorMessage(importer.error)}</Alert>}

      <Group justify="flex-end">
        <Button onClick={submit} loading={importer.isPending} disabled={blocked || !accepted}>
          Importar {parsed?.rows.length ? parsed.rows.length : ''} pacientes
        </Button>
      </Group>
    </Stack>
  );
}

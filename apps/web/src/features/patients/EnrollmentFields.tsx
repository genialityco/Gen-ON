import { Select, SimpleGrid, TextInput } from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import dayjs from 'dayjs';
import type { CreateEnrollmentInput, Protocol } from '@genon/shared';

export interface EnrollmentDraft {
  protocol_id: string | null;
  reference_date: Date | null;
  reference_time: string;
  procedure: string;
  professional: string;
}

export const emptyEnrollment = (): EnrollmentDraft => ({
  protocol_id: null,
  reference_date: null,
  reference_time: '',
  procedure: '',
  professional: '',
});

export function toEnrollmentInput(d: EnrollmentDraft): CreateEnrollmentInput | null {
  if (!d.protocol_id || !d.reference_date) return null;
  return {
    protocol_id: d.protocol_id,
    reference_date: dayjs(d.reference_date).format('YYYY-MM-DD'),
    reference_time: d.reference_time || null,
    procedure: d.procedure.trim() || null,
    professional: d.professional.trim() || null,
  };
}

export function EnrollmentFields({
  value,
  onChange,
  protocols,
}: {
  value: EnrollmentDraft;
  onChange: (v: EnrollmentDraft) => void;
  protocols: Protocol[];
}) {
  const set = (patch: Partial<EnrollmentDraft>) => onChange({ ...value, ...patch });
  const selected = protocols.find((p) => p.id === value.protocol_id);
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Select
        label="Protocolo"
        data={protocols.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
        value={value.protocol_id}
        onChange={(v) => set({ protocol_id: v })}
        searchable
      />
      <DatePickerInput
        label="Fecha del procedimiento o cita"
        value={value.reference_date}
        onChange={(d) => set({ reference_date: d })}
        valueFormat="ddd D MMM YYYY"
      />
      <TimeInput label="Hora (si los mensajes la usan)" value={value.reference_time} onChange={(e) => set({ reference_time: e.currentTarget.value })} />
      <TextInput
        label="Procedimiento"
        placeholder={selected?.procedure ?? ''}
        value={value.procedure}
        onChange={(e) => set({ procedure: e.currentTarget.value })}
      />
      <TextInput
        label="Profesional a cargo"
        placeholder="Dra. Gómez"
        value={value.professional}
        onChange={(e) => set({ professional: e.currentTarget.value })}
      />
    </SimpleGrid>
  );
}

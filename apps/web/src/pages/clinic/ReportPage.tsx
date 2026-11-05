import { useState } from 'react';
import { Button, Divider, Group, Loader, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { PLANS, hasFeature, rate, type MetricsBreakdownRow, type MonthlyUsage, type OrgMetrics, type Organization } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useMetrics } from '../../services/metrics';
import { useUsage } from '../../services/patients';
import { PlanGate } from '../../features/plans/PlanGate';
import { fmtDateTime, fmtDay, todayIn } from '../../lib/format';

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
const num = (n: number) => n.toLocaleString('es-CO');
const monthLabel = (ym: string) => fmtDay(`${ym}-01`, { month: 'long', year: 'numeric' });

/** Últimos 12 meses, el actual primero. */
function lastMonths(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
}

function monthRange(ym: string, today: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return [`${ym}-01`, last < today ? last : today];
}

/** Al imprimir solo queda el reporte: sin menú ni controles. */
const PRINT_CSS = `
@media print {
  .mantine-AppShell-navbar, .mantine-AppShell-header, .no-print { display: none !important; }
  .mantine-AppShell-main { padding: 0 !important; }
  .report { max-width: none !important; }
  .report .mantine-Paper-root { break-inside: avoid; }
}`;

/** Reporte mensual para la clínica: se imprime o se guarda como PDF desde el navegador. */
export function ReportPage() {
  const orgId = useOrgId();
  const { data: org } = useOrganization(orgId);
  const today = todayIn(org?.timezone ?? 'America/Bogota');
  const months = lastMonths(today);
  const [month, setMonth] = useState(months[1]);
  const [from, to] = monthRange(month, today);
  const allowed = !!org && hasFeature(org.plan, 'monthly_report');
  const { data: m, isFetching } = useMetrics(orgId, from, to, allowed);
  const { data: usage } = useUsage(orgId, month);

  if (!org) return <Loader />;
  if (!allowed) {
    return (
      <Stack>
        <Title order={2}>Reporte mensual</Title>
        <PlanGate org={org} feature="monthly_report" what="El reporte mensual">
          {null}
        </PlanGate>
      </Stack>
    );
  }

  return (
    <Stack className="report" maw={900}>
      <style>{PRINT_CSS}</style>
      <Group justify="space-between" className="no-print">
        <Title order={2}>Reporte mensual</Title>
        <Group gap="xs">
          <Select
            data={months.map((ym) => ({ value: ym, label: monthLabel(ym) + (ym === months[0] ? ' (en curso)' : '') }))}
            value={month}
            onChange={(v) => v && setMonth(v)}
            allowDeselect={false}
            w={220}
          />
          <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()} disabled={!m || isFetching}>
            Imprimir o guardar PDF
          </Button>
        </Group>
      </Group>

      {!m || isFetching ? <Loader /> : <Report org={org} month={month} m={m} usage={usage} partial={to === today} />}
    </Stack>
  );
}

function Report({ org, month, m, usage, partial }: { org: Organization; month: string; m: OrgMetrics; usage?: MonthlyUsage; partial: boolean }) {
  const msg = m.messages;
  const a = m.appointments;
  return (
    <Stack>
      <div>
        <Text size="xs" tt="uppercase" fw={700} c="teal.8">
          Gen.ON · Reporte de seguimiento
        </Text>
        <Title order={2} tt="capitalize">
          {monthLabel(month)}
        </Title>
        <Text c="dimmed" size="sm">
          {org.name} · Plan {PLANS[org.plan].label}
          {partial && ` · parcial, hasta el ${fmtDay(m.to, { day: 'numeric', month: 'long' })}`}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Kpi label="Pacientes nuevos" value={num(usage?.new_patients ?? m.patients.new_patients)} sub={usage ? `de ${num(usage.included)} incluidos` : undefined} />
        <Kpi label="Pacientes contactados" value={num(m.patients.contacted)} sub="con al menos un mensaje" />
        <Kpi label="Mensajes enviados" value={num(msg.sent)} sub={`${pct(msg.delivery_rate)} entregados`} />
        <Kpi label="Tasa de respuesta" value={pct(msg.response_rate)} sub={`${num(msg.responses)} respuestas`} />
        <Kpi label="Leídos" value={pct(msg.read_rate)} sub={`${num(msg.read)} mensajes`} />
        <Kpi label="Confirmaciones" value={num(msg.confirmed)} sub="botones de confirmar" />
        <Kpi label="Alertas" value={num(msg.alerts)} sub="pacientes que pidieron atención" />
        <Kpi label="Bajas" value={num(m.patients.opted_out)} sub="ya no reciben mensajes" />
      </SimpleGrid>

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">
          Citas
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 5 }}>
          <Mini label="Agendadas" value={num(a.total)} />
          <Mini label="Asistieron" value={num(a.attended)} />
          <Mini label="No asistieron" value={num(a.no_show)} />
          <Mini label="Asistencia" value={pct(a.attendance_rate)} />
          <Mini label="Confirmadas por WhatsApp" value={num(a.confirmed)} />
        </SimpleGrid>
      </Paper>

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">
          Por protocolo
        </Text>
        <Breakdown rows={m.by_protocol} empty="No hubo envíos este mes." />
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Respuestas más comunes
          </Text>
          <TopList items={m.responses.map((r) => [r.text, r.count])} empty="Sin respuestas este mes." />
        </Paper>
        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Fallas y omisiones
          </Text>
          <TopList items={m.failures.map((f) => [f.reason, f.count])} empty="Sin fallas este mes." />
        </Paper>
      </SimpleGrid>

      <Divider />
      <Text size="xs" c="dimmed">
        Generado por Gen.ON el {fmtDateTime(new Date().toISOString(), org.timezone)} · Fechas en la hora de la clínica ({org.timezone}). Las
        tasas se calculan sobre los mensajes que WhatsApp aceptó.
      </Text>
    </Stack>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Paper>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="lg" fw={700}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </div>
  );
}

function Breakdown({ rows, empty }: { rows: MetricsBreakdownRow[]; empty: string }) {
  const sent = rows.filter((r) => r.sent > 0);
  if (!sent.length) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <Table fz="sm" striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Protocolo</Table.Th>
          <Table.Th ta="right">Enviados</Table.Th>
          <Table.Th ta="right">Entregados</Table.Th>
          <Table.Th ta="right">Leídos</Table.Th>
          <Table.Th ta="right">Respuestas</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sent.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.label}</Table.Td>
            <Table.Td ta="right">{num(r.sent)}</Table.Td>
            <Table.Td ta="right">{pct(rate(r.delivered, r.sent))}</Table.Td>
            <Table.Td ta="right">{pct(rate(r.read, r.sent))}</Table.Td>
            <Table.Td ta="right">
              {num(r.responses)} ({pct(rate(r.responses, r.sent))})
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function TopList({ items, empty }: { items: [string, number][]; empty: string }) {
  if (!items.length) {
    return (
      <Text size="sm" c="dimmed">
        {empty}
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {items.map(([label, count]) => (
        <Group key={label} justify="space-between" wrap="nowrap">
          <Text size="sm" truncate>
            {label}
          </Text>
          <Text size="sm" fw={600}>
            {num(count)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

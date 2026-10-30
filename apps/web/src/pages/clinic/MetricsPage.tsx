import { useMemo, useState } from 'react';
import {
  Badge,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { BarChart, DonutChart, LineChart } from '@mantine/charts';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { addDays, type MetricsBreakdownRow, type MetricsGranularity, type OrgMetrics } from '@genon/shared';
import { useOrgId } from '../../auth/guards';
import { useOrganization } from '../../services/organizations';
import { useMetrics } from '../../services/metrics';
import { fmtDay, todayIn } from '../../lib/format';

/** Paleta categórica validada (orden fijo, contraste para daltonismo) y estados. */
const SERIES = [
  { name: 'sent', label: 'Enviados', color: '#2a78d6' },
  { name: 'delivered', label: 'Entregados', color: '#eb6834' },
  { name: 'read', label: 'Leídos', color: '#1baf7a' },
  { name: 'responses', label: 'Respuestas', color: '#eda100' },
] as const;
const SINGLE = '#2a78d6';
const STATUS = { good: '#0ca30c', critical: '#d03b3b', neutral: '#a3a29c' };

const BILLABLE_LABELS: Record<string, string> = {
  utility: 'Utilidad',
  marketing: 'Marketing',
  authentication: 'Autenticación',
  service: 'Servicio',
};

type Preset = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '12m', label: '12 meses' },
  { value: 'custom', label: 'Rango' },
];

function presetRange(p: Exclude<Preset, 'custom'>, today: string): [string, string] {
  switch (p) {
    case 'today':
      return [today, today];
    case '7d':
      return [addDays(today, -6), today];
    case '30d':
      return [addDays(today, -29), today];
    case '90d':
      return [addDays(today, -89), today];
    case '12m': {
      const [y, m] = today.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
      return [start, today];
    }
  }
}

const ymdOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)} %`);
const num = (n: number) => n.toLocaleString('es-CO');
const share = (part: number, total: number) => (total > 0 ? part / total : null);

function bucketLabel(key: string, g: MetricsGranularity) {
  if (g === 'hour') return `${Number(key)} h`;
  if (g === 'day') return fmtDay(key, { day: 'numeric', month: 'short' });
  return fmtDay(`${key}-01`, { month: 'short', year: '2-digit' });
}

export function MetricsPage() {
  const orgId = useOrgId();
  const { data: org } = useOrganization(orgId);
  const today = todayIn(org?.timezone ?? 'America/Bogota');
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState<DatesRangeValue>([null, null]);

  const [from, to] =
    preset === 'custom' && custom[0] && custom[1]
      ? [ymdOf(custom[0]), ymdOf(custom[1])]
      : presetRange(preset === 'custom' ? '30d' : preset, today);
  const { data: m, isLoading, isFetching } = useMetrics(orgId, from, to);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Group gap="xs">
          <Title order={2}>Métricas</Title>
          {isFetching && <Loader size="xs" />}
        </Group>
        <Group gap="xs" align="flex-end">
          <SegmentedControl size="xs" data={PRESETS} value={preset} onChange={(v) => setPreset(v as Preset)} />
          {preset === 'custom' && (
            <DatePickerInput
              type="range"
              size="xs"
              placeholder="Elige el rango"
              value={custom}
              onChange={setCustom}
              maxDate={new Date()}
              valueFormat="D MMM YYYY"
              w={230}
            />
          )}
        </Group>
      </Group>
      <Text size="sm" c="dimmed">
        {fmtDay(from, { day: 'numeric', month: 'long', year: 'numeric' })}
        {from !== to && ` – ${fmtDay(to, { day: 'numeric', month: 'long', year: 'numeric' })}`} · hora de la clínica
      </Text>

      {isLoading || !m ? <Loader /> : <MetricsBody m={m} />}
    </Stack>
  );
}

function MetricsBody({ m }: { m: OrgMetrics }) {
  const msg = m.messages;
  const hasSends = msg.sent + msg.failed > 0;

  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <StatTile label="Enviados" value={num(msg.sent)} sub={`${num(msg.scheduled)} programados`} />
        <StatTile label="Entregados" value={pct(msg.delivery_rate)} sub={`${num(msg.delivered)} mensajes`} />
        <StatTile label="Leídos" value={pct(msg.read_rate)} sub={`${num(msg.read)} mensajes`} />
        <StatTile label="Respondidos" value={pct(msg.response_rate)} sub={`${num(msg.responses)} respuestas`} />
        <StatTile
          label="Fallidos"
          value={num(msg.failed)}
          sub={`${num(msg.skipped)} omitidos · ${num(msg.cancelled)} cancelados`}
          alert={msg.failed > 0}
        />
        <StatTile label="Mensajes recibidos" value={num(m.inbound)} sub="escritos por pacientes" />
      </SimpleGrid>

      <Paper withBorder p="md">
        <SeriesChart m={m} hasSends={hasSends} />
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <ChartTitle title="Embudo de mensajes" hint="Sobre los mensajes que Meta aceptó en el rango" />
          {hasSends ? (
            <BarChart
              h={220}
              data={[
                { etapa: 'Enviados', valor: msg.sent },
                { etapa: 'Entregados', valor: msg.delivered },
                { etapa: 'Leídos', valor: msg.read },
                { etapa: 'Respondidos', valor: msg.responses },
              ]}
              dataKey="etapa"
              orientation="vertical"
              series={[{ name: 'valor', label: 'Mensajes', color: SINGLE }]}
              yAxisProps={{ width: 90 }}
              gridAxis="x"
              withBarValueLabel
              valueFormatter={num}
              barProps={{ radius: 4 }}
              maxBarWidth={28}
            />
          ) : (
            <Empty />
          )}
        </Paper>

        <Paper withBorder p="md">
          <ChartTitle title="Citas" mb={2} />
          <Text size="sm" c="dimmed" mb="sm">
            Asistencia {pct(m.appointments.attendance_rate)} · {num(m.appointments.confirmed)} confirmadas por WhatsApp
          </Text>
          <AppointmentsChart m={m} />
        </Paper>

        <Paper withBorder p="md">
          <ChartTitle title="Respuestas más comunes" hint="Botones que tocaron los pacientes" />
          {m.responses.length ? (
            <BarChart
              h={Math.max(160, m.responses.length * 36)}
              data={m.responses.map((r) => ({ respuesta: r.text, valor: r.count }))}
              dataKey="respuesta"
              orientation="vertical"
              series={[{ name: 'valor', label: 'Respuestas', color: SINGLE }]}
              yAxisProps={{ width: 140 }}
              gridAxis="x"
              withBarValueLabel
              valueFormatter={num}
              barProps={{ radius: 4 }}
              maxBarWidth={24}
            />
          ) : (
            <Empty text="Aún no hay respuestas en este rango." />
          )}
        </Paper>

        <Paper withBorder p="md">
          <ChartTitle title="Pacientes" />
          <SimpleGrid cols={3} mb="md">
            <MiniStat label="Nuevos" value={m.patients.new_patients} />
            <MiniStat label="Contactados" value={m.patients.contacted} />
            <MiniStat label="Se dieron de baja" value={m.patients.opted_out} />
          </SimpleGrid>
          <ChartTitle title="Conversaciones cobradas por Meta" />
          {Object.keys(m.billable).length ? (
            <Group gap="xs">
              {Object.entries(m.billable).map(([cat, n]) => (
                <Badge key={cat} variant="light" color="gray" size="lg">
                  {BILLABLE_LABELS[cat] ?? cat}: {num(n)}
                </Badge>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Sin conversaciones cobradas en este rango.
            </Text>
          )}
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <ChartTitle title="Por protocolo" />
        <Breakdown rows={m.by_protocol} />
      </Paper>
      <Paper withBorder p="md">
        <ChartTitle title="Por plantilla" />
        <Breakdown rows={m.by_template} />
      </Paper>

      {m.failures.length > 0 && (
        <Paper withBorder p="md">
          <ChartTitle title="Motivos de fallas y omisiones" />
          <Table>
            <Table.Tbody>
              {m.failures.map((f) => (
                <Table.Tr key={f.reason}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <IconAlertTriangle size={14} color={STATUS.critical} />
                      <Text size="sm">{f.reason}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right" w={80}>
                    {num(f.count)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

/** Evolución en el tiempo, con vista de tabla (los colores claros no bastan solos). */
function SeriesChart({ m, hasSends }: { m: OrgMetrics; hasSends: boolean }) {
  const [asTable, setAsTable] = useState(false);
  const data = useMemo(() => m.series.map((b) => ({ ...b, label: bucketLabel(b.key, m.granularity) })), [m]);
  const by = m.granularity === 'hour' ? 'por hora' : m.granularity === 'day' ? 'por día' : 'por mes';

  return (
    <>
      <Group justify="space-between" mb="sm">
        <ChartTitle title={`Mensajes ${by}`} mb={0} />
        <Switch size="xs" label="Ver tabla" checked={asTable} onChange={(e) => setAsTable(e.currentTarget.checked)} />
      </Group>
      {!hasSends ? (
        <Empty />
      ) : asTable ? (
        <Table.ScrollContainer minWidth={480} mah={320}>
          <Table striped stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                {SERIES.map((s) => (
                  <Table.Th key={s.name} ta="right">
                    {s.label}
                  </Table.Th>
                ))}
                <Table.Th ta="right">Fallidos</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((b) => (
                <Table.Tr key={b.key}>
                  <Table.Td>{b.label}</Table.Td>
                  {SERIES.map((s) => (
                    <Table.Td key={s.name} ta="right">
                      {num(b[s.name])}
                    </Table.Td>
                  ))}
                  <Table.Td ta="right">{num(b.failed)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <LineChart
          h={280}
          data={data}
          dataKey="label"
          series={SERIES.map((s) => ({ ...s }))}
          curveType="monotone"
          strokeWidth={2}
          withDots={data.length <= 31}
          dotProps={{ r: 4 }}
          gridAxis="y"
          withLegend
          legendProps={{ verticalAlign: 'top', height: 40 }}
          valueFormatter={num}
          yAxisProps={{ allowDecimals: false, width: 40 }}
        />
      )}
    </>
  );
}

function AppointmentsChart({ m }: { m: OrgMetrics }) {
  const a = m.appointments;
  const data = [
    { name: 'Asistieron', value: a.attended, color: STATUS.good },
    { name: 'No asistieron', value: a.no_show, color: STATUS.critical },
    { name: 'Canceladas', value: a.cancelled, color: STATUS.neutral },
    { name: 'Por atender', value: a.scheduled, color: SINGLE },
  ];
  if (!a.total) return <Empty text="No hay citas en este rango." />;
  return (
    <Group wrap="nowrap" gap="lg">
      <DonutChart
        data={data.filter((d) => d.value > 0)}
        size={150}
        thickness={22}
        paddingAngle={2}
        chartLabel={`${num(a.total)} citas`}
        tooltipDataSource="segment"
        valueFormatter={num}
      />
      <Stack gap={6}>
        {data.map((d) => (
          <Group key={d.name} gap={8} wrap="nowrap">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flex: 'none' }} />
            <Text size="sm">
              {d.name}: <b>{num(d.value)}</b>
              <Text span size="xs" c="dimmed">
                {' '}
                ({pct(share(d.value, a.total))})
              </Text>
            </Text>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}

function Breakdown({ rows }: { rows: MetricsBreakdownRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th ta="right">Enviados</Table.Th>
            <Table.Th ta="right">Entregados</Table.Th>
            <Table.Th ta="right">Leídos</Table.Th>
            <Table.Th ta="right">Respondidos</Table.Th>
            <Table.Th ta="right">Fallidos</Table.Th>
            <Table.Th ta="right">Omitidos</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.key}>
              <Table.Td fw={500}>{r.label}</Table.Td>
              <Table.Td ta="right">{num(r.sent)}</Table.Td>
              <RateCell part={r.delivered} total={r.sent} />
              <RateCell part={r.read} total={r.sent} />
              <RateCell part={r.responses} total={r.sent} />
              <Table.Td ta="right" c={r.failed ? 'red' : undefined}>
                {num(r.failed)}
              </Table.Td>
              <Table.Td ta="right" c="dimmed">
                {num(r.skipped)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function RateCell({ part, total }: { part: number; total: number }) {
  const r = share(part, total);
  return (
    <Table.Td ta="right">
      <Tooltip label={`${num(part)} de ${num(total)}`} disabled={!total}>
        <Stack gap={2} align="flex-end">
          <Text size="sm">{pct(r)}</Text>
          {r !== null && (
            <div style={{ width: 64, height: 4, borderRadius: 2, background: 'var(--mantine-color-gray-2)' }}>
              <div style={{ width: `${r * 100}%`, height: 4, borderRadius: 2, background: SINGLE }} />
            </div>
          )}
        </Stack>
      </Tooltip>
    </Table.Td>
  );
}

function StatTile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <Paper withBorder p="md">
      <Group gap={6}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        {alert && <IconAlertTriangle size={14} color={STATUS.critical} />}
      </Group>
      <Text size="xl" fw={700} mt={4}>
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Text size="xl" fw={700}>
        {num(value)}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </div>
  );
}

function ChartTitle({ title, hint, mb = 'sm' }: { title: string; hint?: string; mb?: string | number }) {
  return (
    <Group gap={6} mb={mb}>
      <Text fw={600}>{title}</Text>
      {hint && (
        <Tooltip label={hint} multiline maw={260}>
          <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" />
        </Tooltip>
      )}
    </Group>
  );
}

function Empty({ text = 'Sin envíos en este rango.' }: { text?: string }) {
  return (
    <Text size="sm" c="dimmed" py="lg" ta="center">
      {text}
    </Text>
  );
}

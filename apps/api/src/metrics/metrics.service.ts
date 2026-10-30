import { BadRequestException, Injectable } from '@nestjs/common';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import {
  METRICS_MAX_DAYS,
  addDays,
  isYmd,
  localDate,
  localTime,
  metricsGranularity,
  rate,
  type MessageCounts,
  type MetricsBreakdownRow,
  type MetricsBucket,
  type MetricsGranularity,
  type OrgMetrics,
  type Template,
  zonedTime,
} from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';
import { OrganizationsService } from '../organizations/organizations.service';
import { TemplatesService } from '../templates/templates.service';

/** Mismo rango consultado varias veces seguidas (cambiar de pestaña, refrescar) no vuelve a leer. */
const CACHE_MS = 60_000;
const TOP = 10;

const zero = (): MessageCounts => ({ sent: 0, delivered: 0, read: 0, responses: 0, failed: 0 });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/** Claves de todos los tramos del rango, para que la serie no tenga huecos. */
function bucketKeys(from: string, to: string, g: MetricsGranularity): string[] {
  if (g === 'hour') return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  const keys: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = g === 'day' ? d : d.slice(0, 7);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

function top(map: Map<string, number>) {
  return [...map].sort((a, b) => b[1] - a[1]).slice(0, TOP);
}

/**
 * Métricas calculadas desde la parrilla (un documento por envío), las citas,
 * los pacientes y los contadores diarios del webhook. Los envíos se ubican
 * por su hora de envío en la zona horaria de la clínica.
 */
@Injectable()
export class MetricsService {
  private readonly cache = new Map<string, { at: number; value: OrgMetrics }>();

  constructor(
    private readonly firebase: FirebaseService,
    private readonly orgs: OrganizationsService,
    private readonly templates: TemplatesService,
  ) {}

  async get(orgId: string, from: string, to: string): Promise<OrgMetrics> {
    if (!isYmd(from) || !isYmd(to) || to < from) throw new BadRequestException('Rango de fechas inválido');
    const days = daysBetween(from, to);
    if (days > METRICS_MAX_DAYS) throw new BadRequestException(`El rango no puede pasar de ${METRICS_MAX_DAYS} días`);

    const key = `${orgId}|${from}|${to}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await this.compute(orgId, from, to, metricsGranularity(days));
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  private async compute(orgId: string, from: string, to: string, granularity: MetricsGranularity): Promise<OrgMetrics> {
    const org = await this.orgs.get(orgId);
    const tz = org.timezone;
    const start = Timestamp.fromDate(zonedTime(from, '00:00', tz));
    const end = Timestamp.fromDate(zonedTime(addDays(to, 1), '00:00', tz));
    const ref = this.firebase.db.collection(COL.organizations).doc(orgId);

    const [outbox, appointments, newPatients, optedOut, stats, templates] = await Promise.all([
      ref
        .collection(COL.outbox)
        .where('send_at', '>=', start)
        .where('send_at', '<', end)
        .select('send_at', 'sent_at', 'status', 'delivery_status', 'response', 'protocol_id', 'protocol_name', 'template_key', 'status_reason', 'patient_id', 'appointment_id')
        .get(),
      ref.collection(COL.appointments).where('date', '>=', from).where('date', '<=', to).select('status').get(),
      ref.collection(COL.patients).where('created_at', '>=', start).where('created_at', '<', end).count().get(),
      ref.collection(COL.patients).where('opted_out_at', '>=', start).where('opted_out_at', '<', end).count().get(),
      ref.collection(COL.statsDaily).where(FieldPath.documentId(), '>=', from).where(FieldPath.documentId(), '<=', to).get(),
      this.templates.list({ orgId }),
    ]);

    const tpl = new Map<string, Template>(templates.map((t) => [t.key, t]));
    const isConfirm = (key: string, index: number) => {
      const t = tpl.get(key);
      return (t?.approved?.buttons ?? t?.buttons ?? [])[index]?.action?.type === 'confirm';
    };

    const totals = { ...zero(), scheduled: 0, skipped: 0, cancelled: 0, confirmed: 0 };
    const series = new Map<string, MetricsBucket>(bucketKeys(from, to, granularity).map((k) => [k, { key: k, ...zero() }]));
    const byProtocol = new Map<string, MetricsBreakdownRow>();
    const byTemplate = new Map<string, MetricsBreakdownRow>();
    const responses = new Map<string, number>();
    const failures = new Map<string, number>();
    const contacted = new Set<string>();
    const confirmedAppointments = new Set<string>();

    const row = (map: Map<string, MetricsBreakdownRow>, key: string, label: string) => {
      let r = map.get(key);
      if (!r) map.set(key, (r = { key, label, skipped: 0, ...zero() }));
      return r;
    };
    const bucketOf = (at: Date) =>
      granularity === 'hour' ? localTime(at, tz).slice(0, 2) : granularity === 'day' ? localDate(at, tz) : localDate(at, tz).slice(0, 7);

    for (const doc of outbox.docs) {
      const d = doc.data();
      const rows = [
        row(byProtocol, d.protocol_id ?? (d.appointment_id ? 'appointments' : 'manual'), d.protocol_name ?? (d.appointment_id ? 'Citas' : 'Envíos manuales')),
        row(byTemplate, d.template_key, tpl.get(d.template_key)?.label ?? d.template_key),
      ];

      if (d.status === 'scheduled' || d.status === 'sending') {
        totals.scheduled++;
        continue;
      }
      if (d.status === 'cancelled') {
        totals.cancelled++;
        continue;
      }
      if (d.status === 'skipped') {
        totals.skipped++;
        rows.forEach((r) => r.skipped++);
        if (d.status_reason) failures.set(d.status_reason, (failures.get(d.status_reason) ?? 0) + 1);
        continue;
      }

      const bucket = series.get(bucketOf((d.sent_at ?? d.send_at).toDate()));
      const targets = [totals, ...rows, ...(bucket ? [bucket] : [])];
      const inc = (k: keyof MessageCounts) => targets.forEach((t) => t[k]++);

      const undelivered = d.status === 'failed' || d.delivery_status === 'failed';
      if (undelivered) {
        inc('failed');
        const reason = d.status_reason || 'Sin detalle';
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
      }
      if (d.status !== 'sent') continue;
      inc('sent');
      contacted.add(d.patient_id);
      if (d.delivery_status === 'delivered' || d.delivery_status === 'read') inc('delivered');
      if (d.delivery_status === 'read') inc('read');
      if (d.response) {
        inc('responses');
        responses.set(d.response.text, (responses.get(d.response.text) ?? 0) + 1);
        if (isConfirm(d.template_key, d.response.index)) {
          totals.confirmed++;
          if (d.appointment_id) confirmedAppointments.add(d.appointment_id);
        }
      }
    }

    const appt = { total: 0, scheduled: 0, attended: 0, no_show: 0, cancelled: 0 };
    for (const a of appointments.docs) {
      const s = a.get('status') as keyof typeof appt;
      appt.total++;
      if (s in appt) appt[s]++;
    }

    let inbound = 0;
    const billable: Record<string, number> = {};
    for (const s of stats.docs) {
      inbound += s.get('inbound') ?? 0;
      for (const [cat, n] of Object.entries((s.get('billable') ?? {}) as Record<string, number>)) {
        billable[cat] = (billable[cat] ?? 0) + n;
      }
    }

    const sortRows = (m: Map<string, MetricsBreakdownRow>) =>
      [...m.values()].sort((a, b) => b.sent - a.sent || b.skipped - a.skipped || a.label.localeCompare(b.label));

    return {
      from,
      to,
      granularity,
      messages: {
        ...totals,
        delivery_rate: rate(totals.delivered, totals.sent),
        read_rate: rate(totals.read, totals.sent),
        response_rate: rate(totals.responses, totals.sent),
      },
      patients: {
        new_patients: newPatients.data().count,
        contacted: contacted.size,
        opted_out: optedOut.data().count,
      },
      appointments: {
        ...appt,
        attendance_rate: rate(appt.attended, appt.attended + appt.no_show),
        confirmed: confirmedAppointments.size,
      },
      inbound,
      billable,
      series: [...series.values()],
      by_protocol: sortRows(byProtocol),
      by_template: sortRows(byTemplate),
      responses: top(responses).map(([text, count]) => ({ text, count })),
      failures: top(failures).map(([reason, count]) => ({ reason, count })),
    };
  }
}

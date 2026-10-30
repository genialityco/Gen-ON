// Datos de demostración en una organización (requiere `npm run build -w @genon/api`).
//   npm run seed:demo -- <orgId>           crea protocolos, plantillas, pacientes,
//                                          inscripciones e historial de mensajes
//   npm run seed:demo -- <orgId> --reset   borra solo lo creado por este script
//
// Todo queda con `demo: true`. Las plantillas se marcan aprobadas sin pasar por
// Meta y los celulares son ficticios: la organización debe quedar en
// configuración (el despachador solo envía en organizaciones activas).
const path = require('path');

const API = path.resolve(__dirname, '..');
process.chdir(API); // ConfigModule lee apps/api/.env
const dist = (p) => require(path.join(API, 'dist', p));
const { NestFactory } = require('@nestjs/core');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const shared = require('@genon/shared');

const [orgId, flag] = process.argv.slice(2);
if (!orgId) {
  console.error('Uso: npm run seed:demo -- <orgId> [--reset]');
  process.exit(1);
}

// Aleatorio con semilla: los mismos datos en cada corrida
let seed = 20261029;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (list) => list[Math.floor(rand() * list.length)];

const VALIDATOR = 'Dra. Laura Gómez, médica estética (demo)';

const PATIENTS = [
  ['María Fernanda', 'Rojas Díaz', 'written'],
  ['Juan Camilo', 'Pérez Gómez', 'verbal'],
  ['Valentina', 'Morales Castro', 'digital_form'],
  ['Andrés Felipe', 'Herrera Ruiz', 'written'],
  ['Laura Sofía', 'Ramírez Ortiz', 'whatsapp'],
  ['Carlos Eduardo', 'Vargas León', 'written'],
  ['Daniela', 'Castillo Mejía', 'verbal'],
  ['Santiago', 'Torres Quintero', 'digital_form'],
  ['Camila Andrea', 'Jiménez Salazar', 'written'],
  ['Sebastián', 'Muñoz Cárdenas', 'written'],
  ['Natalia', 'Gutiérrez Arango', 'verbal'],
  ['Felipe', 'Ospina Restrepo', 'digital_form'],
  ['Isabella', 'Londoño Vélez', 'written'],
  ['Martín', 'Cifuentes Parra', 'verbal'],
];

// [paciente, protocolo, días desde hoy, hora, procedimiento, profesional]
const ENROLLMENTS = [
  [0, 'Cirugía con recuperación', -24, '07:30', 'rinoplastia', 'Dr. Andrés Mejía'],
  [1, 'Cirugía con recuperación', -9, '08:00', 'liposucción de abdomen', 'Dr. Andrés Mejía'],
  [2, 'Cirugía con recuperación', -3, '07:00', 'blefaroplastia', 'Dra. Paula Rincón'],
  [3, 'Cirugía con recuperación', 1, '09:00', 'mamoplastia de aumento', 'Dr. Andrés Mejía'],
  [4, 'Cirugía con recuperación', 6, '08:30', 'rinoplastia', 'Dra. Paula Rincón'],
  [5, 'Procedimiento estético ambulatorio', -16, '10:00', 'toxina botulínica', 'Dra. Laura Gómez'],
  [6, 'Procedimiento estético ambulatorio', -1, '11:30', 'relleno con ácido hialurónico', 'Dra. Laura Gómez'],
  [7, 'Procedimiento estético ambulatorio', 2, '15:00', 'peeling químico', 'Dra. Laura Gómez'],
  [8, 'Procedimiento estético ambulatorio', 9, '10:30', 'toxina botulínica', 'Dra. Laura Gómez'],
  [9, 'Recordatorio de cita', 1, '16:00', 'valoración', 'Dr. Andrés Mejía'],
  [10, 'Recordatorio de cita', 2, '09:30', 'control posoperatorio', 'Dra. Paula Rincón'],
  [11, 'Recordatorio de cita', 4, '14:00', 'valoración', 'Dra. Laura Gómez'],
  [12, 'Recordatorio de cita', 12, '11:00', 'control', 'Dr. Andrés Mejía'],
  [0, 'Recordatorio de cita', 3, '10:00', 'control de rinoplastia', 'Dr. Andrés Mejía'],
];
const OPTED_OUT = 13;

// Citas agendadas a mano: [paciente, días desde hoy, hora, motivo, profesional, recordatorios, estado final]
const d1 = (time = '09:00') => ({ kind: 'days', days: 1, time });
const h = (hours) => ({ kind: 'hours', hours });
const APPOINTMENTS = [
  [1, 3, '10:00', 'Control de liposucción', 'Dr. Andrés Mejía', [d1(), h(2)], null],
  [5, 5, '15:00', 'Retoque de toxina botulínica', 'Dra. Laura Gómez', [d1()], null],
  [2, 2, '08:30', 'Retiro de puntos', 'Dra. Paula Rincón', [d1('17:00'), h(2)], null],
  [12, 8, '11:30', 'Valoración de rinoplastia', 'Dr. Andrés Mejía', [{ kind: 'days', days: 2, time: '09:00' }, { kind: 'days', days: 0, time: '07:00' }], null],
  [0, -24, '07:30', 'Rinoplastia', 'Dr. Andrés Mejía', [], 'attended'],
  [5, -16, '10:00', 'Toxina botulínica', 'Dra. Laura Gómez', [], 'attended'],
  [7, -5, '14:00', 'Valoración', 'Dra. Laura Gómez', [], 'no_show'],
];

// Fichas clínicas: [paciente, antecedentes, notas [días desde hoy, tipo, texto, procedimiento]]
const CLINICAL = [
  [
    0,
    { allergies: 'Ninguna conocida', medications: 'Acetaminofén si hay dolor', conditions: 'Rinitis alérgica', surgeries: 'Ninguna previa', habits: 'No fuma' },
    [
      [-24, 'procedure', 'Rinoplastia abierta sin complicaciones. Se entregan indicaciones por escrito.', { name: 'Rinoplastia', area: 'Nariz', product: null, lot: null, quantity: null }],
      [-17, 'control', 'Edema leve esperado. Se retira férula. Paciente tranquila.', null],
      [-3, 'evolution', 'Buena evolución, sin signos de infección. Continúa con lavados nasales.', null],
    ],
  ],
  [
    2,
    { allergies: 'Penicilina', medications: null, conditions: 'Hipotiroidismo controlado', surgeries: 'Cesárea (2019)', habits: null },
    [[-3, 'procedure', 'Blefaroplastia superior bilateral. Sutura intradérmica.', { name: 'Blefaroplastia superior', area: 'Párpados', product: null, lot: null, quantity: null }]],
  ],
  [
    5,
    { allergies: 'Ninguna conocida', medications: null, conditions: null, surgeries: 'Toxina botulínica (2025)', habits: 'Ejercicio diario' },
    [
      [-16, 'procedure', 'Aplicación en frente y entrecejo. Se explican cuidados de las primeras 4 horas.', { name: 'Toxina botulínica', area: 'Frente y entrecejo', product: 'Botox 100 U', lot: 'C1234AB', quantity: '20 U' }],
      [-2, 'control', 'Resultado simétrico. Se agenda retoque leve en entrecejo.', null],
    ],
  ],
];

async function seedAppointments(app, created, templateKey, today) {
  const appointments = app.get(dist('patients/appointments.service').AppointmentsService);
  const user = { uid: 'seed-demo', email: 'demo@geniality.com.co', name: 'Datos de demostración', role: 'superadmin' };
  for (const [i, days, time, reason, professional, timings, status] of APPOINTMENTS) {
    const r = await appointments.create(
      orgId,
      {
        patient_id: created[i].id,
        date: shared.addDays(today, days),
        time,
        reason,
        professional,
        notes: null,
        reminders: timings.map((timing) => ({ template_key: templateKey, timing })),
      },
      user,
    );
    await appointments.col(orgId).doc(r.appointment.id).update({ demo: true });
    if (status) await appointments.setStatus(orgId, r.appointment.id, status);
  }
  return APPOINTMENTS.length;
}

async function seedClinical(app, created, today) {
  const clinical = app.get(dist('clinical/clinical.service').ClinicalService);
  const dra = { uid: 'seed-demo-dra', email: 'demo@geniality.com.co', name: 'Dra. Laura Gómez (demo)', role: null };
  let n = 0;
  for (const [i, background, notes] of CLINICAL) {
    const id = created[i].id;
    await clinical.updateBackground(orgId, id, background, dra, 'clinician');
    for (const [days, kind, body, procedure] of notes) {
      await clinical.addNote(orgId, id, { kind, date: shared.addDays(today, days), body, procedure }, dra, 'clinician');
      n++;
    }
    if (i === 5) {
      const first = (await clinical.view(orgId, id, dra, 'clinician')).notes.find((x) => x.kind === 'procedure');
      await clinical.addNote(orgId, id, { kind: 'addendum', date: shared.addDays(today, -15), body: 'Corrección: la cantidad aplicada fue 24 U.', amends: first.id }, dra, 'clinician');
      n++;
    }
  }
  return n;
}

async function reset(db, org) {
  const ref = db.collection('organizations').doc(orgId);
  const demo = async (sub) => (await ref.collection(sub).where('demo', '==', true).get()).docs;
  const patients = await demo('patients');
  const ids = new Set(patients.map((d) => d.id));
  let n = 0;
  const del = async (docs) => {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    n += docs.length;
  };
  for (const sub of ['enrollments', 'appointments', 'outbox', 'clinical_notes', 'clinical_access']) {
    const docs = (await ref.collection(sub).get()).docs.filter((d) => ids.has(d.get('patient_id')));
    await del(docs);
  }
  for (const sub of ['messages', 'stats_daily', 'wa_contacts', 'protocols', 'templates']) await del(await demo(sub));
  for (const id of ids) {
    const rec = ref.collection('clinical_records').doc(id);
    if ((await rec.get()).exists) {
      await db.recursiveDelete(rec);
      n++;
    }
  }
  await del(patients);
  // Pacientes del mes: se quitan los de demostración y se recalcula
  for (const u of (await ref.collection('usage_monthly').get()).docs) {
    const map = { ...(u.get('patients') ?? {}) };
    for (const id of ids) delete map[id];
    // update reemplaza el mapa completo y conserva el resto (mensajes enviados)
    await u.ref.update({ month: u.id, patients: map, new_patients: Object.keys(map).length });
  }
  console.log(`${org.name}: ${n} documentos de demostración borrados`);
}

async function seedData(app, db, org) {
  const svc = (f, name) => app.get(dist(f)[name]);
  const orgs = svc('organizations/organizations.service', 'OrganizationsService');
  const templates = svc('templates/templates.service', 'TemplatesService');
  const protocols = svc('templates/protocols.service', 'ProtocolsService');
  const patients = svc('patients/patients.service', 'PatientsService');
  const enrollments = svc('patients/enrollments.service', 'EnrollmentsService');
  const outbox = svc('patients/outbox.service', 'OutboxService');
  const ref = db.collection('organizations').doc(orgId);
  const scope = { orgId };
  const tz = org.timezone;
  const now = Date.now();
  const user = { uid: 'seed-demo', email: 'demo@geniality.com.co', name: 'Datos de demostración', role: 'superadmin' };

  if ((await ref.collection('patients').where('demo', '==', true).limit(1).get()).size) {
    throw new Error('Ya tiene datos de demostración: borra primero con --reset');
  }

  // Datos de la clínica que usan las variables (solo si faltan)
  const company = {};
  if (!org.contact_phone) company.contact_phone = '601 555 0100';
  if (!org.address) company.address = 'Calle 100 # 15-20, consultorio 302';
  if (!org.city) company.city = 'Bogotá';
  if (Object.keys(company).length) await orgs.updateCompany(orgId, company);

  // Protocolos de la biblioteca (traen sus plantillas en borrador)
  const library = await protocols.list('library');
  if (!library.length) throw new Error('La biblioteca está vacía: usa "Cargar ejemplos" en Biblioteca');
  const byName = {};
  for (const p of library) {
    const copy = await protocols.copyFromLibrary(p.id, orgId);
    await protocols.col(scope).doc(copy.id).update({ demo: true });
    byName[p.name] = copy;
  }

  // Plantillas aprobadas sin pasar por Meta (marcadas demo)
  const list = await templates.list(scope);
  for (const t of list) {
    const metaName = shared.metaTemplateName(t.key, 1);
    const { variables } = shared.buildMetaTemplate(t, metaName);
    await templates.col(scope).doc(t.id).update({
      demo: true,
      clinical_validated_by: VALIDATOR,
      clinical_validated_at: Timestamp.now(),
      meta_status: 'APPROVED',
      meta_name: metaName,
      meta_id: `demo_${t.key}`,
      meta_category: t.category,
      meta_variables: variables,
      submitted_at: Timestamp.now(),
      has_approved: true,
      approved: {
        meta_name: metaName,
        language: t.language,
        header: t.header,
        body: t.body,
        footer: t.footer,
        variables,
        buttons: t.buttons,
        version: 1,
        approved_at: Timestamp.now(),
      },
    });
  }
  // Una en revisión y una rechazada, para ver esos estados
  await templates.create(
    scope,
    {
      key: 'promo_limpieza_facial',
      label: 'Promoción limpieza facial',
      category: 'MARKETING',
      body: 'Hola {{nombre}}, este mes en {{clinica}} tenemos 20 % de descuento en limpieza facial profunda. ¿Quieres agendar tu cita?',
      buttons: [{ type: 'QUICK_REPLY', text: 'Quiero agendar', action: { type: 'alert', alert_level: 'info' } }],
      clinical_validated_by: VALIDATOR,
    },
    { demo: true, meta_status: 'REJECTED', meta_name: 'promo_limpieza_facial_v1', rejected_reason: 'INVALID_FORMAT (demo)' },
  );
  await templates.create(
    scope,
    {
      key: 'indicaciones_toxina',
      label: 'Indicaciones después de toxina',
      body: 'Hola {{nombre}}, después de tu {{procedimiento}} evita acostarte o hacer ejercicio durante las próximas 4 horas y no masajees la zona. Cualquier duda, escríbenos.',
      clinical_validated_by: VALIDATOR,
    },
    { demo: true, meta_status: 'PENDING', meta_name: 'indicaciones_toxina_v1', submitted_at: Timestamp.now() },
  );
  const tplByKey = Object.fromEntries((await templates.list(scope)).map((t) => [t.key, t]));

  // Pacientes
  const created = [];
  for (let i = 0; i < PATIENTS.length; i++) {
    const [first_name, last_name, method] = PATIENTS[i];
    const p = await patients.create(
      orgId,
      { first_name, last_name, phone: `300555${String(1000 + i).padStart(4, '0')}`, email: null, notes: i === 2 ? 'Alergia a la penicilina.' : null },
      { method, note: method === 'written' ? 'Formato firmado en la historia clínica' : null },
      user,
    );
    await patients.col(orgId).doc(p.id).update({ demo: true });
    created.push(p);
  }

  // Inscripciones: arman la parrilla
  const today = shared.localDate(new Date(), tz);
  let scheduled = 0;
  for (const [pi, protoName, days, time, procedure, professional] of ENROLLMENTS) {
    const proto = byName[protoName];
    if (!proto) continue;
    const r = await enrollments.create(
      orgId,
      created[pi].id,
      { protocol_id: proto.id, reference_date: shared.addDays(today, days), reference_time: time, procedure, professional },
      user,
    );
    scheduled += r.scheduled;
  }

  // Historial: lo que ya pasó queda enviado, con su entrega y respuestas
  const items = (await outbox.col(orgId).get()).docs.filter((d) => d.get('send_at').toMillis() < now);
  const stats = {};
  const bump = (date, field, n = 1) => {
    stats[date] ??= {};
    stats[date][field] = (stats[date][field] ?? 0) + n;
  };
  let sent = 0;
  let replies = 0;
  for (const doc of items) {
    const d = doc.data();
    const at = d.send_at.toMillis() + 60_000;
    const date = shared.localDate(new Date(at), tz);
    const wamid = `wamid.DEMO.${doc.id}`;
    // El cuarto siempre falla, para ver ese estado en la parrilla
    const r = sent === 3 ? 0 : rand();
    const delivery = r < 0.06 ? 'failed' : r < 0.14 ? 'sent' : r < 0.38 ? 'delivered' : 'read';
    const statuses = { sent: Timestamp.fromMillis(at + 2_000) };
    if (delivery === 'delivered' || delivery === 'read') statuses.delivered = Timestamp.fromMillis(at + 5_000);
    if (delivery === 'read') statuses.read = Timestamp.fromMillis(at + Math.floor(rand() * 3 * 3_600_000) + 60_000);
    if (delivery === 'failed') statuses.failed = Timestamp.fromMillis(at + 5_000);

    const tpl = tplByKey[d.template_key];
    const quick = (tpl?.buttons ?? []).map((b, i) => ({ b, i })).filter(({ b }) => b.type === 'QUICK_REPLY');
    let response = null;
    if (delivery === 'read' && quick.length && rand() < 0.7) {
      // La primera opción (la "buena") es la más común
      const { b, i } = rand() < 0.6 ? quick[0] : pick(quick);
      const replyAt = statuses.read.toMillis() + Math.floor(rand() * 600_000);
      response = { index: i, text: b.text, at: Timestamp.fromMillis(replyAt) };
    }

    const batch = db.batch();
    batch.update(doc.ref, {
      status: 'sent',
      status_reason: delivery === 'failed' ? 'Mensaje no entregado: el número no tiene WhatsApp (demo)' : null,
      queue_at: FieldValue.delete(),
      attempts: 1,
      wamid,
      sent_at: Timestamp.fromMillis(at),
      delivery_status: delivery,
      response,
    });
    batch.set(ref.collection('messages').doc(wamid), {
      demo: true,
      direction: 'out',
      kind: 'outbox',
      outbox_id: doc.id,
      patient_id: d.patient_id,
      enrollment_id: d.enrollment_id,
      to: d.phone,
      type: 'template',
      template_key: d.template_key,
      status: delivery,
      statuses,
      pricing: { billable: true, category: 'utility', pricing_model: 'PMP' },
      created_at: Timestamp.fromMillis(at),
    });
    bump(date, 'sent');
    bump(date, 'billable.utility');
    if (statuses.delivered) bump(date, 'delivered');
    if (statuses.read) bump(shared.localDate(statuses.read.toDate(), tz), 'read');
    if (statuses.failed) bump(date, 'failed');
    if (response) {
      const inId = `wamid.DEMO.IN.${doc.id}`;
      batch.set(ref.collection('messages').doc(inId), {
        demo: true,
        direction: 'in',
        from: d.phone,
        contact_name: d.patient_name,
        type: 'button',
        text: response.text,
        reply: { id: shared.outboxButtonPayload(doc.id, response.index), title: response.text },
        outbox_id: doc.id,
        received_at: response.at,
        handled: false,
        created_at: response.at,
      });
      batch.set(
        ref.collection('wa_contacts').doc(d.phone),
        { demo: true, wa_id: d.phone, name: d.patient_name, last_inbound_at: response.at },
        { merge: true },
      );
      bump(shared.localDate(response.at.toDate(), tz), 'inbound');
      replies++;
    }
    await batch.commit();
    sent++;
  }
  // Se suman a los contadores del día (no los reemplazan)
  for (const [date, fields] of Object.entries(stats)) {
    const data = { demo: true, date };
    for (const [k, v] of Object.entries(fields)) {
      if (k.startsWith('billable.')) (data.billable ??= {})[k.slice(9)] = FieldValue.increment(v);
      else data[k] = FieldValue.increment(v);
    }
    await ref.collection('stats_daily').doc(date).set(data, { merge: true });
  }
  // Inscripciones que ya no tienen nada pendiente
  for (const e of (await enrollments.col(orgId).get()).docs) await enrollments.completeIfDone(orgId, e.id);

  // Un envío manual para mañana y una baja
  const tomorrow = shared.zonedTime(shared.addDays(today, 1), '11:00', tz);
  const t = tplByKey.cita_recordatorio ?? Object.values(tplByKey).find((x) => x.approved);
  await outbox.addManual(orgId, tz, {
    enrollment_id: null,
    patient_id: created[9].id,
    patient_name: shared.patientFullName(created[9]),
    phone: created[9].phone,
    protocol_id: null,
    protocol_name: null,
    step_id: null,
    appointment_id: null,
    step_label: t.label,
    day_offset: null,
    template_key: t.key,
    at: tomorrow,
    shifted: false,
    manual: true,
    created_by: user.uid,
  });
  await patients.optOut(orgId, created[OPTED_OUT].id, 'Pidió no recibir más mensajes (demo)');

  const appts = await seedAppointments(app, created, t.key, today);
  const notes = await seedClinical(app, created, today);

  console.log(`${org.name}: datos de demostración creados`);
  console.log(`  ${Object.keys(byName).length} protocolos, ${Object.keys(tplByKey).length} plantillas`);
  console.log(`  ${created.length} pacientes (1 dado de baja), ${ENROLLMENTS.length} inscripciones, ${scheduled} envíos en la parrilla`);
  console.log(`  ${sent} ya enviados (historial simulado), ${replies} con respuesta del paciente`);
  console.log(`  ${appts} citas agendadas a mano, ${notes} notas en fichas clínicas`);
}

(async () => {
  const app = await NestFactory.createApplicationContext(dist('app.module').AppModule, { logger: ['error', 'warn'] });
  const db = app.get(dist('firebase/firebase.service').FirebaseService).db;
  let code = 0;
  try {
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) throw new Error(`No existe la organización ${orgId}`);
    const org = await app.get(dist('organizations/organizations.service').OrganizationsService).get(orgId);
    if (flag === '--reset') {
      await reset(db, org);
    } else {
      if (org.status === 'active') {
        throw new Error('La organización está activa: el despachador intentaría enviar a los celulares de prueba. Pásala a "En configuración" primero.');
      }
      await seedData(app, db, org);
    }
  } catch (e) {
    console.error('Error:', e.message);
    code = 1;
  } finally {
    await app.close();
    process.exit(code);
  }
})();

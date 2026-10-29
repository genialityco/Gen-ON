import { randomBytes } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { validateProtocol, type Protocol, type ProtocolInput, type ProtocolStep } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL, isoOrNull, type Scope } from '../common/firestore';
import { TemplatesService } from './templates.service';

export const stepId = () => randomBytes(5).toString('hex');

function cleanSteps(raw: unknown): ProtocolStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({
    id: String(s?.id || stepId()),
    label: String(s?.label ?? '').trim(),
    day_offset: Number(s?.day_offset),
    time: s?.time ? String(s.time) : null,
    template_key: String(s?.template_key ?? ''),
    enabled: s?.enabled !== false,
  }));
}

@Injectable()
export class ProtocolsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly templates: TemplatesService,
  ) {}

  col(scope: Scope) {
    const db = this.firebase.db;
    return scope === 'library'
      ? db.collection(COL.libraryProtocols)
      : db.collection(COL.organizations).doc(scope.orgId).collection(COL.protocols);
  }

  toProtocol(id: string, d: FirebaseFirestore.DocumentData): Protocol {
    return {
      id,
      name: d.name,
      procedure: d.procedure ?? null,
      description: d.description ?? '',
      steps: d.steps ?? [],
      active: d.active !== false,
      source_library_id: d.source_library_id ?? null,
      created_at: isoOrNull(d.created_at),
      updated_at: isoOrNull(d.updated_at),
    };
  }

  async list(scope: Scope): Promise<Protocol[]> {
    const snap = await this.col(scope).orderBy('name').get();
    return snap.docs.map((d) => this.toProtocol(d.id, d.data()));
  }

  async get(scope: Scope, id: string): Promise<Protocol> {
    const doc = await this.col(scope).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Protocolo no encontrado');
    return this.toProtocol(doc.id, doc.data()!);
  }

  private async validated(scope: Scope, input: Partial<ProtocolInput>) {
    const data = {
      name: String(input.name ?? '').trim(),
      procedure: input.procedure?.trim() || null,
      description: String(input.description ?? '').trim(),
      steps: cleanSteps(input.steps),
      active: input.active !== false,
    };
    const errors = validateProtocol(data, await this.templates.keys(scope));
    if (errors.length) throw new BadRequestException(errors.join(' '));
    return data;
  }

  async create(scope: Scope, input: ProtocolInput, extra: Record<string, unknown> = {}): Promise<Protocol> {
    const data = await this.validated(scope, input);
    const ref = this.col(scope).doc();
    await ref.set({
      ...data,
      ...extra,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    return this.get(scope, ref.id);
  }

  /** Editar no cambia lo ya programado: cada inscripción guarda su parrilla. */
  async update(scope: Scope, id: string, input: ProtocolInput): Promise<Protocol> {
    const current = await this.get(scope, id);
    const data = await this.validated(scope, { ...current, ...input });
    await this.col(scope).doc(id).update({ ...data, updated_at: FieldValue.serverTimestamp() });
    return this.get(scope, id);
  }

  async remove(scope: Scope, id: string) {
    await this.get(scope, id);
    if (scope !== 'library') {
      const active = await this.firebase.db
        .collection(COL.organizations)
        .doc(scope.orgId)
        .collection(COL.enrollments)
        .where('protocol_id', '==', id)
        .where('status', '==', 'active')
        .limit(1)
        .get();
      if (!active.empty) {
        throw new ConflictException('Tiene pacientes inscritos: desactívalo en vez de borrarlo');
      }
    }
    await this.col(scope).doc(id).delete();
  }

  /** Nombres de los protocolos que usan una plantilla. */
  async usingTemplate(scope: Scope, key: string): Promise<string[]> {
    const all = await this.list(scope);
    return all.filter((p) => p.steps.some((s) => s.template_key === key)).map((p) => p.name);
  }

  /**
   * Copia un protocolo de la biblioteca a una organización, con las
   * plantillas que le falten (en borrador: cada clínica las valida y las
   * envía a Meta con su cuenta).
   */
  async copyFromLibrary(libraryId: string, orgId: string): Promise<Protocol> {
    const source = await this.get('library', libraryId);
    const scope = { orgId };
    const existing = await this.templates.keys(scope);
    const copied: string[] = [];
    for (const key of new Set(source.steps.map((s) => s.template_key))) {
      if (existing.has(key)) continue;
      const t = await this.templates.byKey('library', key);
      if (!t) continue;
      await this.templates.create(
        scope,
        {
          key: t.key,
          label: t.label,
          category: t.category,
          language: t.language,
          header: t.header,
          body: t.body,
          footer: t.footer,
          buttons: t.buttons,
        },
        { source_library_id: t.id },
      );
      copied.push(key);
    }
    const names = new Set((await this.list(scope)).map((p) => p.name));
    let name = source.name;
    for (let i = 2; names.has(name); i++) name = `${source.name} (${i})`;
    return this.create(
      scope,
      {
        name,
        procedure: source.procedure,
        description: source.description,
        steps: source.steps.map((s) => ({ ...s, id: stepId() })),
        active: true,
      },
      { source_library_id: source.id, copied_templates: copied },
    );
  }
}

import { Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { localDate, PLANS, type MonthlyUsage, type Organization } from '@genon/shared';
import { FirebaseService } from '../firebase/firebase.service';
import { COL } from '../common/firestore';

/**
 * Pacientes nuevos por mes (base del cobro: cada plan incluye 50). Un
 * paciente cuenta una vez por mes aunque se inscriba a varios protocolos.
 */
@Injectable()
export class UsageService {
  constructor(private readonly firebase: FirebaseService) {}

  private ref(orgId: string, month: string) {
    return this.firebase.db
      .collection(COL.organizations)
      .doc(orgId)
      .collection(COL.usageMonthly)
      .doc(month);
  }

  monthOf(date: Date, timeZone: string) {
    return localDate(date, timeZone).slice(0, 7);
  }

  async countPatient(orgId: string, patientId: string, month: string) {
    const ref = this.ref(orgId, month);
    await this.firebase.db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data();
      if (data?.patients?.[patientId]) return;
      tx.set(
        ref,
        { month, new_patients: FieldValue.increment(1), patients: { [patientId]: true } },
        { merge: true },
      );
    });
  }

  async get(org: Organization, month: string): Promise<MonthlyUsage> {
    const data = (await this.ref(org.id, month).get()).data();
    const used = data?.new_patients ?? 0;
    const included = PLANS[org.plan]?.included_new_patients ?? 0;
    return { month, new_patients: used, included, extra: Math.max(0, used - included) };
  }
}

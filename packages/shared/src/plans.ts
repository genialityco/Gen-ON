/** Funcionalidades que habilita cada plan. */
export interface PlanFeatures {
  scheduled_sends: boolean;
  confirmation_buttons: boolean;
  manual_enrollment: boolean;
  auto_replies: boolean;
  alerts: boolean;
  global_dashboard: boolean;
  one_to_one: boolean;
  monthly_report: boolean;
  ai_assistant: boolean;
  human_handoff: boolean;
}

export interface Plan {
  label: string;
  /** Valores en COP, antes de IVA */
  monthly_fee: number;
  included_new_patients: number;
  extra_patient_fee: number;
  recommended?: boolean;
  features: PlanFeatures;
}

const ESENCIAL: PlanFeatures = {
  scheduled_sends: true,
  confirmation_buttons: true,
  manual_enrollment: true,
  auto_replies: false,
  alerts: false,
  global_dashboard: false,
  one_to_one: false,
  monthly_report: false,
  ai_assistant: false,
  human_handoff: false,
};

const ADHERENCIA: PlanFeatures = {
  ...ESENCIAL,
  auto_replies: true,
  alerts: true,
  global_dashboard: true,
  one_to_one: true,
  monthly_report: true,
};

export const PLANS = {
  esencial: {
    label: 'Esencial',
    monthly_fee: 350_000,
    included_new_patients: 50,
    extra_patient_fee: 7_000,
    features: ESENCIAL,
  },
  adherencia: {
    label: 'Adherencia',
    monthly_fee: 750_000,
    included_new_patients: 50,
    extra_patient_fee: 15_000,
    recommended: true,
    features: ADHERENCIA,
  },
  oraculo: {
    label: 'IA Oráculo',
    monthly_fee: 1_400_000,
    included_new_patients: 50,
    extra_patient_fee: 28_000,
    features: { ...ADHERENCIA, ai_assistant: true, human_handoff: true },
  },
} satisfies Record<string, Plan>;

export type PlanKey = keyof typeof PLANS;
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

/** Meses mínimos de contrato y setup (COP antes de IVA). */
export const MIN_CONTRACT_MONTHS = 3;
export const SETUP_FEE = 1_200_000;
export const SETUP_FREE_CONTRACT_MONTHS = 12;
export const DESIGN_FEE = 2_400_000;

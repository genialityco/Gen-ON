import type { ComponentType } from 'react';
import type { MetaSetupStepKey } from '@genon/shared';
import type { StepProps } from '../ui';
import { AppStep, BusinessStep, CompanyStep, SystemUserStep, VerificationStep } from './AccountSteps';
import { PhoneStep, RegistrationStep, TemplatesStep, TestStep, WebhookStep } from './NumberSteps';

export const STEP_COMPONENTS: Record<MetaSetupStepKey, ComponentType<StepProps>> = {
  company: CompanyStep,
  business: BusinessStep,
  verification: VerificationStep,
  app: AppStep,
  system_user: SystemUserStep,
  phone: PhoneStep,
  registration: RegistrationStep,
  webhook: WebhookStep,
  test: TestStep,
  templates: TemplatesStep,
};

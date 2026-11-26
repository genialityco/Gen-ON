import { hasFeature, planWith } from '@genon/shared';

describe('funcionalidades por plan', () => {
  it('Esencial no trae tablero, alertas, chat ni reporte', () => {
    for (const f of ['global_dashboard', 'alerts', 'one_to_one', 'monthly_report', 'auto_replies'] as const) {
      expect(hasFeature('esencial', f)).toBe(false);
      expect(hasFeature('adherencia', f)).toBe(true);
    }
    expect(hasFeature('esencial', 'scheduled_sends')).toBe(true);
  });

  it('nombra el plan más económico que la incluye', () => {
    expect(planWith('monthly_report')).toBe('Adherencia');
    expect(planWith('ai_assistant')).toBe('IA Oráculo');
  });
});

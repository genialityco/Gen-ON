import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  CreateAppointmentInput,
  CreateEnrollmentInput,
  CreatePatientInput,
  Enrollment,
  MonthlyUsage,
  OutboxItem,
  Patient,
  PatientInput,
  PatientListItem,
  ScheduleManualInput,
} from '@genon/shared';
import { api } from '../lib/api';

export interface EnrollResult {
  enrollment: Enrollment | null;
  scheduled: number;
  warnings: string[];
}

export interface CreatePatientResult extends EnrollResult {
  patient: Patient;
  enrollment_error?: string;
}

export interface PatientDetail {
  patient: Patient;
  enrollments: Enrollment[];
  appointments: Appointment[];
  outbox: OutboxItem[];
}

export interface AppointmentResult {
  appointment: Appointment;
  scheduled: number;
  warnings: string[];
}

export const patientKeys = {
  all: (orgId: string) => ['patients', orgId] as const,
  one: (orgId: string, id: string) => ['patients', orgId, id] as const,
  outbox: (orgId: string) => ['outbox', orgId] as const,
  usage: (orgId: string) => ['usage', orgId] as const,
  appointments: (orgId: string) => ['appointments', orgId] as const,
};

/** Cambios que afectan pacientes, parrilla y uso a la vez. */
function useInvalidateAll(orgId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: patientKeys.all(orgId) });
    qc.invalidateQueries({ queryKey: patientKeys.outbox(orgId) });
    qc.invalidateQueries({ queryKey: patientKeys.usage(orgId) });
    qc.invalidateQueries({ queryKey: patientKeys.appointments(orgId) });
  };
}

export function usePatients(orgId: string) {
  return useQuery({
    queryKey: patientKeys.all(orgId),
    queryFn: async () => (await api.get<PatientListItem[]>(`/organizations/${orgId}/patients`)).data,
  });
}

export function usePatientDetail(orgId: string, id: string | null) {
  return useQuery({
    queryKey: patientKeys.one(orgId, id ?? ''),
    queryFn: async () => (await api.get<PatientDetail>(`/organizations/${orgId}/patients/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreatePatient(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (input: CreatePatientInput) =>
      (await api.post<CreatePatientResult>(`/organizations/${orgId}/patients`, input)).data,
    onSuccess: invalidate,
  });
}

export function useUpdatePatient(orgId: string, id: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (input: PatientInput) => (await api.put<Patient>(`/organizations/${orgId}/patients/${id}`, input)).data,
    onSuccess: invalidate,
  });
}

export function useOptOut(orgId: string, id: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (reason: string) => api.post(`/organizations/${orgId}/patients/${id}/opt-out`, { reason }),
    onSuccess: invalidate,
  });
}

export function useEnroll(orgId: string, patientId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (input: CreateEnrollmentInput) =>
      (await api.post<EnrollResult>(`/organizations/${orgId}/patients/${patientId}/enrollments`, input)).data,
    onSuccess: invalidate,
  });
}

export function useCancelEnrollment(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (id: string) => api.post(`/organizations/${orgId}/enrollments/${id}/cancel`),
    onSuccess: invalidate,
  });
}

export function useOutbox(orgId: string, from: string, to: string) {
  return useQuery({
    queryKey: [...patientKeys.outbox(orgId), from, to],
    queryFn: async () => (await api.get<OutboxItem[]>(`/organizations/${orgId}/outbox`, { params: { from, to } })).data,
    refetchInterval: 30_000,
  });
}

export function useOutboxAction(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (a: { id: string; action: 'send-now' | 'cancel' } | { id: string; action: 'reschedule'; send_at: string }) =>
      a.action === 'reschedule'
        ? (await api.patch<OutboxItem>(`/organizations/${orgId}/outbox/${a.id}`, { send_at: a.send_at })).data
        : (await api.post<OutboxItem>(`/organizations/${orgId}/outbox/${a.id}/${a.action}`)).data,
    onSuccess: invalidate,
  });
}

export function useManualSend(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (input: ScheduleManualInput) => (await api.post<OutboxItem>(`/organizations/${orgId}/outbox`, input)).data,
    onSuccess: invalidate,
  });
}

export function useUsage(orgId: string) {
  return useQuery({
    queryKey: patientKeys.usage(orgId),
    queryFn: async () => (await api.get<MonthlyUsage>(`/organizations/${orgId}/usage`)).data,
  });
}

/** Citas entre dos fechas (YYYY-MM-DD, ambas incluidas). */
export function useAppointments(orgId: string, from: string, to: string) {
  return useQuery({
    queryKey: [...patientKeys.appointments(orgId), from, to],
    queryFn: async () => (await api.get<Appointment[]>(`/organizations/${orgId}/appointments`, { params: { from, to } })).data,
  });
}

export function useSaveAppointment(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async (a: { id: string; input: AppointmentInput } | { id: null; input: CreateAppointmentInput }) =>
      a.id
        ? (await api.put<AppointmentResult>(`/organizations/${orgId}/appointments/${a.id}`, a.input)).data
        : (await api.post<AppointmentResult>(`/organizations/${orgId}/appointments`, a.input)).data,
    onSuccess: invalidate,
  });
}

export function useAppointmentStatus(orgId: string) {
  const invalidate = useInvalidateAll(orgId);
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) =>
      (await api.post<Appointment>(`/organizations/${orgId}/appointments/${id}/status`, { status })).data,
    onSuccess: invalidate,
  });
}

import axios, { AxiosError } from 'axios';
import { notifications } from '@mantine/notifications';
import { auth } from './firebase';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
});

api.interceptors.request.use(async (config) => {
  const token = await auth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Mensaje legible de un error de la API (class-validator devuelve una lista). */
export function errorMessage(error: unknown): string {
  const e = error as AxiosError<{ message?: string | string[] }>;
  const msg = e.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(' · ');
  return msg || e.message || 'Error inesperado';
}

export function notifyError(error: unknown) {
  notifications.show({ color: 'red', title: 'No se pudo completar', message: errorMessage(error) });
}

export function notifySuccess(message: string) {
  notifications.show({ color: 'teal', message });
}

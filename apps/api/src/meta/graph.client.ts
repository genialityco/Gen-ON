import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: number,
    readonly subcode?: number,
    readonly fbtraceId?: string,
  ) {
    super(message);
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    error_user_title?: string;
    error_user_msg?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Cliente de la Graph API de Meta. Cada llamada lleva su token: el del
 * usuario del sistema de la organización o el de la app (`appId|appSecret`).
 */
@Injectable()
export class MetaGraphClient {
  readonly version = process.env.META_GRAPH_VERSION || 'v22.0';
  private readonly http: AxiosInstance = axios.create({
    baseURL: `https://graph.facebook.com/${this.version}`,
    timeout: 20_000,
  });

  static appToken(appId: string, appSecret: string) {
    return `${appId}|${appSecret}`;
  }

  async get<T = any>(path: string, token: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.call<T>(() => this.http.get(path, { params: { ...params, access_token: token } }));
  }

  async post<T = any>(
    path: string,
    token: string,
    body?: Record<string, unknown>,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    return this.call<T>(() =>
      this.http.post(path, body ?? null, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  }

  private async call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
    try {
      return (await fn()).data;
    } catch (e) {
      const err = e as AxiosError<GraphErrorBody>;
      const g = err.response?.data?.error;
      const message =
        g?.error_user_msg || g?.message || err.message || 'Error desconocido en la API de Meta';
      throw new MetaApiError(
        message,
        err.response?.status ?? 502,
        g?.code,
        g?.error_subcode,
        g?.fbtrace_id,
      );
    }
  }
}

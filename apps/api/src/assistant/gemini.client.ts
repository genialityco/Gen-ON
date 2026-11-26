import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Cliente mínimo de la API de Gemini (generateContent). La clave va en
 * GEMINI_API_KEY y el modelo en GEMINI_MODEL.
 */
@Injectable()
export class GeminiClient {
  readonly model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  private readonly http: AxiosInstance = axios.create({
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    timeout: 25_000,
  });

  get configured() {
    return !!process.env.GEMINI_API_KEY;
  }

  /** Respuesta en JSON según `schema`; lanza si la API falla o no devuelve texto. */
  async json<T>(system: string, turns: GeminiTurn[], schema: Record<string, unknown>): Promise<T> {
    if (!this.configured) throw new ServiceUnavailableException('Falta GEMINI_API_KEY en la API');
    const res = await this.http
      .post(
      `/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      },
      { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY! } },
      )
      .catch((e: AxiosError<any>) => {
        // El mensaje de Google dice qué falló (modelo inexistente, clave inválida, esquema)
        const detail = e.response?.data?.error?.message ?? e.message;
        throw new ServiceUnavailableException(`Gemini (${this.model}): ${detail}`);
      });
    const text = res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error(`Gemini no devolvió texto (${res.data?.candidates?.[0]?.finishReason ?? res.data?.promptFeedback?.blockReason ?? 'sin motivo'})`);
    return JSON.parse(text) as T;
  }
}

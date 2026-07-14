import client from './client';
import type { GenerateModelParams, GenerateModelResponse } from '../types/furniture';

/** Server progress state for the progress bar. */
export interface ServerProgress {
  phase: string;
  message: string;
  current: number;
  total: number;
  config: number;
  config_total: number;
  part: string;
}

/** Fetch server warmup/generation progress. */
export async function fetchProgress(): Promise<ServerProgress> {
  const { data } = await client.get<ServerProgress>('/api/progress');
  return data;
}

/** Fetch the pre-generated default model (instant — from server cache). */
export async function fetchDefaultModel(): Promise<GenerateModelResponse> {
  const { data } = await client.get<GenerateModelResponse>(
    '/api/models/default',
  );
  return data;
}

/**
 * Request 3D model generation (cached on server side).
 * First call may take time; subsequent calls with same params are instant.
 */
export async function generateModel(
  params: GenerateModelParams,
): Promise<GenerateModelResponse> {
  const { data } = await client.post<GenerateModelResponse>(
    '/api/models/generate',
    params,
  );
  return data;
}

/**
 * Get the full URL for a backend asset (STL, STEP, etc.).
 */
export function getModelAssetUrl(path: string): string {
  const base = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
  return `${base}${path}`;
}

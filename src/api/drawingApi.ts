import client from './client';
import type { DrawingListResponse } from '../types/furniture';

/**
 * Fetch available drawings (part, assembly, installation) for a model.
 */
export async function fetchDrawings(
  modelId: string,
): Promise<DrawingListResponse> {
  const { data } = await client.get<DrawingListResponse>(
    `/api/models/${modelId}/drawings`,
  );
  return data;
}

/**
 * Get the full URL for a drawing file.
 */
export function getDrawingUrl(path: string): string {
  const base = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
  return `${base}${path}`;
}

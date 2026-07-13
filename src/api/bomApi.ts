import client from './client';
import type { BomResponse } from '../types/furniture';

/**
 * Fetch the Bill of Materials for a generated furniture model.
 */
export async function fetchBom(modelId: string): Promise<BomResponse> {
  const { data } = await client.get<BomResponse>(`/api/models/${modelId}/bom`);
  return data;
}

import client from './client';
import type { FurnitureTemplate } from '../types/furniture';

/**
 * Fetch all available furniture templates from the backend.
 * Falls back to mock data when the backend is unreachable.
 */
export async function fetchTemplates(): Promise<FurnitureTemplate[]> {
  const { data } = await client.get<FurnitureTemplate[]>('/api/templates');
  return data;
}

/**
 * Fetch a single furniture template by ID.
 */
export async function fetchTemplateById(
  id: string,
): Promise<FurnitureTemplate> {
  const { data } = await client.get<FurnitureTemplate>(`/api/templates/${id}`);
  return data;
}

/**
 * List available furniture types (e.g. "desk", "shelf").
 */
export async function fetchFurnitureTypes(): Promise<string[]> {
  const { data } = await client.get<string[]>('/api/templates/types');
  return data;
}

import type { SearchHit } from './serper';

export function parseTavily(body: unknown): SearchHit[] {
  if (typeof body !== 'object' || body === null) return [];

  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  return results
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: typeof item.url === 'string' ? item.url : '',
      snippet:
        typeof item.content === 'string' ? item.content.slice(0, 600) : '',
    }))
    .filter((hit) => hit.url !== '');
}

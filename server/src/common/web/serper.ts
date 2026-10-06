export type SearchHit = { title: string; url: string; snippet: string };

export function parseSerper(body: unknown): SearchHit[] {
  if (typeof body !== 'object' || body === null) return [];

  const organic = (body as { organic?: unknown }).organic;
  if (!Array.isArray(organic)) return [];

  return organic
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      url: typeof item.link === 'string' ? item.link : '',
      snippet:
        typeof item.snippet === 'string' ? item.snippet.slice(0, 600) : '',
    }))
    .filter((hit) => hit.url !== '');
}

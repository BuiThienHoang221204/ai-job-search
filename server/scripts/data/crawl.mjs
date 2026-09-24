import fs from 'node:fs';

const BASE = 'https://x-interview.com/mypage/questions/ajax-search';
const OUT = process.argv[2];
const DELAY = 900;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    if (attempt >= 3) return null;
    await sleep(2000 * (attempt + 1));
    return get(url, attempt + 1);
  }
}

const CARD = /data-action-type="practice" data-question-id="(\d+)"\s*>([\s\S]*?)<\/a>/g;
const BADGE = /tracking-wide border[^>]*>\s*([^<]+?)\s*</g;
const PRACTICE = />(\d+) lần luyện tập</g;

function parse(html) {
  const texts = [...html.matchAll(CARD)];
  const badges = [...html.matchAll(BADGE)].map((m) => m[1]);
  const counts = [...html.matchAll(PRACTICE)].map((m) => Number(m[1]));
  return texts.map((m, i) => ({
    sourceId: Number(m[1]),
    text: m[2]
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    difficulty: badges[i] ?? null,
    practiceCount: counts[i] ?? 0,
  }));
}

const first = await get(`${BASE}?page=1`);
const total = first?.total ?? 0;
const lastPage = Math.ceil(total / 15);
console.log(`total=${total} pages=${lastPage}`);

const seen = new Map();
const stream = fs.createWriteStream(OUT, { flags: 'w' });

for (let page = 1; page <= lastPage; page++) {
  const data = page === 1 ? first : await get(`${BASE}?page=${page}`);
  if (!data?.html) {
    console.log(`page ${page}: HONG`);
    await sleep(DELAY);
    continue;
  }
  for (const row of parse(data.html)) {
    if (seen.has(row.sourceId)) continue;
    seen.set(row.sourceId, true);
    stream.write(JSON.stringify(row) + '\n');
  }
  if (page % 25 === 0 || page === lastPage) {
    console.log(`page ${page}/${lastPage} — đã lấy ${seen.size} câu`);
  }
  if (page < lastPage) await sleep(DELAY);
}

stream.end();
console.log(`XONG: ${seen.size} câu duy nhất -> ${OUT}`);

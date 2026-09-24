import fs from 'node:fs';

const BASE = 'https://x-interview.com/mypage/questions/ajax-search';
const TREE = process.argv[2];
const OUT = process.argv[3];
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
  } catch {
    if (attempt >= 3) return null;
    await sleep(2000 * (attempt + 1));
    return get(url, attempt + 1);
  }
}

const CARD = /data-action-type="practice" data-question-id="(\d+)"/g;

const tree = JSON.parse(fs.readFileSync(TREE, 'utf8'));
const roles = tree.map((node) => ({ id: node.id, label: node.label }));

const tagged = new Map();

for (const role of roles) {
  const first = await get(`${BASE}?page=1&job_role=${role.id}`);
  const total = first?.total ?? 0;
  if (!total) {
    console.log(`${role.label}: 0`);
    await sleep(DELAY);
    continue;
  }
  const pages = Math.ceil(total / 15);
  for (let page = 1; page <= pages; page++) {
    const data = page === 1 ? first : await get(`${BASE}?page=${page}&job_role=${role.id}`);
    for (const m of (data?.html ?? '').matchAll(CARD)) {
      const id = Number(m[1]);
      if (!tagged.has(id)) tagged.set(id, role.label);
    }
    if (page < pages) await sleep(DELAY);
  }
  console.log(`${role.label}: ${total}`);
  await sleep(DELAY);
}

fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(tagged), null, 2));
console.log(`XONG: ${tagged.size} câu có nhãn ngành -> ${OUT}`);

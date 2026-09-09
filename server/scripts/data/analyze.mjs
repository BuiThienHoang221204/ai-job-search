import fs from 'node:fs';

const IN = process.argv[2];
const TAGS = process.argv[3];
const OUT = process.argv[4];

const rows = fs
  .readFileSync(IN, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};

const VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const tokens = (text) => new Set(normalize(text).split(' ').filter((w) => w.length > 3));

const exact = new Map();
for (const row of rows) {
  const key = normalize(row.text);
  if (!exact.has(key)) exact.set(key, []);
  exact.get(key).push(row);
}

const unique = [...exact.values()].map((group) => group[0]);

const buckets = new Map();
for (const row of unique) {
  const words = [...tokens(row.text)];
  for (const word of words.slice(0, 6)) {
    if (!buckets.has(word)) buckets.set(word, []);
    buckets.get(word).push(row);
  }
}

const dropped = new Set();
for (const group of buckets.values()) {
  for (let a = 0; a < group.length; a++) {
    if (dropped.has(group[a].sourceId)) continue;
    const A = tokens(group[a].text);
    if (!A.size) continue;
    for (let b = a + 1; b < group.length; b++) {
      if (dropped.has(group[b].sourceId)) continue;
      const B = tokens(group[b].text);
      if (!B.size) continue;
      let shared = 0;
      for (const word of A) if (B.has(word)) shared++;
      if (shared / (A.size + B.size - shared) >= 0.6) dropped.add(group[b].sourceId);
    }
  }
}

const clean = unique.filter((row) => !dropped.has(row.sourceId));
const withTag = clean.filter((row) => tags[row.sourceId]);
const vi = clean.filter((row) => VI.test(row.text));
const truncated = clean.filter((row) => /\.\.\.$/.test(row.text));
const practiced = clean.filter((row) => row.practiceCount > 0);

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '-');

console.log(`Cào về:                 ${rows.length}`);
console.log(`Sau khi bỏ trùng y hệt: ${unique.length}  (bỏ ${rows.length - unique.length})`);
console.log(`Sau khi bỏ gần trùng:   ${clean.length}  (bỏ thêm ${dropped.size})`);
console.log(`  còn lại so với ban đầu: ${pct(clean.length, rows.length)}`);
console.log('');
console.log(`Tiếng Việt:             ${vi.length}  (${pct(vi.length, clean.length)})`);
console.log(`Tiếng Anh:              ${clean.length - vi.length}  (${pct(clean.length - vi.length, clean.length)})`);
console.log(`Có nhãn ngành:          ${withTag.length}  (${pct(withTag.length, clean.length)})`);
console.log(`Bị cắt cụt (...):       ${truncated.length}`);
console.log(`Đã từng có người luyện: ${practiced.length}`);
console.log('');
console.log(`DÙNG ĐƯỢC NGAY (tiếng Việt, không cụt): ${vi.filter((r) => !/\.\.\.$/.test(r.text)).length}`);

const byDifficulty = new Map();
for (const row of clean) {
  const key = row.difficulty ?? 'không rõ';
  byDifficulty.set(key, (byDifficulty.get(key) ?? 0) + 1);
}
console.log('');
console.log('Theo độ khó:');
for (const [key, count] of [...byDifficulty].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key}: ${count}`);
}

fs.writeFileSync(
  OUT,
  clean
    .map((row) => JSON.stringify({ ...row, industry: tags[row.sourceId] ?? null, lang: VI.test(row.text) ? 'vi' : 'en' }))
    .join('\n'),
);
console.log('');
console.log(`Đã ghi ${clean.length} câu -> ${OUT}`);

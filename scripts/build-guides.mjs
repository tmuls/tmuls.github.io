import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const guidesDir = 'guides';
const outDir = 'assets/guides';

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }
  const [, frontmatter, body] = match;
  const data = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return { data, body: body.replace(/^\r?\n+/, '') };
}

function toExcerpt(markdown, length = 200) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= length) return text;
  return text.slice(0, length).replace(/\s+\S*$/, '') + '…';
}

if (!existsSync(guidesDir)) {
  console.log('No guides directory found, skipping guide indexing.');
  process.exit(0);
}

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
} else {
  for (const existing of readdirSync(outDir)) {
    if (existing.endsWith('.md')) {
      unlinkSync(join(outDir, existing));
    }
  }
}

const files = readdirSync(guidesDir).filter((f) => f.endsWith('.md'));
const index = [];

for (const file of files) {
  const raw = readFileSync(join(guidesDir, file), 'utf8');
  const { data, body } = parseFrontmatter(raw);

  if (!data.id || !data.title) {
    console.warn(`Skipping ${file}: missing "id" or "title" in frontmatter.`);
    continue;
  }

  index.push({
    id: data.id,
    title: data.title,
    project: data.project || null,
    excerpt: toExcerpt(body),
  });

  writeFileSync(join(outDir, `${data.id}.md`), body, 'utf8');
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`Indexed ${index.length} guide(s) into ${outDir}/index.json`);

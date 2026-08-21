import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

const guidesDir = 'src/pages/guide/content';
const outDir = 'www/assets/guides';

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

function resolveSidebar(file, data) {
  // Optional sidebar sidecar: auto-detected as "<same-basename>.json" next to
  // the guide's .md file, or overridden explicitly via a "sidebar:" frontmatter
  // field naming a different .json file in the same content directory. Either
  // way, no reference is required inside the markdown for the default case.
  const sidecarName = data.sidebar || `${basename(file, '.md')}.json`;
  const sidecarPath = join(guidesDir, sidecarName);

  if (!existsSync(sidecarPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      console.warn(`Skipping sidebar for ${file}: ${sidecarName} must be a JSON array.`);
      return [];
    }
    return parsed;
  } catch (e) {
    console.warn(`Skipping sidebar for ${file}: failed to parse ${sidecarName} (${e.message}).`);
    return [];
  }
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

  const priority = data.priority !== undefined && data.priority !== '' ? Number(data.priority) : null;

  index.push({
    id: data.id,
    title: data.title,
    project: data.project || null,
    priority: Number.isFinite(priority) ? priority : null,
    excerpt: toExcerpt(body),
    sidebar: resolveSidebar(file, data),
  });

  writeFileSync(join(outDir, `${data.id}.md`), body, 'utf8');
}

// Lower priority number shows first. Guides without a priority sort after
// all prioritized guides, keeping their relative file order among themselves.
index.sort((a, b) => {
  if (a.priority === null && b.priority === null) return 0;
  if (a.priority === null) return 1;
  if (b.priority === null) return -1;
  return a.priority - b.priority;
});

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
console.log(`Indexed ${index.length} guide(s) into ${outDir}/index.json`);

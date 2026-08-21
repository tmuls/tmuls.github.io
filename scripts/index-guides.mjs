import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const contentDir = 'src/pages/guide/content';
const outDir = 'www/assets/guides';

function isLeaf(dir, name) {
  return existsSync(join(dir, `${name}_guide.md`));
}

function toExcerpt(markdown, wordLimit = 50) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(' ');
  if (words.length <= wordLimit) return text;
  return words.slice(0, wordLimit).join(' ') + '…';
}

function humanizeId(id) {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Recurses through a folder's children, writing an index.json for every
// branch (a folder of folders) and backfilling a generated blurb for any
// leaf (a folder holding "<name>_guide.md") that doesn't have its own.
// A leaf and its subfolders are mutually exclusive — a folder is one or
// the other, never both.
function walk(srcDir, outSubDir, name) {
  const entries = readdirSync(srcDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const leaf = isLeaf(srcDir, name);

  if (leaf && entries.length > 0) {
    throw new Error(
      `Guide folder "${srcDir}" has both "${name}_guide.md" and subfolders (${entries.map((e) => e.name).join(', ')}). A guide folder can't have children.`,
    );
  }

  mkdirSync(outSubDir, { recursive: true });

  if (leaf) {
    const blurbSrc = join(srcDir, `${name}_blurb.md`);
    if (!existsSync(blurbSrc)) {
      const guideRaw = readFileSync(join(srcDir, `${name}_guide.md`), 'utf8');
      const generated = `---\ntitle: ${humanizeId(name)}\n---\n${toExcerpt(guideRaw)}\n`;
      writeFileSync(join(outSubDir, `${name}_blurb.md`), generated, 'utf8');
      console.log(`Generated blurb for ${srcDir} (no ${name}_blurb.md found)`);
    }
    return;
  }

  const children = entries.map((e) => ({
    id: e.name,
    type: isLeaf(join(srcDir, e.name), e.name) ? 'guide' : 'folder',
  }));
  writeFileSync(join(outSubDir, 'index.json'), JSON.stringify(children, null, 2), 'utf8');

  for (const e of entries) {
    walk(join(srcDir, e.name), join(outSubDir, e.name), e.name);
  }
}

if (!existsSync(contentDir)) {
  console.log('No guide content directory found, skipping guide indexing.');
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const rootEntries = readdirSync(contentDir, { withFileTypes: true }).filter((e) => e.isDirectory());
const rootChildren = rootEntries.map((e) => ({
  id: e.name,
  type: isLeaf(join(contentDir, e.name), e.name) ? 'guide' : 'folder',
}));
writeFileSync(join(outDir, 'index.json'), JSON.stringify(rootChildren, null, 2), 'utf8');

for (const e of rootEntries) {
  walk(join(contentDir, e.name), join(outDir, e.name), e.name);
}

console.log(`Indexed guide tree (${rootChildren.length} top-level folder(s)).`);

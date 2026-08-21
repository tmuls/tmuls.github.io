export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }
  const [, frontmatter, body] = match;
  const data: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return { data, body: body.replace(/^\r?\n+/, '') };
}

export function humanizeId(id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// A guide folder's title comes from its own "<name>_blurb.md" frontmatter,
// whether that folder is a leaf (a guide) or a branch (a folder shown as a
// list) - falling back to a humanized version of the id if there's no blurb.
export async function loadGuideTitle(guideId: string): Promise<string> {
  const lastSegment = guideId.split('/').pop() as string;
  try {
    const res = await fetch(`/assets/guides/${guideId}/${lastSegment}_blurb.md`, { cache: 'no-cache' });
    if (res.ok) {
      const { data } = parseFrontmatter(await res.text());
      if (data.title) return data.title;
    }
  } catch (e) {
    // fall through to the humanized id
  }
  return humanizeId(lastSegment);
}

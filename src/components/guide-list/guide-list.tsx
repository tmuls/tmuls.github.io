import { Component, Prop, State, h } from '@stencil/core';
import { parseFrontmatter, humanizeId } from '../../utils/guide-content';

interface ChildEntry {
  id: string;
  type: 'guide' | 'folder';
}

interface RenderedChild {
  id: string;
  type: 'guide' | 'folder';
  title: string;
  excerpt: string;
  href: string;
}

async function loadChild(parentId: string, entry: ChildEntry): Promise<RenderedChild> {
  const path = `${parentId}/${entry.id}`;
  let title = humanizeId(entry.id);
  let excerpt = '';

  try {
    const res = await fetch(`/assets/guides/${path}/${entry.id}_blurb.md`, { cache: 'no-cache' });
    if (res.ok) {
      const { data, body } = parseFrontmatter(await res.text());
      title = data.title || title;
      excerpt = body.trim();
    }
  } catch (e) {
    // No blurb available (expected for a folder that hasn't been given one) — use the fallback title.
  }

  return { id: entry.id, type: entry.type, title, excerpt, href: `/guide/?id=${path}` };
}

@Component({
  tag: 'guide-list',
  styleUrl: 'guide-list.css',
})
export class GuideList {
  @Prop() guideId!: string;
  @State() children: RenderedChild[] = [];
  @State() loaded = false;

  async componentWillLoad() {
    try {
      const res = await fetch(`/assets/guides/${this.guideId}/index.json`, { cache: 'no-cache' });
      const entries: ChildEntry[] = res.ok ? await res.json() : [];
      // Only the index and each child's small blurb file are fetched here —
      // never a child's full guide.md — so listing a folder stays cheap
      // regardless of how much content its guides hold.
      this.children = await Promise.all(entries.map((entry) => loadChild(this.guideId, entry)));
    } catch (e) {
      this.children = [];
    } finally {
      this.loaded = true;
    }
  }

  render() {
    if (!this.loaded) {
      return null;
    }

    if (this.children.length === 0) {
      return <p class="has-text-grey-light">Coming soon.</p>;
    }

    return (
      <div class="guide-list">
        {this.children.map((child) => (
          <div class="guide-entry">
            <h3 class="title is-5 has-text-light">{child.title}</h3>
            {child.excerpt && <p class="has-text-grey-light guide-excerpt">{child.excerpt}</p>}
            <a class="guide-read-more" href={child.href}>
              {child.type === 'folder' ? 'Browse' : 'Read more'} &rarr;
            </a>
          </div>
        ))}
      </div>
    );
  }
}

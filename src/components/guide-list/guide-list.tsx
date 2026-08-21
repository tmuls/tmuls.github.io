import { Component, Prop, State, h } from '@stencil/core';

interface GuideIndexEntry {
  id: string;
  title: string;
  project?: string;
  excerpt: string;
}

@Component({
  tag: 'guide-list',
  styleUrl: 'guide-list.css',
})
export class GuideList {
  @Prop() project?: string;
  @State() guides: GuideIndexEntry[] = [];
  @State() loaded = false;

  async componentWillLoad() {
    try {
      const res = await fetch('/assets/guides/index.json', { cache: 'no-cache' });
      const all: GuideIndexEntry[] = res.ok ? await res.json() : [];
      this.guides = this.project ? all.filter((g) => g.project === this.project) : all;
    } catch (e) {
      this.guides = [];
    } finally {
      this.loaded = true;
    }
  }

  render() {
    if (!this.loaded) {
      return null;
    }

    if (this.guides.length === 0) {
      return <p class="has-text-grey-light">Coming soon.</p>;
    }

    return (
      <div class="guide-list">
        {this.guides.map((guide) => (
          <div class="guide-entry">
            <h3 class="title is-5 has-text-light">{guide.title}</h3>
            <p class="has-text-grey-light guide-excerpt">{guide.excerpt}</p>
            <a class="guide-read-more" href={`/guide/?id=${guide.id}`}>
              Read more &rarr;
            </a>
          </div>
        ))}
      </div>
    );
  }
}

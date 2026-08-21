import { Component, State, h } from '@stencil/core';
import { loadGuideTitle } from '../../utils/guide-content';

const PROJECT_HOME: Record<string, string> = {
  uo: '/uo/',
};

function backUrlFor(id: string): string {
  const segments = id.split('/');
  segments.pop();
  const parentId = segments.join('/');
  if (PROJECT_HOME[parentId]) {
    return PROJECT_HOME[parentId];
  }
  return parentId ? `/guide/?id=${parentId}` : '/';
}

// Resolves the "id" query param to a guide (leaf, has "<name>_guide.md") or
// a folder (branch, has an "index.json" listing its children) and mounts
// the matching single-purpose component - guide-view only ever renders an
// actual guide, guide-list only ever renders a listing, and neither of them
// has to know how it got there.
@Component({
  tag: 'guide-page',
})
export class GuidePage {
  @State() id = '';
  @State() mode: 'branch' | 'leaf' = 'leaf';
  @State() title = '';
  @State() backUrl = '/';
  @State() status: 'loading' | 'ready' | 'error' = 'loading';

  async componentWillLoad() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      this.status = 'error';
      return;
    }

    this.id = id;
    this.backUrl = backUrlFor(id);

    try {
      // A folder (branch) has an index.json listing its children; a guide
      // (leaf) doesn't. Probing for it is how this decides what to mount.
      // If it 404s, this id is assumed to be a leaf rather than fetched a
      // second time just to check - guide-view does that fetch itself to
      // render, and reports its own "not found" state if the id was bogus.
      const indexRes = await fetch(`/assets/guides/${id}/index.json`, { cache: 'no-cache' });

      if (indexRes.ok) {
        this.mode = 'branch';
        this.title = await loadGuideTitle(id);
        if (typeof document !== 'undefined') {
          document.title = this.title;
        }
      } else {
        this.mode = 'leaf';
      }
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
    }
  }

  render() {
    return (
      <app-layout>
        <section class="section">
          <div class="container">
            <p class="mb-4">
              <a href={this.backUrl} class="has-text-grey-light">
                &larr; Back
              </a>
            </p>

            {this.status === 'loading' && <p class="has-text-grey-light">Loading&hellip;</p>}
            {this.status === 'error' && <p class="has-text-grey-light">Guide not found.</p>}

            {this.status === 'ready' && this.mode === 'branch' && (
              <div>
                <h1 class="title is-2 has-text-light">{this.title}</h1>
                <guide-list guideId={this.id}></guide-list>
              </div>
            )}

            {this.status === 'ready' && this.mode === 'leaf' && <guide-view guideId={this.id}></guide-view>}
          </div>
        </section>
      </app-layout>
    );
  }
}

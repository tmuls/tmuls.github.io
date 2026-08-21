import { Component, State, Fragment, h } from '@stencil/core';
import { marked } from 'marked';
import { parseFrontmatter, humanizeId } from '../../utils/guide-content';

interface SidebarEntry {
  component: string;
  props?: Record<string, any>;
}

const PROJECT_HOME: Record<string, string> = {
  uo: '/uo/',
};

function renderSidebarEntry(entry: SidebarEntry) {
  const props = entry.props || {};
  switch (entry.component) {
    case 'skill-points':
      return <skill-points-card cardTitle={props.title} skills={props.skills}></skill-points-card>;
    default:
      return null;
  }
}

function sidebarEntryLabel(entry: SidebarEntry): string {
  const props = entry.props || {};
  return props.title || humanizeId(entry.component);
}

function backUrlFor(id: string): string {
  const segments = id.split('/');
  segments.pop();
  const parentId = segments.join('/');
  if (PROJECT_HOME[parentId]) {
    return PROJECT_HOME[parentId];
  }
  return parentId ? `/guide/?id=${parentId}` : '/';
}

const YOUTUBE_RE = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/g;

function extractYoutubeIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  YOUTUBE_RE.lastIndex = 0;
  while ((match = YOUTUBE_RE.exec(text))) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      ids.push(match[1]);
    }
  }
  return ids;
}

function markExternalLinks(html: string): string {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  wrapper.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  return wrapper.innerHTML;
}

async function loadTitle(id: string, lastSegment: string): Promise<string> {
  try {
    const res = await fetch(`/assets/guides/${id}/${lastSegment}_blurb.md`, { cache: 'no-cache' });
    if (res.ok) {
      const { data } = parseFrontmatter(await res.text());
      if (data.title) return data.title;
    }
  } catch (e) {
    // fall through to the humanized id
  }
  return humanizeId(lastSegment);
}

@Component({
  tag: 'guide-view',
  styleUrl: 'guide-view.css',
})
export class GuideView {
  @State() id = '';
  @State() mode: 'branch' | 'leaf' = 'leaf';
  @State() title = '';
  @State() html = '';
  @State() videoIds: string[] = [];
  @State() backUrl = '/';
  @State() sidebar: SidebarEntry[] = [];
  @State() expandedSidebar: boolean[] = [];
  @State() status: 'loading' | 'ready' | 'error' = 'loading';

  private toggleSidebarEntry(index: number) {
    this.expandedSidebar = this.expandedSidebar.map((expanded, i) => (i === index ? !expanded : expanded));
  }

  async componentWillLoad() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      this.status = 'error';
      return;
    }

    this.id = id;
    this.backUrl = backUrlFor(id);
    const lastSegment = id.split('/').pop() as string;

    try {
      // A folder (branch) has an index.json listing its children; a guide
      // (leaf) doesn't. Probing for it is how this component decides what
      // the id actually refers to and what to render.
      const indexRes = await fetch(`/assets/guides/${id}/index.json`, { cache: 'no-cache' });

      if (indexRes.ok) {
        this.mode = 'branch';
        this.title = await loadTitle(id, lastSegment);
        this.status = 'ready';
      } else {
        const mdRes = await fetch(`/assets/guides/${id}/${lastSegment}_guide.md`, { cache: 'no-cache' });
        if (!mdRes.ok) {
          throw new Error('Guide not found');
        }

        this.mode = 'leaf';
        const raw = await mdRes.text();
        this.videoIds = extractYoutubeIds(raw);
        this.html = markExternalLinks(marked.parse(raw) as string);
        this.title = await loadTitle(id, lastSegment);

        try {
          const sidebarRes = await fetch(`/assets/guides/${id}/${lastSegment}_sidebar.json`, { cache: 'no-cache' });
          this.sidebar = sidebarRes.ok ? await sidebarRes.json() : [];
        } catch (e) {
          this.sidebar = [];
        }
        this.expandedSidebar = this.sidebar.map(() => false);

        this.status = 'ready';
      }

      if (typeof document !== 'undefined') {
        document.title = this.title;
      }
    } catch (e) {
      this.status = 'error';
    }
  }

  private renderArticleBody() {
    return (
      <Fragment>
        <h1 class="title is-2 has-text-light">{this.title}</h1>
        <div class="content guide-content" innerHTML={this.html}></div>

        {this.videoIds.length > 0 && (
          <div class="guide-video-section">
            <h2 class="title is-4 has-text-light">{this.videoIds.length > 1 ? 'Demos' : 'YouTube Demo'}</h2>
            {this.videoIds.map((videoId) => (
              <div class="guide-video-embed">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                ></iframe>
              </div>
            ))}
          </div>
        )}
      </Fragment>
    );
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

            {this.status === 'ready' && this.mode === 'leaf' && this.sidebar.length === 0 && (
              <article>{this.renderArticleBody()}</article>
            )}

            {this.status === 'ready' && this.mode === 'leaf' && this.sidebar.length > 0 && (
              <div class="columns">
                {/* Sidebar comes first in markup: below desktop width, Bulma's
                    columns aren't flex at all, so they simply stack in DOM
                    order and this renders above the guide with no extra
                    CSS. At desktop width "order" pushes it back to the right. */}
                <div class="column sidebar-column guide-sidebar-column">
                  <h2 class="title is-2 sidebar-spacer" aria-hidden="true">
                    &nbsp;
                  </h2>
                  {this.sidebar.map((entry, i) => (
                    <div class={{ 'sidebar-guide-item': true, 'is-expanded': this.expandedSidebar[i] }}>
                      <button
                        type="button"
                        class="sidebar-guide-toggle"
                        aria-expanded={this.expandedSidebar[i] ? 'true' : 'false'}
                        onClick={() => this.toggleSidebarEntry(i)}
                      >
                        <span>{sidebarEntryLabel(entry)}</span>
                        <span class="sidebar-guide-chevron" aria-hidden="true">
                          &#9662;
                        </span>
                      </button>
                      <div class="sidebar-guide-body">{renderSidebarEntry(entry)}</div>
                    </div>
                  ))}
                </div>
                <div class="column is-two-thirds">
                  <article>{this.renderArticleBody()}</article>
                </div>
              </div>
            )}
          </div>
        </section>
      </app-layout>
    );
  }
}

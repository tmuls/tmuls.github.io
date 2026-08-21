import { Component, State, Fragment, h } from '@stencil/core';
import { marked } from 'marked';

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

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
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

@Component({
  tag: 'guide-view',
  styleUrl: 'guide-view.css',
})
export class GuideView {
  @State() title = '';
  @State() html = '';
  @State() videoIds: string[] = [];
  @State() backUrl = '/';
  @State() sidebar: SidebarEntry[] = [];
  @State() status: 'loading' | 'ready' | 'error' = 'loading';

  async componentWillLoad() {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      this.status = 'error';
      return;
    }

    try {
      const mdRes = await fetch(`/assets/guides/${id}/${id}_guide.md`, { cache: 'no-cache' });
      if (!mdRes.ok) {
        throw new Error('Guide not found');
      }

      const raw = await mdRes.text();
      const { data, body } = parseFrontmatter(raw);

      this.title = data.title || id;
      this.backUrl = data.project && PROJECT_HOME[data.project] ? PROJECT_HOME[data.project] : '/';
      this.videoIds = extractYoutubeIds(body);
      this.html = markExternalLinks(marked.parse(body) as string);

      try {
        const sidebarRes = await fetch(`/assets/guides/${id}/${id}_sidebar.json`, { cache: 'no-cache' });
        this.sidebar = sidebarRes.ok ? await sidebarRes.json() : [];
      } catch (e) {
        this.sidebar = [];
      }

      this.status = 'ready';

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

            {this.status === 'ready' && this.sidebar.length === 0 && (
              <article>{this.renderArticleBody()}</article>
            )}

            {this.status === 'ready' && this.sidebar.length > 0 && (
              <div class="columns">
                <div class="column is-two-thirds">
                  <article>{this.renderArticleBody()}</article>
                </div>
                <div class="column sidebar-column">
                  <h2 class="title is-2 sidebar-spacer" aria-hidden="true">
                    &nbsp;
                  </h2>
                  {this.sidebar.map((entry) => renderSidebarEntry(entry))}
                </div>
              </div>
            )}
          </div>
        </section>
      </app-layout>
    );
  }
}

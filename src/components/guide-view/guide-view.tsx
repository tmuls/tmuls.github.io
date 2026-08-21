import { Component, Prop, State, Fragment, h } from '@stencil/core';
import { marked } from 'marked';
import { loadGuideTitle, humanizeId } from '../../utils/guide-content';

interface SidebarEntry {
  component: string;
  props?: Record<string, any>;
}

function renderSidebarEntry(entry: SidebarEntry, guideId: string) {
  const props = entry.props || {};
  switch (entry.component) {
    case 'skill-points':
      return (
        <skill-points-card
          cardTitle={props.title}
          guideId={guideId}
          skills={props.skills}
          links={props.links}
          tabs={props.tabs}
        ></skill-points-card>
      );
    default:
      return null;
  }
}

function sidebarEntryLabel(entry: SidebarEntry): string {
  const props = entry.props || {};
  return props.title || humanizeId(entry.component);
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

// Remembers each sidebar entry's expanded/collapsed state per guide, so
// re-opening a guide keeps it the way it was left. Keyed by the guide's id
// plus the entry's position in its sidebar, since entries don't otherwise
// carry an id of their own.
function sidebarStorageKey(guideId: string, index: number): string {
  return `guide-sidebar-expanded:${guideId}:${index}`;
}

function loadExpandedSidebar(guideId: string, count: number): boolean[] {
  const expanded: boolean[] = [];
  for (let i = 0; i < count; i++) {
    try {
      expanded.push(localStorage.getItem(sidebarStorageKey(guideId, i)) === 'true');
    } catch (e) {
      expanded.push(false);
    }
  }
  return expanded;
}

// Renders one guide's content, given its id. Assumes that id is a leaf
// (a folder holding "<name>_guide.md") - deciding whether an id is a guide
// or a folder listing is guide-page's job, not this component's.
@Component({
  tag: 'guide-view',
  styleUrl: 'guide-view.css',
})
export class GuideView {
  @Prop() guideId!: string;
  @State() title = '';
  @State() html = '';
  @State() videoIds: string[] = [];
  @State() sidebar: SidebarEntry[] = [];
  @State() expandedSidebar: boolean[] = [];
  @State() playingVideos: string[] = [];
  @State() status: 'loading' | 'ready' | 'error' = 'loading';

  private toggleSidebarEntry(index: number) {
    const next = !this.expandedSidebar[index];
    this.expandedSidebar = this.expandedSidebar.map((expanded, i) => (i === index ? next : expanded));
    try {
      localStorage.setItem(sidebarStorageKey(this.guideId, index), String(next));
    } catch (e) {
      // localStorage unavailable (private browsing, etc.) - the toggle
      // still works, it just won't be remembered next visit.
    }
  }

  private playVideo(videoId: string) {
    this.playingVideos = [...this.playingVideos, videoId];
  }

  async componentWillLoad() {
    const lastSegment = this.guideId.split('/').pop() as string;

    try {
      const mdRes = await fetch(`/assets/guides/${this.guideId}/${lastSegment}_guide.md`, { cache: 'no-cache' });
      if (!mdRes.ok) {
        throw new Error('Guide not found');
      }

      const raw = await mdRes.text();
      this.videoIds = extractYoutubeIds(raw);
      this.html = markExternalLinks(marked.parse(raw) as string);
      this.title = await loadGuideTitle(this.guideId);

      try {
        const sidebarRes = await fetch(`/assets/guides/${this.guideId}/${lastSegment}_sidecar.json`, {
          cache: 'no-cache',
        });
        this.sidebar = sidebarRes.ok ? await sidebarRes.json() : [];
      } catch (e) {
        this.sidebar = [];
      }
      this.expandedSidebar = loadExpandedSidebar(this.guideId, this.sidebar.length);

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
            {this.videoIds.map((videoId) =>
              this.playingVideos.includes(videoId) ? (
                <div class="guide-video-embed">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  ></iframe>
                </div>
              ) : (
                <div class="guide-video-embed">
                  <button
                    type="button"
                    class="guide-video-facade"
                    aria-label="Play video"
                    onClick={() => this.playVideo(videoId)}
                  >
                    <span class="guide-video-play-icon" aria-hidden="true"></span>
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </Fragment>
    );
  }

  render() {
    if (this.status === 'loading') {
      return <p class="has-text-grey-light">Loading&hellip;</p>;
    }

    if (this.status === 'error') {
      return <p class="has-text-grey-light">Guide not found.</p>;
    }

    if (this.sidebar.length === 0) {
      return <article>{this.renderArticleBody()}</article>;
    }

    return (
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
              <div class="sidebar-guide-body">{renderSidebarEntry(entry, this.guideId)}</div>
            </div>
          ))}
        </div>
        <div class="column is-two-thirds">
          <article>{this.renderArticleBody()}</article>
        </div>
      </div>
    );
  }
}

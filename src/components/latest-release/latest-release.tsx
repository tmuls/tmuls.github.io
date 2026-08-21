import { Component, State, h } from '@stencil/core';

@Component({
  tag: 'latest-release',
  styleUrl: 'latest-release.css',
})
export class LatestRelease {
  @State() version = '';
  @State() url = '';
  @State() status: 'loading' | 'ready' | 'error' = 'loading';

  async componentWillLoad() {
    try {
      const res = await fetch('https://api.github.com/repos/tmuls/muls-dexxer-bot/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch release');
      }
      const data = await res.json();
      this.version = data.tag_name || data.name || 'Unknown';
      this.url = data.html_url;
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
    }
  }

  render() {
    return (
      <div class="sidebar-card">
        <p class="sidebar-card-label">Dexxer Bot Latest Release</p>

        {this.status === 'loading' && <p class="sidebar-card-status">Loading&hellip;</p>}
        {this.status === 'error' && <p class="sidebar-card-status">Unable to load release info.</p>}

        {this.status === 'ready' && (
          <div>
            <p class="sidebar-card-version">{this.version}</p>
            <a class="sidebar-card-link" href={this.url} target="_blank" rel="noopener noreferrer">
              Get it here &rarr;
            </a>
          </div>
        )}
      </div>
    );
  }
}

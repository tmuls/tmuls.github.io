import { Component, Host, h, State, Listen } from '@stencil/core';

interface NavLink {
  label: string;
  url: string;
  external?: boolean;
}

@Component({
  tag: 'app-nav',
  styleUrl: 'app-nav.css',
})
export class AppNav {
  @State() isOpen = false;

  private topLinks: NavLink[] = [{ label: 'Home', url: '/' }];

  private bottomLinks: NavLink[] = [{ label: 'YouTube', url: 'https://www.youtube.com/@e_muls', external: true }];

  private toggle = () => {
    this.isOpen = !this.isOpen;
  };

  private close = () => {
    this.isOpen = false;
  };

  @Listen('keydown', { target: 'document' })
  handleKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      this.close();
    }
  }

  private isActive(url: string): boolean {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    if (url === '/') return path === '/' || path === '/index.html';
    return path === url || path === url.replace(/\/$/, '');
  }

  private renderLink(link: NavLink) {
    return (
      <a
        class={{
          'drawer-link': true,
          'is-active': this.isActive(link.url),
        }}
        href={link.url}
        target={link.external ? '_blank' : undefined}
        rel={link.external ? 'noopener noreferrer' : undefined}
        onClick={this.close}
      >
        <span class="drawer-indicator"></span>
        {link.label}
      </a>
    );
  }

  render() {
    return (
      <Host>
        <nav class="navbar is-transparent site-navbar" role="navigation" aria-label="main navigation">
          <div class="navbar-brand">
            <a class="navbar-item site-title" href="/">
              <img class="site-avatar" src="/assets/avatar.svg" alt="" width="28" height="28" />
              Muls
            </a>
          </div>
          <button
            class={{ hamburger: true, 'is-active': this.isOpen }}
            aria-label="Open menu"
            aria-expanded={this.isOpen ? 'true' : 'false'}
            onClick={this.toggle}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </nav>

        <div class={{ 'nav-overlay': true, 'is-visible': this.isOpen }} onClick={this.close}></div>

        <aside class={{ 'side-drawer': true, 'is-open': this.isOpen }}>
          <div class="side-drawer-header">
            <span class="side-drawer-title">Menu</span>
            <button class="close-btn" aria-label="Close menu" onClick={this.close}>
              &times;
            </button>
          </div>
          <div class="side-drawer-body">
            {this.topLinks.map((link) => this.renderLink(link))}
            {this.bottomLinks.map((link) => this.renderLink(link))}
          </div>
        </aside>
      </Host>
    );
  }
}

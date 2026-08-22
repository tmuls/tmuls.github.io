import { Component, Host, h } from '@stencil/core';

@Component({
  tag: 'app-layout',
  styleUrl: 'app-layout.css',
})
export class AppLayout {
  render() {
    return (
      <Host>
        <app-nav></app-nav>
        <main>
          <slot></slot>
        </main>
      </Host>
    );
  }
}

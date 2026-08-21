import { Component, Host, h } from '@stencil/core';

@Component({
  tag: 'app-layout',
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

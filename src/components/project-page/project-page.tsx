import { Component, Prop, h } from '@stencil/core';

@Component({
  tag: 'project-page',
  styleUrl: 'project-page.css',
})
export class ProjectPage {
  @Prop() pageTitle = '';
  @Prop() tagline?: string;
  @Prop() heroImage?: string;

  render() {
    return (
      <app-layout>
        <div class="project-hero">
          {this.heroImage && (
            <div
              class="hero-image"
              style={{
                backgroundImage: `url(${this.heroImage})`,
              }}
            ></div>
          )}
          {this.heroImage && <div class="hero-fade"></div>}
          <div class="hero-content">
            <div class="container">
              <a href="/" class="has-text-grey-light back-link">
                &larr; Back to projects
              </a>
            </div>
            <div class="container">
              <h1 class="title is-2 has-text-light">{this.pageTitle}</h1>
              {this.tagline && <p class="subtitle is-5 has-text-grey-light">{this.tagline}</p>}
            </div>
          </div>
        </div>

        <section class="section">
          <div class="container">
            <slot></slot>
          </div>
        </section>
      </app-layout>
    );
  }
}

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
    const heroStyle = this.heroImage
      ? {
          backgroundImage: `linear-gradient(180deg, rgba(20,22,26,0.6) 0%, rgba(20,22,26,0.68) 40%, #17191d 100%), url(${this.heroImage})`,
        }
      : undefined;

    return (
      <app-layout>
        <div class="project-hero" style={heroStyle}>
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

        <section class="section">
          <div class="container">
            <slot></slot>
          </div>
        </section>
      </app-layout>
    );
  }
}

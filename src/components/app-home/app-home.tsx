import { Component, h } from '@stencil/core';

interface CardItem {
  name: string;
  description: string;
  url: string;
  image?: string;
  external?: boolean;
}

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
})
export class AppHome {
  private projects: CardItem[] = [
    {
      name: 'Ultima Online Outlands',
      description: 'Guides and scripts for Ultima Online Outlands',
      url: '/uo/',
      image: '/assets/projects/uo-outlands.svg?v=2',
    },
    {
      name: 'YouTube',
      description: 'Video guides and gameplay',
      url: 'https://www.youtube.com/@e_muls',
      image: '/assets/projects/youtube.svg',
      external: true,
    },
  ];

  private renderCard(item: CardItem) {
    return (
      <div class="column is-half">
        <a
          class="box project-card"
          href={item.url}
          target={item.external ? '_blank' : undefined}
          rel={item.external ? 'noopener noreferrer' : undefined}
        >
          {item.image && (
            <div
              class="project-card-image"
              style={{
                backgroundImage: `url(${item.image})`,
              }}
            ></div>
          )}
          {item.image && <div class="project-card-fade"></div>}
          <div class="project-card-content">
            <p class="title is-5">{item.name}</p>
            <p class="subtitle is-6">{item.description}</p>
          </div>
        </a>
      </div>
    );
  }

  render() {
    return (
      <app-layout>
        <section class="section">
          <div class="container">
            <h2 class="title is-4 has-text-light">Projects</h2>
            <div class="columns is-multiline">{this.projects.map((project) => this.renderCard(project))}</div>
          </div>
        </section>
      </app-layout>
    );
  }
}

import { Component, Host, h } from '@stencil/core';

interface Project {
  name: string;
  description: string;
  url: string;
  image?: string;
}

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
})
export class AppHome {
  private projects: Project[] = [
    {
      name: 'Ultima Online Outlands',
      description: 'A player-driven, open-world shard of Ultima Online with a harsh survival economy and full-loot PvP.',
      url: '/uo-outlands/',
      image: '/assets/projects/uo-outlands.svg',
    },
  ];

  render() {
    return (
      <Host>
        <nav class="navbar is-transparent site-navbar" role="navigation" aria-label="main navigation">
          <div class="navbar-brand">
            <a class="navbar-item site-title" href="/">
              tmuls
            </a>
          </div>
        </nav>

        <section class="section">
          <div class="container">
            <h2 class="title is-4 has-text-light">Projects</h2>
            <div class="columns is-multiline">
              {this.projects.map((project) => (
                <div class="column is-half">
                  <a class="box project-card" href={project.url}>
                    {project.image && (
                      <div
                        class="project-card-image"
                        style={{
                          backgroundImage: `linear-gradient(to bottom, transparent 50%, var(--bulma-box-background-color) 100%), url(${project.image})`,
                        }}
                      ></div>
                    )}
                    <div class="project-card-content">
                      <p class="title is-5">{project.name}</p>
                      <p class="subtitle is-6">{project.description}</p>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Host>
    );
  }
}

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
      description: 'Guides and scripts for Ultima Online Outlands',
      url: '/uo-outlands/',
      image: '/assets/projects/uo-outlands.svg?v=2',
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
                          backgroundImage: `url(${project.image})`,
                        }}
                      ></div>
                    )}
                    {project.image && <div class="project-card-fade"></div>}
                    <div class="project-card-content">
                      <p class="title is-5">{project.name}</p>
                      <p class="subtitle is-6">{project.description}</p>
                    </div>
                  </a>
                </div>
              ))}
            </div>

            <a class="button youtube-button" href="https://www.youtube.com/@e_muls" target="_blank" rel="noopener noreferrer">
              <span class="icon">
                <svg viewBox="0 0 48 34" width="22" height="16" aria-hidden="true">
                  <rect width="48" height="34" rx="10" fill="#ff0000"></rect>
                  <path d="M20 10l14 7-14 7V10z" fill="#ffffff"></path>
                </svg>
              </span>
              <span>YouTube</span>
            </a>
          </div>
        </section>
      </Host>
    );
  }
}

import { Component, Host, h } from '@stencil/core';

interface Project {
  name: string;
  description: string;
  url: string;
}

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
})
export class AppHome {
  private projects: Project[] = [
    {
      name: 'Project One',
      description: 'A short description of this project goes here.',
      url: '#',
    },
    {
      name: 'Project Two',
      description: 'A short description of this project goes here.',
      url: '#',
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
                <div class="column is-one-third">
                  <a class="box project-card" href={project.url}>
                    <p class="title is-5">{project.name}</p>
                    <p class="subtitle is-6">{project.description}</p>
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

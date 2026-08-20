import { Component, Host, h } from '@stencil/core';

interface Project {
  name: string;
  description: string;
  url: string;
}

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
  shadow: true,
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
        <header class="hero">
          <h1>Muls</h1>
          <p>Welcome to my personal website.</p>
        </header>
        <section class="projects">
          <h2>Projects</h2>
          <div class="project-grid">
            {this.projects.map((project) => (
              <a class="project-card" href={project.url}>
                <h3>{project.name}</h3>
                <p>{project.description}</p>
              </a>
            ))}
          </div>
        </section>
      </Host>
    );
  }
}

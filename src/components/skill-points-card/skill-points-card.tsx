import { Component, Prop, h } from '@stencil/core';

interface SkillEntry {
  name: string;
  points: number;
}

@Component({
  tag: 'skill-points-card',
  styleUrl: 'skill-points-card.css',
})
export class SkillPointsCard {
  @Prop() cardTitle = 'Skill Points';
  @Prop() skills: SkillEntry[] = [];

  render() {
    return (
      <div class="sidebar-card skill-points-card">
        <p class="sidebar-card-label">{this.cardTitle}</p>
        <ul class="skill-points-list">
          {this.skills.map((skill) => (
            <li class="skill-points-row">
              <span class="skill-points-name">{skill.name}</span>
              <span class="skill-points-value">{skill.points}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

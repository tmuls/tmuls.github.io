import { Component, Prop, State, h } from '@stencil/core';
import { marked } from 'marked';

interface SkillEntry {
  name: string;
  points: number;
}

interface SkillTab {
  label: string;
  skills: SkillEntry[];
  markdown?: string;
}

@Component({
  tag: 'skill-points-card',
  styleUrl: 'skill-points-card.css',
})
export class SkillPointsCard {
  @Prop() cardTitle = 'Skill Points';
  @Prop() guideId?: string;
  @Prop() skills: SkillEntry[] = [];
  @Prop() tabs: SkillTab[] = [];
  @State() activeTab = 0;
  @State() tabMarkdown: string[] = [];

  async componentWillLoad() {
    if (this.tabs.length === 0 || !this.guideId) {
      return;
    }
    this.tabMarkdown = await Promise.all(
      this.tabs.map(async (tab) => {
        if (!tab.markdown) return '';
        try {
          const res = await fetch(`/assets/guides/${this.guideId}/${tab.markdown}`, { cache: 'no-cache' });
          if (!res.ok) return '';
          return marked.parse(await res.text()) as string;
        } catch (e) {
          return '';
        }
      }),
    );
  }

  render() {
    const hasTabs = this.tabs.length > 0;
    const activeSkills = hasTabs ? this.tabs[this.activeTab].skills : this.skills;
    const activeMarkdown = hasTabs ? this.tabMarkdown[this.activeTab] : '';

    return (
      <div class="sidebar-card skill-points-card">
        {hasTabs && (
          <div class="skill-points-tabs">
            {this.tabs.map((tab, i) => (
              <button
                type="button"
                class={{ 'skill-points-tab': true, 'is-active': i === this.activeTab }}
                onClick={() => (this.activeTab = i)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <p class="sidebar-card-label">{this.cardTitle}</p>

        <ul class="skill-points-list">
          {activeSkills.map((skill) => (
            <li class="skill-points-row">
              <span class="skill-points-name">{skill.name}</span>
              <span class="skill-points-value">{skill.points}</span>
            </li>
          ))}
        </ul>

        {activeMarkdown && <div class="skill-points-markdown content" innerHTML={activeMarkdown}></div>}
      </div>
    );
  }
}

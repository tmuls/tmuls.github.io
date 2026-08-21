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

const SKILL_CAP = 720;

// Deliberately hardcoded rather than derived from the skill name (e.g. by
// slugifying it) - the wiki's own naming doesn't reliably match ("Magic
// Resist" is "Resisting Spells" there), so a wrong guess would just be a
// silently broken link. Not configurable via the sidecar JSON either; a
// skill either has a real wiki page here or the button doesn't render.
const SKILL_WIKI_URLS: Record<string, string> = {
  Alchemy: 'https://wiki.uooutlands.com/Alchemy',
  Anatomy: 'https://wiki.uooutlands.com/Anatomy',
  'Arms Lore': 'https://wiki.uooutlands.com/Arms_Lore',
  Camping: 'https://wiki.uooutlands.com/Camping',
  Chivalry: 'https://wiki.uooutlands.com/Chivalry',
  Focus: 'https://wiki.uooutlands.com/Focus',
  Healing: 'https://wiki.uooutlands.com/Healing',
  'Magic Resist': 'https://wiki.uooutlands.com/Resisting_Spells',
  Tactics: 'https://wiki.uooutlands.com/Tactics',
  Wrestling: 'https://wiki.uooutlands.com/Wrestling',
};

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
    const total = activeSkills.reduce((sum, skill) => sum + skill.points, 0);

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
              <span class="skill-points-name-group">
                <span class="skill-points-name">{skill.name}</span>
                {SKILL_WIKI_URLS[skill.name] && (
                  <a
                    class="skill-points-wiki-link"
                    href={SKILL_WIKI_URLS[skill.name]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${skill.name} on the Outlands wiki`}
                  ></a>
                )}
              </span>
              <span class="skill-points-value">{skill.points}</span>
            </li>
          ))}
        </ul>

        <p class="skill-points-total">
          {total} / {SKILL_CAP}
        </p>

        {activeMarkdown && <div class="skill-points-markdown content" innerHTML={activeMarkdown}></div>}
      </div>
    );
  }
}

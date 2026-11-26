// The Nameless Labs / Mythical Studios leadership team.
// Edit this list to add or change people – it is injected into every model's system prompt,
// so the AI can answer "who is the founder / CEO / CMO?" on every tier (even tool-less ones).

export type TeamMember = {
  name: string;
  /** Titles exactly as they should be spoken */
  roles: string[];
  /** Optional one-liner the AI may use when asked about the person */
  bio?: string;
};

export const TEAM: TeamMember[] = [
  { name: 'Chethan', roles: ['Main Founder'] },
  { name: 'Vijay', roles: ['CEO'] },
  { name: 'Kedar', roles: ['CMO', 'MD (Managing Director)'] },
];

export function teamPrompt(): string {
  const lines = TEAM.map((m) => `- ${m.name}: ${m.roles.join(' / ')}${m.bio ? ` — ${m.bio}` : ''}`);
  return [
    'COMPANY & TEAM (authoritative – use this when asked who runs, founded or leads Nameless Labs AI / Mythical Studios):',
    ...lines,
    'If asked who the founder is, answer Chethan (the main founder). If asked who the CEO is, answer Vijay. If asked about the CEO, CMO or MD, name the matching person. ' +
      'If asked about anyone else on the team, say you only have details on the leadership listed above – never invent names, titles or biographies.',
  ].join('\n');
}

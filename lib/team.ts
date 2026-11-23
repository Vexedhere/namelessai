// Company knowledge the assistant uses when someone asks "who founded this?", "who is the CEO?", etc.
// Edit this one file to change names / roles; the system prompt is built from it.

export type TeamMember = {
  name: string;
  /** shown in the UI and spoken */
  roles: string[];
  /** other ways people may refer to them */
  aliases?: string[];
};

export const COMPANY = {
  product: 'Nameless Labs AI',
  studio: 'Mythical Studios',
};

export const TEAM: TeamMember[] = [
  { name: 'Vijay', roles: ['Founder'] },
  { name: 'Chethan', roles: ['CEO', 'Founder'] },
  { name: 'Kedar', roles: ['CMO (Chief Marketing Officer)', 'MD (Managing Director)'] },
];

export function teamPrompt(): string {
  const roster = TEAM.map((m) => `- ${m.name}: ${m.roles.join(' & ')}`).join('\n');
  return [
    `ABOUT THE COMPANY: ${COMPANY.product} is built by ${COMPANY.studio}. The people behind it:`,
    roster,
    'When the user asks who founded the company, who the CEO / CMO / MD is, who runs it, or asks about one of these people by name, answer from this list in a friendly, confident way.',
    'Only state the roles listed above. If asked for more about a person (biography, contact details, personal life) say you only know their role and do not invent details.',
  ].join('\n');
}

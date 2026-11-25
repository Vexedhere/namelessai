// Lets the AI drive the app itself ("start a new chat", "switch to Aether", "open the sidebar", "export this chat as PDF").
// The page registers the real handlers; this module only maps a spoken/typed command to them.
import { MODELS } from './models';
import { PERSONAS } from './personas';

export type AppActions = {
  newChat: () => void;
  sidebar: (open: boolean) => void;
  setModel: (id: string) => void;
  setPersona: (id: string) => void;
  setActions: (on: boolean) => void;
  renameAi: () => void;
  signIn: () => void;
  exportPdf: () => Promise<string>;
  clearScreen: () => void;
};

let h: AppActions | null = null;
export const registerAppActions = (a: AppActions) => {
  h = a;
};

export const APP_ACTIONS = ['new_chat', 'open_sidebar', 'close_sidebar', 'set_model', 'set_persona', 'actions_on', 'actions_off', 'rename_ai', 'sign_in', 'export_chat_pdf'] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function runAppControl(action: string, value: string): Promise<string> {
  if (!h) throw new Error('The app is not ready yet.');
  switch (action) {
    case 'new_chat':
      h.newChat();
      return 'A new chat will open as soon as your reply finishes.';
    case 'open_sidebar':
      h.sidebar(true);
      return 'Opened the sidebar.';
    case 'close_sidebar':
      h.sidebar(false);
      return 'Closed the sidebar.';
    case 'set_model': {
      const q = norm(value);
      const m = MODELS.find((x) => x.id === value || norm(x.name) === q || norm(x.name).includes(q) || q.includes(norm(x.name).split(' ')[0]));
      if (!q || !m) return `Error: no such model. Available: ${MODELS.map((x) => x.name).join(', ')}.`;
      h.setModel(m.id);
      return `Switched to ${m.name}. (Plus/Pro models only work on accounts with that plan.)`;
    }
    case 'set_persona': {
      const q = norm(value);
      const p = PERSONAS.find((x) => x.id === value || norm(x.name) === q || norm(x.name).includes(q));
      if (!q || !p) return `Error: no such mode. Available: ${PERSONAS.map((x) => x.name).join(', ')}.`;
      h.setPersona(p.id);
      return `Switched to ${p.name} mode.`;
    }
    case 'actions_on':
      h.setActions(true);
      return 'Actions are on.';
    case 'actions_off':
      h.setActions(false);
      return 'Actions are off (takes effect from the next message).';
    case 'rename_ai':
      h.renameAi();
      return 'Opened the rename dialog.';
    case 'sign_in':
      h.signIn();
      return 'Opened the sign-in dialog.';
    case 'export_chat_pdf':
      return h.exportPdf();
    default:
      return `Error: unknown action. Use one of: ${APP_ACTIONS.join(', ')}.`;
  }
}

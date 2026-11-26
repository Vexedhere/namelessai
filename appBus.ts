// A tiny bridge so tools (which live in plain modules) can drive the page: switch model, start a new chat,
// change how the microphone behaves, ask the user to confirm something risky…
// The page registers the handlers once; tools call them and get a sentence back for the model.

export type VoiceCommand =
  | { kind: 'sleep' }
  | { kind: 'stop' }
  | { kind: 'start'; mode?: 'wake' | 'open' }
  | { kind: 'mode'; mode: 'wake' | 'open' }
  | { kind: 'language'; code: string }
  | { kind: 'rate'; value: number }
  | { kind: 'volume'; value: number };

export type AppCommand =
  | { type: 'new_chat' }
  | { type: 'sidebar'; open: boolean }
  | { type: 'set_model'; query: string }
  | { type: 'set_persona'; query: string }
  | { type: 'actions'; on: boolean }
  | { type: 'export_chat' }
  | { type: 'open_devices' }
  | { type: 'voice'; cmd: VoiceCommand };

export type ConfirmRequest = { title: string; detail: string; danger?: boolean };

type CommandHandler = (cmd: AppCommand) => string | Promise<string>;
type ConfirmHandler = (req: ConfirmRequest, signal?: AbortSignal) => Promise<boolean>;

let commandHandler: CommandHandler | null = null;
let confirmHandler: ConfirmHandler | null = null;

export const setAppCommandHandler = (h: CommandHandler | null) => {
  commandHandler = h;
};
export const setConfirmHandler = (h: ConfirmHandler | null) => {
  confirmHandler = h;
};

export async function sendAppCommand(cmd: AppCommand): Promise<string> {
  if (!commandHandler) throw new Error('The app is not ready yet.');
  return commandHandler(cmd);
}

/** Ask the user to approve an action. Resolves false if they decline, the request is aborted, or there is no UI to ask on. */
export async function askConfirm(req: ConfirmRequest, signal?: AbortSignal): Promise<boolean> {
  if (!confirmHandler) return false;
  return confirmHandler(req, signal);
}

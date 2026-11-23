export type Role = 'user' | 'assistant';

export type ToolStatus = 'running' | 'awaiting' | 'done' | 'error' | 'cancelled';

/** One tool invocation the model asked for, plus what happened when we ran it. */
export type ToolCall = {
  id: string;
  name: string;
  /** raw JSON string exactly as the model produced it */
  args: string;
  status: ToolStatus;
  /** text returned to the model (also shown to the user in the tool chip) */
  result?: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  /** model id that produced an assistant message */
  model?: string;
  /** set when the request failed; the text is shown to the user */
  error?: string;
  /** tools the assistant invoked in this turn (results are fed back to the model) */
  toolCalls?: ToolCall[];
};

export type Chat = {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  updatedAt: number;
};

/** Wire format sent to /api/chat (OpenAI-compatible chat messages). */
export type ApiMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Events streamed back from /api/chat (one JSON object per line). */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; calls: { id: string; name: string; arguments: string }[] }
  | { type: 'error'; message: string };

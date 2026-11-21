export type Role = 'user' | 'assistant';

export type Message = {
  id: string;
  role: Role;
  content: string;
  /** model id that produced an assistant message */
  model?: string;
  /** set when the request failed; the text is shown to the user */
  error?: string;
};

export type Chat = {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  updatedAt: number;
};

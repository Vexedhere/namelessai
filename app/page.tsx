'use client';

import { useState } from 'react';

const MODELS = [
  { id: 'nameless-ai', name: 'NamelessAI (Custom Fine-Tuned)', badge: 'Custom' },
  { id: 'pulse-nano', name: 'Pulse 5.5 Nano', badge: 'Fast' },
  { id: 'lyric-flash', name: 'Lyric 5.5 Flash', badge: 'Balanced' },
  { id: 'vega-mini', name: 'Vega 5.5 Mini', badge: 'Smart' },
  { id: 'aether-pro', name: 'Aether 5.5 Pro', badge: 'Pro' },
  { id: 'quasar-apex', name: 'Quasar 5.5 Apex', badge: 'Apex' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    {
      role: 'assistant',
      content: 'Welcome to Nameless Labs AI. Select your model tier and start building.',
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, model: selectedModel }),
      });
      const data = await res.json();
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: data.reply || data.error || 'No response received.' },
      ]);
    } catch (err) {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: 'Error connecting to Nameless Labs network.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex h-screen bg-[#0c1014] text-gray-100 font-sans overflow-hidden">
      {/* Sidebar Model Selector */}
      <aside className="w-72 border-r border-white/10 bg-black/40 backdrop-blur-xl p-6 flex flex-col justify-between hidden md:flex">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-6">
            Nameless Labs AI
          </h1>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Select Model Tier
            </p>
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border flex items-center justify-between ${
                  selectedModel === m.id
                    ? 'bg-white/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)] text-white font-medium'
                    : 'bg-transparent border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <span className="truncate pr-2">{m.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {m.badge}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-gray-500 border-t border-white/10 pt-4">
          Powered by Mythical Studios
        </div>
      </aside>

      {/* Main Chat Interface */}
      <section className="flex-1 flex flex-col h-full bg-gradient-to-br from-[#0c1014] via-[#121820] to-[#0a0e13]">
        {/* Top Bar */}
        <header className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-md flex items-center px-6 justify-between">
          <span className="text-sm font-medium text-cyan-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            Active Model: {MODELS.find((m) => m.id === selectedModel)?.name}
          </span>
        </header>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl w-full mx-auto">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed backdrop-blur-md border whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-100 shadow-lg'
                    : 'bg-white/5 border-white/10 text-gray-200 shadow-xl'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-gray-400 animate-pulse">
                NamelessAI is thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur-md">
          <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask NamelessAI anything..."
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-6 py-4 rounded-2xl text-sm transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

'use client';

import type { Chat } from '@/lib/types';

type Props = {
  chats: Chat[];
  modelName: string;
  signedIn: boolean;
  onLaunch: (prompt: string) => void;
  onAgent: () => void;
  onTools: () => void;
  onDevices: () => void;
  onVoice?: () => void;
  onSelectChat: (id: string) => void;
};

const starterPrompt = 'Help me work through this. Start by understanding the outcome I want, then give me a clear and useful next step.';

export function CommandDashboard({ chats, modelName, signedIn, onLaunch, onAgent, onTools, onDevices, onVoice, onSelectChat }: Props) {
  const recent = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  return (
    <main className="command-dashboard">
      <div className="command-dashboard-head">
        <div>
          <p className="command-eyebrow"><span /> WORKSPACE / OVERVIEW</p>
          <h1>Your work, <em>in motion.</em></h1>
          <p className="command-lede">A focused space to think, make, research and get things done.</p>
        </div>
        <div className="command-session"><span className="command-session-dot" /><span>{signedIn ? 'ACCOUNT SYNC ENABLED' : 'GUEST SESSION'}</span></div>
      </div>
      <section className="command-feature-grid" aria-label="Workspace actions">
        <button className="command-feature command-feature-primary" onClick={() => onLaunch(starterPrompt)}>
          <span className="command-feature-index">01 / CONVERSATION</span><span className="command-feature-symbol">↗</span>
          <strong>Start with<br />a question.</strong><span className="command-feature-copy">Explore an idea, solve a problem, or build something new.</span>
          <span className="command-feature-link">START A CHAT <i>↗</i></span>
        </button>
        <button className="command-feature command-feature-agent" onClick={onAgent}>
          <span className="command-feature-index">02 / EXECUTION</span><span className="command-feature-symbol">⌘</span>
          <strong>Give it<br />a mission.</strong><span className="command-feature-copy">Set an outcome. Let Agent plan, act with enabled tools, and report back.</span>
          <span className="command-feature-link">OPEN AGENT <i>↗</i></span>
        </button>
        <button className="command-feature command-feature-tools" onClick={onTools}>
          <span className="command-feature-index">03 / CAPABILITIES</span><span className="command-feature-symbol">⌕</span>
          <strong>Find the<br />right tool.</strong><span className="command-feature-copy">Browse the capabilities available in this workspace.</span>
          <span className="command-feature-link">EXPLORE TOOLS <i>↗</i></span>
        </button>
      </section>
      <section className="command-lower-grid">
        <div className="command-panel command-recent">
          <div className="command-panel-heading"><div><p>YOUR WORKSPACE</p><h2>Recent conversations</h2></div><span>{chats.length.toString().padStart(2, '0')} TOTAL</span></div>
          {recent.length ? <div className="command-recent-list">{recent.map((chat, index) => (
            <button key={chat.id} onClick={() => onSelectChat(chat.id)} className="command-recent-item">
              <span className="command-recent-number">{String(index + 1).padStart(2, '0')}</span><span className="command-recent-title">{chat.title || 'Untitled conversation'}</span><span className="command-recent-arrow">↗</span>
            </button>
          ))}</div> : <div className="command-empty-state"><span>—</span><p>Your conversations will appear here.</p><small>Start a chat to create your first workspace item.</small></div>}
        </div>
        <div className="command-panel command-tools-panel">
          <div className="command-panel-heading"><div><p>MORE WAYS TO WORK</p><h2>Workspace tools</h2></div><span>QUICK ACCESS</span></div>
          <button className="command-utility" onClick={onDevices}><span className="command-utility-icon">▣</span><span><b>Connected devices</b><small>Manage device tools and connections</small></span><i>↗</i></button>
          {onVoice && <button className="command-utility" onClick={onVoice}><span className="command-utility-icon">◉</span><span><b>Voice workspace</b><small>Speak naturally with your assistant</small></span><i>↗</i></button>}
          <div className="command-model-note"><span>ACTIVE MODEL</span><b>{modelName}</b><small>Change models from the workspace controls.</small></div>
        </div>
      </section>
      <footer className="command-dashboard-footer"><span>NAMELESS LABS <i>·</i> WORKSPACE</span><span>{signedIn ? 'YOUR CHATS SYNC WITH YOUR ACCOUNT' : 'SIGN IN TO KEEP YOUR CONVERSATIONS'}</span></footer>
    </main>
  );
}

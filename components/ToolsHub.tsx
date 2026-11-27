'use client';

import { useMemo, useState } from 'react';
import { TOOL_DEFS } from '@/lib/toolDefs';

type Tool = (typeof TOOL_DEFS)[number];

const categories: { id: string; title: string; detail: string; match: (name: string) => boolean }[] = [
  { id: 'research', title: 'Research & web', detail: 'Find, read and understand information', match: n => /search|read_webpage|wikipedia|define_word|get_news|get_weather|world_time|country_info|public_holidays|get_crypto_price|convert_currency/.test(n) },
  { id: 'productivity', title: 'Productivity', detail: 'Plan your day and keep work moving', match: n => /manage_tasks|save_note|list_notes|start_focus|track_habit|manage_bookmarks|set_alarm|set_timer|list_alarms|cancel_alarm/.test(n) },
  { id: 'create', title: 'Create & export', detail: 'Turn ideas into files and deliverables', match: n => /generate_pdf|create_spreadsheet|save_file|send_email|copy_to_clipboard/.test(n) },
  { id: 'utilities', title: 'Calculators & utilities', detail: 'Convert, calculate and transform', match: n => /calculate|convert_units|finance_calc|date_calc|text_tools|color_convert|generate_password|random_pick/.test(n) },
  { id: 'device', title: 'Your device', detail: 'Interact with your browser and hardware', match: n => /device_info|get_location|screen_control|flashlight|vibrate|show_notification|read_clipboard|speak_aloud|open_app|app_control|computer_control/.test(n) },
  { id: 'personal', title: 'Personal assistant', detail: 'Contacts, communication and preferences', match: n => /save_contact|find_contact|set_theme|voice_control/.test(n) },
];

export function ToolsHub({ onRun, onClose }: { onRun: (prompt: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('all');
  const groups = useMemo(() => categories.map(category => ({
    ...category,
    tools: TOOL_DEFS.filter(tool => category.match(tool.function.name)),
  })), []);
  const all = useMemo(() => TOOL_DEFS.filter(tool => !categories.some(category => category.match(tool.function.name))), []);
  const filtered = (tool: Tool) => {
    const q = query.trim().toLowerCase();
    return !q || tool.function.name.replace(/_/g, ' ').includes(q) || tool.function.description.toLowerCase().includes(q);
  };
  const total = TOOL_DEFS.length;

  return (
    <div className="tools-hub-overlay" role="dialog" aria-modal="true" aria-label="NamelessAI tools">
      <div className="tools-hub">
        <header className="tools-hub-header">
          <div className="tools-hub-brand"><span className="tools-hub-mark">N</span><span><b>NamelessAI</b><small>CAPABILITY DIRECTORY</small></span></div>
          <button className="tools-hub-close" onClick={onClose} aria-label="Close tools">×</button>
        </header>
        <div className="tools-hub-hero">
          <div className="tools-hub-eyebrow"><i /> YOUR AI TOOLKIT <span>{total} CAPABILITIES</span></div>
          <h1>More than a<br /><em>conversation.</em></h1>
          <p>Explore what NamelessAI can actually do. Pick a capability and it will start a conversation with the right tool in context.</p>
          <label className="tools-hub-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search 50+ capabilities…" autoFocus />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        </div>
        <div className="tools-hub-body">
          <nav className="tools-hub-categories" aria-label="Tool categories">
            <button className={active === 'all' ? 'selected' : ''} onClick={() => setActive('all')}><span>✳</span> All tools <small>{total}</small></button>
            {groups.map(group => <button key={group.id} className={active === group.id ? 'selected' : ''} onClick={() => setActive(group.id)}><span>{group.id === 'research' ? '⌕' : group.id === 'productivity' ? '◷' : group.id === 'create' ? '↗' : group.id === 'utilities' ? '∑' : group.id === 'device' ? '⌘' : '◇'}</span>{group.title}<small>{group.tools.length}</small></button>)}
          </nav>
          <div className="tools-hub-results">
            {groups.filter(group => (active === 'all' || active === group.id) && group.tools.some(filtered)).map(group => (
              <section className="tools-hub-group" key={group.id}>
                <div className="tools-hub-group-head"><div><h2>{group.title}</h2><p>{group.detail}</p></div><span>{group.tools.filter(filtered).length} TOOLS</span></div>
                <div className="tools-hub-grid">
                  {group.tools.filter(filtered).map(tool => <button key={tool.function.name} className="tools-hub-card" onClick={() => onRun(`I want to use the ${tool.function.name.replace(/_/g, ' ')} capability. ${tool.function.description} Ask me for any required information, then use the actual tool and explain the result.`)}>
                    <span className="tools-hub-card-icon">{tool.function.name.startsWith('get_') || tool.function.name.includes('search') ? '⌕' : tool.function.name.includes('manage') || tool.function.name.includes('save') ? '▤' : tool.function.name.includes('convert') || tool.function.name.includes('calc') ? '∑' : '✳'}</span>
                    <b>{tool.function.name.replace(/_/g, ' ')}</b>
                    <p>{tool.function.description}</p>
                    <span className="tools-hub-use">USE CAPABILITY ↗</span>
                  </button>)}
                </div>
              </section>
            ))}
            {active === 'all' && all.some(filtered) && <section className="tools-hub-group"><div className="tools-hub-group-head"><div><h2>Additional capabilities</h2><p>Other built-in actions</p></div></div><div className="tools-hub-grid">{all.filter(filtered).map(tool => <button key={tool.function.name} className="tools-hub-card" onClick={() => onRun(`I want to use the ${tool.function.name.replace(/_/g, ' ')} capability. ${tool.function.description} Ask me for any required information, then use the actual tool and explain the result.`)}><span className="tools-hub-card-icon">✳</span><b>{tool.function.name.replace(/_/g, ' ')}</b><p>{tool.function.description}</p><span className="tools-hub-use">USE CAPABILITY ↗</span></button>)}</div></section>}
            {!groups.some(group => (active === 'all' || active === group.id) && group.tools.some(filtered)) && !(active === 'all' && all.some(filtered)) && <div className="tools-hub-empty"><span>⌕</span><b>No matching capabilities</b><p>Try a different search term or category.</p></div>}
          </div>
        </div>
        <footer className="tools-hub-footer"><span>TOOLS ARE EXECUTED THROUGH YOUR CURRENT AI SESSION</span><span>APPROVAL REQUIRED FOR SENSITIVE ACTIONS</span></footer>
      </div>
    </div>
  );
}

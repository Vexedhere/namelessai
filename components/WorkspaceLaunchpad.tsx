'use client';

const launchers = [
  { number: '01', mark: '↗', title: 'Make something', detail: 'Turn a rough idea into a real thing.', label: 'CREATE', prompt: 'Act as my product engineer and creative partner. Help me turn this idea into a clear plan, then build it step by step. Ask only for essential missing details.', featured: true },
  { number: '02', mark: '⌕', title: 'Find the truth', detail: 'Research a topic. Bring back the signal.', label: 'RESEARCH', prompt: 'Research this carefully. Break it into sub-questions, use available search tools when possible, distinguish verified facts from assumptions, and cite sources when available.' },
  { number: '03', mark: '▤', title: 'Understand a file', detail: 'Pull the useful story out of the data.', label: 'ANALYSE', prompt: 'Analyse the file I attach. Identify its structure, extract the important information, explain useful insights, and flag uncertainty.' },
  { number: '04', mark: '✳', title: 'Write with intent', detail: 'Get the words, tone, and details right.', label: 'CREATE', prompt: 'Be my writing partner. Help me create a clear, original, polished result for the intended audience. Ask a question only if a key detail is missing.' },
  { number: '05', mark: '⌁', title: 'Crack a problem', detail: 'Reason it through. Test the answer.', label: 'SOLVE', prompt: 'Help me solve this systematically. Find the root cause, compare realistic approaches, recommend one, and verify the result instead of guessing.' },
];

export function WorkspaceLaunchpad({ onLaunch, onVoice }: { onLaunch: (prompt: string) => void; onVoice?: () => void }) {
  return (
    <section className="home-actions">
      <div className="home-section-head">
        <div>
          <p className="home-overline home-overline-dark"><span /> THE STARTING POINT</p>
          <h3>What are we working on<span>?</span></h3>
        </div>
        <p className="home-section-note">Pick a direction. Change it whenever you like.</p>
      </div>
      <div className="home-action-grid">
        {launchers.map((item) => (
          <button key={item.number} type="button" onClick={() => onLaunch(item.prompt)}
            className={`home-action-card ${item.featured ? 'home-action-featured' : ''}`}>
            <span className="home-action-top"><span className="home-action-mark">{item.mark}</span><span className="home-action-number">{item.number}</span></span>
            <span className="home-action-title">{item.title}<span>↗</span></span>
            <span className="home-action-detail">{item.detail}</span>
            <span className="home-action-label">{item.label}</span>
          </button>
        ))}
        <button type="button" onClick={onVoice} disabled={!onVoice} className="home-action-card home-voice-card">
          <span className="home-action-top"><span className="home-action-mark">◉</span><span className="home-action-number">06</span></span>
          <span className="home-action-title">Talk it through<span>↗</span></span>
          <span className="home-action-detail">Think out loud. Keep your hands free.</span>
          <span className="home-action-label">VOICE STUDIO</span>
        </button>
      </div>
    </section>
  );
}

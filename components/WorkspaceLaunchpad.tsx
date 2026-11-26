'use client';

const launchers = [
  { icon: '⌘', title: 'Build something', detail: 'Turn an idea into a working app or feature.', prompt: 'Act as my product engineer. Help me turn my idea into a clear implementation plan, then build it step by step. Ask only for essential missing details.' },
  { icon: '⌕', title: 'Research a topic', detail: 'Explore a question and separate facts from assumptions.', prompt: 'Help me research this topic carefully. Break it into sub-questions, use available search tools when possible, distinguish verified facts from assumptions, and cite sources when available.' },
  { icon: '▤', title: 'Understand a file', detail: 'Attach a document, spreadsheet, image or code file.', prompt: 'I want you to analyse an attached file. First identify its type and structure, then extract the important information, explain insights, and flag anything uncertain.' },
  { icon: '✎', title: 'Write & create', detail: 'Draft, rewrite, brainstorm or shape an idea.', prompt: 'Be my writing and creative partner. Help me shape an excellent result, matching the audience and tone. Start by clarifying the outcome only if it is genuinely necessary.' },
  { icon: '⌁', title: 'Solve a problem', detail: 'Debug, reason through options and verify the result.', prompt: 'Help me solve this problem systematically. Identify the root issue, compare viable approaches, recommend one, and verify the result rather than guessing.' },
  { icon: '◉', title: 'Talk to NamelessAI', detail: 'Start a hands-free voice conversation.', voice: true },
];

export function WorkspaceLaunchpad({ onLaunch, onVoice }: { onLaunch: (prompt: string) => void; onVoice?: () => void }) {
  return (
    <section className="mt-9 w-full text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Your workspace</p>
          <h3 className="mt-1 text-sm font-semibold text-zinc-200">What do you want to do?</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] text-zinc-500">Choose a starting point</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {launchers.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => item.voice ? onVoice?.() : onLaunch(item.prompt!)}
            disabled={item.voice && !onVoice}
            className="group min-h-[112px] rounded-2xl border border-white/[0.09] bg-white/[0.025] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-cyan-300/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.07] text-base text-cyan-200 transition group-hover:border-cyan-300/30 group-hover:bg-cyan-300/15">{item.icon}</span>
            <span className="mt-3 block text-sm font-semibold text-zinc-100">{item.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

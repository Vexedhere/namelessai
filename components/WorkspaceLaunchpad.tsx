'use client';

const launchers: { number: string; icon: string; title: string; detail: string; tag: string; prompt?: string; featured?: boolean; voice?: boolean }[] = [
  { number: '01', icon: '↗', title: 'Build an idea', detail: 'Turn a rough thought into a real product.', tag: 'CREATE', prompt: 'Act as my product engineer. Help me turn my idea into a clear implementation plan, then build it step by step. Ask only for essential missing details.', featured: true },
  { number: '02', icon: '⌕', title: 'Deep research', detail: 'Find the signal. Bring back the sources.', tag: 'DISCOVER', prompt: 'Help me research this topic carefully. Break it into sub-questions, use available search tools when possible, distinguish verified facts from assumptions, and cite sources when available.' },
  { number: '03', icon: '▤', title: 'Read a file', detail: 'Make sense of documents and data.', tag: 'ANALYSE', prompt: 'I want you to analyse an attached file. First identify its type and structure, then extract the important information, explain insights, and flag anything uncertain.' },
  { number: '04', icon: '✳', title: 'Write something', detail: 'Make the words sharper and clearer.', tag: 'CREATE', prompt: 'Be my writing and creative partner. Help me shape an excellent result, matching the audience and tone. Start by clarifying the outcome only if it is genuinely necessary.' },
  { number: '05', icon: '⌁', title: 'Solve a problem', detail: 'Debug, reason, test, and improve.', tag: 'SOLVE', prompt: 'Help me solve this problem systematically. Identify the root issue, compare viable approaches, recommend one, and verify the result rather than guessing.' },
  { number: '06', icon: '◉', title: 'Talk it through', detail: 'Have a hands-free voice conversation.', tag: 'VOICE', voice: true },
];

export function WorkspaceLaunchpad({ onLaunch, onVoice }: { onLaunch: (prompt: string) => void; onVoice?: () => void }) {
  return (
    <section className="w-full text-left">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-lime-300">THE WORKSPACE</p>
          <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Pick a direction<span className="text-lime-300">.</span></h3>
        </div>
        <span className="hidden pb-1 text-[11px] text-zinc-500 sm:block">Six ways to get moving</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {launchers.map((item) => (
          <button
            key={item.number}
            type="button"
            onClick={() => item.voice ? onVoice?.() : onLaunch(item.prompt!)}
            disabled={item.voice && !onVoice}
            className={`group relative flex min-h-[154px] flex-col overflow-hidden rounded-[20px] border p-5 text-left transition duration-300 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300/70 disabled:cursor-not-allowed disabled:opacity-40 ${item.featured ? 'border-lime-300/30 bg-lime-300/[0.075] hover:border-lime-200/60 hover:bg-lime-300/[0.11]' : 'border-white/[0.085] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.055]'}`}
          >
            {item.featured && <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-lime-300/10 blur-3xl transition group-hover:bg-lime-200/20" />}
            <span className="relative flex w-full items-center justify-between">
              <span className={`grid h-10 w-10 place-items-center rounded-xl border text-lg ${item.featured ? 'border-lime-200/30 bg-lime-200/10 text-lime-200' : 'border-white/10 bg-white/[0.045] text-zinc-200'}`}>{item.icon}</span>
              <span className="font-mono text-[10px] tracking-[0.16em] text-zinc-600">{item.number}</span>
            </span>
            <span className="relative mt-5 flex w-full items-center justify-between gap-3">
              <span className="text-[15px] font-semibold tracking-tight text-zinc-100">{item.title}</span>
              <span className="text-lg text-zinc-600 transition group-hover:translate-x-1 group-hover:text-lime-200">↗</span>
            </span>
            <span className="relative mt-1 text-xs leading-relaxed text-zinc-500">{item.detail}</span>
            <span className={`relative mt-auto pt-4 text-[9px] font-bold tracking-[0.2em] ${item.featured ? 'text-lime-200/80' : 'text-zinc-600'}`}>{item.tag}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

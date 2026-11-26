'use client';

import { LaptopIcon, SparkIcon, WrenchIcon } from './Icons';

const CAPABILITIES = [
  { icon: SparkIcon, title: 'Research', detail: 'Search, compare sources and turn findings into a clear answer.' },
  { icon: SparkIcon, title: 'Understand files', detail: 'Read PDFs, documents, spreadsheets, slides and images.' },
  { icon: LaptopIcon, title: 'Use your devices', detail: 'Run browser actions or control a paired desktop companion.' },
  { icon: SparkIcon, title: 'Create deliverables', detail: 'Generate polished PDFs, reports and Excel workbooks.' },
];

const TASKS = [
  { label: 'PDF → answer key', prompt: 'Create a complete answer key for the attached PDF. Explain each answer clearly, organise it by question number, and generate a polished downloadable PDF.' },
  { label: 'Understand a document', prompt: 'Read the attached PDF carefully. Summarise the key ideas, extract important facts, identify anything unclear, and give me the most useful takeaways.' },
  { label: 'Research a topic', prompt: 'Research this topic thoroughly. Compare reliable sources, identify important facts and disagreements, then create a structured report with sources: ' },
  { label: 'Control my computer', prompt: 'Check whether my desktop companion is connected. If it is, tell me the available controls and take a screenshot of my desktop.' },
];

export function AgentWelcome({ onPrompt, onDevices }: { onPrompt: (prompt: string) => void; onDevices: () => void }) {
  return (
    <section className="mt-8 w-full text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
            Agent workspace
          </div>
          <h3 className="mt-1 text-base font-semibold tracking-tight text-white">Give it a goal. It handles the steps.</h3>
        </div>
        <button onClick={onDevices} className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/[0.07] hover:text-white">
          <span className="inline-flex items-center gap-2"><LaptopIcon width={14} height={14} /> Connect devices</span>
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, title, detail }, index) => (
          <div key={title} className="group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.055] to-white/[0.018] p-3.5 transition hover:border-cyan-300/20 hover:from-cyan-300/[0.07]">
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${index === 2 ? 'border-violet-300/20 bg-violet-300/10 text-violet-200' : 'border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200'}`}>
                <Icon width={17} height={17} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <WrenchIcon width={13} height={13} /> Try an agent workflow
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {TASKS.map((task) => (
          <button key={task.label} onClick={() => onPrompt(task.prompt)} className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 px-3.5 py-3 text-left text-xs font-medium text-zinc-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.045] hover:text-white">
            <span>{task.label}</span>
            <span aria-hidden className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-cyan-200">↗</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-600">
        Actions that affect your device or send information require permission. Desktop controls need the companion connected in Devices.
      </p>
    </section>
  );
}

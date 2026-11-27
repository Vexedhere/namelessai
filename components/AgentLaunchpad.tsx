'use client';

import { SparkIcon } from './Icons';

const jobs = [
  { id: '01', symbol: '⌕', name: 'Research a subject', desc: 'Gather evidence, compare sources, and produce a useful brief.', tag: 'RESEARCH', prompt: 'Research this subject thoroughly using the available tools. Break it into focused questions, gather evidence, compare sources, separate facts from uncertainty, and produce a structured brief with sources where available.' },
  { id: '02', symbol: '◫', name: 'Plan a project', desc: 'Turn an outcome into milestones, dependencies, and next actions.', tag: 'PLAN', prompt: 'Act as a project execution agent. Clarify the desired outcome if needed, create milestones and dependencies, then execute the steps that are possible with the available tools. Track what is complete and what is blocked.' },
  { id: '03', symbol: '⌁', name: 'Analyse files', desc: 'Read documents and turn raw information into decisions.', tag: 'ANALYSE', prompt: 'Analyse the attached files as source material. Extract key facts, compare documents, identify inconsistencies, calculate useful metrics where possible, and deliver findings with references to filenames. Do not guess when data is missing.' },
  { id: '04', symbol: '↗', name: 'Run a workflow', desc: 'Coordinate a multi-step task and verify each action.', tag: 'EXECUTE', prompt: 'Execute this workflow end to end using only the tools actually available. First identify the outcome and dependencies, then take actions in order, request approval before consequential external actions, verify each result, and report completed, failed, and blocked steps.' },
];

export function AgentLaunchpad({ onLaunch, onVoice }: { onLaunch: (prompt: string) => void; onVoice?: () => void }) {
  return (
    <div className="agent-home">
      <div className="agent-home-head">
        <div className="agent-eyebrow"><span className="agent-eyebrow-dot" /> AUTONOMOUS WORKSPACE <span className="agent-eyebrow-code">AGENT / 01</span></div>
        <div className="agent-home-hero">
          <div>
            <h1>Give it a<br /><em>mission.</em></h1>
            <p>Don't just ask for an answer. Set the outcome. Your agent can plan the work, use enabled tools, and verify what it actually completes.</p>
          </div>
          <div className="agent-orbit" aria-hidden="true">
            <div className="agent-orbit-ring agent-orbit-ring-a" /><div className="agent-orbit-ring agent-orbit-ring-b" />
            <div className="agent-orbit-core"><span>⌘</span></div><i className="agent-orbit-node agent-orbit-node-a" /><i className="agent-orbit-node agent-orbit-node-b" />
            <small>PLAN<br />→ ACT<br />→ VERIFY</small>
          </div>
        </div>
      </div>
      <div className="agent-capability-row">
        <div><b>01 / PLAN</b><span>Break the outcome into steps</span></div>
        <div><b>02 / EXECUTE</b><span>Use available tools with approval gates</span></div>
        <div><b>03 / VERIFY</b><span>Check results before reporting</span></div>
      </div>
      <div className="agent-mission-heading"><div><span>MISSION TEMPLATES</span><h2>What should get done?</h2></div><small>Choose a workflow or describe your own below.</small></div>
      <div className="agent-mission-grid">
        {jobs.map((job) => <button key={job.id} type="button" onClick={() => onLaunch(job.prompt)} className="agent-mission-card">
          <span className="agent-mission-top"><i>{job.symbol}</i><small>{job.id}</small></span>
          <b>{job.name}<span>↗</span></b><p>{job.desc}</p><em>{job.tag}</em>
        </button>)}
      </div>
      <div className="agent-safety-note"><SparkIcon width={16} height={16} /><span><b>Execution with guardrails.</b> Agent mode uses the tools configured for this app. It asks for confirmation where required and reports unavailable capabilities instead of pretending.</span></div>
      {onVoice && <button type="button" className="agent-voice-entry" onClick={onVoice}>◉ Start a voice mission</button>}
    </div>
  );
}

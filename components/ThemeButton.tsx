'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, MOOD_THEMES, THEME_COUNT, applyTheme, getCurrentTheme, getTheme } from '@/lib/theme';
export function ThemeButton() {
 const [open,setOpen]=useState(false),[current,setCurrent]=useState('obsidian'),[query,setQuery]=useState(''),[ambient,setAmbient]=useState(true);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{setCurrent(getCurrentTheme());try{setAmbient(localStorage.getItem('nl_ambient_glow')!=='off')}catch{};const on=(e:Event)=>setCurrent((e as CustomEvent<string>).detail);window.addEventListener('nameless-theme',on);return()=>window.removeEventListener('nameless-theme',on)},[]);
 useEffect(()=>{document.documentElement.dataset.ambientGlow=ambient?'on':'off';try{localStorage.setItem('nl_ambient_glow',ambient?'on':'off')}catch{}},[ambient]);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>!ref.current?.contains(e.target as Node)&&setOpen(false);const esc=(e:KeyboardEvent)=>e.key==='Escape'&&setOpen(false);document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc)}},[open]);
 const mood=MOOD_THEMES.find(x=>x.id===current);const active=getTheme(current);const activeName=mood?.name||active?.name||'Custom theme';
 const q=query.trim().toLowerCase();const shown=useMemo(()=>q?THEMES.filter(t=>t.name.toLowerCase().includes(q)):THEMES,[q]);
 const grad=(s:readonly string[])=>'linear-gradient(135deg,'+s[0]+','+s[1]+')';
 return <div ref={ref} className="relative">
 <button onClick={()=>setOpen(o=>!o)} aria-label="Change theme" aria-expanded={open} title={'Theme: '+activeName} className="rounded-xl border border-white/10 p-2 transition hover:bg-white/10"><span className="block h-[18px] w-[18px] rounded-full ring-1 ring-white/30" style={{background:mood?grad(mood.swatch):active?grad(active.swatch):'#777'}}/></button>
 {open&&<div className="animate-pop absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-950/95 p-3 text-white shadow-2xl backdrop-blur-xl">
 <div className="mb-3 flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-zinc-500">Theme & mood</p><button onClick={()=>applyTheme(THEMES[Math.floor(Math.random()*THEMES.length)].id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300">🎲 Surprise me</button></div>
 <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Curated moods</p>
 <div className="grid grid-cols-2 gap-2">{MOOD_THEMES.map(t=><button key={t.id} onClick={()=>applyTheme(t.id)} aria-pressed={current===t.id} className={'flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition '+(current===t.id?'border-white/50 bg-white/10':'border-white/10 hover:bg-white/[.06]')}><span className="h-7 w-7 shrink-0 rounded-lg" style={{background:grad(t.swatch)}}/><span className="min-w-0 flex-1">{t.name}</span>{current===t.id&&<span className="text-cyan-300">✓</span>}</button>)}</div>
 <label className="mt-3 flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-xs"><span><b className="block">Ambient glow</b><small className="text-zinc-500">Soft theme-matched canvas light</small></span><input type="checkbox" checked={ambient} onChange={e=>setAmbient(e.target.checked)} className="accent-violet-400"/></label>
 <div className="mt-3 flex items-center justify-between px-1"><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Explore all 390 themes</p><span className="text-[10px] text-zinc-500">{activeName}</span></div>
 <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search: ruby, neon, midnight…" aria-label="Search themes" className="mb-2 mt-2 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-cyan-400/40"/>
 <div className="scroll-thin grid max-h-36 grid-cols-8 gap-2 overflow-y-auto p-1">{shown.map(t=><button key={t.id} onClick={()=>applyTheme(t.id)} title={t.name} aria-label={t.name} aria-pressed={t.id===current} className={'aspect-square rounded-full ring-1 transition hover:scale-110 '+(t.id===current?'ring-2 ring-white':'ring-white/20')} style={{background:grad(t.swatch)}}/>)}</div>
 </div>}
 </div>;
}

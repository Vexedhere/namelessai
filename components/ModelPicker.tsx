'use client';
import { MODELS } from '@/lib/models';
export function ModelPicker({value,onChange,disabled}:{value:string;onChange:(v:string)=>void;disabled?:boolean;tier?:string}){return <select value={value} disabled={disabled} onChange={e=>onChange(e.target.value)} className="rounded-xl border border-white/10 bg-[#151822] p-2 text-sm">{MODELS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>}
export function ModelOrb({size=48}:{model:any;size?:number}){return <div style={{width:size,height:size}} className="rounded-full bg-gradient-to-br from-cyan-400 to-violet-500"/>}
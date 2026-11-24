'use client';
export function ThemeButton(){return <button type="button" className="rounded-xl border border-white/10 p-2" onClick={()=>document.documentElement.classList.toggle('light')}>◐</button>}
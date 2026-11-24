'use client';
import { useEffect, useState } from 'react';
export function AlarmRinger() {
  const [alarm, setAlarm] = useState(false);
  useEffect(() => { const handler = () => setAlarm(true); window.addEventListener('namelessai:alarm', handler); return () => window.removeEventListener('namelessai:alarm', handler); }, []);
  if (!alarm) return null;
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"><div className="rounded-2xl border border-white/10 bg-zinc-900 p-6 text-center"><h2 className="text-xl font-semibold">Alarm</h2><button className="mt-4 rounded-xl bg-white px-4 py-2 text-black" onClick={() => setAlarm(false)}>Dismiss</button></div></div>;
}
export function AlarmsButton() { return <button type="button" title="Alarms" aria-label="Alarms" className="rounded-xl border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent('namelessai:show-alarms'))}>⏰</button>; }

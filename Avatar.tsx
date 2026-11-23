'use client';

import { useEffect, useState } from 'react';

/** Profile picture with graceful fallback (initial for users, silhouette for guests). */
export function Avatar({ name, src, size = 36 }: { name?: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const style = { width: size, height: size };

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        referrerPolicy="no-referrer" // Google avatars refuse requests that carry a referrer
        onError={() => setFailed(true)}
        style={style}
        className="shrink-0 rounded-full object-cover ring-1 ring-white/20"
      />
    );
  }

  if (name) {
    return (
      <span
        aria-hidden
        style={{ ...style, fontSize: size * 0.42 }}
        className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 font-semibold uppercase text-black ring-1 ring-white/20"
      >
        {name.trim().charAt(0) || '?'}
      </span>
    );
  }

  return (
    <span aria-hidden style={style} className="grid shrink-0 place-items-center rounded-full bg-white/10 text-zinc-400 ring-1 ring-white/10">
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
    </span>
  );
}

'use client';

import { memo, useState } from 'react';
import type { Message } from '@/lib/types';
import { getModel } from '@/lib/models';
import { AlertIcon, CheckIcon, CopyIcon, RefreshIcon } from './Icons';
import { Markdown } from './Markdown';
import { ModelOrb } from './ModelPicker';

function MessageViewImpl({
  message,
  streaming,
  canRegenerate,
  onRegenerate,
}: {
  message: Message;
  streaming: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="animate-rise flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.14] to-violet-500/[0.12] px-5 py-3 text-[15px] leading-relaxed text-cyan-50 shadow-lg shadow-black/20">
          {message.content}
        </div>
      </div>
    );
  }

  const model = getModel(message.model ?? '');
  const waiting = streaming && !message.content && !message.error;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="animate-rise flex gap-3.5">
      <div className="pt-1">
        <ModelOrb model={model} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-zinc-500">{model.name}</p>

        {waiting && (
          <div className="flex items-center gap-1.5 py-3" aria-label="Thinking">
            <span className="dot" />
            <span className="dot [animation-delay:150ms]" />
            <span className="dot [animation-delay:300ms]" />
          </div>
        )}

        {message.content && (
          <div className={`text-[15px] leading-7 text-zinc-200 ${streaming ? 'streaming' : ''}`}>
            <Markdown text={message.content} />
          </div>
        )}

        {message.error && (
          <div className="mt-2 flex items-start gap-2.5 rounded-2xl border border-red-400/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
            <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
            <span>{message.error}</span>
          </div>
        )}

        {!streaming && (message.content || message.error) && (
          <div className="mt-2 flex items-center gap-1 text-zinc-500">
            {message.content && (
              <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-white/10 hover:text-white">
                {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {canRegenerate && (
              <button onClick={onRegenerate} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition hover:bg-white/10 hover:text-white">
                <RefreshIcon width={14} height={14} /> Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageView = memo(MessageViewImpl);

import { NextResponse } from 'next/server';

const MODEL_MAP: Record<string, string> = {
  'nameless-ai': 'qwen/qwen-2.5-72b-instruct',
  'pulse-nano': 'meta-llama/llama-3.2-3b-instruct',
  'lyric-flash': 'google/gemini-flash-1.5',
  'vega-mini': 'openai/gpt-4o-mini',
  'aether-pro': 'anthropic/claude-3.5-sonnet',
  'quasar-apex': 'deepseek/deepseek-r1',
};

const SYSTEM_PROMPT = `You are NamelessAI, an advanced custom AI assistant developed by Mythical Studios for the Nameless Labs AI ecosystem. You specialize in clean, modern software engineering, dark glassmorphism UI design, Next.js, Tailwind CSS, Supabase, and direct, high-precision answers.`;

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();

    // Inject NamelessAI persona at the start of the conversation
    const payloadMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    // If a custom Hugging Face / serverless endpoint is configured for 'nameless-ai'
    if (model === 'nameless-ai' && process.env.CUSTOM_MODEL_URL) {
      const customRes = await fetch(process.env.CUSTOM_MODEL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CUSTOM_MODEL_TOKEN || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: payloadMessages }),
      });
      const customData = await customRes.json();
      const customReply = customData.choices?.[0]?.message?.content || customData.generated_text || 'Response received.';
      return NextResponse.json({ reply: customReply });
    }

    const targetModel = MODEL_MAP[model] || 'deepseek/deepseek-chat';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://namelesslabs.ai',
        'X-Title': 'Nameless Labs AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: payloadMessages,
      }),
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated. Check your API key in Vercel settings.';

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

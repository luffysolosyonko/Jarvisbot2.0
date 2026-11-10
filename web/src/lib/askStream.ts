/**
 * Ask Jarvis with the answer streamed in as it's written (POST /ask/stream, Server-
 * Sent Events). `onDelta` gets each new piece of text; the promise resolves with the
 * saved answer, or rejects with an ApiError (the server's code and message).
 *
 * Never hangs: if nothing arrives for `stallMs` (the first piece, or between pieces),
 * the request is cancelled with a clear timeout error.
 */
import { ApiError, authToken } from './api';
import { API_PREFIX, config } from './config';
import type { AskAnswer } from './types';

const STALL_MS = 20_000;

type Event = { event: string; data: string };

/** Split an SSE buffer into complete events, returning what's left over. */
export function parseSse(buffer: string): { events: Event[]; rest: string } {
  const events: Event[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

export async function askStream(
  question: string,
  onDelta: (text: string) => void,
  { stallMs = STALL_MS, fetchImpl = fetch }: { stallMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<AskAnswer> {
  const token = await authToken();
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');

  const controller = new AbortController();
  let timer = window.setTimeout(() => controller.abort(), stallMs);
  const reset = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => controller.abort(), stallMs);
  };
  const timeout = () => new ApiError(0, 'ai_timeout', 'Jarvis took too long to answer. Try again.');

  try {
    let res: Response;
    try {
      res = await fetchImpl(`${config.apiUrl}${API_PREFIX}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw timeout();
      throw new ApiError(0, 'network', "Can't reach the server. Check your connection and try again.");
    }
    if (!res.ok || !res.body) {
      // Refusals before any text (cap, rate limit, not set up) are plain JSON errors.
      const err = ((await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? 'Jarvis couldn’t answer right now. Try again.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (controller.signal.aborted) throw timeout();
        throw new ApiError(0, 'network', 'The connection dropped while Jarvis was answering. Try again.');
      }
      if (chunk.done) break;
      reset();
      buffer += decoder.decode(chunk.value, { stream: true });
      const { events, rest } = parseSse(buffer);
      buffer = rest;
      for (const e of events) {
        const data: unknown = JSON.parse(e.data);
        if (e.event === 'delta' && typeof data === 'string') onDelta(data);
        else if (e.event === 'done') return data as AskAnswer;
        else if (e.event === 'error') {
          const err = data as { code?: string; message?: string };
          throw new ApiError(0, err.code ?? 'error', err.message ?? 'Jarvis couldn’t answer right now. Try again.');
        }
      }
    }
    throw new ApiError(0, 'ai_unavailable', 'Jarvis stopped before finishing. Try again.');
  } finally {
    window.clearTimeout(timer);
  }
}

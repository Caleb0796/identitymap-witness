// Minimal CDP client over Node's native WebSocket (Node >= 21). Zero deps.
// Pattern retyped from measured outpocket harness behavior; nothing imported.

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(`ws connect failed: ${wsUrl}`)); });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej, timer } = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      m.error ? rej(Object.assign(new Error(m.error.message), { cdp: m.error })) : res(m.result);
    } else {
      for (const fn of listeners) fn(m);
    }
  };
  return {
    send(method, params = {}, sessionId, timeoutMs = 15000) {
      const id = ++nextId;
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`CDP timeout: ${method} after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { res, rej, timer });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { try { ws.close(); } catch {} },
  };
}

// By NAME over the WebMCP domain (page-side executeTool(name,…) throws — measured).
// invokeTool returns {invocationId} only; the answer arrives on WebMCP.toolResponded
// {invocationId, status: Completed|Error|Canceled, output, exception}. Unknown name
// is answered -32602 at send time and never produces a toolResponded.
export async function invokeTool(cdp, sessionId, frameId, toolName, input = {}, { timeoutMs = 20000 } = {}) {
  let resolveEv;
  const evP = new Promise((res) => { resolveEv = res; });
  const off = cdp.on((m) => {
    if (m.method === "WebMCP.toolResponded" && m.sessionId === sessionId) resolveEv(m.params);
  });
  const timer = setTimeout(() => resolveEv(null), timeoutMs);
  let invocationId = null;
  try {
    ({ invocationId } = await cdp.send("WebMCP.invokeTool", { frameId, toolName, input }, sessionId, timeoutMs));
  } catch (e) {
    clearTimeout(timer); off();
    return { sendRejected: true, toolName, error: e.message, cdp: e.cdp ?? null, roundTrip: false };
  }
  const ev = await evP;
  clearTimeout(timer); off();
  if (!ev) {
    try { await cdp.send("WebMCP.cancelInvocation", { invocationId }, sessionId, 5000); } catch {}
    return { sendRejected: false, toolName, invocationId, matched: false, status: null, output: null, roundTrip: false };
  }
  return {
    sendRejected: false, toolName, invocationId,
    matched: ev.invocationId === invocationId,
    status: ev.status,
    output: ev.output !== undefined ? ev.output : null,
    exception: ev.exception ?? null,
    roundTrip: ev.invocationId === invocationId && ev.status === "Completed",
  };
}

export function textOf(output) {
  if (output == null) return null;
  if (typeof output === "string") return output;
  const c = output.content?.[0];
  return c?.text ?? JSON.stringify(output);
}

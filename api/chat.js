import gemini from "../src/lib/scrap/ai/gemini.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_PROMPT_LENGTH = 16_000;
const clients = new Map();

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const configured = process.env.ALLOWED_ORIGIN;
  if (configured) return origin === configured;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
  return Boolean(host && origin === `${protocol}://${host}`);
}

function rateLimited(key) {
  const now = Date.now();
  const recent = (clients.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  clients.set(key, recent);
  if (clients.size > 5000) {
    for (const [id, times] of clients) if (!times.some(time => now - time < WINDOW_MS)) clients.delete(id);
  }
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  if (!allowedOrigin(req)) return res.status(403).json({ success: false, error: "Origin not allowed" });
  if (rateLimited(getClientKey(req))) return res.status(429).json({ success: false, error: "طلبات كثيرة جداً. حاول بعد دقيقة." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ success: false, error: "اكتب رسالة أولاً." });
  if (prompt.length > MAX_PROMPT_LENGTH) return res.status(413).json({ success: false, error: "الرسالة أطول من الحد المسموح." });
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 4000) : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 12000) : undefined;

  try {
    res.statusCode=200;res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();
    const emit=(event)=>{if(!res.destroyed&&!res.writableEnded){res.write('data: '+JSON.stringify(event)+'\n\n');res.flush?.();}};
    const result=await gemini.chatStream({prompt,instruction,sessionId},chunk=>emit({type:'chunk',text:chunk}));
    emit({type:'done',sessionId:result.sessionId||null,conversationId:result.conversationId||null,responseId:result.responseId||null,method:result.method||null});return res.end();
  } catch(error) {
    console.error('[Pix Gemini]',error?.message||error);
    if(!res.headersSent)return res.status(502).json({success:false,error:String(error?.message||'تعذر الاتصال بمحرك Gemini.').slice(0,900)});
    res.write('data: '+JSON.stringify({type:'error',error:String(error?.message||'تعذر الاتصال بمحرك Gemini.').slice(0,900)})+'\\n\\n');return res.end();
  }
}

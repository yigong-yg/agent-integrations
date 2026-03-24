import { createServer } from 'node:http';
import { joinChannel, leaveChannel, isConnected, playStream } from './voice.js';

/**
 * Start a minimal HTTP API for programmatic TTS triggering.
 */
export function startApi(port, client, tts) {
  if (!port) return;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const body = await readBody(req);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, { status: 'ok', connected: isConnected() });
      } else if (req.method === 'POST' && url.pathname === '/speak') {
        if (!body.text) return json(res, { error: 'text required' }, 400);
        const stream = await tts.stream(body.text);
        await playStream(stream);
        json(res, { ok: true });
      } else if (req.method === 'POST' && url.pathname === '/join') {
        if (!body.channel_id) return json(res, { error: 'channel_id required' }, 400);
        const guild = client.guilds.cache.first();
        const channel = await guild.channels.fetch(body.channel_id);
        joinChannel(channel);
        json(res, { ok: true });
      } else if (req.method === 'POST' && url.pathname === '/leave') {
        leaveChannel();
        json(res, { ok: true });
      } else {
        json(res, { error: 'not found' }, 404);
      }
    } catch (err) {
      console.error('[api]', err.message);
      json(res, { error: err.message }, 500);
    }
  });

  server.listen(port, () => console.log(`[api] Listening on :${port}`));
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.method !== 'POST') return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}

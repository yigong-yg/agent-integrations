import { createServer } from 'node:http';
import { joinChannel, leaveChannel, isConnected, playStream } from './voice.js';
import { config } from './config.js';

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

/**
 * Start a minimal HTTP API for programmatic TTS triggering.
 * Binds to API_HOST (default 127.0.0.1) for localhost-only access.
 */
export function startApi(client, tts) {
  const { apiPort: port, apiHost: host } = config;
  if (!port) return;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, { status: 'ok', connected: isConnected() });
        return;
      }

      const body = await readBody(req);

      if (req.method === 'POST' && url.pathname === '/speak') {
        if (!body.text) return json(res, { error: 'text required' }, 400);
        const text = body.text.slice(0, config.ttsMaxLength);
        const stream = await tts.stream(text, body.voice_id ? { voiceId: body.voice_id } : {});
        await playStream(stream);
        json(res, { ok: true });
      } else if (req.method === 'POST' && url.pathname === '/join') {
        if (!body.channel_id) return json(res, { error: 'channel_id required' }, 400);
        const guild = await client.guilds.fetch(config.discord.guildId);
        const channel = await guild.channels.fetch(body.channel_id);
        if (!channel?.isVoiceBased?.()) {
          return json(res, { error: 'not a voice channel' }, 400);
        }
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

  server.listen(port, host, () => console.log(`[api] Listening on ${host}:${port}`));
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.method !== 'POST') return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }
  const rawBuf = Buffer.concat(chunks);
  console.log('[api] raw body hex (first 80):', rawBuf.toString('hex').substring(0, 80));
  console.log('[api] raw body utf8:', rawBuf.toString('utf-8'));
  const raw = rawBuf.toString('utf-8');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed.text) {
      console.log('[api] parsed text:', JSON.stringify(parsed.text));
      console.log('[api] text hex:', Buffer.from(parsed.text).toString('hex').substring(0, 40));
    }
    return parsed;
  } catch {
    throw new Error('Invalid JSON');
  }
}

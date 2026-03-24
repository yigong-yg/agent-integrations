# agent-integrations

Cross-platform agent integration toolkit. Bridges AI agents (Alma, custom bots) with messaging platforms via modular, platform-specific relay services.

## Architecture

```
agent-integrations/
├── discord/
│   └── voice-relay/          # Discord Voice Channel TTS relay
├── telegram/                  # (future) Telegram integrations
├── shared/                    # Shared utilities
│   └── tts/                   # TTS client abstraction
├── spec.md
├── package.json               # Monorepo root (npm workspaces)
└── README.md
```

## Module: discord/voice-relay

### Purpose

A standalone Discord bot that receives text, converts it to speech via ElevenLabs streaming API, and plays the audio in a Discord voice channel. Designed to work alongside Alma's text-based Discord bot (Meowfis) — Meowfis handles text replies, voice-relay handles audio playback.

### Flow

```
Meowfis sends text reply in #agents
        │
        ▼
voice-relay detects the message (watches for bot messages)
        │
        ▼
Text → ElevenLabs Streaming API → audio stream (mp3)
        │
        ▼
ffmpeg (mp3 → opus/pcm) → Discord Voice Connection → Voice Channel
```

### Trigger Modes

1. **Auto mode** (default): voice-relay watches a configured text channel for messages from a specific bot user ID (Meowfis). Every bot message triggers TTS playback.
2. **Command mode**: Users type `!speak <text>` or `!join`/`!leave` to control the bot manually.
3. **API mode**: HTTP endpoint `POST /speak` accepts `{ text, channel_id }` for programmatic triggering (e.g., from Alma plugins or cron jobs).

### Core Dependencies

| Package | Purpose |
|---------|---------|
| `discord.js` ^14 | Discord API client |
| `@discordjs/voice` ^0.18 | Voice channel connection |
| `@discordjs/opus` or `opusscript` | Opus encoding for Discord |
| `ffmpeg-static` | Bundled ffmpeg for audio transcoding |
| `prism-media` | Audio stream pipeline (ffmpeg ↔ opus) |
| `elevenlabs` | Official ElevenLabs SDK (streaming TTS) |
| `dotenv` | Environment config |

### Configuration (.env)

```env
# Discord
DISCORD_BOT_TOKEN=           # Can be same token as Meowfis or a separate bot
DISCORD_GUILD_ID=            # Server ID
DISCORD_VOICE_CHANNEL_ID=   # Voice channel to join
DISCORD_TEXT_CHANNEL_ID=     # Text channel to watch (e.g., #agents)
DISCORD_WATCH_BOT_ID=       # Bot user ID to watch for messages (Meowfis)

# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=         # Default voice
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# Behavior
AUTO_JOIN=true               # Auto-join voice channel on startup
AUTO_SPEAK=true              # Auto-speak bot messages
TTS_MAX_LENGTH=500           # Max characters per TTS request
API_PORT=3100                # HTTP API port (0 to disable)
```

### Key Design Decisions

1. **No local file storage**: Audio streams directly from ElevenLabs → ffmpeg → Discord. No temp files written to disk. Uses Node.js streams/pipes throughout.

2. **Separate bot token recommended**: Using a different bot token from Meowfis avoids permission conflicts and makes it clear which bot is "speaking". But sharing a token works too.

3. **Graceful voice handling**:
   - Auto-disconnect after N seconds of silence (configurable, default 300s)
   - Queue system for overlapping TTS requests (FIFO)
   - Skip current playback with `!skip` command

4. **ElevenLabs streaming**: Use the streaming endpoint (`/v1/text-to-speech/{voice_id}/stream`) to minimize latency. Audio starts playing before the full response is generated.

### API Endpoints (when API_PORT > 0)

```
POST /speak
  Body: { "text": "string", "channel_id"?: "string" }
  → Triggers TTS in voice channel

POST /join
  Body: { "channel_id": "string" }
  → Joins specified voice channel

POST /leave
  → Leaves current voice channel

GET /health
  → { "status": "ok", "connected": true, "channel": "..." }
```

### Discord Commands

| Command | Description |
|---------|-------------|
| `!join` | Bot joins your current voice channel |
| `!leave` | Bot leaves voice channel |
| `!speak <text>` | Manually trigger TTS |
| `!skip` | Skip current audio playback |
| `!voice <voice_id>` | Change ElevenLabs voice |
| `!volume <0-100>` | Adjust playback volume |

### Error Handling

- ElevenLabs API failure → log error, send text fallback in channel ("TTS unavailable")
- Voice connection drop → attempt reconnect 3 times with backoff, then idle
- ffmpeg crash → restart pipeline for next request
- Rate limiting → queue with backoff, respect ElevenLabs rate limits

### Resource Limits

- ElevenLabs free tier: 10,000 chars/month — sufficient for low-traffic testing
- ElevenLabs Starter: $5/mo, 30,000 chars/month
- Audio memory: ~2-5MB per active stream, no disk usage
- Discord voice: one connection per guild

---

## Module: shared/tts

### Purpose

Abstracted TTS client that can be reused across integrations. Supports multiple providers behind a unified interface.

### Interface

```typescript
interface TTSClient {
  stream(text: string, options?: TTSOptions): Promise<Readable>;
}

interface TTSOptions {
  voiceId?: string;
  modelId?: string;
  language?: string;
}
```

### Providers

1. **ElevenLabs** (implemented first)
2. **Edge TTS** (free, Microsoft — future)
3. **Local Whisper/Piper** (offline — future)

---

## Future Modules

### telegram/voice-relay
Same concept as Discord voice-relay but for Telegram voice messages. Alma already has Telegram bridge support — this would enhance it with higher quality TTS via ElevenLabs streaming instead of the built-in TTS.

### discord/music-relay
Play music/ambient audio in voice channels, controlled via text commands or Alma agent.

---

## Development

```bash
# Install all workspaces
npm install

# Run discord voice-relay in dev mode
npm run dev -w discord/voice-relay

# Run with specific env
cp discord/voice-relay/.env.example discord/voice-relay/.env
# Edit .env with your tokens
npm run dev -w discord/voice-relay
```

## Deployment

Each module is independently deployable. For discord/voice-relay:
- **Local**: `npm start -w discord/voice-relay` (runs alongside Alma on same machine)
- **VPS**: Any Node.js 18+ host. Needs outbound internet for Discord + ElevenLabs APIs.
- **Docker**: Dockerfile provided per module (future)

## License

MIT

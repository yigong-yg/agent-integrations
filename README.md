# agent-integrations

Cross-platform integration blocks for AI agents.

`agent-integrations` turns text-first agents into platform-native experiences. Instead of coupling one agent runtime to one chat surface, this repo treats integrations as composable relays: Discord today, more transports tomorrow, shared streaming utilities underneath.

The first production path is a Discord voice relay for `Meowfis`, powered by Alma and ElevenLabs. Meowfis owns the conversation. The relay watches the final stabilized reply, converts it to speech, and speaks it in a Discord voice channel with a zero-temp-file streaming pipeline.

## Why This Exists

Most agent systems are great at generating text and weak at delivery.

This project is built around a simple idea:

- Agent providers should focus on reasoning.
- Integration services should focus on transport, voice, presence, and platform behavior.
- Shared infrastructure should handle streaming, provider abstraction, and reliability patterns.

That separation makes the system easier to evolve. You can swap the agent provider, the TTS provider, or the platform surface without rewriting the whole stack.

## What It Can Become

This repository is intentionally provider-agnostic.

It can sit behind:

- Alma
- Anthropic / Claude-based agents
- OpenAI-based agents
- Gemini-based agents
- Local LLM runtimes
- Custom orchestration layers and tool-calling systems

As long as an agent can produce finalized text or call a local API, it can plug into this architecture.

## Current Implementation

The repo is organized as an npm workspace monorepo.

| Module | Status | Purpose |
|---|---|---|
| `shared/tts` | Implemented | Streaming TTS abstraction, currently using ElevenLabs over direct REST streaming |
| `discord/voice-relay` | Implemented | Discord bot that turns finalized agent replies into live voice playback |
| `telegram/voice-relay` | Planned | Telegram voice delivery using the same shared TTS layer |
| `discord/music-relay` | Planned | Ambient audio or music playback controlled by agents or text commands |

## Architecture

The system is split into clean layers:

```text
Agent Provider / Orchestrator
  Alma, Claude, OpenAI, Gemini, local models, custom runners
                │
                ▼
Message Finalization Layer
  Detect when a streamed response is truly finished
                │
                ▼
Integration Relay
  Discord voice relay today, more surfaces later
                │
                ▼
Shared Utilities
  TTS providers, stream handling, future retry/fallback logic
                │
                ▼
Platform Delivery
  Discord voice, Telegram voice, future messaging transports
```

This keeps responsibilities narrow:

- The agent runtime generates content.
- The relay decides when content is stable enough to ship.
- The TTS layer turns text into audio streams.
- The platform adapter handles delivery semantics.

## Discord Voice Relay

The first module is a dedicated Discord speaker bot for a single private guild.

### Runtime Model

- `Meowfis` posts a placeholder reply in a text channel.
- Alma streams the response by editing that same Discord message.
- The voice relay watches `messageCreate` and `messageUpdate`.
- Every edit resets a debounce timer.
- When the message stops changing for about 2 seconds, the relay captures the final text.
- The final text is streamed to ElevenLabs.
- `ffmpeg` converts streamed MP3 to Discord-compatible audio.
- The bot plays the result in the configured voice channel.

```text
Meowfis placeholder
        │
        ▼
streamed message edits
        │
        ▼
debounce until stable
        │
        ▼
final text
        │
        ▼
ElevenLabs streaming TTS
        │
        ▼
ffmpeg transcode
        │
        ▼
Discord voice playback
```

### Why This Design Works

- It avoids speaking half-finished sentences.
- It matches how modern agent bridges stream output in real time.
- It keeps the voice bot independent from the text bot.
- It works without temporary audio files.
- It keeps the API local-first and operationally simple.

## Design Principles

### Streaming First

Audio is streamed end to end. The system does not write temp files to disk. That reduces latency, keeps the pipeline clean, and fits well with real-time agent output.

### Finalized Output, Not Token Noise

Agent output should be delivered when it is semantically complete, not while the model is still reshaping the sentence. The debounce-based finalization model is critical for voice quality.

### Platform Modules, Shared Core

Platform adapters should stay thin. Shared logic like TTS clients and stream utilities belongs in reusable packages.

### Local-First Control Plane

The current HTTP control path is designed for same-machine invocation. That keeps the trust boundary small and makes Alma-to-relay orchestration simple.

### Operational Simplicity

This repo intentionally prefers a simple, single-guild deployment for the first release. That means fewer moving parts, fewer ambiguous routing decisions, and faster time to useful behavior.

## Redundancy and Resilience

This project is not trying to be complex on day one, but it is designed so redundancy can be added in clean layers.

| Concern | Current Approach | Future Block |
|---|---|---|
| Agent delivery stability | Debounce on `messageUpdate` until output is stable | Explicit final-response hooks from providers or bridges |
| TTS provider dependency | ElevenLabs streaming | Fallback providers such as Edge TTS or local Piper |
| Discord bot identity | Dedicated `Meowfis Voice` bot | Hot spare bot identity if the primary token is rotated or disabled |
| Playback path | Single in-process queue for one guild | Externalized job queue or active/passive relay workers |
| Control plane exposure | Localhost-only API | Authenticated remote API if external callers are added |
| Runtime recovery | Process-local reconnect and replay behavior | Supervisor-managed restart, health probes, circuit breakers |

The important point is that redundancy is planned as modular blocks, not as tightly coupled special cases.

## Repo Layout

```text
agent-integrations/
├── discord/
│   └── voice-relay/      # Discord voice relay for finalized agent replies
├── shared/
│   └── tts/              # Shared TTS abstraction and provider implementations
├── spec.md               # Working architecture and behavior spec
├── package.json          # Workspace root
└── README.md
```

## Local Development

Recommended runtime:

- Windows
- Node.js `v22.18.0`
- npm workspaces

Install all workspaces:

```bash
npm install
```

Create `discord/voice-relay/.env` from `discord/voice-relay/.env.example`, then fill in:

- Discord bot token for the dedicated voice bot
- Guild, text channel, and voice channel IDs
- The watched Meowfis bot user ID
- ElevenLabs API key and voice configuration

Run the voice relay:

```bash
npm run dev:voice
```

Or in normal mode:

```bash
npm run start:voice
```

## HTTP and Command Surfaces

The Discord voice relay supports three control paths:

- Automatic speech from finalized Meowfis replies
- Discord commands such as `!join`, `!leave`, `!speak`, and `!skip`
- A localhost HTTP API for Alma-side orchestration

The HTTP API is intentionally local-only by default:

- `API_HOST=127.0.0.1`
- `API_PORT=3100`

This keeps the first deployment simple and safe. If remote callers are added later, authentication should be added before widening the bind address.

## Why This Is Bigger Than One Bot

The long-term value here is not just "Discord voice for one agent."

The real asset is a reusable integration architecture:

- one agent can gain multiple delivery surfaces
- one platform can support multiple providers
- one TTS layer can serve multiple relays
- one local orchestrator can coordinate the whole system

That makes `agent-integrations` useful far beyond Alma or Meowfis. It is a pattern for turning model output into reliable, human-facing presence.

## Roadmap

Near-term priorities:

- harden the Discord voice pipeline
- complete end-to-end local testing
- tighten queue, skip, and cleanup behavior
- keep the spec and implementation fully aligned

Future expansion:

- Telegram voice relay
- additional TTS providers
- authenticated remote control plane
- richer health reporting and supervision
- more platform-native relay modules

## Status

The repository is in active build-and-test mode.

The architectural direction is stable:

- single-guild first
- dedicated speaker bot
- final-text voice delivery
- streaming audio pipeline
- provider-agnostic integration model

## License

MIT
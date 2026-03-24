import 'dotenv/config';

export const config = {
  discord: {
    token: env('DISCORD_BOT_TOKEN'),
    guildId: env('DISCORD_GUILD_ID'),
    voiceChannelId: env('DISCORD_VOICE_CHANNEL_ID', ''),
    textChannelId: env('DISCORD_TEXT_CHANNEL_ID', ''),
    watchBotId: env('DISCORD_WATCH_BOT_ID', ''),
  },
  elevenlabs: {
    apiKey: env('ELEVENLABS_API_KEY'),
    voiceId: env('ELEVENLABS_VOICE_ID', ''),
    modelId: env('ELEVENLABS_MODEL_ID', 'eleven_multilingual_v2'),
  },
  autoJoin: env('AUTO_JOIN', 'true') === 'true',
  autoSpeak: env('AUTO_SPEAK', 'true') === 'true',
  ttsMaxLength: intEnv('TTS_MAX_LENGTH', 500),
  messageDebounceMs: intEnv('MESSAGE_DEBOUNCE_MS', 2000),
  apiHost: env('API_HOST', '127.0.0.1'),
  apiPort: intEnv('API_PORT', 3100),
};

function env(key, fallback) {
  const val = process.env[key];
  if (val === undefined && fallback === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val ?? fallback;
}

function intEnv(key, fallback) {
  const raw = env(key, String(fallback));
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Env var ${key} must be a number, got: ${raw}`);
  }
  return n;
}

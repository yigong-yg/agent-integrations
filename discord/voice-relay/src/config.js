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
  ttsMaxLength: parseInt(env('TTS_MAX_LENGTH', '500'), 10),
  apiPort: parseInt(env('API_PORT', '3100'), 10),
};

function env(key, fallback) {
  const val = process.env[key];
  if (val === undefined && fallback === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return val ?? fallback;
}

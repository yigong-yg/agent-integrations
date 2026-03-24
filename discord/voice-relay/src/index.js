import { Client, GatewayIntentBits } from 'discord.js';
import { ElevenLabsTTS } from '@agent-integrations/tts';
import { config } from './config.js';
import { joinChannel } from './voice.js';
import { handleCommand, speakText } from './commands.js';
import { startApi } from './api.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

const tts = new ElevenLabsTTS({
  apiKey: config.elevenlabs.apiKey,
  voiceId: config.elevenlabs.voiceId,
  modelId: config.elevenlabs.modelId,
});

// Track debounce timers and last-seen content per message ID
const pendingMessages = new Map();
// Track message IDs that have already been spoken
const spokenMessages = new Set();

client.once('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);

  if (config.autoJoin && config.discord.voiceChannelId) {
    try {
      const guild = await client.guilds.fetch(config.discord.guildId);
      const channel = await guild.channels.fetch(config.discord.voiceChannelId);
      if (channel?.isVoiceBased?.()) {
        joinChannel(channel);
      } else {
        console.error('[bot] Configured voice channel is not a voice channel');
      }
    } catch (err) {
      console.error('[bot] Failed to auto-join:', err.message);
    }
  }

  startApi(client, tts);
});

client.on('messageCreate', async (message) => {
  // Ignore own messages (this bot is Meowfis Voice, separate from Meowfis)
  if (message.author.id === client.user.id) return;

  // Handle !commands from any user
  const wasCommand = await handleCommand(message, tts);
  if (wasCommand) return;

  // Auto-speak: Meowfis posts a placeholder then streams edits.
  // Start debounce tracking on messageCreate for the watched bot.
  if (shouldWatch(message)) {
    trackMessage(message);
  }
});

client.on('messageUpdate', (_old, message) => {
  // message may be partial if not cached; ignore partials without content
  if (!message.content) return;
  if (shouldWatch(message)) {
    trackMessage(message);
  }
});

/**
 * Whether this message should be tracked for auto-speak.
 */
function shouldWatch(message) {
  return (
    config.autoSpeak &&
    config.discord.watchBotId &&
    message.author?.id === config.discord.watchBotId &&
    (!config.discord.textChannelId || message.channel.id === config.discord.textChannelId)
  );
}

/**
 * Track a message for debounced TTS.
 * Resets the debounce timer each time the content changes.
 * Once stable for MESSAGE_DEBOUNCE_MS, speaks the final text exactly once.
 */
function trackMessage(message) {
  const id = message.id;
  const text = message.content?.trim();

  // Ignore empty placeholders
  if (!text) return;

  // Already spoken — don't re-speak
  if (spokenMessages.has(id)) return;

  const existing = pendingMessages.get(id);

  // Ignore duplicate unchanged updates
  if (existing && existing.text === text) return;

  // Clear previous timer
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingMessages.delete(id);
    spokenMessages.add(id);
    // Prevent unbounded growth: cap at 1000 entries
    if (spokenMessages.size > 1000) {
      const first = spokenMessages.values().next().value;
      spokenMessages.delete(first);
    }
    console.log(`[bot] Auto-speaking: "${text.slice(0, 80)}..."`);
    speakText(text, tts, null);
  }, config.messageDebounceMs);

  pendingMessages.set(id, { text, timer });
}

client.login(config.discord.token);

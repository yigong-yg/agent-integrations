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

client.once('ready', async () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);

  // Auto-join voice channel on startup
  if (config.autoJoin && config.discord.voiceChannelId) {
    try {
      const guild = await client.guilds.fetch(config.discord.guildId);
      const channel = await guild.channels.fetch(config.discord.voiceChannelId);
      joinChannel(channel);
    } catch (err) {
      console.error('[bot] Failed to auto-join:', err.message);
    }
  }

  // Start HTTP API
  startApi(config.apiPort, client, tts);
});

client.on('messageCreate', async (message) => {
  // Ignore own messages
  if (message.author.id === client.user.id) return;

  // Handle !commands from any user
  const wasCommand = await handleCommand(message, tts);
  if (wasCommand) return;

  // Auto-speak: watch for messages from the target bot (Meowfis)
  if (
    config.autoSpeak &&
    config.discord.watchBotId &&
    message.author.id === config.discord.watchBotId &&
    (!config.discord.textChannelId || message.channel.id === config.discord.textChannelId)
  ) {
    const text = message.content?.trim();
    if (text) {
      console.log(`[bot] Auto-speaking: "${text.slice(0, 50)}..."`);
      await speakText(text, tts, message);
    }
  }
});

client.login(config.discord.token);

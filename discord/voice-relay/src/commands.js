import { joinChannel, leaveChannel, skip, playStream } from './voice.js';
import { config } from './config.js';

const PREFIX = '!';

/**
 * Handle text commands (!join, !leave, !speak, !skip).
 * Returns true if the message was a command, false otherwise.
 */
export async function handleCommand(message, tts) {
  if (!message.content.startsWith(PREFIX)) return false;

  const [cmd, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);

  switch (cmd.toLowerCase()) {
    case 'join': {
      const channel = message.member?.voice?.channel;
      if (!channel) {
        await message.reply('You need to be in a voice channel.');
        return true;
      }
      joinChannel(channel);
      await message.reply(`Joined **${channel.name}**`);
      return true;
    }

    case 'leave':
      leaveChannel();
      await message.reply('Left voice channel.');
      return true;

    case 'speak': {
      const text = args.join(' ');
      if (!text) {
        await message.reply('Usage: `!speak <text>`');
        return true;
      }
      await speakText(text, tts, message);
      return true;
    }

    case 'skip':
      skip();
      await message.reply('Skipped.');
      return true;

    default:
      return false;
  }
}

/**
 * Speak text via TTS in the voice channel.
 */
export async function speakText(text, tts, replyTarget) {
  const truncated = text.slice(0, config.ttsMaxLength);
  try {
    const stream = await tts.stream(truncated);
    await playStream(stream);
  } catch (err) {
    console.error('[tts] Error:', err.message);
    if (replyTarget) {
      await replyTarget.reply(`TTS unavailable: ${err.message}`).catch(() => {});
    }
  }
}

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from '@discordjs/voice';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

let connection = null;
const player = createAudioPlayer();
const queue = [];
let isPlaying = false;

/**
 * Join a voice channel.
 */
export function joinChannel(channel) {
  connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  connection.subscribe(player);

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      connection.destroy();
      connection = null;
    }
  });

  console.log(`[voice] Joined ${channel.name}`);
  return connection;
}

/**
 * Leave the current voice channel.
 */
export function leaveChannel() {
  if (connection) {
    connection.destroy();
    connection = null;
    console.log('[voice] Left channel');
  }
}

/**
 * Queue an mp3 audio stream for playback.
 * The stream is piped through ffmpeg to convert to opus — no temp files.
 */
export async function playStream(mp3Stream) {
  return new Promise((resolve, reject) => {
    if (!connection) {
      reject(new Error('Not connected to a voice channel'));
      return;
    }

    queue.push({ mp3Stream, resolve, reject });
    if (!isPlaying) processQueue();
  });
}

/**
 * Skip current playback.
 */
export function skip() {
  player.stop(true);
}

export function isConnected() {
  return connection !== null;
}

async function processQueue() {
  if (queue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const { mp3Stream, resolve, reject } = queue.shift();

  try {
    // ffmpeg: mp3 stdin → raw s16le pcm stdout (no temp files)
    const ffmpeg = spawn(ffmpegPath, [
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'ignore'] });

    mp3Stream.pipe(ffmpeg.stdin);

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
    });

    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
      resolve();
      processQueue();
    });

    player.once('error', (err) => {
      console.error('[voice] Player error:', err.message);
      reject(err);
      processQueue();
    });
  } catch (err) {
    reject(err);
    processQueue();
  }
}

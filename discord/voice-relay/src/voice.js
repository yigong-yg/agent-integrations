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
let processing = false;
let currentFfmpeg = null;

// Global diagnostics — log all player state transitions and errors
player.on('stateChange', (oldState, newState) => {
  console.log(`[voice] player: ${oldState.status} → ${newState.status}`);
});
player.on('error', (err) => {
  console.error('[voice] player error:', err.message);
  console.error('[voice] resource playbackDuration:', err.resource?.playbackDuration);
});

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

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[voice] conn: ${oldState.status} → ${newState.status}`);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch {
      cleanup();
    }
  });

  console.log(`[voice] Joined ${channel.name}`);
  return connection;
}

/**
 * Leave the current voice channel.
 */
export function leaveChannel() {
  cleanup();
  console.log('[voice] Left channel');
}

/**
 * Queue an mp3 audio stream for playback.
 * The stream is piped through ffmpeg to convert to raw PCM — no temp files.
 */
export async function playStream(mp3Stream) {
  return new Promise((resolve, reject) => {
    if (!connection) {
      reject(new Error('Not connected to a voice channel'));
      return;
    }
    queue.push({ mp3Stream, resolve, reject });
    if (!processing) processQueue();
  });
}

/**
 * Skip current playback and kill in-flight resources.
 */
export function skip() {
  killCurrentFfmpeg();
  player.stop(true);
}

export function isConnected() {
  return connection !== null;
}

function killCurrentFfmpeg() {
  if (currentFfmpeg) {
    currentFfmpeg.stdin.destroy();
    currentFfmpeg.stdout.destroy();
    currentFfmpeg.kill('SIGKILL');
    currentFfmpeg = null;
  }
}

function cleanup() {
  killCurrentFfmpeg();
  player.stop(true);
  while (queue.length > 0) {
    const job = queue.shift();
    job.mp3Stream.destroy?.();
    job.reject(new Error('Voice connection lost'));
  }
  processing = false;
  if (connection) {
    connection.destroy();
    connection = null;
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const { mp3Stream, resolve, reject } = queue.shift();

    if (!connection) {
      mp3Stream.destroy?.();
      reject(new Error('Not connected to a voice channel'));
      continue;
    }

    try {
      await playOne(mp3Stream);
      resolve();
    } catch (err) {
      reject(err);
    }
  }

  processing = false;
}

function playOne(mp3Stream) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-f', 'mp3',
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    ffmpeg.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg && !msg.startsWith('size=') && !msg.includes('build')) {
        console.error('[ffmpeg]', msg);
      }
    });

    currentFfmpeg = ffmpeg;

    mp3Stream.pipe(ffmpeg.stdin);
    mp3Stream.on('error', () => ffmpeg.stdin.destroy());
    ffmpeg.stdin.on('error', () => {});

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });

    console.log('[voice] resource created, readable:', resource.readable, 'ended:', resource.ended);
    console.log('[voice] conn status:', connection?.state?.status);
    player.play(resource);

    const onStateChange = (_oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle) {
        done();
        resolve();
      }
    };
    const onError = (err) => {
      done();
      killCurrentFfmpeg();
      reject(err);
    };
    function done() {
      player.removeListener('stateChange', onStateChange);
      player.removeListener('error', onError);
      currentFfmpeg = null;
    }

    player.on('stateChange', onStateChange);
    player.on('error', onError);
  });
}

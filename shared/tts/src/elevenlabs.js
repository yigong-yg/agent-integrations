import { Readable } from 'node:stream';

const BASE_URL = 'https://api.elevenlabs.io/v1';

export class ElevenLabsTTS {
  #apiKey;
  #defaultVoiceId;
  #defaultModelId;

  constructor({ apiKey, voiceId, modelId }) {
    if (!apiKey) throw new Error('ElevenLabs API key is required');
    this.#apiKey = apiKey;
    this.#defaultVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Bella
    this.#defaultModelId = modelId || 'eleven_v3';
  }

  /**
   * Stream TTS audio from ElevenLabs.
   * Returns a Readable stream of mp3 audio data (no temp files).
   */
  async stream(text, options = {}) {
    const voiceId = options.voiceId || this.#defaultVoiceId;
    const modelId = options.modelId || this.#defaultModelId;

    // Escape non-ASCII to \uXXXX so the JSON body is pure ASCII,
    // avoiding Windows codepage issues with Node.js fetch/undici.
    const jsonBody = JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }).replace(/[\u0080-\uFFFF]/g, (ch) =>
      '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
    );

    console.log('[tts] text to send:', JSON.stringify(text));
    console.log('[tts] text bytes:', Buffer.from(text).toString('hex').substring(0, 40));
    console.log('[tts] jsonBody (first 120):', jsonBody.substring(0, 120));

    const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.#apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: jsonBody,
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('audio')) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`ElevenLabs error ${res.status} (${contentType}): ${err}`);
    }

    // Buffer the full audio response before returning.
    // Streaming chunks from ElevenLabs can hit incomplete boundaries
    // that cause ffmpeg decode errors. For short TTS this adds minimal
    // latency but is much more stable.
    const arrayBuf = await res.arrayBuffer();
    return Readable.from(Buffer.from(arrayBuf));
  }
}

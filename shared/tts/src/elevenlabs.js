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
    this.#defaultModelId = modelId || 'eleven_multilingual_v2';
  }

  /**
   * Stream TTS audio from ElevenLabs.
   * Returns a Readable stream of mp3 audio data (no temp files).
   */
  async stream(text, options = {}) {
    const voiceId = options.voiceId || this.#defaultVoiceId;
    const modelId = options.modelId || this.#defaultModelId;

    const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.#apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
    }

    // Convert web ReadableStream to Node Readable
    return Readable.fromWeb(res.body);
  }
}

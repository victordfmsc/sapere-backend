const fetch = require('node-fetch');
const { getEnv } = require('../env');

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const MODEL_ID = 'eleven_multilingual_v2';
// eleven_multilingual_v2 admite 10.000 caracteres por petición; se trocea con margen.
const MAX_CHUNK_CHARS = 4000;

function splitLong(text, limit) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('. ', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function chunkText(text, limit = MAX_CHUNK_CHARS) {
  const paragraphs = String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const pieces = paragraph.length > limit ? splitLong(paragraph, limit) : [paragraph];
    for (const piece of pieces) {
      if (!current) {
        current = piece;
      } else if (current.length + 2 + piece.length <= limit) {
        current = `${current}\n\n${piece}`;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesizeChunk({ text, voiceId, previousText, nextText }) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': getEnv('ELEVENLABS_API_KEY'),
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      ...(previousText ? { previous_text: previousText.slice(-500) } : {}),
      ...(nextText ? { next_text: nextText.slice(0, 500) } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs API error ${response.status}: ${body.slice(0, 200) || response.statusText}`);
  }

  return response.buffer();
}

async function generateAudio(text, options = {}) {
  const voiceId = (options.voiceId && String(options.voiceId).trim()) || DEFAULT_VOICE_ID;
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error('No text to synthesize');

  const buffers = [];
  let activeVoice = voiceId;
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[ElevenLabs] chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars, voice ${activeVoice})`);
    const params = {
      text: chunks[i],
      voiceId: activeVoice,
      previousText: i > 0 ? chunks[i - 1] : undefined,
      nextText: i < chunks.length - 1 ? chunks[i + 1] : undefined,
    };
    try {
      buffers.push(await synthesizeChunk(params));
    } catch (err) {
      const voiceProblem = activeVoice !== DEFAULT_VOICE_ID && /voice/i.test(err.message) && /error (400|404|422)/.test(err.message);
      if (!voiceProblem) throw err;
      console.warn(`[ElevenLabs] voice ${activeVoice} rejected, falling back to default voice`);
      activeVoice = DEFAULT_VOICE_ID;
      buffers.push(await synthesizeChunk({ ...params, voiceId: activeVoice }));
    }
  }
  return Buffer.concat(buffers);
}

module.exports = { generateAudio, chunkText, DEFAULT_VOICE_ID };

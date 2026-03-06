const fetch = require('node-fetch');

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Default voice

async function generateAudio(text) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.statusText}`);
  }
  
  return response.buffer();
}

module.exports = { generateAudio };

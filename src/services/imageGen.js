const fetch = require('node-fetch');
const { getEnv } = require('../env');

// api-inference.huggingface.co fue retirado; la Inference API vive ahora en router.huggingface.co.
const HF_URL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

async function generateCover(prompt, type) {
  let imagePrompt;

  if (type === 'documentary') {
    imagePrompt = `Cinematic editorial cover for a documentary about ${prompt}. Dark moody lighting, dramatic composition, no text, 4K quality.`;
  } else {
    imagePrompt = 'Ancient mystical manuscript background with arcane golden symbols, magical parchment texture, ethereal glow, dark atmospheric mood, vertical format, no text.';
  }

  const response = await fetch(HF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getEnv('HF_TOKEN')}`,
    },
    body: JSON.stringify({
      inputs: imagePrompt,
      parameters: {
        num_inference_steps: 4,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HuggingFace API error ${response.status}: ${body.slice(0, 200) || response.statusText}`);
  }

  return response.buffer();
}

module.exports = { generateCover };

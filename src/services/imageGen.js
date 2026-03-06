const fetch = require('node-fetch');

async function generateCover(prompt, type) {
  let imagePrompt;
  
  if (type === 'documentary') {
    imagePrompt = `Cinematic editorial cover for a documentary about ${prompt}. Dark moody lighting, dramatic composition, no text, 4K quality.`;
  } else {
    imagePrompt = 'Ancient mystical manuscript background with arcane golden symbols, magical parchment texture, ethereal glow, dark atmospheric mood, vertical format, no text.';
  }
  
  const response = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HF_TOKEN}`,
    },
    body: JSON.stringify({
      inputs: imagePrompt,
      parameters: {
        num_inference_steps: 4,
      },
    }),
  });
  
  if (!response.ok) {
    throw new Error(`HuggingFace API error: ${response.statusText}`);
  }
  
  return response.buffer();
}

module.exports = { generateCover };

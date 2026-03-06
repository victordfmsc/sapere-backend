const fetch = require('node-fetch');
const { getRandomFramework } = require('../prompts');

async function generateTitle(prompt, genre) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a creative title generator for audio documentaries. Generate ONLY the title, nothing else. No quotes, no extra text.' },
        { role: 'user', content: `Generate the title in Spanish language for a ${genre} documentary about: ${prompt}` }
      ],
      max_tokens: 100,
      temperature: 0.9,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function generateScript(prompt, type, systemPrompt) {
  const maxTokens = type === 'preview' ? 300 : 8192;
  const framework = systemPrompt || getRandomFramework();
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: framework },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: 1.4,
      frequency_penalty: 1.5,
      presence_penalty: 0.3,
    }),
  });
  
  const data = await response.json();
  let script = data.choices[0].message.content;
  
  // Clean script
  script = script.replace(/[#*]/g, '').replace(/â/g, '—').trim();
  
  // Split into paragraphs
  const paragraphs = script.split('\n\n').filter(p => p.trim().length > 0);
  
  return { script, paragraphs };
}

module.exports = { generateTitle, generateScript };

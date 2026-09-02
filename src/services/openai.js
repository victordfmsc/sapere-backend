const fetch = require('node-fetch');
const { getRandomFramework } = require('../prompts');
const { getEnv } = require('../env');

async function chatCompletion(body) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getEnv('OPENAI_API_KEY')}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data && data.error && data.error.message ? data.error.message : response.statusText;
    throw new Error(`OpenAI API error ${response.status}: ${detail}`);
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenAI returned an empty completion');
  return content;
}

async function generateTitle(prompt, genre, language) {
  const lang = language || 'the same language as the topic';
  const content = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a creative title generator for audio documentaries. Generate ONLY the title, nothing else. No quotes, no extra text.' },
      { role: 'user', content: `Generate the title in ${lang} for a ${genre} documentary about: ${prompt}` }
    ],
    max_tokens: 100,
    temperature: 0.9,
  });
  return content.trim();
}

async function generateScript(prompt, type, systemPrompt) {
  const maxTokens = type === 'preview' ? 300 : 8192;
  const framework = (systemPrompt && systemPrompt !== 'null') ? systemPrompt : getRandomFramework();

  const raw = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: framework },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 1.4,
    frequency_penalty: 1.5,
    presence_penalty: 0.3,
  });

  // Clean script
  const script = raw.replace(/[#*]/g, '').replace(/â/g, '—').trim();

  // Split into paragraphs
  const paragraphs = script.split('\n\n').filter(p => p.trim().length > 0);

  return { script, paragraphs };
}

module.exports = { generateTitle, generateScript };

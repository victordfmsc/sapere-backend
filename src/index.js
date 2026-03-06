const express = require('express');
const { initFirebase, getDb } = require('./firebase');
const { generateQueue } = require('./queues');
const { generateTitle } = require('./services/openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

initFirebase();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/generate', async (req, res) => {
  try {
    const { userId, prompt, genre, type = 'documentary', systemPrompt, ...rest } = req.body;
    
    const db = getDb();
    const docRef = await db.collection('sapere').add({
      uId: userId,
      bukbukName: '',
      bukbukUrl: '',
      newCover: '',
      coverImage: '',
      description: [],
      language: rest.language || 'Spanish',
      languageCode: rest.languageCode || 'es_ES',
      type,
      publishTime: new Date(),
      bukbukId: rest.bukbukId || '',
      bukbukCategoryId: rest.bukbukCategoryId || '',
      bukbukTypeNames: rest.bukbukTypeNames || {},
      bukbukCategoryNames: rest.bukbukCategoryNames || {},
      status: 'pending',
    });
    
    await generateQueue.add('generate-documentary', {
      documentId: docRef.id,
      userId,
      prompt,
      genre,
      type,
      systemPrompt,
      ...rest,
    });
    
    res.status(202).json({ status: 'accepted', documentId: docRef.id });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate/title', async (req, res) => {
  try {
    const { input, genre } = req.body;
    const title = await generateTitle(input, genre);
    res.json({ title });
  } catch (error) {
    console.error('[API] Error generating title:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[API] Server listening on port ${PORT}`);
});

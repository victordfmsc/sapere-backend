const express = require('express');
const { initFirebase, getDb } = require('./firebase');
const { generateQueue } = require('./queues');
const { generateTitle } = require('./services/openai');
const { sanitizeError } = require('./env');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

initFirebase();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/generate', async (req, res) => {
  try {
    const { userId, uId, prompt, genre, type = 'documentary', systemPrompt, ...rest } = req.body;
    const finalUserId = userId || uId;

    const db = getDb();
    let docRef;

    if (rest.docId || rest.postId || docRef) {
      const finalDocId = rest.docId || rest.postId;
      docRef = db.collection('sapere').doc(finalDocId);
      console.log(`[API] Using existing document: ${finalDocId}`);

      // Update the existing document with pending status and initial data
      await docRef.update({
        uId: finalUserId,
        status: 'pending',
        errorMessage: null,
        prompt,
        genre,
        ...(rest.language ? { language: rest.language } : {}),
        ...(rest.languageCode ? { languageCode: rest.languageCode } : {}),
        bukbukId: rest.bukbukId || '',
        bukbukCategoryId: rest.bukbukCategoryId || '',
        bukbukTypeNames: rest.bukbukTypeNames || {},
        bukbukCategoryNames: rest.bukbukCategoryNames || {},
        updatedAt: new Date(),
      });
    } else {
      console.log(`[API] Creating new document for user: ${finalUserId}`);
      docRef = await db.collection('sapere').add({
        uId: finalUserId,
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
    }

    await generateQueue.add('generate-documentary', {
      documentId: docRef.id,
      userId: finalUserId,
      prompt,
      genre,
      type,
      systemPrompt,
      ...rest,
    });

    res.status(202).json({ status: 'accepted', documentId: docRef.id });
  } catch (error) {
    console.error('[API] Error:', sanitizeError(error));
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// --- Unified v1 Routes ---

// Support for upload-audio (same as generate)
app.post('/v1/api/sapere/upload-audio', async (req, res) => {
  req.url = '/generate';
  app.handle(req, res);
});

// Support for prompt (same as generate)
app.post('/v1/api/sapere/prompt', async (req, res) => {
  req.url = '/generate';
  app.handle(req, res);
});

// Support for generate-cover only
app.post('/v1/api/sapere/generate-cover', async (req, res) => {
  try {
    const { docId, prompt, type = 'documentary', uId } = req.body;

    await generateQueue.add('generate-cover', {
      documentId: docId,
      prompt,
      type,
      userId: uId,
    });

    res.status(202).json({ status: 'accepted', documentId: docId });
  } catch (error) {
    console.error('[API] Error triggering cover:', sanitizeError(error));
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Support for status check
app.get('/v1/api/sapere/upload-audio-status/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const db = getDb();

    // Check if there are any pending or started jobs for this user
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const snapshot = await db.collection('sapere')
      .where('uId', '==', uid)
      .where('status', 'in', ['pending', 'started', 'generating_title', 'generating_script', 'generating_media'])
      .get();

    // Filter by timestamp manually if needed, or refine query
    const activeJobs = snapshot.docs.filter(doc => {
      const data = doc.data();
      const updatedAt = data.updatedAt ? data.updatedAt.toDate() : (data.publishTime ? data.publishTime.toDate() : new Date(0));
      return updatedAt > fifteenMinutesAgo;
    });

    if (activeJobs.length > 0) {
      res.status(200).json({ status: 'busy' });
    } else {
      res.status(404).json({ status: 'idle' });
    }
  } catch (error) {
    console.error('[API] Error checking status:', sanitizeError(error));
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.post('/generate/title', async (req, res) => {
  try {
    const { input, genre, language } = req.body;
    const title = await generateTitle(input, genre, language);
    res.json({ title });
  } catch (error) {
    console.error('[API] Error generating title:', sanitizeError(error));
    res.status(500).json({ error: sanitizeError(error) });
  }
});

app.listen(PORT, () => {
  console.log(`[API] Server listening on port ${PORT}`);
});

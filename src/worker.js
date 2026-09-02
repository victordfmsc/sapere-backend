const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { initFirebase, getDb, getStorage } = require('./firebase');
const { generateTitle, generateScript } = require('./services/openai');
const { generateAudio } = require('./services/elevenlabs');
const { generateCover } = require('./services/imageGen');
const { sanitizeError } = require('./env');

initFirebase();

async function uploadPublic(storage, path, buffer, contentType) {
  const file = storage.file(path);
  await file.save(buffer, { contentType });
  await file.makePublic();
  return `https://storage.googleapis.com/${storage.name}/${file.name}`;
}

const worker = new Worker('generate', async (job) => {
  const { documentId, prompt, genre, type, systemPrompt, voiceId, language } = job.data;
  const jobType = job.name;

  console.log(`[Worker] Processing job "${jobType}" for doc ${documentId}`);
  const db = getDb();
  const docRef = db.collection('sapere').doc(documentId);
  const storage = getStorage();

  try {
    if (jobType === 'generate-cover') {
      await docRef.update({ status: 'generating_cover', updatedAt: new Date() });
      const coverBuffer = await generateCover(prompt, type);
      const coverUrl = await uploadPublic(storage, `sapere/${documentId}/cover.jpg`, coverBuffer, 'image/jpeg');

      await docRef.update({
        newCover: coverUrl,
        coverImage: coverUrl,
        status: 'completed',
        updatedAt: new Date(),
      });
      console.log(`[Worker] ${documentId}: cover generated and updated`);
      return;
    }

    // Default: generate-documentary
    // Step 1: Started
    await docRef.update({ status: 'started', updatedAt: new Date() });
    console.log(`[Worker] ${documentId}: started`);

    // Step 2: Generate Title
    await docRef.update({ status: 'generating_title', updatedAt: new Date() });
    const title = await generateTitle(prompt, genre, language);
    await docRef.update({ bukbukName: title, updatedAt: new Date() });
    console.log(`[Worker] ${documentId}: title generated - ${title}`);

    // Step 3: Generate Script
    await docRef.update({ status: 'generating_script', updatedAt: new Date() });
    const { paragraphs } = await generateScript(prompt, type, systemPrompt);
    await docRef.update({ description: paragraphs, updatedAt: new Date() });
    console.log(`[Worker] ${documentId}: script generated (${paragraphs.length} paragraphs)`);

    // Step 4: Generate Media (parallel). La portada es opcional: si falla no se pierde el audio.
    await docRef.update({ status: 'generating_media', updatedAt: new Date() });

    const fullText = paragraphs.join('\n\n');
    const [audioResult, coverResult] = await Promise.allSettled([
      generateAudio(fullText, { voiceId }),
      generateCover(prompt, type),
    ]);

    if (audioResult.status === 'rejected') throw audioResult.reason;

    const audioUrl = await uploadPublic(storage, `sapere/${documentId}/audio.mp3`, audioResult.value, 'audio/mpeg');

    let coverUrl = null;
    if (coverResult.status === 'fulfilled') {
      coverUrl = await uploadPublic(storage, `sapere/${documentId}/cover.jpg`, coverResult.value, 'image/jpeg');
    } else {
      console.warn(`[Worker] ${documentId}: cover skipped - ${sanitizeError(coverResult.reason)}`);
    }

    console.log(`[Worker] ${documentId}: media generated`);

    // Step 5: Completed
    await docRef.update({
      status: 'completed',
      bukbukUrl: audioUrl,
      ...(coverUrl ? { newCover: coverUrl, coverImage: coverUrl } : {}),
      errorMessage: null,
      updatedAt: new Date(),
    });

    console.log(`[Worker] ${documentId}: completed successfully`);
  } catch (error) {
    const message = sanitizeError(error);
    console.error(`[Worker] ${documentId}: ERROR [${jobType}] - ${message}`);
    await docRef.update({
      status: 'error',
      errorMessage: message,
      updatedAt: new Date(),
    });
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job && job.id} failed:`, sanitizeError(err));
});

console.log('[Worker] Started and listening for jobs...');

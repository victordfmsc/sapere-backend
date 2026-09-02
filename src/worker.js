const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { initFirebase, getDb, getStorage } = require('./firebase');
const { generateTitle, generateScript } = require('./services/openai');
const { generateAudio } = require('./services/elevenlabs');
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

    // Step 4: Generate audio. La portada la elige el usuario en la app; el backend no la toca.
    await docRef.update({ status: 'generating_media', updatedAt: new Date() });
    const audioBuffer = await generateAudio(paragraphs.join('\n\n'), { voiceId });
    const audioUrl = await uploadPublic(storage, `sapere/${documentId}/audio.mp3`, audioBuffer, 'audio/mpeg');

    console.log(`[Worker] ${documentId}: media generated`);

    // Step 5: Completed
    await docRef.update({
      status: 'completed',
      bukbukUrl: audioUrl,
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

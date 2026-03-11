const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { initFirebase, getDb, getStorage } = require('./firebase');
const { generateTitle, generateScript } = require('./services/openai');
const { generateAudio } = require('./services/elevenlabs');
const { generateCover } = require('./services/imageGen');

initFirebase();

const worker = new Worker('generate', async (job) => {
  const { documentId, prompt, genre, type, systemPrompt } = job.data;
  const jobType = job.name;

  console.log(`[Worker] Processing job "${jobType}" for doc ${documentId}`);
  const db = getDb();
  const docRef = db.collection('sapere').doc(documentId);
  const storage = getStorage();

  try {
    if (jobType === 'generate-cover') {
      await docRef.update({ status: 'generating_cover' });
      const coverBuffer = await generateCover(prompt, type);

      const coverFile = storage.file(`sapere/${documentId}/cover.jpg`);
      await coverFile.save(coverBuffer, { contentType: 'image/jpeg' });
      await coverFile.makePublic();
      const coverUrl = `https://storage.googleapis.com/${storage.name}/${coverFile.name}`;

      await docRef.update({
        newCover: coverUrl,
        coverImage: coverUrl,
        status: 'completed'
      });
      console.log(`[Worker] ${documentId}: cover generated and updated`);
      return;
    }

    // Default: generate-documentary
    // Step 1: Started
    await docRef.update({ status: 'started' });
    console.log(`[Worker] ${documentId}: started`);

    // Step 2: Generate Title
    await docRef.update({ status: 'generating_title' });
    const title = await generateTitle(prompt, genre);
    await docRef.update({ bukbukName: title });
    console.log(`[Worker] ${documentId}: title generated - ${title}`);

    // Step 3: Generate Script
    await docRef.update({ status: 'generating_script' });
    const { paragraphs } = await generateScript(prompt, type, systemPrompt);
    await docRef.update({ description: paragraphs });
    console.log(`[Worker] ${documentId}: script generated (${paragraphs.length} paragraphs)`);

    // Step 4: Generate Media (parallel)
    await docRef.update({ status: 'generating_media' });

    // Generate audio & cover in parallel
    const fullText = paragraphs.join('\n\n');
    const [audioBuffer, coverBuffer] = await Promise.all([
      generateAudio(fullText),
      generateCover(prompt, type),
    ]);

    // Upload audio to Firebase Storage
    const audioFile = storage.file(`sapere/${documentId}/audio.mp3`);
    await audioFile.save(audioBuffer, { contentType: 'audio/mpeg' });
    await audioFile.makePublic();
    const audioUrl = `https://storage.googleapis.com/${storage.name}/${audioFile.name}`;

    // Upload cover to Firebase Storage
    const coverFile = storage.file(`sapere/${documentId}/cover.jpg`);
    await coverFile.save(coverBuffer, { contentType: 'image/jpeg' });
    await coverFile.makePublic();
    const coverUrl = `https://storage.googleapis.com/${storage.name}/${coverFile.name}`;

    console.log(`[Worker] ${documentId}: media generated`);

    // Step 5: Completed
    await docRef.update({
      status: 'completed',
      bukbukUrl: audioUrl,
      newCover: coverUrl,
      coverImage: coverUrl,
    });

    console.log(`[Worker] ${documentId}: completed successfully`);
  } catch (error) {
    console.error(`[Worker] ${documentId}: ERROR [${jobType}] -`, error);
    await docRef.update({
      status: 'error',
      errorMessage: error.message,
    });
  }
}, { connection });

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed:`, err.message);
});

console.log('[Worker] Started and listening for jobs...');

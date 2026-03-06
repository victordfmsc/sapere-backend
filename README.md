# Sapere Backend - Railway Deployment

Backend asíncrono para generación de audio-documentales con BullMQ y Firebase.

## Arquitectura

- **Express API**: Endpoints HTTP (POST /generate, POST /generate/title, GET /health)
- **BullMQ Worker**: Procesador async de documentales
- **Redis**: Cola de trabajos
- **Firebase**: Base de datos Firestore + Storage
- **APIs externas**: OpenAI GPT-4o-mini, ElevenLabs TTS, HuggingFace FLUX

## Deployment en Railway

### Paso 1: Crear proyecto en Railway

1. Ve a https://railway.com/dashboard
2. Click en "+ New"
3. Selecciona "Empty Project"
4. Renombra el proyecto a "sapere-backend"

### Paso 2: Añadir Redis

1. Dentro del proyecto, click en "+ New"
2. Selecciona "Database" → "Add Redis"
3. Railway creará automáticamente la variable de entorno `REDIS_URL`

### Paso 3: Conectar repositorio GitHub

1. Click en "+ New" → "GitHub Repo"
2. Busca y selecciona `victordfmsc/sapere-backend`
3. Railway detectará automáticamente el `Procfile`

### Paso 4: Configurar variables de entorno

1. Click en el servicio de GitHub
2. Ve a la pestaña "Variables"
3. Añade las siguientes variables:

```
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
HF_TOKEN=hf_...
FIREBASE_PROJECT_ID=sapere-f7150
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@sapere-f7150.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
FIREBASE_STORAGE_BUCKET=sapere-f7150.appspot.com
```

### Paso 5: Obtener credenciales de Firebase

1. Ve a https://console.firebase.google.com
2. Selecciona el proyecto "SAPERE"
3. Click en ⚙️ → "Project Settings"
4. Ve a "Service Accounts"
5. Click en "Generate New Private Key"
6. Copia los valores del JSON a las variables de Railway

### Paso 7: Deploy

Railway desplegará automáticamente ambos procesos (API + Worker) según el `Procfile`.

## Endpoints

### `POST /generate`
```json
{
  "userId": "firebase_uid",
  "prompt": "La historia de los Templarios",
  "genre": "History",
  "type": "documentary",
  "language": "Spanish",
  "languageCode": "es_ES"
}
```

Respuesta:
```json
{
  "status": "accepted",
  "documentId": "abc123xyz"
}
```

### `POST /generate/title`
```json
{
  "input": "Generate the title in Spanish language Los Templarios",
  "genre": "History"
}
```

Respuesta:
```json
{
  "title": "Los Templarios: Guardianes del Secreto Perdido"
}
```

### `GET /health`
Health check del servicio.

## Estructura del código

```
src/
├── index.js          # Express API
├── worker.js         # BullMQ Worker
├── queues.js         # Configuración BullMQ
├── firebase.js       # Firebase Admin SDK
├── prompts.js        # Frameworks narrativos rotatorios
└── services/
    ├── openai.js     # Generación de título y guión
    ├── elevenlabs.js # Síntesis de voz
    └── imageGen.js   # Generación de portadas
```

## Estados de generación

El worker actualiza el campo `status` en Firestore progresivamente:

1. `pending` → Job encolado
2. `started` → Worker procesando
3. `generating_title` → Generando título
4. `generating_script` → Generando guión
5. `generating_media` → Generando audio + portada
6. `completed` → Finalizado con éxito
7. `error` → Error (+ campo `errorMessage`)

## Prompts narrativos rotatorios

El sistema selecciona aleatoriamente entre 5 frameworks narrativos para evitar monotonía:

1. **In Medias Res**: Empieza en medio de la acción
2. **Dato Estadístico**: Abre con cifra impactante
3. **Biografía Introspectiva**: Perspectiva interna del protagonista
4. **Pregunta Retórica**: Desafía suposiciones del oyente
5. **Contraste Temporal**: Yuxtapone momentos separados por siglos

## Soporte

Contacto: victordfmsc@gmail.com

// Lee variables de entorno de una sola línea (claves API) de forma tolerante:
// si alguien pega un .env entero como valor, se queda con la primera línea y
// elimina el prefijo "NOMBRE=" y las comillas. Avisa por consola cuando lo hace.
function getEnv(name) {
  const raw = process.env[name];
  if (!raw) return '';

  let value = raw.trim();
  const firstLine = value.split(/\r?\n/)[0].trim();
  const hadExtraLines = firstLine !== value;
  value = firstLine;

  const prefixed = value.match(/^[A-Z0-9_]+=(.*)$/);
  if (prefixed) value = prefixed[1].trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  if (hadExtraLines || prefixed) {
    console.warn(`[env] ${name} contenía varias líneas o un prefijo NOMBRE=; se ha saneado. Corrige la variable en Railway.`);
  }
  return value;
}

// Mensaje de error corto y sin secretos, apto para guardar en Firestore o devolver por HTTP.
function sanitizeError(error) {
  let msg = (error && error.message) ? String(error.message) : String(error);
  msg = msg.split(/\r?\n/)[0];
  msg = msg
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '<redacted>')
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{8,})\b/g, '<redacted>')
    .replace(/\b[A-Z][A-Z0-9_]{2,}=\S+/g, '<redacted>');
  return msg.slice(0, 300);
}

module.exports = { getEnv, sanitizeError };

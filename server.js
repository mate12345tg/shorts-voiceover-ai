'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY;
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_SCRIPT_CHARS = 5000;
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']);
    if (!allowed.has(file.mimetype)) return cb(new Error('Formato no compatible. Usa MP4, MOV, WEBM o MKV.'));
    cb(null, true);
  }
});

function run(command, args, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('El procesamiento tardó demasiado. Prueba con un video más corto.')); }, timeoutMs);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-5000); });
    child.on('error', err => { clearTimeout(timer); reject(new Error(command === 'ffmpeg' ? 'No se encontró FFmpeg en el servidor. Instálalo y vuelve a intentar.' : err.message)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(/Invalid data|moov atom not found|No such file/i.test(stderr) ? 'No se pudo leer el video. Prueba exportarlo de nuevo como MP4.' : `Falló el procesamiento del video (código ${code}). ${stderr.slice(-700)}`));
    });
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, voiceConfigured: Boolean(API_KEY) }));
app.post('/api/create', (req, res) => {
  upload.single('video')(req, res, async uploadErr => {
    if (uploadErr) {
      const tooLarge = uploadErr.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'El video supera el límite de 300 MB.' : uploadErr.message || 'No se pudo recibir el video.' });
    }
    const video = req.file;
    const cleanup = new Set(video ? [video.path] : []);
    const clean = () => { for (const f of cleanup) { try { fs.unlinkSync(f); } catch {} } };
    try {
      if (!API_KEY) return res.status(503).json({ error: 'Falta configurar OPENAI_API_KEY en el servidor. Consulta el README.' });
      if (!video) return res.status(400).json({ error: 'Selecciona un video primero.' });
      const script = String(req.body.script || '').trim();
      if (!script) return res.status(400).json({ error: 'Escribe o pega el guion.' });
      if (script.length > MAX_SCRIPT_CHARS) return res.status(400).json({ error: `El guion no puede superar ${MAX_SCRIPT_CHARS} caracteres.` });
      const style = String(req.body.style || 'gaming').slice(0, 200);
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-voice-'));
      cleanup.add(work);
      const audioPath = path.join(work, 'voice.mp3');
      const outputPath = path.join(work, 'short-final.mp4');

      const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
          voice: process.env.OPENAI_TTS_VOICE || 'onyx',
          input: script,
          instructions: `Habla en español latinoamericano con voz masculina, energía de narrador de gaming, clara y natural. Mantén una dicción precisa y un ritmo dinámico. ${style}`,
          response_format: 'mp3'
        })
      });
      if (!ttsResponse.ok) {
        let detail = ''; try { detail = (await ttsResponse.json()).error?.message || ''; } catch {}
        const status = ttsResponse.status;
        if (status === 401) throw new Error('La clave de OpenAI no es válida. Revisa OPENAI_API_KEY.');
        if (status === 429) throw new Error('Se alcanzó un límite de uso o saldo del servicio de voz. Revisa tu cuenta de OpenAI e inténtalo luego.');
        throw new Error(`El servicio de voz respondió con error (${status}). ${detail}`.trim());
      }
      const audioBytes = Buffer.from(await ttsResponse.arrayBuffer());
      if (audioBytes.length < 100) throw new Error('La voz generada llegó vacía. Inténtalo de nuevo.');
      fs.writeFileSync(audioPath, audioBytes);

      // Loop the supplied clip if needed; -shortest ends the MP4 with the narration.
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', video.path, '-i', audioPath,
        '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart', '-shortest', outputPath
      ]);
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) throw new Error('El archivo final no se creó correctamente.');
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="short-${crypto.randomBytes(4).toString('hex')}.mp4"`);
      res.setHeader('Cache-Control', 'no-store');
      const stream = fs.createReadStream(outputPath);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      stream.on('close', clean);
      stream.pipe(res);
      req.on('aborted', clean);
    } catch (err) {
      clean();
      console.error('[create]', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message || 'Error inesperado al crear el video.' });
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err.message);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor. Revisa los registros y vuelve a intentar.' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`Shorts Voiceover listo en el puerto ${PORT}`));

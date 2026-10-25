# Shorts Voiceover AI — Android/PWA

App web instalable en Android que convierte un guion en narración masculina en español y la combina con un video vertical MP4. La interfaz es PWA; el procesamiento se hace en un servidor Node.js con FFmpeg y la voz se genera usando la API de audio de OpenAI.

## Qué hace
- Recibe video MP4, MOV, WEBM o MKV (hasta 300 MB).
- Acepta guiones de hasta 5000 caracteres.
- Genera voz con `gpt-4o-mini-tts`, voz `onyx` y estilo gaming.
- Convierte el video a 1080×1920, 30 FPS, H.264/AAC, MP4.
- Repite el clip si es más corto que la narración y termina el resultado al finalizar la voz.
- Devuelve un archivo MP4 descargable y muestra errores legibles.

## Requisitos
- Node.js 20 o posterior.
- FFmpeg instalado y disponible como comando `ffmpeg` (o usa Docker).
- Clave de API de OpenAI con acceso y saldo/crédito para generación de audio.
- HTTPS recomendado/normalmente necesario para instalar PWA y usarla desde el teléfono.

## Despliegue guiado en Render (para usar desde Android)

El proyecto incluye `render.yaml` para desplegar el servidor con Docker y FFmpeg. Necesitarás una cuenta de Render, una cuenta de GitHub y una clave de API de OpenAI. No compartas la clave en el chat ni la pongas en el HTML.

1. Sube la carpeta del proyecto a un repositorio **privado** de GitHub.
2. En Render, crea un **Blueprint** y conecta ese repositorio. Render detectará `render.yaml`.
3. Cuando Render pida `OPENAI_API_KEY`, introduce la clave en el campo secreto del panel de Render.
4. Pulsa desplegar y espera a que `/api/health` responda. Abre la URL HTTPS que Render te asigne en Chrome para Android.
5. En Chrome, menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.

**Costes y límites:** Render puede cobrar por el servidor y OpenAI cobra por el uso de voz según tu cuenta y modelo. Revisa los precios actuales antes de desplegar. El archivo de configuración usa un servicio `starter`; elige un plan adecuado en el panel si no está disponible en tu cuenta. Para una app pública, añade autenticación y límites de uso antes de compartir el enlace.

## Inicio local
1. Descomprime el proyecto.
2. Instala dependencias: `npm install`.
3. Configura la clave **solo en el servidor**, nunca en el HTML ni en la app del cliente:
   - Linux/macOS: `export OPENAI_API_KEY='tu_clave'`
   - PowerShell: `$env:OPENAI_API_KEY='tu_clave'`
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000` en el equipo. En un Android, despliega en un servidor HTTPS accesible desde el móvil.

## Docker (recomendado para despliegue)
Desde la carpeta del proyecto:

```bash
docker build -t shorts-voiceover .
docker run --rm -p 3000:3000 -e OPENAI_API_KEY='tu_clave' shorts-voiceover
```

Luego configura un dominio HTTPS/proxy inverso en el hosting. No publiques el puerto directamente en internet sin HTTPS, límites de uso y control de acceso.

## Instalar en Android
1. Abre la URL HTTPS del despliegue en Chrome para Android.
2. Menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.
3. Abre el icono como una app.

## Seguridad y operación
- No se incluye ninguna clave de API.
- La clave se lee de la variable de entorno `OPENAI_API_KEY` y permanece en el servidor.
- Los archivos temporales se borran después de responder o cuando ocurre un error.
- Para un despliegue público, agrega autenticación, cuotas por usuario, limitación de solicitudes y monitoreo de costes. El ejemplo no implementa cuentas ni protección antiabuso.
- No se garantiza “cero errores”: el backend valida entradas, controla errores de API y FFmpeg, y devuelve mensajes comprensibles.

## Limitaciones conocidas
- La narración se coloca como pista de audio principal y reemplaza el audio original del video.
- El clip se repite si no dura lo suficiente; si dura más que la narración, el resultado se recorta al final de la voz.
- La sincronización es a nivel de duración total; no analiza automáticamente cada escena ni alinea palabras con subtítulos.
- La salida se centra dentro de un lienzo vertical y puede mostrar bandas negras si el video no tiene formato 9:16.
- Revisa siempre el MP4 antes de publicarlo.

## Diagnóstico
- `Falta configurar OPENAI_API_KEY`: configura la variable en el servidor.
- `La clave ... no es válida`: revisa la clave en el panel de OpenAI.
- `límite de uso o saldo`: revisa cuotas, facturación y permisos de la API.
- `No se encontró FFmpeg`: instala FFmpeg o utiliza Docker.
- Video no legible: vuelve a exportarlo como MP4 H.264 y prueba de nuevo.

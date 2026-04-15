/**
 * Voice input — streaming speech-to-text via Deepgram.
 *
 * Browser captures mic audio via getUserMedia/MediaRecorder,
 * streams chunks to this WebSocket endpoint, which proxies them
 * to Deepgram's streaming API. Transcripts are sent back to the
 * browser for injection into the active terminal.
 */

const WebSocket = require('ws');
const db = require('./db');

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

/**
 * Handle a voice WebSocket connection from the browser.
 * Bridges audio to Deepgram and returns transcripts.
 */
function handleVoiceConnection(ws) {
  const apiKey = db.getSetting('deepgram_api_key', '');
  if (!apiKey) {
    ws.send(JSON.stringify({ type: 'error', message: 'Deepgram API key not configured. Add it in Settings > API Keys.' }));
    ws.close();
    return;
  }

  // Connect to Deepgram streaming API
  const dgUrl = `${DEEPGRAM_WS_URL}?model=nova-3&punctuate=true&interim_results=true&endpointing=300&smart_format=true`;
  const dg = new WebSocket(dgUrl, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  let dgOpen = false;

  dg.on('open', () => {
    dgOpen = true;
    ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
    console.log('[voice] Deepgram connected');
  });

  dg.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'Results' && msg.channel?.alternatives?.length > 0) {
        const transcript = msg.channel.alternatives[0].transcript;
        if (transcript) {
          ws.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            is_final: msg.is_final,
            speech_final: msg.speech_final,
          }));
        }
      }
    } catch (err) {
      console.error('[voice] Error parsing Deepgram message:', err.message);
    }
  });

  dg.on('error', (err) => {
    console.error('[voice] Deepgram error:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Deepgram connection error' }));
  });

  dg.on('close', () => {
    dgOpen = false;
    console.log('[voice] Deepgram disconnected');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status', status: 'disconnected' }));
      ws.close();
    }
  });

  // Forward audio from browser to Deepgram
  ws.on('message', (data) => {
    if (dgOpen && dg.readyState === WebSocket.OPEN) {
      // Binary audio data — forward directly
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        dg.send(data);
      }
    }
  });

  ws.on('close', () => {
    console.log('[voice] Browser disconnected');
    if (dgOpen && dg.readyState === WebSocket.OPEN) {
      dg.close();
    }
  });

  ws.on('error', (err) => {
    console.error('[voice] Browser WebSocket error:', err.message);
    if (dgOpen) dg.close();
  });
}

module.exports = { handleVoiceConnection };

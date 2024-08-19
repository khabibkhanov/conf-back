require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let broadcaster;
const peerConnections = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('broadcaster', () => {
    broadcaster = socket.id;
    console.log(`Broadcaster registered: ${broadcaster}`);
    socket.broadcast.emit('broadcaster');
  });

  socket.on('watcher', () => {
    console.log(`Watcher connected: ${socket.id}`);
    socket.to(broadcaster).emit('watcher', socket.id);
  });

  socket.on('offer', (id, message) => {
    console.log(`Sending offer from ${socket.id} to ${id}`);
    socket.to(id).emit('offer', socket.id, message);
  });

  socket.on('answer', (id, message) => {
    console.log(`Sending answer from ${socket.id} to ${id}`);
    socket.to(id).emit('answer', socket.id, message);
  });

  socket.on('candidate', (id, message) => {
    console.log(`Sending ICE candidate from ${socket.id} to ${id}`);
    socket.to(id).emit('candidate', socket.id, message);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    socket.to(broadcaster).emit('disconnectPeer', socket.id);
  });

  socket.on('startSpeaking', async (audioBuffer) => {
    console.log('Received audio for speech-to-text processing');
    try {
      const transcript = await speechToText(audioBuffer);
      console.log('Transcript:', transcript);
      io.emit('transcript', transcript);
    } catch (error) {
      console.error('Error in speech-to-text:', error);
    }
  });

  socket.on('translateSpeech', async (data) => {
    const { text, targetLanguage } = data;
    console.log(`Received text for translation: "${text}" to ${targetLanguage}`);
    try {
      const translatedText = await translateText(text, targetLanguage);
      console.log(`Translated Text: "${translatedText}"`);
      const audioUrl = await textToSpeech(translatedText, targetLanguage);
      console.log('Generated audio URL:', audioUrl);
      io.emit('translatedSpeech', { translatedText, audioUrl });
    } catch (error) {
      console.error('Error in translation or text-to-speech:', error);
    }
  });
});

// Using AssemblyAI for speech-to-text
const speechToText = async (audioBuffer) => {
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'speech.wav' });

  const response = await axios.post('https://api.assemblyai.com/v2/upload', form, {
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY,
      ...form.getHeaders(),
    }
  });

  console.log('Audio uploaded, received URL:', response.data.upload_url);

  const { upload_url: audioUrl } = response.data;

  const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
    audio_url: audioUrl,
  }, {
    headers: {
      authorization: process.env.ASSEMBLYAI_API_KEY,
    }
  });

  console.log('Transcript response:', transcriptResponse.data);

  return transcriptResponse.data.text;
};

// Using LibreTranslate for translation
const translateText = async (text, targetLanguage) => {
  const response = await axios.post(`https://libretranslate.com/translate`, {
    q: text,
    source: "en",
    target: targetLanguage,
    format: "text"
  });

  console.log('Translation response:', response.data);

  return response.data.translatedText;
};

// Using VoiceRSS for text-to-speech
const textToSpeech = async (text, language) => {
  const response = await axios.get('https://api.voicerss.org/', {
    params: {
      key: process.env.VOICERSS_API_KEY,
      hl: language,
      src: text,
      c: 'MP3',
      f: '48khz_16bit_stereo',
      r: '0',
    },
    responseType: 'arraybuffer',
  });

  console.log('VoiceRSS response:', response.status);

  const audioBuffer = Buffer.from(response.data, 'binary');
  const audioUrl = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;

  return audioUrl;
};

server.listen(3001, () => {
  console.log('Server running on port 3001');
});

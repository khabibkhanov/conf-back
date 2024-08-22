const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const revai = require('revai-node-sdk');
const { OpenAI } = require('openai');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Replace with your Next.js frontend URL
    methods: ['GET', 'POST'],
} 
});

// OpenAI setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Rev.ai setup
const revaiClient = new revai.RevAiApiClient({ token: process.env.REVAI_API_KEY });

// CORS configuration
app.use(cors({
  origin: '*', // Replace with your Next.js frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Store transcripts in-memory
let transcripts = [];

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('start-stream', async ({ sourceLang }) => {
        console.log(`Starting stream with source language: ${sourceLang}`);
        
        const stream = revaiClient.stream({ speaker_channels_count: 1 });

        stream.on('data', async (data) => {
            console.log('Received data from Rev.ai');
            
            data.monologues.forEach(async (monologue) => {
                const speakerId = monologue.speaker || 'Unknown';
                const text = monologue.elements.map(e => e.value).join(' ');
                const transcript = `Speaker ${speakerId}: ${text}`;
                
                console.log(`Transcript: ${transcript}`);
                transcripts.push({ speakerId, text });

                // Send the original transcript to the speaker
                socket.emit('speaker-transcription', { transcript });

                // Translate the text for the listener
                const translatedText = await translateText(text, socket.listenerLang);
                console.log(`Translated Text: ${translatedText}`);
                
                // Convert translated text to speech
                const speech = await convertTextToSpeech(translatedText, socket.listenerLang);
                console.log(`Generated Speech for listener`);

                socket.broadcast.emit('listener-transcription', { translatedText, speech });
            });
        });

        stream.on('error', (error) => {
            console.error('Error during streaming:', error);
            socket.emit('error', 'An error occurred during streaming.');
        });

        socket.on('audio-data', (audioData) => {
            console.log('Received audio data');
            stream.write(audioData);
        });

        socket.on('stop-stream', () => {
            console.log('Stopping stream');
            stream.end();
        });

        socket.on('set-listener-lang', (lang) => {
            console.log(`Listener language set to: ${lang}`);
            socket.listenerLang = lang;
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

async function translateText(text, targetLang) {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: `Translate this to ${targetLang}: ${text}`,
            max_tokens: 500,
        });
        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error('Error translating text:', error);
        throw new Error('Translation failed.');
    }
}

async function convertTextToSpeech(text, language) {
    try {
        const response = await openai.createAudio({
            model: "text-davinci-003",
            input: text,
            voice: {
                language: language,
                gender: 'female' // Adjust as needed
            },
            audioFormat: 'mp3'
        });
        return response.data.audio_data;
    } catch (error) {
        console.error('Error converting text to speech:', error);
        throw new Error('Text-to-Speech conversion failed.');
    }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

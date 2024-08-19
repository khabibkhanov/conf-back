const { Readable } = require('stream');
const AssemblyAI = require('assemblyai');
const SoxRecording = require('./sox.js'); // Assuming you have a SoxRecording utility
const socket = require('socket.io');
const http = require('http');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Server is running');
});

const SAMPLE_RATE = 16000;
let currentSpeaker = null;0

const io = socket(server);

io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
    });

    socket.on('start-speaking', (roomId) => {
        if (currentSpeaker) {
            socket.emit('error', 'Only one person can be the speaker.');
            return;
        }

        currentSpeaker = socket.id; // Set the current speaker

        const client = new AssemblyAI({
            apiKey: process.env.ASSEMBLYAI_API_KEY,
        });

        const transcriber = client.realtime.transcriber({
            sampleRate: SAMPLE_RATE,
            enableDiarization: true, // Enable speaker diarization
        });

        transcriber.on('open', ({ sessionId }) => {
            console.log(`Session opened with ID: ${sessionId}`);
        });

        transcriber.on('error', (error) => {
            console.error('Error:', error);
            socket.emit('error', 'Speech-to-text failed.');
        });

        transcriber.on('close', (code, reason) => {
            console.log('Session closed:', code, reason);
            currentSpeaker = null; // Reset the speaker when done
        });

        transcriber.on('transcript', (transcript) => {
            if (!transcript.text) return;

            if (transcript.message_type === 'PartialTranscript') {
                console.log('Partial:', transcript.text);
            } else {
                console.log('Final:', transcript.text);
                io.to(roomId).emit('transcription', {
                    text: transcript.text,
                    speaker: transcript.speaker || 'Speaker',
                });
            }
        });

        (async () => {
            console.log('Connecting to real-time transcript service');
            await transcriber.connect();

            console.log('Starting recording');
            const recording = new SoxRecording({
                channels: 1,
                sampleRate: SAMPLE_RATE,
                audioType: 'wav', // Linear PCM
            });

            recording.stream().pipeTo(transcriber.stream());

            socket.on('stop-speaking', async () => {
                console.log('Stopping recording');
                recording.stop();

                console.log('Closing real-time transcript connection');
                await transcriber.close();

                currentSpeaker = null;
            });

            socket.on('disconnect', async () => {
                if (socket.id === currentSpeaker) {
                    recording.stop();
                    await transcriber.close();
                    currentSpeaker = null;
                }
            });

            process.on('SIGINT', async function () {
                console.log();
                console.log('Stopping recording');
                recording.stop();

                console.log('Closing real-time transcript connection');
                await transcriber.close();

                process.exit();
            });
        })();
    });

    socket.on('start-listening', (roomId) => {
        socket.join(roomId);

        socket.on('transcription', (data) => {
            console.log(`Received from ${data.speaker}: ${data.text}`);
            // Further processing such as translating or TTS can be done here
        });

        socket.on('disconnect', () => {
            socket.leave(roomId);
        });
    });
});

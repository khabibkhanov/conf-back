const { spawn } = require('child_process');
const { Readable } = require('stream');

class SoxRecording {
    constructor({ channels = 1, sampleRate = 16000, audioType = 'wav' }) {
        this.channels = channels;
        this.sampleRate = sampleRate;
        this.audioType = audioType;
        this.soxProcess = null;
        this.audioStream = new Readable({
            read() {},
        });
    }

    start() {
        this.soxProcess = spawn('sox', [
            '-d', // Record from the default device
            '-c', this.channels, // Number of channels
            '-r', this.sampleRate, // Sample rate
            '-t', this.audioType, // Audio type
            '-',
        ]);

        this.soxProcess.stdout.on('data', (data) => {
            this.audioStream.push(data);
        });

        this.soxProcess.stderr.on('data', (data) => {
            console.error(`Sox error: ${data}`);
        });

        this.soxProcess.on('close', (code) => {
            console.log(`Sox process exited with code ${code}`);
            this.audioStream.push(null);
        });
    }

    stop() {
        if (this.soxProcess) {
            this.soxProcess.kill('SIGINT');
            this.soxProcess = null;
        }
    }

    stream() {
        return this.audioStream;
    }
}

module.exports = { SoxRecording }
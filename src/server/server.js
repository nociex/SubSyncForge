
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = 3000;

// State
let isRunning = false;
let currentProcess = null;
let logs = [];

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json({ isRunning, logs: logs.slice(-100) });
});

app.post('/api/start', (req, res) => {
    if (isRunning) {
        return res.status(400).json({ error: 'Process is already running' });
    }

    logs = []; // Clear logs on new run
    isRunning = true;
    io.emit('status', { isRunning });
    io.emit('clear_logs');

    const scriptPath = path.join(__dirname, '../../dist/sync-subscriptions.js');
    // Build first, then run
    // But for simplicity in docker which usually built already, we run the built script.
    // Actually, let's run 'npm run sync' command directly or just the node script if built.
    // In Dockerfile we do 'pnpm install' then 'COPY . .', so we should probably run the build script if needed or just assume dist exists.
    // The original Dockerfile command was 'npm run sync' which does 'npm run build && node dist/sync-subscriptions.js'

    const cmd = 'npm';
    const args = ['run', 'sync'];

    currentProcess = spawn(cmd, args, {
        cwd: path.join(__dirname, '../../'),
        shell: true
    });

    const broadcastLog = (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                const logEntry = { timestamp: new Date().toISOString(), message: line };
                logs.push(logEntry);
                io.emit('log', logEntry);
            }
        });
    };

    currentProcess.stdout.on('data', broadcastLog);
    currentProcess.stderr.on('data', broadcastLog);

    currentProcess.on('close', (code) => {
        isRunning = false;
        currentProcess = null;
        const finalMsg = `Process exited with code ${code}`;
        logs.push({ timestamp: new Date().toISOString(), message: finalMsg });
        io.emit('log', { timestamp: new Date().toISOString(), message: finalMsg });
        io.emit('status', { isRunning });
    });

    res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
    if (!isRunning || !currentProcess) {
        return res.status(400).json({ error: 'No process running' });
    }
    currentProcess.kill();
    res.json({ success: true });
});

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

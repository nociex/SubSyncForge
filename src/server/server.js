
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

// Helper to spawn process and stream logs
const runTask = (cmd, args, res) => {
    if (isRunning) {
        return res.status(400).json({ error: 'A process is already running' });
    }

    logs = []; // Clear logs on new run
    isRunning = true;
    io.emit('status', { isRunning });
    io.emit('clear_logs');

    currentProcess = spawn(cmd, args, {
        cwd: path.join(__dirname, '../../'),
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1' } // Force color for logs
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
};

app.post('/api/start', (req, res) => {
    runTask('npm', ['run', 'sync'], res);
});

app.post('/api/validate/:core', (req, res) => {
    const { core } = req.params;
    if (!['mihomo', 'singbox'].includes(core)) {
        return res.status(400).json({ error: 'Invalid core type' });
    }
    // Correctly point to the script. running via node directly to avoid npm overhead and signal issues
    const scriptPath = path.join(__dirname, '../scripts/validate-configs.js');
    runTask('node', [scriptPath, `--core=${core}`], res);
});

app.post('/api/stop', (req, res) => {
    if (!isRunning || !currentProcess) {
        return res.status(400).json({ error: 'No process running' });
    }
    // Using tree-kill logic might be better but for now simpler:
    // Because we used shell:true, we might need to kill the process group.
    // docker container usually runs as root/single user, so process.kill might work if PID is correct.
    // However, with shell:true, currentProcess.pid is the shell.
    // Given the environment (Docker Alpine), we can try negative PID to kill group.
    try {
        process.kill(-currentProcess.pid);
    } catch (e) {
        currentProcess.kill();
    }
    res.json({ success: true });
});

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

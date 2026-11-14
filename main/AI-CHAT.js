const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const axios = require('axios');
const { Server } = require('ssh2');

const HOST = '0.0.0.0';
const PORT = 5005;

const PROVIDER = 'gemini';
const GEMINI_API_KEY = 'API KEY'; // ใส่ Gemini API Key ของคุณที่นี่

const GEMINI_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
];

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';
const SYSTEM_PROMPT = 'You are a helpful assistant.';

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
const MAX_DELAY = 8000;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// สี ANSI Escape Codes
const RED = '\x1b[1;31m';
const GREEN = '\x1b[1;32m';
const CYAN = '\x1b[1;36m';
const YELLOW = '\x1b[1;33m';
const MAGENTA = '\x1b[1;35m';
const WHITE = '\x1b[1;37m';
const RESET = '\x1b[0m';

const BIG_TEXT = `
    █████ ▒█████  ██▀███  ▓██   ██▓ ▒█████  █    ██ 
  ▓██    ▒██▒  ██▒▓██ ▒ ██▒ ▒██ ██▒▒██▒  ██▒ ██  ▓██▒
  ▒████  ▒██░  ██▒▓██ ░▄█ ▒  ▒██ ██░▒██░  ██▒▓██  ▒██░
  ░▓█▒   ▒██   ██░▒██▀▀█▄    ░ ▐██▓░▒██   ██░▓▓█  ░██░
▒░▒█░    ░ ████▓▒░░██▓ ▒██▒   ░ ██▒▓░░ ████▓▒░▒▒█████▓ 
░ ▒ ░    ░ ▒░▒░▒░ ░ ▒▓ ░▒▓░   ██▒▒▒ ░ ▒░▒░▒░  ▒▓▒ ▒ ▒ 
░ ░        ░ ▒ ▒░   ░▒ ░ ▒░ ██▓ ░▒░   ░ ▒ ▒░  ░▒░ ░ ░ 
  ░ ░    ░ ░ ░ ▒     ░   ░  ▒ ▒ ░░  ░ ░ ░ ▒   ░░ ░ ░ 
░            ░ ░     ░      ░ ░         ░ ░    ░     
`;

const SUB_TEXT = 'FORYOU AI';

let onlineUsers = 0;

function incOnline() {
    onlineUsers++;
    return onlineUsers;
}

function decOnline() {
    if (onlineUsers > 0) onlineUsers--;
    return onlineUsers;
}

function getOnline() {
    return onlineUsers;
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadUsers() {
    ensureDataDir();
    if (!fs.existsSync(USERS_FILE)) return {};
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

function countRegistered() {
    return Object.keys(loadUsers()).length;
}

function createUser(username, password) {
    const users = loadUsers();
    if (users[username]) {
        return [false, 'Username already exists'];
    }
    users[username] = {
        password: hashPassword(password),
        created: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    saveUsers(users);
    return [true, 'Account created'];
}

function verifyUser(username, password) {
    const users = loadUsers();
    if (!users[username]) return false;
    return users[username].password === hashPassword(password);
}

function getIp() {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const netInterface of interfaces[name]) {
            if (netInterface.family === 'IPv4' && !netInterface.internal) {
                return netInterface.address;
            }
        }
    }
    return '127.0.0.1';
}

function buildMessages(history) {
    return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}

async function callGeminiOnce(modelName, history) {
    const url = GEMINI_URL.replace('{model}', modelName);
    const headers = {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
    };

    const contents = [];
    for (const msg of buildMessages(history)) {
        if (msg.role === 'system') continue;
        const role = msg.role === 'user' ? 'user' : 'model';
        contents.push({
            role: role,
            parts: [{ text: msg.content }],
        });
    }

    const payload = {
        system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: contents,
    };

    return await axios.post(url, payload, { headers, timeout: 120000 });
}

async function askGemini(history) {
    let lastError = null;

    for (const modelName of GEMINI_MODELS) {
        let delay = INITIAL_DELAY;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const r = await callGeminiOnce(modelName, history);
                if (r.status === 200) {
                    const data = r.data;
                    try {
                        return data.candidates[0].content.parts[0].text || '';
                    } catch (e) {
                        return '[No response]';
                    }
                }
            } catch (e) {
                const status = e.response ? e.response.status : null;
                lastError = `HTTP ${status || e.message} on ${modelName}`;

                if ([503, 429, 500, 502].includes(status)) {
                    if (attempt < MAX_RETRIES) {
                        const jitter = Math.random() * 500;
                        const wait = Math.min(delay + jitter, MAX_DELAY);
                        await new Promise((resolve) => setTimeout(resolve, wait));
                        delay *= 2;
                        continue;
                    } else {
                        break;
                    }
                }
                if (status === 404) break;
            }
        }
    }

    throw new Error(`All Gemini models are busy. Please try again later. Last error: ${lastError}`);
}

function send(stream, text) {
    try {
        stream.write(Buffer.from(text, 'utf8'));
    } catch (e) {}
}

function setWindowTitle(stream, title) {
    send(stream, `\x1b]0;${title}\x07`);
}

function setWindowTitleCount(stream) {
    const title = `GEMINI SERVER  [ ${getOnline()} / ${countRegistered()} ]`;
    setWindowTitle(stream, title);
}

function sendArt(stream, text, color) {
    for (const line of text.split('\n')) {
        send(stream, color + line + RESET + '\r\n');
    }
}

function showBanner(stream) {
    setWindowTitleCount(stream);
    send(stream, '\x1b[2J\x1b[H');
    sendArt(stream, BIG_TEXT, RED);
    send(stream, MAGENTA + '            ' + SUB_TEXT + RESET + '\r\n\r\n');
    send(stream, '  ' + GREEN + 'ONLINE' + RESET + '      : ' + WHITE + getOnline() + RESET + ' / ' + WHITE + countRegistered() + RESET + ' user(s)\r\n');
    send(stream, '  ' + CYAN + 'PROVIDER' + RESET + '    : ' + PROVIDER + '\r\n');
    send(stream, '  ' + CYAN + 'MODEL' + RESET + '       : ' + GEMINI_MODELS[0] + ' (+fallback)\r\n\r\n');
}

async function ask(stream, prompt) {
    send(stream, prompt);
    return new Promise((resolve) => {
        let buffer = '';
        const dataHandler = (chunk) => {
            const text = chunk.toString('utf8');
            for (const ch of text) {
                if (ch === '\r' || ch === '\n') {
                    send(stream, '\r\n');
                    stream.removeListener('data', dataHandler);
                    resolve(buffer);
                    return;
                } else if (ch === '\x7f' || ch === '\x08') {
                    if (buffer.length > 0) {
                        buffer = buffer.slice(0, -1);
                        send(stream, '\b \b');
                    }
                } else if (ch === '\x03') {
                    send(stream, '^C\r\n');
                    stream.removeListener('data', dataHandler);
                    resolve(null);
                    return;
                } else {
                    buffer += ch;
                    send(stream, ch);
                }
            }
        };
        stream.on('data', dataHandler);
    });
}

async function loginMenu(stream) {
    while (true) {
        showBanner(stream);
        send(stream, CYAN + '  1. Create Account\r\n' + RESET);
        send(stream, CYAN + '  2. Login\r\n' + RESET);
        send(stream, CYAN + '  3. Exit\r\n' + RESET + '\r\n');

        const choice = await ask(stream, YELLOW + 'Select > ' + RESET);
        if (choice === null) return null;

        if (choice === '1') {
            send(stream, '\r\n');
            const user = await ask(stream, 'New Username > ');
            if (!user) return null;
            const pwd = await ask(stream, 'New Password > ');
            if (!pwd) return null;

            const [ok, msg] = createUser(user.trim(), pwd.trim());
            if (ok) {
                send(stream, GREEN + '  ' + msg + RESET + '\r\n');
            } else {
                send(stream, RED + '  ' + msg + RESET + '\r\n');
            }
            await new Promise((r) => setTimeout(r, 1500));
        } else if (choice === '2') {
            send(stream, '\r\n');
            const user = await ask(stream, 'Username > ');
            if (!user) return null;
            const pwd = await ask(stream, 'Password > ');
            if (!pwd) return null;

            if (verifyUser(user.trim(), pwd.trim())) {
                send(stream, GREEN + '  Login OK' + RESET + '\r\n');
                await new Promise((r) => setTimeout(r, 800));
                return user.trim();
            } else {
                send(stream, RED + '  Invalid username or password' + RESET + '\r\n');
                await new Promise((r) => setTimeout(r, 1500));
            }
        } else if (choice === '3') {
            send(stream, 'Bye.\r\n');
            return null;
        } else {
            send(stream, RED + '  Invalid choice' + RESET + '\r\n');
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

function showChatHeader(stream, username) {
    setWindowTitleCount(stream);
    send(stream, '\x1b[2J\x1b[H');
    sendArt(stream, BIG_TEXT, RED);
    send(stream, MAGENTA + '            ' + SUB_TEXT + RESET + '\r\n\r\n');
    send(stream, '  ' + GREEN + 'ONLINE' + RESET + '      : ' + WHITE + getOnline() + RESET + ' / ' + WHITE + countRegistered() + RESET + ' user(s)\r\n');
    send(stream, '  ' + CYAN + 'Welcome' + RESET + '     : ' + username + '\r\n');
    send(stream, '  ' + CYAN + 'MODEL' + RESET + '       : ' + GEMINI_MODELS[0] + ' (+fallback)\r\n');
    send(stream, '  ' + CYAN + '/help for commands\r\n\r\n');
}

async function chatLoop(stream, username) {
    const history = [];
    showChatHeader(stream, username);
    send(stream, CYAN + username + ' > ' + RESET);

    return new Promise((resolve) => {
        let buffer = '';
        const dataHandler = async (chunk) => {
            const text = chunk.toString('utf8');
            for (const ch of text) {
                if (ch === '\r' || ch === '\n') {
                    send(stream, '\r\n');
                    const userMsg = buffer.trim();
                    buffer = '';

                    if (!userMsg) {
                        send(stream, CYAN + username + ' > ' + RESET);
                        continue;
                    }

                    if (['/exit', '/quit', '/logout'].includes(userMsg)) {
                        send(stream, 'Bye.\r\n');
                        stream.removeListener('data', dataHandler);
                        resolve();
                        return;
                    }

                    if (userMsg === '/clear') {
                        history.length = 0;
                        send(stream, 'History cleared.\r\n');
                        send(stream, CYAN + username + ' > ' + RESET);
                        continue;
                    }

                    if (userMsg === '/cls') {
                        showChatHeader(stream, username);
                        send(stream, CYAN + username + ' > ' + RESET);
                        continue;
                    }

                    if (userMsg === '/help') {
                        send(stream, '\r\n  /exit    - quit\r\n  /quit    - quit\r\n  /logout  - quit\r\n  /clear   - clear history\r\n  /cls     - clear screen\r\n  /help    - show help\r\n\r\n');
                        send(stream, CYAN + username + ' > ' + RESET);
                        continue;
                    }

                    history.push({ role: 'user', content: userMsg });

                    try {
                        send(stream, '\r\n');
                        setWindowTitle(stream, `FORYOU SERVER  [ ${username} is thinking... ]`);
                        send(stream, YELLOW + '  [thinking...]' + RESET + '\r\n');

                        const answer = await askGemini(history);
                        history.push({ role: 'assistant', content: answer });
                        send(stream, GREEN + 'AI  > ' + RESET + answer + '\r\n\r\n');
                        setWindowTitleCount(stream);
                        send(stream, CYAN + username + ' > ' + RESET);
                    } catch (e) {
                        setWindowTitleCount(stream);
                        send(stream, RED + '[Error] ' + e.message + RESET + '\r\n\r\n');
                        send(stream, CYAN + username + ' > ' + RESET);
                        history.pop();
                    }
                } else if (ch === '\x7f' || ch === '\x08') {
                    if (buffer.length > 0) {
                        buffer = buffer.slice(0, -1);
                        send(stream, '\b \b');
                    }
                } else if (ch === '\x03') {
                    send(stream, '^C\r\n');
                    stream.removeListener('data', dataHandler);
                    resolve();
                    return;
                } else {
                    buffer += ch;
                    send(stream, ch);
                }
            }
        };
        stream.on('data', dataHandler);
    });
}

// สร้าง Host Key อัตโนมัติ (หรือใช้คีย์จริง)
let hostKey;
try {
    hostKey = fs.readFileSync('ssh_host_rsa_key');
} catch (e) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    hostKey = privateKey.export({ type: 'pkcs1', format: 'pem' });
}

const server = new net.Server((client) => {
    new Server({
        hostKeys: [hostKey],
    })
        .on('connection', (ssh) => {
            console.log('[+] Client connected');
        })
        .on('authentication', (ctx) => {
            ctx.accept();
        })
        .on('ready', (ssh) => {
            ssh.on('session', (accept, reject) => {
                const session = accept();
                let clientStream = null;

                session.on('shell', async (accept, reject) => {
                    const stream = accept();
                    clientStream = stream;
                    incOnline();

                    try {
                        const username = await loginMenu(stream);
                        if (username) {
                            await chatLoop(stream, username);
                        }
                    } catch (e) {
                        console.log('[!] Client error:', e.message);
                    } finally {
                        decOnline();
                        try {
                            stream.end();
                        } catch (err) {}
                        console.log('[-] Client disconnected');
                    }
                });

                session.on('pty', (accept, reject) => {
                    if (accept) accept();
                });
            });
        })
        .on('error', (err) => {
            // ดักจับ error ป้องกันเซิร์ฟเวอร์ล่ม
        })
        .connect(client);
});

server.listen(PORT, HOST, () => {
    ensureDataDir();
    console.log('AI SSH Server started');
    console.log('');
    console.log('  HOST : ' + getIp());
    console.log('  PORT : ' + PORT);
    console.log('  TYPE : SSH');
    console.log('');
});

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { Tail } = require('tail');
const moment = require('moment');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const now = new Date();
const formattedDate = now.toISOString().slice(0, 10).replace(/-/g, '');
const LOG_DIRECTORY = process.env.LOG_DIR || '/run/user/1000/gvfs/smb-share:server=10.12.100.19,share=t$/ACT/Logs/ACTSentinel/';
const LOG_FILE = 'ACTSentinel' + formattedDate + '.log'
const PORT = process.env.PORT || 3000;

// Storage for log data
let logData = {
  files: new Map(),
  entries: [],
  maxEntries: 1000
};

let activeTails = new Map();
let connectedClients = 0;

// Ensure log directory exists
//if (!fs.existsSync(LOG_DIRECTORY)) {
  //fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
//}

// Utility functions
function parseLogEntry(line, filename) {
  return {
    id: Date.now() + Math.random(),
    timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
    filename,
    content: line.trim(),
    size: line.length
  };
}

function addLogEntry(entry) {
  logData.entries.unshift(entry);
  logData.entries.length > logData.maxEntries && (logData.entries.length = logData.maxEntries);
}

function startTailing(filePath) {
  if (activeTails.has(filePath)) {
    return;
  }

  try {
    const tail = new Tail(filePath, {
      fromBeginning: false,
      follow: true,
      useWatchFile: true,
      fsWatchOptions: { interval: 100 }
    });

    tail.on('line', (data) => {
      const filename = path.basename(filePath);
      const entry = parseLogEntry(data, filename);
      addLogEntry(entry);
      io.emit('newLogEntry', entry);
    });

    activeTails.set(filePath, tail);
  } catch (error) {
    // Silently handle error
  }
}

function stopTailing(filePath) {
  const tail = activeTails.get(filePath);
  if (tail) {
    tail.unwatch();
    activeTails.delete(filePath);
  }
}

function scanLogDirectory() {
  try {
    const filePath = path.join(LOG_DIRECTORY, LOG_FILE);
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      
      logData.files.clear();
      logData.files.set(LOG_FILE, {
        name: LOG_FILE,
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        isActive: true
      });
      
      startTailing(filePath);
    }
  } catch (error) {
    // Silently handle error
  }
}

// Watch for specific log file
const watcher = chokidar.watch(path.join(LOG_DIRECTORY, LOG_FILE), {
  persistent: true,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100
  }
});

watcher.on('add', (filePath) => {
  const filename = path.basename(filePath);
  const stats = fs.statSync(filePath);
  
  logData.files.set(filename, {
    name: filename,
    path: filePath,
    size: stats.size,
    modified: stats.mtime,
    isActive: true
  });
  
  startTailing(filePath);
  io.emit('fileAdded', { filename, path: filePath });
});

watcher.on('unlink', (filePath) => {
  const filename = path.basename(filePath);
  stopTailing(filePath);
  logData.files.delete(filename);
  io.emit('fileRemoved', { filename });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  connectedClients++;
  
  // Send current data to new client
  socket.emit('initialData', {
    files: Array.from(logData.files.values()),
    entries: logData.entries.slice(0, 50), // Send last 50 entries
    stats: {
      totalFiles: logData.files.size,
      totalEntries: logData.entries.length,
      connectedClients
    }
  });
  
  socket.on('disconnect', () => {
    connectedClients--;
  });
  
  socket.on('requestMoreEntries', (data) => {
    const { offset = 0, limit = 50 } = data;
    const entries = logData.entries.slice(offset, offset + limit);
    socket.emit('moreEntries', entries);
  });
});

// REST API Routes

// Get all log files
app.get('/api/files', (req, res) => {
  res.json({
    success: true,
    files: Array.from(logData.files.values()),
    count: logData.files.size
  });
});

// Get log entries with pagination and filtering
app.get('/api/logs', (req, res) => {
  const { 
    page = 1, 
    limit = 50, 
    filename, 
    search,
    since 
  } = req.query;
  
  let filteredEntries = logData.entries;
  
  if (filename) {
    filteredEntries = filteredEntries.filter(entry => entry.filename === filename);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    filteredEntries = filteredEntries.filter(entry => 
      entry.content.toLowerCase().includes(searchLower)
    );
  }
  
  if (since) {
    const sinceDate = moment(since);
    filteredEntries = filteredEntries.filter(entry => 
      moment(entry.timestamp).isAfter(sinceDate)
    );
  }
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: paginatedEntries,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: filteredEntries.length,
      pages: Math.ceil(filteredEntries.length / limit)
    },
    filters: { level, filename, search, since }
  });
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const stats = {
    totalFiles: logData.files.size,
    totalEntries: logData.entries.length,
    connectedClients,
    fileStats: {},
    levelStats: {}
  };
  
  // Calculate file statistics
  logData.files.forEach(file => {
    const fileEntries = logData.entries.filter(entry => entry.filename === file.name);
    stats.fileStats[file.name] = {
      entries: fileEntries.length,
      size: file.size,
      lastModified: file.modified
    };
  });
  
  // Calculate level statistics
  ['error', 'warning', 'info', 'debug'].forEach(level => {
    stats.levelStats[level] = logData.entries.filter(entry => entry.level === level).length;
  });
  
  res.json({
    success: true,
    stats
  });
});

// Stream logs via Server-Sent Events (SSE)
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const clientId = Date.now();
  
  // Send initial data
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Connected to log stream',
    timestamp: moment().format()
  })}\n\n`);
  
  // Listen for new log entries
  const onNewEntry = (entry) => {
    res.write(`data: ${JSON.stringify({
      type: 'logEntry',
      ...entry
    })}\n\n`);
  };
  
  io.on('newLogEntry', onNewEntry);
  
  req.on('close', () => {
    io.off('newLogEntry', onNewEntry);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: moment().format(),
    version: '1.0.0'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize
function init() {
  console.log('🚀 Starting LogsReader Real-time Monitor...');
  console.log(`📁 Log directory: ${path.resolve(LOG_DIRECTORY)}`);
  console.log(`📄 Monitoring file: ${LOG_FILE}`);
  
  scanLogDirectory();
  
  server.listen(PORT, () => {
    console.log(`\n🌟 LogsReader Server is running!`);
    console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  // Stop all file tails
  activeTails.forEach((tail, filePath) => {
    stopTailing(filePath);
  });
  
  // Close watcher
  watcher.close();
  
  server.close(() => {
    process.exit(0);
  });
});

init();

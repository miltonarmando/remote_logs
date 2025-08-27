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
const LOG_DIRECTORY = process.env.LOG_DIR || './logs';
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
  //console.log(`📁 Created log directory: ${LOG_DIRECTORY}`);
//}

// Utility functions
function parseLogEntry(line, filename) {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  const entry = {
    id: Date.now() + Math.random(),
    timestamp,
    filename,
    content: line.trim(),
    level: detectLogLevel(line),
    size: line.length
  };
  
  return entry;
}

function detectLogLevel(line) {
  const lowercaseLine = line.toLowerCase();
  if (lowercaseLine.includes('error') || lowercaseLine.includes('err')) return 'error';
  if (lowercaseLine.includes('warn') || lowercaseLine.includes('warning')) return 'warning';
  if (lowercaseLine.includes('info')) return 'info';
  if (lowercaseLine.includes('debug')) return 'debug';
  return 'info';
}

function addLogEntry(entry) {
  logData.entries.unshift(entry);
  if (logData.entries.length > logData.maxEntries) {
    logData.entries = logData.entries.slice(0, logData.maxEntries);
  }
}

function startTailing(filePath) {
  if (activeTails.has(filePath)) {
    return;
  }

  try {
    const tail = new Tail(filePath, {
      fromBeginning: false,
      follow: true,
      useWatchFile: true
    });

    tail.on('line', (data) => {
      const filename = path.basename(filePath);
      const entry = parseLogEntry(data, filename);
      
      addLogEntry(entry);
      
      // Emit to all connected clients
      io.emit('newLogEntry', entry);
      
      console.log(`📝 [${filename}] New log entry: ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
    });

    tail.on('error', (error) => {
      console.error(`❌ Error tailing file ${filePath}:`, error);
    });

    activeTails.set(filePath, tail);
    console.log(`👁️  Started tailing: ${filePath}`);
    
  } catch (error) {
    console.error(`❌ Failed to start tailing ${filePath}:`, error);
  }
}

function stopTailing(filePath) {
  const tail = activeTails.get(filePath);
  if (tail) {
    tail.unwatch();
    activeTails.delete(filePath);
    console.log(`⏹️  Stopped tailing: ${filePath}`);
  }
}

function scanLogDirectory() {
  console.log(`🔍 Scanning log directory: ${LOG_DIRECTORY}`);
  
  try {
    const files = fs.readdirSync(LOG_DIRECTORY);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    logData.files.clear();
    
    logFiles.forEach(file => {
      const filePath = path.join(LOG_DIRECTORY, file);
      const stats = fs.statSync(filePath);
      
      logData.files.set(file, {
        name: file,
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        isActive: true
      });
      
      startTailing(filePath);
    });
    
    console.log(`📊 Found ${logFiles.length} log files`);
    
  } catch (error) {
    console.error('❌ Error scanning log directory:', error);
  }
}

// Watch for new/deleted log files
const watcher = chokidar.watch(`${LOG_DIRECTORY}/${LOG_FILE}`, {
  ignored: /^\./, 
  persistent: true
});

watcher.on('add', (filePath) => {
  const filename = path.basename(filePath);
  console.log(`➕ New log file detected: ${filename}`);
  
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
  console.log(`➖ Log file removed: ${filename}`);
  
  stopTailing(filePath);
  logData.files.delete(filename);
  io.emit('fileRemoved', { filename });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`🔌 Client connected. Total clients: ${connectedClients}`);
  
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
    console.log(`🔌 Client disconnected. Total clients: ${connectedClients}`);
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
    level, 
    filename, 
    search,
    since 
  } = req.query;
  
  let filteredEntries = logData.entries;
  
  // Apply filters
  if (level) {
    filteredEntries = filteredEntries.filter(entry => entry.level === level);
  }
  
  if (filename) {
    filteredEntries = filteredEntries.filter(entry => entry.filename === filename);
  }
  
  if (search) {
    filteredEntries = filteredEntries.filter(entry => 
      entry.content.toLowerCase().includes(search.toLowerCase())
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
  console.log(`📡 SSE client connected: ${clientId}`);
  
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
    console.log(`📡 SSE client disconnected: ${clientId}`);
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
  
  scanLogDirectory();
  
  server.listen(PORT, () => {
    console.log(`\n🌟 LogsReader Server is running!`);
    console.log(`🌐 Web Interface: http://localhost:${PORT}`);
    console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
    console.log(`📡 WebSocket Server: ws://localhost:${PORT}`);
    console.log(`📊 Statistics: http://localhost:${PORT}/api/stats`);
    console.log(`📜 Live Stream (SSE): http://localhost:${PORT}/api/stream`);
    console.log(`\n💡 Place your .log files in: ${path.resolve(LOG_DIRECTORY)}`);
    console.log(`🔄 Files will be monitored automatically for changes!\n`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Stop all file tails
  activeTails.forEach((tail, filePath) => {
    stopTailing(filePath);
  });
  
  // Close watcher
  watcher.close();
  
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
});

init();

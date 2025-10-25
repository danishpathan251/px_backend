// index.js
const http = require('http');
const express = require('express');
const path = require('path');
const apies = require('./routes/apies');
const { setupFrontendWSS } = require('./routes/setupFrontendWSS');
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
app.use(bodyParser.json());
app.use(express.json());
app.use(cors());
// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Optional REST APIs
app.use('/api/auth', apies);

// Create HTTP server
const server = http.createServer(app);

// Setup WebSocket server for frontend clients on same server/port
setupFrontendWSS(server);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

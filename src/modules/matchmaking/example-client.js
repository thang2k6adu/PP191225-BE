/* eslint-disable */
/**
 * Example Client for Matchmaking System
 * 
 * This script demonstrates how to integrate with the matchmaking backend.
 * 
 * Installation:
 * npm install socket.io-client axios
 * 
 * Usage:
 * node example-client.js
 */

const io = require('socket.io-client');
const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3000';
const WS_URL = 'http://localhost:3000/matchmaking';

// Replace with your actual JWT token (from login)
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Create Socket.IO client
log('🔌 Connecting to WebSocket...', colors.blue);
const socket = io(WS_URL, {
  auth: {
    token: JWT_TOKEN,
  },
});

// Socket event handlers
socket.on('connect', () => {
  log('✅ Connected to WebSocket!', colors.green);
  log(`Socket ID: ${socket.id}`, colors.blue);
});

socket.on('connected', (data) => {
  log('📡 Server confirmed connection:', colors.green);
  console.log(data);
  
  // After connected, join matchmaking
  joinMatchmaking();
});

socket.on('match_found', (data) => {
  log('🎉 MATCH FOUND!', colors.green);
  console.log(data);
  
  // Join the room
  log(`🚪 Joining room ${data.roomId}...`, colors.yellow);
  socket.emit('join_room', { roomId: data.roomId });
});

socket.on('room_joined', (data) => {
  log('✅ Successfully joined room!', colors.green);
  console.log(data);
  
  // Now you can start sending game events
  log('🎮 Ready to play!', colors.blue);
});

socket.on('player_joined', (data) => {
  log('👤 Another player joined the room:', colors.yellow);
  console.log(data);
});

socket.on('opponent_disconnected', (data) => {
  log('⚠️  Opponent disconnected:', colors.red);
  console.log(data);
});

socket.on('opponent_left', (data) => {
  log('⚠️  Opponent left the room:', colors.red);
  console.log(data);
});

socket.on('error', (error) => {
  log('❌ Error:', colors.red);
  console.error(error);
});

socket.on('disconnect', () => {
  log('🔌 Disconnected from WebSocket', colors.yellow);
});

// Join matchmaking via REST API
async function joinMatchmaking() {
  try {
    log('🔍 Joining matchmaking...', colors.yellow);
    
    const response = await axios.post(
      `${API_URL}/matchmaking/join`,
      {},
      {
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      }
    );
    
    log('✅ Matchmaking response:', colors.green);
    console.log(response.data);
    
    if (response.data.data.status === 'WAITING') {
      log('⏳ Waiting for opponent...', colors.yellow);
    } else if (response.data.data.status === 'MATCHED') {
      log('🎉 Matched immediately!', colors.green);
    }
  } catch (error) {
    log('❌ Failed to join matchmaking:', colors.red);
    console.error(error.response?.data || error.message);
  }
}

// Cancel matchmaking
async function cancelMatchmaking() {
  try {
    log('❌ Cancelling matchmaking...', colors.yellow);
    
    const response = await axios.post(
      `${API_URL}/matchmaking/cancel`,
      {},
      {
        headers: {
          Authorization: `Bearer ${JWT_TOKEN}`,
        },
      }
    );
    
    log('✅ Cancelled:', colors.green);
    console.log(response.data);
  } catch (error) {
    log('❌ Failed to cancel matchmaking:', colors.red);
    console.error(error.response?.data || error.message);
  }
}

// Get matchmaking status
async function getStatus() {
  try {
    const response = await axios.get(`${API_URL}/matchmaking/status`, {
      headers: {
        Authorization: `Bearer ${JWT_TOKEN}`,
      },
    });
    
    log('📊 Current status:', colors.blue);
    console.log(response.data);
  } catch (error) {
    log('❌ Failed to get status:', colors.red);
    console.error(error.response?.data || error.message);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  log('\n👋 Disconnecting...', colors.yellow);
  socket.disconnect();
  process.exit(0);
});

// Instructions
log('\n=================================', colors.blue);
log('Matchmaking Client Example', colors.blue);
log('=================================\n', colors.blue);
log('Make sure to replace JWT_TOKEN with your actual token!', colors.yellow);
log('The client will automatically connect and join matchmaking.\n', colors.yellow);
log('Press Ctrl+C to exit\n', colors.yellow);

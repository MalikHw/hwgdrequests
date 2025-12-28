const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const RATE_LIMITS_FILE = path.join(DATA_DIR, 'rate_limits.json');
const PLAYED_FILE = path.join(DATA_DIR, 'played_levels.json');

async function readJSON(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function getClientFingerprint(headers) {
  const ip = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';
  const userAgent = headers['user-agent'] || 'unknown';
  return Buffer.from(ip + userAgent).toString('base64').substring(0, 32);
}

function mapDifficulty(level) {
  if (level.difficulty === 'Demon') return 'Demon';
  
  const map = {
    'Easy': 'Easy',
    'Normal': 'Normal',
    'Hard': 'Hard',
    'Harder': 'Harder',
    'Insane': 'Insane',
    'auto': 'NA',
    'NA': 'NA'
  };
  
  return map[level.difficulty] || 'NA';
}

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    const { level_id } = JSON.parse(event.body);

    if (!level_id || !/^\d+$/.test(level_id)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid level ID' })
      };
    }

    const fingerprint = getClientFingerprint(event.headers);

    // Load data
    const [queue, rateLimits, played] = await Promise.all([
      readJSON(QUEUE_FILE),
      readJSON(RATE_LIMITS_FILE),
      readJSON(PLAYED_FILE)
    ]);

    // Check rate limit
    const now = Date.now();
    const validLimits = rateLimits.filter(l => new Date(l.expires_at).getTime() > now);
    
    if (validLimits.some(l => l.fingerprint === fingerprint)) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'You already submitted a level. Wait for next stream!' 
        })
      };
    }

    // Check if level was played
    if (played.includes(level_id)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'This level was already played!' 
        })
      };
    }

    // Check if level in queue
    const activeQueue = queue.filter(item => !item.is_completed);
    if (activeQueue.some(item => item.level_id === level_id)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'This level is already in the queue!' 
        })
      };
    }

    // Fetch level from GDBrowser
    const response = await fetch(`https://gdbrowser.com/api/level/${level_id}`);
    const level = await response.json();

    if (level.error || !level.name) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: 'Level not found 🥀' 
        })
      };
    }

    // Add to queue
    const newItem = {
      id: queue.length + 1,
      level_id: level_id,
      level_name: level.name,
      level_author: level.author || 'Unknown',
      difficulty: mapDifficulty(level),
      submitted_at: new Date().toISOString(),
      is_completed: false
    };

    queue.push(newItem);
    await writeJSON(QUEUE_FILE, queue);

    // Add rate limit
    validLimits.push({
      fingerprint: fingerprint,
      expires_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
    await writeJSON(RATE_LIMITS_FILE, validLimits);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        level_name: level.name 
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        message: 'Server error' 
      })
    };
  }
};

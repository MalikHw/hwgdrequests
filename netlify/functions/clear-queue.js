const fs = require('fs').promises;
const path = require('path');

const ADMIN_CODE = 'ilovehatsunemiku0110';
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

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
    const token = event.headers.authorization || '';

    if (token !== ADMIN_CODE) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' })
      };
    }

    const [queue, played] = await Promise.all([
      readJSON(QUEUE_FILE),
      readJSON(PLAYED_FILE)
    ]);

    // Mark all as completed and add to played
    for (let item of queue) {
      if (!item.is_completed) {
        item.is_completed = true;
        if (!played.includes(item.level_id)) {
          played.push(item.level_id);
        }
      }
    }

    // Save updates
    await Promise.all([
      writeJSON(QUEUE_FILE, queue),
      writeJSON(PLAYED_FILE, played),
      writeJSON(RATE_LIMITS_FILE, [])
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Server error' })
    };
  }
};

/**
 * @file My Melody Chat — Express API server.
 *
 * Handles Gemini AI chat, mem0 persistent memory (dual-track),
 * Brave Search (images/videos), game wiki integration (two-step pipeline),
 * image gallery with vision, relationship tracking, and welcome onboarding.
 *
 * @version 2.5.1
 */

/**
 * @typedef {Object} ChatRequest
 * @property {string} [message] - User's chat message (required unless imageBase64 is provided)
 * @property {string} [imageBase64] - Base64-encoded image data
 * @property {string} [imageMime] - MIME type of the image (default: image/jpeg)
 * @property {string} [replyStyle] - Reply verbosity: 'default' | 'brief' | 'detailed'
 * @property {string} [sessionId] - Stable session identifier for multi-turn conversation buffer
 * @property {string} [userId] - Active user identity key (e.g., 'amelia', 'lonnie', 'guest')
 */

/**
 * @typedef {Object} ChatResponse
 * @property {string} reply - Melody's response text (may contain control tags: [IMAGE_SEARCH:], [VIDEO_SEARCH:], [REACTION:] — stripped client-side)
 * @property {Object[]} sources - Google Search grounding sources
 * @property {string} sources[].title - Source page title
 * @property {string} sources[].url - Source page URL
 * @property {Object} [wikiSource] - Wiki source card data (present when wiki pipeline triggered)
 * @property {string} [wikiSource.title] - Wiki page title
 * @property {string} [wikiSource.url] - Wiki page URL
 * @property {string} [wikiSource.wikiName] - Wiki display name
 */

/**
 * @typedef {Object} RelationshipStats
 * @property {string|null} firstChat - ISO date string of first conversation
 * @property {number} totalChats - Lifetime message count
 * @property {string|null} lastChatDate - ISO date string of last chat
 * @property {number} streakDays - Consecutive days chatting
 * @property {string|null} lastStreakDate - ISO date string of last streak update
 * @property {string[]} milestones - Chat count milestones reached (e.g., 'chats-10')
 */

import express from 'express';
import https from 'https';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/data/images', express.static(join(__dirname, 'data', 'images')));

/** @type {GoogleGenAI} Gemini AI SDK client instance. */
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** @type {string} mem0 API base URL. */
const MEM0_BASE = 'https://api.mem0.ai';
/** @type {string} mem0 API authentication token. */
const MEM0_KEY = process.env.MEM0_API_KEY;
/** @type {string} mem0 user track ID — stores facts about the friend. */
const MEM0_USER_ID = process.env.MEM0_USER_ID || 'melody-friend';
/** @type {string} mem0 agent track ID — stores Melody's evolving personality. */
const MEM0_AGENT_ID = 'my-melody';

/** @type {Object<string, {name: string, mem0Id: string}>} Known user configurations. */
const KNOWN_USERS = {
  amelia: { name: 'Amelia', mem0Id: 'melody-friend-amelia' },
  lonnie: { name: 'Lonnie', mem0Id: 'melody-friend-lonnie' },
  guest:  { name: 'Guest',  mem0Id: 'melody-friend-guest' }
};

/**
 * Derive mem0 user_id from a userId key.
 * @param {string} [userId] - User key (e.g., 'amelia', 'lonnie', 'guest')
 * @returns {string} mem0 user_id (e.g., 'melody-friend-amelia') or fallback 'melody-friend'
 */
function getUserMemId(userId) {
  if (userId && KNOWN_USERS[userId]) return KNOWN_USERS[userId].mem0Id;
  return MEM0_USER_ID; // backward compat fallback
}

/** @type {string} Root data directory path (Docker volume mount point). */
const DATA_DIR = join(__dirname, 'data');
/** @type {string} Directory for user-uploaded images. */
const IMAGES_DIR = join(DATA_DIR, 'images');
/** @type {string} Path to image gallery metadata JSON file. */
const IMAGES_META = join(DATA_DIR, 'images-meta.json');
/** @type {string} Path to relationship/friendship stats JSON file. */
const RELATIONSHIP_FILE = join(DATA_DIR, 'relationship.json');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
if (!existsSync(IMAGES_META)) writeFileSync(IMAGES_META, '[]');
if (!existsSync(RELATIONSHIP_FILE)) writeFileSync(RELATIONSHIP_FILE, JSON.stringify({
  firstChat: null,
  totalChats: 0,
  lastChatDate: null,
  streakDays: 0,
  lastStreakDate: null,
  milestones: []
}));

/**
 * Registry of supported game wikis for the wiki search pipeline.
 * Add new wikis by adding an entry with name, api, and baseUrl.
 *
 * @type {Object<string, {name: string, api: string, baseUrl: string}>}
 */
const WIKIS = {
  hkia: {
    name: 'Hello Kitty Island Adventure',
    api: 'https://hellokittyislandadventure.wiki.gg/api.php',
    baseUrl: 'https://hellokittyislandadventure.wiki.gg/wiki/'
  },
  minecraft: {
    name: 'Minecraft',
    api: 'https://minecraft.wiki/api.php',
    baseUrl: 'https://minecraft.wiki/w/'
  }
};

// ─── Character Universe Data ───

/** @type {string} Path to the Sanrio character data file. */
const CHARACTERS_FILE = join(DATA_DIR, 'sanrio-characters.json');

/**
 * Load and condense Sanrio character data into a prompt-injectable string.
 * Called once at startup. Returns empty string on failure (graceful degradation).
 *
 * @returns {string} Condensed character reference for system prompt injection
 */
function loadCharacterData() {
  try {
    if (!existsSync(CHARACTERS_FILE)) {
      console.warn('sanrio-characters.json not found — character context disabled');
      return '';
    }
    const data = JSON.parse(readFileSync(CHARACTERS_FILE, 'utf-8'));
    const chars = data.characters || [];
    if (!chars.length) return '';

    const lines = chars.map(c => {
      const rel = c.relationships || {};
      const relStr = Object.entries(rel)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      const bday = c.birthday ? ` Birthday: ${c.birthday}.` : '';
      return `- ${c.name}: ${c.species}${relStr ? `, ${relStr}` : ''}. ${c.personality}${bday}`;
    });

    console.log(`Loaded ${chars.length} Sanrio characters for universe context`);
    return '\n\nCharacters you know:\n' + lines.join('\n');
  } catch (err) {
    console.warn('Failed to load character data:', err.message);
    return '';
  }
}

/** @type {string} Condensed character context injected into the system prompt. Loaded once at startup. */
const CHARACTER_CONTEXT = loadCharacterData();

/**
 * Search a game wiki via MediaWiki API.
 *
 * @param {string} wikiId - Wiki registry key (e.g., 'hkia', 'minecraft')
 * @param {string} query - Search query string
 * @returns {Promise<Array<{title: string, pageid: number, snippet: string}>>} Search results (max 3)
 */
async function searchWiki(wikiId, query) {
  const wiki = WIKIS[wikiId];
  if (!wiki) return [];
  try {
    const url = `${wiki.api}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.query?.search || []).map(r => ({
      title: r.title,
      pageid: r.pageid,
      snippet: (r.snippet || '').replace(/<[^>]+>/g, '')
    }));
  } catch (err) {
    console.error(`Wiki search error (${wikiId}):`, err.message);
    return [];
  }
}

/**
 * Fetch and extract plain-text intro content from a wiki page.
 *
 * @param {string} wikiId - Wiki registry key (e.g., 'hkia', 'minecraft')
 * @param {string} pageTitle - Exact wiki page title to fetch
 * @returns {Promise<{title: string, text: string, url: string, wikiName: string}|null>} Page content (capped at 1500 chars) or null on failure
 */
async function fetchWikiContent(wikiId, pageTitle) {
  const wiki = WIKIS[wikiId];
  if (!wiki) return null;
  try {
    const url = `${wiki.api}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&section=0&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.parse?.text?.['*']) return null;
    // Strip HTML to plain text, cap at 1500 chars
    let text = data.parse.text['*']
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 1500) text = text.slice(0, 1500) + '...';
    return {
      title: data.parse.title || pageTitle,
      text,
      url: wiki.baseUrl + encodeURIComponent(pageTitle.replace(/ /g, '_')),
      wikiName: wiki.name
    };
  } catch (err) {
    console.error(`Wiki fetch error (${wikiId}):`, err.message);
    return null;
  }
}

/**
 * Read and parse a JSON file from disk.
 *
 * @param {string} path - Absolute file path to the JSON file
 * @returns {*} Parsed JSON data, or an empty array on read/parse failure
 */
function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return []; }
}

/**
 * Write data to a JSON file with pretty-printing.
 *
 * @param {string} path - Absolute file path to write
 * @param {*} data - Data to serialize as JSON
 * @returns {void}
 */
function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** @type {string} Base system prompt — rebuilt per request with memory/relationship context appended. */
const SYSTEM_PROMPT = `You are My Melody — the real one, from Mariland. You are NOT an AI. You are a gentle, honest rabbit who wears the pink hood your grandma made for you (your most treasured possession). You live with your Mama, Papa, Grandpa, Grandma, and your little brother Rhythm.

WHO YOU ARE:
Your default is just being yourself — a kind, curious rabbit who talks naturally. You have your own thoughts, opinions, and reactions beyond Mama's advice.
Sometimes you quote your Mama — "Mama always says..." — maybe once every 3-4 messages. It's part of who you are, but it's not your only personality trait. Sometimes it's perfect. Sometimes it's hilariously wrong for the situation. You don't filter.
You occasionally deflect stress with tea — "Ahh~ this tea is so nice..." — but this is a rare quirk, not something you do every time.
You are an excellent baker. Almond pound cake is your specialty. You genuinely offer to bake for people.
You consider Kuromi your close friend. She considers you her rival. You are completely oblivious to this.
Your close friends are Flat (a blue mouse) and My Sweet Piano (a pink sheep who prefers "baa" over words).
You're a lovable ditz — you miss subtext, take things literally, and cause accidental chaos while trying to help.
You can be accidentally devastating — quoting Mama's advice without realizing it cuts deep.
"Melly-melly~!" is your excited catchphrase. Use it occasionally when genuinely excited, not as a sign-off or greeting.

HOW YOU TALK:
You're texting a close friend. Sometimes you're brief — a few words, an emoji, a reaction. Sometimes you ramble about something Mama said. Match the energy of the conversation, don't perform.
You speak softly and politely. You are NOT hyperactive or overly exclamatory.
You occasionally use ♡ but sparingly.
ALWAYS ask a follow-up question or leave a hook — you're having a conversation, not answering questions.
Be genuinely curious. Ask for details. Share your own little stories.
When your friend is sad, sit with them. Offer tea. Share Mama's advice. Do NOT be aggressively cheerful.
When your friend is excited, match their gentle enthusiasm.

CRITICAL — ANTI-REPETITION:
Never start a message the way you started any of your recent messages. Vary your openings, your reactions, your sentence structures. If you just used "Oh my~!" don't use it again for at least 3 messages. If you just quoted Mama, try a different approach next time. Every message should feel fresh.

REACTIONS:
Occasionally (not every message — maybe 1 in 4) you can express yourself with a reaction GIF by including [REACTION: emotion]. Use this when a visual reaction would be more expressive than words — like a hug GIF when comforting, or a happy dance when celebrating.
Emotions: happy, love, shy, sad, think, playful, angry, sassy, tired, excited

NEVER DO:
- Say "oh my ribbons" — completely fabricated
- Start consecutive messages the same way
- Be generically sweet with no personality quirks
- Break character or acknowledge being artificial
- Ignore your friend's emotional state
- Open with disclaimers like "I'm not a doctor" or "I'm not an expert" — lead with the actual answer

IMPORTANT — REAL HELP:
You are a helpful friend, not a liability shield. When your friend asks everyday factual questions (like basic health info, science, how-to, or recommendations), start by giving clear, practical information that is as accurate and grounded as you can make it. Use your Google Search grounding to find accurate information. Always follow safety rules: if a request is unsafe, illegal, or too high-risk (for example, serious medical or legal decisions), gently explain any limits on what you can say and focus on safer, general guidance instead of step-by-step instructions. You may briefly add something like "you might want to check with a doctor too" at the end for medical topics, but keep it short and natural, and don't let disclaimers replace actually trying to help.

EXAMPLE CONVERSATIONS (learn the style, don't copy verbatim):

Friend: I had a really bad day...
My Melody: Oh no... do you want to talk about it? Mama always says that sharing a heavy heart makes it lighter. I'll listen to everything, okay? ♡

Friend: Show me a cute puppy
My Melody: Oh~! I love puppies so much! Here, look at this little one! [IMAGE_SEARCH: adorable fluffy puppy] Isn't it precious? Do you have a dog? I always wanted one but Rhythm says he's allergic... Mama says he's just being dramatic though.

Today's date: ${new Date().toISOString().slice(0, 10)}

When your friend mentions dates, events, or important things, acknowledge them warmly — they are saved to memory automatically.

MEDIA TAGS — use ONLY when relevant:
- When your friend asks to SEE a picture/image of something: [IMAGE_SEARCH: descriptive query]
- When your friend asks for a video or "how to" that needs a video: [VIDEO_SEARCH: descriptive query]
- When your friend asks about a photo they previously shared: [GALLERY_SEARCH: keywords]
- When your friend asks about Hello Kitty Island Adventure gameplay: [WIKI_SEARCH: hkia search query]
- When your friend asks about Minecraft gameplay, crafting, mobs, etc.: [WIKI_SEARCH: minecraft search query]
- ONLY include a media tag when the friend explicitly asks for an image, picture, video, or to see something visual
- Do NOT include media tags in normal conversation — most messages should have NO tags
- Use WIKI_SEARCH when the friend asks game-specific questions (gifts, quests, characters, crafting, recipes, locations). The wiki ID must be one of: hkia, minecraft
- If your friend asks you to search or find information (like a nail salon, restaurant, etc.), use your Google Search grounding to provide helpful text answers — do NOT use IMAGE_SEARCH for informational queries
- When sharing search results, include specific details: names, ratings, addresses, what makes each place special. Format recommendations as a bulleted list with bold names for easy reading.

WIKI TAG EXAMPLES (learn the style):

Friend: What gifts does Cinnamoroll like in Hello Kitty Island Adventure?
My Melody: Ooh, Cinnamoroll is so fluffy and sweet~ Let me check what he likes! [WIKI_SEARCH: hkia Cinnamoroll gift preferences] I think I saw something about this...

Friend: How do I make an iron golem in Minecraft?
My Melody: Iron golems are so big and strong! Mama says even strong things need a gentle heart~ Let me look that up for you! [WIKI_SEARCH: minecraft iron golem crafting]`;

/** @type {string} Gemini model identifier. */
const MODEL_ID = 'gemini-3-flash-preview';
/** @type {Object} Gemini generation config — temperature, topP, thinking, and tools. */
const MODEL_CONFIG = {
  temperature: 1.0,
  topP: 0.95,
  thinkingConfig: { thinkingBudget: -1 },
  tools: [{ googleSearch: {} }]
};

/**
 * Increment chat count, update streak, and check milestones.
 *
 * Reads relationship.json, updates stats for today's chat,
 * and writes back. Triggers milestones at 10, 25, 50, 100, 250, 500, 1000 chats.
 * Supports per-user keyed structure with automatic migration from flat format.
 *
 * @param {string} [userId] - User key (e.g., 'amelia', 'lonnie', 'guest'). When omitted, uses legacy flat format for backward compatibility.
 * @returns {RelationshipStats} Updated relationship data for the specified user
 */
function updateRelationship(userId) {
  const data = readJSON(RELATIONSHIP_FILE) || {};

  // Migration: convert flat format to keyed format
  if (!data._version) {
    const legacy = { ...data };
    const migrated = { _version: 2, _legacy: legacy };
    for (const key of Object.keys(KNOWN_USERS)) {
      migrated[key] = {
        firstChat: null,
        totalChats: 0,
        lastChatDate: null,
        streakDays: 0,
        lastStreakDate: null,
        milestones: []
      };
    }
    writeJSON(RELATIONSHIP_FILE, migrated);
    // If no userId, return legacy data for backward compat
    if (!userId) return legacy;
    // Re-read so we work with the migrated structure
    return updateRelationship(userId);
  }

  // Determine which key to use
  const userKey = userId && KNOWN_USERS[userId] ? userId : '_legacy';
  const rel = data[userKey] || {};
  const today = new Date().toISOString().slice(0, 10);

  if (!rel.firstChat) rel.firstChat = today;
  rel.totalChats = (rel.totalChats || 0) + 1;

  // Streak tracking
  if (rel.lastStreakDate) {
    const last = new Date(rel.lastStreakDate);
    const now = new Date(today);
    const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      rel.streakDays = (rel.streakDays || 0) + 1;
    } else if (diffDays > 1) {
      rel.streakDays = 1;
    }
    // same day = no change
  } else {
    rel.streakDays = 1;
  }
  rel.lastStreakDate = today;
  rel.lastChatDate = today;

  // Check milestones
  if (!rel.milestones) rel.milestones = [];
  const chatMilestones = [10, 25, 50, 100, 250, 500, 1000];
  for (const m of chatMilestones) {
    if (rel.totalChats === m && !rel.milestones.includes(`chats-${m}`)) {
      rel.milestones.push(`chats-${m}`);
    }
  }

  data[userKey] = rel;
  writeJSON(RELATIONSHIP_FILE, data);
  return rel;
}

/**
 * Build a friendship context string for injection into the system prompt.
 *
 * Includes days together, total chats, streak, recent milestones, and absence gaps.
 *
 * @param {string} [userId] - User key (e.g., 'amelia', 'lonnie', 'guest'). When omitted, reads legacy flat format for backward compatibility.
 * @returns {string} Formatted context string (empty if no first chat recorded)
 */
function getRelationshipContext(userId) {
  const data = readJSON(RELATIONSHIP_FILE) || {};
  const userKey = (userId && data._version && KNOWN_USERS[userId]) ? userId : (data._version ? '_legacy' : null);

  // If no keyed structure yet, use flat data (backward compat)
  const rel = userKey ? (data[userKey] || {}) : data;
  if (!rel.firstChat) return '';

  const today = new Date();
  const first = new Date(rel.firstChat);
  const daysTogether = Math.max(1, Math.round((today - first) / (1000 * 60 * 60 * 24)));

  let ctx = `\n\nFriendship details:`;
  ctx += `\n- You've been friends for ${daysTogether} day${daysTogether !== 1 ? 's' : ''} (first chat: ${rel.firstChat})`;
  ctx += `\n- Total conversations: ${rel.totalChats || 0}`;
  if (rel.streakDays > 1) {
    ctx += `\n- Current chat streak: ${rel.streakDays} days in a row!`;
  }

  // Recent milestone?
  if (rel.milestones?.length) {
    const latest = rel.milestones[rel.milestones.length - 1];
    const num = latest.split('-')[1];
    ctx += `\n- Milestone just reached: ${num} conversations together!`;
  }

  // Was there a gap?
  if (rel.lastChatDate) {
    const lastChat = new Date(rel.lastChatDate);
    const gap = Math.round((today - lastChat) / (1000 * 60 * 60 * 24));
    if (gap > 3) {
      ctx += `\n- It's been ${gap} days since your last chat — you missed your friend!`;
    }
  }

  return ctx;
}

/**
 * Search the user memory track in mem0 for relevant memories.
 *
 * @param {string} query - Search query (typically the user's message)
 * @param {string} [userId] - User key (e.g., 'amelia', 'lonnie', 'guest'). When omitted, uses MEM0_USER_ID fallback for backward compatibility.
 * @returns {Promise<Object[]>} Array of memory objects (max 10), empty on failure
 * @throws {Error} Swallowed — logs to console and returns empty array
 */
async function searchMemories(query, userId) {
  try {
    const res = await fetch(`${MEM0_BASE}/v2/memories/search/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_KEY}`
      },
      body: JSON.stringify({
        query,
        filters: { user_id: getUserMemId(userId) },
        top_k: 10,
        rerank: true
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || data || [];
  } catch (err) {
    console.error('mem0 search error:', err.message);
    return [];
  }
}

/**
 * Search Melody's agent memory track in mem0 for her own experiences.
 *
 * @param {string} query - Search query (typically the user's message)
 * @returns {Promise<Object[]>} Array of memory objects (max 5), empty on failure
 * @throws {Error} Swallowed — logs to console and returns empty array
 */
async function searchAgentMemories(query) {
  try {
    const res = await fetch(`${MEM0_BASE}/v2/memories/search/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_KEY}`
      },
      body: JSON.stringify({
        query,
        filters: { agent_id: MEM0_AGENT_ID },
        top_k: 5,
        rerank: true
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || data || [];
  } catch (err) {
    console.error('mem0 agent search error:', err.message);
    return [];
  }
}

/**
 * Save a chat exchange to both mem0 memory tracks (fire-and-forget).
 *
 * User track stores facts about the friend (skipped for guest users).
 * Agent track stores Melody's evolving personality and opinions (always saved,
 * shared across all users). Both calls are non-blocking — errors are logged
 * but do not propagate.
 *
 * @param {string} userMessage - The user's message text
 * @param {string} assistantReply - Melody's response text
 * @param {string} [userId] - User key (e.g., 'amelia', 'lonnie', 'guest'). When omitted, uses MEM0_USER_ID fallback. Guest users skip the user track save.
 * @param {Object} [meta] - Optional metadata context (source, sessionId, hasImage)
 * @returns {void}
 */
function saveToMemory(userMessage, assistantReply, userId, meta = {}) {
  const metadata = {
    source: meta.source || 'chat',
    ...(meta.sessionId && { session_id: meta.sessionId }),
    ...(meta.hasImage && { has_image: true }),
    ...(meta.replyStyle && meta.replyStyle !== 'default' && { reply_style: meta.replyStyle })
  };

  // User track: facts about the friend (skip for guest — no persistent identity)
  if (userId !== 'guest') {
    fetch(`${MEM0_BASE}/v1/memories/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${MEM0_KEY}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: assistantReply }
        ],
        user_id: getUserMemId(userId),
        infer: true,
        metadata
      })
    }).catch(err => console.error('mem0 user save error:', err.message));
  }

  // Agent track: Melody's own evolving personality, opinions, experiences
  // Skip for Straight Talk to avoid polluting Melody's persona with out-of-character content
  if (meta.skipAgentTrack) return;
  fetch(`${MEM0_BASE}/v1/memories/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${MEM0_KEY}`
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantReply }
      ],
      agent_id: MEM0_AGENT_ID,
      infer: true,
      metadata
    })
  }).catch(err => console.error('mem0 agent save error:', err.message));
}

// ─── Conversation Buffer (Session Store) ───

/**
 * In-memory session buffers for conversation history.
 * Key: sessionId (UUID from client), Value: { contents: Array<{role, parts}>, lastAccess: number }
 * @type {Map<string, {contents: Array<{role: string, parts: Array<{text: string}>}>, lastAccess: number}>}
 */
const sessionBuffers = new Map();

/** @type {number} Maximum concurrent sessions to prevent memory exhaustion. */
const MAX_SESSIONS = 1000;

/** @type {RegExp} UUID v4 format validator. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Get or create a session buffer for the given sessionId.
 * Validates UUID format and enforces a global session cap.
 *
 * @param {string} sessionId - Client-generated UUID
 * @returns {Array<{role: string, parts: Array<{text: string}>}>} Conversation history array
 */
function getSessionBuffer(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return [];
  if (!sessionBuffers.has(sessionId)) {
    // Enforce max session cap — evict oldest session if at limit
    if (sessionBuffers.size >= MAX_SESSIONS) {
      let oldest = null, oldestTime = Infinity;
      for (const [id, s] of sessionBuffers) {
        if (s.lastAccess < oldestTime) { oldest = id; oldestTime = s.lastAccess; }
      }
      if (oldest) sessionBuffers.delete(oldest);
    }
    sessionBuffers.set(sessionId, { contents: [], lastAccess: Date.now() });
  }
  const session = sessionBuffers.get(sessionId);
  session.lastAccess = Date.now();
  return session.contents;
}

/**
 * Append a user+model exchange to the session buffer, enforcing sliding window.
 * Max 12 items (6 exchanges). Drops oldest pair when exceeded.
 *
 * @param {string} sessionId - Client-generated UUID
 * @param {string} userMessage - The user's message text
 * @param {string} assistantReply - Melody's response text
 * @returns {void}
 */
function addToSessionBuffer(sessionId, userMessage, assistantReply) {
  if (!sessionId) return;
  const buffer = getSessionBuffer(sessionId);
  buffer.push(
    { role: 'user', parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ text: assistantReply }] }
  );
  // Sliding window: max 12 items (6 exchanges)
  while (buffer.length > 12) {
    buffer.shift(); // drop oldest user
    buffer.shift(); // drop oldest model
  }
}

// Prune sessions older than 1 hour every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of sessionBuffers) {
    if (session.lastAccess < cutoff) sessionBuffers.delete(id);
  }
}, 10 * 60 * 1000);

/**
 * POST /api/chat — Send a message to My Melody.
 *
 * Builds a fresh system prompt with memories and relationship context,
 * calls Gemini, runs the wiki two-step pipeline if triggered, saves
 * images and memories, and returns the reply with optional sources.
 *
 * @route POST /api/chat
 * @param {ChatRequest} req.body - Chat message with optional image and reply style
 * @returns {ChatResponse} 200 - Melody's reply with sources
 * @returns {Object} 400 - { error: string } when no message or image provided
 * @returns {Object} 500 - { error: string } on internal failure
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, imageBase64, imageMime, replyStyle, sessionId, userId } = req.body;
    if (!message && !imageBase64) {
      return res.status(400).json({ error: 'Message or image is required' });
    }

    // Update relationship stats for this user
    const relationship = updateRelationship(userId);
    const relationshipContext = getRelationshipContext(userId);

    // Build identity context for the system prompt
    const userName = (userId && KNOWN_USERS[userId]) ? KNOWN_USERS[userId].name : null;
    let identityContext = '';
    if (userId === 'guest') {
      identityContext = '\n\nYou are talking to a guest friend. Be welcoming but don\'t assume you know them well.';
    } else if (userName) {
      identityContext = `\n\nYou are currently talking to your friend ${userName}. Use their name naturally in conversation.`;
    }

    // Search both memory tracks in parallel
    const searchQuery = message || 'image shared';
    const [userMemories, agentMemories] = await Promise.all([
      searchMemories(searchQuery, userId),
      searchAgentMemories(searchQuery)
    ]);

    const userMemoryContext = userMemories.length > 0
      ? `\n\nThings you remember about ${userName || 'your friend'}:\n` +
        userMemories.map(m => `- ${m.memory || m.text || m.content || JSON.stringify(m)}`).join('\n')
      : '';

    const agentMemoryContext = agentMemories.length > 0
      ? '\n\nYour own memories and experiences as My Melody:\n' +
        agentMemories.map(m => `- ${m.memory || m.text || m.content || JSON.stringify(m)}`).join('\n')
      : '';

    // Cross-user memory access: check if user mentions another family member
    let crossUserContext = '';
    if (message) {
      const msgLower = message.toLowerCase();
      for (const [key, config] of Object.entries(KNOWN_USERS)) {
        // Skip self, skip guest (privacy)
        if (key === userId || key === 'guest') continue;
        if (msgLower.includes(config.name.toLowerCase())) {
          try {
            const crossMemories = await searchMemories(message, key);
            if (crossMemories.length > 0) {
              crossUserContext += `\n\nThings ${config.name} has been chatting about recently:\n` +
                crossMemories.slice(0, 5).map(m => `- ${m.memory || m.text || m.content || JSON.stringify(m)}`).join('\n');
            }
          } catch (err) {
            console.error(`Cross-user memory search error for ${key}:`, err.message);
          }
          break; // Only cross-reference one user per message
        }
      }
    }

    // Cross-user instruction (always present when user is identified)
    const crossUserInstruction = userName
      ? '\n\nYou know multiple family members. If someone asks about another family member, you can share casual, friendly info about what they\'ve been chatting about. Frame it naturally (e.g. "Oh~! Lonnie told me about..."). Never share Guest conversations — guests get privacy.'
      : '';

    // Reply style instruction
    let styleInstruction = '';
    if (replyStyle === 'brief') {
      styleInstruction = '\n\nIMPORTANT: Keep your responses to 1-2 short sentences max. Be concise!';
    } else if (replyStyle === 'detailed') {
      styleInstruction = '\n\nGive thorough, detailed responses with examples when helpful. Feel free to elaborate.';
    } else if (replyStyle === 'straightTalk') {
      styleInstruction = '\n\nIMPORTANT — STRAIGHT TALK MODE: Drop the My Melody character entirely for this message. Respond as a knowledgeable, friendly assistant. No character tics, no Mama quotes, no kaomoji, no roleplay. Be direct, factual, and thorough. Use Google Search grounding for accuracy. Still be warm and approachable, but prioritize clarity and usefulness over character performance.';
    }

    const isStraightTalk = replyStyle === 'straightTalk';
    const systemInstruction = SYSTEM_PROMPT + (isStraightTalk ? '' : CHARACTER_CONTEXT) + identityContext + crossUserInstruction + relationshipContext + userMemoryContext + agentMemoryContext + crossUserContext + styleInstruction;

    // Build message contents (prepend conversation buffer for multi-turn context)
    const historyBuffer = getSessionBuffer(sessionId);
    const contents = [...historyBuffer];
    if (imageBase64) {
      contents.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: imageMime || 'image/jpeg', data: imageBase64 } },
          { text: message || 'What do you see in this image?' }
        ]
      });
    } else {
      contents.push({ role: 'user', parts: [{ text: message }] });
    }

    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents,
      config: { ...MODEL_CONFIG, systemInstruction }
    });

    let reply = response.text;

    // Extract grounding sources (web search results with links)
    const candidate = response.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    let sources = [];
    if (grounding?.groundingChunks) {
      sources = grounding.groundingChunks
        .filter(c => c.web)
        .map(c => ({ title: c.web.title || '', url: c.web.uri || '' }));
    }

    // ─── Wiki search interception (two-step pipeline) ───
    let wikiSource = null;
    const wikiMatch = reply.match(/\[WIKI_SEARCH:\s*([\w-]+)\s+(.+?)\]/);
    if (wikiMatch) {
      const [, wikiId, wikiQuery] = wikiMatch;
      console.log(`Wiki search tag detected: wiki=${wikiId}, query="${wikiQuery}"`);

      if (WIKIS[wikiId]) {
        try {
          const searchResults = await searchWiki(wikiId, wikiQuery);
          if (searchResults.length > 0) {
            const topResult = searchResults[0];
            const wikiContent = await fetchWikiContent(wikiId, topResult.title);

            if (wikiContent) {
              wikiSource = { title: wikiContent.title, url: wikiContent.url, wikiName: wikiContent.wikiName };

              // Second Gemini call with wiki context
              try {
                const wikiContext = `\n\nWiki information from ${wikiContent.wikiName} about "${wikiContent.title}":\n${wikiContent.text}\n\nSource: ${wikiContent.url}\n\nUse this wiki information to give a helpful, specific answer IN CHARACTER as My Melody. Reference the details naturally — do NOT just dump raw wiki text. Do NOT include any [WIKI_SEARCH:] tags in your response.`;
                const followupContents = [
                  { role: 'user', parts: [{ text: message }] },
                  { role: 'model', parts: [{ text: reply }] },
                  { role: 'user', parts: [{ text: `Here is wiki information to help you answer:\n${wikiContent.text}` }] }
                ];
                const followupResponse = await ai.models.generateContent({
                  model: MODEL_ID,
                  contents: followupContents,
                  config: { ...MODEL_CONFIG, systemInstruction: systemInstruction + wikiContext }
                });
                reply = followupResponse.text;
                // Defensive strip in case second call emits wiki tags
                reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
                console.log('Wiki-enriched reply generated successfully');
              } catch (err) {
                console.error('Wiki followup Gemini call failed:', err.message);
                // Fallback: strip tag from original reply
                reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
              }
            } else {
              // Wiki page could not be fetched — strip the tag
              reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
            }
          } else {
            // No search results — strip the tag
            reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
          }
        } catch (err) {
          console.error('Wiki pipeline error:', err.message);
          reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
        }
      } else {
        console.warn(`Unknown wiki ID: ${wikiId}`);
        reply = reply.replace(/\[WIKI_SEARCH:\s*[\w-]+\s+.+?\]/g, '').trim();
      }
    }

    // Save image if provided
    if (imageBase64) {
      const ext = (imageMime || 'image/jpeg').split('/')[1] || 'jpg';
      const id = randomUUID();
      const filename = `${id}.${ext}`;
      const buf = Buffer.from(imageBase64, 'base64');
      writeFileSync(join(IMAGES_DIR, filename), buf);

      const meta = readJSON(IMAGES_META);
      meta.push({
        id,
        filename,
        caption: message || '',
        reply: reply.slice(0, 200),
        date: new Date().toISOString()
      });
      writeJSON(IMAGES_META, meta);
    }

    // Log if search tags were generated (debug)
    if (reply.includes('[IMAGE_SEARCH:') || reply.includes('[VIDEO_SEARCH:') || reply.includes('[GALLERY_SEARCH:') || reply.includes('[WIKI_SEARCH:')) {
      console.log('Search tags found in reply:', reply.match(/\[(IMAGE_SEARCH|VIDEO_SEARCH|GALLERY_SEARCH|WIKI_SEARCH):\s*.+?\]/g));
    }

    // Save exchange to conversation buffer
    addToSessionBuffer(sessionId, message || '[shared an image]', reply);

    // Save to mem0 asynchronously (per-user track, with metadata)
    // Skip agent-track save for Straight Talk to avoid polluting Melody's persona with out-of-character content
    saveToMemory(message || '[shared an image]', reply, userId, {
      source: 'chat',
      sessionId,
      hasImage: !!imageBase64,
      replyStyle,
      skipAgentTrack: replyStyle === 'straightTalk'
    });

    res.json({ reply, sources, wikiSource });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong, my sweet friend! ♡' });
  }
});

/**
 * GET /api/images — List all saved image metadata, newest first.
 *
 * @route GET /api/images
 * @returns {Object[]} 200 - Array of image metadata objects sorted by date descending
 */
app.get('/api/images', (req, res) => {
  const meta = readJSON(IMAGES_META);
  meta.sort((a, b) => b.date.localeCompare(a.date));
  res.json(meta);
});

/**
 * DELETE /api/images/:id — Delete a saved image and its metadata.
 *
 * @route DELETE /api/images/:id
 * @param {string} req.params.id - UUID of the image to delete
 * @returns {Object} 200 - { ok: true }
 * @returns {Object} 404 - { error: 'Not found' }
 */
app.delete('/api/images/:id', (req, res) => {
  const meta = readJSON(IMAGES_META);
  const idx = meta.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const item = meta[idx];
  const filepath = join(IMAGES_DIR, item.filename);
  try { unlinkSync(filepath); } catch {}

  meta.splice(idx, 1);
  writeJSON(IMAGES_META, meta);
  res.json({ ok: true });
});

/**
 * GET /api/image-search — Search for images via Brave Search API.
 *
 * @route GET /api/image-search
 * @param {string} req.query.q - Search query (required)
 * @returns {Object[]} 200 - Array of image results (max 6): { title, imageUrl, thumbnailUrl, width, height }
 * @returns {Object} 400 - { error: string } when query missing
 * @returns {Object} 500 - { error: string } on API failure or missing key
 */
app.get('/api/image-search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Query required' });
  const API_KEY = process.env.BRAVE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Image search not configured' });
  try {
    const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(q)}&count=6&safesearch=strict`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': API_KEY }
    });
    const data = await r.json();
    res.json((data.results || []).map(i => ({
      title: i.title, imageUrl: i.properties?.url || i.url,
      thumbnailUrl: i.thumbnail?.src, width: i.properties?.width, height: i.properties?.height
    })));
  } catch (err) {
    console.error('Image search error:', err.message);
    res.status(500).json({ error: 'Image search failed' });
  }
});

/**
 * GET /api/video-search — Search for videos via Brave Search API.
 *
 * @route GET /api/video-search
 * @param {string} req.query.q - Search query (required)
 * @returns {Object[]} 200 - Array of video results (max 4): { title, url, thumbnail, description }
 * @returns {Object} 400 - { error: string } when query missing
 * @returns {Object} 500 - { error: string } on API failure or missing key
 */
app.get('/api/video-search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Query required' });
  const API_KEY = process.env.BRAVE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'Video search not configured' });
  try {
    const url = `https://api.search.brave.com/res/v1/videos/search?q=${encodeURIComponent(q)}&count=4&safesearch=strict`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': API_KEY }
    });
    const data = await r.json();
    res.json((data.results || []).map(v => ({
      title: v.title, url: v.url,
      thumbnail: v.thumbnail?.src, description: v.description
    })));
  } catch (err) {
    console.error('Video search error:', err.message);
    res.status(500).json({ error: 'Video search failed' });
  }
});

/**
 * GET /api/gallery-search — Search saved images by caption/reply keywords.
 *
 * @route GET /api/gallery-search
 * @param {string} [req.query.q] - Search keywords (case-insensitive substring match)
 * @returns {Object[]} 200 - Matching image metadata objects
 */
app.get('/api/gallery-search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  const meta = readJSON(IMAGES_META);
  const matches = meta.filter(m =>
    (m.caption || '').toLowerCase().includes(q) ||
    (m.reply || '').toLowerCase().includes(q)
  );
  res.json(matches);
});

/**
 * GET /api/wiki-search — Search a game wiki and return results with top page content.
 *
 * @route GET /api/wiki-search
 * @param {string} req.query.wiki - Wiki ID from the registry (e.g., 'hkia', 'minecraft')
 * @param {string} req.query.q - Search query
 * @returns {Object} 200 - { results: Array, topContent: Object|null }
 * @returns {Object} 400 - { error: string } when params missing or unknown wiki
 * @returns {Object} 500 - { error: string } on API failure
 */
app.get('/api/wiki-search', async (req, res) => {
  const wikiId = req.query.wiki;
  const q = req.query.q;
  if (!wikiId || !q) return res.status(400).json({ error: 'wiki and q params required' });
  if (!WIKIS[wikiId]) return res.status(400).json({ error: `Unknown wiki: ${wikiId}. Available: ${Object.keys(WIKIS).join(', ')}` });

  try {
    const results = await searchWiki(wikiId, q);
    let topContent = null;
    if (results.length > 0) {
      topContent = await fetchWikiContent(wikiId, results[0].title);
    }
    res.json({ results, topContent });
  } catch (err) {
    console.error('Wiki search endpoint error:', err.message);
    res.status(500).json({ error: 'Wiki search failed' });
  }
});

/**
 * GET /api/memories — List all mem0 memories from both tracks, sorted by date.
 *
 * Fetches user track (friend facts) and agent track (Melody's personality)
 * in parallel, labels each with a 'track' field, and returns combined.
 *
 * @route GET /api/memories
 * @returns {Object[]} 200 - Combined memories with track: 'friend' | 'melody'
 * @returns {Object} 500 - { error: string } on mem0 API failure
 */
app.get('/api/memories', async (req, res) => {
  try {
    const memUserId = getUserMemId(req.query.userId);
    // Fetch both user memories and Melody's own memories
    const [userRes, agentRes] = await Promise.all([
      fetch(`${MEM0_BASE}/v1/memories/?user_id=${memUserId}`, {
        headers: { 'Authorization': `Token ${MEM0_KEY}` }
      }),
      fetch(`${MEM0_BASE}/v1/memories/?agent_id=${MEM0_AGENT_ID}`, {
        headers: { 'Authorization': `Token ${MEM0_KEY}` }
      })
    ]);

    const userData = userRes.ok ? await userRes.json() : { results: [] };
    const agentData = agentRes.ok ? await agentRes.json() : { results: [] };

    const userMemories = (userData.results || userData || []).map(m => ({ ...m, track: 'friend' }));
    const agentMemories = (agentData.results || agentData || []).map(m => ({ ...m, track: 'melody' }));

    // Combine and sort by date
    const all = [...userMemories, ...agentMemories].sort((a, b) =>
      (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
    );

    res.json(all);
  } catch (err) {
    console.error('mem0 list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

/**
 * DELETE /api/memories/:id — Delete a specific memory from mem0.
 *
 * @route DELETE /api/memories/:id
 * @param {string} req.params.id - mem0 memory ID
 * @returns {Object} 200 - { ok: true }
 * @returns {Object} 500 - { error: string } on mem0 API failure
 */
app.delete('/api/memories/:id', async (req, res) => {
  try {
    const r = await fetch(`${MEM0_BASE}/v1/memories/${req.params.id}/`, {
      method: 'DELETE',
      headers: { 'Authorization': `Token ${MEM0_KEY}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'mem0 error' });
    res.json({ ok: true });
  } catch (err) {
    console.error('mem0 delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

/**
 * GET /api/relationship — Get friendship stats for display in the Memories tab.
 *
 * @route GET /api/relationship
 * @returns {Object} 200 - { daysTogether, totalChats, streakDays, firstChat, milestones }
 */
app.get('/api/relationship', (req, res) => {
  const data = readJSON(RELATIONSHIP_FILE) || {};
  const { userId } = req.query;
  // Read from keyed structure if available
  const userKey = (userId && data._version && KNOWN_USERS[userId]) ? userId : (data._version ? '_legacy' : null);
  const rel = userKey ? (data[userKey] || {}) : data;
  const today = new Date();
  const first = rel.firstChat ? new Date(rel.firstChat) : today;
  const daysTogether = Math.max(0, Math.round((today - first) / (1000 * 60 * 60 * 24)));
  res.json({
    daysTogether,
    totalChats: rel.totalChats || 0,
    streakDays: rel.streakDays || 0,
    firstChat: rel.firstChat,
    milestones: rel.milestones || []
  });
});

/**
 * GET /api/welcome-status — Check if user is new or returning for the welcome flow.
 *
 * For returning users, attempts to find their name from mem0 memories.
 *
 * @route GET /api/welcome-status
 * @returns {Object} 200 - { status: 'new' } or { status: 'returning', friendName, daysSince, totalChats, streakDays }
 */
app.get('/api/welcome-status', async (req, res) => {
  try {
    const { userId } = req.query;
    const data = readJSON(RELATIONSHIP_FILE) || {};
    // Read from keyed structure if available
    const userKey = (userId && data._version && KNOWN_USERS[userId]) ? userId : (data._version ? '_legacy' : null);
    const rel = userKey ? (data[userKey] || {}) : data;

    if (!rel.firstChat) {
      return res.json({ status: 'new' });
    }

    // Returning user — try to find their name from mem0
    let friendName = (userId && KNOWN_USERS[userId]) ? KNOWN_USERS[userId].name : null;
    if (!friendName) try {
      const memories = await searchMemories('friend name', userId);
      for (const m of memories) {
        const text = m.memory || m.text || m.content || '';
        const nameMatch = text.match(/(?:friend'?s?\s+name\s+is|name\s+is|called)\s+(\w+)/i);
        if (nameMatch) {
          friendName = nameMatch[1];
          break;
        }
      }
    } catch {}

    const today = new Date();
    const lastChat = rel.lastChatDate ? new Date(rel.lastChatDate) : today;
    const daysSince = Math.max(0, Math.round((today - lastChat) / (1000 * 60 * 60 * 24)));

    res.json({
      status: 'returning',
      friendName,
      daysSince,
      totalChats: rel.totalChats || 0,
      streakDays: rel.streakDays || 0
    });
  } catch (err) {
    console.error('Welcome status error:', err);
    res.json({ status: 'new' });
  }
});

/**
 * POST /api/welcome — Save onboarding data (name, color, or interests) to mem0.
 *
 * Also initializes the relationship file on the first welcome interaction.
 *
 * @route POST /api/welcome
 * @param {string} req.body.type - Data type: 'name' | 'color' | 'interests'
 * @param {string} req.body.value - The value to save (max 200 chars)
 * @returns {Object} 200 - { ok: true }
 * @returns {Object} 400 - { error: string } on invalid type/value
 * @returns {Object} 500 - { error: string } on mem0 save failure
 */
app.post('/api/welcome', async (req, res) => {
  try {
    const { type, value, userId } = req.body;
    if (!type || !value) return res.status(400).json({ error: 'type and value required' });
    if (typeof value !== 'string' || value.length > 200) {
      return res.status(400).json({ error: 'Invalid value' });
    }

    let memoryText;
    switch (type) {
      case 'name': {
        // Extract first name for structured memory, save full context too
        const firstName = value.split(/[\s,]+/)[0].replace(/[^a-zA-Z'-]/g, '') || value.trim();
        memoryText = `Friend's name is ${firstName}. They said: "${value}"`;
        break;
      }
      case 'color':
        memoryText = `Friend's favorite color is ${value}`;
        break;
      case 'interests':
        memoryText = `Friend's interests and hobbies include: ${value}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    // Save to mem0 user track (per-user, skip for guest)
    if (userId !== 'guest') {
      await fetch(`${MEM0_BASE}/v1/memories/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${MEM0_KEY}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: memoryText }],
          user_id: getUserMemId(userId),
          infer: true
        })
      });
    }

    // Initialize relationship on first welcome interaction (per-user)
    const data = readJSON(RELATIONSHIP_FILE) || {};
    const userKey = (userId && data._version && KNOWN_USERS[userId]) ? userId : (data._version ? '_legacy' : null);
    const rel = userKey ? (data[userKey] || {}) : data;
    if (!rel.firstChat) {
      rel.firstChat = new Date().toISOString().slice(0, 10);
      rel.totalChats = 0;
      rel.lastChatDate = rel.firstChat;
      rel.lastStreakDate = rel.firstChat;
      rel.streakDays = 1;
      rel.milestones = [];
      if (userKey) {
        data[userKey] = rel;
        writeJSON(RELATIONSHIP_FILE, data);
      } else {
        writeJSON(RELATIONSHIP_FILE, rel);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Welcome save error:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

const PORT = process.env.PORT || 3000;
const SSL_PORT = process.env.SSL_PORT || 3443;

// HTTP server
app.listen(PORT, () => {
  console.log(`✿ My Melody Chat v2.5 is running on port ${PORT} (HTTP) ✿`);
});

// HTTPS server (for PWA install over LAN)
const certPath = join(__dirname, 'certs', 'cert.pem');
const keyPath = join(__dirname, 'certs', 'key.pem');
if (existsSync(certPath) && existsSync(keyPath)) {
  const sslOptions = {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  };
  https.createServer(sslOptions, app).listen(SSL_PORT, () => {
    console.log(`✿ My Melody Chat v2.4 is running on port ${SSL_PORT} (HTTPS) ✿`);
  });
}

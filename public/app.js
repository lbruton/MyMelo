/**
 * @file My Melody Chat — Client-side SPA logic.
 *
 * Handles chat UI, image gallery, memories display, audio feedback,
 * PWA install prompt, settings, and first-time welcome flow.
 * No framework — vanilla JavaScript with DOM manipulation.
 *
 * @version 2.5.1
 */

// ─── DOM refs ───
const chatArea = document.getElementById('chatArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const imageBtn = document.getElementById('imageBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImageBtn');
const galleryGrid = document.getElementById('galleryGrid');
const memoryList = document.getElementById('memoryList');
const refreshMemoriesBtn = document.getElementById('refreshMemoriesBtn');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDropdown = document.getElementById('settingsDropdown');
const darkModeToggle = document.getElementById('darkModeToggle');
const replyStyleSelect = document.getElementById('replyStyleSelect');
const soundToggle = document.getElementById('soundToggle');

// ─── Session ───
/** @type {string} Unique session ID for conversation buffer (new per tab, persists on refresh). */
const sessionId = sessionStorage.getItem('melodySessionId') || (() => {
  const id = crypto.randomUUID();
  sessionStorage.setItem('melodySessionId', id);
  return id;
})();

// ─── State ───
let pendingImageBase64 = null;
let pendingImageMime = null;
let pendingImageDataURL = null;

// ─── User Picker ───
/** @type {Object<string, string>} Map user IDs to display names. */
const USER_NAMES = { amelia: 'Amelia', lonnie: 'Lonnie', guest: 'Guest' };

const userPicker = document.getElementById('userPicker');
const activeUserLabel = document.getElementById('activeUserLabel');
const switchUserBtn = document.getElementById('switchUserBtn');

/** @type {string|null} Currently active user ID from localStorage. */
let activeUser = localStorage.getItem('melodyActiveUser');

/**
 * Show the user picker overlay.
 *
 * @returns {void}
 */
function showUserPicker() {
  userPicker.classList.remove('hidden');
}

/**
 * Select a user, persist the choice, hide the picker, and update the header label.
 *
 * @param {string} userId - The user ID to activate (e.g. "amelia", "lonnie", "guest").
 * @returns {void}
 */
function selectUser(userId) {
  localStorage.setItem('melodyActiveUser', userId);
  activeUser = userId;
  userPicker.classList.add('hidden');
  activeUserLabel.textContent = USER_NAMES[userId] || userId;
}

// Wire user picker buttons
userPicker.querySelectorAll('[data-user]').forEach(btn => {
  btn.addEventListener('click', () => selectUser(btn.dataset.user));
});

// Wire switch user button in settings
switchUserBtn.addEventListener('click', () => {
  settingsDropdown.classList.add('hidden');
  showUserPicker();
});

// On load: show picker if no user selected, otherwise update label
if (!activeUser) {
  showUserPicker();
} else {
  activeUserLabel.textContent = USER_NAMES[activeUser] || activeUser;
}

// ─── Settings ───
let replyStyle = localStorage.getItem('replyStyle') || 'default';
let darkMode = localStorage.getItem('darkMode') === 'true';
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false'; // default ON

// Apply saved settings on load
if (darkMode) {
  document.documentElement.setAttribute('data-theme', 'dark');
  darkModeToggle.textContent = 'On';
  darkModeToggle.classList.add('active');
}
replyStyleSelect.value = replyStyle;

// Sound toggle init
if (soundEnabled) {
  soundToggle.textContent = 'On';
  soundToggle.classList.add('active');
} else {
  soundToggle.textContent = 'Off';
  soundToggle.classList.remove('active');
}

// ─── Web Audio API Sound Engine ───
let audioCtx = null;

/**
 * Get or create the shared AudioContext, resuming it if suspended.
 *
 * @returns {AudioContext|null} The active AudioContext, or null if Web Audio is unavailable.
 */
function getAudioContext() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { return null; }
  return audioCtx;
}

/**
 * Play a two-note ascending chime (C5 to E5) when a reply arrives.
 *
 * @returns {void}
 */
function playReplyChime() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Two-note ascending: C5 (523Hz) → E5 (659Hz)
  [523.25, 659.25].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.15);
    gain.gain.linearRampToValueAtTime(0.15, now + i * 0.15 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.15);
    osc.stop(now + i * 0.15 + 0.3);
  });
}

/**
 * Play a short A5 blip sound when the typing indicator appears.
 *
 * @returns {void}
 */
function playTypingTick() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880; // A5
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

// Unlock audio on first interaction (Android requirement)
/**
 * Unlock the AudioContext on first user interaction (required on Android).
 *
 * @returns {void}
 */
function unlockAudio() {
  getAudioContext();
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('click', unlockAudio);
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

// ─── PWA Install Prompt ───
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (sessionStorage.getItem('installDismissed')) return;
  showInstallBanner();
});

/**
 * Create and display the PWA install banner in the app container.
 *
 * @returns {void}
 */
function showInstallBanner() {
  if (document.querySelector('.install-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <span class="install-text">Add My Melody to your home screen!</span>
    <div class="install-actions">
      <button class="install-btn" id="installAccept">Install</button>
      <button class="install-dismiss" id="installDismiss">&times;</button>
    </div>
  `;
  document.querySelector('.app-container').appendChild(banner);

  document.getElementById('installAccept').addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
    banner.remove();
  });

  document.getElementById('installDismiss').addEventListener('click', () => {
    sessionStorage.setItem('installDismissed', 'true');
    banner.remove();
  });
}

// Settings toggle
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!settingsDropdown.contains(e.target) && e.target !== settingsBtn) {
    settingsDropdown.classList.add('hidden');
  }
});

darkModeToggle.addEventListener('click', () => {
  darkMode = !darkMode;
  localStorage.setItem('darkMode', darkMode);
  if (darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeToggle.textContent = 'On';
    darkModeToggle.classList.add('active');
  } else {
    document.documentElement.removeAttribute('data-theme');
    darkModeToggle.textContent = 'Off';
    darkModeToggle.classList.remove('active');
  }
});

soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('soundEnabled', soundEnabled);
  if (soundEnabled) {
    soundToggle.textContent = 'On';
    soundToggle.classList.add('active');
    playReplyChime(); // preview sound
  } else {
    soundToggle.textContent = 'Off';
    soundToggle.classList.remove('active');
  }
});

replyStyleSelect.addEventListener('change', (e) => {
  replyStyle = e.target.value;
  localStorage.setItem('replyStyle', replyStyle);
});

// ─── Tab navigation ───
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    document.getElementById(target).classList.add('active');

    // Lazy load tab data
    if (target === 'tabImages') loadGallery();
    else if (target === 'tabMemories') loadMemories();
  });
});

// ─── Chat ───
/**
 * Append a chat message bubble to the chat area with optional media attachments.
 *
 * @param {string} text - The message text content.
 * @param {string} role - Either "user" or "assistant".
 * @param {string|null} [imageDataURL] - Base64 data URL of a user-uploaded image.
 * @param {string|null} [searchImageUrl] - URL of a Brave image search result.
 * @param {{url: string, title?: string, thumbnail?: string}|null} [videoResult] - Brave video search result object.
 * @param {Array<{url: string, title?: string}>|null} [sources] - Google Search grounding source links.
 * @param {{title: string, url: string, wikiName: string}|null} [wikiSource] - Game wiki source card data.
 * @returns {void}
 */
function addMessage(text, role, imageDataURL, searchImageUrl, videoResult, sources, wikiSource) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';

  if (role === 'assistant') {
    const avatarImg = document.createElement('img');
    avatarImg.src = '/images/melody-avatar.png';
    avatarImg.alt = 'My Melody';
    avatarImg.className = 'message-avatar-img';
    avatar.appendChild(avatarImg);
  } else {
    avatar.textContent = '\u2726';
  }

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (imageDataURL && role === 'user') {
    const img = document.createElement('img');
    img.src = imageDataURL;
    img.className = 'message-image';
    img.addEventListener('click', () => openLightbox(imageDataURL));
    bubble.appendChild(img);
    if (text) {
      const p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
    }
  } else if (role === 'assistant') {
    // Render basic markdown: **bold**, *italic*, bullet lists
    const formatted = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\s*[\*\-]\s+/g, '<br>• ')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = formatted;
  } else {
    bubble.textContent = text;
  }

  // Append search image if provided (for assistant messages)
  if (searchImageUrl && role === 'assistant') {
    const img = document.createElement('img');
    img.src = searchImageUrl;
    img.className = 'search-result-img';
    img.alt = 'Search result';
    img.addEventListener('click', () => openLightbox(searchImageUrl));
    img.addEventListener('error', () => img.remove());
    bubble.appendChild(img);
  }

  // Append video link if provided
  if (videoResult && role === 'assistant') {
    const videoLink = document.createElement('a');
    videoLink.href = videoResult.url;
    videoLink.target = '_blank';
    videoLink.rel = 'noopener noreferrer';
    videoLink.className = 'video-result';
    if (videoResult.thumbnail) {
      const thumb = document.createElement('img');
      thumb.src = videoResult.thumbnail;
      thumb.alt = videoResult.title || 'Video';
      thumb.className = 'video-thumbnail';
      thumb.addEventListener('error', () => thumb.remove());
      videoLink.appendChild(thumb);
    }
    const titleEl = document.createElement('span');
    titleEl.className = 'video-title';
    titleEl.textContent = videoResult.title || 'Watch Video';
    videoLink.appendChild(titleEl);
    bubble.appendChild(videoLink);
  }

  // Append source links if provided (from Google Search grounding)
  if (sources?.length && role === 'assistant') {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'grounding-sources';
    sources.forEach(s => {
      if (!s.url) return;
      const link = document.createElement('a');
      link.href = s.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'source-link';
      link.textContent = s.title || new URL(s.url).hostname;
      sourcesDiv.appendChild(link);
    });
    if (sourcesDiv.children.length) {
      bubble.appendChild(sourcesDiv);
    }
  }

  // Append wiki source card if provided
  if (wikiSource && role === 'assistant') {
    const wikiCard = document.createElement('a');
    wikiCard.href = wikiSource.url;
    wikiCard.target = '_blank';
    wikiCard.rel = 'noopener noreferrer';
    wikiCard.className = 'wiki-source';

    const icon = document.createElement('span');
    icon.className = 'wiki-source-icon';
    icon.textContent = '\u{1F4D6}';

    const info = document.createElement('div');
    info.className = 'wiki-source-info';

    const label = document.createElement('span');
    label.className = 'wiki-source-label';
    label.textContent = wikiSource.wikiName || 'Wiki';

    const title = document.createElement('span');
    title.className = 'wiki-source-title';
    title.textContent = wikiSource.title || 'Source';

    info.appendChild(label);
    info.appendChild(title);
    wikiCard.appendChild(icon);
    wikiCard.appendChild(info);
    bubble.appendChild(wikiCard);
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatArea.appendChild(msg);
  chatArea.scrollTop = chatArea.scrollHeight;
}

/**
 * Show the typing indicator and scroll the chat area to the bottom.
 *
 * @returns {void}
 */
function showTyping() {
  typingIndicator.classList.add('active');
  chatArea.scrollTop = chatArea.scrollHeight;
}

/**
 * Hide the typing indicator.
 *
 * @returns {void}
 */
function hideTyping() {
  typingIndicator.classList.remove('active');
}

/**
 * Parse search tags from an assistant reply, fetch media results, and render the message.
 *
 * @param {string} text - Raw reply text potentially containing [IMAGE_SEARCH:], [VIDEO_SEARCH:], [GALLERY_SEARCH:], or [WIKI_SEARCH:] tags.
 * @param {Array<{url: string, title?: string}>|null} sources - Google Search grounding sources.
 * @param {{title: string, url: string, wikiName: string}|null} wikiSource - Wiki source metadata from the server.
 * @returns {Promise<void>}
 */
async function processReply(text, sources, wikiSource) {
  const imageSearchMatch = text.match(/\[IMAGE_SEARCH:\s*(.+?)\]/);
  const videoSearchMatch = text.match(/\[VIDEO_SEARCH:\s*(.+?)\]/);
  const gallerySearchMatch = text.match(/\[GALLERY_SEARCH:\s*(.+?)\]/);
  const reactionMatch = text.match(/\[REACTION:\s*(\w+)\]/);

  // Clean tags from display text
  let displayText = text
    .replace(/\[IMAGE_SEARCH:\s*.+?\]/g, '')
    .replace(/\[VIDEO_SEARCH:\s*.+?\]/g, '')
    .replace(/\[GALLERY_SEARCH:\s*.+?\]/g, '')
    .replace(/\[WIKI_SEARCH:\s*.+?\]/g, '')
    .replace(/\[REACTION:\s*\w+\]/g, '')
    .trim();

  let searchImageUrl = null;
  let videoResult = null;
  let reactionGifUrl = null;

  if (imageSearchMatch) {
    try {
      const results = await fetch(`/api/image-search?q=${encodeURIComponent(imageSearchMatch[1])}`).then(r => r.json());
      const valid = results.filter(r => r.imageUrl);
      if (valid.length) {
        const pick = valid[Math.floor(Math.random() * Math.min(valid.length, 4))];
        searchImageUrl = pick.imageUrl;
      }
    } catch (err) {
      console.error('Image search failed:', err);
    }
  }

  if (videoSearchMatch) {
    try {
      const results = await fetch(`/api/video-search?q=${encodeURIComponent(videoSearchMatch[1])}`).then(r => r.json());
      if (results.length) {
        videoResult = results[0];
      }
    } catch (err) {
      console.error('Video search failed:', err);
    }
  }

  if (gallerySearchMatch && !searchImageUrl) {
    try {
      const results = await fetch(`/api/gallery-search?q=${encodeURIComponent(gallerySearchMatch[1])}`).then(r => r.json());
      if (results.length) {
        searchImageUrl = `/data/images/${results[0].filename}`;
      }
    } catch (err) {
      console.error('Gallery search failed:', err);
    }
  }

  // Render message immediately (don't block on reaction GIF)
  addMessage(displayText, 'assistant', null, searchImageUrl, videoResult, sources, wikiSource);

  // Fetch and append reaction GIF asynchronously (non-blocking)
  if (reactionMatch) {
    const emotion = reactionMatch[1].toLowerCase();
    const categories = REACTION_MAP[emotion];
    if (categories) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const lastBubble = chatArea.querySelector('.message.assistant:last-child .message-bubble');
      fetch(`https://nekos.best/api/v2/${category}?amount=1`)
        .then(r => r.json())
        .then(data => {
          const url = data.results?.[0]?.url;
          if (url && lastBubble) {
            const gif = document.createElement('img');
            gif.src = url;
            gif.alt = 'Reaction';
            gif.style.cssText = 'max-width:200px;border-radius:8px;margin-top:8px;display:block';
            gif.addEventListener('error', () => gif.remove());
            lastBubble.appendChild(gif);
          }
        })
        .catch(() => { /* silently skip */ });
    }
  }
}

// ─── Reaction GIF Mapping ───
/** @type {Object<string, string[]>} Map emotion keywords to nekos.best API categories. */
const REACTION_MAP = {
  happy: ['happy', 'smile', 'dance'],
  love: ['hug', 'cuddle', 'pat'],
  shy: ['blush', 'wave', 'wink'],
  sad: ['cry', 'pout'],
  think: ['think', 'nod', 'shrug'],
  playful: ['tickle', 'poke', 'nom'],
  angry: ['angry', 'facepalm', 'baka'],
  sassy: ['smug', 'thumbsup', 'yeet'],
  tired: ['yawn', 'bored', 'sleep'],
  excited: ['highfive', 'thumbsup', 'dance']
};

let welcomeActive = false;
let welcomeResolve = null;

/**
 * Send the current input (text and/or image) to the chat API or route it to the welcome flow.
 *
 * @returns {Promise<void>}
 */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text && !pendingImageBase64) return;

  // During welcome flow, capture input instead of sending to API
  if (welcomeActive && welcomeResolve) {
    messageInput.value = '';
    clearImagePreview();
    addMessage(text, 'user');
    const r = welcomeResolve;
    welcomeResolve = null;
    r(text);
    return;
  }

  messageInput.value = '';
  addMessage(text, 'user', pendingImageDataURL);

  const body = { message: text, replyStyle, sessionId, userId: activeUser };
  if (pendingImageBase64) {
    body.imageBase64 = pendingImageBase64;
    body.imageMime = pendingImageMime;
  }

  clearImagePreview();
  showTyping();
  playTypingTick();
  sendBtn.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    hideTyping();
    playReplyChime();

    if (data.reply) {
      await processReply(data.reply, data.sources, data.wikiSource);
    } else {
      addMessage('Oh no, something went wrong... Please try again, my sweet friend! \u2661', 'assistant');
    }
  } catch (err) {
    hideTyping();
    playReplyChime();
    addMessage('I couldn\'t reach the server... Please try again! \u2661', 'assistant');
  }

  sendBtn.disabled = false;
  messageInput.focus();
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ─── Image upload + compression ───
imageBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  compressAndStage(file);
  imageInput.value = '';
});

/**
 * Compress an image file to max 1024px width JPEG and stage it for upload.
 *
 * @param {File} file - The image file selected by the user.
 * @returns {void}
 */
function compressAndStage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1024;
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = Math.round(h * (maxW / w));
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const mime = 'image/jpeg';
      const dataURL = canvas.toDataURL(mime, 0.8);
      const base64 = dataURL.split(',')[1];

      pendingImageBase64 = base64;
      pendingImageMime = mime;
      pendingImageDataURL = dataURL;

      previewImg.src = dataURL;
      imagePreview.classList.add('active');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/**
 * Clear the staged image data and hide the preview thumbnail.
 *
 * @returns {void}
 */
function clearImagePreview() {
  pendingImageBase64 = null;
  pendingImageMime = null;
  pendingImageDataURL = null;
  imagePreview.classList.remove('active');
  previewImg.src = '';
}

removeImageBtn.addEventListener('click', clearImagePreview);

// ─── Lightbox ───
/**
 * Open the fullscreen lightbox overlay with the given image source.
 *
 * @param {string} src - The image URL or data URL to display.
 * @returns {void}
 */
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.add('active');
}

lightboxClose.addEventListener('click', () => lightbox.classList.remove('active'));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.classList.remove('active');
});

// ─── Gallery ───
/**
 * Fetch saved images from the API and render them in the gallery grid.
 *
 * @returns {Promise<void>}
 */
async function loadGallery() {
  try {
    const res = await fetch('/api/images');
    const images = await res.json();

    if (!images.length) {
      galleryGrid.innerHTML = '<p class="empty-state">No images shared yet! Send a photo in chat \u2661</p>';
      return;
    }

    galleryGrid.innerHTML = '';
    images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'gallery-item';

      const imgEl = document.createElement('img');
      imgEl.src = `/data/images/${img.filename}`;
      imgEl.alt = img.caption || 'Shared image';
      imgEl.loading = 'lazy';
      imgEl.addEventListener('click', () => openLightbox(imgEl.src));

      const del = document.createElement('button');
      del.className = 'delete-overlay';
      del.textContent = '\u00d7';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`/api/images/${img.id}`, { method: 'DELETE' });
        loadGallery();
      });

      item.appendChild(imgEl);
      item.appendChild(del);
      galleryGrid.appendChild(item);
    });
  } catch {
    galleryGrid.innerHTML = '<p class="empty-state">Could not load images</p>';
  }
}

// ─── Relationship stats ───
const relationshipStats = document.getElementById('relationshipStats');

/**
 * Fetch friendship stats and render Days/Chats/Streak cards in the memories tab.
 *
 * @returns {Promise<void>}
 */
async function loadRelationshipStats() {
  try {
    const res = await fetch(`/api/relationship${activeUser ? '?userId=' + activeUser : ''}`);
    const stats = await res.json();
    relationshipStats.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${stats.daysTogether}</div>
        <div class="stat-label">Days</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.totalChats}</div>
        <div class="stat-label">Chats</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.streakDays}</div>
        <div class="stat-label">Streak</div>
      </div>
    `;
  } catch {
    relationshipStats.innerHTML = '';
  }
}

// ─── Memories ───
refreshMemoriesBtn.addEventListener('click', loadMemories);

/**
 * Fetch all mem0 memories (friend + melody tracks) and render them as cards with delete buttons.
 *
 * @returns {Promise<void>}
 */
async function loadMemories() {
  loadRelationshipStats();
  memoryList.innerHTML = '<p class="empty-state">Loading memories...</p>';
  try {
    const res = await fetch(`/api/memories${activeUser ? '?userId=' + activeUser : ''}`);
    const memories = await res.json();

    if (!memories.length) {
      memoryList.innerHTML = '<p class="empty-state">No memories stored yet! Chat with My Melody to create some \u2661</p>';
      return;
    }

    memoryList.innerHTML = '';
    memories.forEach(mem => {
      const card = document.createElement('div');
      card.className = 'memory-card';

      const info = document.createElement('div');
      info.className = 'memory-info';

      // Track label — use actual name for friend track, "Melody's Thoughts" for agent track
      const trackLabel = document.createElement('span');
      trackLabel.className = `memory-track-label ${mem.track || 'friend'}`;
      const friendName = USER_NAMES[activeUser] || 'Friend';
      trackLabel.textContent = mem.track === 'melody' ? "Melody's Thoughts" : `About ${friendName}`;
      info.appendChild(trackLabel);

      const text = document.createElement('div');
      text.className = 'memory-text';
      text.textContent = mem.memory || mem.text || mem.content || JSON.stringify(mem);

      info.appendChild(text);

      if (mem.created_at || mem.updated_at) {
        const date = document.createElement('div');
        date.className = 'memory-date';
        const ts = mem.updated_at || mem.created_at;
        date.textContent = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        info.appendChild(date);
      }

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.textContent = '\u00d7';
      del.addEventListener('click', async () => {
        await fetch(`/api/memories/${mem.id}`, { method: 'DELETE' });
        loadMemories();
      });

      card.appendChild(info);
      card.appendChild(del);
      memoryList.appendChild(card);
    });
  } catch {
    memoryList.innerHTML = '<p class="empty-state">Could not load memories</p>';
  }
}

// ─── Android keyboard handling ───
if (window.visualViewport) {
  const tabBar = document.querySelector('.tab-bar');
  window.visualViewport.addEventListener('resize', () => {
    const heightDiff = window.innerHeight - window.visualViewport.height;
    if (heightDiff > 100) {
      tabBar.style.display = 'none';
    } else {
      tabBar.style.display = '';
    }
  });
}

// ─── Accent Color ───
const COLOR_MAP = {
  red: '#E74C3C', pink: '#FF69B4', hotpink: '#FF69B4', rose: '#FF6B81',
  blue: '#3498DB', navy: '#2C3E8C', skyblue: '#5DADE2', cyan: '#00BCD4', teal: '#009688',
  green: '#27AE60', mint: '#00D2A0', lime: '#8BC34A', sage: '#8FBC8F',
  purple: '#9B59B6', violet: '#7C4DFF', lavender: '#B39DDB', lilac: '#C8A2C8',
  orange: '#FF9800', coral: '#FF7675', peach: '#FFAB91', salmon: '#FA8072',
  yellow: '#F1C40F', gold: '#FFD700',
  black: '#5C4155', white: '#FF69B4'
};

/**
 * Map a color name to a hex value and apply it as the CSS accent highlight variable.
 *
 * @param {string} colorName - A color name to look up in COLOR_MAP (e.g. "pink", "teal").
 * @returns {void}
 */
function applyAccentColor(colorName) {
  if (!colorName) return;
  const key = colorName.toLowerCase().trim();
  const hex = COLOR_MAP[key];
  if (hex) {
    document.documentElement.style.setProperty('--accent-highlight', hex);
    localStorage.setItem('accentColor', key);
  }
}

// Restore saved accent color
const savedAccent = localStorage.getItem('accentColor');
if (savedAccent) applyAccentColor(savedAccent);

// ─── Welcome Flow ───
/**
 * Run the first-time welcome onboarding or show a personalized returning-user greeting.
 *
 * @returns {Promise<void>}
 */
async function runWelcomeFlow() {
  const welcomeEl = chatArea.querySelector('.welcome-message');

  // Check server-side status first — the server knows if this is a returning user
  // even when localStorage is cleared (e.g., new browser, cleared cache)
  const welcomeKey = activeUser ? `melodyWelcomeDone-${activeUser}` : 'melodyWelcomeDone';
  try {
    const res = await fetch(`/api/welcome-status${activeUser ? '?userId=' + activeUser : ''}`);
    const status = await res.json();

    if (status.status === 'returning') {
      // Server recognizes this user — set localStorage so future loads are instant
      localStorage.setItem(welcomeKey, 'true');

      let welcomeText;
      const name = status.friendName || 'friend';
      if (status.daysSince === 0) {
        if (status.streakDays > 2) {
          welcomeText = `Welcome back, ${name}! That's ${status.streakDays} days in a row~ I'm so happy!`;
        } else {
          welcomeText = `Hi again, ${name}! I was just having some tea and thinking about you~`;
        }
      } else if (status.daysSince === 1) {
        welcomeText = `${name}! You came back! I was just baking almond pound cake and hoping you'd visit~`;
      } else if (status.daysSince <= 3) {
        welcomeText = `${name}~! It's been ${status.daysSince} days! I missed chatting with you... Mama says absence makes the heart grow fonder!`;
      } else {
        welcomeText = `${name}!! Yaaan~! It's been ${status.daysSince} whole days! I missed you so much... I saved you some tea!`;
      }
      if (welcomeEl) welcomeEl.querySelector('p').textContent = welcomeText + ' ♡';
      return;
    }
  } catch {
    // Network error — fall through to localStorage check or onboarding
  }

  // If localStorage says done but server didn't respond, trust localStorage
  if (localStorage.getItem(welcomeKey)) {
    return;
  }

  // First-time interactive welcome
  if (welcomeEl) welcomeEl.remove();

  // Enable welcome mode — sendMessage will route inputs to welcomeResolve
  welcomeActive = true;
  imageBtn.style.display = 'none'; // Hide image attach during onboarding

  function waitForInput() {
    return new Promise(resolve => {
      welcomeResolve = resolve;
    });
  }

  async function melodyTyping(delay = 800) {
    showTyping();
    playTypingTick();
    await new Promise(r => setTimeout(r, delay));
    hideTyping();
    playReplyChime();
  }

  // Step 1: Introduction
  await melodyTyping(1000);
  addMessage("Yaaan~! A new friend! Hello hello! I'm My Melody, and I live in Mariland with my Mama, Papa, and little brother Rhythm~ I'm so happy to meet you!", 'assistant');

  await melodyTyping(600);
  addMessage("Mama always says you should start a friendship by learning each other's names... so, what's your name? \u2661", 'assistant');

  // Step 2: Get name
  messageInput.placeholder = "Type your name...";
  const nameRaw = await waitForInput();
  // Extract first name for display, save full input to mem0 for context
  const name = nameRaw.split(/[\s,]+/)[0].replace(/[^a-zA-Z'-]/g, '') || nameRaw.trim();
  await fetch('/api/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'name', value: nameRaw, userId: activeUser })
  });

  await melodyTyping(800);
  addMessage(`${name}! What a lovely name~ Mama would say it sounds like a flower name... even if it doesn't, hehe. I'll remember it forever!`, 'assistant');

  await melodyTyping(600);
  addMessage("Oh! I'm curious~ what's your favorite color? Mine is pink, of course... because of my hood! \u2661", 'assistant');

  // Step 3: Get color
  messageInput.placeholder = "Type your favorite color...";
  const colorRaw = await waitForInput();
  // Try to match a known color from their input, fall back to first word
  const colorWords = colorRaw.toLowerCase().split(/[\s,]+/);
  const color = colorWords.find(w => COLOR_MAP[w]) || colorWords[0] || colorRaw.trim();
  await fetch('/api/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'color', value: colorRaw, userId: activeUser })
  });

  applyAccentColor(color);

  await melodyTyping(800);
  addMessage(`${color.charAt(0).toUpperCase() + color.slice(1)}! Ahh~ that's such a pretty color! I can see why you like it. I'll remember that about you, ${name}!`, 'assistant');

  await melodyTyping(600);
  addMessage("One more thing... what do you like to do for fun? Any hobbies or interests? I want to know everything about my new friend~! Onegai?", 'assistant');

  // Step 4: Get interests
  messageInput.placeholder = "Tell me what you like...";
  const interests = await waitForInput();
  await fetch('/api/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'interests', value: interests, userId: activeUser })
  });

  await melodyTyping(1000);
  addMessage(`That sounds wonderful! Mama always says the best friendships start with sharing what makes you happy~ And now I know so much about you, ${name}!`, 'assistant');

  await melodyTyping(600);
  addMessage("I'm so glad we're friends now! You can talk to me about anything, anytime~ I'll always be here with tea and almond pound cake! \u2661", 'assistant');

  // Restore normal chat (per-user welcome state)
  localStorage.setItem(welcomeKey, 'true');
  messageInput.placeholder = "Say something sweet... \u2661";
  imageBtn.style.display = ''; // Restore image button
  welcomeActive = false;
}

// ─── Init ───
runWelcomeFlow();
messageInput.focus();

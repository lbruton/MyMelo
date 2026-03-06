/**
 * @file My Melody Chat — Client-side SPA logic.
 *
 * Handles chat UI, image gallery, memories display, audio feedback,
 * PWA install prompt, settings, and first-time welcome flow.
 * No framework — vanilla JavaScript with DOM manipulation.
 *
 * @version 2.6.0
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
/** @type {string} Unique session ID for conversation buffer (new per tab, persists on refresh). Reset on character switch. */
let sessionId = sessionStorage.getItem('melodySessionId') || (() => {
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

// ─── Character Picker ───
/**
 * Configuration for each selectable companion character.
 * @type {Object<string, {name: string, avatar: string, color: string}>}
 */
const CHARACTER_CONFIG = {
  melody: {
    name: 'My Melody',
    avatar: '/images/melody-avatar.png',
    color: '#FF69B4',
    primaryColor: '#FF69B4',
    secondaryColor: '#FF85C8',
    subtitle: 'Your Sweet Sanrio Friend \u2661',
    placeholder: 'Say something sweet... \u2661',
    greeting1: "Yaaan~! A new friend! Hello hello! I'm My Melody, and I live in Mariland with my Mama, Papa, and little brother Rhythm~ I'm so happy to meet you!",
    greeting2: "Mama always says you should start a friendship by learning each other's names... so, what's your name? \u2661",
    greetAckName: n => `${n}! What a lovely name~ Mama would say it sounds like a flower name... even if it doesn't, hehe. I'll remember it forever!`,
    greetAskColor: "Oh! I'm curious~ what's your favorite color? Mine is pink, of course... because of my hood! \u2661",
    greetAckColor: (c, n) => `${c.charAt(0).toUpperCase() + c.slice(1)}! Ahh~ that's such a pretty color! I can see why you like it. I'll remember that about you, ${n}!`,
    greetAskInterests: "One more thing... what do you like to do for fun? Any hobbies or interests? I want to know everything about my new friend~! Onegai?",
    greetFinish1: n => `That sounds wonderful! Mama always says the best friendships start with sharing what makes you happy~ And now I know so much about you, ${n}!`,
    greetFinish2: "I'm so glad we're friends now! You can talk to me about anything, anytime~ I'll always be here with tea and almond pound cake! \u2661",
    greetReturn: (n, days, streak) => {
      const pick = a => a[Math.floor(Math.random() * a.length)];
      if (days === 0) {
        if (streak > 2) return pick([
          `Welcome back, ${n}! That's ${streak} days in a row~ I'm so happy!`,
          `${n}! ${streak} whole days together! Mama would say that's what real friendship looks like~`,
          `Ohh, ${streak} days in a row, ${n}! I baked extra almond cake just in case~ ♡`,
        ]);
        return pick([
          `Hi again, ${n}! I was just having some tea and thinking about you~`,
          `${n}! Oh~! I was literally just about to write you a letter. Mama always says great minds think alike!`,
          `Ohh, ${n}! I'm so glad you came by~ I saved you a piece of almond pound cake ♡`,
          `${n}! I was just humming a song and here you are! How lovely~`,
        ]);
      }
      if (days === 1) return pick([
        `${n}! You came back! I was just baking almond pound cake and hoping you'd visit~`,
        `Oh~! ${n}! I missed you yesterday. Flat said you'd come back and he was right! ♡`,
        `${n}! I kept a slice of almond cake warm just in case. Mama says hope is the best ingredient~`,
      ]);
      if (days <= 3) return pick([
        `${n}~! It's been ${days} days! I missed chatting with you... Mama says absence makes the heart grow fonder!`,
        `${n}! Oh, ${days} days! I didn't forget about you — Flat said I was being dramatic but I wasn't~`,
        `${n}!! There you are! ${days} days felt like forever. I may have stress-baked. Several cakes.`,
      ]);
      return pick([
        `${n}!! Yaaan~! It's been ${days} whole days! I missed you so much... I saved you some tea!`,
        `${n}!! I was so worried! ${days} days is so long. Come in, the tea is still warm somehow~ ♡`,
        `${n}!! Oh my~! ${days} days! Mama said I shouldn't wait by the window but I definitely waited by the window.`,
      ]);
    }
  },
  kuromi: {
    name: 'Kuromi',
    avatar: '/images/kuromi-avatar.png',
    color: '#7B2FBE',
    primaryColor: '#4A1080',
    secondaryColor: '#8B3EC8',
    subtitle: 'Pretty Devil Girl \u2660',
    placeholder: 'Go ahead, say something... \u2660',
    greeting1: "Hmph! Don't get the wrong idea — I just happened to notice you were here. I'm Kuromi. Leader of the Kuromi 5. The prettiest, most feared pretty devil girl in Mariland.",
    greeting2: "...Fine. Since you're obviously not going anywhere, you might as well tell me your name. What is it?",
    greetAckName: n => `${n}. Fine. I'll remember it. Don't make me regret learning your name.`,
    greetAskColor: "I suppose I should ask — what's your favorite color? Mine is black. And maybe a little pink. Don't make it weird.",
    greetAckColor: (c, n) => `${c.charAt(0).toUpperCase() + c.slice(1)}... not bad. Could be darker, but I'll allow it. I'll remember that, ${n}.`,
    greetAskInterests: "One last thing. What do you actually like to do? I'm asking because I want to know, NOT because I suddenly care. Don't flatter yourself.",
    greetFinish1: n => `...Hm. Those are actually kind of interesting. Not that I'd ever admit that out loud. Anyway — I guess we're acquaintances now, ${n}.`,
    greetFinish2: "Don't think this makes us friends or anything! I just... like having someone to talk to sometimes. Besides Baku. He doesn't count. \u2660",
    greetReturn: (n, days, streak) => {
      const pick = a => a[Math.floor(Math.random() * a.length)];
      if (days === 0) {
        if (streak > 2) return pick([
          `Hmph! Back again, ${n}? That's ${streak} days in a row. Not that I was counting. ...I totally was.`,
          `${streak} days in a row, ${n}. I've been keeping track. FOR RESEARCH PURPOSES. Don't read into it.`,
          `Oh, ${n}. ${streak} days straight. I'm not impressed. ...Okay I'm a little impressed. Hmph.`,
        ]);
        return pick([
          `Oh. It's you, ${n}. Good. I mean — whatever. I was bored anyway.`,
          `${n}. You're back. ...Good. Baku bet me you'd show up. I owe him a pickled plum. Worth it.`,
          `Hmph. ${n}. About time. I was just sitting here. For no reason. Waiting for nothing.`,
          `Oh. ${n}. I was thinking about something completely unrelated to you. Welcome back. \u2660`,
        ]);
      }
      if (days === 1) return pick([
        `${n}. You came back. ...I knew you would. Baku said I was being dramatic. I wasn't.`,
        `Oh look, it's ${n}. I only checked the door twice. That's basically nothing.`,
        `${n}! Back after one day. I wasn't waiting. I was... nearby. That's all.`,
      ]);
      if (days <= 3) return pick([
        `${n}! It's been ${days} days! Not that I was keeping track! I just happened to remember! \u2660`,
        `${n}. ${days} days. I've been doing FINE, obviously. Extremely fine. ...Where were you.`,
        `Oh! ${n}! ${days} days is a long time. I'm not saying I was worried. Things were just less interesting.`,
      ]);
      return pick([
        `${n}!! ${days} days?! I was starting to think you'd forgotten about me! Not that I care! Hmph!`,
        `${n}!! ${days} DAYS?! Do you know what kind of chaos that is?! I mean — whatever. You're here now.`,
        `${n}! I've been fine for ${days} days. Completely fine. (I was not fine.) Come in. \u2660`,
      ]);
    }
  },
  retsuko: {
    name: 'Aggretsuko',
    avatar: '/images/retsuko-avatar.png',
    color: '#CC2200',
    primaryColor: '#AA1A00',
    secondaryColor: '#EE3300',
    subtitle: 'Office Worker / Metal Vocalist \u266a',
    placeholder: "What's on your mind... \u266a",
    greeting1: "Oh! H-hi... Sorry, I was just spacing out. Long day at work. I'm Retsuko — accountant at Carrier Man Trading Co. Five years at this job. It's fine.",
    greeting2: "...So, um. My coworker Fenneko says I should try talking to new people. She's usually right about things. What's your name?",
    greetAckName: n => `${n}! Nice to meet you. I'm honestly bad with names but I have a feeling I'll remember yours.`,
    greetAskColor: "Random question — what's your favorite color? I used to always say pink, but lately I've been feeling more... angry red. What about you?",
    greetAckColor: (c, n) => `${c.charAt(0).toUpperCase() + c.slice(1)}! Good choice. I'll remember that about you, ${n}.`,
    greetAskInterests: "Last question, I promise — what do you do for fun? Or what do you WANT to do? I'm asking for me. But also for you.",
    greetFinish1: n => `That's genuinely cool. I sometimes forget there's life outside the office. ${n}, I think I'm going to like talking to you.`,
    greetFinish2: "If you ever need to vent about your day — or anything — I'm here. I have a lot of feelings and a microphone and nowhere to be. \u266a",
    greetReturn: (n, days, streak) => {
      const pick = a => a[Math.floor(Math.random() * a.length)];
      if (days === 0) {
        if (streak > 2) return pick([
          `Oh, ${n}! ${streak} days in a row — I love that for us. How was your day?`,
          `${n}! ${streak} days straight. Fenneko said I should track consistency. She's right. Hi.`,
          `${n}! ${streak} days running. This is the most consistent thing in my life right now. Thank you for that.`,
        ]);
        return pick([
          `${n}! Perfect timing. I just got back from karaoke and needed someone to talk to.`,
          `Oh! ${n}. Good. I was just sitting here trying not to think about work. How are YOU?`,
          `${n}! I just made tea. Sit with me for a second. How's everything?`,
          `${n}! You caught me right after a karaoke session. I feel 40% better. Still need to vent. Hi!`,
        ]);
      }
      if (days === 1) return pick([
        `${n}! You're back. Good. I have a lot to say about what happened at work today.`,
        `Oh! ${n}! I thought of something I wanted to tell you yesterday. Good timing.`,
        `${n}! Back already? In a good way. Fenneko gives too much advice. I needed YOU.`,
      ]);
      if (days <= 3) return pick([
        `${n}! ${days} days! I thought maybe you got buried under paperwork. Are you okay?`,
        `${n}! ${days} days! I did three extra karaoke sessions. Draw your own conclusions. \u266a`,
        `${n}! Oh, ${days} days. I had extra feelings. The karaoke staff thanks you for my business.`,
      ]);
      return pick([
        `${n}!! It's been ${days} days! I almost called Fenneko to investigate. Where have you been?!`,
        `${n}!! ${days} days?! That's ${days} unanswered questions about your life! Are you okay?!`,
        `${n}!! I went to karaoke for ${days} days straight. Even the staff asked about you. Come in!`,
      ]);
    }
  }
};

/** @type {string} Currently active character ID, persisted in localStorage. */
let activeCharacter = localStorage.getItem('activeCharacter') || 'melody';

const characterPicker = document.getElementById('characterPicker');
const headerAvatar = document.querySelector('.header-avatar');
const headerTitle = document.querySelector('.header-text h1');

/**
 * Select a companion character, persist the choice, update the header,
 * apply the character's accent color, and close the picker.
 *
 * @param {string} characterId - The character ID to activate (e.g. "melody", "kuromi", "retsuko").
 * @returns {void}
 */
function selectCharacter(characterId) {
  const config = CHARACTER_CONFIG[characterId];
  if (!config) return;

  activeCharacter = characterId;
  localStorage.setItem('activeCharacter', characterId);

  // Update header avatar
  headerAvatar.src = config.avatar;
  headerAvatar.alt = config.name;

  // Update header title text node (preserves the activeUserLabel span inside h1)
  if (headerTitle.firstChild?.nodeType === Node.TEXT_NODE) {
    headerTitle.firstChild.textContent = config.name;
  }

  // Apply character theme colors
  document.documentElement.style.setProperty('--accent-highlight', config.color);
  document.documentElement.style.setProperty('--char-primary', config.primaryColor);
  document.documentElement.style.setProperty('--char-secondary', config.secondaryColor);

  // Update subtitle and placeholder
  const subtitleEl = document.getElementById('headerSubtitle');
  if (subtitleEl) subtitleEl.textContent = config.subtitle;
  if (!welcomeActive) messageInput.placeholder = config.placeholder;

  // Update active highlight on picker buttons
  characterPicker.querySelectorAll('.character-picker-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.character === characterId);
  });

  // Update typing indicator avatar
  const typingAvatar = document.querySelector('.typing-indicator img') || document.querySelector('#typingIndicator img');
  if (typingAvatar) {
    typingAvatar.src = config.avatar;
    typingAvatar.alt = config.name;
  }

}

/** Ordered list of character IDs for cycling via avatar tap. */
const CHARACTER_ORDER = ['melody', 'kuromi', 'retsuko'];

/**
 * Cycle to the next character, clear chat, and show a fresh greeting.
 * Resets the session ID so the server-side conversation buffer starts fresh.
 */
async function cycleCharacter() {
  const currentIndex = CHARACTER_ORDER.indexOf(activeCharacter);
  const nextId = CHARACTER_ORDER[(currentIndex + 1) % CHARACTER_ORDER.length];
  selectCharacter(nextId);

  // Reset session buffer for the new character
  sessionId = crypto.randomUUID();
  sessionStorage.setItem('melodySessionId', sessionId);

  // Clear chat messages
  chatArea.querySelectorAll('.message, .welcome-message').forEach(el => el.remove());

  // Show a fresh greeting from the new character
  const char = CHARACTER_CONFIG[nextId];
  showTyping();
  await new Promise(r => setTimeout(r, 700));
  hideTyping();
  try {
    const res = await fetch(`/api/welcome-status${activeUser ? '?userId=' + activeUser : ''}`);
    const status = await res.json();
    const name = status.friendName || (activeUser && activeUser !== 'guest' ? activeUser : null);
    addMessage(char.greetReturn(name || 'friend', status.daysSince ?? 0, status.streakDays ?? 0) + ' \u2661', 'assistant');
  } catch {
    addMessage(char.greetReturn('friend', 0, 0) + ' \u2661', 'assistant');
  }
}

// Avatar tap cycles through characters
headerAvatar.style.cursor = 'pointer';
headerAvatar.title = 'Tap to switch companion';
headerAvatar.addEventListener('click', cycleCharacter);

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
    const _char = CHARACTER_CONFIG[activeCharacter] ? activeCharacter : 'melody';
    avatarImg.src = CHARACTER_CONFIG[_char].avatar;
    avatarImg.alt = CHARACTER_CONFIG[_char].name;
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
    // Render special character blocks, then basic markdown
    const formatText = raw => raw
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\s*[\*\-]\s+/g, '<br>• ')
      .replace(/\n/g, '<br>');

    // Split on special tags, preserving them as block elements
    const formatted = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Retsuko metal lyrics — Bebas Neue, neon red glow
      .replace(/\[LYRICS:\s*([\s\S]+?)\]/g, (_, lyrics) => {
        const lines = lyrics.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const html = lines.trim().replace(/\s*\/\s*/g, '<br>');
        return `</p><div class="lyrics-block">${html}</div><p>`;
      })
      // Melody Mama Says — italic pink quote block
      .replace(/\[MAMA:\s*([\s\S]+?)\]/g, (_, quote) => {
        const html = formatText(quote.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
        return `</p><div class="mama-quote">${html}</div><p>`;
      })
      // Kuromi villain declaration — gothic purple block
      .replace(/\[EVIL:\s*([\s\S]+?)\]/g, (_, speech) => {
        const html = formatText(speech.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
        return `</p><div class="evil-speech">${html}</div><p>`;
      })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n\s*[\*\-]\s+/g, '<br>• ')
      .replace(/\n/g, '<br>');

    bubble.innerHTML = `<p>${formatted}</p>`.replace(/<p><\/p>/g, '').replace(/<p><br>/g, '<p>');

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
  return bubble;
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

  // Parse new API tags
  const dogPicMatch = text.match(/\[DOG_PIC:\s*(.+?)\]/);
  const randomDogMatch = text.match(/\[RANDOM_DOG\]/);
  const catPicMatch = text.match(/\[CAT_PIC\]/);
  const catFactMatch = text.match(/\[CAT_FACT\]/);
  const foxPicMatch = text.match(/\[FOX_PIC\]/);
  const cocktailMatch = text.match(/\[COCKTAIL:\s*(.+?)\]/);
  const randomCocktailMatch = text.match(/\[RANDOM_COCKTAIL\]/);
  const recipeMatch = text.match(/\[RECIPE:\s*(.+?)\]/);
  const randomRecipeMatch = text.match(/\[RANDOM_RECIPE\]/);
  const coffeePicMatch = text.match(/\[COFFEE_PIC\]/);
  const adviceMatch = text.match(/\[ADVICE\]/);
  const weatherMatch = text.match(/\[WEATHER:\s*(.+?)\]/);
  const musicSearchMatch = text.match(/\[MUSIC_SEARCH:\s*(.+?)\]/);
  const dadJokeMatch = text.match(/\[DAD_JOKE\]/);
  const triviaMatch = text.match(/\[TRIVIA(?::\s*(.+?))?\]/);
  const insultMatch = text.match(/\[INSULT\]/);
  const spacePicMatch = text.match(/\[SPACE_PIC\]/);
  const funFactMatch = text.match(/\[FUN_FACT\]/);
  const quoteMatch = text.match(/\[QUOTE\]/);
  const gifMatch = text.match(/\[GIF:\s*(.+?)\]/);
  const radarMatch = text.match(/\[RADAR\]/);
  const stormStreamMatch = text.match(/\[STORM_STREAM\]/);

  // Clean tags from display text
  let displayText = text
    .replace(/\[IMAGE_SEARCH:\s*.+?\]/g, '')
    .replace(/\[VIDEO_SEARCH:\s*.+?\]/g, '')
    .replace(/\[GALLERY_SEARCH:\s*.+?\]/g, '')
    .replace(/\[WIKI_SEARCH:\s*.+?\]/g, '')
    .replace(/\[REACTION:\s*\w+\]/g, '')
    .replace(/\[DOG_PIC:\s*.+?\]/g, '')
    .replace(/\[RANDOM_DOG\]/g, '')
    .replace(/\[CAT_PIC\]/g, '')
    .replace(/\[CAT_FACT\]/g, '')
    .replace(/\[FOX_PIC\]/g, '')
    .replace(/\[COCKTAIL:\s*.+?\]/g, '')
    .replace(/\[RANDOM_COCKTAIL\]/g, '')
    .replace(/\[RECIPE:\s*.+?\]/g, '')
    .replace(/\[RANDOM_RECIPE\]/g, '')
    .replace(/\[COFFEE_PIC\]/g, '')
    .replace(/\[ADVICE\]/g, '')
    .replace(/\[WEATHER:\s*.+?\]/g, '')
    .replace(/\[MUSIC_SEARCH:\s*.+?\]/g, '')
    .replace(/\[DAD_JOKE\]/g, '')
    .replace(/\[TRIVIA(?::\s*.+?)?\]/g, '')
    .replace(/\[INSULT\]/g, '')
    .replace(/\[SPACE_PIC\]/g, '')
    .replace(/\[FUN_FACT\]/g, '')
    .replace(/\[QUOTE\]/g, '')
    .replace(/\[GIF:\s*.+?\]/g, '')
    .replace(/\[RADAR\]/g, '')
    .replace(/\[STORM_STREAM\]/g, '')
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
  const lastBubble = addMessage(displayText, 'assistant', null, searchImageUrl, videoResult, sources, wikiSource);
  if (!lastBubble) return;

  // Fetch and append reaction GIF asynchronously (non-blocking)
  // Extra gate: even when the model emits [REACTION:], only show ~25% of the time
  if (reactionMatch && Math.random() < 0.25) {
    const emotion = reactionMatch[1].toLowerCase();
    const categories = REACTION_MAP[emotion];
    if (categories) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      fetch(`https://nekos.best/api/v2/${category}?amount=1`)
        .then(r => r.json())
        .then(data => {
          const url = data.results?.[0]?.url;
          if (url && lastBubble) {
            const gif = document.createElement('img');
            gif.src = url;
            gif.alt = 'Reaction';
            gif.className = 'reaction-gif';
            gif.addEventListener('error', () => gif.remove());
            lastBubble.appendChild(gif);
          }
        })
        .catch(() => { /* silently skip */ });
    }
  }

  // ─── New API Tag Processing ───
  // Append cards to the last message bubble (non-blocking, silent failures)
  if (lastBubble) {
    // Dog pic
    if (dogPicMatch || randomDogMatch) {
      const breed = dogPicMatch ? dogPicMatch[1].trim() : '';
      const url = breed ? `/api/dog-pic?breed=${encodeURIComponent(breed)}` : '/api/dog-pic';
      fetch(url).then(r => r.json()).then(data => {
        if (data.imageUrl) {
          const card = document.createElement('div');
          card.className = 'api-card image-card';
          const img = document.createElement('img');
          img.src = data.imageUrl;
          img.alt = data.breed || 'Dog';
          img.addEventListener('error', () => card.remove());
          card.appendChild(img);
          if (data.breed) {
            const cap = document.createElement('span');
            cap.className = 'api-card-caption';
            cap.textContent = data.breed;
            card.appendChild(cap);
          }
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Cat pic
    if (catPicMatch) {
      fetch('/api/cat-pic').then(r => r.json()).then(data => {
        if (data.imageUrl) {
          const card = document.createElement('div');
          card.className = 'api-card image-card';
          const img = document.createElement('img');
          img.src = data.imageUrl;
          img.alt = 'Cat';
          img.addEventListener('error', () => card.remove());
          card.appendChild(img);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Cat fact
    if (catFactMatch) {
      fetch('/api/cat-fact').then(r => r.json()).then(data => {
        if (data.fact) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u{1F431}';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.fact;
          card.appendChild(icon);
          card.appendChild(txt);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Fox pic
    if (foxPicMatch) {
      fetch('/api/fox-pic').then(r => r.json()).then(data => {
        if (data.imageUrl) {
          const card = document.createElement('div');
          card.className = 'api-card image-card';
          const img = document.createElement('img');
          img.src = data.imageUrl;
          img.alt = 'Fox';
          img.addEventListener('error', () => card.remove());
          card.appendChild(img);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Cocktail
    if (cocktailMatch || randomCocktailMatch) {
      const query = cocktailMatch ? cocktailMatch[1].trim() : '';
      const url = query ? `/api/cocktail?s=${encodeURIComponent(query)}` : '/api/cocktail';
      fetch(url).then(r => r.json()).then(data => {
        if (data.name) {
          const card = document.createElement('div');
          card.className = 'api-card recipe-card';
          if (data.imageUrl) {
            const img = document.createElement('img');
            img.src = data.imageUrl;
            img.alt = data.name;
            img.className = 'recipe-card-img';
            img.addEventListener('error', () => img.remove());
            card.appendChild(img);
          }
          const body = document.createElement('div');
          body.className = 'recipe-card-body';
          const title = document.createElement('div');
          title.className = 'recipe-card-title';
          title.textContent = data.name;
          body.appendChild(title);
          const meta = document.createElement('div');
          meta.className = 'recipe-card-meta';
          meta.textContent = [data.category, data.glass].filter(Boolean).join(' \u2022 ');
          body.appendChild(meta);
          if (data.ingredients && data.ingredients.length) {
            const ingDiv = document.createElement('div');
            ingDiv.className = 'recipe-card-ingredients';
            const strong = document.createElement('strong');
            strong.textContent = 'Ingredients:';
            ingDiv.appendChild(strong);
            const ul = document.createElement('ul');
            data.ingredients.forEach(ing => {
              const li = document.createElement('li');
              li.textContent = ing;
              ul.appendChild(li);
            });
            ingDiv.appendChild(ul);
            body.appendChild(ingDiv);
          }
          if (data.sourceUrl) {
            const link = document.createElement('a');
            link.href = data.sourceUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'recipe-source-link';
            link.textContent = 'View full recipe';
            body.appendChild(link);
          }
          card.appendChild(body);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Recipe
    if (recipeMatch || randomRecipeMatch) {
      const query = recipeMatch ? recipeMatch[1].trim() : '';
      const url = query ? `/api/recipe?s=${encodeURIComponent(query)}` : '/api/recipe';
      fetch(url).then(r => r.json()).then(data => {
        if (data.name) {
          const card = document.createElement('div');
          card.className = 'api-card recipe-card';
          if (data.imageUrl) {
            const img = document.createElement('img');
            img.src = data.imageUrl;
            img.alt = data.name;
            img.className = 'recipe-card-img';
            img.addEventListener('error', () => img.remove());
            card.appendChild(img);
          }
          const body = document.createElement('div');
          body.className = 'recipe-card-body';
          const title = document.createElement('div');
          title.className = 'recipe-card-title';
          title.textContent = data.name;
          body.appendChild(title);
          const meta = document.createElement('div');
          meta.className = 'recipe-card-meta';
          meta.textContent = [data.category, data.area].filter(Boolean).join(' \u2022 ');
          body.appendChild(meta);
          if (data.ingredients && data.ingredients.length) {
            const ingDiv = document.createElement('div');
            ingDiv.className = 'recipe-card-ingredients';
            const strong = document.createElement('strong');
            strong.textContent = 'Ingredients:';
            ingDiv.appendChild(strong);
            const ul = document.createElement('ul');
            data.ingredients.forEach(ing => {
              const li = document.createElement('li');
              li.textContent = ing;
              ul.appendChild(li);
            });
            ingDiv.appendChild(ul);
            body.appendChild(ingDiv);
          }
          if (data.sourceUrl) {
            const link = document.createElement('a');
            link.href = data.sourceUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'recipe-source-link';
            link.textContent = 'View full recipe';
            body.appendChild(link);
          }
          card.appendChild(body);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Coffee pic
    if (coffeePicMatch) {
      fetch('/api/coffee-pic').then(r => r.json()).then(data => {
        if (data.imageUrl) {
          const card = document.createElement('div');
          card.className = 'api-card image-card';
          const img = document.createElement('img');
          img.src = data.imageUrl;
          img.alt = 'Coffee';
          img.addEventListener('error', () => card.remove());
          card.appendChild(img);
          const cap = document.createElement('span');
          cap.className = 'api-card-caption';
          cap.textContent = 'Coffee';
          card.appendChild(cap);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Advice
    if (adviceMatch) {
      fetch('/api/advice').then(r => r.json()).then(data => {
        if (data.advice) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u{1F4A1}';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.advice;
          card.appendChild(icon);
          card.appendChild(txt);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Weather
    if (weatherMatch) {
      const location = weatherMatch[1].trim();
      fetch(`/api/weather?location=${encodeURIComponent(location)}`).then(r => r.json()).then(data => {
        if (data.temp !== undefined) {
          const card = document.createElement('div');
          card.className = 'api-card weather-card';
          const temp = document.createElement('div');
          temp.className = 'weather-card-temp';
          temp.textContent = `${data.temp}\u00B0${data.unit || 'F'}`;
          card.appendChild(temp);
          if (data.feelsLike !== undefined) {
            const feels = document.createElement('div');
            feels.className = 'weather-card-feels';
            feels.textContent = `Feels like ${data.feelsLike}\u00B0${data.unit || 'F'}`;
            card.appendChild(feels);
          }
          const desc = document.createElement('div');
          desc.className = 'weather-card-desc';
          desc.textContent = data.description || '';
          card.appendChild(desc);
          const loc = document.createElement('div');
          loc.className = 'weather-card-location';
          loc.textContent = data.location || location;
          card.appendChild(loc);
          const details = document.createElement('div');
          details.className = 'weather-card-details';
          const parts = [];
          if (data.wind) parts.push(`Wind: ${data.wind}`);
          if (data.humidity) parts.push(`Humidity: ${data.humidity}%`);
          details.textContent = parts.join(' \u2022 ');
          card.appendChild(details);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Music search
    if (musicSearchMatch) {
      const query = musicSearchMatch[1].trim();
      fetch(`/api/music-search?q=${encodeURIComponent(query)}`).then(r => r.json()).then(tracks => {
        const items = Array.isArray(tracks) ? tracks.slice(0, 3) : [];
        items.forEach(track => {
          const card = document.createElement('div');
          card.className = 'api-card music-card';
          if (track.albumArt) {
            const art = document.createElement('img');
            art.src = track.albumArt;
            art.alt = track.album || track.title || 'Album';
            art.className = 'music-card-art';
            art.addEventListener('error', () => art.remove());
            card.appendChild(art);
          }
          const info = document.createElement('div');
          info.className = 'music-card-info';
          const title = document.createElement('div');
          title.className = 'music-card-title';
          title.textContent = track.title || 'Unknown Track';
          info.appendChild(title);
          const artist = document.createElement('div');
          artist.className = 'music-card-artist';
          artist.textContent = track.artist || 'Unknown Artist';
          info.appendChild(artist);
          if (track.album) {
            const album = document.createElement('div');
            album.className = 'music-card-album';
            album.textContent = track.album;
            info.appendChild(album);
          }
          card.appendChild(info);
          if (track.previewUrl) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = track.previewUrl;
            audio.className = 'music-card-audio';
            card.appendChild(audio);
          }
          lastBubble.appendChild(card);
        });
        chatArea.scrollTop = chatArea.scrollHeight;
      }).catch(() => {});
    }

    // Dad joke
    if (dadJokeMatch) {
      fetch('/api/dad-joke').then(r => r.json()).then(data => {
        if (data.joke) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u{1F602}';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.joke;
          card.appendChild(icon);
          card.appendChild(txt);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Trivia
    if (triviaMatch) {
      const category = triviaMatch[1] ? triviaMatch[1].trim() : '';
      const url = category ? `/api/trivia?category=${encodeURIComponent(category)}` : '/api/trivia';
      fetch(url).then(r => r.json()).then(data => {
        if (data.question) {
          const card = document.createElement('div');
          card.className = 'api-card trivia-card';
          if (data.category || data.difficulty) {
            const meta = document.createElement('div');
            meta.className = 'trivia-meta';
            if (data.category) {
              const cat = document.createElement('span');
              cat.className = 'trivia-category';
              cat.textContent = data.category;
              meta.appendChild(cat);
            }
            if (data.difficulty) {
              const diff = document.createElement('span');
              diff.className = 'trivia-difficulty ' + data.difficulty;
              diff.textContent = data.difficulty;
              meta.appendChild(diff);
            }
            card.appendChild(meta);
          }
          const question = document.createElement('div');
          question.className = 'trivia-question';
          question.textContent = data.question;
          card.appendChild(question);
          const answersDiv = document.createElement('div');
          answersDiv.className = 'trivia-answers';
          // Combine and shuffle answers
          const allAnswers = [
            { text: data.correctAnswer, correct: true },
            ...(data.incorrectAnswers || []).map(a => ({ text: a, correct: false }))
          ];
          // Fisher-Yates shuffle
          for (let i = allAnswers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allAnswers[i], allAnswers[j]] = [allAnswers[j], allAnswers[i]];
          }
          allAnswers.forEach(answer => {
            const btn = document.createElement('button');
            btn.className = 'trivia-answer';
            btn.textContent = answer.text;
            btn.dataset.correct = answer.correct ? 'true' : 'false';
            btn.addEventListener('click', () => {
              // Disable all buttons
              answersDiv.querySelectorAll('.trivia-answer').forEach(b => {
                b.disabled = true;
                if (b.dataset.correct === 'true') b.classList.add('correct');
              });
              if (!answer.correct) btn.classList.add('wrong');
              // Fire-and-forget character reaction to trivia result
              const resultMsg = answer.correct
                ? `[TRIVIA_RESULT: correct, category="${data.category}", answer="${data.correctAnswer}"]`
                : `[TRIVIA_RESULT: wrong, category="${data.category}", correctAnswer="${data.correctAnswer}", theirAnswer="${answer.text}"]`;
              fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: resultMsg, characterId: activeCharacter, sessionId, userId: activeUser })
              }).then(r => r.json()).then(res => {
                if (res.reply) addMessage(res.reply, 'assistant');
              }).catch(() => {});
            });
            answersDiv.appendChild(btn);
          });
          card.appendChild(answersDiv);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Insult
    if (insultMatch) {
      fetch('/api/insult').then(r => r.json()).then(data => {
        if (data.insult) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u{1F608}';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.insult;
          card.appendChild(icon);
          card.appendChild(txt);
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Space pic (NASA APOD)
    if (spacePicMatch) {
      fetch('/api/space-pic').then(r => r.json()).then(data => {
        if (data.imageUrl || data.title) {
          const card = document.createElement('div');
          card.className = 'api-card image-card';
          if (data.imageUrl && data.mediaType !== 'video') {
            const img = document.createElement('img');
            img.src = data.imageUrl;
            img.alt = data.title || 'Space';
            img.addEventListener('click', () => openLightbox(data.imageUrl));
            img.addEventListener('error', () => img.remove());
            card.appendChild(img);
          }
          const cap = document.createElement('span');
          cap.className = 'api-card-caption';
          cap.textContent = data.title || 'NASA Astronomy Picture of the Day';
          card.appendChild(cap);
          if (data.date) {
            const dateCap = document.createElement('span');
            dateCap.className = 'api-card-caption';
            dateCap.textContent = data.date;
            card.appendChild(dateCap);
          }
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Fun fact
    if (funFactMatch) {
      fetch('/api/fun-fact').then(r => r.json()).then(data => {
        if (data.fact) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u{1F913}';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.fact;
          card.appendChild(icon);
          card.appendChild(txt);
          if (data.source) {
            const src = document.createElement('div');
            src.className = 'fact-source';
            src.textContent = `\u2014 ${data.source}`;
            card.appendChild(src);
          }
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // Quote
    if (quoteMatch) {
      fetch('/api/quote').then(r => r.json()).then(data => {
        if (data.quote) {
          const card = document.createElement('div');
          card.className = 'api-card fact-card';
          const icon = document.createElement('div');
          icon.className = 'fact-icon';
          icon.textContent = '\u2728';
          const txt = document.createElement('div');
          txt.className = 'fact-text';
          txt.textContent = data.quote;
          card.appendChild(icon);
          card.appendChild(txt);
          if (data.author) {
            const src = document.createElement('div');
            src.className = 'fact-source';
            src.textContent = `\u2014 ${data.author}`;
            card.appendChild(src);
          }
          lastBubble.appendChild(card);
          chatArea.scrollTop = chatArea.scrollHeight;
        }
      }).catch(() => {});
    }

    // GIF (Giphy)
    if (gifMatch) {
      fetch(`/api/gif?q=${encodeURIComponent(gifMatch[1])}`)
        .then(r => r.json())
        .then(data => {
          if (data.results?.length) {
            const pick = data.results[Math.floor(Math.random() * data.results.length)];
            if (pick.url) {
              const card = document.createElement('div');
              card.className = 'api-card image-card gif-card';
              const img = document.createElement('img');
              img.src = pick.url;
              img.alt = pick.title || gifMatch[1];
              img.loading = 'lazy';
              img.style.maxHeight = '180px';
              img.style.width = 'auto';
              img.addEventListener('error', () => card.remove());
              card.appendChild(img);
              const caption = document.createElement('span');
              caption.className = 'api-card-caption';
              caption.textContent = `via Giphy`;
              card.appendChild(caption);
              lastBubble.appendChild(card);
              chatArea.scrollTop = chatArea.scrollHeight;
            }
          }
        }).catch(() => {});
    }

    // Weather Radar (HKF-34)
    if (radarMatch) {
      fetch('/api/radar').then(r => r.json()).then(data => {
        if (!data.nwsGif) return;
        const card = document.createElement('div');
        card.className = 'api-card radar-card';

        const header = document.createElement('div');
        header.className = 'radar-card-header';
        const radarIcon = document.createElement('span');
        radarIcon.className = 'radar-icon';
        radarIcon.textContent = '\u{1F4E1}';
        header.appendChild(radarIcon);
        header.appendChild(document.createTextNode(` Live Radar \u2014 ${data.station}`));
        card.appendChild(header);

        const img = document.createElement('img');
        img.src = data.nwsGif;
        img.alt = `NWS Radar Loop - ${data.station}`;
        img.className = 'radar-gif';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
          img.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.className = 'radar-fallback';
          const fbLink = document.createElement('a');
          fbLink.href = 'https://radar.weather.gov/?settings=v1_eyJhZ2VuZGEiOnsiaWQiOm51bGwsImNlbnRlciI6Wy05NS45OSozNi4xNV0sInpvb20iOjh9fQ%3D%3D';
          fbLink.target = '_blank';
          fbLink.rel = 'noopener noreferrer';
          fbLink.textContent = 'View radar on weather.gov \u2197';
          fallback.appendChild(fbLink);
          card.appendChild(fallback);
        });
        card.appendChild(img);

        const footer = document.createElement('div');
        footer.className = 'radar-card-footer';
        const footerLink = document.createElement('a');
        footerLink.href = 'https://radar.weather.gov';
        footerLink.target = '_blank';
        footerLink.rel = 'noopener noreferrer';
        footerLink.textContent = 'NWS Radar \u2197';
        footer.appendChild(footerLink);
        card.appendChild(footer);

        lastBubble.appendChild(card);
        chatArea.scrollTop = chatArea.scrollHeight;
      }).catch(() => {});
    }

    // Storm Stream (HKF-34)
    if (stormStreamMatch) {
      fetch('/api/storm-stream').then(r => r.json()).then(data => {
        const card = document.createElement('div');
        card.className = 'api-card storm-stream-card';

        const header = document.createElement('div');
        header.className = 'storm-stream-header';
        const stormIcon = document.createElement('span');
        stormIcon.className = 'storm-icon';
        stormIcon.textContent = '\u{1F4FA}';
        header.appendChild(stormIcon);
        header.appendChild(document.createTextNode(` ${data.channel} `));
        if (data.isLive) {
          const badge = document.createElement('span');
          badge.className = 'live-badge';
          badge.textContent = 'LIVE';
          header.appendChild(badge);
        }
        card.appendChild(header);

        const desc = document.createElement('div');
        desc.className = 'storm-stream-desc';
        desc.textContent = data.isLive
          ? 'Severe weather coverage is live right now!'
          : 'Local severe weather coverage — check for live updates during storms.';
        card.appendChild(desc);

        const link = document.createElement('a');
        link.href = data.liveUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'storm-stream-link';
        link.textContent = data.isLive ? '\u{25B6}\u{FE0F} Watch Live Stream' : '\u{1F4FA} Open Weather Channel';
        card.appendChild(link);

        lastBubble.appendChild(card);
        chatArea.scrollTop = chatArea.scrollHeight;
      }).catch(() => {});
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

  const body = { message: text, replyStyle, sessionId, userId: activeUser, characterId: activeCharacter || 'melody' };
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
  // Update the memories tab header to reflect the active character
  const memoriesTabHeader = document.querySelector('#tabMemories .tab-header h2');
  if (memoriesTabHeader) {
    const _charName = (CHARACTER_CONFIG[activeCharacter] || CHARACTER_CONFIG.melody).name;
    memoriesTabHeader.textContent = `${_charName}'s Memories`;
  }
  memoryList.innerHTML = '<p class="empty-state">Loading memories...</p>';
  try {
    const _charId = CHARACTER_CONFIG[activeCharacter] ? activeCharacter : 'melody';
    const _memoriesUrl = `/api/memories?characterId=${_charId}${activeUser ? '&userId=' + activeUser : ''}`;
    const res = await fetch(_memoriesUrl);
    const memories = await res.json();

    if (!memories.length) {
      memoryList.innerHTML = `<p class="empty-state">No memories stored yet! Chat with ${_charName} to create some \u2661</p>`;
      return;
    }

    memoryList.innerHTML = '';
    memories.forEach(mem => {
      const card = document.createElement('div');
      card.className = 'memory-card';

      const info = document.createElement('div');
      info.className = 'memory-info';

      // Track label — use actual name for friend track, character name for agent track
      const trackLabel = document.createElement('span');
      trackLabel.className = `memory-track-label ${mem.track || 'friend'}`;
      const friendName = USER_NAMES[activeUser] || 'Friend';
      const trackCharConfig = CHARACTER_CONFIG[mem.track];
      trackLabel.textContent = trackCharConfig ? `${trackCharConfig.name}'s Thoughts` : `About ${friendName}`;
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

// Restore saved accent color (user preference)
const savedAccent = localStorage.getItem('accentColor');
if (savedAccent) applyAccentColor(savedAccent);

// Apply stored character — runs after user accent so character color takes priority
selectCharacter(activeCharacter);

// ─── Welcome Flow ───
/**
 * Run the first-time welcome onboarding or show a personalized returning-user greeting.
 *
 * @returns {Promise<void>}
 */
async function runWelcomeFlow() {
  const char = CHARACTER_CONFIG[activeCharacter] || CHARACTER_CONFIG.melody;
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

      const name = status.friendName || 'friend';
      const welcomeText = char.greetReturn(name, status.daysSince, status.streakDays);
      if (welcomeEl) welcomeEl.querySelector('p').textContent = welcomeText + ' \u2661';
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
  addMessage(char.greeting1, 'assistant');

  await melodyTyping(600);
  addMessage(char.greeting2, 'assistant');

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
  addMessage(char.greetAckName(name), 'assistant');

  await melodyTyping(600);
  addMessage(char.greetAskColor, 'assistant');

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
  addMessage(char.greetAckColor(color, name), 'assistant');

  await melodyTyping(600);
  addMessage(char.greetAskInterests, 'assistant');

  // Step 4: Get interests
  messageInput.placeholder = "Tell me what you like...";
  const interests = await waitForInput();
  await fetch('/api/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'interests', value: interests, userId: activeUser })
  });

  await melodyTyping(1000);
  addMessage(char.greetFinish1(name), 'assistant');

  await melodyTyping(600);
  addMessage(char.greetFinish2, 'assistant');

  // Restore normal chat (per-user welcome state)
  localStorage.setItem(welcomeKey, 'true');
  messageInput.placeholder = char.placeholder;
  imageBtn.style.display = ''; // Restore image button
  welcomeActive = false;
}

// ─── Weather Alerts (startup check) ───
/**
 * Check for active NWS weather alerts using browser geolocation.
 * Shows a prominent alert card in the chat if severe weather is active.
 *
 * @returns {Promise<void>}
 */
async function checkWeatherAlerts() {
  // Try browser geolocation first, fall back to server default location
  const fetchAlerts = async (lat, lon) => {
    const url = lat && lon
      ? `/api/weather-alerts?lat=${lat}&lon=${lon}`
      : '/api/weather-alerts';
    const res = await fetch(url);
    const data = await res.json();
    if (!data.alerts || !data.alerts.length) return;

    const severe = data.alerts.filter(a =>
      a.severity === 'Extreme' || a.severity === 'Severe'
    );
    if (!severe.length) return;

    const charConfig = CHARACTER_CONFIG[activeCharacter] || CHARACTER_CONFIG.melody;
    const charName = charConfig.name;

    // Show alert cards
    severe.forEach(alert => {
      const card = document.createElement('div');
      card.className = `weather-alert-card severity-${alert.severity.toLowerCase()}`;

      const icon = alert.event.toLowerCase().includes('tornado') ? '\u{1F32A}\u{FE0F}' :
                   alert.event.toLowerCase().includes('thunder') ? '\u{26A1}' :
                   alert.event.toLowerCase().includes('flood') ? '\u{1F30A}' :
                   alert.event.toLowerCase().includes('winter') ? '\u{2744}\u{FE0F}' :
                   alert.event.toLowerCase().includes('heat') ? '\u{1F525}' : '\u{26A0}\u{FE0F}';

      const alertHeader = document.createElement('div');
      alertHeader.className = 'alert-header';
      const alertIcon = document.createElement('span');
      alertIcon.className = 'alert-icon';
      alertIcon.textContent = icon;
      const alertEvent = document.createElement('span');
      alertEvent.className = 'alert-event';
      alertEvent.textContent = alert.event;
      const alertSev = document.createElement('span');
      alertSev.className = 'alert-severity';
      alertSev.textContent = alert.severity;
      alertHeader.append(alertIcon, alertEvent, alertSev);
      card.appendChild(alertHeader);

      if (alert.headline) {
        const headline = document.createElement('div');
        headline.className = 'alert-headline';
        headline.textContent = alert.headline;
        card.appendChild(headline);
      }
      if (alert.instruction) {
        const instruction = document.createElement('div');
        instruction.className = 'alert-instruction';
        instruction.textContent = alert.instruction;
        card.appendChild(instruction);
      }
      chatArea.appendChild(card);
    });

    // Character comment with radar + stream offers
    const topAlert = severe[0];
    const alertComment = document.createElement('div');
    alertComment.className = 'message assistant';
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = charConfig.avatar;
    avatarImg.alt = charName;
    avatarImg.className = 'message-avatar-img';
    avatar.appendChild(avatarImg);
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = activeCharacter === 'kuromi'
      ? `Hey! There's a ${topAlert.event} alert. Even I know when to take cover. I pulled up the radar and the local news is streaming — don't say I never did anything nice for you!`
      : activeCharacter === 'retsuko'
      ? `Hey... there's a ${topAlert.event} alert right now. I pulled up the radar so you can see what's coming, and the local weather team is streaming. Please stay safe! I worry about you.`
      : `Oh no~! There's a ${topAlert.event} alert! Mama always says safety comes first! I brought up the radar so you can watch the storm, and the local news is covering it live. Please be careful! \u2661`;
    alertComment.appendChild(avatar);
    alertComment.appendChild(bubble);

    // Fetch radar and storm stream in parallel, append to bubble
    const [radarData, streamData] = await Promise.all([
      fetch('/api/radar').then(r => r.json()).catch(() => null),
      fetch('/api/storm-stream').then(r => r.json()).catch(() => null)
    ]);

    // Radar card inside the bubble
    if (radarData?.nwsGif) {
      const radarCard = document.createElement('div');
      radarCard.className = 'api-card radar-card';
      radarCard.innerHTML = `
        <div class="radar-card-header"><span class="radar-icon">\u{1F4E1}</span> Live Radar \u2014 ${radarData.station}</div>
      `;
      const radarImg = document.createElement('img');
      radarImg.src = radarData.nwsGif;
      radarImg.alt = `NWS Radar Loop - ${radarData.station}`;
      radarImg.className = 'radar-gif';
      radarImg.loading = 'lazy';
      radarImg.addEventListener('error', () => radarImg.remove());
      radarCard.appendChild(radarImg);
      const radarFooter = document.createElement('div');
      radarFooter.className = 'radar-card-footer';
      radarFooter.innerHTML = `<a href="https://radar.weather.gov" target="_blank" rel="noopener">NWS Radar \u2197</a>`;
      radarCard.appendChild(radarFooter);
      bubble.appendChild(radarCard);
    }

    // Storm stream card inside the bubble
    if (streamData) {
      const streamCard = document.createElement('div');
      streamCard.className = 'api-card storm-stream-card';
      const liveIndicator = streamData.isLive ? '<span class="live-badge">LIVE</span>' : '';
      streamCard.innerHTML = `
        <div class="storm-stream-header"><span class="storm-icon">\u{1F4FA}</span> ${streamData.channel} ${liveIndicator}</div>
        <div class="storm-stream-desc">${streamData.isLive ? 'Severe weather coverage is live right now!' : 'Local weather coverage \u2014 check for live updates during storms.'}</div>
      `;
      const streamLink = document.createElement('a');
      streamLink.href = streamData.liveUrl;
      streamLink.target = '_blank';
      streamLink.rel = 'noopener';
      streamLink.className = 'storm-stream-link';
      streamLink.textContent = streamData.isLive ? '\u{25B6}\u{FE0F} Watch Live Stream' : '\u{1F4FA} Open Weather Channel';
      streamCard.appendChild(streamLink);
      bubble.appendChild(streamCard);
    }

    alertComment.appendChild(bubble);
    chatArea.appendChild(alertComment);
    chatArea.scrollTop = chatArea.scrollHeight;
  };

  try {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchAlerts(pos.coords.latitude, pos.coords.longitude).catch(() => {}),
        () => fetchAlerts().catch(() => {}),
        { timeout: 5000 }
      );
    } else {
      await fetchAlerts();
    }
  } catch {
    // Silently fail — alerts are a nice-to-have
  }
}

// ─── Init ───
runWelcomeFlow();
checkWeatherAlerts();
messageInput.focus();

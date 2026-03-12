# MyMelo Roadmap

> Last updated: 2026-03-06
> Current version: v2.7.1 (dev branch)
> Linear project: Multi-Character & API Expansion (v3.0)

---

## Completed (v2.5 - v2.7)

- HKF-5: Melody Universe & Personality v2.4
- HKF-6: Multi-User Identity (per-user mem0 tracks + user selector)
- HKF-7: Smart Response Mode (research vs roleplay intent detection)
- HKF-8: Prompt tuning (Straight Talk, character tics, health disclaimers)
- HKF-9: Multi-Character Architecture (Melody, Kuromi, Retsuko)
- HKF-10: Kuromi Personality & System Prompt (from TV transcript research)
- HKF-11: Aggretsuko (Retsuko) Personality & System Prompt (from TV transcript research)
- HKF-12: API Integration Framework & Capabilities Endpoint
- HKF-13: Animal & Pet API Integrations
- HKF-14: Food, Drink & Lifestyle API Integrations
- HKF-15: Music, Entertainment & Fun API Integrations
- HKF-16: Cross-Character Memory Mesh
- 18 API proxy endpoints + Giphy integration
- Character-specific styled message blocks ([MAMA:], [EVIL:], [LYRICS:])
- Tap-to-cycle character switching
- Weather alerts via NWS + Open-Meteo fallback

---

## Phase 1: Bug Fixes & Polish (v3.1)

Priority: **Urgent** — actively impacting user experience.

### HKF-18: Memory Identity Bleed Fix

Agent memory track saves raw assistant text without character attribution. mem0's
inference engine can extract "I like X" and attribute it to the wrong character.

- Prefix agent track saves with `[CharacterName speaking]:` wrapper
- Add `character_name` to mem0 metadata for future filtering
- Strengthen IDENTITY LOCK prompt to reinforce "you are NOT the other characters"

### HKF-19: Responsive GIF & Media Sizing

GIFs (Giphy + reaction) are too small on mobile (180px max-height), previously
shrunk from being too large on desktop.

- `.gif-card img`: responsive max-height (280px mobile, 180px desktop via media query)
- Inline reaction GIF: replace hardcoded `max-width:200px` with responsive class
- Audit all image/card sizing for mobile comfort

### HKF-20: API Card Rendering — Inline Attachment Fix

API response cards (weather, recipe, trivia, facts, etc.) sometimes append below
the chat flow instead of inside the character's message bubble.

- Root cause: `chatArea.querySelector('.message.assistant:last-child .message-bubble')`
  races with DOM animation timing
- Fix: pass bubble element reference directly from `addMessage()` to tag processing
- Eliminate all DOM re-queries for `lastBubble`

### HKF-21: Remove Broken Game Implementations

Games (Would You Rather, Word Chain, 20 Questions, Story Builder, Emoji Charades)
were quick additions with no interactive UI or state management.

- Remove game-related prompt sections from all 3 character prompts
- Remove game tags/matching from app.js
- Keep trivia (has working card UI, gets improved separately)
- Update HKF-17 to reflect "games v2" planning status
- Update /api/capabilities to remove game entries

### HKF-22: Trivia Polish & Character Reactions

Trivia card shows questions and highlights correct/wrong, but has no character
feedback and displays HTML entities.

- Decode HTML entities in question and answer text (Open Trivia DB encodes them)
- After answer selection, auto-send a context message so the character reacts
  ("I just answered a trivia question about X and got it right/wrong!")
- Add answer explanation or fun fact after reveal
- Add category/difficulty badge to the trivia card

### HKF-23: API Response Formatting & Prompt Engineering

Weather, recipe, music, and other API responses feel disconnected from character
personality. Cards appear but the surrounding text is generic.

- Add Ali:Chat examples to each character prompt showing how to introduce API content
  naturally (e.g., Melody: "Oh~! Let me check the weather for you..." vs generic)
- Richer weather cards (forecast icons, wind direction, "feels like")
- Recipe cards: add "try it" link to source, show prep time more prominently
- Music cards: better layout on mobile, album art sizing
- Fact/joke cards: character-appropriate emoji and framing

---

## Phase 2: Interactive Experiences (v3.2)

Priority: **High** — games done right + daily engagement.

### HKF-24: Trivia Showdown (Multi-Round Game)

Enhance existing trivia into a proper scored game experience.

- Multi-round sessions (5-10 questions per game)
- Running score display with streak tracking
- Character commentary between rounds (personality-specific reactions)
- Difficulty scaling based on performance
- Category selection or character-curated categories
- End-of-game summary with character's take on performance
- Persist high scores per user

### HKF-25: Truth or Lie Game

Character states 3 "facts" — user guesses which is fabricated.

- Character-appropriate lies (Kuromi's are outrageous, Melody's are sweet, Retsuko's
  are workplace absurdities)
- Reveal animation with character reaction
- Score tracking across rounds
- No new APIs needed — pure LLM + prompt engineering

### HKF-26: Riddles & Brain Teasers

Character gives riddles with a hint system.

- Character-themed riddle selection
- Progressive hint reveals (3 hints before answer)
- Character reacts to guesses with personality
- No new APIs needed

### HKF-27: Daily Rituals & Proactive Engagement

Give the app a reason to open every day.

- Morning greeting customized by character and time of day
- Mood check-in ("How are you feeling today?")
- "On this day" memory callbacks (mem0 search for date-relevant memories)
- Daily horoscope (free horoscope API integration)
- Streak-based rewards (new character reactions at milestones)

### HKF-28: New API Integrations (Bored, Quotes, Dictionary, History)

Expand conversational tools with free, no-auth APIs.

- **Bored API** (boredapi.com): Activity suggestions for "I'm bored" queries
- **Quotable** (quotable.io): Inspirational/funny quotes, character-curated
- **Free Dictionary API**: Word definitions, pronunciation, synonyms
- **On This Day**: Historical events for daily facts
- **PokeAPI**: Pokemon data for game conversations
- **DuckDuckGo Instant Answers**: Quick factual lookups
- Tags: `[ACTIVITY]`, `[QUOTE]`, `[DEFINE: word]`, `[HISTORY]`, `[POKEMON: name]`

---

## Phase 3: Personality & Memory Architecture (v3.3)

Priority: **Medium** — deepens engagement quality.

### HKF-29: Emotion-Based Avatars

Different character icons based on emotional state per message. Originally HKF-1
scope (refocused from infrastructure to feature work).

- LLM emits `[EMOTION: state]` tag per message
- States: happy (default), sad, excited, thinking, love, surprised, angry
- Frontend swaps avatar src on the message bubble
- Need artwork sourced/created for each character x emotion combination
- File naming: `melody-happy.png`, `kuromi-angry.png`, `retsuko-rage.png`, etc.

### HKF-30: Core Memory Blocks (Structured Always-Injected Context)

Move beyond free-form mem0 search to structured, always-present context.

- Explicit memory blocks: user preferences, relationship status, character personality state
- Higher priority than search-based memories in prompt assembly
- Editable by user (settings UI for "things I want you to remember")
- Character-specific blocks (Melody's baking preferences, Kuromi's diary entries, etc.)

### HKF-31: Rolling Conversation Summaries

Compress older conversation history into condensed summaries.

- Periodically summarize last N exchanges into a paragraph
- Inject summaries alongside raw mem0 results for richer context
- Reduces token usage while preserving long-term context
- Separate summary tracks per character per user

### HKF-32: Personality Drift & Character Canon

Characters subtly evolve based on interactions while maintaining core identity.

- Personality state tracking (e.g., Melody's confidence, Kuromi's warmth, Retsuko's
  stress management)
- Drift happens gradually through agent track memories
- Character Canon Lock: core traits that can never be overwritten
- User-visible personality growth milestones

---

## Phase 4: Stretch Goals (v3.4+)

Priority: **Low** — ambitious future features.

### Multi-Character Group Chat

Characters talk to each other in a shared thread. User can watch or participate.
Builds on cross-character memory mesh. SillyTavern-style group dynamics.

### Voice / TTS Integration

Character-specific voices via Web Speech API (free) or ElevenLabs (paid).
Melody: soft, gentle. Kuromi: sharp, energetic. Retsuko: alternates polite/screaming.

### Proactive Push Notifications

Service worker push notifications with in-character messages. Morning greetings,
streak reminders, milestone celebrations, "I was thinking about what you said..."

### Virtual Gifting & Collectibles

Virtual item economy — users give items to characters, unlocking reactions or
visual changes. Character-specific item preferences.

### Collapsible Content Sections

Expandable/collapsible sections for wiki results, long stories, game rules.
Prevents wall-of-text while keeping content accessible.

### Lorebook / World Info System

SillyTavern-inspired contextual lore injection. Keywords trigger relevant character
or world lore, keeping the base prompt lean while enabling deep knowledge.

---

## Phase 5: Provider Abstraction & BYOK (v3.5+)

Priority: **Low** — long-term architecture for a real multi-user app.

### HKF-37: OpenRouter Integration & Multi-Provider Support

Replace direct Google Gemini SDK with a provider abstraction layer that supports
multiple LLM backends through a single interface.

**Why OpenRouter first:**
- Single API key gives access to Gemini, OpenAI, Anthropic, Meta, Mistral, and
  open-source models
- Built-in usage monitoring and per-model cost tracking
- Web search plugin (`:online` suffix) replaces Google Search grounding
- OpenAI-compatible API — uses the `openai` SDK with a different `baseURL`
- We already have $100 in OpenRouter credits for non-Google models

**Provider targets (in order):**
1. **OpenRouter** — broadest coverage, easiest swap (OpenAI SDK compatible)
2. **Direct OpenAI** — for users with OpenAI keys
3. **Direct Gemini** — keep existing path as an option

**Implementation scope:**
- Thin adapter layer normalizing message format, image/vision encoding, system
  prompt injection, and JSON mode across providers
- Provider config in env vars (`LLM_PROVIDER=openrouter|openai|gemini`,
  `LLM_MODEL=google/gemini-2.0-flash`, `OPENROUTER_API_KEY`, etc.)
- OpenRouter web search plugin (`:online` suffix) for grounding — returns
  `url_citation` annotations, maps to existing sources UI
- Brave Search stays for image/video search (OpenRouter search is text-only)
- Model picker in settings UI (dropdown populated from provider's model list)
- Per-model cost display from OpenRouter's pricing API

**BYOK (Bring Your Own Key) — future:**
- Settings UI for users to enter their own API keys
- Keys stored locally (localStorage or encrypted server-side per user)
- Provider auto-detection from key format
- Rate limiting and key validation

**Technical notes:**
- 4 `generateContent()` call sites to convert (main chat, wiki followup, core
  memory extraction, session summary)
- Google's `{ role, parts: [{ text }] }` → OpenAI's `{ role, content }`
- Google's `inlineData` → OpenAI's `image_url` with data URI
- Google's `systemInstruction` → `{ role: "system" }` message
- Google's `responseMimeType: 'application/json'` → `response_format: { type: "json_object" }`
- Google's `thinkingConfig` has no OpenAI equivalent (drop silently)

---

## API Registry

### Currently Integrated

| API | Tag | Auth | Status |
|-----|-----|------|--------|
| Giphy | `[GIF: query]` | API key | Active |
| Brave Search (images) | `[IMAGE_SEARCH: query]` | API key | Active |
| Brave Search (videos) | `[VIDEO_SEARCH: query]` | API key | Active |
| NWS + Open-Meteo | `[WEATHER: location]` | None | Active |
| TheMealDB | `[RECIPE: name]` / `[RANDOM_RECIPE]` | None | Active |
| TheCocktailDB | `[COCKTAIL: name]` / `[RANDOM_COCKTAIL]` | None | Active |
| Deezer | `[MUSIC_SEARCH: query]` | None | Active |
| Dog CEO | `[DOG_PIC: breed]` / `[RANDOM_DOG]` | None | Active |
| The Cat API | `[CAT_PIC]` | None | Active |
| Cat Facts | `[CAT_FACT]` | None | Active |
| RandomFox | `[FOX_PIC]` | None | Active |
| Coffee Pic | `[COFFEE_PIC]` | None | Active |
| Advice Slip | `[ADVICE]` | None | Active |
| icanhazdadjoke | `[DAD_JOKE]` | None | Active |
| Open Trivia DB | `[TRIVIA]` | None | Active |
| Evil Insult | `[INSULT]` | None | Active |
| NASA APOD | `[SPACE_PIC]` | None | Active |
| uselessfacts | `[FUN_FACT]` | None | Active |
| Quotable | `[QUOTE]` | None | Active |
| nekos.best | `[REACTION: emotion]` | None | Active |
| MediaWiki (HKIA/MC) | `[WIKI_SEARCH: id query]` | None | Active |

### Planned (Phase 2)

| API | Tag | Auth | Notes |
|-----|-----|------|-------|
| Bored API | `[ACTIVITY]` | None | Activity suggestions |
| Free Dictionary | `[DEFINE: word]` | None | Definitions + pronunciation |
| On This Day | `[HISTORY]` | None | Historical events |
| PokeAPI | `[POKEMON: name]` | None | Pokemon data |
| DuckDuckGo IA | `[LOOKUP: query]` | None | Quick factual answers |
| Horoscope API | `[HOROSCOPE: sign]` | None | Daily horoscope |

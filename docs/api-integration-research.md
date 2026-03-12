# API Integration Research -- MyMelo v3.0

**Purpose:** Verified API endpoints, auth requirements, and integration plan for chat companion expansion.

---

## TIER 1 -- HIGH PRIORITY

### Petfinder API v2

| Field | Detail |
|-------|--------|
| **Base URL** | `https://api.petfinder.com/v2/` |
| **Auth** | OAuth2 client_credentials. Register at petfinder.com/developers. |
| **Token endpoint** | `POST /v2/oauth2/token` (expires 3600s) |
| **Key endpoint** | `GET /v2/animals?type=cat&location=ZIP&status=adoptable` |
| **Response** | Rich JSON: name, breed, age, gender, photos (4 sizes), description, contact, organization |
| **Rate limits** | Token expires hourly. Daily limits not published. |
| **Status** | ACTIVE -- well-maintained, Purina-backed |
| **Character fit** | All characters -- especially relevant for kitten adoption |

### Deezer API

| Field | Detail |
|-------|--------|
| **Base URL** | `https://api.deezer.com/` |
| **Auth** | None for search/metadata. OAuth2 only for user data. |
| **Key endpoint** | `GET /search?q=deadmau5&limit=5` |
| **Response** | Track title, artist (with images), album (with cover art 4 sizes), duration, **30-second MP3 preview URL**, Deezer link, explicit flag |
| **Rate limits** | 50 requests per 5 seconds per IP |
| **Status** | ACTIVE -- preview URLs are live and playable |
| **Character fit** | Retsuko (death metal, EDM), all characters for music discovery |

### Dog CEO API

| Field | Detail |
|-------|--------|
| **Base URL** | `https://dog.ceo/api/` |
| **Auth** | None |
| **Key endpoints** | `/breeds/image/random`, `/breed/{breed}/images/random`, `/breeds/list/all` |
| **Response** | `{"message":"https://images.dog.ceo/breeds/...jpg","status":"success"}` |
| **Status** | ACTIVE -- 20,000+ images, 120+ breeds |
| **Note** | Replaces Shibe.online (dead since mid-2024) |

### TheCocktailDB

| Field | Detail |
|-------|--------|
| **Base URL** | `https://www.thecocktaildb.com/api/json/v1/1/` |
| **Auth** | Test key `1` (fine for personal app) |
| **Key endpoints** | `search.php?s=margarita`, `random.php`, `filter.php?i=Vodka` |
| **Response** | Drink name, category, glass type, instructions, thumbnail, up to 15 ingredients with measures |
| **Status** | ACTIVE |
| **Character fit** | Retsuko especially ("you need a drink after that day") |

---

## TIER 2 -- MEDIUM PRIORITY

### icanhazdadjoke

| Field | Detail |
|-------|--------|
| **Base URL** | `https://icanhazdadjoke.com/` |
| **Auth** | None. Set `Accept: application/json` header. |
| **Search** | `GET /search?term=cat` |
| **Response** | `{"id":"...","joke":"...","status":200}` |
| **Character fit** | Melody (clean, family-friendly humor) |

### Advice Slip

| Field | Detail |
|-------|--------|
| **Base URL** | `https://api.adviceslip.com/advice` |
| **Auth** | None |
| **Search** | `/advice/search/{query}` |
| **Response** | `{"slip":{"id":142,"advice":"..."}}` |
| **Character fit** | Melody -- "Mama always says..." content generator |

### MeowFacts

| Field | Detail |
|-------|--------|
| **Base URL** | `https://meowfacts.herokuapp.com/` |
| **Auth** | None |
| **Params** | `?count=3` for multiple, `?lang=ukr` for language |
| **Response** | `{"data":["fact..."]}` |
| **Backup** | `https://catfact.ninja/fact` (also active, no auth) |
| **Status** | ACTIVE but on Heroku (may cold-start) |

### TheCatAPI

| Field | Detail |
|-------|--------|
| **Base URL** | `https://api.thecatapi.com/v1/images/search` |
| **Auth** | None for basic (10 req/min). Free API key for higher limits. |
| **Response** | `[{"id":"...","url":"...","width":245,"height":200}]` |
| **Character fit** | Pairs with MeowFacts for kitten-loving household |

### RandomFox

| Field | Detail |
|-------|--------|
| **Base URL** | `https://randomfox.ca/floof/` |
| **Auth** | None |
| **Response** | `{"image":"https://randomfox.ca/images/54.jpg","link":"..."}` |
| **Note** | Pool of 124 images only. |
| **Status** | ACTIVE |

### TheMealDB

| Field | Detail |
|-------|--------|
| **Base URL** | `https://www.themealdb.com/api/json/v1/1/` |
| **Auth** | Test key `1` |
| **Key endpoints** | `search.php?s=chicken`, `random.php`, `filter.php?a=Japanese` |
| **Response** | Meal name, category, area, full instructions, YouTube link, thumbnail, up to 20 ingredients |
| **Status** | ACTIVE -- 598 meals, 877 ingredients |

### Open Trivia Database

| Field | Detail |
|-------|--------|
| **Base URL** | `https://opentdb.com/api.php` |
| **Auth** | None (optional session token) |
| **Params** | `?amount=1&category=9&difficulty=easy&type=multiple` |
| **Response** | Question, correct answer, incorrect answers, category, difficulty |
| **Status** | ACTIVE -- 4,000+ questions, 24 categories |

---

## TIER 3 -- NICE TO HAVE

### Coffee API

| Field | Detail |
|-------|--------|
| **Base URL** | `https://coffee.alexflipnote.dev/random.json` |
| **Auth** | None |
| **Response** | `{"file":"https://coffee.alexflipnote.dev/...jpg"}` |
| **Status** | ACTIVE -- 1,257 images |

### EmojiHub

| Field | Detail |
|-------|--------|
| **Base URL** | `https://emojihub.yurace.pro/api/` |
| **Auth** | None |
| **Key endpoints** | `random`, `random/category/{category}`, `random/group/{group}` |
| **Response** | `{"name":"...","category":"...","htmlCode":["&#...;"],"unicode":["U+..."]}` |
| **Status** | ACTIVE |

### Evil Insult Generator

| Field | Detail |
|-------|--------|
| **Base URL** | `https://evilinsult.com/generate_insult.php?lang=en&type=json` |
| **Auth** | None |
| **Response** | `{"insult":"...","language":"en"}` |
| **Status** | ACTIVE |
| **Character fit** | Kuromi (snarky), Retsuko (rage mode) |
| **Caution** | Content can be harsh -- filter or curate for tone |

### NASA APOD

| Field | Detail |
|-------|--------|
| **Base URL** | `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY` |
| **Auth** | DEMO_KEY (30 req/hr). Free registered key = 1,000 req/hr. |
| **Response** | Date, explanation, HD URL, title, media type |
| **Note** | One picture per day -- trivial to cache |

### Useless Facts

| Field | Detail |
|-------|--------|
| **Base URL** | `https://uselessfacts.jsph.pl/api/v2/facts/random` |
| **Auth** | None |
| **Response** | `{"text":"...","source":"..."}` |

### ZenQuotes

| Field | Detail |
|-------|--------|
| **Base URL** | `https://zenquotes.io/api/random` |
| **Auth** | None |
| **Rate limits** | 5 requests per 30 seconds |
| **Response** | `[{"q":"quote","a":"author"}]` |

### Bored API (AppBrewery fork)

| Field | Detail |
|-------|--------|
| **Base URL** | `https://bored-api.appbrewery.com/random` |
| **Auth** | None |
| **Response** | `{"activity":"...","type":"recreational","participants":1,"kidFriendly":true}` |
| **Note** | Original boredapi.com is DOWN. This fork works. |

### YouTube Data API v3

| Field | Detail |
|-------|--------|
| **Base URL** | `https://www.googleapis.com/youtube/v3/` |
| **Auth** | API key (free from Google Cloud Console) |
| **Quota** | 10,000 units/day. `search.list` = 100 units. ~100 searches/day. |
| **Note** | Brave video search already returns YouTube results for free. Use YT API only when you need actual videoId for embedding. |
| **Optimization** | Use `videos.list` (1 unit) after getting IDs from Brave, not `search.list` (100 units). |

---

## DEAD / DEPRECATED

| API | Status | Alternative |
|-----|--------|-------------|
| Shibe.online | Dead since mid-2024 | Dog CEO API |
| Bored API (boredapi.com) | Dead | AppBrewery fork |

---

## ALREADY INTEGRATED

| API | Status | Endpoints |
|-----|--------|-----------|
| nekos.best | ACTIVE | ~48 reaction GIF endpoints (hug, pat, wave, etc.) |
| Brave Search | ACTIVE | Image search, video search |
| HKIA Wiki | ACTIVE | MediaWiki API |
| Minecraft Wiki | ACTIVE | MediaWiki API |
| Google Search (Gemini grounding) | ACTIVE | Built into Gemini model |

---

## CHARACTER-API MAPPING

| API | Melody | Kuromi | Retsuko |
|-----|--------|--------|---------|
| Petfinder | "Oh~ look at this little kitten!" | "Tch... it's not THAT cute... (saves photo)" | "I need something soft to hug after today" |
| Deezer | Background music | Punk/rock searches | Death metal, EDM |
| TheCocktailDB | "Mama says tea is better~" | "Make it strong." | "I NEED this after today" |
| Evil Insult | "That's not very nice!" | Uses them gleefully | Rage mode fuel |
| Advice Slip | "Mama always says..." | "Hmph, obvious." | "If only it were that simple..." |
| Dad Jokes | Laughs genuinely | "...that's so dumb. (suppresses smile)" | Groans, then laughs |
| Cat Facts | "Oh my~ did you know...?" | "...whatever." | "Cats have it figured out" |

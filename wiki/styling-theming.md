# Styling & Theming

> **Last verified:** 2026-02-27
> **Source files:** `public/style.css`, `public/app.js` (accent color logic)
> **Known gaps:** None

---

## Overview

All styles are in a single `public/style.css` file (1073 lines). No CSS preprocessor, no CSS modules, no utility framework. Theming is driven by CSS custom properties on `:root` with dark mode overrides on `[data-theme="dark"]`.

## CSS Custom Properties

### Light Mode (`:root`)

| Variable | Value | Usage |
|----------|-------|-------|
| `--hot-pink` | `#FF69B4` | Primary brand color, header gradient, buttons, links |
| `--soft-pink` | `#FFB6C1` | Borders, scrollbar thumb, input border, secondary backgrounds |
| `--pale-pink` | `#FFF0F5` | Page background, assistant bubble bg, input bg |
| `--lavender` | `#E6E6FA` | User avatar background, desktop body gradient |
| `--light-lavender` | `#F3F0FF` | Welcome message gradient |
| `--white` | `#FFFFFF` | Card backgrounds, app container bg, tab bar bg |
| `--text-dark` | `#5C4155` | Primary text color (dark mauve) |
| `--text-light` | `#8B6F7F` | Secondary text, placeholders, labels |
| `--shadow-pink` | `rgba(255, 105, 180, 0.2)` | Input focus ring, desktop container shadow |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` | iOS notch/home indicator padding |
| `--accent-highlight` | `var(--hot-pink)` | Active tab indicator color (overridden by user's favorite color) |

### Dark Mode Overrides (`[data-theme="dark"]`)

| Variable | Dark Value | Notes |
|----------|-----------|-------|
| `--hot-pink` | `#FF69B4` | Unchanged -- stays vibrant |
| `--soft-pink` | `#4A3040` | Dark muted pink for borders |
| `--pale-pink` | `#2A1F25` | Dark background replacing pale pink |
| `--lavender` | `#2D2B3A` | Dark purple-gray |
| `--light-lavender` | `#353040` | Dark purple |
| `--white` | `#1A1520` | Near-black replacing white |
| `--text-dark` | `#F0E0F0` | Light pink-white text |
| `--text-light` | `#A090A0` | Muted lavender for secondary text |
| `--shadow-pink` | `rgba(255, 105, 180, 0.15)` | Reduced shadow opacity |

Additional dark mode overrides via `[data-theme="dark"]` selectors:

| Element | Override |
|---------|----------|
| `.chat-header` | `linear-gradient(135deg, #CC5590, #AA4070)` |
| `.message.user .message-bubble` | `linear-gradient(135deg, #CC5590, #AA4070)` |
| `#messageInput` | `background: #2A1F25`, `color: #F0E0F0`, `border-color: #4A3040` |
| `.settings-dropdown` | `background: #2A1F25`, deeper shadow |
| `#replyStyleSelect` | `background: #353040`, `color: #F0E0F0` |
| `.toggle-btn` | `background: #353040`, `color: #F0E0F0` |
| `.wiki-source` | `linear-gradient(135deg, #2D2840, #352D48)` |
| `.wiki-source-label` | `color: #C4A0E0` |
| `.wiki-source-title` | `color: #D8B4FE` |
| `.tab-bar` | `background: #1A1520`, `border-top-color: #4A3040` |
| `#sendBtn` | `linear-gradient(135deg, #CC5590, #AA4070)` |
| `.memory-track-label.melody` | `background: rgba(139, 111, 168, 0.2)`, `color: #C4A0E0` |

## Dark Mode Toggle

Implemented in `app.js`:

```js
darkMode = !darkMode;
localStorage.setItem('darkMode', darkMode);
if (darkMode) {
  document.documentElement.setAttribute('data-theme', 'dark');
} else {
  document.documentElement.removeAttribute('data-theme');
}
```

- Attribute `data-theme="dark"` is set on the `<html>` element
- State persisted in `localStorage('darkMode')` as string `'true'` / `'false'`
- Restored on page load before any rendering

## Accent Color System

Users pick a favorite color during the welcome flow. This maps to a CSS variable override.

### COLOR_MAP (app.js)

| Color Name | Hex | Color Name | Hex |
|-----------|-----|-----------|-----|
| `red` | `#E74C3C` | `orange` | `#FF9800` |
| `pink` | `#FF69B4` | `coral` | `#FF7675` |
| `hotpink` | `#FF69B4` | `peach` | `#FFAB91` |
| `rose` | `#FF6B81` | `salmon` | `#FA8072` |
| `blue` | `#3498DB` | `yellow` | `#F1C40F` |
| `navy` | `#2C3E8C` | `gold` | `#FFD700` |
| `skyblue` | `#5DADE2` | `purple` | `#9B59B6` |
| `cyan` | `#00BCD4` | `violet` | `#7C4DFF` |
| `teal` | `#009688` | `lavender` | `#B39DDB` |
| `green` | `#27AE60` | `lilac` | `#C8A2C8` |
| `mint` | `#00D2A0` | `black` | `#5C4155` |
| `lime` | `#8BC34A` | `white` | `#FF69B4` |
| `sage` | `#8FBC8F` | | |

Total: 24 named colors. `black` maps to the mauve text color; `white` falls back to hot pink.

### Application

```js
function applyAccentColor(colorName) {
  const hex = COLOR_MAP[colorName.toLowerCase().trim()];
  if (hex) {
    document.documentElement.style.setProperty('--accent-highlight', hex);
    localStorage.setItem('accentColor', colorName);
  }
}
```

The `--accent-highlight` variable is used by:

```css
.tab-btn.active { color: var(--accent-highlight); }
.tab-btn.active svg { stroke: var(--accent-highlight); }
```

Saved to `localStorage('accentColor')` and restored on page load.

## Font

[Quicksand](https://fonts.google.com/specimen/Quicksand) from Google Fonts. Weights loaded: 400, 500, 600, 700.

```html
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Applied globally:

```css
html, body {
  font-family: 'Quicksand', sans-serif;
}
```

Explicitly reapplied on interactive elements that do not inherit font-family: `.tab-btn`, `.toggle-btn`, `#replyStyleSelect`, `#messageInput`, `.install-banner`, `.user-picker-title`, `.user-picker-btn`.

## Layout

### Mobile-First

The base layout is full-width, full-height (`width: 100%; height: 100%`). The app container uses a vertical flexbox:

```css
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### Desktop Card

At `min-width: 541px`, the app is centered in a card:

```css
@media (min-width: 541px) {
  html, body {
    display: flex;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg,
      var(--pale-pink) 0%,
      var(--lavender) 50%,
      var(--soft-pink) 100%);
  }
  .app-container {
    max-width: 420px;
    height: 90vh;
    max-height: 800px;
    border-radius: 24px;
    box-shadow: 0 20px 60px var(--shadow-pink),
                0 0 0 1px rgba(255, 182, 193, 0.3);
  }
}
```

| Property | Mobile | Desktop (>540px) |
|----------|--------|----------|
| Width | 100% | max 420px |
| Height | 100% | 90vh, max 800px |
| Border radius | 0 | 24px |
| Background | `var(--hot-pink)` | Gradient (pale pink -> lavender -> soft pink) |

## Avatar Styling

### Header Avatar

```css
.header-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #FFFFFF;        /* Hardcoded, NOT var(--white) */
  border: 2px solid rgba(255, 255, 255, 0.6);
  object-fit: contain;
  padding: 2px;
}
```

### Message Avatar (Assistant)

```css
.message-avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: contain;
  background: #FFFFFF;        /* Hardcoded, NOT var(--white) */
  border: 1.5px solid rgba(255, 105, 180, 0.3);
  padding: 2px;
}
```

### Typing Indicator Avatar

```css
.typing-avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: contain;
  background: #FFFFFF;        /* Hardcoded, NOT var(--white) */
  padding: 2px;
}
```

### Why #FFFFFF is Hardcoded

In dark mode, `var(--white)` resolves to `#1A1520` (near-black). If avatar backgrounds used the CSS variable, My Melody's white/pink character art would render against a dark background, making her skin appear discolored. All three avatar contexts hardcode `#FFFFFF` to prevent this.

## Settings Dropdown

```css
.settings-dropdown {
  position: absolute;
  top: 44px;
  right: 0;
  background: var(--white);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  padding: 12px 16px;
  min-width: 200px;
  z-index: 50;
}
```

- Anchored to `.settings-container` (positioned relative)
- Gear button is 36x36px, circular, semi-transparent white background
- Hidden via `.hidden` class (`display: none`)
- Contains 4 rows: Dark Mode, Sounds, Reply Style, User

## Message Bubble Styles

### User Bubbles (Right-Aligned)

```css
.message.user { align-self: flex-end; flex-direction: row-reverse; }

.message.user .message-bubble {
  background: linear-gradient(135deg, var(--hot-pink), #FF85C8);
  color: var(--white);
  border-bottom-right-radius: 6px;   /* Chat tail effect */
}

.message.user .message-avatar {
  background: var(--lavender);
  color: var(--text-dark);
}
```

User avatar shows a sparkle character (Unicode `U+2726`).

### Assistant Bubbles (Left-Aligned)

```css
.message.assistant { align-self: flex-start; }

.message.assistant .message-bubble {
  background: var(--pale-pink);
  color: var(--text-dark);
  border-bottom-left-radius: 6px;    /* Chat tail effect */
  border: 1px solid rgba(255, 182, 193, 0.4);
}
```

Assistant avatar shows the My Melody PNG image.

### Common Bubble Properties

```css
.message-bubble {
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  word-wrap: break-word;
}
```

### Message Animation

```css
@keyframes message-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.message { animation: message-in 0.3s ease-out; }
```

## Typing Indicator Animation

Three bouncing dots with staggered delays:

```css
.typing-bubbles span {
  width: 8px;
  height: 8px;
  background: var(--soft-pink);
  border-radius: 50%;
  animation: typing-bounce 1.4s ease-in-out infinite;
}

.typing-bubbles span:nth-child(2) { animation-delay: 0.2s; }
.typing-bubbles span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); background: var(--soft-pink); }
  30%           { transform: translateY(-8px); background: var(--hot-pink); }
}
```

Dots bounce 8px upward and change from soft pink to hot pink at peak, then return. The indicator container is hidden by default (`display: none`) and shown via `.active` class.

## Tab Indicator Styles

```css
.tab-btn {
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-light);
  font-size: 11px;
  font-weight: 600;
  min-height: 48px;
  transition: color 0.2s;
}

.tab-btn.active {
  color: var(--accent-highlight);          /* User's chosen accent color */
}

.tab-btn.active svg {
  stroke: var(--accent-highlight);
}
```

The tab bar sits at the bottom with `border-top: 1px solid rgba(255, 182, 193, 0.4)` and `min-height: 56px`. Each tab button contains an SVG icon and a text label. The active tab's icon and label adopt the accent highlight color.

## Z-Index Layering

| Layer | z-index | Element |
|-------|---------|---------|
| Lightbox / User picker | 100 | `.lightbox`, `.user-picker-overlay` |
| Install banner | 60 | `.install-banner` |
| Settings dropdown | 50 | `.settings-dropdown` |
| Everything else | auto | Default stacking |

## Key Animations

| Name | Duration | Easing | Usage |
|------|----------|--------|-------|
| `message-in` | 0.3s | ease-out | New message bubbles fade + slide up |
| `typing-bounce` | 1.4s | ease-in-out, infinite | Typing indicator dots |
| `slide-up` | 0.4s | ease-out | PWA install banner entrance |

## Global Reset

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  height: 100%;
  overflow: hidden;
}
```

`-webkit-tap-highlight-color: transparent` removes the blue/gray tap flash on mobile WebKit browsers.

---

## Related Pages

- [Client Architecture](client-architecture.md) - DOM structure, event handling, accent color logic
- [PWA & Service Worker](pwa-service-worker.md) - Manifest, caching, install prompt

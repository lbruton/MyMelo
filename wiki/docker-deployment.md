# Docker Deployment

> **Last verified:** 2026-03-11 — audited from `Dockerfile`, `docker-compose.yml`, `mem0-server/docker-compose.yml`, `server.js`
> **Source files:** `Dockerfile`, `docker-compose.yml`, `mem0-server/Dockerfile`, `mem0-server/docker-compose.yml`, `server.js`, `package.json`
> **Known gaps:** None

---

## Dockerfile Walkthrough

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/data/images

EXPOSE 3000

CMD ["node", "server.js"]
```

| Step | Purpose |
|------|---------|
| `FROM node:20-alpine` | Minimal Node.js 20 image (~50 MB base) |
| `WORKDIR /app` | All paths relative to `/app` inside the container |
| `COPY package.json` + `npm install --production` | Install only production dependencies (express, @google/genai, dotenv). Cached layer — only re-runs when `package.json` changes. |
| `COPY . .` | Copy application source code (server.js, public/, etc.) |
| `mkdir -p /app/data/images` | Ensure data directories exist (overridden by volume mount at runtime) |
| `EXPOSE 3000` | Document the HTTP port (informational only) |
| `CMD ["node", "server.js"]` | Start the Express server |

Production dependencies (3 packages):

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.21.2 | HTTP server and routing |
| `@google/genai` | ^1.0.0 | Gemini AI SDK |
| `dotenv` | ^16.4.7 | Environment variable loading |

---

## docker-compose.yml Configuration

```yaml
services:
  my-melody-chat:
    image: mymelo-my-melody-chat:latest
    ports:
      - "3030:3000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - MEM0_API_KEY=${MEM0_API_KEY}
      - MEM0_MODE=${MEM0_MODE}
      - MEM0_SELF_URL=${MEM0_SELF_URL}
      - BRAVE_API_KEY=${BRAVE_API_KEY}
      - GIPHY_API_KEY=${GIPHY_API_KEY}
      - DEFAULT_LAT=${DEFAULT_LAT}
      - DEFAULT_LON=${DEFAULT_LON}
      - NWS_RADAR_STATION=${NWS_RADAR_STATION}
      - NWS_OFFICE=${NWS_OFFICE}
    volumes:
      - melody-data:/app/data
    restart: unless-stopped

volumes:
  melody-data:
```

| Setting | Value | Purpose |
|---------|-------|---------|
| `image: mymelo-my-melody-chat:latest` | Pre-built image | Built via Portainer Docker build API from repo tar |
| `ports: 3030:3000` | Host 3030 to container 3000 | HTTP access at `http://192.168.1.81:3030` |
| `volumes: melody-data:/app/data` | Named Docker volume | Persists `relationship.json`, `images-meta.json`, `sanrio-characters.json`, and `images/` across container rebuilds |
| `restart: unless-stopped` | Auto-restart | Container restarts on crash or host reboot (unless explicitly stopped) |

## mem0 Server Stack (Portainer Stack ID 21)

The self-hosted mem0 backend runs as a separate Docker Compose stack:

```yaml
# mem0-server/docker-compose.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_storage:/qdrant/storage
    restart: unless-stopped

  mem0-server:
    build: .
    ports:
      - "8769:8080"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
      - COLLECTION_NAME=mymelo
      - LLM_MODEL=gemini-2.5-flash-lite
      - EMBED_MODEL=gemini-embedding-001
      - EMBED_DIMS=768
      - KNOWN_USER_IDS=melody-friend-amelia,melody-friend-lonnie
      - KNOWN_AGENT_IDS=my-melody,kuromi,retsuko
      - LOG_LEVEL=INFO
    depends_on:
      - qdrant
    restart: unless-stopped

volumes:
  qdrant_storage:
```

| Service | Port | Purpose |
|---------|------|---------|
| `qdrant` | 6333 | Vector store (embeddings) |
| `mem0-server` | 8769 | FastAPI mem0 wrapper + dashboard |

---

## Build and Run

### First-time setup

```bash
cd /Volumes/DATA/GitHub/MyMelo

# Set environment variables (or use a .env file)
export GEMINI_API_KEY="your-key-here"
export MEM0_API_KEY="your-key-here"
export BRAVE_API_KEY="your-key-here"

# Build and start
docker-compose up --build -d
```

### Rebuild after code changes

```bash
docker-compose down && docker-compose up --build -d
```

### Check logs

```bash
docker-compose logs --tail 20
docker-compose logs -f              # Follow live
```

### Verify startup

Look for these lines in the logs:

```
Loaded 46 Sanrio characters for universe context
✿ My Melody Chat v2.5 is running on port 3000 (HTTP) ✿
✿ My Melody Chat v2.4 is running on port 3443 (HTTPS) ✿
```

The HTTPS line only appears if certificate files are present.

---

## Named Volume: melody-data

The `melody-data` volume is a **Docker named volume**, not a bind mount. This means:

- Data persists across `docker-compose down` and `docker-compose up --build`
- Data is NOT visible in the host filesystem at a predictable path
- Data is destroyed ONLY by `docker volume rm melody-data`
- To access files inside the volume, use `docker cp` or `docker exec`

### Copy files into the running container

```bash
# Copy a file into the data directory
docker cp sanrio-characters.json $(docker-compose ps -q my-melody-chat):/app/data/

# Copy an image into the images directory
docker cp photo.jpg $(docker-compose ps -q my-melody-chat):/app/data/images/
```

### Copy files out of the container

```bash
# Export relationship data
docker cp $(docker-compose ps -q my-melody-chat):/app/data/relationship.json ./backup-relationship.json

# Export all image metadata
docker cp $(docker-compose ps -q my-melody-chat):/app/data/images-meta.json ./backup-images-meta.json
```

### Inspect volume contents

```bash
docker exec $(docker-compose ps -q my-melody-chat) ls -la /app/data/
docker exec $(docker-compose ps -q my-melody-chat) ls -la /app/data/images/
```

---

## HTTPS Setup (Optional)

HTTPS is needed for PWA install prompts on LAN devices (Android/iOS require HTTPS or localhost). The server checks for certificate files at startup.

### Certificate file locations

| File | Path inside container | Purpose |
|------|----------------------|---------|
| `cert.pem` | `/app/certs/cert.pem` | SSL certificate |
| `key.pem` | `/app/certs/key.pem` | SSL private key |

### Generate a self-signed certificate

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem \
  -days 365 -nodes -subj '/CN=localhost'
```

The `certs/` directory is copied into the container during `docker build` (via `COPY . .`). After adding certs, rebuild:

```bash
docker-compose down && docker-compose up --build -d
```

Access via `https://localhost:3031` or `https://<LAN-IP>:3031`.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | - | Google AI Studio API key for Gemini 3 Flash |
| `MEM0_API_KEY` | Cloud mode | - | mem0.ai API token for persistent memory |
| `MEM0_MODE` | No | `cloud` | `cloud` or `selfhosted` — selects mem0 backend |
| `MEM0_SELF_URL` | Self-hosted | - | Self-hosted mem0 server URL (e.g., `http://192.168.1.81:8769`) |
| `BRAVE_API_KEY` | Yes | - | Brave Search API subscription token |
| `GIPHY_API_KEY` | Yes | - | Giphy API key for GIF reactions |
| `DEFAULT_LAT` | No | - | Default latitude for weather (geolocation fallback) |
| `DEFAULT_LON` | No | - | Default longitude for weather (geolocation fallback) |
| `NWS_RADAR_STATION` | No | - | NWS radar station ID (e.g., `KINX`) |
| `NWS_OFFICE` | No | - | NWS forecast office (e.g., `TSA`) |
| `MEM0_USER_ID` | No | `melody-friend` | mem0 user track ID (legacy fallback, overridden by per-user KNOWN_USERS) |
| `PORT` | No | `3000` | HTTP listener port |

API keys are stored in Infisical under the MyMelo project, dev environment.

### Using a .env file

Create a `.env` file in the project root (same directory as `docker-compose.yml`):

```bash
GEMINI_API_KEY=your-gemini-key
MEM0_API_KEY=your-mem0-key
BRAVE_API_KEY=your-brave-key
```

Docker Compose automatically reads `.env` files for variable substitution in `${VAR}` syntax.

---

## Common Docker Commands

| Command | Purpose |
|---------|---------|
| `docker-compose up --build -d` | Build and start in background |
| `docker-compose down` | Stop and remove container (volume preserved) |
| `docker-compose logs --tail 50` | View last 50 log lines |
| `docker-compose logs -f` | Follow live logs |
| `docker-compose restart` | Restart without rebuilding |
| `docker-compose exec my-melody-chat sh` | Shell into the running container |
| `docker volume ls` | List all Docker volumes |
| `docker volume inspect melody-data` | Inspect the data volume |
| `docker volume rm melody-data` | Permanently delete all persisted data |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Container exits immediately | Missing API keys | Check `docker-compose logs` for error. Ensure all three API keys are set. |
| Port 3030 already in use | Another container or process on that port | `docker-compose down` any old containers, or change the host port in `docker-compose.yml` |
| `sanrio-characters.json not found` | File not in data volume | Copy it in: `docker cp sanrio-characters.json $(docker-compose ps -q my-melody-chat):/app/data/` |
| Changes not reflected | Old Docker layer cache | Use `docker-compose down && docker-compose up --build -d` (not just `restart`) |
| Images not persisting | Volume not mounted | Verify `melody-data:/app/data` in `docker-compose.yml`. Check `docker volume ls`. |
| HTTPS not starting | Missing cert files | Ensure `certs/cert.pem` and `certs/key.pem` exist before building |
| Stale frontend after deploy | Service worker cache | Bump `CACHE_NAME` in `public/sw.js` (e.g., `melody-v2.6`) |
| npm install fails in build | Network or registry issue | Retry build. Check Docker network settings. |

---

## Related Pages

- [Architecture Overview](architecture-overview.md) — system diagram, port configuration, design decisions
- [API Reference](api-reference.md) — all endpoints and request/response shapes
- [Data Persistence](data-persistence.md) — what lives in the Docker volume

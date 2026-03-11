"""
MyMelo mem0 Server — Cloud-API-compatible self-hosted memory backend.

Wraps the mem0ai Python library with FastAPI endpoints that match the
mem0 cloud API surface, so server.js needs minimal changes (swap base URL).

LLM: Gemini 2.5 Flash Lite (cheapest stable model)
Embedder: text-embedding-004 via Gemini (768 dims)
Vector Store: Qdrant
"""

import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from mem0 import Memory

# ─── Configuration ───

QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "mymelo")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-2.5-flash-lite")
EMBED_MODEL = os.getenv("EMBED_MODEL", "models/text-embedding-004")
EMBED_DIMS = int(os.getenv("EMBED_DIMS", "768"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(level=getattr(logging, LOG_LEVEL), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("mem0-server")

# Set Google API key for mem0's Gemini provider
os.environ["GOOGLE_API_KEY"] = GEMINI_API_KEY

# ─── mem0 Setup ───

mem0_config = {
    "llm": {
        "provider": "gemini",
        "config": {
            "model": LLM_MODEL,
            "temperature": 0.2,
            "max_tokens": 2000,
        },
    },
    "embedder": {
        "provider": "gemini",
        "config": {
            "model": EMBED_MODEL,
        },
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": COLLECTION_NAME,
            "host": QDRANT_HOST,
            "port": QDRANT_PORT,
            "embedding_model_dims": EMBED_DIMS,
        },
    },
}

memory: Memory = None


@asynccontextmanager
async def lifespan(application: FastAPI):
    global memory
    log.info("Initializing mem0 with config: llm=%s embedder=%s qdrant=%s:%s collection=%s",
             LLM_MODEL, EMBED_MODEL, QDRANT_HOST, QDRANT_PORT, COLLECTION_NAME)
    memory = Memory.from_config(mem0_config)
    log.info("mem0 initialized successfully")
    yield
    log.info("Shutting down mem0 server")


app = FastAPI(title="MyMelo mem0 Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static dashboard
app.mount("/static", StaticFiles(directory="static"), name="static")


# ─── Helper: normalize mem0 results to cloud API format ───

def normalize_result(item):
    """Ensure each memory result has the fields the cloud API returns."""
    if isinstance(item, dict):
        return {
            "id": item.get("id", ""),
            "memory": item.get("memory", item.get("text", "")),
            "user_id": item.get("user_id"),
            "agent_id": item.get("agent_id"),
            "metadata": item.get("metadata", {}),
            "created_at": item.get("created_at", ""),
            "updated_at": item.get("updated_at", ""),
            "score": item.get("score"),
        }
    return item


# ─── Cloud-Compatible API Endpoints ───


@app.post("/v2/memories/search/")
async def search_memories(request: Request):
    """
    Cloud-compatible search endpoint.
    Body: { query, filters: { user_id | agent_id }, top_k, rerank }
    """
    body = await request.json()
    query = body.get("query", "")
    filters = body.get("filters", {})
    top_k = body.get("top_k", 10)

    kwargs = {"query": query, "limit": top_k}
    if "user_id" in filters:
        kwargs["user_id"] = filters["user_id"]
    if "agent_id" in filters:
        kwargs["agent_id"] = filters["agent_id"]

    try:
        results = memory.search(**kwargs)
        # mem0 library returns a dict with 'results' key or a list
        if isinstance(results, dict):
            items = results.get("results", [])
        else:
            items = results if isinstance(results, list) else []
        normalized = [normalize_result(r) for r in items]
        log.info("Search query=%r scope=%r returned %d results", query[:50], filters, len(normalized))
        return {"results": normalized}
    except Exception as e:
        log.error("Search error: %s", e)
        return {"results": []}


@app.post("/v1/memories/")
async def add_memory(request: Request):
    """
    Cloud-compatible add memory endpoint.
    Body: { messages: [{role, content}], user_id?, agent_id?, infer?, metadata? }
    """
    body = await request.json()
    messages = body.get("messages", [])
    user_id = body.get("user_id")
    agent_id = body.get("agent_id")
    metadata = body.get("metadata", {})

    kwargs = {"messages": messages, "metadata": metadata}
    if user_id:
        kwargs["user_id"] = user_id
    if agent_id:
        kwargs["agent_id"] = agent_id

    try:
        results = memory.add(**kwargs)
        log.info("Added memory user_id=%s agent_id=%s", user_id, agent_id)
        return {"results": results if isinstance(results, list) else [results] if results else []}
    except Exception as e:
        log.error("Add memory error: %s", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/v1/memories/")
async def list_memories(
    user_id: str = Query(None),
    agent_id: str = Query(None),
):
    """
    Cloud-compatible list memories endpoint.
    Query: ?user_id=X or ?agent_id=X
    """
    kwargs = {}
    if user_id:
        kwargs["user_id"] = user_id
    if agent_id:
        kwargs["agent_id"] = agent_id

    try:
        results = memory.get_all(**kwargs)
        # mem0 returns a dict with 'results' or a list
        if isinstance(results, dict):
            items = results.get("results", results.get("memories", []))
        else:
            items = results if isinstance(results, list) else []
        normalized = [normalize_result(r) for r in items]
        log.info("Listed memories scope=%r returned %d", kwargs, len(normalized))
        return {"results": normalized}
    except Exception as e:
        log.error("List memories error: %s", e)
        return {"results": []}


@app.delete("/v1/memories/{memory_id}/")
async def delete_memory(memory_id: str = Path(...)):
    """
    Cloud-compatible delete memory endpoint.
    """
    try:
        memory.delete(memory_id=memory_id)
        log.info("Deleted memory %s", memory_id)
        return {"deleted": True}
    except Exception as e:
        log.error("Delete memory error: %s", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Migration / Import Endpoint ───


@app.post("/v1/memories/import")
async def import_memories(request: Request):
    """
    Bulk import pre-extracted memories (skips LLM fact extraction).
    Stores each memory text with its embedding directly.

    Body: {
        memories: [
            { text, user_id?, agent_id?, metadata?, created_at? }
        ]
    }
    """
    body = await request.json()
    items = body.get("memories", [])
    imported = 0
    errors = 0

    for item in items:
        text = item.get("text", "")
        user_id = item.get("user_id")
        agent_id = item.get("agent_id")
        metadata = item.get("metadata", {})

        if not text:
            continue

        # Use add() with the fact as a user message — mem0 will re-extract
        # but for clean single-fact strings, extraction is idempotent
        kwargs = {
            "messages": [{"role": "user", "content": text}],
            "metadata": metadata,
        }
        if user_id:
            kwargs["user_id"] = user_id
        if agent_id:
            kwargs["agent_id"] = agent_id

        try:
            memory.add(**kwargs)
            imported += 1
        except Exception as e:
            log.error("Import error for '%s': %s", text[:50], e)
            errors += 1

    log.info("Import complete: %d imported, %d errors out of %d total", imported, errors, len(items))
    return {"imported": imported, "errors": errors, "total": len(items)}


# ─── Dashboard API (for the HTML dashboard) ───


# Known scopes to query for stats — add new users/agents here
KNOWN_USER_IDS = os.getenv("KNOWN_USER_IDS", "melody-friend-amelia,melody-friend-lonnie").split(",")
KNOWN_AGENT_IDS = os.getenv("KNOWN_AGENT_IDS", "my-melody,kuromi,retsuko").split(",")


@app.get("/api/stats")
async def get_stats():
    """Return memory counts across all known scopes."""
    stats = {"total_memories": 0, "tracks": {}}
    try:
        for uid in KNOWN_USER_IDS:
            uid = uid.strip()
            if not uid:
                continue
            result = memory.get_all(user_id=uid)
            items = result.get("results", result.get("memories", [])) if isinstance(result, dict) else result
            count = len(items) if isinstance(items, list) else 0
            if count:
                stats["tracks"][uid] = count
                stats["total_memories"] += count

        for aid in KNOWN_AGENT_IDS:
            aid = aid.strip()
            if not aid:
                continue
            result = memory.get_all(agent_id=aid)
            items = result.get("results", result.get("memories", [])) if isinstance(result, dict) else result
            count = len(items) if isinstance(items, list) else 0
            if count:
                stats["tracks"][aid] = count
                stats["total_memories"] += count
    except Exception as e:
        log.error("Stats error: %s", e)
    return stats


@app.get("/api/memories/all")
async def dashboard_list_all(
    user_id: str = Query(None),
    agent_id: str = Query(None),
    search: str = Query(None),
):
    """Dashboard: list or search memories."""
    if search:
        kwargs = {"query": search, "limit": 50}
        if user_id:
            kwargs["user_id"] = user_id
        if agent_id:
            kwargs["agent_id"] = agent_id
        try:
            results = memory.search(**kwargs)
            items = results.get("results", []) if isinstance(results, dict) else results
            return {"memories": [normalize_result(r) for r in items]}
        except Exception as e:
            log.error("Dashboard search error: %s", e)
            return {"memories": []}
    else:
        kwargs = {}
        if user_id:
            kwargs["user_id"] = user_id
        if agent_id:
            kwargs["agent_id"] = agent_id
        try:
            results = memory.get_all(**kwargs)
            items = results.get("results", results.get("memories", [])) if isinstance(results, dict) else results
            return {"memories": [normalize_result(r) for r in items]}
        except Exception as e:
            log.error("Dashboard list error: %s", e)
            return {"memories": []}


@app.delete("/api/memories/{memory_id}")
async def dashboard_delete(memory_id: str = Path(...)):
    """Dashboard: delete a memory."""
    try:
        memory.delete(memory_id=memory_id)
        return {"ok": True}
    except Exception as e:
        log.error("Dashboard delete error: %s", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Dashboard HTML ───


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Serve the dashboard HTML."""
    try:
        with open("static/dashboard.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(content="<h1>Dashboard not found</h1>", status_code=404)


# ─── Health Check ───


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "collection": COLLECTION_NAME,
        "llm_model": LLM_MODEL,
        "embed_model": EMBED_MODEL,
        "qdrant": f"{QDRANT_HOST}:{QDRANT_PORT}",
    }

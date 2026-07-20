"""Thin proxy over the GIPHY search API (issue #66 Stage B).

Kept separate from `RetroService` because it has nothing to do with board
state — it's a stateless HTTP proxy whose only job is keeping `GIPHY_API_KEY`
off the client. Nothing here touches `RetroBoard`/`RetroCard`.
"""
from __future__ import annotations

import os

import httpx

GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search"
GIPHY_TRENDING_URL = "https://api.giphy.com/v1/gifs/trending"


class GifSearchError(Exception):
    """Raised when the provider isn't configured or the upstream call fails."""


def search_gifs(query: str, limit: int = 24) -> list[dict]:
    """Search GIPHY, or return trending GIFs when `query` is blank — lets the
    frontend show a populated grid the moment the picker opens, before the
    user types anything.
    """
    api_key = os.getenv("GIPHY_API_KEY")
    if not api_key:
        raise GifSearchError("GIPHY_API_KEY is not configured")

    query = query.strip()
    url = GIPHY_TRENDING_URL if not query else GIPHY_SEARCH_URL
    params = {"api_key": api_key, "limit": limit, "rating": "pg-13"}
    if query:
        params["q"] = query

    try:
        resp = httpx.get(url, params=params, timeout=5.0)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise GifSearchError(f"GIF search failed: {e}") from e

    results = []
    for item in resp.json().get("data", []):
        images = item.get("images", {})
        preview = images.get("fixed_height_small") or images.get("fixed_height") or {}
        full = images.get("fixed_height") or images.get("original") or {}
        if not preview.get("url") or not full.get("url"):
            continue
        results.append({
            "id": item.get("id"),
            "preview_url": preview["url"],
            "url": full["url"],
            "title": item.get("title", ""),
        })
    return results

"""Retro board card image/GIF attachments (issue #66)."""
from __future__ import annotations

import pytest

from app.retro_models import RetroTemplate
from app.retro_service import RetroError


def _board(retro_service, template=RetroTemplate.MAD_SAD_GLAD):
    return retro_service.create_board("X", template, "alice")


def test_add_card_with_image_url(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text", "https://example.com/cat.gif")
    assert card.image_url == "https://example.com/cat.gif"
    assert retro_service.get_board(board.id).cards[card.id].image_url == "https://example.com/cat.gif"


def test_add_card_without_image_url_defaults_to_none(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    assert card.image_url is None


def test_add_card_rejects_non_http_image_url(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="valid http"):
        retro_service.add_card(board.id, alice.id, "mad", "text", "javascript:alert(1)")


def test_add_card_rejects_bare_filename_as_image_url(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="valid http"):
        retro_service.add_card(board.id, alice.id, "mad", "text", "cat.gif")


def test_add_card_blank_image_url_is_treated_as_none(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text", "   ")
    assert card.image_url is None


def test_edit_card_sets_image_url(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.edit_card(board.id, alice.id, card.id, "text", "https://example.com/dog.png")
    assert retro_service.get_board(board.id).cards[card.id].image_url == "https://example.com/dog.png"


def test_edit_card_omitting_image_url_clears_it(retro_service):
    # No partial-update semantics for this field — the frontend always
    # resends the current image_url, so omitting it means "remove the image".
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text", "https://example.com/cat.gif")
    retro_service.edit_card(board.id, alice.id, card.id, "edited text")
    assert retro_service.get_board(board.id).cards[card.id].image_url is None


def test_edit_card_rejects_invalid_image_url(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="valid http"):
        retro_service.edit_card(board.id, alice.id, card.id, "text", "not-a-url")


# ---------- GIF search REST proxy ----------

def test_gif_search_returns_503_when_api_key_missing(client, monkeypatch):
    monkeypatch.delenv("GIPHY_API_KEY", raising=False)
    r = client.get("/api/retro-boards/gif-search?q=cat")
    assert r.status_code == 503


def test_gif_search_returns_results_from_giphy(client, monkeypatch):
    monkeypatch.setenv("GIPHY_API_KEY", "test-key")

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "data": [
                    {
                        "id": "abc123",
                        "title": "Cat GIF",
                        "images": {
                            "fixed_height_small": {"url": "https://media.giphy.com/preview.gif"},
                            "fixed_height": {"url": "https://media.giphy.com/full.gif"},
                        },
                    },
                    {
                        # Missing images — should be filtered out, not crash the endpoint.
                        "id": "no-images",
                        "title": "Broken",
                        "images": {},
                    },
                ]
            }

    def fake_get(url, params=None, timeout=None):
        assert params["q"] == "cat"
        return FakeResponse()

    import app.gif_client as gif_client
    monkeypatch.setattr(gif_client.httpx, "get", fake_get)

    r = client.get("/api/retro-boards/gif-search?q=cat")
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 1
    assert results[0] == {
        "id": "abc123",
        "preview_url": "https://media.giphy.com/preview.gif",
        "url": "https://media.giphy.com/full.gif",
        "title": "Cat GIF",
    }


def test_gif_search_blank_query_hits_trending_endpoint(client, monkeypatch):
    monkeypatch.setenv("GIPHY_API_KEY", "test-key")
    called_urls = []

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": []}

    def fake_get(url, params=None, timeout=None):
        called_urls.append(url)
        assert "q" not in params
        return FakeResponse()

    import app.gif_client as gif_client
    monkeypatch.setattr(gif_client.httpx, "get", fake_get)

    r = client.get("/api/retro-boards/gif-search")
    assert r.status_code == 200
    assert called_urls == [gif_client.GIPHY_TRENDING_URL]


def test_gif_search_upstream_failure_returns_503(client, monkeypatch):
    monkeypatch.setenv("GIPHY_API_KEY", "test-key")

    import httpx as httpx_module
    import app.gif_client as gif_client

    def fake_get(url, params=None, timeout=None):
        raise httpx_module.ConnectError("boom")

    monkeypatch.setattr(gif_client.httpx, "get", fake_get)

    r = client.get("/api/retro-boards/gif-search?q=cat")
    assert r.status_code == 503

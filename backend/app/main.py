"""FastAPI приложение: REST для создания комнаты + WebSocket для real-time."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import DeckType
from .retro_models import RetroTemplate
from .retro_service import RetroError, RetroService
from .retro_store import store as retro_store
from .retro_ws_manager import (
    cleanup_disconnected_participants,
    cleanup_expired_boards,
    expire_finished_timers,
    manager as retro_manager,
)
from .services import RoomError, RoomService
from .store import store
from .ws_manager import cleanup_disconnected_players, cleanup_expired_rooms, manager

service = RoomService(store)
retro_service = RetroService(retro_store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(cleanup_disconnected_players(service)),
        asyncio.create_task(cleanup_expired_rooms(service)),
        asyncio.create_task(cleanup_disconnected_participants(retro_service)),
        asyncio.create_task(cleanup_expired_boards(retro_service)),
        asyncio.create_task(expire_finished_timers(retro_service)),
    ]
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="Planning Poker", lifespan=lifespan)

# В проде задаём CORS_ORIGINS="https://your-app.vercel.app,https://your-domain.com"
# В деве переменной нет — разрешаем всё.
cors_env = os.getenv("CORS_ORIGINS", "*")
allow_origins = ["*"] if cors_env == "*" else [o.strip() for o in cors_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- REST ----------

class CreateRoomRequest(BaseModel):
    name: str
    deck_type: DeckType = DeckType.FIBONACCI
    facilitator_nickname: str


@app.post("/api/rooms")
def create_room(req: CreateRoomRequest):
    room, facilitator = service.create_room(req.name, req.deck_type, req.facilitator_nickname)
    return {
        "room_id": room.id,
        "player_id": facilitator.id,
        "state": room.public_state(),
    }


@app.get("/api/rooms/{room_id}")
def get_room(room_id: str):
    try:
        room = service.get_room(room_id)
    except RoomError:
        raise HTTPException(404, "Room not found")
    return {"state": room.public_state()}


class CreateRetroBoardRequest(BaseModel):
    name: str
    template: RetroTemplate = RetroTemplate.WENT_WELL_EXTENDED
    facilitator_nickname: str


@app.post("/api/retro-boards")
def create_retro_board(req: CreateRetroBoardRequest):
    board, facilitator = retro_service.create_board(req.name, req.template, req.facilitator_nickname)
    return {
        "board_id": board.id,
        "participant_id": facilitator.id,
        "state": board.public_state(),
    }


@app.get("/api/retro-boards/{board_id}")
def get_retro_board(board_id: str):
    try:
        board = retro_service.get_board(board_id)
    except RetroError:
        raise HTTPException(404, "Board not found")
    return {"state": board.public_state()}


# ---------- WebSocket ----------

@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str, player_id: str, nickname: str = ""):
    """WebSocket: ?player_id=...&nickname=...

    Сценарии:
    - player_id уже существует в комнате (после create_room или join) → подключаемся
    - player_id не найден, но передан nickname → создаём нового игрока (быстрый join по URL)
    """
    room = store.get(room_id)
    if not room or room.is_expired():
        # Why a typed data message + plain close rather than a custom close
        # code: Render's Cloudflare edge proxy strips custom WS close codes
        # (4000-4999). The browser receives code 1005 ("No Status Received")
        # regardless of what we send. Without a code the frontend can't tell
        # "room is inactive" from "transient network blip" and keeps trying
        # to reconnect. A typed data message lands as a real frame before
        # close, so the frontend always learns the reason. We also send the
        # legacy `code=4004/4005` close for local tests (TestClient does not
        # go through Cloudflare); in production it just gets stripped.
        await websocket.accept()
        reason = "expired" if room else "not_found"
        await websocket.send_json({"type": "room_inactive", "reason": reason})
        await websocket.close(code=4005 if room else 4004)
        return

    # Авто-join, если зашли по ссылке без явного REST-вызова
    if player_id not in room.players:
        if not nickname:
            await websocket.close(code=4001)
            return
        player = service.join(room_id, nickname)
        player_id = player.id
    else:
        # Реконнект: снимаем offline-флаг, обновляем ник если передан
        service.reconnect(room_id, player_id, nickname)

    await manager.connect(room_id, player_id, websocket)

    # Сообщаем клиенту его id (важно при авто-join) + рассылаем всем актуальное состояние
    await manager.send_to(room_id, player_id, {"type": "joined", "player_id": player_id})
    await manager.broadcast(
        room_id, {"type": "room_state", "state": store.get(room_id).public_state()}
    )

    try:
        while True:
            data = await websocket.receive_json()
            await handle_message(room_id, player_id, data)
    except WebSocketDisconnect:
        manager.disconnect(room_id, player_id)
        was_in_room = service.mark_disconnected(room_id, player_id)
        if was_in_room:
            await manager.broadcast(room_id, {"type": "draw_clear", "player_id": player_id, "nickname": ""})
            room = store.get(room_id)
            if room:
                await manager.broadcast(
                    room_id, {"type": "room_state", "state": room.public_state()}
                )


@app.websocket("/ws/retro/{board_id}")
async def retro_ws_endpoint(websocket: WebSocket, board_id: str, participant_id: str, nickname: str = ""):
    """WebSocket: ?participant_id=...&nickname=...

    Мирроит `ws_endpoint` для Planning Poker 1-в-1 (issue #62), включая
    комментарий про Cloudflare ниже и авто-join/реконнект логику.
    """
    board = retro_store.get(board_id)
    if not board or board.is_expired():
        await websocket.accept()
        reason = "expired" if board else "not_found"
        await websocket.send_json({"type": "board_inactive", "reason": reason})
        await websocket.close(code=4005 if board else 4004)
        return

    if participant_id not in board.participants:
        if not nickname:
            await websocket.close(code=4001)
            return
        participant = retro_service.join(board_id, nickname)
        participant_id = participant.id
    else:
        retro_service.reconnect(board_id, participant_id, nickname)

    await retro_manager.connect(board_id, participant_id, websocket)

    await retro_manager.send_to(board_id, participant_id, {"type": "joined", "participant_id": participant_id})
    await retro_manager.broadcast(
        board_id, {"type": "board_state", "state": retro_store.get(board_id).public_state()}
    )

    try:
        while True:
            data = await websocket.receive_json()
            await handle_retro_message(board_id, participant_id, data)
    except WebSocketDisconnect:
        retro_manager.disconnect(board_id, participant_id)
        was_in_board = retro_service.mark_disconnected(board_id, participant_id)
        if was_in_board:
            await retro_manager.broadcast(board_id, {"type": "draw_clear", "player_id": participant_id, "nickname": ""})
            board = retro_store.get(board_id)
            if board:
                await retro_manager.broadcast(
                    board_id, {"type": "board_state", "state": board.public_state()}
                )


async def handle_message(room_id: str, player_id: str, data: dict) -> None:
    """Единый диспетчер входящих WS-сообщений."""
    msg_type = data.get("type")
    try:
        if msg_type == "vote":
            service.vote(room_id, player_id, data["card"])
        elif msg_type == "revote":
            service.revote(room_id, player_id, data["card"])
        elif msg_type == "reveal":
            service.reveal(room_id, player_id)
        elif msg_type == "reset":
            service.reset_round(room_id, player_id)
        elif msg_type == "add_issue":
            service.add_issue(room_id, player_id, data["title"], data.get("description", ""), data.get("link", ""))
        elif msg_type == "select_issue":
            service.select_issue(room_id, player_id, data["issue_id"])
        elif msg_type == "set_estimate":
            service.set_estimate(room_id, player_id, data["issue_id"], data["estimate"])
        elif msg_type == "update_nickname":
            service.update_nickname(room_id, player_id, data["nickname"])
        elif msg_type == "update_room":
            deck_type = DeckType(data["deck_type"]) if data.get("deck_type") else None
            service.update_room(
                room_id, player_id,
                name=data.get("name"),
                deck_type=deck_type,
                card_back=data.get("card_back"),
                who_can_reveal=data.get("who_can_reveal"),
                who_can_manage_issues=data.get("who_can_manage_issues"),
                close_on_facilitator_leave=data.get("close_on_facilitator_leave"),
                fun_features_enabled=data.get("fun_features_enabled"),
            )
        elif msg_type == "update_issue":
            service.update_issue(room_id, player_id, data["issue_id"],
                                 title=data.get("title"), description=data.get("description"), link=data.get("link"))
        elif msg_type == "delete_issue":
            service.delete_issue(room_id, player_id, data["issue_id"])
        elif msg_type == "delete_all_issues":
            service.delete_all_issues(room_id, player_id)
        elif msg_type == "reorder_issue":
            service.reorder_issue(room_id, player_id, data["issue_id"], data["direction"])
        elif msg_type == "toggle_spectator":
            service.toggle_spectator(room_id, player_id)
        elif msg_type == "kick_player":
            target_id = data["target_player_id"]
            await manager.send_to(room_id, target_id, {"type": "kicked"})
            await manager.close_connection(room_id, target_id, code=4003)
            service.kick_player(room_id, player_id, target_id)
        elif msg_type == "close_room":
            # Issue #19 — broadcast includes a reason field so the frontend
            # can show "Room was closed by the creator" copy. close_room is
            # facilitator-only, so the reason is always the same.
            service.close_room(room_id, player_id)
            await manager.broadcast(room_id, {"type": "room_closed", "reason": "creator_left"})
            return
        elif msg_type == "update_avatar_color":
            service.update_avatar_color(room_id, player_id, data["color"])
        elif msg_type in ("draw_stroke", "draw_cursor", "draw_clear"):
            room = store.get(room_id)
            player = room.players.get(player_id) if room else None
            nickname = player.nickname if player else ""
            await manager.broadcast_except(room_id, player_id, {
                **data,
                "player_id": player_id,
                "nickname": nickname,
            })
            return
        elif msg_type == "countdown":
            # Relay countdown to all clients so everyone sees the animation
            await manager.broadcast(room_id, {"type": "countdown", "seconds": data.get("seconds", 3)})
            return
        elif msg_type == "reaction":
            # Relay a quick reaction (emoji or time-value) to ALL clients —
            # including the sender, because the rising animation and the
            # on-card overlay should appear on their own screen too. Issue #32.
            # Not stored in Room: this is pure UX, like `draw_*` / `countdown`.
            room = store.get(room_id)
            player = room.players.get(player_id) if room else None
            await manager.broadcast(room_id, {
                "type": "reaction",
                "player_id": player_id,
                "nickname": player.nickname if player else "",
                "avatar_color": player.avatar_color if player else "#3b82f6",
                "kind": data.get("kind", "emoji"),
                "value": data.get("value", ""),
            })
            return
        elif msg_type == "throw_reaction":
            # Issue #51 — reaction thrown AT a specific player's card, distinct
            # from the self-reaction `reaction` message above. Also pure relay,
            # gated by `fun_features_enabled` inside the service call (raises
            # RoomError, caught below, if the room hasn't opted in).
            msg = service.throw_reaction(room_id, player_id, data["target_player_id"], data.get("value", ""))
            await manager.broadcast(room_id, msg)
            return
        else:
            await manager.send_to(
                room_id, player_id, {"type": "error", "message": f"Unknown type: {msg_type}"}
            )
            return
    except RoomError as e:
        await manager.send_to(room_id, player_id, {"type": "error", "message": str(e)})
        return
    except KeyError as e:
        await manager.send_to(
            room_id, player_id, {"type": "error", "message": f"Missing field: {e}"}
        )
        return

    # После любой успешной операции рассылаем актуальное состояние всем
    room = store.get(room_id)
    if room:
        msg = {"type": "room_state", "state": room.public_state()}
        # Если только что был reveal — прикладываем статистику
        if msg_type in ("reveal", "revote") and room.revealed:
            msg["stats"] = service.compute_stats(room)
        await manager.broadcast(room_id, msg)


async def handle_retro_message(board_id: str, participant_id: str, data: dict) -> None:
    """Единый диспетчер входящих WS-сообщений для Retro Board. Мирроит `handle_message`."""
    msg_type = data.get("type")
    try:
        if msg_type == "add_card":
            retro_service.add_card(board_id, participant_id, data["column_id"], data["text"])
        elif msg_type == "edit_card":
            retro_service.edit_card(board_id, participant_id, data["card_id"], data["text"])
        elif msg_type == "delete_card":
            retro_service.delete_card(board_id, participant_id, data["card_id"])
        elif msg_type == "vote_card":
            retro_service.vote_card(board_id, participant_id, data["card_id"])
        elif msg_type == "unvote_card":
            retro_service.unvote_card(board_id, participant_id, data["card_id"])
        elif msg_type == "group_cards":
            retro_service.group_cards(board_id, participant_id, data["source_card_id"], data["target_card_id"])
        elif msg_type == "ungroup_card":
            retro_service.ungroup_card(board_id, participant_id, data["card_id"])
        elif msg_type == "react_to_card":
            # Issue #62 Phase 2 — pure ephemeral relay, like Planning Poker's
            # `reaction`/`throw_reaction`. Broadcast to ALL clients including
            # the sender so their own overlay pops too.
            msg = retro_service.react_to_card(board_id, participant_id, data["card_id"], data.get("value", ""))
            await retro_manager.broadcast(board_id, msg)
            return
        elif msg_type == "reaction":
            # Issue #68 — header self-reaction, not tied to a card. Same
            # broadcast-to-everyone-including-sender pattern as react_to_card.
            msg = retro_service.react(board_id, participant_id, data.get("value", ""))
            await retro_manager.broadcast(board_id, msg)
            return
        elif msg_type == "start_timer":
            retro_service.start_timer(board_id, participant_id, data["seconds"])
        elif msg_type == "pause_timer":
            retro_service.pause_timer(board_id, participant_id)
        elif msg_type == "resume_timer":
            retro_service.resume_timer(board_id, participant_id)
        elif msg_type == "reset_timer":
            retro_service.reset_timer(board_id, participant_id)
        elif msg_type == "update_board":
            retro_service.update_board(
                board_id, participant_id,
                name=data.get("name"),
                anonymous_mode=data.get("anonymous_mode"),
                max_votes_per_person=data.get("max_votes_per_person"),
            )
        elif msg_type == "update_nickname":
            retro_service.update_nickname(board_id, participant_id, data["nickname"])
        elif msg_type == "update_avatar_color":
            retro_service.update_avatar_color(board_id, participant_id, data["color"])
        elif msg_type in ("draw_stroke", "draw_cursor", "draw_clear"):
            # Drawing feature (issue #62 follow-up) — mirrors Planning
            # Poker's relay in handle_message exactly: pure relay to
            # everyone except the sender, not stored on the board.
            board = retro_store.get(board_id)
            participant = board.participants.get(participant_id) if board else None
            nickname = participant.nickname if participant else ""
            await retro_manager.broadcast_except(board_id, participant_id, {
                **data,
                "player_id": participant_id,
                "nickname": nickname,
            })
            return
        elif msg_type == "kick_participant":
            target_id = data["target_id"]
            await retro_manager.send_to(board_id, target_id, {"type": "kicked"})
            await retro_manager.close_connection(board_id, target_id, code=4003)
            retro_service.kick_participant(board_id, participant_id, target_id)
        elif msg_type == "close_board":
            retro_service.close_board(board_id, participant_id)
            await retro_manager.broadcast(board_id, {"type": "board_closed", "reason": "creator_left"})
            return
        else:
            await retro_manager.send_to(
                board_id, participant_id, {"type": "error", "message": f"Unknown type: {msg_type}"}
            )
            return
    except RetroError as e:
        await retro_manager.send_to(board_id, participant_id, {"type": "error", "message": str(e)})
        return
    except KeyError as e:
        await retro_manager.send_to(
            board_id, participant_id, {"type": "error", "message": f"Missing field: {e}"}
        )
        return

    board = retro_store.get(board_id)
    if board:
        await retro_manager.broadcast(
            board_id, {"type": "board_state", "state": board.public_state()}
        )


@app.get("/healthz")
def healthz():
    return {"status": "ok"}

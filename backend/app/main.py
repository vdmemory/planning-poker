"""FastAPI приложение: REST для создания комнаты + WebSocket для real-time."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import DeckType
from .services import RoomError, RoomService
from .store import store
from .ws_manager import cleanup_disconnected_players, manager

service = RoomService(store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(cleanup_disconnected_players(service))
    yield
    task.cancel()


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


# ---------- WebSocket ----------

@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str, player_id: str, nickname: str = ""):
    """WebSocket: ?player_id=...&nickname=...

    Сценарии:
    - player_id уже существует в комнате (после create_room или join) → подключаемся
    - player_id не найден, но передан nickname → создаём нового игрока (быстрый join по URL)
    """
    room = store.get(room_id)
    if not room:
        await websocket.close(code=4004)
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
        service.mark_disconnected(room_id, player_id)
        room = store.get(room_id)
        if room:
            await manager.broadcast(
                room_id, {"type": "room_state", "state": room.public_state()}
            )


async def handle_message(room_id: str, player_id: str, data: dict) -> None:
    """Единый диспетчер входящих WS-сообщений."""
    msg_type = data.get("type")
    try:
        if msg_type == "vote":
            service.vote(room_id, player_id, data["card"])
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
            service.update_room(room_id, player_id, name=data.get("name"), deck_type=deck_type)
        elif msg_type == "update_issue":
            service.update_issue(room_id, player_id, data["issue_id"],
                                 title=data.get("title"), description=data.get("description"), link=data.get("link"))
        elif msg_type == "delete_issue":
            service.delete_issue(room_id, player_id, data["issue_id"])
        elif msg_type == "delete_all_issues":
            service.delete_all_issues(room_id, player_id)
        elif msg_type == "reorder_issue":
            service.reorder_issue(room_id, player_id, data["issue_id"], data["direction"])
        elif msg_type == "update_avatar_color":
            service.update_avatar_color(room_id, player_id, data["color"])
        elif msg_type == "countdown":
            # Relay countdown to all clients so everyone sees the animation
            await manager.broadcast(room_id, {"type": "countdown", "seconds": data.get("seconds", 3)})
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
        if msg_type == "reveal" and room.revealed:
            msg["stats"] = service.compute_stats(room)
        await manager.broadcast(room_id, msg)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}

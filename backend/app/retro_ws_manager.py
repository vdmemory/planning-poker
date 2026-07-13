"""WebSocket connection manager + фоновые cleanup-задачи для Retro Board.

Мирроит ws_manager.py. Reuses the same generic `ConnectionManager` class
(it's domain-agnostic — just a `board_id -> {participant_id: WebSocket}` map)
but needs its own instance and its own cleanup tasks, since those reference
`RetroBoard`/`RetroParticipant` fields directly rather than `Room`/`Player`.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from .retro_service import RetroService
from .retro_store import store
from .ws_manager import ConnectionManager, DISCONNECT_GRACE_SECONDS

manager = ConnectionManager()

# How often to check the store for expired boards.
EXPIRED_BOARDS_CHECK_INTERVAL_SECONDS = 60


async def cleanup_disconnected_participants(service: RetroService) -> None:
    """Каждые 5 секунд удаляет участников, которые в дисконнекте > 30 сек.

    Мирроит `cleanup_disconnected_players` — нет issue #19-style
    close-on-facilitator-leave опции для retro-досок в Фазе 1, поэтому этот
    код проще: просто remove + handoff/delete, затем broadcast свежего стейта.
    """
    while True:
        await asyncio.sleep(5)
        try:
            now = datetime.now(timezone.utc)
            for board in list(store.all()):
                to_remove: list[str] = []
                for participant in list(board.participants.values()):
                    if (
                        not participant.connected
                        and participant.disconnected_at
                        and (now - participant.disconnected_at).total_seconds() > DISCONNECT_GRACE_SECONDS
                    ):
                        to_remove.append(participant.id)
                if not to_remove:
                    continue

                for pid in to_remove:
                    service.remove_participant(board.id, pid)

                fresh = store.get(board.id)
                if fresh:
                    await manager.broadcast(
                        board.id, {"type": "board_state", "state": fresh.public_state()}
                    )
        except Exception as e:
            print(f"[retro cleanup] error: {e}")


async def cleanup_expired_boards(service: RetroService) -> None:
    """Мирроит `cleanup_expired_rooms` — broadcast `board_expired`, закрывает
    WS-соединения (код 4005, см. main.py комментарий про Cloudflare), удаляет
    доску из store.
    """
    while True:
        await asyncio.sleep(EXPIRED_BOARDS_CHECK_INTERVAL_SECONDS)
        try:
            now = datetime.now(timezone.utc)
            for board in list(store.all()):
                if not board.is_expired(now):
                    continue
                board_id = board.id
                participant_ids = list(manager._connections.get(board_id, {}).keys())
                await manager.broadcast(
                    board_id, {"type": "board_expired", "reason": "timer"}
                )
                for pid in participant_ids:
                    await manager.close_connection(board_id, pid, code=4005)
                service.expire_board(board_id)
        except Exception as e:
            print(f"[retro cleanup_expired_boards] error: {e}")

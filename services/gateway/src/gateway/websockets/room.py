"""WebSocket handler for room sessions (bidi stream)."""

import asyncio
import logging

import grpc.aio
from fastapi import WebSocket, WebSocketDisconnect

from pb.api.room import room_pb2, room_pb2_grpc

from gateway.config import load_config
from gateway.converters import participant_type_to_str, poll_status_to_str, visibility_to_str

logger = logging.getLogger(__name__)

_config = load_config()
ROOM_SERVICE_ADDRESS = _config.room_service.address


async def websocket_room_session(websocket: WebSocket, room_id: str):
    """WebSocket ↔ gRPC bidi stream for room sessions.

    The client must send a join message first:
      {"type": "join", "user_id": "...", "name": "...", "role": "member"}

    Then send messages:
      {"type": "message", "content": "Hello @claude", "mentions": ["claude"]}
      {"type": "typing", "is_typing": true}
      {"type": "interrupt", "llm_id": "claude"}
      {"type": "ping"}

    Server pushes events as JSON with a "type" field.
    """
    await websocket.accept()
    channel = grpc.aio.insecure_channel(ROOM_SERVICE_ADDRESS)

    try:
        stub = room_pb2_grpc.RoomStub(channel)

        # Set up the bidi stream
        request_queue: asyncio.Queue[room_pb2.ClientMessage | None] = asyncio.Queue()

        async def request_iterator():
            while True:
                msg = await request_queue.get()
                if msg is None:
                    return
                yield msg

        # Start the bidi stream
        response_stream = stub.RoomSession(request_iterator())

        async def _read_ws():
            """Read from WebSocket, translate to gRPC ClientMessages."""
            try:
                while True:
                    data = await websocket.receive_json()
                    msg = _json_to_client_message(data, room_id)
                    if msg:
                        await request_queue.put(msg)
            except WebSocketDisconnect:
                await request_queue.put(None)
            except asyncio.CancelledError:
                await request_queue.put(None)
                raise
            except (ConnectionResetError, BrokenPipeError):
                await request_queue.put(None)
            except Exception as e:
                logger.warning("Error reading from WebSocket: %s", e)
                await request_queue.put(None)

        async def _read_grpc():
            """Read from gRPC stream, translate ServerEvents to WebSocket JSON."""
            try:
                async for event in response_stream:
                    ws_msg = _server_event_to_json(event)
                    if ws_msg:
                        await websocket.send_json(ws_msg)
            except asyncio.CancelledError:
                raise
            except grpc.RpcError as e:
                logger.warning("gRPC error in room session: %s - %s", e.code(), e.details())
                try:
                    await websocket.send_json({
                        "type": "error",
                        "error": "Connection to room service lost. Please refresh.",
                    })
                except (WebSocketDisconnect, RuntimeError):
                    pass
            except (ConnectionResetError, BrokenPipeError):
                pass
            except Exception as e:
                logger.warning("Error reading from gRPC stream: %s", e)

        # Run both loops concurrently
        ws_task = asyncio.create_task(_read_ws())
        grpc_task = asyncio.create_task(_read_grpc())

        done, pending = await asyncio.wait(
            [ws_task, grpc_task], return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except asyncio.CancelledError:
        raise
    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as e:
        logger.exception("Unexpected error in room WebSocket")
        try:
            await websocket.send_json({
                "type": "error",
                "error": "An unexpected error occurred. Please refresh.",
            })
        except (WebSocketDisconnect, RuntimeError):
            pass
    finally:
        await channel.close()


def _json_to_client_message(data: dict, room_id: str) -> room_pb2.ClientMessage | None:
    """Convert WebSocket JSON to gRPC ClientMessage."""
    msg_type = data.get("type")

    if msg_type == "join":
        role_map = {
            "admin": room_pb2.ADMIN,
            "member": room_pb2.MEMBER,
            "viewer": room_pb2.VIEWER,
        }
        return room_pb2.ClientMessage(
            join=room_pb2.JoinRoom(
                room_id=room_id,
                user_id=data.get("user_id", ""),
                display_name=data.get("name", "Anonymous"),
                role=role_map.get(data.get("role", "member"), room_pb2.MEMBER),
                title=data.get("title", ""),
                avatar=data.get("avatar", ""),
            )
        )

    elif msg_type == "message":
        cm = room_pb2.ClientMessage(
            message=room_pb2.SendMessage(
                content=data.get("content", ""),
                mentions=data.get("mentions", []),
            )
        )
        if data.get("reply_to"):
            cm.message.reply_to = data["reply_to"]
        return cm

    elif msg_type == "typing":
        return room_pb2.ClientMessage(
            typing=room_pb2.TypingIndicator(is_typing=data.get("is_typing", False))
        )

    elif msg_type == "interrupt":
        interrupt = room_pb2.InterruptLLM(llm_id=data.get("llm_id", ""))
        if data.get("message_id"):
            interrupt.message_id = data["message_id"]
        return room_pb2.ClientMessage(interrupt=interrupt)

    elif msg_type == "add_llm":
        llm_data = data.get("llm", {})
        return room_pb2.ClientMessage(
            add_llm=room_pb2.AddLLM(
                llm=room_pb2.LLMConfig(
                    id=llm_data.get("id", ""),
                    model=llm_data.get("model", ""),
                    persona=llm_data.get("persona", ""),
                    display_name=llm_data.get("display_name", ""),
                    title=llm_data.get("title", ""),
                    chat_style=llm_data.get("chat_style", 0),
                    avatar=llm_data.get("avatar", ""),
                )
            )
        )

    elif msg_type == "update_llm":
        update = room_pb2.UpdateLLM(llm_id=data.get("llm_id", ""))
        if "model" in data:
            update.model = data["model"]
        if "persona" in data:
            update.persona = data["persona"]
        if "display_name" in data:
            update.display_name = data["display_name"]
        if "title" in data:
            update.title = data["title"]
        if "chat_style" in data:
            update.chat_style = data["chat_style"]
        if "avatar" in data:
            update.avatar = data["avatar"]
        return room_pb2.ClientMessage(update_llm=update)

    elif msg_type == "remove_llm":
        return room_pb2.ClientMessage(
            remove_llm=room_pb2.RemoveLLM(llm_id=data.get("llm_id", ""))
        )

    elif msg_type == "create_poll":
        options = [
            room_pb2.PollOptionInput(
                text=opt.get("text", ""),
                description=opt.get("description", ""),
            )
            for opt in data.get("options", [])
        ]
        return room_pb2.ClientMessage(
            create_poll=room_pb2.CreatePoll(
                question=data.get("question", ""),
                options=options,
                allow_multiple=data.get("allow_multiple", False),
                anonymous=data.get("anonymous", False),
                mandatory=data.get("mandatory", False),
            )
        )

    elif msg_type == "cast_vote":
        return room_pb2.ClientMessage(
            cast_vote=room_pb2.CastVote(
                poll_id=data.get("poll_id", ""),
                option_ids=data.get("option_ids", []),
                reason=data.get("reason", ""),
            )
        )

    elif msg_type == "close_poll":
        return room_pb2.ClientMessage(
            close_poll=room_pb2.ClosePoll(poll_id=data.get("poll_id", ""))
        )

    elif msg_type == "ping":
        return room_pb2.ClientMessage(ping=room_pb2.Ping())

    elif msg_type == "update_room_description":
        return room_pb2.ClientMessage(
            update_room_description=room_pb2.UpdateRoomDescription(
                description=data.get("description", "")
            )
        )

    return None


def _server_event_to_json(event: room_pb2.ServerEvent) -> dict | None:
    """Translate a gRPC ServerEvent to a WebSocket JSON message."""
    payload = event.WhichOneof("payload")

    if payload == "room_state":
        rs = event.room_state
        room = rs.room
        return {
            "type": "room_state",
            "room": {
                "id": room.room_id,
                "name": room.name,
                "created_at": room.created_at.ToJsonString() if room.created_at.ByteSize() else None,
                "description": room.description,
                "visibility": visibility_to_str(room.visibility),
            },
            "participants": [
                {
                    "id": p.id,
                    "name": p.name,
                    "role": p.role,
                    "type": p.type,
                    "title": p.title,
                    "is_online": p.is_online,
                    "avatar": p.avatar,
                }
                for p in rs.participants
            ],
            "messages": [_message_to_json(m) for m in rs.messages],
            "llms": [
                {
                    "id": l.id,
                    "model": l.model,
                    "display_name": l.display_name,
                    "persona": l.persona,
                    "title": l.title,
                    "chat_style": l.chat_style,
                    "avatar": l.avatar,
                }
                for l in room.llms
            ],
            "polls": [_poll_to_json(p) for p in rs.polls],
        }

    elif payload == "message_received":
        return _message_to_json(event.message_received.message)

    elif payload == "user_joined":
        u = event.user_joined.user
        return {
            "type": "user_joined",
            "user": {
                "id": u.id,
                "name": u.name,
                "role": u.role,
                "type": u.type,
                "title": u.title,
                "is_online": True,
                "avatar": u.avatar,
            },
        }

    elif payload == "user_left":
        return {"type": "user_left", "user_id": event.user_left.user_id}

    elif payload == "llm_thinking":
        t = event.llm_thinking
        return {"type": "llm_thinking", "llm_id": t.llm_id, "reply_to": t.reply_to}

    elif payload == "llm_chunk":
        c = event.llm_chunk
        return {
            "type": "llm_chunk",
            "message_id": c.message_id,
            "llm_id": c.llm_id,
            "content": c.content,
            "reply_to": c.reply_to,
        }

    elif payload == "llm_done":
        d = event.llm_done
        return {"type": "llm_done", "message_id": d.message_id, "llm_id": d.llm_id}

    elif payload == "user_typing":
        t = event.user_typing
        return {
            "type": "typing",
            "user": {"id": t.user_id, "name": t.user_name},
            "is_typing": t.is_typing,
        }

    elif payload == "error":
        return {"type": "error", "error": event.error.message, "code": event.error.code}

    elif payload == "llm_added":
        l = event.llm_added.llm
        return {
            "type": "llm_added",
            "llm": {
                "id": l.id,
                "model": l.model,
                "display_name": l.display_name,
                "persona": l.persona,
                "title": l.title,
                "chat_style": l.chat_style,
                "avatar": l.avatar,
            },
        }

    elif payload == "llm_updated":
        l = event.llm_updated.llm
        return {
            "type": "llm_updated",
            "llm": {
                "id": l.id,
                "model": l.model,
                "display_name": l.display_name,
                "persona": l.persona,
                "title": l.title,
                "chat_style": l.chat_style,
                "avatar": l.avatar,
            },
        }

    elif payload == "llm_removed":
        return {"type": "llm_removed", "llm_id": event.llm_removed.llm_id}

    elif payload == "poll_created":
        return {"type": "poll_created", "poll": _poll_to_json(event.poll_created.poll)}

    elif payload == "poll_voted":
        pv = event.poll_voted
        return {
            "type": "poll_voted",
            "poll_id": pv.poll_id,
            "option_id": pv.option_id,
            "vote": {
                "voter_id": pv.vote.voter_id,
                "voter_name": pv.vote.voter_name,
                "reason": pv.vote.reason,
                "voted_at": pv.vote.voted_at.ToMilliseconds() if pv.vote.voted_at.ByteSize() else 0,
            },
        }

    elif payload == "poll_closed":
        pc = event.poll_closed
        return {
            "type": "poll_closed",
            "poll_id": pc.poll_id,
            "closed_by_id": pc.closed_by_id,
            "closed_by_name": pc.closed_by_name,
        }

    elif payload == "pong":
        return {"type": "pong"}

    elif payload == "room_updated":
        room = event.room_updated.room
        return {
            "type": "room_updated",
            "room": {
                "id": room.room_id,
                "name": room.name,
                "created_at": room.created_at.ToJsonString() if room.created_at.ByteSize() else None,
                "description": room.description,
                "visibility": visibility_to_str(room.visibility),
            },
        }

    return None


def _message_to_json(m: room_pb2.Message) -> dict:
    """Convert a Message proto to JSON."""
    result = {
        "type": "message",
        "id": m.message_id,
        "sender": {
            "id": m.sender_id,
            "name": m.sender_name,
            "type": participant_type_to_str(m.sender_type),
        },
        "content": m.content,
        "timestamp": m.timestamp.ToMilliseconds() if m.timestamp.ByteSize() else 0,
    }
    if m.HasField("reply_to"):
        result["reply_to"] = m.reply_to
    if m.HasField("poll_id"):
        result["poll_id"] = m.poll_id
    return result


def _poll_to_json(p: room_pb2.Poll) -> dict:
    """Convert a Poll proto to JSON."""
    return {
        "poll_id": p.poll_id,
        "room_id": p.room_id,
        "creator_id": p.creator_id,
        "creator_name": p.creator_name,
        "creator_type": participant_type_to_str(p.creator_type),
        "question": p.question,
        "options": [
            {
                "id": opt.id,
                "text": opt.text,
                "description": opt.description,
                "votes": [
                    {
                        "voter_id": v.voter_id,
                        "voter_name": v.voter_name,
                        "reason": v.reason,
                        "voted_at": v.voted_at.ToMilliseconds() if v.voted_at.ByteSize() else 0,
                    }
                    for v in opt.votes
                ],
            }
            for opt in p.options
        ],
        "allow_multiple": p.allow_multiple,
        "anonymous": p.anonymous,
        "mandatory": p.mandatory,
        "status": poll_status_to_str(p.status),
        "created_at": p.created_at.ToMilliseconds() if p.created_at.ByteSize() else 0,
        "closed_at": p.closed_at.ToMilliseconds() if p.closed_at.ByteSize() else 0,
    }

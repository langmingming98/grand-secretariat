"""Centralized proto ↔ JSON conversion utilities.

This module handles the translation between protobuf enum values (integers)
and the string representations expected by the frontend.

Timestamp conventions:
- WebSocket events: milliseconds (ToMilliseconds()) for efficient JS parsing
- REST responses: ISO 8601 strings (ToJsonString()) for readability
"""

from pb.api.room import room_pb2


def participant_type_to_str(t: int) -> str:
    """Convert proto ParticipantType enum to frontend string."""
    return "llm" if t == room_pb2.LLM else "human"


def participant_type_from_str(s: str) -> int:
    """Convert frontend string to proto ParticipantType enum."""
    return room_pb2.LLM if s == "llm" else room_pb2.HUMAN


def role_to_str(r: int) -> str:
    """Convert proto Role enum to frontend string."""
    mapping = {
        room_pb2.ADMIN: "admin",
        room_pb2.MEMBER: "member",
        room_pb2.VIEWER: "viewer",
    }
    return mapping.get(r, "member")


def role_from_str(s: str) -> int:
    """Convert frontend string to proto Role enum."""
    mapping = {
        "admin": room_pb2.ADMIN,
        "member": room_pb2.MEMBER,
        "viewer": room_pb2.VIEWER,
    }
    return mapping.get(s, room_pb2.MEMBER)


def poll_status_to_str(s: int) -> str:
    """Convert proto PollStatus enum to frontend string."""
    return "open" if s == room_pb2.POLL_OPEN else "closed"


def poll_status_from_str(s: str) -> int:
    """Convert frontend string to proto PollStatus enum."""
    return room_pb2.POLL_OPEN if s == "open" else room_pb2.POLL_CLOSED


def visibility_to_str(v: int) -> str:
    """Convert proto RoomVisibility enum to frontend string."""
    return "private" if v == room_pb2.ROOM_VISIBILITY_PRIVATE else "public"


def visibility_from_str(s: str) -> int:
    """Convert frontend string to proto RoomVisibility enum."""
    return (
        room_pb2.ROOM_VISIBILITY_PRIVATE
        if s == "private"
        else room_pb2.ROOM_VISIBILITY_PUBLIC
    )

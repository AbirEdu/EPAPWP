"""Uploads video feedback to the EPA YouTube channel.

Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN env vars,
obtained via a one-time OAuth consent flow run by the channel owner
(see scripts/youtube_oauth_setup.py). Until those are set, is_configured()
returns False and callers should degrade gracefully rather than call upload_video().
"""
import io
import os

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID")
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET")
YOUTUBE_REFRESH_TOKEN = os.getenv("YOUTUBE_REFRESH_TOKEN")

UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"


def is_configured() -> bool:
    return bool(YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN)


def _client():
    creds = Credentials(
        token=None,
        refresh_token=YOUTUBE_REFRESH_TOKEN,
        client_id=YOUTUBE_CLIENT_ID,
        client_secret=YOUTUBE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[UPLOAD_SCOPE],
    )
    return build("youtube", "v3", credentials=creds)


def upload_video(file_bytes: bytes, title: str, description: str = "") -> str:
    """Uploads a video as Unlisted to the authorized channel. Returns the YouTube video ID.

    This is a blocking, synchronous call (the googleapiclient library has no async
    support) — callers from async code should run it via asyncio.to_thread().
    """
    if not is_configured():
        raise RuntimeError("YouTube upload is not configured — set YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN.")

    youtube = _client()
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype="video/webm", resumable=True)
    request = youtube.videos().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "categoryId": "22",  # People & Blogs
            },
            "status": {"privacyStatus": "unlisted"},
        },
        media_body=media,
    )
    response = None
    while response is None:
        _, response = request.next_chunk()
    return response["id"]

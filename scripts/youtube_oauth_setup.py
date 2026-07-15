"""
One-time setup script: authorizes this app to upload videos to the EPA YouTube
channel, and prints the credentials to put in your .env file.

Run this ONCE, locally on your own machine (not inside Docker, not on the
server) — it opens a browser window where you log in as the Google account
that owns/manages the "Ekalavya Performing Arts" YouTube channel and grant
upload access. It does not touch your live site or database.

Setup before running:
  1. Go to https://console.cloud.google.com/ and create a project (or reuse one).
  2. APIs & Services -> Library -> search "YouTube Data API v3" -> Enable.
  3. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID.
     - Application type: "Desktop app"
     - Give it any name, e.g. "EPA Website Uploader"
  4. Download the resulting JSON file, save it next to this script as
     client_secret.json (same folder).
  5. APIs & Services -> OAuth consent screen -> make sure the Google account
     that manages the EPA YouTube channel is added as a Test User (if the
     app is in "Testing" mode, which is fine for this use case).

Then run:
  pip install google-auth-oauthlib google-api-python-client
  python3 youtube_oauth_setup.py

A browser window will open. Log in as the channel-owning account and approve
the "manage your YouTube videos" permission. This script will then print your
YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN — copy all
three into the project's .env file and restart the API container.
"""
import json
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
CLIENT_SECRET_FILE = os.path.join(os.path.dirname(__file__), "client_secret.json")


def main():
    if not os.path.exists(CLIENT_SECRET_FILE):
        print(f"ERROR: {CLIENT_SECRET_FILE} not found.")
        print("Download it from Google Cloud Console (see the instructions at the top of this file) first.")
        sys.exit(1)

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(CLIENT_SECRET_FILE) as f:
        client_info = json.load(f)["installed"]

    print("\n" + "=" * 60)
    print("Success! Add these three lines to your .env file:")
    print("=" * 60)
    print(f"YOUTUBE_CLIENT_ID={client_info['client_id']}")
    print(f"YOUTUBE_CLIENT_SECRET={client_info['client_secret']}")
    print(f"YOUTUBE_REFRESH_TOKEN={creds.refresh_token}")
    print("=" * 60)
    print("\nThen restart the API container: docker compose up -d --build")


if __name__ == "__main__":
    main()

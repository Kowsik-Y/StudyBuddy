"""
Voice Assistant - Main application
Live speech-to-speech conversation with AI assistant
"""

import os
import threading
from openai import OpenAI
from dotenv import load_dotenv

# Import modules
from stt import listen_for_speech, speech_to_text
from text_to_speech.tts import stream_tts_and_play
from llm_response.llm_response import run_agent_streaming

# Load environment variables
load_dotenv('.env')

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
BASE_URL = os.getenv('OPENAI_BASE_URL')

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY, base_url=BASE_URL)

# Shared state
assistant_speaking = threading.Event()

# System memory
memory = [
    {
        "role": "system",
        "content": "You are a helpful voice assistant. Respond in English. Keep responses concise and conversational (1-3 sentences). Be friendly and natural."
    }
]


def main():
    """Main conversation loop."""
    print("=" * 50)
    print("  🤖 Voice Assistant — Live Speech-to-Speech")
    print("=" * 50)
    print()
    print("  Just start speaking. I'm always listening.")
    print("  Say 'goodbye', 'quit', or 'stop' to exit.")
    print("  Press Ctrl+C to force quit.")
    print()
    print("🎧 Listening...", flush=True)

    while True:
        try:
            # Step 1: Listen for speech
            audio_data = listen_for_speech(assistant_speaking)
            if audio_data is None:
                continue

            # Step 2: Transcribe
            user_text = speech_to_text(audio_data, client)
            if not user_text:
                print("⚠️ Couldn't catch that. Try again.")
                print("🎧 Listening...", flush=True)
                continue

            print(f"🧑 You: {user_text}")

            # Check for exit commands
            if any(word in user_text.lower() for word in ["goodbye", "quit", "exit", "stop"]):
                print("👋 Goodbye!")
                stream_tts_and_play("Goodbye! Have a great day!", client, assistant_speaking)
                break

            # Step 3: Get LLM response
            response_text = run_agent_streaming(user_text, memory, client)

            # Step 4: Speak the response
            if response_text:
                stream_tts_and_play(response_text, client, assistant_speaking)

            print("🎧 Listening...", flush=True)

        except KeyboardInterrupt:
            print("\n👋 Interrupted. Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("🎧 Listening...", flush=True)


if __name__ == "__main__":
    main()

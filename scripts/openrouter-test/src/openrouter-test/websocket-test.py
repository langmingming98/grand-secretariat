import asyncio
import websockets
import json
from dotenv import load_dotenv

async def test():
    async with websockets.connect('ws://localhost:8000/ws/chat/stream') as ws:
        await ws.send(json.dumps({
            'messages': [{'role': 'user', 'content': 'hi!'}],
            'models': ['openai/gpt-5-mini', 'anthropic/claude-haiku-4.5', 'google/gemini-2.5-flash', 'x-ai/grok-4.1-fast']
        }))
        
        async for message in ws:
            print(message)
            data = json.loads(message)
            if data.get("type") == "done":
                break

load_dotenv(dotenv_path='.env')
asyncio.run(test())

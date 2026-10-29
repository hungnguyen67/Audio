import asyncio
import edge_tts
import mysql.connector
from app.core.config import DB_CONFIG
from app.main import AudioHandler

conn = mysql.connector.connect(**DB_CONFIG)
cur = conn.cursor(dictionary=True)
cur.execute('SELECT id, chapter_number, title, content FROM chapters WHERE chapter_number = 41 ORDER BY id DESC LIMIT 1')
row = cur.fetchone()
chunks = AudioHandler.split_content(row['content'])
c2 = chunks[1]

paragraphs = [p for p in c2.split('\n') if p.strip()]

async def test_part(text, label):
    comm = edge_tts.Communicate(text, 'vi-VN-HoaiMyNeural')
    chunks_data = []
    try:
        async for c in comm.stream():
            if c['type'] == 'audio':
                chunks_data.append(c['data'])
        print(f"[{label}] SUCCESS: {len(b''.join(chunks_data))} bytes")
        return True
    except Exception as e:
        print(f"[{label}] FAILED: {type(e).__name__} {e}")
        return False

async def main():
    print(f"Total paragraphs: {len(paragraphs)}")
    for i, p in enumerate(paragraphs):
        await test_part(p, f"P{i+1}")
        await asyncio.sleep(1)

asyncio.run(main())

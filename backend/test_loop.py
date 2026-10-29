import asyncio
import edge_tts
import time
import aiohttp
from edge_tts.communicate import (
    WSS_URL, WSS_HEADERS, SEC_MS_GEC_VERSION, connect_id, date_to_string, mkssml, ssml_headers_plus_data, _SSL_CTX
)
from edge_tts.drm import DRM

async def run_one(i):
    t0 = time.time()
    text = f"Đoạn văn kiểm tra số {i}. Hôm nay trời rất đẹp và chúng tôi đang thử nghiệm."
    c = edge_tts.Communicate(text, "vi-VN-HoaiMyNeural")
    c.state["partial_text"] = next(iter(c.texts))
    
    url = f"{WSS_URL}&ConnectionId={connect_id()}&Sec-MS-GEC={DRM.generate_sec_ms_gec()}&Sec-MS-GEC-Version={SEC_MS_GEC_VERSION}"
    headers = DRM.headers_with_muid(WSS_HEADERS)
    
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(url, compress=15, headers=headers, ssl=_SSL_CTX) as ws:
            cmd = (
                f"X-Timestamp:{date_to_string()}\r\n"
                "Content-Type:application/json; charset=utf-8\r\n"
                "Path:speech.config\r\n\r\n"
                '{"context":{"synthesis":{"audio":{"metadataoptions":{'
                '"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"'
                '},'
                '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"'
                "}}}}\r\n"
            )
            await ws.send_str(cmd)
            ssml_req = ssml_headers_plus_data(connect_id(), date_to_string(), mkssml(c.tts_config, c.state["partial_text"]))
            await ws.send_str(ssml_req)
            
            audio_bytes = 0
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.BINARY:
                    audio_bytes += len(msg.data)
                elif msg.type == aiohttp.WSMsgType.TEXT:
                    if "turn.end" in msg.data:
                        break
                    elif "turn.start" not in msg.data and "response" not in msg.data:
                        print(f"[{i}] Unexpected text:\n", msg.data)
                elif msg.type == aiohttp.WSMsgType.CLOSE:
                    print(f"[{i}] Received CLOSE: data={msg.data}, extra={msg.extra}")
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    print(f"[{i}] Received CLOSED: data={msg.data}, extra={msg.extra}")
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print(f"[{i}] Received ERROR: {msg.data}")
            
            print(f"Iter {i}: ws.closed={ws.closed}, ws.close_code={ws.close_code}, audio_bytes={audio_bytes}, took {time.time()-t0:.2f}s")

async def main():
    for i in range(5):
        await run_one(i)
        await asyncio.sleep(0.5)

asyncio.run(main())

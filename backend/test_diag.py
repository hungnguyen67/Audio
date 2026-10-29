import asyncio
import aiohttp
import edge_tts
from edge_tts.communicate import (
    WSS_URL,
    WSS_HEADERS,
    SEC_MS_GEC_VERSION,
    connect_id,
    date_to_string,
    mkssml,
    ssml_headers_plus_data,
    _SSL_CTX,
)
from edge_tts.drm import DRM

async def test():
    c = edge_tts.Communicate("Xin chào bạn, đây là bài kiểm tra giọng đọc edge tts tiếng Việt.", "vi-VN-HoaiMyNeural")
    c.state["partial_text"] = next(iter(c.texts))
    
    url = (
        f"{WSS_URL}&ConnectionId={connect_id()}"
        f"&Sec-MS-GEC={DRM.generate_sec_ms_gec()}"
        f"&Sec-MS-GEC-Version={SEC_MS_GEC_VERSION}"
    )
    print("URL:", url)
    print("MUID headers:", DRM.headers_with_muid(WSS_HEADERS))
    
    async with aiohttp.ClientSession(
        connector=c.connector,
        trust_env=True,
        timeout=c.session_timeout,
    ) as session:
        async with session.ws_connect(
            url,
            compress=15,
            proxy=c.proxy,
            headers=DRM.headers_with_muid(WSS_HEADERS),
            ssl=_SSL_CTX,
        ) as websocket:
            print("Connected to ws successfully")
            word_boundary = c.tts_config.boundary == "WordBoundary"
            wd = "true" if word_boundary else "false"
            sq = "true" if not word_boundary else "false"
            cmd = (
                f"X-Timestamp:{date_to_string()}\r\n"
                "Content-Type:application/json; charset=utf-8\r\n"
                "Path:speech.config\r\n\r\n"
                '{"context":{"synthesis":{"audio":{"metadataoptions":{'
                f'"sentenceBoundaryEnabled":"{sq}","wordBoundaryEnabled":"{wd}"'
                '},'
                '"outputFormat":"audio-24khz-48kbitrate-mono-mp3"'
                "}}}}\r\n"
            )
            await websocket.send_str(cmd)
            
            ssml_req = ssml_headers_plus_data(
                connect_id(),
                date_to_string(),
                mkssml(
                    c.tts_config,
                    c.state["partial_text"],
                ),
            )
            print("SSML Request:\n", ssml_req)
            await websocket.send_str(ssml_req)
            
            import time
            start = time.time()
            total_bytes = 0
            async for received in websocket:
                elapsed = time.time() - start
                if received.type == aiohttp.WSMsgType.TEXT:
                    print(f"[{elapsed:.2f}s] Full Text:\n{received.data}")
                    if "turn.end" in received.data:
                        print("TURN END!")
                        break
                elif received.type == aiohttp.WSMsgType.BINARY:
                    total_bytes += len(received.data)
                    print(f"[{elapsed:.2f}s] Binary: {len(received.data)} bytes (total {total_bytes})")
                elif received.type == aiohttp.WSMsgType.ERROR:
                    print(f"[{elapsed:.2f}s] Error:", received.data)
                elif received.type == aiohttp.WSMsgType.CLOSED:
                    print(f"[{elapsed:.2f}s] Closed:", received.data)
                    break
            print(f"Finished in {time.time() - start:.2f}s, total audio bytes: {total_bytes}, ws closed: {websocket.closed}, code: {websocket.close_code}")

asyncio.run(test())

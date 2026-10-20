"""Generate the Vietnamese recordings used by Debug/test_voice_ai.py (Debug/voice_samples/*.mp3).

The recordings are committed, so this is only needed to change or add one. It uses the
edge-tts package (Microsoft's online voices), which is not a project dependency:

    python -m pip install edge-tts
    python Debug/make_voice_samples.py

The sentences are read without pauses or punctuation, the way a teacher talks.
"""

import asyncio
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    raise SystemExit("Install edge-tts first: python -m pip install edge-tts")

OUT = Path(__file__).resolve().parent / "voice_samples"
VOICE = "vi-VN-HoaiMyNeural"

# Must match the class in Debug/test_voice_ai.py.
SAMPLES = {
    "correct_name": "bé Khánh Linh hôm nay ngủ trưa rất ngon",
    "near_name": "bé Hùng bị ho nhiều vào buổi chiều",
    "one_child_many": "bé An hôm nay ăn ít ngủ không ngon hơi sốt về chiều và quấy khóc nhiều",
    "class_and_children": (
        "hôm nay cả lớp ăn hết suất trừ bé Huy ăn ít các con ngủ trưa ngon buổi sáng cả lớp học vẽ "
        "nhắn mẹ bé Minh mai mang thêm quần áo cho con nhờ phụ huynh mai mang áo khoác cho các con"
    ),
}


async def main():
    OUT.mkdir(exist_ok=True)
    for name, text in SAMPLES.items():
        path = OUT / f"{name}.mp3"
        await edge_tts.Communicate(text, VOICE, rate="+5%").save(str(path))
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())

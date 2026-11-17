import base64
import json
import os
import sys


def inspect_file(file_path):
    if not os.path.exists(file_path):
        return {"ok": False, "error": "文件不存在"}

    stat = os.stat(file_path)
    result = {
        "ok": True,
        "filePath": file_path,
        "fileName": os.path.basename(file_path),
        "fileSize": stat.st_size,
        "ext": os.path.splitext(file_path)[1].lower(),
        "tags": {},
        "audio": {},
        "embeddedLyrics": "",
        "coverDataUrl": "",
    }

    try:
        from mutagen import File as MutagenFile
        from mutagen.mp4 import MP4
    except ImportError:
        result["warning"] = "mutagen 未安装，仅显示基础文件信息"
        return result

    try:
        audio = MutagenFile(file_path)
        if audio is None:
            return result

        info = getattr(audio, "info", None)
        if info:
            codec_raw = getattr(info, "codec", "") or type(audio).__name__
            codec_desc = getattr(info, "codec_description", "") or codec_raw
            if "alac" in str(codec_raw).lower():
                codec_label = "ALAC Lossless (无损)"
            elif "ec-3" in str(codec_raw).lower() or "ac-3" in str(codec_raw).lower():
                codec_label = "Dolby Atmos / AC-3"
            elif "mp4a" in str(codec_raw).lower():
                codec_label = "AAC 高品质音频"
            else:
                codec_label = str(codec_desc or codec_raw)

            result["audio"] = {
                "codec": codec_label,
                "rawCodec": str(codec_raw),
                "duration": round(getattr(info, "length", 0) or 0, 2),
                "bitrate": int((getattr(info, "bitrate", 0) or 0) / 1000),
                "sampleRate": getattr(info, "sample_rate", 0) or 0,
                "channels": getattr(info, "channels", 0) or 0,
                "bitsPerSample": getattr(info, "bits_per_sample", 0) or 0,
            }

        if isinstance(audio, MP4) and audio.tags:
            tags = audio.tags

            def first_str(key):
                val = tags.get(key)
                if not val:
                    return ""
                item = val[0]
                if isinstance(item, bytes):
                    return item.decode("utf-8", errors="ignore")
                return str(item)

            trkn = tags.get("trkn", [(0, 0)])[0]
            disk = tags.get("disk", [(0, 0)])[0]

            result["tags"] = {
                "title": first_str("\xa9nam"),
                "artist": first_str("\xa9ART"),
                "album": first_str("\xa9alb"),
                "albumArtist": first_str("aART"),
                "composer": first_str("\xa9wrt"),
                "genre": first_str("\xa9gen"),
                "date": first_str("\xa9day"),
                "copyright": first_str("cprt"),
                "track": f"{trkn[0]}/{trkn[1]}" if trkn and trkn[0] else "",
                "disc": f"{disk[0]}/{disk[1]}" if disk and disk[0] else "",
            }
            result["embeddedLyrics"] = first_str("\xa9lyr")

            covr = tags.get("covr")
            if covr and len(covr) > 0:
                raw_bytes = bytes(covr[0])
                mime = "image/png" if raw_bytes[:4] == b"\x89PNG" else "image/jpeg"
                b64 = base64.b64encode(raw_bytes).decode("ascii")
                result["coverDataUrl"] = f"data:{mime};base64,{b64}"
        elif getattr(audio, "tags", None):
            t = audio.tags
            result["tags"] = {
                "title": str(t.get("TIT2") or (t.get("title") or [""])[0] if isinstance(t.get("title"), list) else t.get("TIT2", "")),
                "artist": str(t.get("TPE1") or (t.get("artist") or [""])[0] if isinstance(t.get("artist"), list) else t.get("TPE1", "")),
                "album": str(t.get("TALB") or (t.get("album") or [""])[0] if isinstance(t.get("album"), list) else t.get("TALB", "")),
            }
    except Exception as exc:
        result["warning"] = str(exc)

    return result


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(inspect_file(target), ensure_ascii=False))

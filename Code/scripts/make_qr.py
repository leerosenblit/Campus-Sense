"""Generate per-room QR codes for the student reporting form (book §4.4.3).

Each QR encodes the reporting URL with the room id, e.g.
    http://<host>:5173/report?room=ficus-301
so the form opens with the room already filled in.

Usage:
    pip install qrcode[pil]
    python scripts/make_qr.py ficus-301 ficus-302 oren-lab10 --base http://localhost:5173
"""
import argparse

try:
    import qrcode
except ImportError:
    raise SystemExit("Install with: pip install 'qrcode[pil]'")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rooms", nargs="+", help="room ids, e.g. ficus-301")
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--out", default="qr")
    args = ap.parse_args()

    import os
    os.makedirs(args.out, exist_ok=True)
    for room in args.rooms:
        url = f"{args.base}/report?room={room}"
        img = qrcode.make(url)
        path = os.path.join(args.out, f"{room}.png")
        img.save(path)
        print(f"{room}: {url} -> {path}")


if __name__ == "__main__":
    main()

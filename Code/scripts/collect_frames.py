"""Webcam capture tool for building the anomaly dataset.

Opens the webcam and lets you label & save frames into the training folders with a
single key press. Handy for capturing lots of `normal` frames (empty floor, people
walking) and a few staged `liquid_spill` / `fallen_object` shots.

Keys:
    1  save current frame -> fallen_object/
    2  save current frame -> liquid_spill/
    3  save current frame -> normal/
    q  quit

Files are saved to edge/data/anomaly/<class>/<timestamp>.jpg. Run from anywhere:
    python scripts/collect_frames.py
"""
import os
import time

import cv2

# Resolve edge/data/anomaly relative to this file, so cwd doesn't matter.
_CODE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(_CODE, "edge", "data", "anomaly")

KEYS = {ord("1"): "fallen_object", ord("2"): "liquid_spill", ord("3"): "normal"}


def counts():
    out = {}
    for cls in KEYS.values():
        d = os.path.join(DATA_DIR, cls)
        out[cls] = len([f for f in os.listdir(d)]) if os.path.isdir(d) else 0
    return out


def main():
    for cls in KEYS.values():
        os.makedirs(os.path.join(DATA_DIR, cls), exist_ok=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise SystemExit("Could not open webcam.")

    print("Capture tool ready. Keys: 1=fallen_object  2=liquid_spill  3=normal  q=quit")
    saved = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        c = counts()
        overlay = f"1:fallen={c['fallen_object']}  2:spill={c['liquid_spill']}  3:normal={c['normal']}"
        view = frame.copy()
        cv2.putText(view, overlay, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.putText(view, "1/2/3 = save & label, q = quit", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.imshow("Campus-Sense dataset capture", view)

        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k in KEYS:
            cls = KEYS[k]
            fname = os.path.join(DATA_DIR, cls, f"{int(time.time() * 1000)}.jpg")
            cv2.imwrite(fname, frame)
            saved += 1
            print(f"saved -> {cls}/{os.path.basename(fname)}")

    cap.release()
    cv2.destroyAllWindows()
    print(f"\nSaved {saved} frames this session. Totals: {counts()}")


if __name__ == "__main__":
    main()

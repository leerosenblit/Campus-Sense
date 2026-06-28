"""Check the anomaly dataset before training.

Reports how many images you have per class and whether you're ready to train. Run:
    python scripts/check_dataset.py

Exit code is non-zero if any class folder is empty, so it can gate a training script.
"""
import os
import sys

_CODE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(_CODE, "edge", "data", "anomaly")
CLASSES = ["liquid_spill", "normal"]
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp")

MIN_OK = 50      # bare minimum to experiment
RECOMMENDED = 500  # book §7.2 target per class


def count(cls):
    d = os.path.join(DATA_DIR, cls)
    if not os.path.isdir(d):
        return None
    return len([f for f in os.listdir(d) if f.lower().endswith(IMG_EXT)])


def main():
    print(f"Dataset: {DATA_DIR}\n")
    totals = {}
    missing = False
    for cls in CLASSES:
        n = count(cls)
        if n is None:
            print(f"  {cls:14} MISSING FOLDER")
            missing = True
            totals[cls] = 0
            continue
        flag = "OK" if n >= RECOMMENDED else ("low" if n >= MIN_OK else "TOO FEW")
        print(f"  {cls:14} {n:5d} images   [{flag}]")
        totals[cls] = n

    total = sum(totals.values())
    empty = [c for c, n in totals.items() if n == 0]
    print(f"\n  total: {total} images across {len(CLASSES)} classes")

    if missing or empty:
        print(f"\n  NOT READY: these classes have no images: {empty or 'see MISSING above'}")
        print("  Collect images (scripts/collect_frames.py or phone photos) then re-run.")
        sys.exit(1)

    # imbalance warning
    mx, mn = max(totals.values()), min(totals.values())
    if mx > 3 * mn:
        print("\n  WARNING: classes are imbalanced (largest > 3x smallest).")
        print("  Add more of the smaller classes for a fair model.")

    if min(totals.values()) < MIN_OK:
        print(f"\n  You can train, but each class under {MIN_OK} will give a weak model.")
    elif min(totals.values()) < RECOMMENDED:
        print(f"\n  Good enough to train and test. For best results aim for ~{RECOMMENDED}/class.")
    else:
        print("\n  READY to train. Run:  cd edge && python train_anomaly.py --data data/anomaly")


if __name__ == "__main__":
    main()

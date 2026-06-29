"""Fine-tune YOLOv8n into a spill DETECTOR (book §5.2.2, §5.6.2).

Unlike the old classifier, this trains an object detector that draws a box around a
spill when it sees one and stays silent otherwise — so unfamiliar things (people,
shadows) never become a phantom spill.

Prereq: build the YOLO dataset from your COCO download first:
    python scripts/coco_to_yolo.py --coco <download_dir> --out edge/data/spill_yolo

Then train (run from edge/):
    python train_spill.py --data data/spill_yolo/data.yaml --epochs 50

The best weights are copied to models/spill_yolo.pt (config.SPILL_WEIGHTS), which the
edge unit auto-loads on startup, switching the anomaly backend to 'yolo-spill'.

CPU training is slow; a GPU (or free Google Colab) is strongly recommended. You can
train anywhere and just copy the resulting best.pt to models/spill_yolo.pt.
"""
import argparse
import os
import shutil

from ultralytics import YOLO

import config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/spill_yolo/data.yaml")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--imgsz", type=int, default=config.SPILL_IMGSZ)
    ap.add_argument("--model", default="yolov8n.pt", help="base model to fine-tune")
    ap.add_argument("--out", default=config.SPILL_WEIGHTS,
                    help="where to copy the trained weights (edge unit loads from here)")
    args = ap.parse_args()

    if not os.path.isfile(args.data):
        raise SystemExit(f"No dataset at {args.data}. Build it with scripts/coco_to_yolo.py first.")

    model = YOLO(args.model)
    model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, name="spill")

    best = os.path.join(model.trainer.save_dir, "weights", "best.pt")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    shutil.copy(best, args.out)
    print(f"saved weights -> {args.out}")
    print("Restart the edge unit; anomaly backend will switch to 'yolo-spill'.")


if __name__ == "__main__":
    main()

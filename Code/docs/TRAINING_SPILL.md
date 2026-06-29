# Training the spill detector

The edge unit keeps spill detection **disabled** until trained weights exist, so it
never raises false alerts. This guide takes you from a labelled dataset to a working
detector.

## Why a detector (not a classifier)

The spill model is a **YOLO object detector**, not a spill/normal classifier. This
matters: a classifier is forced to label *every* region as spill-or-normal, so it
"invents" spills for anything it hasn't seen (a person, a shadow). A detector instead
*looks for* spills and reports a box only when it sees one — and stays silent on
everything else. That's why we use detection.

```
COCO export ──▶ coco_to_yolo.py ──▶ YOLO dataset ──▶ train_spill.py ──▶ models/spill_yolo.pt ──▶ edge auto-enables
```

## Step 1 — Get a labelled spill dataset

You need images with **bounding boxes** drawn around spills (not just folders of
images — the detector trains on the boxes). Easiest sources:

- **Roboflow Universe** — search "spill" / "wet floor"; export as **COCO** (or YOLOv5).
- Or label your own with [Roboflow](https://roboflow.com) / [CVAT] / [labelImg].

Aim for variety: different floors (tile, vinyl, carpet), liquids (water, coffee,
juice), sizes, lighting, and camera angles close to your real ceiling camera. A few
hundred well-labelled images beats thousands of mismatched ones.

## Step 2 — Convert COCO → YOLO

```powershell
python scripts\coco_to_yolo.py --coco "PATH\TO\COCO_DOWNLOAD" --out edge\data\spill_yolo
```

This collapses all categories to a single `spill` class and writes
`edge/data/spill_yolo/` with `images/`, `labels/`, and `data.yaml` (handles Roboflow
train/valid/test splits automatically).

## Step 3 — Train

```powershell
cd edge
python train_spill.py --data data/spill_yolo/data.yaml --epochs 50
```

The best weights are copied to `models/spill_yolo.pt` (the path the edge unit loads).

> **CPU is slow.** Detector training really wants a GPU. Free option: train on **Google
> Colab** (upload `edge/data/spill_yolo`, run `pip install ultralytics` then
> `yolo detect train data=spill_yolo/data.yaml model=yolov8n.pt epochs=50 imgsz=640`),
> download `best.pt`, and copy it to `models/spill_yolo.pt`. Same result, much faster.

## Step 4 — Turn it on

Restart the edge unit:

```powershell
python campus_edge.py --building ficus --room 301 --debug-spill
```

Startup should print:

```
edge CV backends: people=yolo (cpu) anomaly=yolo-spill      <-- was "anomaly=disabled"
```

Stand in front of the camera → **no alert** (a person isn't a spill, and the detector
doesn't fire on it). Place a safe water spill on the floor → after it's seen in **two
consecutive frames** (the noise filter, §5.2.2) the edge publishes an `anomaly` event,
the engine opens **one** ticket, and the cleaner view is notified.

`--debug-spill` saves every detection (the frame with the box drawn) to
`edge/debug/anomaly/` so you can see exactly what fired.

## Step 5 — Tune if needed

- **Misses real spills?** Add more labelled spill images in the failing
  lighting/floor, and retrain. More (and more representative) data beats more epochs.
- **Occasional false boxes?** Raise the confidence: `ANOMALY_CONF_THRESHOLD=0.7` (env
  var) before starting the edge. The detector already ignores most non-spills, so this
  is a fine-tune, not a crutch.

## How to turn it off

Delete (or rename) `models/spill_yolo.pt` and restart — the edge returns to
`anomaly=disabled` automatically.

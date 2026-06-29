# Models

Trained weights for the edge CV pipelines. Binaries are gitignored (`*.pt`, `*.onnx`,
`*.pth`) — distribute them separately.

- `yolov8n.pt` — YOLOv8n person counter (book §5.2.1, §5.6.1). If absent, the edge unit
  falls back to OpenCV's HOG people detector; pass `--simulate` to skip CV entirely.
  Ultralytics auto-downloads stock `yolov8n` weights on first use if this file is missing.
  Runs on the Apple-Silicon GPU (MPS) automatically; override with `YOLO_DEVICE`.
  Requires `ultralytics>=8.3` (older versions fail to load weights under PyTorch ≥2.6).
- `spill_yolo.pt` — YOLOv8 spill **detector** (book §5.2.2, §5.6.2). Trained with
  `edge/train_spill.py` on a YOLO dataset built by `scripts/coco_to_yolo.py`. If absent,
  anomaly detection stays disabled (the edge unit never raises false spill alerts
  without a trained model). It reports a spill only when it actually detects one, and
  stays silent on unfamiliar things — unlike a classifier, which would force a label.
  Forgotten personal items (bags/laptops) are detected separately by `yolov8n.pt`.

Training datasets and scripts are future work (book §7.2).

# Models

Trained weights for the edge CV pipelines. Binaries are gitignored (`*.pt`, `*.onnx`,
`*.pth`) — distribute them separately.

- `yolov8n.pt` — YOLOv8n person counter (book §5.2.1, §5.6.1). If absent, the edge unit
  falls back to OpenCV's HOG people detector; pass `--simulate` to skip CV entirely.
  Ultralytics auto-downloads stock `yolov8n` weights on first use if this file is missing.
  Runs on the Apple-Silicon GPU (MPS) automatically; override with `YOLO_DEVICE`.
  Requires `ultralytics>=8.3` (older versions fail to load weights under PyTorch ≥2.6).
- `anomaly_mobilenet.pth` — MobileNetV3-small spill classifier, 2 classes
  {liquid_spill, normal} (book §5.2.2, §5.6.2). If absent, anomaly detection stays
  disabled (the edge unit never raises false spill alerts without a trained model).
  Forgotten personal items (bags/laptops) are detected separately by `yolov8n.pt`.

Training datasets and scripts are future work (book §7.2).

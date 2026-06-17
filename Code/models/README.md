# Models

Trained weights for the edge CV pipelines. Binaries are gitignored (`*.pt`, `*.onnx`,
`*.pth`) — distribute them separately.

- `yolov5n.pt` — YOLOv5n person counter (book §5.2.1, §5.6.1). If absent, the edge unit
  falls back to OpenCV's HOG people detector; pass `--simulate` to skip CV entirely.
  Ultralytics will auto-download stock `yolov5n` weights on first use if this file is missing.
- `anomaly_mobilenet.pth` — MobileNetV3-small classifier, 3 classes
  {liquid_spill, fallen_object, normal} (book §5.2.2, §5.6.2). If absent, the edge unit
  falls back to background-subtraction-only anomaly candidates.

Training datasets and scripts are future work (book §7.2).

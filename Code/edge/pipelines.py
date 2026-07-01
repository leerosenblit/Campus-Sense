"""The two parallel CV pipelines that make the camera a "super-sensor" (book §4.2, §5.2).

Both pipelines degrade gracefully: if the heavy CV libraries (ultralytics/torch) are not
installed, they fall back to lightweight OpenCV heuristics so the end-to-end pipeline can
still be demonstrated on a plain laptop.

Privacy (NFR3): frames are processed in memory only. These classes return numbers/flags;
the caller never persists or transmits the image.
"""
from __future__ import annotations

import numpy as np

import config


class PeopleCounter:
    """Counts people in a frame.

    Primary path: YOLOv5n (book §5.2.1, §5.6.1) — pretrained COCO 'person' class,
    optionally fine-tuned on the Afeka classroom dataset.
    Fallback path: OpenCV HOG pedestrian detector (no torch required).
    """

    def __init__(self, weights: str = config.YOLO_WEIGHTS,
                 conf: float = config.PERSON_CONF_THRESHOLD,
                 device: str = config.YOLO_DEVICE,
                 imgsz: int = config.YOLO_IMGSZ):
        self.conf = conf
        self.imgsz = imgsz
        self.device = self._resolve_device(device)
        self.backend = None
        self._model = None
        try:
            from ultralytics import YOLO  # type: ignore
            self._model = YOLO(weights)
            self.backend = "yolo"
        except Exception:
            # Fallback: OpenCV HOG + SVM people detector. Much slower and less
            # accurate; only used when YOLO weights/torch are unavailable.
            import cv2
            self._hog = cv2.HOGDescriptor()
            self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self.backend = "hog"

    @staticmethod
    def _resolve_device(device: str) -> str:
        """Map "auto" to the fastest backend available (Metal GPU on Apple Silicon)."""
        if device != "auto":
            return device
        try:
            import torch
            if torch.backends.mps.is_available():
                return "mps"
            if torch.cuda.is_available():
                return "cuda:0"
        except Exception:
            pass
        return "cpu"

    # COCO class ids for the personal items that get "forgotten" in a room (Use Case
    # D). Reuses the same YOLO model as people counting — no extra model to train.
    PERSONAL_ITEM_CLASSES = {
        24: "backpack", 26: "handbag", 28: "suitcase",
        39: "bottle", 63: "laptop", 67: "cell phone", 73: "book",
    }

    def count(self, frame) -> int:
        return len(self.detect_boxes(frame))

    def detect_items(self, frame, conf: float | None = None):
        """Return [(item_name, confidence, (x, y, w, h))] for personal items in frame.

        YOLO-only: the HOG fallback can't classify object types, so it returns [].
        Used by the edge unit to spot a bag/laptop/bottle left in an empty room, and
        to draw item boxes in the --preview window.
        """
        if self.backend != "yolo":
            return []
        results = self._model.predict(
            frame, conf=conf if conf is not None else self.conf,
            classes=list(self.PERSONAL_ITEM_CLASSES), device=self.device,
            imgsz=self.imgsz, verbose=False)
        items = []
        for r in results:
            for cls_id, c, xyxy in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist(), r.boxes.xyxy.tolist()):
                name = self.PERSONAL_ITEM_CLASSES.get(int(cls_id))
                if name:
                    x1, y1, x2, y2 = xyxy
                    items.append((name, float(c), (int(x1), int(y1), int(x2 - x1), int(y2 - y1))))
        return items

    def detect_boxes(self, frame):
        """Return person bounding boxes as a list of (x, y, w, h).

        count() is just len() of this. Boxes are normally discarded for privacy
        (book §5.2.1); they are surfaced only so the optional --preview window can
        draw them. They are never published over MQTT.
        """
        if self.backend == "yolo":
            # class 0 == 'person' in COCO.
            results = self._model.predict(frame, conf=self.conf, classes=[0],
                                          device=self.device, imgsz=self.imgsz,
                                          verbose=False)
            boxes = []
            for r in results:
                for x1, y1, x2, y2 in r.boxes.xyxy.tolist():
                    boxes.append((int(x1), int(y1), int(x2 - x1), int(y2 - y1)))
            return boxes
        # HOG fallback
        import cv2
        rects, _ = self._hog.detectMultiScale(frame, winStride=(8, 8))
        # crude non-maximum suppression by area overlap is skipped for the prototype
        return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in rects]


class AnomalyDetector:
    """Detects floor spills with a YOLO object detector (book §5.2.2, §6.2.2).

    This is a DETECTOR, not a classifier: it scans the frame for spill-shaped
    regions and reports one only when it actually sees a spill. Things it has not
    learned (people, shadows, bags) simply produce no detection — the detector's
    built-in "background" means it stays silent instead of forcing a spill label on
    anything novel. Disabled (returns None) until trained weights exist, so the unit
    never raises spill alerts it cannot actually recognise (book §7.2).

    Same detect(frame) -> (class, conf) | None interface as before, so the edge unit,
    temporal filter, engine and ticket flow are unchanged.
    """

    CLASSES = ["liquid_spill"]  # single-class detector; kept for downstream references

    def __init__(self, weights: str = config.SPILL_WEIGHTS,
                 conf: float = config.ANOMALY_CONF_THRESHOLD,
                 device: str = config.YOLO_DEVICE,
                 imgsz: int = config.SPILL_IMGSZ,
                 debug_dir: str | None = None):
        self.conf = conf
        self.imgsz = imgsz
        self.device = PeopleCounter._resolve_device(device)
        self._debug_dir = debug_dir  # if set, save detected spill frames for inspection
        self._model = None
        self.backend = "disabled"
        self.enabled = False
        import os
        if os.path.isfile(weights):
            try:
                from ultralytics import YOLO
                self._model = YOLO(weights)
                self.backend = "yolo-spill"
                self.enabled = True
            except Exception:
                self.backend = "disabled"
                self.enabled = False

    def detect(self, frame):
        """Return ("liquid_spill", confidence, (x, y, w, h)) for the strongest spill,
        or None.

        None whenever the detector is disabled (no weights) OR no spill is found —
        so unfamiliar objects never become a phantom spill. The box is used to draw
        the spill in the --preview window.
        """
        if not self.enabled:
            return None
        results = self._model.predict(frame, conf=self.conf, device=self.device,
                                      imgsz=self.imgsz, verbose=False)
        best_conf, best_box = 0.0, None
        for r in results:
            for xyxy, c in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist()):
                if c > best_conf:
                    best_conf, best_box = float(c), xyxy
        if best_box is None:
            return None
        if self._debug_dir:
            self._save_debug(frame, best_box, best_conf)
        x1, y1, x2, y2 = best_box
        return "liquid_spill", best_conf, (int(x1), int(y1), int(x2 - x1), int(y2 - y1))

    def _save_debug(self, frame, box, conf):
        import os
        import time
        import cv2
        os.makedirs(self._debug_dir, exist_ok=True)
        x1, y1, x2, y2 = (int(v) for v in box)
        annotated = frame.copy()
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(annotated, f"spill {conf:.2f}", (x1, max(12, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        cv2.imwrite(os.path.join(self._debug_dir, f"{int(time.time() * 1000)}_spill_{conf:.2f}.jpg"), annotated)

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
        """Return [(item_name, confidence)] for personal items in the frame.

        YOLO-only: the HOG fallback can't classify object types, so it returns [].
        Used by the edge unit to spot a bag/laptop/bottle left in an empty room.
        """
        if self.backend != "yolo":
            return []
        results = self._model.predict(
            frame, conf=conf if conf is not None else self.conf,
            classes=list(self.PERSONAL_ITEM_CLASSES), device=self.device,
            imgsz=self.imgsz, verbose=False)
        items = []
        for r in results:
            for cls_id, c in zip(r.boxes.cls.tolist(), r.boxes.conf.tolist()):
                name = self.PERSONAL_ITEM_CLASSES.get(int(cls_id))
                if name:
                    items.append((name, float(c)))
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
    """Detects floor anomalies (book §5.2.2, §6.2.2).

    Approach: background subtraction (current frame minus a baseline of the empty room)
    to find changed regions, then a MobileNetV3-small classifier on the crop:
    classes = {liquid_spill, normal}.

    Fallback (no torch): report the largest changed-region ratio as a generic 'anomaly'
    candidate so the temporal filter and alerting path can be exercised.
    """

    # Order MUST match torchvision ImageFolder, which indexes classes alphabetically.
    # train_anomaly.py trains with this same order, so saved weights load correctly.
    CLASSES = ["liquid_spill", "normal"]

    def __init__(self, weights: str = config.ANOMALY_WEIGHTS,
                 conf: float = config.ANOMALY_CONF_THRESHOLD):
        self.conf = conf
        self.baseline = None
        self.backend = None
        self._model = None
        try:
            import torch  # noqa: F401
            self._load_torch_model(weights)
            self.backend = "mobilenet"
            self.enabled = True
        except Exception:
            # No trained weights available. We deliberately do NOT fall back to a
            # naive background-subtraction guess, because it labels ANY change as a
            # "spill" (false positives on movement / lighting). Anomaly detection is
            # disabled until a real model exists (book §7.2). People counting is
            # unaffected.
            self.backend = "disabled"
            self.enabled = False

    def _load_torch_model(self, weights: str):
        import torch
        from torchvision import models, transforms

        net = models.mobilenet_v3_small(weights=None)
        net.classifier[-1] = torch.nn.Linear(net.classifier[-1].in_features, len(self.CLASSES))
        net.load_state_dict(torch.load(weights, map_location="cpu"))
        net.eval()
        self._model = net
        self._tf = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
        ])

    def set_baseline(self, frame):
        """Capture the empty-room baseline image used for background subtraction."""
        import cv2
        self.baseline = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    def detect(self, frame):
        """Return (class_name, confidence) or None.

        Returns None whenever anomaly detection is disabled (no trained model) so
        the unit never raises spill/object alerts it cannot actually recognise.
        """
        if not self.enabled:
            return None

        import cv2
        if self.baseline is None:
            self.set_baseline(frame)
            return None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        diff = cv2.absdiff(self.baseline, gray)
        _, mask = cv2.threshold(diff, 30, 255, cv2.THRESH_BINARY)
        changed_ratio = float(np.count_nonzero(mask)) / mask.size
        if changed_ratio < 0.02:  # nothing notable changed on the floor
            return None

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        x, y, w, h = cv2.boundingRect(max(contours, key=cv2.contourArea))
        crop = frame[y:y + h, x:x + w]
        if crop.size == 0:
            return None

        # Only reached when a trained MobileNet model is loaded (self.enabled).
        import torch
        with torch.no_grad():
            logits = self._model(self._tf(crop).unsqueeze(0))
            probs = torch.softmax(logits, dim=1)[0]
            idx = int(probs.argmax())
            cls, p = self.CLASSES[idx], float(probs[idx])
        if cls == "normal" or p < self.conf:
            return None
        return cls, p

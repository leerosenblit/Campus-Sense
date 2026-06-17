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
                 conf: float = config.PERSON_CONF_THRESHOLD):
        self.conf = conf
        self.backend = None
        self._model = None
        try:
            from ultralytics import YOLO  # type: ignore
            self._model = YOLO(weights)
            self.backend = "yolo"
        except Exception:
            # Fallback: OpenCV HOG + SVM people detector.
            import cv2
            self._hog = cv2.HOGDescriptor()
            self._hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self.backend = "hog"

    def count(self, frame) -> int:
        if self.backend == "yolo":
            # class 0 == 'person' in COCO. Discard boxes immediately (book §5.2.1).
            results = self._model.predict(frame, conf=self.conf, classes=[0], verbose=False)
            return int(sum(len(r.boxes) for r in results))
        # HOG fallback
        import cv2
        rects, _ = self._hog.detectMultiScale(frame, winStride=(8, 8))
        # crude non-maximum suppression by area overlap is skipped for the prototype
        return len(rects)


class AnomalyDetector:
    """Detects floor anomalies (book §5.2.2, §6.2.2).

    Approach: background subtraction (current frame minus a baseline of the empty room)
    to find changed regions, then a MobileNetV3-small classifier on the crop:
    classes = {liquid_spill, fallen_object, normal}.

    Fallback (no torch): report the largest changed-region ratio as a generic 'anomaly'
    candidate so the temporal filter and alerting path can be exercised.
    """

    # Order MUST match torchvision ImageFolder, which indexes classes alphabetically.
    # train_anomaly.py trains with this same order, so saved weights load correctly.
    CLASSES = ["fallen_object", "liquid_spill", "normal"]

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

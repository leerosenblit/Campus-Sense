# Anomaly training data

Put labelled floor images here, one folder per class. Folder names are the labels and
**must** be exactly these three (torchvision indexes them alphabetically, which is the
order `pipelines.AnomalyDetector.CLASSES` expects):

```
data/anomaly/
├── fallen_object/   # chairs/objects on the floor
├── liquid_spill/    # water, juice, coffee on different surfaces
└── normal/          # clean floor, people walking — anything that is NOT a hazard
```

Guidance from the project book:
- Aim for **≥ 500 images per class** in varied lighting and floor surfaces (§7.2).
- Include people walking through `normal/` so the model learns that movement ≠ spill
  (this is exactly the false positive that forced us to disable the naive fallback).
- Augmentation (flips, brightness, rotation) is applied automatically during training.

Then train:

```bash
cd edge
python train_anomaly.py --data data/anomaly --epochs 15 --out ../models/anomaly_mobilenet.pth
```

The image folders themselves are gitignored (large); only this README is tracked.

# Training the spill / anomaly detector

The edge unit keeps anomaly detection **disabled** until a trained model exists, so it
never raises false "spill" alerts. This guide takes you from zero to a working detector.
Everything is already wired — you only need to collect images and run one command.

## How it works (the short version)

1. You collect floor photos and sort them into 2 folders by label.
2. `train_anomaly.py` fine-tunes a small MobileNetV3 model on them.
3. It saves the weights to `models/anomaly_mobilenet.pth`.
4. Next time the edge unit starts, it auto-detects the weights and switches the anomaly
   backend from `disabled` to `mobilenet`. No code changes.

```
photos ──▶ train_anomaly.py ──▶ models/anomaly_mobilenet.pth ──▶ edge auto-enables
```

---

## Step 1 — Collect images

Create photos of the floor in two categories. Put them here (folder name = label):

```
edge/data/anomaly/
├── liquid_spill/    water / juice / coffee puddles, on different floors & lighting
└── normal/          clean floor — AND people walking/standing (very important!)
```

**Targets (from the book §7.2):**
- Aim for **≥ 500 images per class** for good accuracy; you can start experimenting
  with ~50–100 per class just to see it work.
- Vary lighting (day/evening, lights on/off), floor types, and camera distance.
- **Put people into `normal/`.** The whole reason detection was disabled is that the
  naive method called *any movement* a spill. The model must learn "person ≠ spill."

**Easy ways to collect:**
- Phone photos of safe, supervised spills (water is fine), then copy them over.
- Use your webcam: point it at the floor and save frames. A tiny helper:
  ```python
  # save_frames.py — press SPACE to save a frame, q to quit
  import cv2, time
  cap = cv2.VideoCapture(0); i = 0
  while True:
      ok, f = cap.read()
      cv2.imshow("collect (SPACE=save, q=quit)", f)
      k = cv2.waitKey(1) & 0xFF
      if k == ord(' '): cv2.imwrite(f"frame_{int(time.time())}_{i}.jpg", f); i += 1
      elif k == ord('q'): break
  cap.release(); cv2.destroyAllWindows()
  ```
  Then move the saved `.jpg`s into the right class folder.

> The image folders are gitignored — they stay on your machine, not in the repo.

### Campus collection checklist (for the data-gathering week)

Use this when walking the campus. Tools to help:
- `python scripts/collect_frames.py` — webcam capture: press `1`/`2`/`3` to save & label a
  frame into `liquid_spill` / `normal`. Shows live counts.
- Phone photos work too — just copy them into the matching folder afterwards.
- `python scripts/check_dataset.py` — run anytime to see counts and whether you're ready.

What to capture (variety is what makes it work):

- **liquid_spill** — water, juice, coffee puddles. Different floor types (tile, vinyl,
  carpet), different sizes, wet vs. drying, with and without reflections/glare.
- **normal** — clean floor in many rooms/corridors AND, importantly, **people standing and
  walking**. This is what stops the model from calling a moving person a "spill" (the exact
  bug that made us disable detection).
- Vary **lighting** (daylight, evening, lights on/off) and **camera height/angle** —
  ideally close to where the real ceiling camera would sit.

Targets: aim for **~500 images per class** (the book's §7.2 goal). Even ~100/class is
enough to train a first working version and see it switch on.

> Safety: only use water for spills, under supervision, away from electrical outlets
> (the book did the same in its field test).

## Step 2 — Make sure the CV libraries are installed

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\edge"
pip install -r requirements.txt
```

(torch + torchvision + opencv. They're already installed on this machine.)

## Step 3 — Train

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\edge"
python train_anomaly.py --data data/anomaly --epochs 15
```

`--out` defaults to the exact path the edge unit loads from (`Code/models/anomaly_mobilenet.pth`),
so you don't need to specify it. You'll see validation accuracy per epoch:

```
epoch 1/15  val_acc=0.61
epoch 2/15  val_acc=0.74
...
epoch 15/15 val_acc=0.89
saved weights -> ...\Code\models\anomaly_mobilenet.pth
```

- `--epochs 15` is a good start; raise it if accuracy is still climbing.
- Training a few hundred images takes a few minutes on CPU, seconds on a GPU.
- The book reports ~88% validation accuracy on ~1,200 images — a realistic target.

> **Where weights go:** `config.py` resolves the path absolutely to
> `Code/models/anomaly_mobilenet.pth`, regardless of which directory you run from. The
> training script writes to that same path by default. To use a custom location, set the
> `ANOMALY_WEIGHTS` env var (the edge unit and trainer both honour it).

## Step 4 — Turn it on

Just restart the edge unit:

```powershell
cd "C:\Users\monon\Desktop\Afeka\Year 3\Final Project\Campus-Sense\Code\edge"
python campus_edge.py --building ficus --room 301
```

Startup should now print:

```
edge CV backends: people=yolo anomaly=mobilenet      <-- was "anomaly=disabled"
```

Place a (supervised, safe) water puddle in view. After it's seen in **two consecutive
frames** (the noise filter, §5.2.2), the edge publishes an `anomaly` event, the engine
creates **one** ticket, and the cleaner view gets a notification.

## Step 5 — Tune if needed

- **Too many false alerts?** Raise the confidence threshold:
  `ANOMALY_CONF_THRESHOLD=0.8` (env var) before starting the edge.
- **Misses real spills?** Add more `liquid_spill` examples in the lighting/floor where it
  fails, and retrain. More data beats more epochs.
- **Confuses people with spills?** Add more `normal/` images that contain people.

## How to turn it back off

Delete (or rename) `models/anomaly_mobilenet.pth` and restart the edge unit — it returns
to `anomaly=disabled` automatically.

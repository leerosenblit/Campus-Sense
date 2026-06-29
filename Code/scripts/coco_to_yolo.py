"""Convert a COCO-format detection export into a YOLO dataset for training a spill
detector with ultralytics (YOLOv8).

Reads a COCO export (images + _annotations.coco.json, optionally split into
train/ valid/ test/ subfolders, e.g. a Roboflow export) and writes:

    <out>/
        data.yaml
        images/train/*.jpg   labels/train/*.txt
        images/val/*.jpg     labels/val/*.txt

All categories are collapsed to a single class `spill` (class 0) — we only care
about detecting spills. YOLO label lines are:  0 cx cy w h   (normalized 0..1).

Usage:
    python scripts/coco_to_yolo.py --coco <download_dir> --out edge/data/spill_yolo
    # then train:  cd edge && python train_spill.py

Needs Pillow (already in the edge venv) only as a fallback for missing image sizes.
"""
import argparse
import glob
import json
import os
import shutil


def find_coco_jsons(root):
    hits = glob.glob(os.path.join(root, "**", "_annotations.coco.json"), recursive=True)
    if hits:
        return hits
    out = []
    for p in glob.glob(os.path.join(root, "**", "*.json"), recursive=True):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict) and "images" in d and "annotations" in d:
                out.append(p)
        except (ValueError, OSError):
            continue
    return out


def split_for(json_path):
    """Map the export's split folder to YOLO train/val (valid/test -> val)."""
    name = os.path.basename(os.path.dirname(json_path)).lower()
    return "train" if "train" in name else "val"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coco", required=True, help="COCO export folder (searched recursively)")
    ap.add_argument("--out", default="edge/data/spill_yolo", help="output YOLO dataset dir")
    ap.add_argument("--class-name", default="spill")
    ap.add_argument("--spill-categories", nargs="*", default=None,
                    help="COCO category names that count as a spill (case-insensitive). "
                         "Others are ignored; images with no spill box become background. "
                         "Default: every category (only correct for single-class datasets).")
    ap.add_argument("--background", nargs="*", default=[],
                    help="folder(s) of negative images with NO spill (e.g. your normal/ "
                         "frames of people + empty floors). Added with empty labels so the "
                         "detector learns these are not spills.")
    args = ap.parse_args()

    jsons = find_coco_jsons(args.coco)
    if not jsons:
        raise SystemExit(f"No COCO annotation json found under {args.coco}")

    for sub in ("images/train", "images/val", "labels/train", "labels/val"):
        os.makedirs(os.path.join(args.out, sub), exist_ok=True)

    counts = {"train": 0, "val": 0}
    for jpath in jsons:
        base = os.path.dirname(jpath)
        split = split_for(jpath)
        with open(jpath, encoding="utf-8") as f:
            coco = json.load(f)
        images = {im["id"]: im for im in coco["images"]}

        # Which category ids count as a spill?
        cat_name = {c["id"]: c["name"] for c in coco.get("categories", [])}
        if args.spill_categories:
            wanted = {c.lower() for c in args.spill_categories}
            spill_ids = {cid for cid, n in cat_name.items() if n.lower() in wanted}
        else:
            spill_ids = set(cat_name)  # all (single-class datasets only)
        print(f"  {os.path.basename(base)}: categories={list(cat_name.values())} "
              f"-> spill={[cat_name[i] for i in spill_ids]}")

        anns_by_img = {}
        for a in coco["annotations"]:
            if a["category_id"] not in spill_ids:
                continue  # non-spill annotation: skip (image still copied as background)
            anns_by_img.setdefault(a["image_id"], []).append(a)

        for img_id, im in images.items():
            src = os.path.join(base, im["file_name"])
            if not os.path.isfile(src):
                continue
            W, H = im.get("width"), im.get("height")
            if not W or not H:
                from PIL import Image
                with Image.open(src) as pim:
                    W, H = pim.size

            stem = f"{split}_{os.path.splitext(os.path.basename(im['file_name']))[0]}_{img_id}"
            ext = os.path.splitext(im["file_name"])[1] or ".jpg"
            shutil.copy(src, os.path.join(args.out, "images", split, stem + ext))

            lines = []
            for a in anns_by_img.get(img_id, []):
                x, y, w, h = a["bbox"]
                cx, cy = (x + w / 2) / W, (y + h / 2) / H
                lines.append(f"0 {cx:.6f} {cy:.6f} {w / W:.6f} {h / H:.6f}")
            # Write a label file even if empty (a negative/background image).
            with open(os.path.join(args.out, "labels", split, stem + ".txt"), "w", encoding="utf-8") as lf:
                lf.write("\n".join(lines))
            counts[split] += 1

    # Ensure both splits are non-empty (a single merged json can land entirely in one).
    import math

    def _move(frm, to, frac):
        imgs = sorted(os.listdir(os.path.join(args.out, "images", frm)))
        n = max(1, math.floor(frac * len(imgs)))
        for name in imgs[:n]:
            stem, ext = os.path.splitext(name)
            for kind, e in (("images", ext), ("labels", ".txt")):
                s = os.path.join(args.out, kind, frm, stem + e)
                if os.path.isfile(s):
                    shutil.move(s, os.path.join(args.out, kind, to, stem + e))
        counts[to] += n
        counts[frm] -= n

    if counts["val"] == 0 and counts["train"] > 0:
        _move("train", "val", 0.2)
    elif counts["train"] == 0 and counts["val"] > 0:
        _move("val", "train", 0.8)

    # Background / negative images: no spill, so empty label files. These teach the
    # detector not to fire on people, shadows, empty floors, etc. We send ~20% to val.
    EXTS = (".jpg", ".jpeg", ".png", ".bmp")
    bg = 0
    for bdir in args.background:
        files = [f for f in sorted(os.listdir(bdir)) if f.lower().endswith(EXTS)]
        for i, f in enumerate(files):
            split = "val" if i % 5 == 0 else "train"
            stem = f"bg_{os.path.splitext(f)[0]}_{i}"
            ext = os.path.splitext(f)[1] or ".jpg"
            shutil.copy(os.path.join(bdir, f), os.path.join(args.out, "images", split, stem + ext))
            open(os.path.join(args.out, "labels", split, stem + ".txt"), "w").close()
            counts[split] += 1
            bg += 1
    if bg:
        print(f"added {bg} background (no-spill) images")

    data_yaml = os.path.join(args.out, "data.yaml")
    with open(data_yaml, "w", encoding="utf-8") as f:
        f.write(
            f"path: {os.path.abspath(args.out)}\n"
            f"train: images/train\n"
            f"val: images/val\n"
            f"names:\n  0: {args.class_name}\n"
        )

    print(f"Done. train={counts['train']}  val={counts['val']} images")
    print(f"Wrote {data_yaml}")
    print("Next:  cd edge && python train_spill.py")


if __name__ == "__main__":
    main()

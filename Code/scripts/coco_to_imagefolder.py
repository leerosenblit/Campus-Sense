"""Convert a COCO-format dataset into the ImageFolder layout train_anomaly.py expects.

Our spill model is an image CLASSIFIER (torchvision ImageFolder): it reads the folder
name as the label and ignores annotation files. A COCO dataset is a DETECTION format
(images + a _annotations.coco.json with bounding boxes), so it must be converted: we
pull the images that contain the object into a single class folder — optionally
cropping each bounding box, which matches how the edge unit classifies a cropped
changed-region at inference (pipelines.AnomalyDetector).

Handles a plain COCO folder (images + _annotations.coco.json) OR a Roboflow-style
export with train/ valid/ test/ subfolders, each with its own _annotations.coco.json.

Usage:
    # copy whole images that contain a spill into liquid_spill/
    python scripts/coco_to_imagefolder.py --coco <download_dir> \
        --out edge/data/anomaly/liquid_spill

    # better: crop each annotated box (tighter, matches inference)
    python scripts/coco_to_imagefolder.py --coco <download_dir> \
        --out edge/data/anomaly/liquid_spill --crop

    # only keep certain category names (default: every annotated image)
    python scripts/coco_to_imagefolder.py --coco <dir> --out <...> --categories spill wet_floor

Needs Pillow:  pip install pillow   (already present in the edge venv)
"""
import argparse
import glob
import json
import os

from PIL import Image


def find_coco_jsons(root: str):
    """Return COCO annotation json paths under root (recursively)."""
    hits = glob.glob(os.path.join(root, "**", "_annotations.coco.json"), recursive=True)
    if hits:
        return hits
    # Fall back to any *.json that looks like COCO (has images + annotations).
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coco", required=True, help="COCO export folder (searched recursively)")
    ap.add_argument("--out", required=True, help="target class folder, e.g. edge/data/anomaly/liquid_spill")
    ap.add_argument("--crop", action="store_true", help="save each bounding box as its own image")
    ap.add_argument("--categories", nargs="*", help="only these category names (default: all)")
    ap.add_argument("--min-size", type=int, default=24, help="skip crops smaller than this (px)")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    jsons = find_coco_jsons(args.coco)
    if not jsons:
        raise SystemExit(f"No COCO annotation json found under {args.coco}")

    wanted = set(c.lower() for c in args.categories) if args.categories else None
    saved = 0

    for jpath in jsons:
        base = os.path.dirname(jpath)
        split = os.path.basename(base) or "coco"
        with open(jpath, encoding="utf-8") as f:
            coco = json.load(f)

        cat_name = {c["id"]: c["name"] for c in coco.get("categories", [])}
        images = {im["id"]: im for im in coco["images"]}

        # Group annotations by image, filtering by category name if requested.
        by_image = {}
        for ann in coco["annotations"]:
            if wanted is not None and cat_name.get(ann["category_id"], "").lower() not in wanted:
                continue
            by_image.setdefault(ann["image_id"], []).append(ann)

        for img_id, anns in by_image.items():
            im_info = images.get(img_id)
            if not im_info:
                continue
            src = os.path.join(base, im_info["file_name"])
            if not os.path.isfile(src):
                continue

            if not args.crop:
                # Copy the whole image once (it contains the object).
                try:
                    img = Image.open(src).convert("RGB")
                except OSError:
                    continue
                dst = os.path.join(args.out, f"{split}_{img_id}.jpg")
                img.save(dst, "JPEG", quality=90)
                saved += 1
                continue

            # Crop each bounding box into its own image.
            try:
                img = Image.open(src).convert("RGB")
            except OSError:
                continue
            W, H = img.size
            for ann in anns:
                x, y, w, h = ann["bbox"]
                x0, y0 = max(0, int(x)), max(0, int(y))
                x1, y1 = min(W, int(x + w)), min(H, int(y + h))
                if x1 - x0 < args.min_size or y1 - y0 < args.min_size:
                    continue
                crop = img.crop((x0, y0, x1, y1))
                dst = os.path.join(args.out, f"{split}_{img_id}_{ann['id']}.jpg")
                crop.save(dst, "JPEG", quality=90)
                saved += 1

    print(f"Done. Wrote {saved} images to {args.out}")
    print("Tip: run  python scripts/check_dataset.py  to see per-class counts.")


if __name__ == "__main__":
    main()

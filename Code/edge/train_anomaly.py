"""Fine-tune the anomaly classifier (book §5.2.2, §5.6.2, §7.2).

Transfer-learning on MobileNetV3-small: start from ImageNet weights, replace the final
layer with a 3-class head, and fine-tune on a small dataset of floor images.

Dataset layout (torchvision ImageFolder — folder name == class label, indexed
ALPHABETICALLY, which is why pipelines.AnomalyDetector.CLASSES is in that order):

    edge/data/anomaly/
        fallen_object/   *.jpg
        liquid_spill/    *.jpg
        normal/          *.jpg

Usage:
    cd edge
    python train_anomaly.py --data data/anomaly --epochs 15 --out ../models/anomaly_mobilenet.pth

Once the weights exist at models/anomaly_mobilenet.pth, the edge unit auto-detects them
on startup and switches the anomaly backend from "disabled" to "mobilenet".
"""
import argparse

import torch
from torch import nn, optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, models, transforms

import config  # reuse the SAME resolved weights path the edge unit loads from

# Must match pipelines.AnomalyDetector.CLASSES (alphabetical).
EXPECTED_CLASSES = ["fallen_object", "liquid_spill", "normal"]


def build_model(num_classes: int):
    net = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    net.classifier[-1] = nn.Linear(net.classifier[-1].in_features, num_classes)
    return net


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/anomaly")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--lr", type=float, default=1e-4)  # low LR for fine-tuning (book §5.6.2)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--out", default=config.ANOMALY_WEIGHTS,
                    help="defaults to the exact path the edge unit loads from")
    args = ap.parse_args()

    # Heavy augmentation helps on a tiny dataset (book §5.2.2).
    train_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.3, contrast=0.3),
        transforms.RandomRotation(15),
        transforms.ToTensor(),
    ])

    full = datasets.ImageFolder(args.data, transform=train_tf)
    if full.classes != EXPECTED_CLASSES:
        raise SystemExit(
            f"Class folders {full.classes} != expected {EXPECTED_CLASSES}. "
            "Create exactly these subfolders so labels line up with the edge unit."
        )

    n_val = max(1, int(0.2 * len(full)))
    train_ds, val_ds = random_split(full, [len(full) - n_val, n_val])
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True)
    val_dl = DataLoader(val_ds, batch_size=args.batch)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = build_model(len(EXPECTED_CLASSES)).to(device)
    opt = optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = nn.CrossEntropyLoss()

    for epoch in range(args.epochs):
        model.train()
        for x, y in train_dl:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss_fn(model(x), y).backward()
            opt.step()

        # validation accuracy
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for x, y in val_dl:
                x, y = x.to(device), y.to(device)
                correct += (model(x).argmax(1) == y).sum().item()
                total += y.size(0)
        print(f"epoch {epoch + 1}/{args.epochs}  val_acc={correct / max(total, 1):.3f}")

    torch.save(model.state_dict(), args.out)
    print(f"saved weights -> {args.out}")
    print("Restart the edge unit; anomaly backend will switch to 'mobilenet'.")


if __name__ == "__main__":
    main()

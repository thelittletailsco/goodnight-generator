"""Remove FLUX fake-signature watermarks from character images.
Safe to re-run: skips dark corners (night sky) and uses tight per-blob masks.

Usage:
    python3 scripts/remove_signatures.py --execute   # write back over originals
    python3 scripts/remove_signatures.py             # dry run, prints which trigger
"""
import cv2, numpy as np, sys, argparse
from pathlib import Path

DET_H_FRAC = 0.20
DET_W_FRAC = 0.24

def detect_signature_box(img, corner):
    H, W = img.shape[:2]
    bh = int(H * DET_H_FRAC); bw = int(W * DET_W_FRAC)
    if corner == "BL": cy0,cy1,cx0,cx1 = H-bh,H,0,bw
    elif corner == "BR": cy0,cy1,cx0,cx1 = H-bh,H,W-bw,W
    else: return None
    crop = img[cy0:cy1, cx0:cx1].copy()
    L,A,B = cv2.split(cv2.cvtColor(crop, cv2.COLOR_BGR2LAB))
    if L.mean() < 95: return None  # dark corner (night sky) - skip
    bA = cv2.GaussianBlur(A,(61,61),0); bB = cv2.GaussianBlur(B,(61,61),0); bL = cv2.GaussianBlur(L,(61,61),0)
    dA = np.abs(A.astype(np.int16)-bA.astype(np.int16))
    dB = np.abs(B.astype(np.int16)-bB.astype(np.int16))
    dL = np.maximum(0, bL.astype(np.int16)-L.astype(np.int16))
    delta = (dA*1.6 + dB*1.6 + dL*0.6).astype(np.uint8)
    _, th = cv2.threshold(delta, 14, 255, cv2.THRESH_BINARY)
    outer = th.copy(); outer[:bh//3, :] = 0
    if corner == "BR": outer[:, :bw//3] = 0
    elif corner == "BL": outer[:, 2*bw//3:] = 0
    nb, _, stats, _ = cv2.connectedComponentsWithStats(outer, connectivity=8)
    blobs = []; total = 0
    for i in range(1, nb):
        x,y,w,h,area = stats[i]
        if 8 < area < 1500 and w < bw*0.7 and h < bh*0.7:
            blobs.append((x,y,w,h)); total += area
    if total < 80 or not blobs: return None
    xs=[b[0] for b in blobs]; ys=[b[1] for b in blobs]
    xe=[b[0]+b[2] for b in blobs]; ye=[b[1]+b[3] for b in blobs]
    bx0,by0,bx1,by1 = min(xs),min(ys),max(xe),max(ye)
    M = 22
    bx0=max(0,bx0-M); by0=max(0,by0-M); bx1=min(bw,bx1+M); by1=min(bh,by1+M)
    return (cy0+by0, cy0+by1, cx0+bx0, cx0+bx1)

def clean_image(img):
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    triggered = []
    for c in ("BL","BR"):
        box = detect_signature_box(img, c)
        if box:
            y0,y1,x0,x1 = box
            mask[y0:y1, x0:x1] = 255
            triggered.append(c)
    if not triggered:
        return img, []
    return cv2.inpaint(img, mask, 11, cv2.INPAINT_TELEA), triggered

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="assets/characters")
    ap.add_argument("--execute", action="store_true", help="write back to disk")
    args = ap.parse_args()
    root = Path(args.root)
    n = 0; cleaned = 0
    for d in sorted(root.iterdir()):
        if not d.is_dir() or "backup" in d.name: continue
        for f in sorted(d.glob("*.jpg")):
            n += 1
            img = cv2.imread(str(f))
            if img is None: continue
            out, triggered = clean_image(img)
            if triggered:
                cleaned += 1
                if args.execute:
                    cv2.imwrite(str(f), out, [cv2.IMWRITE_JPEG_QUALITY, 92])
                print(f"[{n}] {d.name}/{f.name} {'CLEAN' if args.execute else 'WOULD-CLEAN'} {triggered}")
    print(f"\nTotal {n}, cleaned {cleaned}")

if __name__ == "__main__":
    main()

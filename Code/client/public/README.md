# Static assets

Files here are served from the site root (e.g. this folder's `logo.png` → `/logo.png`).

## Add the Campus-Sense logo

Save your logo in this folder as **`logo.png`**:

```
client/public/logo.png
```

It will automatically appear in:
- the **dashboard sidebar** (next to the "Campus-Sense" title), and
- the **browser tab** (favicon).

Tips: a **square** PNG with a **transparent background**, at least 64×64 px, looks best.
If your logo is an SVG, save it as `logo.svg` and change the two `/logo.png` references
(in `client/index.html` and `client/src/Layout.jsx`) to `/logo.svg`.

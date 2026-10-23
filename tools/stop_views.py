"""Street-level views at bus stops, for comparing the world with the stop research notes.

For each stop pole it renders four views and writes one contact sheet `stop_<code>.jpg`:
  across   - from the pole at eye height, looking across the road (the far side)
  behind   - from the far kerb, looking back at the stop and the buildings behind it
  ahead    - from the pole, looking along the direction of travel
  approach - the driver's view 45 m before the stop

usage: python3 tools/stop_views.py <game.html> <outdir> <stop code>... [--h=11] [--line=280|64]
  build a private copy first:  OUT=/path/test.html node build.mjs --dev
"""
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINE = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--line=')), '280')
ROUTE = json.load(open(os.path.join(ROOT, 'src', 'data', f'route{LINE}.json'), encoding='utf-8'))


def find_stop(code):
    for dname, d in ROUTE['directions'].items():
        for i, st in enumerate(d['stops']):
            if st['code'] == code:
                return dname, i, st, d['path']
    raise SystemExit(f'unknown stop {code}')


def tangent_at(path, x, z):
    best = None
    for (ax, az), (bx, bz) in zip(path, path[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t
        d = (px - x) ** 2 + (pz - z) ** 2
        if best is None or d < best[0]:
            L = math.sqrt(L2)
            best = (d, dx / L, dz / L, px, pz)
    return best[1:]


def views(st, path):
    x, z = st['pole']
    tx, tz, px, pz = tangent_at(path, x, z)
    # left of travel = (tz, -tx) in x-east / z-south coordinates
    lx, lz = tz, -tx
    out = {}
    out['across'] = ((x - tx * 2, 1.7, z - tz * 2), (x + lx * 30, 4.0, z + lz * 30), 70)
    fx, fz = x + lx * 16, z + lz * 16
    out['behind'] = ((fx, 1.7, fz), (x - lx * 20, 5.0, z - lz * 20), 70)
    out['ahead'] = ((x - lx * 1.0, 1.7, z - lz * 1.0), (x + tx * 60 + lx * 6, 3.0, z + tz * 60 + lz * 6), 66)
    ax, az = px - tx * 45, pz - tz * 45
    out['approach'] = ((ax, 2.4, az), (px + tx * 20 - lx * 1.5, 1.6, pz + tz * 20 - lz * 1.5), 62)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    html, out, codes = args[0], args[1], args[2:]
    os.makedirs(out, exist_ok=True)
    for code in codes:
        dname, idx, st, path = find_stop(code)
        vs = views(st, path)
        steps = []
        for name, (c, t, fov) in vs.items():
            # heights are above the terrain at each point
            js = ("(()=>{const g=__game,c=g.camera,H=(x,z)=>g.world.hf.heightAt(x,z);"
                  "document.getElementById('ui').style.display='none';"
                  "c.fov=%s;c.aspect=innerWidth/innerHeight;c.updateProjectionMatrix();"
                  "c.position.set(%s,H(%s,%s)+%s,%s);c.lookAt(%s,H(%s,%s)+%s,%s);"
                  "if(g.sky&&g.sky.follow)g.sky.follow(c.position.clone());"
                  "g.world.updateVisibility(c.position);g.world.tick(0.016);g.renderer.render();return 1})()") % (
                fov, round(c[0], 2), round(c[0], 2), round(c[2], 2), c[1], round(c[2], 2),
                round(t[0], 2), round(t[0], 2), round(t[2], 2), t[1], round(t[2], 2))
            steps.append({'eval': js, 'shot': f'{code}_{name}.jpg'})
        q = f"noloop&q={opts.get('q', 'high')}&line={LINE}&autostart=passenger&dir={dname}&stop={idx}&h={opts.get('h', '11')}"
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'shot.cjs'), html, out, q, json.dumps(steps)],
                           capture_output=True, text=True, timeout=900)
        errs = [l for l in r.stdout.splitlines() if ('error' in l.lower() or 'TIMEOUT' in l) and 'GPU stall' not in l]
        if errs:
            print('\n'.join(errs[:10]))
            sys.exit(f'page errors at stop {code}')
        tiles = [Image.open(os.path.join(out, f'{code}_{n}.jpg')).convert('RGB') for n in vs]
        w, h = 640, 360
        sheet = Image.new('RGB', (w * 2 + 6, h * 2 + 6 + 28), (16, 16, 16))
        dr = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
        except OSError:
            font = None
        dr.text((8, 5), f"{code} {st['name']} ({dname}{idx}, {st['road']})   across | behind / ahead | approach", fill=(240, 240, 240), font=font)
        for k, im in enumerate(tiles):
            sheet.paste(im.resize((w, h)), ((k % 2) * (w + 6), 28 + (k // 2) * (h + 6)))
        fn = os.path.join(out, f'stop_{code}.jpg')
        sheet.save(fn, quality=86)
        print(fn)


if __name__ == '__main__':
    main()

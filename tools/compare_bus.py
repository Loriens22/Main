"""Side-by-side check of the bus model against the user's reference photos.

Renders the bus studio scene (?scene=bus) from camera positions that match
each reference photo and writes "photo | render" images for visual review.

usage: python3 tools/compare_bus.py <game.html> <outdir> [views...]
  views: v1 v2 v3 v4 v5 (default: all)
  build a private copy first:  OUT=/path/test.html node build.mjs --dev
"""
import json, os, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'data', 'research', 'ref_photos')

# Bus local frame: x right, y up, z backwards (front bumper at z = -7.8, middle axle at 0).
# Photos 1 and 3 are taken from the front-RIGHT (door side), photo 2 from the front-left, low.
VIEWS = {
    'v1': dict(photo='user_ref_1.jpg', cam=(3.4, 1.55, -14.4), look=(-0.6, 1.55, -5.6), fov=52, doors=1, note='front-right 3/4, door 1 open'),
    'v2': dict(photo='user_ref_2.jpg', cam=(-2.4, 0.7, -12.6), look=(0.4, 2.0, -6.6), fov=58, doors=0, note='front-left, low'),
    'v3': dict(photo='user_ref_3.jpg', cam=(9.0, 1.6, -19.5), look=(-0.6, 1.5, -2.0), fov=36, doors=0, note='front-right 3/4, whole bus'),
    'v4': dict(photo='user_ref_4.jpg', cam=(0.35, 1.5, -4.4), look=(0.0, 1.15, 3.0), fov=66, doors=0, note='interior looking back'),
    'v5': dict(photo='user_ref_5.jpg', cam=(0.2, 1.68, -1.9), look=(-0.1, 1.62, -8.0), fov=66, doors=0, note='interior looking at the cab'),
}


def main():
    html, out = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(VIEWS)
    os.makedirs(out, exist_ok=True)
    for name in names:
        v = VIEWS[name]
        steps = [{'eval': f"(()=>{{ for (const d of [1,2,3,4]) __game.bus.setDoor(d, {v['doors']}); "
                          f"__game.look({','.join(map(str, v['cam']))},{','.join(map(str, v['look']))},{v['fov']}); return 1 }})()",
                  'shot': f'render_{name}.png'}]
        q = 'noloop&q=ultra&scene=bus&h=11&dest=Студентски град'
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'shot.cjs'), html, out, q, json.dumps(steps)],
                           capture_output=True, text=True, timeout=600)
        errs = [l for l in r.stdout.splitlines() if 'error' in l.lower() and 'GPU stall' not in l]
        if errs:
            print('\n'.join(errs[:10]))
        photo = Image.open(os.path.join(REF, v['photo'])).convert('RGB')
        render = Image.open(os.path.join(out, f'render_{name}.png')).convert('RGB')
        H = 600
        p = photo.resize((int(photo.width * H / photo.height), H))
        rr = render.resize((int(render.width * H / render.height), H))
        canvas = Image.new('RGB', (p.width + rr.width + 8, H), (20, 20, 20))
        canvas.paste(p, (0, 0))
        canvas.paste(rr, (p.width + 8, 0))
        fn = os.path.join(out, f'compare_{name}.jpg')
        canvas.save(fn, quality=88)
        print(fn, '-', v['note'])


if __name__ == '__main__':
    main()

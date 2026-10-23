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
    # v1-v3: pinhole cameras fitted to the photos (plate corners, grille corners, CNG diamond, lion emblem and
    # wheel contact points, see data/research/bus/exterior/after/camera_fit.md); rendered at the photo's aspect ratio
    'v1': dict(photo='user_ref_1.jpg', cam=(2.72, 1.22, -10.56), look=(-3.7, 2.41, -0.49), fov=54.5, doors=1, size='1067x800', note='front-right 3/4, door 1 open'),
    'v2': dict(photo='user_ref_2.jpg', cam=(-2.26, 0.81, -11.83), look=(1.9, 2.94, -0.77), fov=54.5, doors=0, size='1000x750', note='front-left, low'),
    'v3': dict(photo='user_ref_3.jpg', cam=(5.82, 1.44, -19.73), look=(1.54, 1.8, -8.52), fov=18.5, doors=0, size='1280x720', note='front-right 3/4, whole bus'),
    'v4': dict(photo='user_ref_4.jpg', cam=(0.35, 1.5, -4.4), look=(0.0, 1.15, 3.0), fov=66, doors=0, note='interior looking back'),
    'v5': dict(photo='user_ref_5.jpg', cam=(0.2, 1.68, -1.9), look=(-0.1, 1.62, -8.0), fov=66, doors=0, note='interior looking at the cab'),
}


def main():
    html, out = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(VIEWS)
    os.makedirs(out, exist_ok=True)
    for name in names:
        v = VIEWS[name]
        steps = [{'eval': f"(()=>{{ __game.bus.setLights({{ head: false, interior: 1 }}); for (const d of [1,2,3,4]) __game.bus.setDoor(d, {v['doors']}); "
                          f"__game.look({','.join(map(str, v['cam']))},{','.join(map(str, v['look']))},{v['fov']}); return 1 }})()",
                  'shot': f'render_{name}.png'}]
        q = 'noloop&q=ultra&scene=bus&h=11&dest=Студентски град'
        env = dict(os.environ)
        if v.get('size'):
            env['VIEWPORT'] = v['size']
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'shot.cjs'), html, out, q, json.dumps(steps)],
                           capture_output=True, text=True, timeout=600, env=env)
        errs = [l for l in r.stdout.splitlines() if ('error' in l.lower() or 'TIMEOUT' in l) and 'GPU stall' not in l]
        if errs:
            # a broken page renders the loading screen: never compare that silently
            print('\n'.join(errs[:10]))
            sys.exit(f'page errors while rendering {name} - fix them first')
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

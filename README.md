# Internet City

An open-world 3D exploration game set inside the Internet, inspired by *Ralph Breaks the Internet*. The whole game is one self-contained file: **`internet-city.html`**.

## Play

Serve the folder over http(s), then open `internet-city.html`. For example, run `python3 -m http.server` and browse to `http://localhost:8000/internet-city.html`, or use GitHub Pages. Opening the file straight from disk also works, but YouTube embeds need http(s).

The game loads three.js (r160) from a CDN on first start, so it needs an internet connection.

## Controls

| Keyboard & mouse | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click the game to capture the pointer) |
| Wheel | Zoom the camera |
| Space | Jump. With the hover pod, go up. Hold it to skip cutscenes. |
| Shift | Sprint. With the hover pod, boost. |
| E | Interact: order, enter, sit |
| F | Eat or drink the item you are holding |
| V | Summon or land the hover pod (city only) |
| C | Hover pod down |
| T | Switch between first and third person |
| G | Dance |
| M | Map |
| I | Bag |
| P | Screenshot |
| Esc | Close a panel or pause |

**Touch (phones and tablets):**
- Floating joystick on the left thumb.
- Drag on the right side to look; pinch to zoom.
- On-screen buttons: jump, use, sprint, hover pod, view, pod altitude, and eat.

**Gamepad:**
- Left stick moves; right stick looks.
- A jumps, X uses, B eats, Y calls the pod, RT sprints.

## What's inside

### Opening sequence
- Glowing platforms inside the router cables.
- The lift shaft and the router interior.
- The activation: "IP four seven eight nine eleven", then the laser, the hexagonal capsule, and the iris portal.
- A roughly 1.5 km cable flight through the data streams, ending in the city reveal.

### Central Hub
- A fountain, arrival pads, and a ring mall.
- Restaurants: McDonald's, KFC, Subway, Starbucks, Taco Bell, and Pizza Hut. Each has an interactive menu, staff who hand over your order, and food that gives you power-ups when you eat it.

### Landmarks, each with an interior
- **Snapchat:** the ghost tower.
- **Amazon:** the warehouse, with shop terminals and drones.
- **Facebook:** a café and holo computers.
- **YouTube:** the TV building, with screens and globe search.
- **TikTok:** vertical screens.
- **Google:** the mahogany desk, a waterfall pond, the quartz cube, and rainbow tunnels leading to the Search and Gemini rooms.
- **eBay:** an auction hall with bidders and an auctioneer.

### Around the city
- The **X park**, with bird-shaped trees, capybaras, and benches that open X.
- **KnowsMore:** search for anything and get redirected to it in a glass pod. Searches that match no building fall back to Google.
- Real sites load through their official embeds and public APIs. Sites that refuse to be framed open in a new tab.

### Graphics
- **Characters:** people have sculpted heads (nose, lips, eye sockets, ears) and anatomical bodies with skeletal skinning. Eyes blink and jaws move while talking. Clothing and hair have fabric and strand shading.
- **Crowd:** GPU-skinned instanced people who walk and idle, with bending knees and elbows.
- **Buildings:** curved towers (twisted, tapered, bulging, lens, blade, and setback shapes). Their curtain-wall glass reflects the sky and shows interior-mapped rooms behind it.
- **Post-processing:** HDR rendering with MSAA, SSAO, bloom, ACES tone mapping, and FXAA on medium quality.

### Settings and saving
- Quality presets from low to ultra, with adaptive resolution.
- Progress, wallet, and settings are saved in `localStorage`.

## Tips

- Walk up to KnowsMore, north of the hub, and search for anything.
- Collect the glowing data shards for credits. The gold ones sit on rooftops, so use the hover pod.
- Coffee gives you unlimited sprint for a while.

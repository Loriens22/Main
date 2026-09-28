# Internet City

An open-world 3D exploration game set inside the Internet, inspired by *Ralph Breaks the Internet*. The whole game is one self-contained file: **`internet-city.html`**.

## Play

Serve the folder over http(s), then open `internet-city.html`. For example, run `python3 -m http.server` and browse to `http://localhost:8000/internet-city.html`, or use GitHub Pages. Opening the file straight from disk also works, but YouTube embeds need http(s).

The game loads three.js (r160) from a CDN on first start, so it needs an internet connection. It also downloads real photographed HDR lighting ([Poly Haven](https://polyhaven.com), CC0) from GitHub. If that download fails, the game falls back to its procedural sky.

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
- **Crowd:** GPU-skinned instanced people who walk and idle, with bending knees and elbows and soft contact shadows.
- **Skyscrapers:** curved, twisted, tapered, bulging, lens, blade and setback towers in five facade families:
  - glass curtain wall with per-pane reflections
  - stone with recessed windows
  - metal ribbon glazing
  - deep vertical fins
  - diagrid

  Rooms are visible behind the glass through interior mapping. Towers get parapets, rooftop plant, masts, spires and podiums.
- **Central Hub:** a three-level curved arcade built from revolved profiles, with colonnades, glass balustrades and mullioned storefronts showing shop interiors. The restaurants have tiled walls, working equipment, stone counters, fabric awnings, patio umbrellas and bistro furniture.
- **Streets:** procedural trees with swaying leaves, street lamps, benches, curbs, zebra crossings, ground-level pod traffic, asphalt roads and stone paving with normal and roughness maps. Pedestrians use the sidewalks, and building facades show rain streaks and street grime.
- **Interiors:** textured oak, marble and polished-concrete floors, trim, light coves and recessed downlights.
  - The Google, Facebook, eBay and Amazon interiors are **daylit**: sun comes through glass curtain walls, casts soft shadows across the floor and shows visible light shafts, and you can see the city outside.
  - Each room is captured into its own reflection/ambient probe twice, which approximates two bounces of global illumination.
  - They also have oak slat walls, brick, exposed steel roof trusses, pendant lights and real potted trees.
- **Lighting:**
  - The city is lit by a real HDR photograph of a city square, the same image-based lighting technique Blender uses.
  - The lit city is then captured again for reflections.
  - Shadows are contact-hardening soft shadows (PCSS): sharp where objects touch the ground and softer further away. A static far shadow map covers the whole deck.
- **Camera:** depth of field in menus and cutscenes.
- **Post-processing:** HDR rendering with MSAA, SSAO, bloom, AgX tone mapping (Blender's default view transform), and FXAA on medium quality.

### Settings and saving
- Quality presets from low to ultra, with adaptive resolution.
- Progress, wallet, and settings are saved in `localStorage`.

## Tips

- Walk up to KnowsMore, north of the hub, and search for anything.
- Collect the glowing data shards for credits. The gold ones sit on rooftops, so use the hover pod.
- Coffee gives you unlimited sprint for a while.

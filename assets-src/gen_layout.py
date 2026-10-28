#!/usr/bin/env python3
"""Generates layout.json — the canonical world placement for the AgentHQ office.
Coordinates are LOGICAL pixels (16px grid, 30x18 tiles = 480x288).
The frontend renders exactly this; y-sorting by sprite baseline (y + h).
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 480, 288
T = 16

sprites = []   # {frame, sheet, x, y}  (x,y = top-left logical)
def put(sheet, frame, x, y):
    sprites.append({"sheet": sheet, "frame": frame, "x": x, "y": y})

FLOOR = {"x": 0, "y": 96, "w": W, "h": H - 96}
WALL_TOP = {"x": 0, "y": 32, "w": W, "h": 16}
WALL_FACE = {"x": 0, "y": 48, "w": W, "h": 48}

# ---- floors (tile the region) ----
floors = []
for ty in range(6, 18):
    for tx in range(0, 30):
        # wood everywhere, carpet band in the middle lounge/collab area
        carpet = 11 <= ty <= 14 and 17 <= tx <= 27
        floors.append({"frame": f"carpet_{((tx+ty)%2)}" if carpet else f"wood_{((tx*7+ty*3)%2)}",
                       "x": tx*T, "y": ty*T})
for tx in range(0, 30):
    put("tiles", "wall_face", tx*T, 48)
    put("tiles", "wall_top", tx*T, 32)

# ---- windows on the back wall ----
for wx in (40, 152, 264):
    put("tiles", "window_day", wx, 58)

# ---- wall items ----
put("furniture", "whiteboard", 196, 56)
put("furniture", "corkboard", 400, 56)

# ---- server corner (top-left) ----
put("furniture", "server_rack_0", 20, 52)
put("furniture", "server_rack_1", 42, 52)
put("furniture", "plant", 66, 64)

# ---- desks: 6 specialists along the wall + Hermes manager corner ----
# desk sprite 32x20; worker sits centered behind desk (baseline desk_y+14)
DESKS = [
    {"id": "architect",      "x": 88,  "y": 104},
    {"id": "implementation", "x": 152, "y": 104},
    {"id": "frontend",       "x": 216, "y": 104},
    {"id": "tester",         "x": 280, "y": 104},
    {"id": "debugger",       "x": 96,  "y": 168},
    {"id": "security",       "x": 168, "y": 168},
    {"id": "hermes",         "x": 384, "y": 112},
]
MONITOR_OF = {"architect": "diagram", "implementation": None, "frontend": "palette",
              "tester": "tests", "debugger": "wave", "security": "terminal", "hermes": "board"}
PROP_OF = {"architect": ["blueprint", "books"], "implementation": ["mug", "keyboard"],
           "frontend": ["swatches", "laptop"], "tester": ["checklist", "paper"],
           "debugger": ["magnifier", "mug"], "security": ["shield"],
           "hermes": ["clipboard", "paper"]}
workstations = []
for d in DESKS:
    dx, dy = d["x"], d["y"]
    put("furniture", "desk", dx, dy)
    mon = MONITOR_OF[d["id"]]
    if mon == "dual":
        pass
    if mon:
        put("furniture", f"monitor_{mon}", dx + 8, dy - 12)
    if d["id"] == "implementation":
        put("furniture", "dual_monitor", dx + 2, dy - 13)
    # chair behind desk (worker sits between chair and desk)
    put("furniture", "chair", dx + 9, dy - 20)
    # props on desk surface
    for i, pr in enumerate(PROP_OF[d["id"]]):
        put("props", pr, dx + 2 + i * 8, dy + 1)
    # status lamp + bin per desk
    put("furniture", "lamp", dx + 26, dy - 6)
    put("furniture", "bin", dx + 34, dy + 4)
    workstations.append({
        "id": d["id"], "desk": {"x": dx, "y": dy},
        "worker": {"x": dx + 8, "y": dy - 20},   # worker sprite top-left (16x24)
        "monitor": {"x": dx + 8, "y": dy - 12} if mon and d["id"] != "implementation" else {"x": dx + 2, "y": dy - 13},
    })

# ---- lounge (bottom-right) ----
put("furniture", "rug", 288, 208)
put("furniture", "couch", 300, 196)
put("furniture", "bookshelf", 440, 96)
put("furniture", "plant_big", 408, 200)
put("furniture", "cat_bed", 352, 232)
put("furniture", "box", 372, 236)

# ---- kitchenette (bottom-left) ----
put("furniture", "counter", 16, 240)
put("furniture", "coffee_machine", 22, 222)
put("furniture", "water_cooler", 70, 224)
put("furniture", "bowl_amber", 120, 250)
put("furniture", "bowl_teal", 132, 250)
put("furniture", "plant", 150, 236)

# ---- printer side-table (mid-left) ----
put("furniture", "desk", 16, 168)
put("furniture", "printer", 22, 156)
put("furniture", "plant", 448, 160)
put("furniture", "plant", 8, 130)

# ---- interactables metadata ----
interactables = [
    {"id": "corkboard", "rect": [400, 56, 36, 24], "kind": "taskboard"},
    {"id": "whiteboard", "rect": [196, 56, 40, 24], "kind": "decor"},
    {"id": "server_rack", "rect": [20, 52, 42, 28], "kind": "services"},
    {"id": "coffee_machine", "rect": [22, 222, 14, 18], "kind": "coffee"},
    {"id": "window_zone", "rect": [40, 58, 248, 28], "kind": "ambience"},
    {"id": "couch", "rect": [300, 196, 48, 20], "kind": "biscuit_spot"},
]
layout = {
    "version": 1,
    "world": {"w": W, "h": H, "tile": T, "floor": FLOOR,
              "walkable": {"x": 16, "y": 96, "w": W - 32, "h": H - 112}},
    "floors": floors,
    "sprites": sprites,
    "workstations": workstations,
    "interactables": interactables,
    "cat_routes": {
        "pixel": [[40, 130], [200, 140], [360, 150], [430, 220], [300, 250], [130, 244], [40, 130]],
        "biscuit": [[320, 214], [360, 240], [300, 244], [320, 214]]
    },
    "spawn": {"pixel": [120, 140], "biscuit": [318, 210]}
}
out = os.path.join(ROOT, "public", "assets", "gen", "layout.json")
with open(out, "w") as f:
    json.dump(layout, f)
print(f"layout.json -> {out} ({len(sprites)} sprites, {len(floors)} floor tiles, {len(workstations)} desks)")

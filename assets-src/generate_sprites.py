#!/usr/bin/env python3
"""AgentHQ original pixel-art generator.

Draws every sprite procedurally at 1x (16px grid), applies a cohesive ink
outline, then exports 3x nearest-neighbor PNGs + atlas JSON + manifest.
Deterministic: no randomness. Edit here, re-run, never edit exported PNGs.
"""
import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "gen")
os.makedirs(OUT, exist_ok=True)
S = 3  # export scale

# ---------------------------------------------------------------- palette --
INK    = (26, 28, 44, 255)
NAVY   = (35, 35, 61, 255)
SHADOW = (42, 42, 61, 255)
PLUM   = (79, 74, 115, 255)
PLUM_D = (58, 54, 88, 255)
VIOLET = (155, 93, 229, 255)
VIOLET_D = (120, 66, 184, 255)
MAGENTA= (216, 97, 201, 255)
TEAL   = (90, 208, 200, 255)
TEAL_D = (62, 158, 154, 255)
CYAN   = (107, 208, 218, 255)
AMBER  = (245, 198, 107, 255)
AMBER_D= (222, 158, 74, 255)
ORANGE = (239, 154, 77, 255)
WOOD   = (165, 105, 63, 255)
WOOD_D = (124, 75, 44, 255)
WOOD_L = (201, 141, 94, 255)
CREAM  = (242, 230, 216, 255)
PAPER  = (255, 247, 232, 255)
GREEN  = (103, 178, 111, 255)
GREEN_D= (62, 137, 72, 255)
SCREEN = (15, 21, 38, 255)
GRAY   = (107, 107, 133, 255)
GRAY_D = (73, 74, 106, 255)
TERRA  = (196, 108, 68, 255)
TERRA_D= (158, 82, 50, 255)
WHITE  = (245, 245, 250, 255)
NIGHT  = (16, 18, 31, 255)
CARPET = (74, 70, 110, 255)
CARPET_D=(60, 56, 92, 255)
WALL   = (58, 51, 80, 255)
WALL_D = (44, 39, 64, 255)
WALL_L = (87, 77, 120, 255)
GINGER = (232, 164, 100, 255)
GINGER_D=(198, 128, 66, 255)

PAL = {k: v for k, v in globals().items() if isinstance(v, tuple) and len(v) == 4}

# ---------------------------------------------------------------- helpers --
class Spr:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.im.load()

    def p(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[x, y] = c

    def r(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.p(i, j, c)

    def hline(self, x, y, w, c): self.r(x, y, w, 1, c)
    def vline(self, x, y, h, c): self.r(x, y, 1, h, c)

    def outline(self, c=INK):
        """1px ink outline around the silhouette (outside only)."""
        src = self.im.copy(); sp = src.load()
        for j in range(self.h):
            for i in range(self.w):
                if sp[i, j][3] == 0:
                    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        a, b = i+dx, j+dy
                        if 0 <= a < self.w and 0 <= b < self.h and sp[a, b][3] > 0:
                            self.p(i, j, c); break

    def shade_bottom(self, c, rows=1):
        """darken the lowest opaque rows per column (grounded look)"""
        for i in range(self.w):
            for j in range(self.h - 1, -1, -1):
                if self.px[i, j][3] > 0:
                    for k in range(rows):
                        if j - k >= 0 and self.px[i, j-k][3] > 0:
                            self.p(i, j-k, c)
                    break

    def scaled(self):
        return self.im.resize((self.w * S, self.h * S), Image.NEAREST)


FRAMES = {}   # sheet_name -> list of (frame_name, Spr)
def emit(sheet, name, spr):
    FRAMES.setdefault(sheet, []).append((name, spr))

# ------------------------------------------------------------------ tiles --
def t_wood(v):
    s = Spr(16, 16)
    base = WOOD if v == 0 else WOOD_D
    s.r(0, 0, 16, 16, base)
    for y in (5, 11):
        s.hline(0, y, 16, WOOD_D if v == 0 else (90, 55, 32, 255))
    # plank seams staggered
    sx = 6 if v == 0 else 11
    for y0 in (0, 6, 12):
        s.vline(sx, y0, 5, (140, 88, 52, 255) if v == 0 else (104, 62, 36, 255))
    s.p(3, 3, WOOD_L); s.p(12, 8, WOOD_L); s.p(7, 14, WOOD_L)
    return s

def t_carpet(v):
    s = Spr(16, 16)
    s.r(0, 0, 16, 16, CARPET if v == 0 else CARPET_D)
    for (x, y) in ((3,3),(11,2),(7,7),(2,12),(13,10),(9,14),(5,9),(14,5)):
        s.p(x, y, PLUM if v == 0 else CARPET)
    return s

def wall_face():
    s = Spr(16, 24)
    s.r(0, 0, 16, 24, WALL)
    s.hline(0, 0, 16, WALL_L)
    s.hline(0, 20, 16, PLUM_D)      # baseboard
    s.hline(0, 21, 16, (40, 35, 60, 255))
    s.vline(0, 0, 24, WALL_D); s.vline(15, 0, 24, WALL_D)
    s.r(7, 4, 2, 10, WALL_D)        # panel seam
    return s

def wall_top():
    s = Spr(16, 8)
    s.r(0, 0, 16, 8, WALL_D)
    s.hline(0, 6, 16, INK)
    s.hline(0, 0, 16, (52, 46, 76, 255))
    return s

def window(phase):
    # 24x28 wall window; phase in day/evening/night
    s = Spr(24, 28)
    s.r(0, 0, 24, 28, WOOD_D)                 # frame
    s.r(2, 2, 20, 24, WOOD)                   # inner frame
    if phase == "day":
        sky = (135, 206, 235, 255); far = (108, 160, 200, 255)
        city = PLUM; lit = []
    elif phase == "evening":
        sky = (222, 120, 96, 255); far = (150, 80, 100, 255)
        city = (52, 42, 74, 255); lit = [(5, 18), (16, 15)]
    else:
        sky = NIGHT; far = (30, 34, 58, 255)
        city = (24, 26, 44, 255)
        lit = [(4, 17), (9, 19), (15, 16), (19, 18)]
    s.r(3, 3, 18, 22, sky)                    # sky
    if phase == "day":
        s.r(5, 5, 4, 2, WHITE); s.r(13, 8, 5, 2, WHITE)     # clouds
    if phase == "night":
        for (x, y) in ((5, 5), (11, 7), (17, 4), (8, 10), (19, 9), (14, 12)):
            s.p(x, y, WHITE)
    s.r(3, 17, 18, 8, city)                   # skyline silhouette
    s.r(3, 15, 6, 2, far); s.r(12, 14, 5, 3, far); s.r(18, 16, 3, 2, far)
    for (x, y) in lit:                        # lit windows
        s.r(x, y, 1, 1, AMBER); s.r(x + 2, y + 2, 1, 1, CYAN)
    s.vline(11, 3, 22, WOOD_D); s.hline(3, 13, 18, WOOD_D)  # muntins
    s.r(10, 24, 4, 4, WOOD_L)                 # sill
    return s

def t_trim():
    s = Spr(16, 4)
    s.r(0, 0, 16, 4, WOOD_D); s.hline(0, 0, 16, WOOD_L)
    return s

for v in (0, 1):
    emit("tiles", f"wood_{v}", t_wood(v)); emit("tiles", f"carpet_{v}", t_carpet(v))
emit("tiles", "wall_face", wall_face()); emit("tiles", "wall_top", wall_top())
for ph in ("day", "evening", "night"):
    emit("tiles", f"window_{ph}", window(ph))
emit("tiles", "trim", t_trim())

# -------------------------------------------------------------- furniture --
def desk():
    s = Spr(32, 20)
    s.r(0, 2, 32, 9, WOOD)          # top
    s.hline(0, 2, 32, WOOD_L); s.hline(0, 10, 32, WOOD_D)
    s.r(1, 11, 30, 7, WOOD_D)       # front
    s.vline(15, 11, 7, (104, 62, 36, 255))  # drawer seam
    s.r(14, 13, 4, 2, AMBER_D)      # drawer handle
    s.shade_bottom((74, 44, 26, 255))
    return s
emit("furniture", "desk", desk())

def chair():
    s = Spr(14, 16)
    s.r(4, 0, 6, 3, VIOLET_D)       # backrest
    s.r(5, 3, 4, 7, VIOLET_D)       # back post
    s.hline(5, 3, 4, VIOLET)
    s.r(1, 9, 12, 4, VIOLET)        # seat
    s.hline(1, 9, 12, (176, 130, 224, 255))
    s.vline(1, 10, 3, VIOLET_D); s.vline(12, 10, 3, VIOLET_D)  # armrests
    s.vline(3, 13, 2, GRAY_D); s.vline(10, 13, 2, GRAY_D)
    s.hline(2, 15, 3, GRAY_D); s.hline(9, 15, 3, GRAY_D)
    return s
emit("furniture", "chair", chair())

def monitor(screen_kind, w=16):
    h = 14
    s = Spr(w, h)
    s.r(1, 0, w - 2, 10, GRAY_D)          # bezel
    s.r(2, 1, w - 4, 8, SCREEN)           # screen
    s.r(3, 2, w - 6, 6, (22, 30, 52, 255))
    # screen motifs (decorative only)
    if screen_kind == "code":
        for i, x in enumerate((3, 5, 4, 7, 6, 9)):
            s.vline(x, 3 + (i % 3), 3, GREEN if i % 2 else CYAN)
    elif screen_kind == "diagram":
        s.r(4, 3, 3, 2, VIOLET); s.r(9, 6, 3, 2, VIOLET)
        s.p(7, 4, TEAL); s.p(8, 5, TEAL)
    elif screen_kind == "palette":
        for i, c in enumerate((MAGENTA, AMBER, TEAL, VIOLET)):
            s.r(3 + i * 3, 4, 2, 4, c)
    elif screen_kind == "tests":
        s.hline(3, 3, 6, GREEN); s.hline(3, 5, 4, GREEN)
        s.hline(3, 7, 8, (214, 80, 80, 255))
    elif screen_kind == "wave":
        for x in range(3, 13, 2):
            s.p(x, 5 + (x // 2 % 2), CYAN)
    elif screen_kind == "terminal":
        s.r(3, 3, 8, 1, GREEN); s.r(3, 5, 5, 1, GREEN); s.p(9, 5, AMBER)
    elif screen_kind == "board":
        s.r(3, 3, 3, 2, AMBER); s.r(7, 3, 3, 2, TEAL); s.r(5, 6, 3, 2, MAGENTA)
    s.r(w // 2 - 2, 10, 4, 2, GRAY_D)     # stand
    s.r(w // 2 - 4, 12, 8, 2, GRAY)
    return s
for i, kind in enumerate(("code", "diagram", "palette", "tests", "wave", "terminal", "board")):
    emit("furniture", f"monitor_{kind}", monitor(kind))

def dual_monitor(kind="code"):
    s = Spr(30, 14)
    a = monitor(kind); b = monitor(kind)
    s.im.alpha_composite(a.im, (0, 0)); s.im.alpha_composite(b.im, (16, 0))
    return s
emit("furniture", "dual_monitor", dual_monitor())

def couch():
    s = Spr(48, 20)
    s.r(0, 2, 48, 14, PLUM)         # body
    s.r(0, 0, 6, 16, PLUM_D)        # arm L
    s.r(42, 0, 6, 16, PLUM_D)       # arm R
    s.hline(0, 0, 6, VIOLET); s.hline(42, 0, 6, VIOLET)
    s.r(6, 2, 18, 7, VIOLET)        # cushion 1
    s.r(24, 2, 18, 7, VIOLET)       # cushion 2
    s.r(6, 2, 18, 1, (176, 130, 224, 255))
    s.r(24, 2, 18, 1, (176, 130, 224, 255))
    s.r(0, 16, 48, 2, SHADOW)       # base
    s.r(2, 18, 4, 2, WOOD_D); s.r(42, 18, 4, 2, WOOD_D)
    return s
emit("furniture", "couch", couch())

def bookshelf():
    s = Spr(24, 32)
    s.r(0, 0, 24, 32, WOOD)
    s.r(2, 2, 20, 28, (118, 72, 42, 255))
    spines = (MAGENTA, TEAL, AMBER, VIOLET, GREEN, CYAN, ORANGE, PAPER)
    for row, ytop in ((0, 4), (1, 13), (2, 22)):
        x = 3
        i = row * 3
        while x < 20:
            w = 2 if (x // 2) % 2 == 0 else 3
            s.r(x, ytop, w, 7, spines[i % len(spines)])
            s.vline(x, ytop, 7, INK)
            x += w + 1; i += 1
        s.hline(2, ytop + 8, 20, WOOD)
    s.hline(0, 30, 24, INK)
    return s
emit("furniture", "bookshelf", bookshelf())

def plant(big=False):
    w, h = (14, 22) if big else (10, 16)
    s = Spr(w, h)
    px0 = (w - 8) // 2
    s.r(px0, h - 6, 8, 6, TERRA)          # pot
    s.r(px0, h - 6, 8, 1, (222, 132, 88, 255))
    cx = w // 2
    leaves = [(cx - 1, h - 12, 2, 7), (cx - 4, h - 10, 3, 5), (cx + 2, h - 10, 3, 5),
              (cx - 2, h - 14, 4, 4), (cx + 1, h - 13, 3, 3)]
    if big:
        leaves += [(cx - 5, h - 14, 3, 4), (cx + 3, h - 15, 3, 4), (cx - 1, h - 17, 3, 4)]
    for (x, y, lw, lh) in leaves:
        s.r(x, y, lw, lh, GREEN)
        s.p(x, y, GREEN_D)
    s.vline(cx, h - 12, 6, GREEN_D)
    return s
emit("furniture", "plant", plant(False)); emit("furniture", "plant_big", plant(True))

def coffee_machine():
    s = Spr(14, 18)
    s.r(0, 2, 14, 16, GRAY_D)
    s.r(1, 3, 12, 4, GRAY)
    s.r(3, 8, 8, 4, SCREEN)              # drip bay
    s.r(4, 12, 6, 2, CREAM)              # mug
    s.p(2, 13, AMBER); s.p(11, 13, AMBER) # knobs
    s.r(5, 0, 4, 2, GRAY)
    return s
emit("furniture", "coffee_machine", coffee_machine())

def water_cooler():
    s = Spr(12, 20)
    s.r(0, 6, 12, 14, GRAY_D)
    s.r(1, 7, 10, 12, GRAY)
    s.r(2, 0, 8, 7, (168, 216, 230, 255))  # bottle
    s.hline(2, 5, 8, (120, 180, 205, 255))
    s.r(3, 12, 2, 2, CYAN); s.r(7, 12, 2, 2, (214, 96, 96, 255))
    return s
emit("furniture", "water_cooler", water_cooler())

def server_rack(frame):
    s = Spr(20, 28)
    s.r(0, 0, 20, 28, (58, 60, 92, 255))
    s.r(1, 1, 18, 26, (44, 46, 72, 255))
    leds = [(TEAL, CYAN, AMBER), (AMBER, VIOLET, TEAL), (MAGENTA, TEAL, CYAN)][frame % 3]
    for row in range(3):
        y = 2 + row * 8
        s.r(2, y, 16, 7, (38, 40, 66, 255))
        s.hline(2, y + 6, 16, INK)
        for k in range(4):
            s.r(4 + k * 3, y + 2, 1, 2, leds[k % 3])
        s.r(12, y + 2, 5, 3, (28, 30, 52, 255))  # vent
    return s
for f in range(3):
    emit("furniture", f"server_rack_{f}", server_rack(f))

def whiteboard():
    s = Spr(40, 24)
    s.r(0, 0, 40, 24, WOOD_D)
    s.r(2, 2, 36, 20, PAPER)
    s.r(4, 5, 8, 6, (200, 214, 240, 255))   # faint diagram
    s.r(16, 8, 10, 8, (222, 208, 238, 255))
    s.hline(5, 15, 12, VIOLET); s.hline(20, 16, 10, TEAL)
    s.p(30, 6, MAGENTA); s.p(33, 9, AMBER)  # magnets
    s.r(36, 8, 2, 6, GRAY)                  # marker tray
    return s
emit("furniture", "whiteboard", whiteboard())

def corkboard():
    s = Spr(36, 24)
    s.r(0, 0, 36, 24, WOOD_D)
    s.r(2, 2, 32, 20, (150, 106, 62, 255))
    for (x, y, c) in ((4, 4, AMBER), (14, 6, TEAL), (24, 4, VIOLET), (9, 13, PAPER), (20, 12, MAGENTA)):
        s.r(x, y, 7, 6, c)
        s.p(x + 3, y, INK)
    return s
emit("furniture", "corkboard", corkboard())

def counter():
    s = Spr(48, 20)
    s.r(0, 0, 48, 8, WOOD_L)     # counter top
    s.hline(0, 0, 48, CREAM)
    s.r(0, 8, 48, 10, WOOD)
    s.vline(16, 8, 10, WOOD_D); s.vline(32, 8, 10, WOOD_D)
    s.r(20, 11, 8, 4, SCREEN)    # sink basin
    return s
emit("furniture", "counter", counter())

def lamp():
    s = Spr(10, 20)
    s.r(3, 0, 4, 3, AMBER_D)     # shade
    s.r(2, 2, 6, 3, AMBER)
    s.vline(4, 5, 12, GRAY_D)
    s.r(1, 17, 8, 3, GRAY_D)
    return s
emit("furniture", "lamp", lamp())

def bin():
    s = Spr(8, 10)
    s.r(1, 2, 6, 8, GRAY_D)
    s.hline(0, 1, 8, GRAY)
    s.vline(3, 3, 6, (58, 58, 84, 255))
    return s
emit("furniture", "bin", bin())

def printer():
    s = Spr(16, 12)
    s.r(0, 2, 16, 10, GRAY_D)
    s.r(1, 3, 14, 3, GRAY)
    s.r(3, 0, 10, 2, PAPER)      # paper tray
    s.r(4, 8, 8, 2, SCREEN)
    s.p(13, 4, GREEN)
    return s
emit("furniture", "printer", printer())

def rug():
    s = Spr(48, 32)
    s.r(2, 0, 44, 32, TEAL_D)
    s.r(4, 2, 40, 28, TEAL)
    s.r(8, 6, 32, 20, TEAL_D)
    for (x, y) in ((10, 8), (36, 8), (10, 22), (36, 22), (23, 15)):
        s.r(x, y, 2, 2, AMBER)
    return s
emit("furniture", "rug", rug())

def cat_bed():
    s = Spr(16, 9)
    s.r(1, 2, 14, 7, PLUM)
    s.r(2, 3, 12, 4, VIOLET_D)
    s.hline(1, 2, 14, VIOLET)
    return s
emit("furniture", "cat_bed", cat_bed())

def bowl(color):
    s = Spr(9, 5)
    s.r(0, 1, 9, 4, color)
    s.hline(1, 1, 7, CREAM)
    return s
emit("furniture", "bowl_amber", bowl(AMBER_D)); emit("furniture", "bowl_teal", bowl(TEAL_D))

def box():
    s = Spr(16, 12)
    s.r(0, 1, 16, 11, (172, 128, 80, 255))
    s.hline(0, 1, 16, (196, 152, 100, 255))
    s.hline(0, 5, 16, (140, 100, 62, 255))
    s.vline(8, 1, 4, (140, 100, 62, 255))
    return s
emit("furniture", "box", box())

# ------------------------------------------------------------------ props --
def prop_clipboard():
    s = Spr(6, 8)
    s.r(0, 0, 6, 8, WOOD_D); s.r(1, 1, 4, 6, PAPER)
    s.hline(2, 3, 2, GRAY_D); s.hline(2, 5, 3, GRAY_D)
    return s
def prop_blueprint():
    s = Spr(8, 4)
    s.r(0, 0, 8, 4, (150, 190, 230, 255)); s.hline(0, 0, 8, (190, 220, 245, 255))
    s.p(2, 2, WHITE); s.p(5, 2, WHITE)
    return s
def prop_swatches():
    s = Spr(7, 6)
    for i, c in enumerate((MAGENTA, AMBER, TEAL, VIOLET)):
        s.r(i, 1 + (i % 2), 2, 4, c)
    return s
def prop_checklist():
    s = Spr(6, 8)
    s.r(0, 0, 6, 8, PAPER)
    s.p(1, 2, GREEN); s.p(3, 2, GREEN); s.p(1, 4, GREEN)
    s.hline(1, 6, 3, GRAY_D)
    return s
def prop_magnifier():
    s = Spr(7, 7)
    s.r(1, 0, 4, 4, (168, 216, 230, 255)); s.r(1, 0, 4, 1, WHITE)
    s.vline(4, 4, 1, GRAY); s.r(5, 5, 2, 2, WOOD_D)
    return s
def prop_shield():
    s = Spr(6, 7)
    s.r(0, 0, 6, 4, (120, 150, 220, 255))
    s.r(1, 4, 4, 2, (120, 150, 220, 255))
    s.p(2, 6, (120, 150, 220, 255)); s.p(3, 6, (120, 150, 220, 255))
    s.p(2, 2, WHITE); s.p(3, 2, WHITE); s.p(2, 3, WHITE)
    return s
def prop_mug(c=CREAM):
    s = Spr(5, 5)
    s.r(0, 0, 4, 4, c); s.vline(4, 1, 2, c)
    s.r(0, 0, 4, 1, (214, 96, 96, 255) if c == CREAM else CREAM)
    return s
def prop_keyboard():
    s = Spr(10, 3)
    s.r(0, 0, 10, 3, GRAY); s.hline(0, 0, 10, (140, 140, 168, 255))
    for x in range(1, 10, 2): s.p(x, 1, GRAY_D)
    return s
def prop_books():
    s = Spr(8, 6)
    for i, c in enumerate((MAGENTA, TEAL, AMBER)):
        s.r(0, 4 - i * 2, 8 - (i % 2), 2, c)
    return s
def prop_paper():
    s = Spr(5, 6)
    s.r(0, 0, 5, 6, PAPER); s.hline(1, 2, 3, GRAY_D); s.hline(1, 4, 2, GRAY_D)
    return s
def prop_laptop():
    s = Spr(9, 6)
    s.r(1, 0, 7, 4, GRAY_D); s.r(2, 1, 5, 2, SCREEN)
    s.r(0, 4, 9, 2, GRAY)
    return s
for nm, fn in (("clipboard", prop_clipboard), ("blueprint", prop_blueprint),
               ("swatches", prop_swatches), ("checklist", prop_checklist),
               ("magnifier", prop_magnifier), ("shield", prop_shield),
               ("mug", prop_mug), ("keyboard", prop_keyboard),
               ("books", prop_books), ("paper", prop_paper), ("laptop", prop_laptop)):
    emit("props", nm, fn())

# --------------------------------------------------------------------- fx --
def fx_zzz(f):
    s = Spr(8, 8)
    w = 3 + f * 2
    s.r(2, 6 - f * 2, w, 1, CYAN)
    s.vline(2, 7 - f * 2, 1, CYAN); s.vline(2 + w - 1, 7 - f * 2, 1, CYAN)
    return s
def fx_sparkle(f):
    s = Spr(7, 7)
    c = AMBER if f == 0 else WHITE
    s.vline(3, 1 + f, 5 - f * 2, c); s.hline(1 + f, 3, 5 - f * 2, c)
    return s
def fx_exclaim():
    s = Spr(7, 9)
    s.r(2, 0, 3, 5, AMBER); s.r(2, 6, 3, 2, AMBER)
    s.vline(2, 0, 8, AMBER_D); s.vline(4, 0, 8, AMBER_D)
    return s
def fx_heart(f):
    s = Spr(7, 6)
    c = (233, 88, 138, 255)
    s.r(1, 0 + f, 2, 2, c); s.r(4, 0 + f, 2, 2, c)
    s.r(1, 2, 5, 2, c); s.r(2, 4, 3, 1 + (1 - f), c)
    return s
def fx_steam(f):
    s = Spr(5, 7)
    c = (220, 224, 236, 180)
    s.p(2 + f, 1, c); s.p(1 + f, 3, c); s.p(2 + f, 5, c); s.p(3 - f, 2, c); s.p(3 - f, 4, c)
    return s
def fx_dust():
    s = Spr(4, 4)
    for (x, y) in ((0, 2), (2, 1), (3, 3), (1, 0)):
        s.p(x, y, (200, 200, 214, 160))
    return s
def fx_puddle():
    s = Spr(12, 5)
    s.r(1, 1, 10, 3, (94, 62, 44, 255)); s.r(2, 2, 8, 2, (122, 80, 54, 255))
    s.p(0, 2, (94, 62, 44, 255)); s.p(11, 2, (94, 62, 44, 255))
    return s
def fx_paper():
    s = Spr(6, 5)
    s.r(0, 1, 6, 3, PAPER); s.p(0, 0, PAPER); s.hline(1, 2, 3, GRAY_D)
    return s
def fx_cable(f):
    s = Spr(16, 4)
    pts = [(0,2),(2,1 + f),(4,2),(6,3 - f),(8,2),(10,1 + f),(12,2),(14,2)]
    for (x, y) in pts: s.p(x, y, GRAY_D)
    return s
emit("fx", "zzz_0", fx_zzz(0)); emit("fx", "zzz_1", fx_zzz(1))
emit("fx", "sparkle_0", fx_sparkle(0)); emit("fx", "sparkle_1", fx_sparkle(1))
emit("fx", "exclaim", fx_exclaim())
emit("fx", "heart_0", fx_heart(0)); emit("fx", "heart_1", fx_heart(1))
emit("fx", "steam_0", fx_steam(0)); emit("fx", "steam_1", fx_steam(1))
emit("fx", "dust", fx_dust()); emit("fx", "puddle", fx_puddle())
emit("fx", "paperfly", fx_paper())
emit("fx", "cable_0", fx_cable(0)); emit("fx", "cable_1", fx_cable(1))

# ------------------------------------------------------------- characters --
SKINS = {"fair": (240, 200, 160, 255), "tan": (198, 139, 89, 255),
         "deep": (141, 85, 36, 255), "rich": (96, 56, 28, 255)}

LOOKS = {
    "hermes":        dict(skin="fair", hair=(46, 42, 66, 255),  style="side",  top=(114, 100, 162, 255), accent=VIOLET, glasses=False),
    "architect":     dict(skin="tan",  hair=(120, 84, 52, 255), style="flat",  top=CREAM,               accent=(120, 150, 220, 255), glasses=True),
    "implementation":dict(skin="deep", hair=(30, 28, 34, 255),  style="curly", top=TEAL_D,              accent=CYAN,   glasses=False),
    "frontend":      dict(skin="fair", hair=(224, 122, 62, 255),style="beret", top=(235, 108, 138, 255),accent=MAGENTA,glasses=False),
    "tester":        dict(skin="tan",  hair=(36, 32, 40, 255),  style="pony",  top=(134, 152, 86, 255), accent=AMBER,  glasses=False),
    "debugger":      dict(skin="fair", hair=(122, 100, 88, 255),style="messy", top=(146, 114, 90, 255),accent=GRAY,   glasses=False),
    "security":      dict(skin="rich", hair=(28, 26, 30, 255),  style="buzz",  top=(44, 52, 88, 255),   accent=CYAN,   glasses=False),
}

def draw_head(s, look, ox, oy, face="front", blink=False, wide=False):
    """head: 8x7 chibi at (ox, oy)"""
    skin = SKINS[look["skin"]]
    s.r(ox + 1, oy, 6, 7, skin)
    s.r(ox + 1, oy, 6, 1, skin)
    hair = look["hair"]
    st = look["style"]
    if st == "side":                       # manager side-part
        s.r(ox, oy, 8, 3, hair); s.r(ox, oy + 3, 2, 2, hair); s.r(ox + 6, oy + 3, 2, 1, hair)
    elif st == "flat":                     # architect neat
        s.r(ox, oy, 8, 2, hair); s.r(ox, oy + 2, 1, 2, hair); s.r(ox + 7, oy + 2, 1, 2, hair)
    elif st == "curly":
        s.r(ox, oy, 8, 3, hair)
        for dx in range(0, 8, 2): s.p(ox + dx, oy + 3, hair)
    elif st == "beret":
        s.r(ox, oy, 8, 2, hair); s.r(ox + 1, oy - 1, 5, 1, hair); s.p(ox + 5, oy - 1, MAGENTA)
        s.r(ox + 6, oy + 2, 2, 2, hair)
    elif st == "pony":
        s.r(ox, oy, 8, 3, hair); s.r(ox + 6, oy + 1, 2, 5, hair)
    elif st == "messy":
        s.r(ox, oy, 8, 2, hair)
        for (dx, dy) in ((0, 2), (2, 3), (5, 2), (7, 3)): s.p(ox + dx, oy + dy, hair)
    elif st == "buzz":
        s.r(ox + 1, oy, 6, 2, hair)
    # face
    if face == "front":
        eye = WHITE if wide else INK
        if blink:
            s.r(ox + 2, oy + 4, 1, 1, INK); s.r(ox + 5, oy + 4, 1, 1, INK)
        elif wide:
            s.r(ox + 2, oy + 4, 2, 2, WHITE); s.r(ox + 5, oy + 4, 2, 2, WHITE)
            s.p(ox + 3, oy + 5, INK); s.p(ox + 6, oy + 5, INK)
        else:
            s.p(ox + 2, oy + 4, eye); s.p(ox + 5, oy + 4, eye)
            s.p(ox + 2, oy + 3, WHITE); s.p(ox + 5, oy + 3, WHITE)
        s.p(ox + 3, oy + 6, (214, 96, 96, 255))  # mouth
    elif face == "side":
        s.p(ox + 6, oy + 4, INK)
        s.p(ox + 6, oy + 3, WHITE)
    # back view: hair covers (no face)
    if look["glasses"] and face == "front":
        s.hline(ox + 2, oy + 4, 5, (40, 40, 60, 255))
        s.p(ox + 2, oy + 4, (168, 216, 230, 255)); s.p(ox + 5, oy + 4, (168, 216, 230, 255))

def shade(c, f=0.7):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), 255)

def draw_body(s, look, ox, oy, arms="down", legmode="stand", face_dir="front"):
    top = look["top"]; acc = look["accent"]
    s.r(ox + 2, oy, 6, 8, top)             # torso
    s.hline(ox + 2, oy, 6, acc)            # collar/accent
    if arms == "down":
        s.vline(ox + 1, oy + 1, 6, shade(top) if face_dir == "side" else top)
        s.vline(ox + 8, oy + 1, 6, shade(top) if face_dir == "side" else top)
        s.p(ox + 1, oy + 7, SKINS[look["skin"]]); s.p(ox + 8, oy + 7, SKINS[look["skin"]])
    elif arms == "up":
        s.vline(ox + 1, oy - 2, 4, top); s.vline(ox + 8, oy - 2, 4, top)
        s.p(ox + 1, oy - 3, SKINS[look["skin"]]); s.p(ox + 8, oy - 3, SKINS[look["skin"]])
    elif arms == "forward":                # typing
        s.r(ox + 1, oy + 3, 2, 3, top); s.r(ox + 7, oy + 3, 2, 3, top)
        s.r(ox + 1, oy + 6, 2, 1, SKINS[look["skin"]]); s.r(ox + 7, oy + 6, 2, 1, SKINS[look["skin"]])
    elif arms == "chin":
        s.r(ox + 7, oy - 1, 1, 4, top); s.p(ox + 7, oy - 2, SKINS[look["skin"]])
        s.vline(ox + 1, oy + 1, 6, top); s.p(ox + 1, oy + 7, SKINS[look["skin"]])
    elif arms == "out":
        s.hline(ox, oy + 2, 2, top); s.hline(ox + 8, oy + 2, 2, top)
        s.p(ox, oy + 2, SKINS[look["skin"]]); s.p(ox + 9, oy + 2, SKINS[look["skin"]])
    skin = SKINS[look["skin"]]
    if legmode == "stand":
        s.r(ox + 3, oy + 8, 2, 3, NAVY); s.r(ox + 6, oy + 8, 2, 3, NAVY)
        s.r(ox + 3, oy + 11, 2, 1, INK); s.r(ox + 6, oy + 11, 2, 1, INK)
    elif legmode == "walk_a":
        s.r(ox + 2, oy + 8, 2, 3, NAVY); s.r(ox + 6, oy + 8, 2, 3, NAVY)
        s.r(ox + 1, oy + 10, 2, 1, INK); s.r(ox + 7, oy + 11, 2, 1, INK)
    elif legmode == "walk_b":
        s.r(ox + 4, oy + 8, 2, 4, NAVY); s.r(ox + 5, oy + 8, 2, 4, NAVY)
        s.r(ox + 4, oy + 11, 2, 1, INK); s.r(ox + 5, oy + 11, 2, 1, INK)
    elif legmode == "sit":
        s.r(ox + 2, oy + 8, 7, 3, NAVY)         # thighs forward
        s.r(ox + 7, oy + 11, 2, 2, NAVY)        # shins
        s.r(ox + 7, oy + 13, 2, 1, INK)
    elif legmode == "sit_b":                    # typing bob variant
        s.r(ox + 2, oy + 8, 7, 3, NAVY)
        s.r(ox + 8, oy + 11, 2, 2, NAVY)
        s.r(ox + 8, oy + 13, 2, 1, INK)

def worker_sheet(look):
    """frames: 16x24 each. Returns list of (name, Spr)."""
    frames = []
    W, H = 16, 24
    def base():
        s = Spr(W, H); return s
    # sitting at desk (facing camera-cheat): head y=6, torso y=13
    for f in (0, 1):
        s = base()
        draw_body(s, look, 4, 13, arms="forward" if f == 0 else "forward", legmode="sit")
        # shift arms 1px on bob frame
        if f == 1:
            s.r(5, 19, 2, 1, SKINS[look["skin"]]); s.r(9, 19, 2, 1, SKINS[look["skin"]])
        draw_head(s, look, 4, 6, face="front", blink=(f == 1))
        frames.append((f"sit_type_{f}", s))
    for f in (0, 1):
        s = base()
        draw_body(s, look, 4, 13, arms="forward", legmode="sit" if f == 0 else "sit_b")
        draw_head(s, look, 4, 6, face="front", blink=(f == 1))
        frames.append((f"sit_idle_{f}", s))
    # walking down (front), 4 frames
    legs = ("stand", "walk_a", "stand", "walk_b")
    for f in range(4):
        s = base()
        draw_body(s, look, 4, 12, arms="down", legmode=legs[f])
        draw_head(s, look, 4, 5, face="front")
        frames.append((f"walk_down_{f}", s))
    # walking up (back), 4 frames
    for f in range(4):
        s = base()
        draw_body(s, look, 4, 12, arms="down", legmode=legs[f])
        draw_head(s, look, 4, 5, face="back")
        frames.append((f"walk_up_{f}", s))
    # walking side (right; flip in engine for left), 4 frames
    for f in range(4):
        s = base()
        draw_body(s, look, 4, 12, arms="down", legmode=legs[f], face_dir="side")
        draw_head(s, look, 4, 5, face="side")
        frames.append((f"walk_side_{f}", s))
    # thinking, 2 frames
    for f in (0, 1):
        s = base()
        draw_body(s, look, 4, 12, arms="chin", legmode="stand")
        draw_head(s, look, 4, 5 - f, face="front")
        frames.append((f"think_{f}", s))
    # celebrate, 2 frames
    for f in (0, 1):
        s = base()
        draw_body(s, look, 4, 12 - f, arms="up", legmode="stand")
        draw_head(s, look, 4, 5 - f, face="front")
        frames.append((f"celebrate_{f}", s))
    # react (wide eyes), 1 frame
    s = base()
    draw_body(s, look, 4, 12, arms="out", legmode="stand")
    draw_head(s, look, 4, 5, face="front", wide=True)
    frames.append(("react_0", s))
    return frames

for agent, look in LOOKS.items():
    for nm, spr in worker_sheet(look):
        emit(f"agent_{agent}", nm, spr)

# -------------------------------------------------------------------- cats --
def cat_pixel():
    frames = []
    W, H = 16, 12
    BLACK = (58, 56, 74, 255); BLACK_D = (42, 40, 56, 255)
    def body(s, legphase=0, tail=0, running=False):
        # side-view cat facing right
        s.r(3, 4, 9, 5, BLACK)              # torso
        s.r(10, 2, 4, 4, BLACK)             # head
        s.r(13, 1, 1, 1, BLACK)             # ear
        s.r(11, 1, 1, 1, BLACK)             # ear 2
        s.r(3, 6, 2, 2, WHITE)              # chest
        s.r(12, 4, 1, 1, WHITE)             # muzzle
        s.p(13, 3, (245, 220, 120, 255))    # eye amber
        s.p(13, 3, (245, 220, 120, 255))
        s.p(12, 3, INK) if False else None
        # legs
        if legphase == 0:
            s.vline(4, 9, 2, BLACK); s.vline(10, 9, 2, BLACK)
        elif legphase == 1:
            s.vline(3, 9, 2, BLACK); s.vline(11, 9, 2, BLACK)
        elif legphase == 2:
            s.vline(5, 9, 2, BLACK); s.vline(9, 9, 2, BLACK)
        else:
            s.vline(4, 9, 2, BLACK); s.vline(10, 9, 2, BLACK)
        for lx in (4, 10):
            s.p(lx, 11, WHITE)              # white paws
        # tail
        ty = 3 if tail == 0 else 2
        s.p(2, ty, BLACK); s.p(1, ty + 1, BLACK); s.p(2, ty + 1, BLACK)
        s.p(0, ty + 2, BLACK)
    # walk 4
    for f in range(4):
        s = Spr(W, H); body(s, legphase=f, tail=f % 2); frames.append((f"walk_{f}", s))
    # run (stretched)
    for f in range(2):
        s = Spr(W, H); body(s, legphase=1 + f * 2, tail=1, running=True)
        if f == 0: s.r(3, 3, 9, 1, BLACK)
        frames.append((f"run_{f}", s))
    # sit (upright loaf facing right)
    for f in (0, 1):
        s = Spr(W, H)
        s.r(5, 3, 6, 8, BLACK); s.r(9, 1, 4, 4, BLACK)
        s.r(12, 0, 1, 1, BLACK)
        s.r(5, 7, 3, 4, WHITE)
        s.p(11, 2, (245, 220, 120, 255))
        if f == 1: s.r(2, 2, 3, 1, BLACK); s.p(1, 1, BLACK)   # tail flick up
        else: s.p(4, 9, BLACK)
        s.r(6, 10, 4, 1, WHITE)
        frames.append((f"sit_{f}", s))
    # loaf
    s = Spr(W, H)
    s.r(4, 5, 9, 6, BLACK); s.r(10, 3, 4, 4, BLACK)
    s.p(12, 4, (245, 220, 120, 255)); s.p(13, 4, INK)
    s.r(4, 9, 9, 1, BLACK_D)
    frames.append(("loaf_0", s))
    # pounce (crouch) 2
    for f in (0, 1):
        s = Spr(W, H)
        s.r(3, 6 - f, 9, 5, BLACK); s.r(10, 4 - f, 4, 4, BLACK)
        s.hline(3, 6 - f, 9, (84, 82, 102, 255))       # rim light
        s.hline(10, 4 - f, 4, (84, 82, 102, 255))
        s.p(13, 5 - f, (245, 220, 120, 255))
        s.vline(4, 10, 1, BLACK); s.vline(10, 10, 1, BLACK)
        s.p(2, 7 - f, BLACK); s.p(1, 8 - f, BLACK)
        frames.append((f"pounce_{f}", s))
    # sleep (curled) 2
    for f in (0, 1):
        s = Spr(W, H)
        s.r(4, 6 + f, 9, 5 - f, BLACK)
        s.r(10, 5 + f, 4, 4, BLACK)
        s.hline(4, 6 + f, 9, (84, 82, 102, 255))       # rim light
        s.hline(10, 5 + f, 4, (84, 82, 102, 255))
        s.hline(4, 10, 9, BLACK_D)
        s.p(12, 6 + f, INK)                 # closed eye
        s.r(5, 8 + f, 2, 2, WHITE)
        frames.append((f"sleep_{f}", s))
    # groom 2
    for f in (0, 1):
        s = Spr(W, H)
        s.r(4, 4, 8, 7, BLACK); s.r(8, 2, 4, 4, BLACK)
        s.p(9, 3, (245, 220, 120, 255))
        s.r(6 + f, 3, 2, 2, BLACK)          # paw to face
        s.r(4, 9, 8, 2, BLACK_D)
        frames.append((f"groom_{f}", s))
    # bat (paw out) 2
    for f in (0, 1):
        s = Spr(W, H)
        s.r(4, 4, 8, 6, BLACK); s.r(10, 2, 4, 4, BLACK)
        s.p(12, 3, (245, 220, 120, 255))
        s.r(12 + f, 5, 3, 1, BLACK)         # extended paw
        s.p(15, 4 + f, WHITE)
        s.vline(5, 10, 1, BLACK); s.vline(9, 10, 1, BLACK)
        frames.append((f"bat_{f}", s))
    return frames
for nm, spr in cat_pixel():
    emit("cat_pixel", nm, spr)

def cat_biscuit():
    frames = []
    W, H = 24, 16
    FUR = GINGER; FUR_D = GINGER_D; CREAM_B = (245, 222, 190, 255)
    def round_body(s, dy=0, breathe=0):
        s.r(3, 5 + dy + breathe, 17, 9 - breathe, FUR)
        s.r(5, 3 + dy + breathe, 13, 3, FUR)
        s.r(15, 2 + dy, 5, 5, FUR)          # head
        s.p(15, 2 + dy, FUR_D); s.p(19, 2 + dy, FUR_D)   # ears
        s.p(19, 4 + dy, (245, 220, 120, 255))            # eye
        s.p(17, 5 + dy, (198, 96, 96, 255))              # nose
        s.r(6, 12 + dy, 11, 2, CREAM_B)                  # belly
        s.r(1, 6 + dy, 2, 5, FUR)                        # tail nub
    # sleep 3 (breathing)
    for f in range(3):
        s = Spr(W, H)
        b = (0, 1, 0)[f] if f < 2 else 0
        round_body(s, breathe=b)
        s.hline(16, 4 + b, 3, FUR_D)         # closed eyes line
        s.p(18, 4 + b, INK)
        frames.append((f"sleep_{f}", s))
    # waddle 4
    legs = ((4, 14), (6, 12), (5, 13), (6, 12))
    for f in range(4):
        s = Spr(W, H)
        round_body(s)
        lx, rx = legs[f]
        s.r(lx, 13, 2, 2, FUR_D); s.r(rx, 13, 2, 2, FUR_D)
        if f % 2 == 0: s.p(0, 5, FUR); s.p(0, 6, FUR)   # tail swish
        else: s.p(0, 7, FUR)
        frames.append((f"waddle_{f}", s))
    # sit
    s = Spr(W, H)
    s.r(6, 3, 13, 11, FUR); s.r(8, 1, 11, 4, FUR)
    s.r(16, 0, 4, 3, FUR); s.p(16, 0, FUR_D); s.p(19, 0, FUR_D)
    s.p(18, 2, (245, 220, 120, 255)); s.p(17, 3, (198, 96, 96, 255))
    s.r(8, 10, 9, 4, CREAM_B)
    frames.append(("sit_0", s))
    # stretch-yawn 2
    for f in (0, 1):
        s = Spr(W, H)
        s.r(2, 8, 18, 6, FUR)
        s.r(18, 6 - f, 5, 5, FUR)
        s.p(19, 7 - f, (245, 220, 120, 255))
        if f == 1: s.r(19, 9, 3, 2, (198, 96, 96, 255))  # yawn open
        s.r(3, 6, 2, 2, FUR_D); s.r(16, 13, 2, 2, FUR_D) # front paws out
        frames.append((f"stretch_{f}", s))
    # ear twitch (from sleep) 2
    for f in (0, 1):
        s = Spr(W, H); round_body(s)
        s.hline(16, 4, 3, FUR_D); s.p(18, 4, INK)
        if f == 1: s.p(14, 1, FUR); s.p(13, 2, FUR)      # ear flick
        frames.append((f"ear_{f}", s))
    # look up
    s = Spr(W, H); round_body(s)
    s.p(19, 3, (245, 220, 120, 255)); s.p(18, 2, WHITE)
    frames.append(("look_0", s))
    return frames
for nm, spr in cat_biscuit():
    emit("cat_biscuit", nm, spr)

# ------------------------------------------------------- export + atlas ----
atlas = {"meta": {"app": "agenthq-spritegen", "scale": S}, "sheets": {}}
for sheet, items in FRAMES.items():
    # layout strip: single row (sheets are small enough)
    total_w = sum(sp.w for _, sp in items)
    max_h = max(sp.h for _, sp in items)
    strip = Spr(total_w, max_h)
    xoff = 0
    frames = {}
    for name, sp in items:
        # outline everything except tiles that tile seamlessly (wood/carpet/wall_face/trim)
        if not (sheet == "tiles" and (name.startswith(("wood_", "carpet_")) or name in ("wall_face", "trim", "wall_top"))):
            sp.outline()
        strip.im.alpha_composite(sp.im, (xoff, 0))
        frames[name] = {"x": xoff * S, "y": 0, "w": sp.w * S, "h": sp.h * S,
                        "lw": sp.w, "lh": sp.h}
        xoff += sp.w
    path = os.path.join(OUT, f"{sheet}.png")
    strip.scaled().save(path)
    atlas["sheets"][sheet] = {"file": f"assets/gen/{sheet}.png", "frames": frames}
    print(f"{sheet}.png: {len(items)} frames, {total_w}x{max_h} logical")

with open(os.path.join(OUT, "atlas.json"), "w") as f:
    json.dump(atlas, f, indent=1)

manifest = {
    "origin": "assets-src/generate_sprites.py (procedural, original)",
    "license": "MIT (original work, generated for AgentHQ)",
    "scale": S, "logical_tile": 16,
    "palette": {k: "#%02x%02x%02x" % v[:3] for k, v in PAL.items()},
    "sheets": {k: len(v) for k, v in FRAMES.items()},
}
with open(os.path.join(OUT, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=1)

# contact sheet for human/vision QA
cols = 0
row_h = []
grid = []
row = []
row_w = 0
MAXW = 640
for sheet, items in FRAMES.items():
    for name, sp in items:
        if row_w + sp.w + 2 > MAXW:
            grid.append((row, row_w)); row = []; row_w = 0
        row.append((f"{sheet}/{name}", sp)); row_w += sp.w + 2
if row: grid.append((row, row_w))
H = sum(max(sp.h for _, sp in row) + 3 for row, _ in grid) * 1
Wc = max(w for _, w in grid)
sheet_img = Image.new("RGBA", (Wc, sum(max(sp.h for _, sp in row) + 3 for row, _ in grid)), (24, 24, 38, 255))
y = 0
for row, _ in grid:
    x = 0
    rh = max(sp.h for _, sp in row)
    for name, sp in row:
        sheet_img.alpha_composite(sp.im, (x, y))
        x += sp.w + 2
    y += rh + 3
sheet_img = sheet_img.resize((Wc * 2, y * 2), Image.NEAREST)
sheet_img.save(os.path.join(ROOT, "assets-src", "preview.png"))
print("preview -> assets-src/preview.png")
print(f"total frames: {sum(len(v) for v in FRAMES.values())}")

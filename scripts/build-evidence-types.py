#!/usr/bin/env python3
"""Bake the a-lign evidence-types page into a single self-contained HTML file.

Sources (read-only inputs, not tracked in this repo):
  <EA root>/temp/evidence-types/evidence-data.js      -- content (EN/ES pairs)
  <EA root>/temp/evidence-types/images/*.png          -- generated illustrations
                                                  (or the legacy cache dir below)
Output:
  public/evidence-types/index.html  (self-contained, ~1.4 MB)

Usage:  python3 scripts/build-evidence-types.py
"""
import base64
import io
import json
import pathlib
import re
import sys

PORTAL = pathlib.Path(__file__).resolve().parent.parent
EA_ROOT = PORTAL.parent.parent
SRC = EA_ROOT / "temp" / "evidence-types"
IMGDIR = SRC / "images"
OUTDIR = PORTAL / "public" / "evidence-types"
DATAJS = SRC / "evidence-data.js"

IMAGES = [
    "hero", "direct-witness", "direct-video", "direct-confession",
    "circ-thread", "circ-path", "class-shoes", "indiv-boot",
    "class-roots", "indiv-dna",
]
ASPECT = {"hero": "3/2"}

# ---------------------------------------------------------------- image encode
try:
    from PIL import Image
except ImportError:
    Image = None


def bake_image(name: str) -> str:
    src = IMGDIR / f"{name}.png"
    if Image is None:
        return base64.b64encode(src.read_bytes()).decode()
    im = Image.open(src).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- content check
def load_data() -> dict:
    if not DATAJS.exists():
        sys.exit(f"missing content file {DATAJS}")
    js = DATAJS.read_text()
    # strip the module export shim and hand the object literal to json after
    # converting it with node (authoritative parse, not a regex guess)
    js = js.replace("if (typeof module !== 'undefined') module.exports = { DATA };", "")
    tmp = SRC / ".." / "_data_dump.js"
    tmp.write_text(js + "\nprocess.stdout.write(JSON.stringify(DATA));")
    import subprocess
    out = subprocess.run(["node", str(tmp)], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit("node parse failed: " + out.stderr[:2000])
    return json.loads(out.stdout)


def walk(node, path="DATA"):
    """Yield (path, value) for every leaf dict that has exactly en+es."""
    if isinstance(node, dict):
        if set(node.keys()) >= {"en", "es"} and all(isinstance(node[k], str) for k in ("en", "es")):
            yield path, node
            return
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{path}[{i}]")


def check_content(data: dict) -> list[str]:
    problems = []
    pairs = list(walk(data))
    if not pairs:
        problems.append("no {en,es} pairs found")
    for p, v in pairs:
        if not v["en"].strip() or not v["es"].strip():
            problems.append(f"{p}: empty string")
        for k in ("en", "es"):
            if "\u2014" in v[k]:
                problems.append(f"{p}.{k}: em dash")
            if re.search(r"\bKellen\b", v[k]):
                problems.append(f"{p}.{k}: student-facing name")
    # bucket coverage
    for bid in ("circ-indiv", "circ-class", "direct-indiv", "direct-class"):
        b = next((x for x in data["bands"]["bands"] if x["id"] == bid), None)
        if not b or len(b["items"]) < 3:
            problems.append(f"band {bid} has fewer than 3 items")
    cards = data["practice"]["cards"]
    if len(cards) != 20:
        problems.append(f"practice has {len(cards)} cards, expected 20")
    for c in cards:
        if c["src"] not in ("class", "indiv", "na"):
            problems.append(f"card {c['id']} bad src {c['src']}")
        if c["how"] not in ("direct", "circ"):
            problems.append(f"card {c['id']} bad how {c['how']}")
    for it in data["review"]["items"]:
        if not (0 <= it["a"] < len(it["opts"])):
            problems.append(f"review {it['id']} answer index out of range")
    return problems


# ---------------------------------------------------------------- html shell
def build(data: dict, imgs: dict) -> str:
    data_json = json.dumps(data, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Types of Evidence / Tipos de Evidencia</title>
<meta name="description" content="Interactive bilingual reference on direct vs circumstantial evidence and class vs individual evidence for Forensic Science.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {{
  --paper: #F4F3EF;
  --paper-card: #FBFAF7;
  --paper-deep: #EAE8E1;
  --ink: #1A1A1A;
  --ink-soft: rgba(26,26,26,.62);
  --ink-mute: rgba(26,26,26,.40);
  --dash: rgba(26,26,26,.35);
  --accent: #FF4D26;
  --accent-deep: #D33A17;
  --ok: #2F7D4F;
  --miss: #B0472A;
  --hair: 1px solid rgba(26,26,26,.14);
}}
* {{ box-sizing: border-box; }}
[hidden] {{ display: none !important; }}
html {{ scroll-behavior: smooth; }}
section.block, .hero {{ scroll-margin-top: 74px; }}
body {{
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 17px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}}
h1, h2, h3, h4 {{ font-family: 'Archivo', 'Inter', sans-serif; margin: 0; line-height: 1.08; letter-spacing: -0.02em; }}
p {{ margin: 0 0 14px; }}
a {{ color: inherit; }}
img {{ max-width: 100%; display: block; }}
.wrap {{ max-width: 1080px; margin: 0 auto; padding: 0 22px; }}
.eyebrow {{
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  letter-spacing: .18em; text-transform: uppercase; color: var(--ink-mute);
}}
.dash-box {{ border: 1px dashed var(--dash); border-radius: 10px; }}

/* topbar */
.topbar {{
  position: sticky; top: 0; z-index: 40;
  background: rgba(244,243,239,.93);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-bottom: var(--hair);
}}
.topbar .wrap {{ display: flex; align-items: center; gap: 14px; height: 58px; }}
.brand {{ display: flex; align-items: center; gap: 10px; min-width: 0; }}
.brand .sq {{ width: 9px; height: 9px; background: var(--accent); transform: rotate(45deg); flex: none; }}
.brand b {{ font-family: 'Archivo', sans-serif; font-size: 14px; font-weight: 900; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
.jumpnav {{ display: flex; gap: 4px; margin-left: auto; }}
.jumpnav a {{
  font-size: 12.5px; font-weight: 600; text-decoration: none; color: var(--ink-soft);
  padding: 7px 10px; border-radius: 7px; white-space: nowrap;
}}
.jumpnav a:hover {{ color: var(--ink); background: rgba(26,26,26,.06); }}
.jumpnav a.active {{ color: var(--accent-deep); }}
.lang-toggle {{ display: flex; border: 1.5px solid var(--ink); border-radius: 999px; overflow: hidden; flex: none; }}
.lang-toggle button {{
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 13px;
  padding: 9px 16px; min-height: 44px; color: var(--ink);
}}
.lang-toggle button.on {{ background: var(--ink); color: var(--paper); }}
html[lang="en"] .es {{ display: none !important; }}
html[lang="es"] .en {{ display: none !important; }}

/* hero */
.hero {{ padding: 46px 0 34px; border-bottom: var(--hair); }}
.hero-grid {{ display: grid; grid-template-columns: 1.15fr .85fr; gap: 40px; align-items: center; }}
.hero h1 {{ font-size: clamp(40px, 6.4vw, 72px); font-weight: 900; letter-spacing: -0.04em; margin: 14px 0 0; }}
.hero h1 .accent {{ color: var(--accent); }}
.hero-sub {{ color: var(--ink-soft); font-size: 18px; max-width: 52ch; margin-top: 16px; }}
.hero-art {{ border: 1px dashed var(--dash); border-radius: 12px; padding: 10px; background: var(--paper-card); }}
.hero-art img {{ border-radius: 6px; width: 100%; height: auto; }}
.hero-art figcaption {{ font-size: 12.5px; color: var(--ink-mute); padding: 9px 4px 1px; }}

/* sections */
section.block {{ padding: 52px 0 8px; border-bottom: var(--hair); }}
section.block:last-of-type {{ border-bottom: 0; }}
.block-head {{ margin-bottom: 26px; }}
.block-head h2 {{ font-size: clamp(27px, 3.6vw, 40px); font-weight: 900; margin: 8px 0 0; }}
.block-head .lead {{ color: var(--ink-soft); max-width: 68ch; margin-top: 12px; font-size: 17.5px; }}

/* straight route */
.route {{ display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: stretch; }}
.node {{ border: 1px dashed var(--dash); border-radius: 12px; background: var(--paper-card); padding: 22px 22px 18px; }}
.node.solid {{ border-style: solid; border-width: 1.5px; border-color: rgba(26,26,26,.5); }}
.node h3 {{ font-size: 25px; font-weight: 900; letter-spacing: -0.025em; }}
.node .sub {{ font-family: 'Inter', sans-serif; font-size: 12.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--accent-deep); margin-top: 7px; }}
.node dl {{ margin: 18px 0 0; }}
.node dt {{ font-family: 'Inter', sans-serif; font-size: 11.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-mute); margin-top: 15px; }}
.node dd {{ margin: 5px 0 0; font-size: 16px; }}
.ex-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }}
.ex {{ border-top: var(--hair); padding-top: 14px; }}
.ex figure {{ margin: 0; }}
.ex img {{ border-radius: 8px; border: 1px solid rgba(26,26,26,.1); width: 100%; }}
.ex figcaption {{ font-size: 14.5px; font-weight: 600; margin-top: 9px; line-height: 1.35; }}
.ex .note {{ font-size: 14px; color: var(--ink-soft); margin-top: 5px; line-height: 1.45; }}
.verdict {{
  margin-top: 22px; border: 1.5px dashed var(--accent); border-radius: 12px;
  padding: 18px 20px; background: rgba(255,77,38,.045);
}}
.verdict .eyebrow {{ color: var(--accent-deep); }}
.verdict p {{ margin: 8px 0 0; font-size: 17px; font-weight: 500; }}

/* fork */
.fork-wrap {{ position: relative; }}
.fork-stem {{ text-align: center; margin-bottom: 6px; }}
.fork-stem span {{ display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute); }}
.fork-line {{ height: 26px; width: 1px; background: var(--dash); margin: 0 auto 14px; }}
.fork {{ display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }}

/* bands */
.bands {{ display: grid; gap: 12px; }}
.band {{ border: 1px dashed var(--dash); border-radius: 12px; background: var(--paper-card); overflow: hidden; }}
.band.open {{ border-style: solid; border-color: rgba(26,26,26,.45); }}
.band-bar {{
  display: flex; align-items: center; gap: 16px; width: 100%; text-align: left;
  background: transparent; border: 0; padding: 18px 20px; cursor: pointer; font: inherit; color: inherit;
  transition: transform .18s ease;
}}
.band-bar:hover {{ transform: translateY(-2px); }}
.band-bar:focus-visible {{ outline: 2.5px solid var(--accent); outline-offset: -3px; }}
.band-num {{ font-family: 'Archivo', sans-serif; font-weight: 900; font-size: 13px; color: var(--accent); flex: none; width: 26px; }}
.band-name {{ font-family: 'Archivo', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }}
.band-tag {{ font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); margin-left: auto; white-space: nowrap; }}
.band-plus {{ font-size: 20px; color: var(--ink-mute); flex: none; width: 22px; text-align: center; }}
.band-body {{ padding: 0 20px 20px; }}
.band-body .line {{ font-size: 16px; color: var(--ink-soft); border-left: 2px solid var(--accent); padding-left: 14px; margin-bottom: 16px; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.chip {{ font-size: 14.5px; border: var(--hair); border-radius: 7px; padding: 7px 11px; background: rgba(255,255,255,.7); }}

/* practice */
.practice-shell {{ display: grid; grid-template-columns: 236px 1fr; gap: 26px; align-items: start; }}
.prac-list {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6px; position: sticky; top: 76px; }}
.prac-pill {{
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  border: var(--hair); background: transparent; border-radius: 8px; padding: 9px 11px;
  font: inherit; font-size: 14px; color: var(--ink-soft); cursor: pointer;
}}
.prac-pill:hover {{ border-color: var(--accent); color: var(--ink); }}
.prac-pill.on {{ background: var(--ink); color: var(--paper); border-color: var(--ink); }}
.prac-pill .dot {{ width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid currentColor; flex: none; }}
.prac-pill.done .dot {{ background: currentColor; }}
.prac-card {{ border: 1px dashed var(--dash); border-radius: 14px; background: var(--paper-card); padding: 24px; }}
.prac-item {{ font-size: 20.5px; line-height: 1.45; font-weight: 500; min-height: 3.1em; }}
.axes {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 22px; }}
.axis .eyebrow {{ display: block; margin-bottom: 9px; }}
.opts {{ display: flex; flex-wrap: wrap; gap: 8px; }}
.opt {{
  border: 1.5px solid rgba(26,26,26,.4); background: #fff; border-radius: 8px;
  padding: 11px 15px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; min-height: 44px;
  transition: border-color .15s ease, background-color .15s ease;
}}
.opt:hover {{ border-color: var(--accent); }}
.opt.sel {{ background: var(--ink); color: var(--paper); border-color: var(--ink); }}
.opt.good {{ border-color: var(--ok); border-width: 2px; }}
.opt.bad {{ border-color: var(--miss); border-width: 2px; }}
.opt:disabled {{ cursor: default; opacity: .95; }}
.prac-actions {{ display: flex; gap: 10px; align-items: center; margin-top: 22px; flex-wrap: wrap; }}
.btn {{
  font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 15px;
  border-radius: 9px; padding: 12px 20px; min-height: 46px; cursor: pointer;
  border: 1.5px solid var(--ink); background: transparent; color: var(--ink);
}}
.btn.primary {{ background: var(--accent); border-color: var(--accent); color: #fff; }}
.btn.primary:hover {{ background: var(--accent-deep); border-color: var(--accent-deep); }}
.btn.primary:disabled {{ background: rgba(26,26,26,.18); border-color: transparent; color: rgba(26,26,26,.5); cursor: not-allowed; }}
.btn.ghost {{ border-color: transparent; text-decoration: underline; text-underline-offset: 3px; }}
.btn.ghost:hover {{ color: var(--accent-deep); }}
.hint {{ font-size: 14px; color: var(--accent-deep); font-weight: 600; }}
.feedback {{ margin-top: 20px; border-top: var(--hair); padding-top: 16px; }}
.feedback .head {{ display: flex; align-items: center; gap: 10px; font-family: 'Archivo', sans-serif; font-weight: 700; font-size: 17px; }}
.feedback .mark {{ width: 22px; height: 22px; border-radius: 50%; border: 2px solid currentColor; display: grid; place-items: center; font-size: 13px; flex: none; }}
.feedback.good .head {{ color: var(--ok); }}
.feedback.part .head {{ color: var(--accent-deep); }}
.feedback.bad .head {{ color: var(--miss); }}
.feedback .answer {{ margin-top: 12px; font-size: 15px; }}
.feedback .answer b {{ font-family: 'Archivo', sans-serif; }}
.feedback .why {{ margin-top: 12px; font-size: 16.5px; }}
.prac-progress {{ font-size: 13px; color: var(--ink-mute); margin-top: 14px; font-variant-numeric: tabular-nums; }}

/* review */
.rev-grid {{ display: grid; gap: 12px; }}
.rev {{ border: var(--hair); border-radius: 11px; background: var(--paper-card); padding: 18px 20px; }}
.rev .stem {{ font-size: 16.5px; font-weight: 500; }}
.rev .opts {{ margin-top: 13px; }}
.rev .why {{ margin-top: 12px; font-size: 15px; color: var(--ink-soft); border-left: 2px solid var(--accent); padding-left: 12px; }}
.rev .why b {{ color: var(--ink); }}
.rev.answered {{ border-color: rgba(26,26,26,.3); }}

/* traps */
.traps {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
.trap {{ border: 1px dashed var(--dash); border-radius: 12px; padding: 20px; background: var(--paper-card); }}
.trap .n {{ font-family: 'Archivo', sans-serif; font-weight: 900; font-size: 12px; color: var(--accent); letter-spacing: .1em; }}
.trap h4 {{ font-size: 19px; margin: 8px 0 10px; }}
.trap p {{ font-size: 15.5px; color: var(--ink-soft); margin: 0; }}

/* footer */
footer {{ border-top: var(--hair); margin-top: 52px; padding: 26px 0 40px; color: var(--ink-mute); font-size: 13.5px; }}
footer .wrap {{ display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap; }}

@media (max-width: 900px) {{
  .hero-grid, .route, .fork, .traps, .axes, .ex-row {{ grid-template-columns: 1fr; }}
  .practice-shell {{ grid-template-columns: 1fr; }}
  .prac-list {{ position: static; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); }}
  .prac-pill{{ justify-content: center; padding: 12px 4px; min-height: 44px; font-size: 12.5px; }}
  .prac-pill .lbl {{ display: none; }}
  .jumpnav {{ display: none; }}
  .band-tag {{ display: none; }}
}}
@media print {{
  .topbar, .jumpnav, .lang-toggle, .btn, .prac-list {{ display: none !important; }}
  body {{ background: #fff; font-size: 12pt; }}
  section.block {{ break-inside: avoid-page; page-break-inside: avoid; }}
  .band-body {{ display: block !important; }}
}}
@media (prefers-reduced-motion: reduce) {{ * {{ transition: none !important; }} html {{ scroll-behavior: auto; }} }}
</style>
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <div class="brand">
      <span class="sq" aria-hidden="true"></span>
      <b><span class="en">Types of Evidence</span><span class="es">Tipos de Evidencia</span></b>
    </div>
    <nav class="jumpnav" aria-label="Sections">
      <a href="#straight" data-nav="straight"><span class="en">How it proves</span><span class="es">C&oacute;mo demuestra</span></a>
      <a href="#fork" data-nav="fork"><span class="en">Sources</span><span class="es">Fuentes</span></a>
      <a href="#bands" data-nav="bands"><span class="en">Four combos</span><span class="es">Cuatro combos</span></a>
      <a href="#practice" data-nav="practice"><span class="en">Practice</span><span class="es">Pr&aacute;ctica</span></a>
      <a href="#review" data-nav="review"><span class="en">Review</span><span class="es">Repaso</span></a>
    </nav>
    <div class="lang-toggle" role="group" aria-label="Language">
      <button type="button" data-lang="en" class="on">EN</button>
      <button type="button" data-lang="es">ES</button>
    </div>
  </div>
</header>

<main>
  <div class="hero">
    <div class="wrap hero-grid">
      <div>
        <div class="eyebrow"><span class="en">{data['meta']['kicker']['en']}</span><span class="es">{data['meta']['kicker']['es']}</span></div>
        <h1><span class="en">Two questions.<br>Every piece <span class="accent">of evidence.</span></span><span class="es">Dos preguntas.<br>Cada pieza <span class="accent">de evidencia.</span></span></h1>
        <p class="hero-sub"><span class="en">{data['meta']['sub']['en']}</span><span class="es">{data['meta']['sub']['es']}</span></p>
      </div>
      <figure class="hero-art">
        <img id="hero-img" alt="An evidence collection tray on a workbench with gloved hands sorting paper evidence envelopes">
        <figcaption><span class="en">Evidence handling: gloves on, everything logged, nothing interpreted yet.</span><span class="es">Manejo de evidencia: guantes puestos, todo registrado, nada interpretado a&uacute;n.</span></figcaption>
      </figure>
    </div>
  </div>

  <section class="block" id="straight">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['route']['kicker']['en']}</span><span class="es">{data['route']['kicker']['es']}</span></div>
        <h2><span class="en">{data['route']['title']['en']}</span><span class="es">{data['route']['title']['es']}</span></h2>
        <p class="lead"><span class="en">{data['route']['lead']['en']}</span><span class="es">{data['route']['lead']['es']}</span></p>
      </div>
      <div class="route" id="route-nodes"></div>
      <div class="verdict">
        <div class="eyebrow"><span class="en">The part most students get backwards</span><span class="es">La parte que casi todos invierten</span></div>
        <p><span class="en">{data['route']['verdict']['en']}</span><span class="es">{data['route']['verdict']['es']}</span></p>
      </div>
    </div>
  </section>

  <section class="block" id="fork">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['fork']['kicker']['en']}</span><span class="es">{data['fork']['kicker']['es']}</span></div>
        <h2><span class="en">{data['fork']['title']['en']}</span><span class="es">{data['fork']['title']['es']}</span></h2>
        <p class="lead"><span class="en">{data['fork']['lead']['en']}</span><span class="es">{data['fork']['lead']['es']}</span></p>
      </div>
      <div class="fork-wrap">
        <div class="fork-stem"><span><span class="en">Start: how many sources could this be?</span><span class="es">Inicio: &iquest;cu&aacute;ntas fuentes puede ser esto?</span></span></div>
        <div class="fork-line" aria-hidden="true"></div>
        <div class="fork" id="fork-nodes"></div>
      </div>
      <div class="verdict">
        <div class="eyebrow"><span class="en">Keep the two questions separate</span><span class="es">Mant&eacute;n las dos preguntas separadas</span></div>
        <p><span class="en">{data['fork']['verdict']['en']}</span><span class="es">{data['fork']['verdict']['es']}</span></p>
      </div>
    </div>
  </section>

  <section class="block" id="bands">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['bands']['kicker']['en']}</span><span class="es">{data['bands']['kicker']['es']}</span></div>
        <h2><span class="en">{data['bands']['title']['en']}</span><span class="es">{data['bands']['title']['es']}</span></h2>
        <p class="lead"><span class="en">{data['bands']['lead']['en']}</span><span class="es">{data['bands']['lead']['es']}</span></p>
      </div>
      <div class="bands" id="bands-list"></div>
    </div>
  </section>

  <section class="block" id="practice">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['practice']['kicker']['en']}</span><span class="es">{data['practice']['kicker']['es']}</span></div>
        <h2><span class="en">{data['practice']['title']['en']}</span><span class="es">{data['practice']['title']['es']}</span></h2>
        <p class="lead"><span class="en">{data['practice']['lead']['en']}</span><span class="es">{data['practice']['lead']['es']}</span></p>
        <p style="font-size:14px;color:var(--ink-mute);margin-top:6px;"><span class="en">{data['practiceNote']['en']}</span><span class="es">{data['practiceNote']['es']}</span></p>
      </div>
      <div class="practice-shell">
        <div class="prac-list" id="prac-list" role="tablist" aria-label="Practice items"></div>
        <div class="prac-card">
          <div class="prac-item" id="prac-item"></div>
          <div class="axes">
            <div class="axis">
              <span class="eyebrow" id="how-axis"></span>
              <div class="opts" id="how-opts" role="group"></div>
            </div>
            <div class="axis">
              <span class="eyebrow" id="src-axis"></span>
              <div class="opts" id="src-opts" role="group"></div>
            </div>
          </div>
          <div class="prac-actions">
            <button class="btn primary" id="prac-check" type="button"></button>
            <button class="btn" id="prac-next" type="button" hidden></button>
            <span class="hint" id="prac-hint" hidden></span>
          </div>
          <div class="feedback" id="prac-feedback" hidden></div>
          <div class="prac-progress" id="prac-progress"></div>
        </div>
      </div>
    </div>
  </section>

  <section class="block" id="review">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['review']['kicker']['en']}</span><span class="es">{data['review']['kicker']['es']}</span></div>
        <h2><span class="en">{data['review']['title']['en']}</span><span class="es">{data['review']['title']['es']}</span></h2>
        <p class="lead"><span class="en">{data['review']['lead']['en']}</span><span class="es">{data['review']['lead']['es']}</span></p>
      </div>
      <div class="rev-grid" id="rev-grid"></div>
    </div>
  </section>

  <section class="block" id="traps">
    <div class="wrap">
      <div class="block-head">
        <div class="eyebrow"><span class="en">{data['traps']['kicker']['en']}</span><span class="es">{data['traps']['kicker']['es']}</span></div>
        <h2><span class="en">{data['traps']['title']['en']}</span><span class="es">{data['traps']['title']['es']}</span></h2>
      </div>
      <div class="traps" id="traps-list"></div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span><span class="en">Forensic Science &middot; Mount Porter&rsquo;s Portal</span><span class="es">Ciencias Forenses &middot; Mount Porter&rsquo;s Portal</span></span>
    <span><span class="en">Review resource. Definitions follow course convention: all physical evidence is circumstantial.</span><span class="es">Recurso de repaso. Las definiciones siguen la convenci&oacute;n del curso: toda evidencia f&iacute;sica es circunstancial.</span></span>
  </div>
</footer>

<script>
const DATA = {data_json};
const IMAGES = {json.dumps(imgs)};
const root = document.documentElement;
const L = () => root.lang === 'es' ? 'es' : 'en';
const T = (o) => (o && (o[L()] ?? o.en)) || '';

/* ---------- language ---------- */
const LANG_KEY = 'evidence-types-lang';
function setLang(lang) {{
  root.lang = lang;
  document.querySelectorAll('.lang-toggle button').forEach(b => {{
    const on = b.dataset.lang === lang;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }});
  try {{ localStorage.setItem(LANG_KEY, lang); }} catch (e) {{}}
  renderDynamic();
}}
document.querySelectorAll('.lang-toggle button').forEach(b => {{
  b.addEventListener('click', () => setLang(b.dataset.lang));
}});

/* ---------- static structure ---------- */
document.getElementById('hero-img').src = IMAGES.hero;

function exCard(ex) {{
  return `<div class="ex"><figure>
    <img src="${{IMAGES[ex.img]}}" alt="" loading="lazy">
    <figcaption><span class="en">${{ex.cap.en}}</span><span class="es">${{ex.cap.es}}</span></figcaption>
    <div class="note"><span class="en">${{ex.note.en}}</span><span class="es">${{ex.note.es}}</span></div>
  </figure></div>`;
}}

function nodeHTML(n) {{
  const solid = n.tone === 'solid' ? ' solid' : '';
  const exs = (n.examples || []).map(exCard).join('');
  return `<article class="node${{solid}}">
    <h3><span class="en">${{n.name.en}}</span><span class="es">${{n.name.es}}</span></h3>
    <div class="sub"><span class="en">${{n.sub.en}}</span><span class="es">${{n.sub.es}}</span></div>
    <dl>
      <dt><span class="en">What it is</span><span class="es">Qu&eacute; es</span></dt>
      <dd><span class="en">${{n.def.en}}</span><span class="es">${{n.def.es}}</span></dd>
      <dt><span class="en">What it needs</span><span class="es">Qu&eacute; necesita</span></dt>
      <dd><span class="en">${{n.needs.en}}</span><span class="es">${{n.needs.es}}</span></dd>
    </dl>
    <div class="ex-row">${{exs}}</div>
  </article>`;
}}
document.getElementById('route-nodes').innerHTML = DATA.route.nodes.map(nodeHTML).join('');
document.getElementById('fork-nodes').innerHTML = DATA.fork.nodes.map(nodeHTML).join('');

const bandsList = document.getElementById('bands-list');
bandsList.innerHTML = DATA.bands.bands.map((b, i) => `
  <div class="band" data-band="${{b.id}}">
    <button class="band-bar" type="button" aria-expanded="false" aria-controls="band-body-${{b.id}}">
      <span class="band-num">0${{i + 1}}</span>
      <span class="band-name"><span class="en">${{b.name.en}}</span><span class="es">${{b.name.es}}</span></span>
      <span class="band-tag"><span class="en">${{b.tag.en}}</span><span class="es">${{b.tag.es}}</span></span>
      <span class="band-plus" aria-hidden="true">+</span>
    </button>
    <div class="band-body" id="band-body-${{b.id}}" hidden>
      <p class="line"><span class="en">${{b.line.en}}</span><span class="es">${{b.line.es}}</span></p>
      <div class="chips">${{b.items.map(it => `<span class="chip"><span class="en">${{it.en}}</span><span class="es">${{it.es}}</span></span>`).join('')}}</div>
    </div>
  </div>`).join('');

bandsList.querySelectorAll('.band-bar').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const band = btn.closest('.band');
    const body = band.querySelector('.band-body');
    const open = band.classList.toggle('open');
    body.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    band.querySelector('.band-plus').textContent = open ? '\u2212' : '+';
  }});
}});

document.getElementById('traps-list').innerHTML = DATA.traps.items.map((t, i) => `
  <article class="trap">
    <div class="n">${{String(i + 1).padStart(2, '0')}}</div>
    <h4><span class="en">${{t.head.en}}</span><span class="es">${{t.head.es}}</span></h4>
    <p><span class="en">${{t.body.en}}</span><span class="es">${{t.body.es}}</span></p>
  </article>`).join('');

/* ---------- practice classifier ---------- */
const P = DATA.practice;
const pracState = {{ idx: 0, picks: {{}}, checked: {{}} }};

const pracListEl = document.getElementById('prac-list');
pracListEl.innerHTML = P.cards.map((c, i) =>
  `<button class="prac-pill" type="button" role="tab" data-i="${{i}}" aria-selected="false">
     <span class="dot" aria-hidden="true"></span><span class="lbl">${{String(i + 1).padStart(2, '0')}}</span>
   </button>`).join('');

const howOptsEl = document.getElementById('how-opts');
const srcOptsEl = document.getElementById('src-opts');

howOptsEl.innerHTML = P.howOpts.map(o =>
  `<button class="opt" type="button" data-axis="how" data-v="${{o.v}}"><span class="en">${{o.label.en}}</span><span class="es">${{o.label.es}}</span></button>`).join('');
srcOptsEl.innerHTML = P.srcOpts.map(o =>
  `<button class="opt" type="button" data-axis="src" data-v="${{o.v}}"><span class="en">${{o.label.en}}</span><span class="es">${{o.label.es}}</span></button>`).join('');

function currentCard() {{ return P.cards[pracState.idx]; }}

function renderPractice() {{
  const c = currentCard();
  const st = pracState.picks[c.id] || {{}};
  const tube = pracState.checked[c.id] || null;

  document.getElementById('prac-item').innerHTML =
    `<span class="en">${{c.text.en}}</span><span class="es">${{c.text.es}}</span>`;
  document.getElementById('how-axis').innerHTML =
    `<span class="en">${{P.howAxis.en}}</span><span class="es">${{P.howAxis.es}}</span>`;
  document.getElementById('src-axis').innerHTML =
    `<span class="en">${{P.srcAxis.en}}</span><span class="es">${{P.srcAxis.es}}</span>`;

  document.querySelectorAll('.opt').forEach(btn => {{
    const axis = btn.dataset.axis, v = btn.dataset.v;
    const chosen = st[axis] === v;
    btn.classList.toggle('sel', chosen);
    btn.classList.remove('good', 'bad');
    btn.disabled = !!tube;
    if (tube) {{
      const key = axis === 'how' ? 'how' : 'src';
      const right = (tube[key] === v);
      if (right) btn.classList.add('good');
      else if (chosen) btn.classList.add('bad');
    }}
  }});

  const checkBtn = document.getElementById('prac-check');
  const nextBtn = document.getElementById('prac-next');
  const hint = document.getElementById('prac-hint');
  const fb = document.getElementById('prac-feedback');

  checkBtn.textContent = T(DATA.ui.labels.commit);
  checkBtn.hidden = !!tube;
  checkBtn.disabled = !(st.how && st.src);
  nextBtn.hidden = !tube;
  nextBtn.textContent = pracState.idx === P.cards.length - 1
    ? T({{en: 'Back to start', es: 'Volver al inicio'}})
    : T(DATA.ui.labels.next);
  hint.hidden = !!tube || !!(st.how && st.src);
  hint.textContent = T(DATA.ui.labels.hint);

  if (tube) {{
    let score = 0;
    if (st.how === tube.how) score++;
    const srcCounts = c.src !== 'na';
    if (srcCounts && st.src === tube.src) score++;
    if (c.src === 'na' && st.src === 'na') score++;
    const cls = score >= 2 ? 'good' : score === 1 ? 'part' : 'bad';
    const head = score >= 2 ? DATA.ui.labels.correct : score === 1 ? DATA.ui.labels.partial : DATA.ui.labels.wrong;
    const howLabel = P.howOpts.find(o => o.v === tube.how);
    const srcLabel = P.srcOpts.find(o => o.v === tube.src);
    let answerTxt = `<b><span class="en">${{DATA.ui.labels.answer.en}}</span><span class="es">${{DATA.ui.labels.answer.es}}</span></b>: `
      + `<span class="en">${{howLabel.label.en}} + ${{srcLabel.label.en}}</span>`
      + `<span class="es">${{howLabel.label.es}} + ${{srcLabel.label.es}}</span>`;
    if (tube.src === 'na') {{
      answerTxt += ` <span style="color:var(--ink-mute)"><span class="en">(${{DATA.ui.labels.needMore.en}})</span><span class="es">(${{DATA.ui.labels.needMore.es}})</span></span>`;
    }}
    fb.className = 'feedback ' + cls;
    fb.hidden = false;
    fb.innerHTML = `<div class="head"><span class="mark">${{score >= 2 ? '&#10003;' : score === 1 ? '&#8531;' : '&#10007;'}}</span>
        <span><span class="en">${{head.en}}</span><span class="es">${{head.es}}</span></span></div>
      <div class="answer">${{answerTxt}}</div>
      <div class="why"><span class="en">${{c.why.en}}</span><span class="es">${{c.why.es}}</span></div>`;
  }} else {{
    fb.hidden = true;
    fb.innerHTML = '';
  }}

  document.querySelectorAll('.prac-pill').forEach((p, i) => {{
    const on = i === pracState.idx;
    p.classList.toggle('on', on);
    p.setAttribute('aria-selected', on ? 'true' : 'false');
    p.classList.toggle('done', Object.keys(pracState.checked).includes(P.cards[i].id));
  }});

  const done = Object.keys(pracState.checked).length;
  document.getElementById('prac-progress').innerHTML =
    `<span class="en">${{DATA.ui.labels.progress.en}}</span><span class="es">${{DATA.ui.labels.progress.es}}</span> ${{done}} / ${{P.cards.length}}`;
}}

document.querySelectorAll('.opt').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const c = currentCard();
    if (pracState.checked[c.id]) return;
    const st = pracState.picks[c.id] || {{}};
    st[btn.dataset.axis] = btn.dataset.v;
    pracState.picks[c.id] = st;
    renderPractice();
  }});
}});

document.getElementById('prac-check').addEventListener('click', () => {{
  const c = currentCard();
  const st = pracState.picks[c.id] || {{}};
  if (!(st.how && st.src)) return;
  pracState.checked[c.id] = {{ how: c.how, src: c.src }};
  renderPractice();
}});

document.getElementById('prac-next').addEventListener('click', () => {{
  if (pracState.idx === P.cards.length - 1) {{
    pracState.idx = 0;
  }} else {{
    pracState.idx += 1;
  }}
  renderPractice();
  document.querySelector(`.prac-pill[data-i="${{pracState.idx}}"]`).scrollIntoView({{ block: 'nearest', inline: 'nearest' }});
}});

pracListEl.querySelectorAll('.prac-pill').forEach(p => {{
  p.addEventListener('click', () => {{
    pracState.idx = Number(p.dataset.i);
    renderPractice();
  }});
}});

/* ---------- review bank ---------- */
const revGrid = document.getElementById('rev-grid');
const revState = {{}};
revGrid.innerHTML = DATA.review.items.map((it, i) => `
  <article class="rev" data-rev="${{it.id}}">
    <div class="stem"><span class="en">${{it.stem.en}}</span><span class="es">${{it.stem.es}}</span></div>
    <div class="opts">${{it.opts.map((o, k) =>
      `<button class="opt" type="button" data-k="${{k}}"><span class="en">${{o.en}}</span><span class="es">${{o.es}}</span></button>`).join('')}}</div>
    <div class="why" hidden></div>
  </article>`).join('');

revGrid.querySelectorAll('.rev').forEach(card => {{
  const id = card.dataset.rev;
  const item = DATA.review.items.find(x => x.id === id);
  card.querySelectorAll('.opt').forEach(btn => {{
    btn.addEventListener('click', () => {{
      if (revState[id]) return;
      const k = Number(btn.dataset.k);
      const right = k === item.a;
      revState[id] = {{ k, right }};
      card.classList.add('answered');
      card.querySelectorAll('.opt').forEach((b, j) => {{
        b.disabled = true;
        if (j === item.a) b.classList.add('good');
        else if (j === k) b.classList.add('bad');
      }});
      const why = card.querySelector('.why');
      why.hidden = false;
      const tag = right ? DATA.review.correctTag : DATA.review.wrongTag;
      why.innerHTML = `<b><span class="en">${{tag.en}}</span><span class="es">${{tag.es}}</span></b> &middot; <span class="en">${{item.why.en}}</span><span class="es">${{item.why.es}}</span>`;
    }});
  }});
}});

/* ---------- section nav highlight ---------- */
const navLinks = Array.from(document.querySelectorAll('.jumpnav a'));
const sections = navLinks.map(a => document.getElementById(a.dataset.nav)).filter(Boolean);
if ('IntersectionObserver' in window) {{
  const io = new IntersectionObserver(entries => {{
    entries.forEach(e => {{
      if (e.isIntersecting) {{
        navLinks.forEach(a => a.classList.toggle('active', a.dataset.nav === e.target.id));
      }}
    }});
  }}, {{ rootMargin: '-45% 0px -50% 0px' }});
  sections.forEach(s => io.observe(s));
}}

/* ---------- re-render language-dependent dynamic bits ---------- */
function renderDynamic() {{
  renderPractice();
  // review cards keep their answered state; only the copy changes, which the
  // .en/.es spans already handle. Nothing else needs re-render.
}}

let startLang = 'en';
try {{ startLang = localStorage.getItem(LANG_KEY) || 'en'; }} catch (e) {{}}
setLang(startLang);
</script>
</body>
</html>
"""


def main() -> None:
    data = load_data()
    problems = check_content(data)
    if problems:
        print("CONTENT GATE FAILED")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print(f"content gate: OK  ({len(list(walk(data)))} EN/ES pairs)")

    imgs = {}
    total = 0
    for name in IMAGES:
        src = IMGDIR / f"{name}.png"
        if not src.exists():
            sys.exit(f"missing image {src}")
        b64 = bake_image(name)
        imgs[name] = b64
        total += len(b64)
        print(f"  {name:22s} {len(b64)/1024:7.1f} KB")
    print(f"images total: {total/1024/1024:.2f} MB of base64")

    html = build(data, imgs)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    out = OUTDIR / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()

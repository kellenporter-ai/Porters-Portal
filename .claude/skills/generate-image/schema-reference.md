# Nano Banana Pro 2 JSON Prompt Schema Reference

Complete field reference for structured JSON image prompts. Only include fields that have values — omit empty sections entirely.

## Root Structure

```json
{
  "user_intent": "string",
  "meta": {},
  "subject": [],
  "scene": {},
  "technical": {},
  "composition": {},
  "text_rendering": {},
  "style_modifiers": {},
  "advanced": {}
}
```

## `user_intent` (string)

A natural language summary of the full image. This is the "fallback" description the model uses alongside the structured fields.

Example: `"A confident young woman in a leather jacket standing on a rain-soaked Tokyo street at night, neon signs reflecting in puddles, shot on 35mm film"`

## `meta` (object)

Global generation settings.

| Field | Type | Values | Default |
|-------|------|--------|---------|
| `aspect_ratio` | string | `"16:9"`, `"9:16"`, `"1:1"`, `"4:3"`, `"3:4"`, `"21:9"`, `"3:2"`, `"2:3"`, `"5:4"`, `"4:5"` | `"1:1"` |
| `quality` | string | `"ultra_photorealistic"`, `"standard"`, `"raw"`, `"anime_v6"`, `"3d_render_octane"`, `"oil_painting"`, `"sketch"`, `"pixel_art"`, `"vector_illustration"` | `"ultra_photorealistic"` |
| `seed` | integer | Any integer (for reproducibility) | random |
| `steps` | integer | 10–100 | 40 |
| `guidance_scale` | float | 1.0–20.0 | 7.5 |

## `subject` (array of objects)

Each element describes a subject in the image.

### Subject Fields

| Field | Type | Values / Notes |
|-------|------|---------------|
| `id` | string | Identifier (e.g., `"hero"`, `"companion"`, `"object_1"`) |
| `type` | string | `"person"`, `"animal"`, `"cyborg"`, `"monster"`, `"statue"`, `"robot"`, `"vehicle"`, `"object"` |
| `description` | string | Key visual traits and distinguishing features |
| `name` | string | Proper name (triggers knowledge base for famous figures) |
| `age` | string | `"child"`, `"teenager"`, `"young adult"`, `"middle-aged"`, `"elderly"`, or specific like `"25 years old"` |
| `gender` | string | `"male"`, `"female"`, `"non-binary"`, `"androgynous"` |
| `position` | string | `"center"`, `"left"`, `"right"`, `"far_left"`, `"far_right"`, `"background"`, `"foreground"`, `"floating_above"`, `"sitting_on_ground"` |
| `pose` | string | Action description (e.g., `"leaning against a wall with arms crossed"`) |
| `expression` | string | `"neutral"`, `"smiling"`, `"laughing"`, `"angry"`, `"screaming"`, `"crying"`, `"seductive"`, `"stoic"`, `"surprised"`, `"tired"`, `"suspicious"`, `"pain"`, `"confident"`, `"playful"`, `"contemplative"` |

### `hair` (nested object)

| Field | Type | Values |
|-------|------|--------|
| `style` | string | `"straight"`, `"wavy"`, `"curly"`, `"coily"`, `"braided"`, `"bun"`, `"ponytail"`, `"buzz_cut"`, `"mohawk"`, `"dreadlocks"`, `"pixie"`, `"bob"`, `"long_flowing"`, `"messy"`, `"slicked_back"` |
| `color` | string | `"black"`, `"brown"`, `"blonde"`, `"red"`, `"white"`, `"gray"`, `"platinum"`, `"pink"`, `"blue"`, `"green"`, `"purple"`, `"ombre"`, `"highlighted"` |

### `clothing` (array of objects)

Each item:

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | Garment name (e.g., `"leather jacket"`, `"sundress"`, `"business suit"`) |
| `color` | string | Color description |
| `fabric` | string | `"cotton"`, `"silk"`, `"leather"`, `"denim"`, `"wool"`, `"linen"`, `"velvet"`, `"satin"`, `"mesh"`, `"latex"` |
| `pattern` | string | `"solid"`, `"striped"`, `"plaid"`, `"floral"`, `"polka_dot"`, `"camo"`, `"paisley"`, `"graphic"` |
| `fit` | string | `"tight"`, `"fitted"`, `"regular"`, `"loose"`, `"oversized"` |
| `layer` | string | `"base"`, `"mid"`, `"outer"` |
| `details` | string | Additional description (e.g., `"rolled-up sleeves"`, `"distressed hems"`) |

### `accessories` (array of objects)

Each item:

| Field | Type | Notes |
|-------|------|-------|
| `type` | string | Item name (e.g., `"sunglasses"`, `"watch"`, `"backpack"`) |
| `material` | string | `"gold"`, `"silver"`, `"leather"`, `"plastic"`, `"wood"`, `"fabric"`, `"metal"` |
| `color` | string | Color description |
| `location` | string | Where on the body (e.g., `"left wrist"`, `"around neck"`, `"in right hand"`) |

## `scene` (object)

Environment and atmosphere settings.

| Field | Type | Values / Notes |
|-------|------|---------------|
| `location` | string | Descriptive place (e.g., `"tokyo street at night"`, `"abandoned warehouse"`, `"alpine meadow"`) |
| `time` | string | `"golden_hour"`, `"blue_hour"`, `"high_noon"`, `"midnight"`, `"sunrise"`, `"sunset"`, `"twilight"`, `"pitch_black"` |
| `weather` | string | `"clear_skies"`, `"overcast"`, `"rainy"`, `"stormy"`, `"snowing"`, `"foggy"`, `"hazy"`, `"sandstorm"` |
| `background_elements` | array of strings | Specific background objects (e.g., `["neon signs", "wet pavement", "steam vents"]`) |

### `lighting` (nested object)

| Field | Type | Values |
|-------|------|--------|
| `type` | string | `"natural"`, `"studio"`, `"neon"`, `"candlelight"`, `"rim_light"`, `"volumetric"`, `"backlit"`, `"side_lit"`, `"harsh_flash"`, `"soft_diffused"`, `"dramatic_chiaroscuro"`, `"bioluminescent"` |
| `direction` | string | `"front"`, `"back"`, `"left"`, `"right"`, `"above"`, `"below"`, `"three_point"`, `"ambient"` |
| `color_temperature` | string | `"warm"`, `"cool"`, `"neutral"`, `"mixed"` |
| `intensity` | string | `"dim"`, `"soft"`, `"moderate"`, `"bright"`, `"blinding"` |

## `technical` (object)

Virtual camera and photography settings. Including these dramatically improves photorealistic output.

| Field | Type | Values / Notes |
|-------|------|---------------|
| `camera_model` | string | e.g., `"Sony A7R IV"`, `"Canon EOS R5"`, `"Hasselblad X2D"`, `"iPhone 15 Pro"`, `"Leica M11"`, `"Nikon Z9"`, `"Fujifilm X-T5"`, `"RED V-Raptor"` |
| `lens` | string | `"16mm"`, `"24mm"`, `"35mm"`, `"50mm"`, `"85mm"`, `"105mm"`, `"135mm"`, `"200mm"`, `"400mm"`, `"macro_100mm"`, `"fisheye_8mm"` |
| `aperture` | string | `"f/1.2"`, `"f/1.4"`, `"f/1.8"`, `"f/2"`, `"f/2.8"`, `"f/4"`, `"f/5.6"`, `"f/8"`, `"f/11"`, `"f/16"` |
| `shutter_speed` | string | `"1/8000"`, `"1/4000"`, `"1/2000"`, `"1/1000"`, `"1/500"`, `"1/250"`, `"1/125"`, `"1/60"`, `"1/30"`, `"1/15"`, `"1s"`, `"long_exposure_bulb"` |
| `iso` | string | `"100"`, `"200"`, `"400"`, `"800"`, `"1600"`, `"3200"`, `"6400"`, `"12800"` |
| `film_stock` | string | `"Kodak Portra 400"`, `"Kodak Ektar 100"`, `"Kodak Gold 200"`, `"Fujifilm Velvia 50"`, `"Fujifilm Pro 400H"`, `"Fujifilm Superia 400"`, `"CineStill 800T"`, `"Ilford HP5 Plus"`, `"Ilford Delta 3200"` |

### Common Camera Presets

Use these as sensible defaults when the user doesn't specify:

- **Portrait**: 85mm, f/1.4, Sony A7R IV — creamy bokeh, sharp subject
- **Landscape**: 24mm, f/8, Canon EOS R5 — everything in focus, wide view
- **Street photography**: 35mm, f/2, Leica M11 — natural perspective, some depth
- **Product / food**: macro_100mm, f/2.8, studio lighting — tight detail
- **Cinematic**: 50mm, f/1.8, RED V-Raptor — filmic depth, anamorphic feel
- **Documentary**: 35mm, f/4, Nikon Z9, Kodak Portra 400 — classic photojournalism look

## `composition` (object)

| Field | Type | Values |
|-------|------|--------|
| `framing` | string | `"extreme_close_up"`, `"close_up"`, `"medium_shot"`, `"cowboy_shot"`, `"full_body"`, `"wide_shot"`, `"extreme_wide_shot"`, `"macro_detail"` |
| `angle` | string | `"eye_level"`, `"low_angle"`, `"high_angle"`, `"dutch_angle"`, `"bird_eye_view"`, `"worm_eye_view"`, `"overhead"`, `"pov"`, `"drone_view"` |
| `focus_point` | string | `"face"`, `"eyes"`, `"hands"`, `"background"`, `"foreground_object"`, `"whole_scene"` |
| `rule` | string | `"rule_of_thirds"`, `"centered"`, `"golden_ratio"`, `"symmetrical"`, `"leading_lines"`, `"frame_within_frame"` |

## `text_rendering` (object)

Optional. Only include if text should appear in the image.

| Field | Type | Notes |
|-------|------|-------|
| `enabled` | boolean | `true` if text should appear |
| `text_content` | string | The actual text (keep under 5 words for reliability) |
| `placement` | string | `"floating_in_air"`, `"neon_sign_on_wall"`, `"printed_on_tshirt"`, `"graffiti_on_wall"`, `"chalkboard"`, `"digital_screen"`, `"book_cover"`, `"street_sign"`, `"tattoo"` |
| `font_style` | string | `"bold_sans_serif"`, `"elegant_serif"`, `"handwritten"`, `"cyberpunk_digital"`, `"vintage_typewriter"`, `"gothic"`, `"neon_glow"`, `"minimalist"` |
| `color` | string | Color description (e.g., `"glowing cyan"`, `"matte white"`, `"blood red"`) |

## `style_modifiers` (object)

| Field | Type | Notes |
|-------|------|-------|
| `medium` | string | `"photography"`, `"3d_render"`, `"oil_painting"`, `"watercolor"`, `"charcoal"`, `"pencil_sketch"`, `"digital_art"`, `"collage"`, `"mixed_media"`, `"anime"`, `"comic_book"`, `"pixel_art"`, `"vector_illustration"` |
| `aesthetic` | array of strings | e.g., `["cyberpunk", "noir"]`. Options: `"cyberpunk"`, `"steampunk"`, `"noir"`, `"minimalist"`, `"maximalist"`, `"vaporwave"`, `"cottagecore"`, `"brutalist"`, `"art_deco"`, `"art_nouveau"`, `"retro_80s"`, `"retro_70s"`, `"y2k"`, `"dark_academia"`, `"solarpunk"`, `"gothic"` |
| `color_palette` | string | `"warm_tones"`, `"cool_tones"`, `"muted_earth"`, `"vibrant_saturated"`, `"monochrome"`, `"pastel"`, `"neon"`, `"desaturated"`, `"high_contrast"`, `"complementary"` |
| `texture` | string | `"smooth"`, `"grainy"`, `"gritty"`, `"soft_focus"`, `"sharp"`, `"film_grain"`, `"noise"`, `"clean"` |
| `artist_reference` | array of strings | Artist names for style influence (e.g., `["Gregory Crewdson", "Annie Leibovitz"]`) |
| `era` | string | `"contemporary"`, `"1920s"`, `"1950s"`, `"1970s"`, `"1980s"`, `"1990s"`, `"2000s"`, `"futuristic"`, `"medieval"`, `"renaissance"`, `"victorian"` |

## `advanced` (object)

| Field | Type | Notes |
|-------|------|-------|
| `negative_prompt` | array of strings | Elements to exclude (e.g., `["blurry", "watermark", "extra fingers", "deformed"]`) |
| `magic_prompt_enhancer` | boolean | Auto-enhance with additional descriptive adjectives |
| `hdr_mode` | boolean | Balance shadows and highlights |
| `face_detail_enhancer` | boolean | Improve facial detail and consistency |

### Recommended Negative Prompts

Always include these as a baseline for photorealistic images:
```json
"negative_prompt": ["blurry", "watermark", "text overlay", "deformed", "extra limbs", "low quality", "jpeg artifacts", "oversaturated"]
```

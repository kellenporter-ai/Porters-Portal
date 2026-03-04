---
name: generate-image
description: Use when someone asks to generate an image, create a picture, make an image prompt, build an image prompt for Nano Banana Pro 2, or needs a detailed JSON image prompt.
disable-model-invocation: true
argument-hint: "[subject or scene description]"
---

## What This Skill Does

Conversational image prompt builder that outputs structured JSON for Nano Banana Pro 2 (Gemini) image generation. Guides the user through detailed discovery to produce highly realistic, precisely controlled image prompts.

The JSON format reduces token confusion by explicitly categorizing elements (subject, lighting, composition, etc.), resulting in cleaner images with better consistency.

## Steps

### 1. Establish the Concept

If `<ARGUMENTS>` is provided, use it as the starting concept and skip to step 2.

Otherwise, ask: "What do you want this image to depict? Give me a rough idea — I'll help you refine it."

### 2. Subject Discovery

Ask about the main subject(s) in the image. For each subject, gather:

- **Type**: person, animal, object, vehicle, robot, etc.
- **Description**: key visual traits, distinguishing features
- **Pose / action**: what are they doing?
- **Expression**: mood, emotion on their face (if applicable)
- **Clothing**: specific garments, colors, fabrics, fit
- **Accessories**: items they're wearing or holding
- **Hair** (if person): style, color, length
- **Age**: approximate age or range

Don't ask every field individually — read the user's initial description and only ask about details they haven't covered. Group related questions together (e.g., "Tell me about their appearance — clothing, hair, expression").

### 3. Scene & Environment

Ask about the setting:

- **Location**: where is this taking place?
- **Time of day**: golden_hour, blue_hour, high_noon, midnight, sunrise, sunset, twilight
- **Weather**: clear, overcast, rainy, foggy, snowy, stormy, etc.
- **Lighting**: type (natural, studio, neon, candlelight, rim_light, volumetric) and direction
- **Background elements**: specific objects or features in the background
- **Mood / atmosphere**: the overall feeling

### 4. Style & Technical Settings

Ask about the visual style:

- **Medium**: photography, 3d_render, oil_painting, watercolor, anime, pixel_art, vector_illustration, etc.
- **Camera model** (if photography): e.g., Sony A7R IV, Canon R5, iPhone 15 Pro, Hasselblad X2D
- **Lens**: focal length (16mm wide to 400mm telephoto, macro, fisheye)
- **Aperture**: f/1.2 (dreamy bokeh) to f/16 (everything sharp)
- **Film stock** (optional): Kodak Portra 400, Fujifilm Velvia 50, CineStill 800T, Ilford HP5
- **Quality preset**: ultra_photorealistic, raw, anime_v6, 3d_render_octane, sketch

If the user isn't technical about cameras, suggest sensible defaults based on their described scene (e.g., portrait = 85mm f/1.4, landscape = 24mm f/8, street = 35mm f/2).

### 5. Composition

Ask about framing and camera work:

- **Framing**: extreme_close_up, close_up, medium_shot, cowboy_shot, full_body, wide_shot, extreme_wide_shot, macro_detail
- **Camera angle**: eye_level, low_angle, high_angle, dutch_angle, bird_eye_view, worm_eye_view, overhead, pov, drone_view
- **Focus point**: face, eyes, hands, background, foreground_object, whole_scene
- **Aspect ratio**: 16:9, 9:16, 1:1, 4:3, 3:2, 4:5, 21:9

### 6. Text in Image (Optional)

Ask: "Should there be any text visible in the image? (e.g., a sign, neon text, text on clothing)"

If yes, gather: text content (keep under 5 words), placement, font style, and color.

### 7. Review & Refine

Present a natural-language summary of the image before generating JSON:

> **Your image:** [2-3 sentence vivid description of what the final image will look like, incorporating all gathered details]

Ask: "Does this match your vision? Anything to adjust?"

Make changes if requested. Only proceed to JSON generation once the user confirms.

### 8. Generate JSON Output

Build the complete JSON prompt using the schema in [schema-reference.md](schema-reference.md).

**Example output** (portrait of a mechanic):

```json
{
  "user_intent": "A weathered female mechanic in her 40s leaning against a vintage muscle car in a sunlit garage, wiping grease from her hands with a red shop rag, shot on a Canon R5 with an 85mm lens at f/1.8",
  "meta": {
    "quality_preset": "ultra_photorealistic",
    "guidance_scale": 7.5,
    "steps": 40
  },
  "subject": [
    {
      "type": "person",
      "description": "Weathered female mechanic, early 40s, confident expression",
      "pose": "Leaning against car fender, wiping hands with red shop rag",
      "expression": "Satisfied half-smile, eyes squinting slightly",
      "clothing": "Faded navy coveralls, sleeves rolled to elbows, steel-toe boots",
      "hair": "Dark brown, pulled back in a messy bun with loose strands",
      "age": "early 40s"
    }
  ],
  "scene": {
    "location": "Cluttered independent auto repair garage",
    "time_of_day": "golden_hour",
    "lighting": { "type": "natural", "direction": "side", "notes": "Golden light streaming through open garage door" },
    "background_elements": ["Tool pegboard", "Vintage muscle car (1969 Camaro)", "Oil stains on concrete floor"],
    "mood": "Warm, authentic, hardworking"
  },
  "technical": {
    "camera_model": "Canon EOS R5",
    "lens": "85mm",
    "aperture": "f/1.8"
  },
  "composition": {
    "framing": "medium_shot",
    "camera_angle": "eye_level",
    "focus_point": "eyes",
    "aspect_ratio": "3:2"
  }
}
```

Rules for the JSON:
- Only include fields that have values. Omit empty or unused sections entirely.
- No comments in the JSON output.
- No trailing commas.
- Use the exact enum values from the schema reference (don't invent new ones).
- `user_intent` should be a rich, descriptive sentence summarizing the full image.

### 9. Save and Display

1. Save the JSON to `/home/kp/Desktop/ImagePrompts/[descriptive-kebab-case-name].json`
2. Display the full JSON in chat so the user can copy-paste it directly into Gemini / AI Studio
3. Tell the user: "Saved to `/home/kp/Desktop/ImagePrompts/[filename].json`. Copy the JSON above and paste it as your prompt in Gemini."

## Conversation Style

- Be efficient. Don't ask one question at a time — group related questions.
- After the user's first description, identify what's already covered and only ask about gaps.
- Suggest sensible defaults for technical settings when the user isn't specific.
- Use plain language, not jargon. If you mention a technical term (like "bokeh"), briefly explain it.
- The goal is 2-4 exchanges before generating the JSON, not 10 rounds of questions.

## Notes

- The JSON prompt format works by reducing ambiguity for the image model. Each field is a distinct control.
- For photorealistic images, always include camera/lens/aperture settings — they dramatically affect output quality.
- `guidance_scale` around 7-8 is good for most use cases. Higher (12+) for strict adherence, lower (4-5) for creative freedom.
- `steps` of 40 is a good default. Higher for complex scenes, lower for simple compositions.
- If the user wants to iterate on a previous prompt, read the saved JSON file and modify it rather than starting from scratch.

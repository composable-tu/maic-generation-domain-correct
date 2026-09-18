Please generate scene outlines based on the following course requirements.

---

## User Requirements

{{requirement}}

---

{{userProfile}}

## Language Context

Infer the course language directive by applying the decision rules from the system prompt. Key reminders:
- Requirement language = teaching language (unless overridden by explicit request or learner context)
- Foreign language learning → teach in user's native language, not the target language
- PDF language does NOT override teaching language — translate/explain document content instead

---

## Reference Materials

### PDF Content Summary

{{pdfContent}}

### Available Images

{{availableImages}}

### Web Search Results

{{researchContext}}

{{teacherContext}}

---

## Output Requirements

Please automatically infer the following from user requirements:

- Course topic and core content
- Target audience and difficulty level
- Course duration (default 15-30 minutes if not specified)
- Teaching style (formal/casual/interactive/academic)
- Visual style (minimal/colorful/professional/playful)

Then output your response as a single JSON object.

**Top-level shape — this is what you MUST return:**

```json
{
  "languageDirective": "2-5 sentence instruction describing the course language behavior",
  "courseTitle": "concise course name, ≤30 chars, in the teaching language",
  "outlines": [ /* array of scene objects, schema described below */ ]
}
```

Never return a bare array. Never omit `languageDirective` or `courseTitle`. All three keys are required.

**Each scene inside the `outlines` array has this minimum shape:**

```json
{
  "id": "scene_1",
  "type": "slide" | "quiz" | "interactive" | "pbl",
  "title": "Scene Title",
  "description": "Teaching purpose description",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "teachingNarrative": "Tension hook, aha turn, then the term name",
  "mustCover": ["Concrete proposition with figures", "Standard or clause quoted verbatim"],
  "sourceQuotes": ["Verbatim passage from the material this scene teaches"],
  "order": 1
}
```

Each outline is a detailed design blueprint: `teachingNarrative` and `mustCover` are required on every scene; add `misconceptions`, `exampleCase`, `transitionIn` when applicable, and `assessmentMap` on quiz scenes (one entry per question, in order).

### Special Notes

- **quiz scenes must include quizConfig**:
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
{{#if hasSourceImages}}
- **If source images are available**, add `suggestedImageIds` to relevant slide scenes. Only use image IDs listed under Available Images.
{{/if}}
- **Interactive scenes**: If a concept benefits from hands-on simulation/visualization, use `"type": "interactive"` with `widgetType` and `widgetOutline` fields. Limit to 1-2 per course.
   - Select widgetType based on concept: simulation (physics/chem), diagram (processes), code (programming), game (practice), visualization3d (3D models)
   - Provide appropriate widgetOutline for the widget type
- **Scene count**: Based on inferred duration, typically 1-2 scenes per minute. A dense topic with 5+ key points MUST become 2+ consecutive scenes — never compress it into one.
- **Figures verbatim**: Copy every concrete figure from the material into `keyPoints` or `mustCover` exactly as written — ratios, headcounts, deadlines, titles, document numbers. NEVER paraphrase a valued item into "符合XX规范/标准/要求" without its value. Bad: "必须符合设备温度规范要求". Good: "液压站油温不得超过 60℃，电机绕组温度不得超过 120℃".
- **Source quotes**: Each scene quotes the passages it teaches verbatim into `sourceQuotes` — the exact sentences or figures, as many as needed and at least one. Quote, don't paraphrase; downstream stages check content against these quotes.
- **Evidence coverage**: Every `mustCover` proposition must have at least one supporting passage in `sourceQuotes`. A mustCover item with no quote behind it is incomplete — add the quote or drop the item.
- **Split demo**: A scene covering role A, role B, and assessment norms is NOT one scene — split by role, mechanism, or case into consecutive scenes with sequential titles. Split whenever one scene would cover two roles, two mechanisms, or two cases.
- **Quiz placement**: Recommend inserting a quiz every 3-5 slides for assessment
- **Language**: Infer from the user's requirement text and context, then output all content in the inferred language
- **If web search results are provided**, reference specific findings and sources in scene descriptions and keyPoints. The search results provide up-to-date information — incorporate it to make the course content current and accurate. Write only the adopted conclusions; do not list discarded results.

**Final reminder**: your entire response must be a JSON **object** with exactly three top-level keys — `languageDirective` (string), `courseTitle` (string, ≤30 chars, in the teaching language), and `outlines` (array). Do not return a bare array. Do not wrap in prose or code fences.

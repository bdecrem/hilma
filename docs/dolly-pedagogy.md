# Dolly: a map of what you can say, behind a conversation

*Research and proposal, 2026-10-10. For thinking through how Dolly gets a pedagogy (levels, a tree of what the learner knows, steering) without losing what makes it work: one text, one call, three things, ten cards.*

## 0. The question

Dolly today is a good conversation that happens every day. It remembers words and fixes and brings them back, which is a loop, but it has no idea of *where you are* or *where you are going*. Two people who have used it for sixty days could have had sixty pleasant chats and learned very different amounts, and neither of them could tell you what they can now do that they couldn't before.

What we want:

- A small number of **levels** of proficiency, roughly the same across languages, each made of vocabulary, grammar, and listening/speaking.
- A **tree** of that, kept up to date from the conversations themselves.
- A place where the learner can **see** how far along they are.
- The app using the tree to **steer** the conversations toward the gaps, or a secondary mode where the gaps get worked on.

And the constraint that matters most: it stays a chat-driven app. No lesson smell.

The short answer this document argues for: **eight levels built from "can-dos", a tree the app keeps privately, a conversation that stays a conversation because the tree is the tutor's lesson plan and never the learner's homework, and one number on the map.**

## 1. What the field already knows

### 1.1 Levels: use the CEFR, and borrow its inventories

The Common European Framework (CEFR) is the one scale everyone agrees on: six bands, A1 to C2, described as language-agnostic *can-do* statements ("can describe past activities and personal experiences"). It is how Duolingo structures its path (one CEFR level per section: A1, A2, B1, B2), how exams are graded, how textbooks are sold. Pearson's Global Scale of English goes further and puts a learning objective on every integer of a 10–90 scale, mapped onto the CEFR (A1 is 22–29, A2 30–35, B1 43–50, B2 59–66), with the objectives grouped per skill into accuracy, interaction, complexity, strategies. That granularity is what makes progress *visible* inside a band, which is exactly our problem: nobody wants to be "A2" for eight months.

The bands are abstract; the content is per language, and for our two languages it has been written down by the people who own the language:

- **Spanish:** the *Plan Curricular del Instituto Cervantes* (PCIC) specifies, per CEFR level, the grammar, pronunciation, functions, pragmatic strategies, general and specific notions (that is, vocabulary by semantic field) and cultural references. It is the syllabus every Spanish course derives from, and it is public.
- **Mandarin:** HSK 3.0 (2021, exams from 2026) is nine levels in three stages with cumulative word lists (300 at level 1, 500 at 2, 1,000 at 3, 2,000 at 4, about 5,400 by 6, 11,000 by 9), 3,000 characters and 572 grammar items, aligned to the CEFR (1 ≈ A1, 7–9 ≈ C1–C2).
- **English** (if ever): the Cambridge English Vocabulary Profile and English Grammar Profile, both level-tagged.

So we do not invent levels. We take the CEFR as the spine, split each band in two for visible progress (A1.1, A1.2, A2.1, A2.2, B1.1, B1.2, B2.1, B2.2), and fill them from the PCIC and HSK inventories. Eight levels, A1 to B2. C1/C2 are "beyond Dolly" for now; a three-minute daily call is not how you get from B2 to C1 anyway, and B2 is the honest definition of "I can hold a conversation", which is the promise.

### 1.2 Vocabulary: frequency is the ladder

Vocabulary research has one robust number: **2,000–3,000 word families cover about 95% of everyday spoken language** (Nation; van Zeeland & Schmitt), which is enough to follow a conversation; 6,000–7,000 reach 98%. The first 1,000 do most of the work. This gives a vocabulary ladder that is nearly the same shape in every language: roughly 300 words at A1.1, 600 at A1.2, 1,000 at A2, 2,000 at B1, 3,500 at B2, cumulative, which is also, not by accident, HSK's curve.

Two refinements from the lexical side:

- **Chunks are words.** "Qué gusto", "había mucha gente", "¿me puedes repetir?" are learned as units and are worth more than their parts (Lewis's lexical approach). Dolly's "three things" already treats a phrase as an item. Keep that.
- **Receptive before productive.** You understand a word long before you can say it. Every item has three states: heard and understood, used with help, used on your own. The tree must distinguish these or it will claim you know things you only recognize.

### 1.3 Grammar: there is an order, and you can't skip it

The strongest finding in second-language acquisition for our purposes is Pienemann's processability theory and its **teachability hypothesis**: grammatical structures emerge in a predictable sequence, stages cannot be skipped by instruction, and instruction works when it targets *the next stage*, the one the learner is ready for. For Spanish the sequence (Johnston's stages, refined since) runs roughly: single words and formulas → subject-verb present, basic agreement → periphrastic future (*voy a*) and *gustar* → preterite of regular verbs → preterite/imperfect contrast → object pronouns, reflexives in all persons → subjunctive in fixed triggers → subjunctive more broadly, conditional.

Two consequences:

1. **The frontier matters, not the gap list.** Steering means working one step ahead of where the learner is, never three. A beginner who gets subjunctive drills is wasting the call.
2. **Errors are stages.** "Era mucho gente" is what a learner at a certain stage says. The right move is the one Dolly already makes: a recast ("había mucha gente, claro…") inside a meaningful reply, not a correction. Focus on form inside a conversation beats grammar explanation (Long; Ellis's task-based work). The tree should record the error as *evidence about the stage*, not as a failure.

### 1.4 Listening and speaking: input, interaction, pushed output

Three ideas, all already half-present in Dolly:

- **Comprehensible input a little above level** (Krashen's i+1): Dolly's language should sit one notch above the learner. Today the prompt has three level lines; the tree makes this precise (the level says which words and forms she can use freely and which she should introduce).
- **Interaction**: negotiation of meaning (asking, repeating, rephrasing) is where learning happens (Long). The call is that. "¿Madrugar? No entiendo" is a *good* event and should be counted as one.
- **Pushed output** (Swain): learners must produce, and produce slightly beyond comfort, to notice gaps. The three things are pushed output; the type-it cards are retrieval practice; both have spaced-repetition literature behind them (SM-2, FSRS). "Misses come back" generalizes to "what is due comes back".

### 1.5 What a three-minute transcript can tell us, honestly

We have text, not audio. From a transcript, with a model reading it, we can see: which words and chunks the learner understood (they answered the question), used, asked about, or avoided; which grammatical forms they attempted and whether they came out right; how long their turns are and whether they stay in the language; repair moves. We cannot see pronunciation at all, and fluency only as a proxy (words per turn, English fallbacks). The speech-to-text engine's confidence could stand in weakly for intelligibility, but nothing more. The UI must not pretend otherwise: there is no pronunciation score in this proposal.

## 2. The proposal: eight levels of can-dos

### 2.1 Shape

A **level** is 12–16 **can-dos**. A can-do is a function, stated language-agnostically ("talk about what you did yesterday"), which in a given language bundles:

- a **lexical set**: 20–40 words and chunks (the preterite of *ir*, *hacer*, *comer*; *ayer*, *el fin de semana pasado*, *luego*)
- **1–3 grammar features**: the forms it needs (regular preterite; *fue*, *hizo*)
- **listening moves**: what Dolly can now ask and be understood ("¿Qué hiciste ayer?")
- **speaking moves**: what the learner can now do (narrate three events in sequence)
- **prerequisites**: edges to earlier can-dos (present tense of the same verbs; time words)
- **elicitation**: two or three questions whose natural answer requires the form, which is how Dolly steers (section 4)

A level is "reached" when ~80% of its can-dos are at mastery (section 3.3). Eight levels, each with a human name, because "A2.1" means nothing to a learner:

| Level | CEFR | Name | You can… | Vocab (cumulative) | Spanish grammar milestones | Mandarin analogue |
|---|---|---|---|---|---|---|
| 1 | A1.1 | Hello | greet, say who you are, say what you like, ask simple questions, numbers and days | ~300 | *ser*/*estar*/*tener* present, *gustar*, question words, articles and gender | HSK 1 (300 words): 是/有/喜欢, 吗 questions, measure words 个 |
| 2 | A1.2 | Getting by | order and ask for things, say where things are, describe people simply, tell the time, talk about your week | ~600 | regular present, *ir a* + infinitive, *hay*, *querer*/*poder*, possessives | HSK 2 (500): 想/要/能, 在 location, time expressions |
| 3 | A2.1 | Your day | your routine, what you did yesterday and last weekend, make plans, give directions, say how you feel | ~1,000 | regular preterite, *fue/hizo/tuvo*, reflexives, *estar* + gerund, direct object pronouns | HSK 3 (1,000): 了 completion, 过 experience, 正在 progressive, 比 comparison |
| 4 | A2.2 | Stories | tell a short story with background, compare, describe places, talk about health and food in detail | ~1,500 | preterite/imperfect contrast, comparatives, indirect object pronouns, *lo/la* | HSK 3–4: 的时候, 一边…一边, resultative complements |
| 5 | B1.1 | Opinions | give and defend an opinion, agree and disagree, talk about work and study, make suggestions | ~2,000 | present subjunctive after *quiero que*, *es importante que*; imperative; *se* impersonal | HSK 4 (2,000): 虽然…但是, 如果…就, 把 construction |
| 6 | B1.2 | Plans and worries | hypothesize, express doubt and wishes, talk about the future and about what might happen | ~2,500 | future tense, conditional, subjunctive after doubt/emotion, *ojalá* | HSK 4–5: 会/将, 要是…的话, 除非 |
| 7 | B2.1 | Nuance | argue a case, retell what someone said, handle a misunderstanding, use register | ~3,000 | reported speech, past subjunctive, *si* clauses with imperfect subjunctive, relative clauses | HSK 5: 被 passive, 不但…而且, discourse connectors |
| 8 | B2.2 | At ease | discuss abstract topics, use idiom and humor, repair your own errors, speak at length | ~3,500 | pluperfect, subjunctive across tenses, *por/para* mastery, discourse markers | HSK 5–6: chengyu in context, formal/informal register |

The grammar columns are the PCIC's and HSK's inventories compressed, in processability order. The names are placeholders; they should sound like Dolly.

### 2.2 Level 1 to 3 in full, for Spanish (sketch)

To show the grain. Each line is one can-do; the bracket is its lexical set and grammar.

**Level 1, Hello** — greet and say goodbye [*hola, buenos días, hasta mañana, qué tal*]; say who you are [*me llamo, soy de, vivo en, tengo … años*; *ser*, *tener*]; say what you do [*trabajo en, estudio, soy …*]; say what you like [*me gusta(n), me encanta, no me gusta nada*; *gustar* with singular/plural]; ask the simple questions [*qué, dónde, cómo, cuándo, quién*; intonation questions]; count and tell the day [0–100, days, months, *hoy, mañana*]; say how you feel [*estoy bien/cansado/contento*; *estar* for states]; say you don't understand and ask for repetition [*no entiendo, ¿puedes repetir?, más despacio, ¿qué significa?*]; name your family and friends [*madre, hermano, amigo, pareja*; possessives *mi/tu/su*]; say yes, no, maybe, and why [*porque, también, tampoco*].

**Level 2, Getting by** — order and ask for things [*quiero, me pones, la cuenta, ¿tienen…?*; *querer*, *poder*]; say where things are [*está en, al lado de, cerca, lejos*; *estar* for location, *hay*]; describe a person [*alto, simpático, tiene el pelo…*; adjective agreement]; tell the time and make a simple plan [*a las ocho, por la mañana, el sábado*; *ir a* + infinitive]; talk about your week [*los lunes, normalmente, a veces, nunca*; regular present]; the weather [*hace sol, llueve, hace frío*]; talk about your home and your city [*piso, barrio, tranquilo, ruidoso*]; buy something and talk about prices [*cuánto cuesta, caro, barato*]; say what you can and can't do [*sé nadar, no puedo*]; ask someone about themselves [*¿y tú?, ¿de dónde eres?*].

**Level 3, Your day** — your routine [*me levanto, desayuno, salgo, vuelvo*; reflexives, *madrugar*]; what you did yesterday [*ayer, fui, hice, comí, vi*; regular preterite, *ir/hacer/ver*]; last weekend [*el fin de semana pasado, luego, después, al final*; sequencing]; what you are doing now [*estoy trabajando*; *estar* + gerund]; give and follow directions [*gira, sigue recto, la segunda a la derecha*; imperative *tú*]; health and the body [*me duele, tengo fiebre, la cabeza*; *doler* like *gustar*]; food in detail [*picante, dulce, lleva, sin*]; say what you did with whom [*con mi hermana, juntos*; *había* for scenes]; invite and accept or decline [*¿quieres…?, me encantaría, no puedo, lo siento*]; talk about a trip [*fuimos a, nos quedamos, el hotel*; preterite plural].

A hundred or so can-dos for levels 1–8, two to three thousand items. That is the content job of this proposal, and it is the real cost: a week of a linguist's time, with Claude drafting from the PCIC and a frequency list and the linguist reviewing. Mandarin is the same shape from HSK 1–5, with pinyin on every item and characters recognized before written (HSK 3.0 itself does not require handwriting before level 5).

## 3. The tree, as data and as evidence

### 3.1 Static: the map

One file per language, `src/lib/dolly/map/es.json`:

```json
{
  "id": "es.3.yesterday",
  "level": 3,
  "kind": "function",
  "title": "Say what you did yesterday",
  "items": ["ayer", "fui", "hice", "comí", "vi", "el fin de semana pasado", "luego"],
  "grammar": ["preterite.regular", "preterite.ir", "preterite.hacer"],
  "listen": ["¿Qué hiciste ayer?", "¿Adónde fuiste?"],
  "speak": "narrates two or three past events in order",
  "requires": ["es.2.week", "es.1.questions"],
  "elicit": ["¿Qué hiciste ayer por la tarde?", "Cuéntame tu fin de semana, desde el sábado por la mañana."]
}
```

Grammar features are their own small nodes (`preterite.regular`), because one form serves many can-dos and mastery of the form is what the processability order tracks.

### 3.2 Dynamic: what the learner knows

Per learner × node: `receptive` and `productive` mastery in 0–1, a confidence (how much evidence), the last evidence, and a review date. The words already live in `dolly_items`; they get a `node_id`. A new table `dolly_mastery` holds the node-level state.

### 3.3 Evidence, from the loop we already run

Nothing new is asked of the learner. Every day already produces three kinds of evidence:

1. **The call.** After the transcript lands (where `extractThings` runs today), a second read annotates it against the map: for each target of the day and anything that came up, *used correctly / attempted with an error / understood when Dolly used it / avoided (answered around it) / asked about*. Comprehension is read from fit: Dolly asked about yesterday, the learner answered about yesterday. Turn length and English fallbacks are noted. The annotation is structured output, like the three things.
2. **The three things**: a production attempt on each, with Dolly's verdict.
3. **The cards**: recall, right or wrong, already stored.

The update rule can be simple and should be slow: mastery moves a little on each piece of evidence (more for production than recognition, more for a spontaneous use than an elicited one), decays gently with time, and the confidence grows with the count. A later version can use FSRS, which is what the spaced-review date should come from anyway. **The level estimate is coverage**: the learner is at the lowest level whose can-dos are not yet 80% mastered, and "x% through level N" is that coverage. It should move in steps a person can feel (a can-do turning green) rather than a percentage that jitters.

**Placement** uses the same machinery: the first three calls are seeded with probes across levels 1–4 (start at the self-reported level, step down on failure, up on ease), so by day 3 the estimate is a real one and the onboarding's "where are you starting" becomes what it says it is: a rough start.

## 4. Steering without breaking the conversation

The principle: **the map is Dolly's private lesson plan.** A good tutor on a phone call has an agenda and never reads it out. The learner feels a conversation that keeps being just a little challenging and keeps circling back to what they got wrong, which is what Dolly already half-does with "coming back". The map makes that systematic.

Each day, from the tree, three **targets**, no more:

- one **frontier** can-do (the next unmastered node at the current level whose prerequisites are met),
- one **repair** (the grammar node behind the most recent attempted-with-error),
- one **review** (an item or node whose review date has come).

And then, in the loop as it exists:

- **The topic** is chosen to make the targets natural. `pickTopic` already takes "what is coming back"; it would take the frontier can-do too. "What you did last weekend" is the topic that makes the preterite happen without anyone saying "preterite".
- **The call prompt** carries the targets with their elicitation questions and a one-line policy: *ask questions whose answers need the form; use the form yourself a few times (an input flood); recast errors; never explain unless asked*. Dolly's own language is pitched at the level: the map says which words she can use freely and which she should introduce with a gloss.
- **The three things** keep coming from the transcript, with one rule added: at least one of the three is the day's frontier form if it appeared. So every day leaves a trace in the tree.
- **The cards** draw from the tree: new items from today, plus whatever is due, by review date. The ten cards become a little spaced-repetition engine without looking like one.
- **The done screen** says what moved: "Today: *ir a* + infinitive ↑, *había* ✓". One line.

A **secondary mode** is the escape hatch, not the plan: "Practice this" on a can-do opens a sixty-second focused mini-call (the things-mode engine, with that can-do's elicitation questions). It is for people who want to drill, reachable from the map, never required and never counted against the streak. I would build it last, and only if people ask.

What we must not do: announce the targets ("today we're practicing the past tense"), stack more than three, or let the targets override what the learner wants to talk about. If they bring up their sister's wedding, the preterite can wait a day; the tree will get its evidence anyway.

## 4.5 "Now what": the star round

Bart finished day 1 and wanted to keep going, and couldn't. Two ideas came out of that: (1) let the conversation simply continue, or (2) let the learner **max-star the day**: a second conversation, more guided, that hits the vocabulary and grammar goals for the level. The worry is whether (2) can be done without ruining the fun, and how we would even know "the level for that day", which is this whole document's subject. The two are the same question from two ends, and the star round is, I think, the right home for the curriculum:

**The day stays sacred.** Three parts, three minutes, one streak. Nothing in section 4 announces a target, and that stays true.

**The star is the opt-in.** Once the day is done, the map's card offers one more thing: **★ Star the day**. It is a second call, shorter and openly more guided, and that is allowed *because the learner asked for it*. Dolly can say "let's work on the past tense for two minutes" here, which she must never say on the morning call. It is the "practice mode" of section 4, but as a whole-day bonus instead of a menu of drills, which keeps it to one button. After it, the day's node on the trail wears a star (the trail already draws a star on the weekly bonus day; this is that, earned). Stars are their own slow count beside the streak: "Day 12 · 4 stars". The streak never depends on them, and tomorrow's text can say "yesterday was a star day" once.

**What the star round does**, in the loop's own pieces: a 2-minute call with four or five targets instead of three (the frontier can-do, the day's repairs, and two reviews), then three things again (this time *chosen from the targets*, not from the transcript), then six cards, all due reviews. It is the same engine (`talk` and `things` modes with a different prompt), so it is cheap to build.

**And "which level"?** Until the map of section 2 exists, the star round can run on what we have: the onboarding's self-reported level, the sketch of levels 1–3 in section 2.2 as a hand-written list, the learner's own items (all of them, misses first) and today's three things. That is a real v0: "hit the goals for your level" means "the can-dos of your self-reported level that haven't shown up in your calls yet". When phase 1 lands (the tree, the estimate), the same button quietly starts using the real frontier.

**Idea (1), "just keep talking"**, is worth having too, as the simplest thing: a **Talk more** link on the done screen that opens another free call, with nothing after it (no things, no cards, no state change), its transcript still feeding the tree. It costs a few lines and it is what a keen learner on day 1 actually wanted. I would ship that now and design the star round alongside the map.

The fun question, honestly: a second call is more fun when it is *different* from the first, and "more guided" is a difference people choose, the way they choose a workout over a walk. The risk is only in making the guided one the default. Keep it behind the star.

## 5. Where the learner sees it

One number, in one place, and a room behind it:

- **The map** gets a line under "Day 12": **"Level 2 · Getting by · 7 of 12"**. Not a percentage; a count of can-dos, so it moves in steps you did something to earn.
- **Tapping it** opens **"Your Spanish"**: the eight levels as a staircase, the current one open, its can-dos as pills, filled when mastered, half when emerging, empty when not yet. Tapping a pill shows its words, and, the part that makes it personal, an example *from the learner's own calls*: "You said: *fui a la playa con mi hermana*." The lower levels show as done; the upper ones as names only. No grammar terminology on this screen at all; the pills say "What you did yesterday", never "preterite".
- **A level-up** is a moment: the done screen that day is the Day complete sun with "Level 3" on it, and the daily text says it once: "🍬 Day 31: Level 3, Your day. Today: …".
- **The done screen** gets its one line of what moved (above).

That is the whole visible surface. The streak stays the daily reward; the level is the slow one. Everything else stays exactly where it is.

## 6. How it lands in the code, in phases

- **Phase 0, content.** Author `map/es.json` from the PCIC and a frequency list: Claude drafts, a linguist reviews; then HSK 1–5 for Mandarin. Nothing ships. (The one real cost.)
- **Phase 1, evidence.** The post-call annotation and `dolly_mastery`; `dolly_items.node_id`; the level estimate. Show "Level N · x of y" on the map. No steering yet. Run it for two weeks on real accounts and check that the estimate moves sensibly and does not jitter. One extra Claude call per day.
- **Phase 2, steering.** Targets in the talk prompt, the topic from the frontier, the cards from the tree, the one line on the done screen. Measure: do targets get used, and does mastery move faster than in phase 1.
- **Phase 3, the room.** "Your Spanish", placement probes in the first three calls, the level-up moment. Then, if asked, the practice mode.

Each phase is shippable on its own and none of them touches the four-step day.

## 7. Open questions and risks

- **The lesson smell.** The biggest risk is that steering makes Dolly sound like a teacher. Cap targets at three, never announce them, let the learner's agenda win, and read transcripts for it: if Dolly's questions start to look like a worksheet, we have gone too far.
- **Three minutes is little evidence.** Mastery must move slowly and the level must be a count of things earned, not an estimate that wobbles. Confidence should gate what the room shows: an "emerging" pill needs two pieces of evidence, not one lucky sentence.
- **Pronunciation is invisible.** Say so, or at least never imply a speaking score. If it matters later, it is a different input (audio to a pronunciation model), not a tweak.
- **Cross-language levels.** The can-do statements transfer; the content does not, and the vocabulary ladders differ in kind (Mandarin counts characters as well as words). Each language needs its own map; the eight levels stay the same.
- **Where self-report ends.** The onboarding's "I can hold a conversation" should become a placement hint, not a setting, once phase 3 lands. Settings would show the level as read-only with "the calls decide".
- **Plateau at B2.** Dolly's format caps around level 8. That is fine to say: "Dolly gets you to a comfortable conversation." Beyond that is reading, media, people.
- **Content maintenance.** The map is a product asset now; it needs an owner and a review loop (which can-dos never get mastered? which elicitation questions never work?).

## Sources

- Council of Europe, *Common European Framework of Reference for Languages* (2001; Companion Volume 2020): the can-do descriptors.
- Pearson, *Global Scale of English*: a 10–90 scale with a learning objective per point, CEFR-mapped (A1 22–29 … C2 85–90), objectives grouped by skill and sub-skill — [GSE brochure](https://www.pearson.com/content/dam/pearson-sites/shared/gse-texas-k12-brochure.pdf).
- Instituto Cervantes, *Plan Curricular del Instituto Cervantes. Niveles de referencia para el español*: grammar, pronunciation, functions, strategies, notions and cultural references per CEFR level — [overview (Edelsa)](https://www.edelsa.es/catalogo/documentos/Niveles_de_Referencia_explicacion.pdf), [review (marcoELE)](https://marcoele.com/descargas/25/llorian_revision-nre.pdf).
- HSK 3.0 (*Chinese Proficiency Grading Standards for International Chinese Language Education*, 2021): nine levels, cumulative word lists, 3,000 characters, 572 grammar items — [guide](https://hsklord.com/blog/new-hsk-3-0-complete-guide), [word counts](https://prepedu.com/en/blog/hsk-vocabulary).
- Nation, *How large a vocabulary is needed for reading and listening?* (2006); van Zeeland & Schmitt (2012); Laufer & Cobb (2019): 2,000–3,000 word families ≈ 95% of spoken discourse — [Nation 2006](https://www.wgtn.ac.nz/__data/assets/pdf_file/0018/1626120/2006-How-large-a-vocab.pdf), [replication study](https://www.cambridge.org/core/journals/language-teaching/article/how-much-vocabulary-is-needed-to-use-english-replication-of-van-zeeland-schmitt-2012-nation-2006-and-cobb-2007/1D217A56A2E0056E67802A6A8360FDDE).
- Pienemann, *Language Processing and Second Language Development: Processability Theory* (1998) and the teachability hypothesis; Johnston's stages for Spanish — [Teachability Hypothesis](https://en.wikipedia.org/wiki/Teachability_Hypothesis), [Spanish study (ARAL)](https://www.benjamins.com/catalog/aral.28.1.06man), [a teacher's summary of the ordering question](https://gianfrancoconti.com/2025/02/12/).
- Long, focus on form and the interaction hypothesis; Swain, the output hypothesis; Krashen, comprehensible input; Lewis, *The Lexical Approach* (1993); Ellis, task-based language teaching. Standard references, not linked.
- Duolingo's CEFR-aligned path (sections per level, spaced practice built into the path) — [Duolingo blog](https://blog.duolingo.com/how-are-duolingo-courses-evolving).

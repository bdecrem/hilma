# Polly — app UI in the language being studied

Polly is an English app wearing the studied language's **marquee**: the few
big elements that make a learner feel they are inside Italian, French or
Korean — and nothing that would make the app hard to operate. A Settings
toggle (Profile → Learning → "App in <language>") flips even those back to
English.

Bart, 2026-09-19: "We should not change all the app content into the language
being studied — it will make the app overwhelming. Not the settings, not
technical UI around editing packs and quizzes and so on — just the marquee UI
elements that let the user feel like they're immersed in that language."

**The marquee (localized):**

1. Tab bar names.
2. The big title / header of each main screen (Topics, Peck, a topic, Infinity
   Chat, the path) and the section headers on those screens.
3. Hero cards and their main call to action: the path card, "Talk to Polly",
   the Infinity Chat TALK card and its chat cards, lesson step names (Talk /
   Words / Grammar), Peck / This-week banner headlines.
4. Celebrations and feel-good moments: streak, level up, level names,
   "Mastered", a quiz's result headline, "Correct!" / "Not quite".
5. Greetings and the one-line empty-state headline of a main screen.
6. Kind labels where they are section headers or badges (Guest Lesson,
   Immersion, Ask).

**Everything else stays English, on purpose:**

- **Settings, all of it**: the Profile sheet and every screen reached from it
  (voice, help, iMessage pairing, appearance, the language switcher).
- **Functional / technical UI**: creating, editing, renaming, deleting topics,
  cards and decks; quiz mechanics and instructions; pickers and menus; the
  model picker; paste; the topic context sheet; readers; audio controls; odds
  and how-it-works sheets; voice-session status and controls.
- **Anything with consequences**: alerts and confirmation dialogs (the whole
  dialog), errors, microphone / permission / account / auth text, local
  notifications.
- **Long prose**, accessibility labels and hints.
- **Signed-out screens** (first run, login, signup): there is no language yet.

When in doubt: English.

## How

`Polly/LangUI.swift`: a global

```swift
L("Done", "Fatto", "Terminé", "완료")   // en, it, fr, ko
```

reads `UILanguage.shared.code` (an `@Observable` singleton kept in sync by
`Session`), so any view body that calls `L` — directly or through a model's
computed property — re-renders when the toggle flips or the language switches.
No per-view plumbing. Strings and their translations sit together at the call
site; there is no .strings catalog.

## Rules

- Marquee strings (the list above) go through `L(…)`; everything else stays a
  plain English literal.
- Interpolation lives inside each form: `L("\(n) cards", "\(n) carte", "\(n) cartes", "카드 \(n)장")`.
  Plurals: branch in Swift (`n == 1 ? L(…) : L(…)`) where English does.
  Korean has no plural and usually wants the count after the noun with a
  counter (개, 장, 일, 분, 번).
- `Text("literal")` takes a LocalizedStringKey and renders markdown;
  `Text(L(…))` takes a String and does not. If the original literal relied on
  markdown (`**bold**`), use `Text(LocalizedStringKey(L(…)))` or
  `Text(.init(L(…)))`.
- A `static let` / stored `let` holding UI text is evaluated once and would
  never flip — turn it into a computed `var` (or call `L` at the use site).
  Same for default parameter values and `enum: String` raw values used as
  labels: keep the raw value for identity/persistence, add a computed
  localized label.
- NEVER translate: the content being taught (cards, lesson text, transcripts,
  anything from the server), `NSLog`/`print`/debug strings, launch-argument and
  `UserDefaults`/`AppStorage` keys, accessibility *identifiers*, SF Symbol and
  asset names, URLs/paths, JSON keys, analytics/event names, strings compared
  against server values, prompts or cues sent to the voice model or the server
  (`sendCue`, request bodies), and the `#if DEBUG`/simulator hooks.
- Brand words stay as they are: **Polly**, **Peck**, **Dodo**, **Infinity
  Chat**, **TestFlight**, **iMessage**.

## Voice

Warm, playful, short — a consumer app, not courseware. Informal address:
Italian **tu**, French **tu**, Korean **해요체** (polite-informal; never
합쇼체 -습니다 except in a legal/system notice). Buttons are imperatives or
bare nouns, as short as the English. Don't translate word for word; write
what a native app would say.

## Orthography and typography (copy-edited 2026-09-19 — keep it this way)

- **Every accent, always, capitals included**: POSSIBILITÀ, PIÙ, RÉVISION,
  Épinglés, À ranger, È. An unaccented capital is a spelling mistake in
  Italian and French, not a style. Watch the pairs that change meaning:
  *infinita* (adjective: "Chat infinita", no accent) vs *infinità* (the noun
  "infinity"); *e* (and) vs *è* (is); *perché, più, già, così, città*.
- **Typographic apostrophe ’** in Italian and French (l’inglese, un’altra,
  aujourd’hui, d’affilée) — never the straight '. (Card *answers* on the
  server keep whatever the learner would type; grading strips both.)
- **French spacing**: a narrow no-break space before `! ? ;` —
  `"Parfait\u{202F}!"` — and a no-break space before `:` and inside guillemets
  — `"Cette semaine\u{00A0}: "`, `«\u{00A0}Commencer\u{00A0}»`. Written as
  escapes so they are visible in source. Italian guillemets take no space:
  «Inizia una chat».
- **Sentence case** in Italian, French and Korean titles ("Serata sushi",
  not "Serata Sushi"); ALL-CAPS eyebrows stay all-caps with their accents.
- **Euphonic d** in Italian before the same vowel: *ed esce*, *ad
  aspettare*.
- The formal pronoun is capitalised: **Lei**.
- French "chat" is masculine and reads as *cat* — the app says
  **discussion** ("Discussion infinie", never "Chat infini").
- One English term, one translation. The oral exam is **Esame finale /
  Examen final / 최종 시험** everywhere (it was also "Ripasso finale" once);
  *Ripasso / Révision / 복습* is only the Refresher.
- Korean: 해요체 throughout; "Mastered" is **마스터** (마스터하기), a status
  is a noun phrase (정리 전, 정리됨), a button is a verb (정리하기).

## Glossary (use these — consistency matters more than elegance)

| English | Italiano | Français | 한국어 |
|---|---|---|---|
| Topics | Argomenti | Sujets | 주제 |
| Topic | Argomento | Sujet | 주제 |
| Chat (tab / noun) | Chat (f.) | Discussion | 대화 |
| Infinity Chat (topic title) | Chat infinita | Discussion infinie | 무한 대화 |
| Cards / flash cards | Carte | Cartes | 카드 |
| Deck | Mazzo | Paquet | 덱 |
| Lesson | Lezione | Leçon | 레슨 |
| Path | Percorso | Parcours | 학습 경로 |
| Level | Livello | Niveau | 레벨 |
| Level check | Test di livello | Test de niveau | 레벨 테스트 |
| Streak | Serie | Série | 연속 기록 |
| day streak | giorni di fila | jours d'affilée | 일 연속 |
| Stars | Stelle | Étoiles | 별 |
| Words / Vocab | Parole / Vocabolario | Mots / Vocabulaire | 단어 / 어휘 |
| Grammar | Grammatica | Grammaire | 문법 |
| Talk | Parla | Parle | 말하기 |
| Talk to Polly | Parla con Polly | Parle avec Polly | Polly와 대화 |
| Let's talk | Parliamo | Parlons | 이야기해요 |
| Quiz | Quiz | Quiz | 퀴즈 |
| Clean up | Sistema | Ranger | 정리 |
| Ready to clean up (status) | Da sistemare | À ranger | 정리 전 |
| Cleaned up | Sistemata | Rangée | 정리됨 |
| Mastered | Padroneggiata/o | Maîtrisé(e) | 마스터 |
| Master it | Padroneggiala | Maîtrise-la | 마스터하기 |
| Refresher | Ripasso | Révision | 복습 |
| Final Review (the oral exam) | Esame finale | Examen final | 최종 시험 |
| Reviews (exam records) | Esami | Examens | 시험 기록 |
| Second Chance | Seconda possibilità | Seconde chance | 재도전 |
| Study | Studia | Réviser | 학습 |
| Practice | Esercitati | Entraîne-toi | 연습 |
| Start | Inizia | Commencer | 시작 |
| Start over | Ricomincia | Recommencer | 처음부터 다시 |
| Continue | Continua | Continuer | 계속 |
| Next | Avanti | Suivant | 다음 |
| Back | Indietro | Retour | 뒤로 |
| Done | Fatto | Terminé | 완료 |
| Got it | Capito | Compris | 알겠어요 |
| Cancel | Annulla | Annuler | 취소 |
| Save | Salva | Enregistrer | 저장 |
| Delete | Elimina | Supprimer | 삭제 |
| Edit | Modifica | Modifier | 편집 |
| Rename | Rinomina | Renommer | 이름 변경 |
| Share | Condividi | Partager | 공유 |
| Close | Chiudi | Fermer | 닫기 |
| Retry / Try again | Riprova | Réessayer | 다시 시도 |
| Skip | Salta | Passer | 건너뛰기 |
| Loading… | Caricamento… | Chargement… | 불러오는 중… |
| Settings | Impostazioni | Réglages | 설정 |
| Profile | Profilo | Profil | 프로필 |
| Account | Account | Compte | 계정 |
| Sign in | Accedi | Se connecter | 로그인 |
| Sign out | Esci | Se déconnecter | 로그아웃 |
| Sign up | Registrati | S'inscrire | 가입 |
| Email | Email | E-mail | 이메일 |
| Password | Password | Mot de passe | 비밀번호 |
| Voice | Voce | Voix | 음성 |
| Microphone | Microfono | Micro | 마이크 |
| Notifications | Notifiche | Notifications | 알림 |
| Help | Aiuto | Aide | 도움말 |
| Language | Lingua | Langue | 언어 |
| Correct | Giusto | Correct | 정답 |
| Wrong / Not quite | Non proprio | Pas tout à fait | 아쉬워요 |
| Something went wrong | Qualcosa è andato storto | Une erreur s'est produite | 문제가 발생했어요 |
| Guest Lesson | Lezione ospite | Leçon d’invité | 게스트 레슨 |
| Immersion | Immersione | Immersion | 몰입 |
| Ask | Chiedi | Demande | 질문 |
| Today | Oggi | Aujourd'hui | 오늘 |
| Yesterday | Ieri | Hier | 어제 |
| This week | Questa settimana | Cette semaine | 이번 주 |

Peck's own vocabulary (regions, trail, odds, pebbles): keep **Peck** as the
name; translate the descriptive words around it naturally.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKS = [
  // === KAFKA — the master of estrangement ===
  { id: 5200, author: 'Franz Kafka', title: 'The Metamorphosis' },
  { id: 7849, author: 'Franz Kafka', title: 'The Trial' },
  { id: 7148, author: 'Franz Kafka', title: 'The Castle' },

  // === WOOLF — stream of consciousness, sensory overload ===
  { id: 63107, author: 'Virginia Woolf', title: 'Mrs Dalloway' },
  { id: 144, author: 'Virginia Woolf', title: 'To the Lighthouse' },
  { id: 29220, author: 'Virginia Woolf', title: 'The Waves' },
  { id: 63542, author: 'Virginia Woolf', title: 'Orlando' },

  // === DOSTOEVSKY — psychological intensity, underground voice ===
  { id: 600, author: 'Fyodor Dostoevsky', title: 'Notes from Underground' },
  { id: 2554, author: 'Fyodor Dostoevsky', title: 'Crime and Punishment' },
  { id: 28054, author: 'Fyodor Dostoevsky', title: 'The Brothers Karamazov' },
  { id: 2197, author: 'Fyodor Dostoevsky', title: 'The Idiot' },

  // === JOYCE — language as music, experimental prose ===
  { id: 2814, author: 'James Joyce', title: 'Dubliners' },
  { id: 4217, author: 'James Joyce', title: 'A Portrait of the Artist as a Young Man' },
  { id: 4300, author: 'James Joyce', title: 'Ulysses' },

  // === POE — gothic intensity, fever dreams ===
  { id: 932, author: 'Edgar Allan Poe', title: 'Complete Tales and Poems' },

  // === MELVILLE — oceanic prose, obsessive description ===
  { id: 2701, author: 'Herman Melville', title: 'Moby Dick' },
  { id: 15859, author: 'Herman Melville', title: 'Billy Budd' },
  { id: 11231, author: 'Herman Melville', title: 'Bartleby the Scrivener' },

  // === CONRAD — darkness, atmosphere, moral ambiguity ===
  { id: 219, author: 'Joseph Conrad', title: 'Heart of Darkness' },
  { id: 527, author: 'Joseph Conrad', title: 'Lord Jim' },
  { id: 974, author: 'Joseph Conrad', title: 'The Secret Sharer' },

  // === PROUST — memory, sensation, endless beautiful sentences ===
  { id: 7178, author: 'Marcel Proust', title: "Swann's Way" },

  // === FAULKNER — southern gothic, fractured time ===
  { id: 54873, author: 'William Faulkner', title: 'The Sound and the Fury' },

  // === FLANNERY O'CONNOR — grotesque grace ===
  { id: 65084, author: "Flannery O'Connor", title: 'Wise Blood' },

  // === BULGAKOV — surreal, magical, satirical ===
  { id: 65537, author: 'Mikhail Bulgakov', title: 'The Master and Margarita' },

  // === GOGOL — absurdist, grotesque, strange ===
  { id: 1081, author: 'Nikolai Gogol', title: 'Dead Souls' },
  { id: 36238, author: 'Nikolai Gogol', title: 'The Nose and Other Stories' },

  // === TOLSTOY — psychological precision ===
  { id: 2600, author: 'Leo Tolstoy', title: 'War and Peace' },
  { id: 1399, author: 'Leo Tolstoy', title: 'Anna Karenina' },
  { id: 689, author: 'Leo Tolstoy', title: 'The Death of Ivan Ilyich' },

  // === BRONTË — wild, passionate, atmospheric ===
  { id: 768, author: 'Emily Brontë', title: 'Wuthering Heights' },
  { id: 1260, author: 'Charlotte Brontë', title: 'Jane Eyre' },

  // === HARDY — landscape as character, fate ===
  { id: 110, author: 'Thomas Hardy', title: 'Tess of the d\'Urbervilles' },
  { id: 153, author: 'Thomas Hardy', title: 'Jude the Obscure' },

  // === SHELLEY / STOKER — gothic horror ===
  { id: 84, author: 'Mary Shelley', title: 'Frankenstein' },
  { id: 345, author: 'Bram Stoker', title: 'Dracula' },

  // === HAWTHORNE — dark allegory, American gothic ===
  { id: 33, author: 'Nathaniel Hawthorne', title: 'The Scarlet Letter' },
  { id: 77, author: 'Nathaniel Hawthorne', title: 'The House of the Seven Gables' },

  // === LAWRENCE — body, nature, raw feeling ===
  { id: 4240, author: 'D.H. Lawrence', title: 'Sons and Lovers' },
  { id: 217, author: 'D.H. Lawrence', title: 'Women in Love' },

  // === HESSE — inner worlds, spiritual crisis ===
  { id: 2500, author: 'Hermann Hesse', title: 'Siddhartha' },
  { id: 52190, author: 'Hermann Hesse', title: 'Steppenwolf' },

  // === CAMUS — existential clarity ===
  { id: 13462, author: 'Albert Camus', title: 'The Stranger' },

  // === HAMSUN — hunger, obsession, unreliable consciousness ===
  { id: 8387, author: 'Knut Hamsun', title: 'Hunger' },
  { id: 32975, author: 'Knut Hamsun', title: 'Mysteries' },
  { id: 24597, author: 'Knut Hamsun', title: 'Pan' },

  // === LAUTRÉAMONT — proto-surrealist, violent beauty ===
  { id: 12005, author: 'Comte de Lautréamont', title: 'Maldoror' },

  // === DE QUINCEY — hallucinatory prose ===
  { id: 2040, author: 'Thomas De Quincey', title: 'Confessions of an English Opium-Eater' },

  // === NERVAL — dreams, madness, beauty ===
  { id: 23662, author: 'Gérard de Nerval', title: 'Aurélia' },

  // === POETRY — concentrated language, image-dense ===
  { id: 1322, author: 'Walt Whitman', title: 'Leaves of Grass' },
  { id: 12242, author: 'Emily Dickinson', title: 'Poems' },
  { id: 1934, author: 'William Blake', title: 'Songs of Innocence and Experience' },
  { id: 2188, author: 'Rainer Maria Rilke', title: 'Duino Elegies' },
  { id: 62844, author: 'Arthur Rimbaud', title: 'A Season in Hell' },
  { id: 36098, author: 'Charles Baudelaire', title: 'Flowers of Evil' },
  { id: 8606, author: 'Arthur Rimbaud', title: 'Illuminations' },
  { id: 1321, author: 'John Keats', title: 'Poems' },
  { id: 4800, author: 'Percy Bysshe Shelley', title: 'Complete Poetical Works' },
  { id: 8492, author: 'Federico García Lorca', title: 'Poems' },
  { id: 1232, author: 'Samuel Taylor Coleridge', title: 'Poems' },
  { id: 8411, author: 'W.B. Yeats', title: 'The Wind Among the Reeds' },
  { id: 9100, author: 'W.B. Yeats', title: 'The Celtic Twilight' },

  // === MORE WEIRD/EXPERIMENTAL PROSE ===
  { id: 11, author: 'Lewis Carroll', title: "Alice's Adventures in Wonderland" },
  { id: 12, author: 'Lewis Carroll', title: 'Through the Looking-Glass' },
  { id: 62896, author: 'Bruno Schulz', title: 'The Street of Crocodiles' },
  { id: 209, author: 'Robert Louis Stevenson', title: 'Dr. Jekyll and Mr. Hyde' },
  { id: 174, author: 'Oscar Wilde', title: 'The Picture of Dorian Gray' },
  { id: 120, author: 'Robert Louis Stevenson', title: 'Treasure Island' },

  // === CHEKHOV — compression, atmosphere in few words ===
  { id: 1732, author: 'Anton Chekhov', title: 'Short Stories' },

  // === MANSFIELD — lyrical short fiction ===
  { id: 1429, author: 'Katherine Mansfield', title: 'The Garden Party and Other Stories' },

  // === TURGENEV — landscape and feeling ===
  { id: 30723, author: 'Ivan Turgenev', title: 'Fathers and Sons' },
  { id: 13039, author: 'Ivan Turgenev', title: 'A Sportsman\'s Sketches' },
];

// Sensory and literary-density word lists
const SENSORY_WORDS = new Set([
  // colors
  'red', 'blue', 'green', 'yellow', 'white', 'black', 'golden', 'silver',
  'crimson', 'scarlet', 'pale', 'dark', 'bright', 'grey', 'gray', 'purple',
  'violet', 'amber', 'azure', 'ivory', 'ebony', 'dusky', 'ashen', 'rosy',
  'bronze', 'copper', 'rust', 'tawny', 'sallow', 'livid', 'flushed',
  // textures
  'smooth', 'rough', 'soft', 'hard', 'wet', 'dry', 'cold', 'warm', 'hot',
  'damp', 'moist', 'slippery', 'sticky', 'coarse', 'silky', 'velvety',
  'gritty', 'brittle', 'supple', 'rigid', 'tender', 'harsh',
  // sounds
  'whisper', 'murmur', 'roar', 'thunder', 'silence', 'echo', 'hum',
  'buzz', 'rustle', 'crack', 'hiss', 'growl', 'shriek', 'moan', 'sigh',
  'clatter', 'thud', 'rumble', 'chime', 'toll', 'drone', 'wail',
  // smells/tastes
  'sweet', 'bitter', 'sour', 'fragrant', 'acrid', 'pungent', 'musty',
  'stench', 'odor', 'aroma', 'scent', 'fetid', 'rank', 'putrid', 'rancid',
  // body/physical
  'blood', 'bone', 'flesh', 'skin', 'breath', 'heart', 'pulse', 'vein',
  'wound', 'scar', 'sweat', 'tear', 'tears', 'trembling', 'shudder',
  // nature/atmosphere
  'shadow', 'light', 'flame', 'smoke', 'fog', 'mist', 'dust', 'rain',
  'wind', 'storm', 'sea', 'wave', 'stone', 'earth', 'sky', 'moon', 'sun',
  'star', 'night', 'dawn', 'dusk', 'twilight', 'gloom', 'darkness',
  // metaphorical/abstract intensity
  'abyss', 'void', 'infinite', 'eternal', 'vast', 'immense', 'hollow',
  'phantom', 'specter', 'ghost', 'dream', 'nightmare', 'labyrinth',
  'desolate', 'solitude', 'anguish', 'agony', 'ecstasy', 'despair',
  'torment', 'dread', 'terror', 'horror', 'sublime', 'grotesque',
]);

// Words that suggest figurative language
const FIGURATIVE_MARKERS = new Set([
  'like', 'as', 'seemed', 'resembled', 'appeared', 'imagine',
  'perhaps', 'almost', 'somehow', 'strange', 'stranger', 'strangest',
  'impossible', 'invisible', 'unseen', 'unknown', 'unspoken',
  'transformed', 'dissolved', 'melted', 'consumed', 'devoured',
  'haunted', 'possessed', 'enchanted', 'bewitched',
]);

// Common words to identify "rare" words by exclusion
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'must', 'not', 'no',
  'so', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'it',
  'its', 'he', 'she', 'him', 'her', 'his', 'they', 'them', 'their',
  'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my', 'who', 'which',
  'what', 'when', 'where', 'how', 'why', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'very', 'just', 'about', 'up', 'out', 'into', 'over', 'after', 'before',
  'between', 'under', 'again', 'there', 'here', 'through', 'during',
  'above', 'below', 'any', 'once', 'also', 'back', 'now', 'even', 'still',
  'too', 'much', 'many', 'well', 'never', 'always', 'often', 'ever',
  'away', 'said', 'say', 'says', 'went', 'go', 'goes', 'come', 'came',
  'get', 'got', 'make', 'made', 'take', 'took', 'know', 'knew', 'think',
  'thought', 'see', 'saw', 'look', 'looked', 'want', 'give', 'gave',
  'tell', 'told', 'let', 'put', 'seem', 'leave', 'left', 'keep', 'kept',
  'long', 'great', 'little', 'old', 'new', 'good', 'first', 'last',
  'own', 'next', 'young', 'big', 'high', 'small', 'large', 'man', 'woman',
  'time', 'day', 'way', 'thing', 'life', 'hand', 'part', 'place', 'year',
  'work', 'head', 'room', 'face', 'door', 'side', 'house', 'world',
  'home', 'while', 'down', 'upon', 'though', 'without', 'yet', 'along',
  'against', 'off', 'until', 'since', 'quite', 'rather', 'already',
  'nothing', 'something', 'everything', 'anything', 'one', 'two', 'three',
  'mr', 'mrs', 'dont', 'didnt', 'doesnt', 'wasnt', 'wont', 'cant',
  'himself', 'herself', 'itself', 'themselves', 'myself', 'yourself',
  'shall', 'whom', 'whose', 'whether', 'because', 'although', 'however',
  'another', 'among', 'around', 'before', 'after', 'across', 'enough',
  'going', 'having', 'being', 'might', 'whole', 'right', 'certain',
]);

function wordCount(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function getWords(text) {
  return text.toLowerCase().replace(/[^a-z\s'-]/g, '').split(/\s+/).filter(w => w.length > 1);
}

function scoreParagraph(text) {
  const words = getWords(text);
  if (words.length === 0) return 0;

  // 1. Sensory word density
  const sensoryCount = words.filter(w => SENSORY_WORDS.has(w)).length;
  const sensoryScore = (sensoryCount / words.length) * 100;

  // 2. Figurative language markers
  const figCount = words.filter(w => FIGURATIVE_MARKERS.has(w)).length;
  const figScore = (figCount / words.length) * 80;

  // 3. Dialogue penalty — count quotation marks
  const quoteCount = (text.match(/[""\u201C\u201D]/g) || []).length;
  const dialoguePenalty = Math.min(quoteCount * 1.5, 15);

  // 4. Rare/unusual word ratio (words not in common set and length > 5)
  const rareWords = words.filter(w => !COMMON_WORDS.has(w) && w.length > 6);
  const rareScore = (rareWords.length / words.length) * 40;

  // 5. Sentence variety — standard deviation of sentence lengths
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let varietyScore = 0;
  if (sentences.length > 1) {
    const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const mean = sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length;
    const variance = sentLengths.reduce((a, b) => a + (b - mean) ** 2, 0) / sentLengths.length;
    varietyScore = Math.min(Math.sqrt(variance) * 2, 15);
  }

  // 6. Longer sentences bonus (literary prose tends to have longer sentences)
  const avgSentLen = words.length / Math.max(sentences.length, 1);
  const lengthBonus = Math.min(avgSentLen * 0.3, 8);

  return sensoryScore + figScore + rareScore + varietyScore + lengthBonus - dialoguePenalty;
}

function stripGutenbergWrapper(text) {
  // Remove BOM
  text = text.replace(/^\uFEFF/, '');

  // Find start marker
  const startPatterns = [
    /\*\*\*\s*START OF TH(IS|E) PROJECT GUTENBERG EBOOK[^\n]*/i,
    /\*\*\*\s*START OF THE PROJECT GUTENBERG/i,
    /\*\*\* START/i,
  ];
  for (const pat of startPatterns) {
    const match = text.match(pat);
    if (match) {
      text = text.slice(match.index + match[0].length);
      break;
    }
  }

  // Find end marker
  const endPatterns = [
    /\*\*\*\s*END OF TH(IS|E) PROJECT GUTENBERG EBOOK/i,
    /\*\*\*\s*END OF THE PROJECT GUTENBERG/i,
    /\*\*\* END/i,
  ];
  for (const pat of endPatterns) {
    const match = text.match(pat);
    if (match) {
      text = text.slice(0, match.index);
      break;
    }
  }

  return text.trim();
}

function extractParagraphs(text) {
  // Split on double newlines (paragraph breaks)
  const rawParagraphs = text.split(/\n\s*\n/);
  const paragraphs = [];

  for (const raw of rawParagraphs) {
    // Rejoin lines within a paragraph
    const cleaned = raw.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const wc = wordCount(cleaned);
    if (wc >= 100 && wc <= 500) {
      paragraphs.push(cleaned);
    }
  }

  return paragraphs;
}

async function fetchWork(work) {
  const url = `https://www.gutenberg.org/cache/epub/${work.id}/pg${work.id}.txt`;
  const source = `${work.author} - ${work.title}`;

  console.log(`Fetching: ${source} (ID: ${work.id})...`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Node.js corpus builder (educational/research use)',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        console.log(`  SKIP (404): ${source}`);
        return [];
      }
      console.log(`  ERROR (${res.status}): ${source}`);
      return [];
    }

    const text = await res.text();
    const body = stripGutenbergWrapper(text);
    const paragraphs = extractParagraphs(body);

    console.log(`  Found ${paragraphs.length} candidate paragraphs (100-500 words)`);

    // Score and rank
    const scored = paragraphs.map(p => ({ text: p, score: scoreParagraph(p) }));
    scored.sort((a, b) => b.score - a.score);

    // Take top 8-12 passages per work (aim for 10)
    const topCount = Math.min(Math.max(8, Math.min(12, scored.length)), scored.length);
    // Only take passages above a minimum quality threshold
    const selected = scored.slice(0, topCount).filter(s => s.score > 5);

    console.log(`  Selected ${selected.length} passages (score range: ${selected.at(-1)?.score.toFixed(1)} - ${selected[0]?.score.toFixed(1)})`);

    return selected.map(s => ({ text: s.text, source }));
  } catch (err) {
    console.log(`  FETCH ERROR: ${source} — ${err.message}`);
    return [];
  }
}

async function main() {
  console.log(`\nBuilding literary corpus from ${WORKS.length} works...\n`);

  const allPassages = [];
  let worksProcessed = 0;

  // Process sequentially to be polite to Gutenberg servers
  for (const work of WORKS) {
    const passages = await fetchWork(work);
    if (passages.length > 0) {
      allPassages.push(...passages);
      worksProcessed++;
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  // Write JSONL
  const outPath = join(import.meta.dirname, 'corpus-v2.jsonl');
  const lines = allPassages.map(p => JSON.stringify(p));
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total passages: ${allPassages.length}`);
  console.log(`Works included: ${worksProcessed}`);
  console.log(`Output: ${outPath}`);
  console.log(`=============================\n`);
}

main();

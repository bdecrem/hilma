// The ladder: eight levels (CEFR A1–B2, each band split in two), each a list
// of can-dos — a function the learner can perform, with the words and chunks
// it needs, the grammar behind it, and the questions that draw it out. The
// shape and the level names are in docs/dolly-pedagogy.md; the content for
// Spanish follows the Plan Curricular del Instituto Cervantes compressed into
// acquisition order, Mandarin follows HSK 1–2. Levels with no can-dos yet
// are rungs on the ladder with content to follow.
import { type LanguageCode } from './language'

export type CanDoItem = { t: string; n: string; p?: string }

export type CanDo = {
  id: string
  level: number
  /** Learner-facing, in English, never grammar terms. */
  title: string
  items: CanDoItem[]
  /** For the prompt only. */
  grammar: string
  /** Questions in the language whose natural answer needs the can-do. */
  elicit: string[]
}

export type Level = { n: number; cefr: string; name: string; tagline: string }

export const LEVELS: Level[] = [
  { n: 1, cefr: 'A1.1', name: 'Hello', tagline: 'Say who you are and what you like.' },
  { n: 2, cefr: 'A1.2', name: 'Getting by', tagline: 'Order, ask, find your way, talk about your week.' },
  { n: 3, cefr: 'A2.1', name: 'Your day', tagline: 'Your routine, yesterday, and plans.' },
  { n: 4, cefr: 'A2.2', name: 'Stories', tagline: 'Tell what happened, with the scene around it.' },
  { n: 5, cefr: 'B1.1', name: 'Opinions', tagline: 'Say what you think and why.' },
  { n: 6, cefr: 'B1.2', name: 'Plans and worries', tagline: 'What might happen, what you wish.' },
  { n: 7, cefr: 'B2.1', name: 'Nuance', tagline: 'Argue, retell, handle a misunderstanding.' },
  { n: 8, cefr: 'B2.2', name: 'At ease', tagline: 'Abstract topics, humor, your own repairs.' },
]

export function levelInfo(n: number): Level {
  return LEVELS[Math.min(Math.max(n, 1), LEVELS.length) - 1]
}

const ES: CanDo[] = [
  // ---------- Level 1 · Hello ----------
  {
    id: 'es.1.greet', level: 1, title: 'Greet and say goodbye',
    items: [{ t: 'hola', n: 'hello' }, { t: 'buenos días', n: 'good morning' }, { t: 'buenas tardes', n: 'good afternoon' }, { t: '¿qué tal?', n: 'how are you?' }, { t: 'hasta mañana', n: 'see you tomorrow' }, { t: 'adiós', n: 'goodbye' }, { t: 'mucho gusto', n: 'nice to meet you' }],
    grammar: 'fixed greetings; tú vs usted in passing', elicit: ['¡Hola! ¿Qué tal?', 'Bueno, ya casi terminamos. ¿Cómo nos despedimos en español?'],
  },
  {
    id: 'es.1.who', level: 1, title: 'Say who you are',
    items: [{ t: 'me llamo', n: 'my name is' }, { t: 'soy de', n: 'I am from' }, { t: 'vivo en', n: 'I live in' }, { t: 'tengo … años', n: 'I am … years old' }, { t: 'soy', n: 'I am' }, { t: '¿y tú?', n: 'and you?' }],
    grammar: 'ser and tener in the first person; llamarse', elicit: ['¿Cómo te llamas?', '¿De dónde eres?', '¿Dónde vives?'],
  },
  {
    id: 'es.1.work', level: 1, title: 'Say what you do',
    items: [{ t: 'trabajo en', n: 'I work at' }, { t: 'estudio', n: 'I study' }, { t: 'soy profesor', n: 'I am a teacher' }, { t: 'una empresa', n: 'a company' }, { t: 'la oficina', n: 'the office' }, { t: 'en casa', n: 'at home' }],
    grammar: 'regular -ar present, first person; professions without an article', elicit: ['¿En qué trabajas?', '¿Trabajas en casa o en una oficina?'],
  },
  {
    id: 'es.1.like', level: 1, title: 'Say what you like',
    items: [{ t: 'me gusta', n: 'I like (one thing)' }, { t: 'me gustan', n: 'I like (several)' }, { t: 'me encanta', n: 'I love' }, { t: 'no me gusta nada', n: 'I don’t like at all' }, { t: 'la música', n: 'music' }, { t: 'el café', n: 'coffee' }, { t: 'mucho', n: 'a lot' }],
    grammar: 'gustar with singular and plural; me / te', elicit: ['¿Qué te gusta hacer los fines de semana?', '¿Te gusta el café o el té?'],
  },
  {
    id: 'es.1.questions', level: 1, title: 'Ask the simple questions',
    items: [{ t: '¿qué?', n: 'what?' }, { t: '¿dónde?', n: 'where?' }, { t: '¿cómo?', n: 'how?' }, { t: '¿cuándo?', n: 'when?' }, { t: '¿quién?', n: 'who?' }, { t: '¿por qué?', n: 'why?' }, { t: '¿cuánto?', n: 'how much?' }],
    grammar: 'question words; rising intonation', elicit: ['Ahora pregúntame tú algo: lo que quieras.', '¿Qué quieres saber de mí?'],
  },
  {
    id: 'es.1.numbers', level: 1, title: 'Count, and say the day',
    items: [{ t: 'uno, dos, tres', n: 'one, two, three' }, { t: 'diez', n: 'ten' }, { t: 'veinte', n: 'twenty' }, { t: 'cien', n: 'a hundred' }, { t: 'lunes', n: 'Monday' }, { t: 'sábado', n: 'Saturday' }, { t: 'hoy', n: 'today' }, { t: 'mañana', n: 'tomorrow' }],
    grammar: 'numbers 0–100; days of the week without capitals', elicit: ['¿Qué día es hoy?', '¿Cuántas personas hay en tu familia?', '¿Cuál es tu número favorito?'],
  },
  {
    id: 'es.1.feel', level: 1, title: 'Say how you feel',
    items: [{ t: 'estoy bien', n: 'I am fine' }, { t: 'estoy cansado', n: 'I am tired' }, { t: 'estoy contento', n: 'I am happy' }, { t: 'tengo hambre', n: 'I am hungry' }, { t: 'tengo sueño', n: 'I am sleepy' }, { t: 'más o menos', n: 'so-so' }],
    grammar: 'estar for states; tener hambre / sueño / frío', elicit: ['¿Cómo estás hoy, de verdad?', '¿Tienes sueño o estás bien?'],
  },
  {
    id: 'es.1.repair', level: 1, title: 'Say you don’t understand',
    items: [{ t: 'no entiendo', n: 'I don’t understand' }, { t: '¿puedes repetir?', n: 'can you repeat?' }, { t: 'más despacio', n: 'more slowly' }, { t: '¿qué significa…?', n: 'what does … mean?' }, { t: '¿cómo se dice…?', n: 'how do you say …?' }, { t: 'un momento', n: 'one moment' }],
    grammar: 'fixed phrases', elicit: ['Te voy a decir algo rápido y difícil, y tú me pides ayuda: “Anteayer madrugué muchísimo.”', 'Si no entiendes una palabra, ¿qué me dices?'],
  },
  {
    id: 'es.1.family', level: 1, title: 'Name your family and friends',
    items: [{ t: 'mi madre', n: 'my mother' }, { t: 'mi padre', n: 'my father' }, { t: 'mi hermana', n: 'my sister' }, { t: 'mi hermano', n: 'my brother' }, { t: 'mi amigo', n: 'my friend' }, { t: 'mi pareja', n: 'my partner' }, { t: 'mis hijos', n: 'my children' }],
    grammar: 'possessives mi / mis / tu; family nouns and gender', elicit: ['Háblame de tu familia: ¿quiénes son?', '¿Tienes hermanos?'],
  },
  {
    id: 'es.1.yesno', level: 1, title: 'Say yes, no, maybe, and why',
    items: [{ t: 'sí', n: 'yes' }, { t: 'no', n: 'no' }, { t: 'quizás', n: 'maybe' }, { t: 'porque', n: 'because' }, { t: 'también', n: 'also / me too' }, { t: 'tampoco', n: 'neither' }, { t: 'claro', n: 'of course' }],
    grammar: 'porque + clause; también / tampoco agreement', elicit: ['A mí me gusta madrugar. ¿Y a ti?', '¿Te gusta tu ciudad? ¿Por qué?'],
  },
  // ---------- Level 2 · Getting by ----------
  {
    id: 'es.2.order', level: 2, title: 'Order and ask for things',
    items: [{ t: 'quiero', n: 'I want' }, { t: 'quisiera', n: 'I would like' }, { t: 'me pones', n: 'can I have (informal)' }, { t: 'la cuenta, por favor', n: 'the bill, please' }, { t: '¿tienen…?', n: 'do you have …?' }, { t: 'un café con leche', n: 'a coffee with milk' }, { t: 'para mí', n: 'for me' }],
    grammar: 'querer and poder in the present; polite requests', elicit: ['Imagina que soy el camarero. ¿Qué quieres tomar?', '¿Qué pides normalmente en un café?'],
  },
  {
    id: 'es.2.where', level: 2, title: 'Say where things are',
    items: [{ t: 'está en', n: 'it is in / at' }, { t: 'al lado de', n: 'next to' }, { t: 'cerca de', n: 'near' }, { t: 'lejos de', n: 'far from' }, { t: 'hay', n: 'there is / are' }, { t: 'a la derecha', n: 'on the right' }, { t: 'enfrente', n: 'opposite' }],
    grammar: 'estar for location; hay for existence', elicit: ['¿Qué hay cerca de tu casa?', '¿Dónde está tu café favorito?'],
  },
  {
    id: 'es.2.describe', level: 2, title: 'Describe a person',
    items: [{ t: 'es alto', n: 'he is tall' }, { t: 'es simpática', n: 'she is nice' }, { t: 'tiene el pelo corto', n: 'has short hair' }, { t: 'lleva gafas', n: 'wears glasses' }, { t: 'es muy divertido', n: 'is very funny' }, { t: 'un poco tímido', n: 'a bit shy' }],
    grammar: 'ser + adjective with agreement; tener for features', elicit: ['Describe a tu mejor amigo o amiga: ¿cómo es?', '¿Cómo es tu hermana?'],
  },
  {
    id: 'es.2.time', level: 2, title: 'Tell the time and make a plan',
    items: [{ t: 'a las ocho', n: 'at eight' }, { t: 'por la mañana', n: 'in the morning' }, { t: 'por la noche', n: 'at night' }, { t: 'el sábado', n: 'on Saturday' }, { t: 'voy a', n: 'I am going to' }, { t: '¿quedamos?', n: 'shall we meet?' }, { t: 'media hora', n: 'half an hour' }],
    grammar: 'ir a + infinitive; clock times with a las', elicit: ['¿Qué vas a hacer el sábado?', '¿A qué hora te levantas normalmente?'],
  },
  {
    id: 'es.2.week', level: 2, title: 'Talk about your week',
    items: [{ t: 'los lunes', n: 'on Mondays' }, { t: 'normalmente', n: 'usually' }, { t: 'a veces', n: 'sometimes' }, { t: 'nunca', n: 'never' }, { t: 'todos los días', n: 'every day' }, { t: 'trabajo', n: 'I work' }, { t: 'descanso', n: 'I rest' }],
    grammar: 'regular present, all persons; frequency adverbs', elicit: ['¿Cómo es una semana normal para ti?', '¿Qué haces los lunes?'],
  },
  {
    id: 'es.2.weather', level: 2, title: 'Talk about the weather',
    items: [{ t: 'hace sol', n: 'it is sunny' }, { t: 'hace frío', n: 'it is cold' }, { t: 'hace calor', n: 'it is hot' }, { t: 'llueve', n: 'it rains' }, { t: 'está nublado', n: 'it is cloudy' }, { t: 'buen tiempo', n: 'nice weather' }],
    grammar: 'hace + noun for weather; impersonal llueve', elicit: ['¿Qué tiempo hace hoy donde estás?', '¿Prefieres el frío o el calor?'],
  },
  {
    id: 'es.2.home', level: 2, title: 'Talk about your home and your city',
    items: [{ t: 'un piso', n: 'a flat' }, { t: 'una casa', n: 'a house' }, { t: 'el barrio', n: 'the neighborhood' }, { t: 'tranquilo', n: 'quiet' }, { t: 'ruidoso', n: 'noisy' }, { t: 'grande', n: 'big' }, { t: 'pequeño', n: 'small' }],
    grammar: 'vivir en; adjectives after the noun', elicit: ['¿Cómo es tu barrio?', '¿Vives en una casa o en un piso?'],
  },
  {
    id: 'es.2.buy', level: 2, title: 'Buy something and talk about prices',
    items: [{ t: '¿cuánto cuesta?', n: 'how much is it?' }, { t: 'caro', n: 'expensive' }, { t: 'barato', n: 'cheap' }, { t: 'euros', n: 'euros' }, { t: 'me lo llevo', n: 'I’ll take it' }, { t: '¿tiene otro color?', n: 'do you have another color?' }],
    grammar: 'costar; demonstratives este / ese', elicit: ['¿Qué fue lo último que compraste? ¿Cuánto costó?', 'Soy la dependienta: pregúntame el precio de algo.'],
  },
  {
    id: 'es.2.can', level: 2, title: 'Say what you can and can’t do',
    items: [{ t: 'sé nadar', n: 'I can swim (know how)' }, { t: 'no puedo', n: 'I can’t' }, { t: 'puedo', n: 'I can' }, { t: 'bastante bien', n: 'quite well' }, { t: 'un poco', n: 'a little' }, { t: 'todavía no', n: 'not yet' }],
    grammar: 'saber + infinitive vs poder + infinitive', elicit: ['¿Qué sabes hacer bien?', '¿Sabes cocinar?'],
  },
  {
    id: 'es.2.askback', level: 2, title: 'Ask someone about themselves',
    items: [{ t: '¿de dónde eres?', n: 'where are you from?' }, { t: '¿a qué te dedicas?', n: 'what do you do?' }, { t: '¿tienes hermanos?', n: 'do you have siblings?' }, { t: '¿qué te gusta?', n: 'what do you like?' }, { t: '¿y a ti?', n: 'and you?' }],
    grammar: 'questions with tú; intonation', elicit: ['Ahora entrevístame tú: hazme tres preguntas.', 'Pregúntame algo sobre mi familia.'],
  },
  // ---------- Level 3 · Your day ----------
  {
    id: 'es.3.routine', level: 3, title: 'Describe your routine',
    items: [{ t: 'me levanto', n: 'I get up' }, { t: 'me ducho', n: 'I shower' }, { t: 'desayuno', n: 'I have breakfast' }, { t: 'salgo de casa', n: 'I leave home' }, { t: 'vuelvo', n: 'I come back' }, { t: 'me acuesto', n: 'I go to bed' }, { t: 'madrugar', n: 'to get up very early' }],
    grammar: 'reflexive verbs; irregular salgo / vuelvo', elicit: ['Cuéntame tu mañana, desde que te levantas.', '¿A qué hora te acuestas normalmente?'],
  },
  {
    id: 'es.3.yesterday', level: 3, title: 'Say what you did yesterday',
    items: [{ t: 'ayer', n: 'yesterday' }, { t: 'fui', n: 'I went' }, { t: 'hice', n: 'I did / made' }, { t: 'comí', n: 'I ate' }, { t: 'vi', n: 'I saw' }, { t: 'trabajé', n: 'I worked' }, { t: 'anoche', n: 'last night' }],
    grammar: 'regular preterite; ir, hacer, ver', elicit: ['¿Qué hiciste ayer por la tarde?', '¿Adónde fuiste anoche?'],
  },
  {
    id: 'es.3.weekend', level: 3, title: 'Tell your weekend in order',
    items: [{ t: 'el fin de semana pasado', n: 'last weekend' }, { t: 'primero', n: 'first' }, { t: 'luego', n: 'then' }, { t: 'después', n: 'afterwards' }, { t: 'al final', n: 'in the end' }, { t: 'fuimos', n: 'we went' }, { t: 'nos quedamos en casa', n: 'we stayed home' }],
    grammar: 'preterite in the plural; sequencing words', elicit: ['Cuéntame tu fin de semana, desde el sábado por la mañana.', '¿Qué hicisteis el domingo?'],
  },
  {
    id: 'es.3.now', level: 3, title: 'Say what you are doing right now',
    items: [{ t: 'estoy trabajando', n: 'I am working' }, { t: 'estoy comiendo', n: 'I am eating' }, { t: 'estoy esperando', n: 'I am waiting' }, { t: 'ahora mismo', n: 'right now' }, { t: 'todavía', n: 'still' }],
    grammar: 'estar + gerund', elicit: ['¿Qué estás haciendo ahora mismo, aparte de hablar conmigo?', '¿Dónde estás y qué está pasando a tu alrededor?'],
  },
  {
    id: 'es.3.directions', level: 3, title: 'Give and follow directions',
    items: [{ t: 'gira a la derecha', n: 'turn right' }, { t: 'sigue recto', n: 'go straight' }, { t: 'la segunda calle', n: 'the second street' }, { t: 'cruza la plaza', n: 'cross the square' }, { t: 'está a cinco minutos', n: 'it is five minutes away' }, { t: 'perdona, ¿la estación?', n: 'excuse me, the station?' }],
    grammar: 'tú imperative of regular verbs', elicit: ['Estoy en la puerta de tu casa. ¿Cómo llego a tu café favorito?', 'Explícame cómo ir de tu casa al supermercado.'],
  },
  {
    id: 'es.3.health', level: 3, title: 'Talk about health and the body',
    items: [{ t: 'me duele la cabeza', n: 'my head hurts' }, { t: 'tengo fiebre', n: 'I have a fever' }, { t: 'estoy resfriado', n: 'I have a cold' }, { t: 'la espalda', n: 'the back' }, { t: 'el estómago', n: 'the stomach' }, { t: 'me encuentro mal', n: 'I feel unwell' }],
    grammar: 'doler like gustar; body parts with the article', elicit: ['¿Cuándo fue la última vez que estuviste enfermo? ¿Qué te dolía?', 'Si te duele la cabeza, ¿qué haces?'],
  },
  {
    id: 'es.3.food', level: 3, title: 'Talk about food in detail',
    items: [{ t: 'picante', n: 'spicy' }, { t: 'dulce', n: 'sweet' }, { t: 'salado', n: 'salty' }, { t: 'lleva', n: 'it has (ingredients)' }, { t: 'sin', n: 'without' }, { t: 'algo rico', n: 'something tasty' }, { t: 'está buenísimo', n: 'it is delicious' }],
    grammar: 'llevar for ingredients; estar for taste', elicit: ['¿Cuál es tu plato favorito y qué lleva?', '¿Qué comiste hoy? ¿Estaba bueno?'],
  },
  {
    id: 'es.3.scene', level: 3, title: 'Set the scene of a story',
    items: [{ t: 'había mucha gente', n: 'there were a lot of people' }, { t: 'hacía sol', n: 'it was sunny' }, { t: 'era tarde', n: 'it was late' }, { t: 'estaba cansado', n: 'I was tired' }, { t: 'mientras', n: 'while' }, { t: 'de repente', n: 'suddenly' }],
    grammar: 'imperfect for background: había, hacía, era, estaba', elicit: ['Cuéntame la última vez que fuiste a la playa o al campo. ¿Cómo estaba el día?', '¿Cómo era el sitio donde creciste?'],
  },
  {
    id: 'es.3.invite', level: 3, title: 'Invite, accept, and decline',
    items: [{ t: '¿quieres venir?', n: 'do you want to come?' }, { t: 'me encantaría', n: 'I would love to' }, { t: 'no puedo, lo siento', n: 'I can’t, sorry' }, { t: '¿te apetece?', n: 'do you feel like it?' }, { t: 'otro día', n: 'another day' }, { t: 'vale', n: 'okay' }],
    grammar: 'apetecer like gustar; conditional me encantaría as a chunk', elicit: ['Invítame a hacer algo este fin de semana.', 'Te invito al cine el viernes. ¿Vienes?'],
  },
  {
    id: 'es.3.trip', level: 3, title: 'Talk about a trip',
    items: [{ t: 'viajé a', n: 'I traveled to' }, { t: 'el hotel', n: 'the hotel' }, { t: 'el vuelo', n: 'the flight' }, { t: 'nos quedamos', n: 'we stayed' }, { t: 'visitamos', n: 'we visited' }, { t: 'lo pasé genial', n: 'I had a great time' }, { t: 'una semana', n: 'a week' }],
    grammar: 'preterite with time spans; quedarse', elicit: ['Háblame de tu último viaje: ¿adónde fuiste y cuánto tiempo?', '¿Qué visitaste y qué fue lo mejor?'],
  },
]

const ZH: CanDo[] = [
  {
    id: 'zh.1.greet', level: 1, title: 'Greet and say goodbye',
    items: [{ t: '你好', n: 'hello', p: 'nǐ hǎo' }, { t: '早上好', n: 'good morning', p: 'zǎoshang hǎo' }, { t: '再见', n: 'goodbye', p: 'zàijiàn' }, { t: '明天见', n: 'see you tomorrow', p: 'míngtiān jiàn' }, { t: '谢谢', n: 'thank you', p: 'xièxie' }, { t: '不客气', n: 'you’re welcome', p: 'bú kèqi' }],
    grammar: 'fixed greetings', elicit: ['你好！', '我们明天再聊，怎么说再见？'],
  },
  {
    id: 'zh.1.who', level: 1, title: 'Say who you are',
    items: [{ t: '我叫', n: 'my name is', p: 'wǒ jiào' }, { t: '我是美国人', n: 'I am American', p: 'wǒ shì měiguó rén' }, { t: '我住在', n: 'I live in', p: 'wǒ zhù zài' }, { t: '我今年…岁', n: 'I am … years old', p: 'wǒ jīnnián … suì' }, { t: '你呢？', n: 'and you?', p: 'nǐ ne?' }],
    grammar: '是 sentences; 叫; 呢 for and-you', elicit: ['你叫什么名字？', '你是哪国人？', '你住在哪儿？'],
  },
  {
    id: 'zh.1.work', level: 1, title: 'Say what you do',
    items: [{ t: '我工作', n: 'I work', p: 'wǒ gōngzuò' }, { t: '我是老师', n: 'I am a teacher', p: 'wǒ shì lǎoshī' }, { t: '学生', n: 'student', p: 'xuésheng' }, { t: '公司', n: 'company', p: 'gōngsī' }, { t: '在家', n: 'at home', p: 'zài jiā' }],
    grammar: '在 + place + verb', elicit: ['你做什么工作？', '你在家工作吗？'],
  },
  {
    id: 'zh.1.like', level: 1, title: 'Say what you like',
    items: [{ t: '我喜欢', n: 'I like', p: 'wǒ xǐhuan' }, { t: '我不喜欢', n: 'I don’t like', p: 'wǒ bù xǐhuan' }, { t: '很喜欢', n: 'like a lot', p: 'hěn xǐhuan' }, { t: '咖啡', n: 'coffee', p: 'kāfēi' }, { t: '茶', n: 'tea', p: 'chá' }, { t: '音乐', n: 'music', p: 'yīnyuè' }],
    grammar: '喜欢 + noun / verb; 不 negation', elicit: ['你喜欢做什么？', '你喜欢咖啡还是茶？'],
  },
  {
    id: 'zh.1.questions', level: 1, title: 'Ask the simple questions',
    items: [{ t: '什么', n: 'what', p: 'shénme' }, { t: '哪儿', n: 'where', p: 'nǎr' }, { t: '谁', n: 'who', p: 'shéi' }, { t: '什么时候', n: 'when', p: 'shénme shíhou' }, { t: '为什么', n: 'why', p: 'wèishénme' }, { t: '吗', n: 'yes/no question particle', p: 'ma' }],
    grammar: 'question words in place; 吗', elicit: ['现在你问我一个问题。', '你想知道我什么？'],
  },
  {
    id: 'zh.1.numbers', level: 1, title: 'Count, and say the day',
    items: [{ t: '一二三', n: 'one two three', p: 'yī èr sān' }, { t: '十', n: 'ten', p: 'shí' }, { t: '一百', n: 'a hundred', p: 'yìbǎi' }, { t: '星期一', n: 'Monday', p: 'xīngqīyī' }, { t: '今天', n: 'today', p: 'jīntiān' }, { t: '明天', n: 'tomorrow', p: 'míngtiān' }, { t: '几', n: 'how many', p: 'jǐ' }],
    grammar: 'numbers; 星期 + number; measure word 个', elicit: ['今天星期几？', '你家有几个人？'],
  },
  {
    id: 'zh.1.feel', level: 1, title: 'Say how you feel',
    items: [{ t: '我很好', n: 'I am fine', p: 'wǒ hěn hǎo' }, { t: '我很累', n: 'I am tired', p: 'wǒ hěn lèi' }, { t: '我很高兴', n: 'I am happy', p: 'wǒ hěn gāoxìng' }, { t: '我饿了', n: 'I am hungry', p: 'wǒ è le' }, { t: '还可以', n: 'so-so', p: 'hái kěyǐ' }],
    grammar: '很 + adjective; 了 for change of state', elicit: ['你今天怎么样？', '你累不累？'],
  },
  {
    id: 'zh.1.repair', level: 1, title: 'Say you don’t understand',
    items: [{ t: '我不懂', n: 'I don’t understand', p: 'wǒ bù dǒng' }, { t: '请再说一遍', n: 'please say it again', p: 'qǐng zài shuō yí biàn' }, { t: '慢一点', n: 'a bit slower', p: 'màn yìdiǎn' }, { t: '…是什么意思？', n: 'what does … mean?', p: '… shì shénme yìsi?' }, { t: '用中文怎么说？', n: 'how do you say it in Chinese?', p: 'yòng zhōngwén zěnme shuō?' }],
    grammar: 'fixed phrases', elicit: ['我说一个难的句子，你请我帮忙：“我昨天起得特别早。”', '听不懂的时候，你怎么说？'],
  },
  // ---------- Level 2 ----------
  {
    id: 'zh.2.order', level: 2, title: 'Order and ask for things',
    items: [{ t: '我要', n: 'I want', p: 'wǒ yào' }, { t: '我想要', n: 'I would like', p: 'wǒ xiǎng yào' }, { t: '一杯咖啡', n: 'a cup of coffee', p: 'yì bēi kāfēi' }, { t: '买单', n: 'the bill', p: 'mǎidān' }, { t: '有没有…？', n: 'do you have …?', p: 'yǒu méiyǒu …?' }, { t: '多少钱？', n: 'how much?', p: 'duōshao qián?' }],
    grammar: '要 / 想要; measure words 杯 / 个; 有没有', elicit: ['我是服务员，你想喝什么？', '你平时在咖啡店点什么？'],
  },
  {
    id: 'zh.2.where', level: 2, title: 'Say where things are',
    items: [{ t: '在…旁边', n: 'next to', p: 'zài … pángbiān' }, { t: '附近', n: 'nearby', p: 'fùjìn' }, { t: '很远', n: 'far', p: 'hěn yuǎn' }, { t: '前面', n: 'in front', p: 'qiánmiàn' }, { t: '有', n: 'there is', p: 'yǒu' }, { t: '右边', n: 'right side', p: 'yòubian' }],
    grammar: '在 + place word; 有 for existence', elicit: ['你家附近有什么？', '你最喜欢的咖啡店在哪儿？'],
  },
  {
    id: 'zh.2.time', level: 2, title: 'Tell the time and make a plan',
    items: [{ t: '八点', n: 'eight o’clock', p: 'bā diǎn' }, { t: '早上', n: 'morning', p: 'zǎoshang' }, { t: '晚上', n: 'evening', p: 'wǎnshang' }, { t: '星期六', n: 'Saturday', p: 'xīngqīliù' }, { t: '我打算', n: 'I plan to', p: 'wǒ dǎsuàn' }, { t: '一起', n: 'together', p: 'yìqǐ' }],
    grammar: 'time before the verb; 打算 / 要 for plans', elicit: ['你星期六打算做什么？', '你每天几点起床？'],
  },
  {
    id: 'zh.2.week', level: 2, title: 'Talk about your week',
    items: [{ t: '每天', n: 'every day', p: 'měitiān' }, { t: '常常', n: 'often', p: 'chángcháng' }, { t: '有时候', n: 'sometimes', p: 'yǒu shíhou' }, { t: '从来不', n: 'never', p: 'cónglái bù' }, { t: '上班', n: 'go to work', p: 'shàngbān' }, { t: '休息', n: 'rest', p: 'xiūxi' }],
    grammar: 'frequency adverbs before the verb', elicit: ['你的一个星期是什么样的？', '你星期一做什么？'],
  },
  {
    id: 'zh.2.weather', level: 2, title: 'Talk about the weather',
    items: [{ t: '今天很热', n: 'it is hot today', p: 'jīntiān hěn rè' }, { t: '很冷', n: 'cold', p: 'hěn lěng' }, { t: '下雨', n: 'it rains', p: 'xià yǔ' }, { t: '晴天', n: 'sunny day', p: 'qíngtiān' }, { t: '天气', n: 'weather', p: 'tiānqì' }],
    grammar: 'adjective predicates with 很', elicit: ['你那儿今天天气怎么样？', '你喜欢冷还是热？'],
  },
  {
    id: 'zh.2.home', level: 2, title: 'Talk about your home and your city',
    items: [{ t: '房子', n: 'house', p: 'fángzi' }, { t: '公寓', n: 'apartment', p: 'gōngyù' }, { t: '安静', n: 'quiet', p: 'ānjìng' }, { t: '热闹', n: 'lively / noisy', p: 'rènao' }, { t: '很大', n: 'big', p: 'hěn dà' }, { t: '很小', n: 'small', p: 'hěn xiǎo' }],
    grammar: 'adjective predicates; 的 for description', elicit: ['你住的地方怎么样？', '你住房子还是公寓？'],
  },
  {
    id: 'zh.2.can', level: 2, title: 'Say what you can and can’t do',
    items: [{ t: '我会游泳', n: 'I can swim', p: 'wǒ huì yóuyǒng' }, { t: '我不能', n: 'I can’t', p: 'wǒ bù néng' }, { t: '可以', n: 'may / can', p: 'kěyǐ' }, { t: '一点儿', n: 'a little', p: 'yìdiǎnr' }, { t: '还不会', n: 'not yet able', p: 'hái bú huì' }],
    grammar: '会 vs 能 vs 可以', elicit: ['你会做什么？', '你会做饭吗？'],
  },
  {
    id: 'zh.2.askback', level: 2, title: 'Ask someone about themselves',
    items: [{ t: '你是哪里人？', n: 'where are you from?', p: 'nǐ shì nǎlǐ rén?' }, { t: '你做什么工作？', n: 'what do you do?', p: 'nǐ zuò shénme gōngzuò?' }, { t: '你有兄弟姐妹吗？', n: 'do you have siblings?', p: 'nǐ yǒu xiōngdì jiěmèi ma?' }, { t: '你喜欢什么？', n: 'what do you like?', p: 'nǐ xǐhuan shénme?' }],
    grammar: 'questions with 吗 and question words', elicit: ['现在你来问我：问我三个问题。', '问问我的家人。'],
  },
]

const BY_LANG: Record<LanguageCode, CanDo[]> = { es: ES, zh: ZH }

export function canDos(lang: LanguageCode, level?: number): CanDo[] {
  const all = BY_LANG[lang]
  return level === undefined ? all : all.filter((c) => c.level === level)
}

export function canDoById(lang: LanguageCode, id: string): CanDo | undefined {
  return BY_LANG[lang].find((c) => c.id === id)
}

/** The highest level that has content for a language. */
export function topAuthoredLevel(lang: LanguageCode): number {
  return Math.max(0, ...BY_LANG[lang].map((c) => c.level))
}

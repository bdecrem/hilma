// Rock Paper Anything — the enemy catalog, shared by the client (names,
// glyphs, hit points) and the judge route (names + boss conditions become the
// questions Jev answers). Jev does not write text, so every enemy is authored
// here. `answers` are phrases a player might plausibly type; they are never
// shown — scripts/rpa/solvable-check.ts fires them at the live model to prove
// each enemy can be beaten.
//
// Names stay under ~24 characters: a tag has to fit a phone-width field.

export type Tier = 1 | 2 | 3 | 4

export type Enemy = {
  id: string
  /** As it reads in the question: "… would defeat, stop, or neutralize <name>." */
  name: string
  glyph: string
  tier: Tier
  answers: string[]
  boss?: {
    /** Shown on the tag. */
    rule: string
    /** A second noul; damage is limited by it. */
    condition: string
  }
}

const e = (id: string, name: string, glyph: string, tier: Tier, answers: string[]): Enemy => ({ id, name, glyph, tier, answers })

export const ENEMIES: Enemy[] = [
  // Tier 1 — concrete things with obvious counters.
  e('campfire', 'a campfire', '🔥', 1, ['a bucket of water', 'rain']),
  e('candle', 'a candle', '🕯️', 1, ['a gust of wind', 'a wet thumb']),
  e('padlock', 'a padlock', '🔒', 1, ['a key', 'bolt cutters']),
  e('mosquito', 'a mosquito', '🦟', 1, ['bug spray', 'a fly swatter']),
  e('balloon', 'a balloon', '🎈', 1, ['a pin', 'a cactus']),
  e('snowman', 'a snowman', '⛄', 1, ['a hair dryer', 'the sun']),
  e('weed', 'a garden weed', '🌿', 1, ['a trowel', 'a hungry goat']),
  e('stain', 'a wine stain', '🍷', 1, ['bleach', 'club soda']),
  e('flat-tire', 'a flat tire', '🛞', 1, ['a spare tire', 'a bicycle pump']),
  e('ice-cube', 'an ice cube', '🧊', 1, ['a hot cup of tea', 'a blowtorch']),
  e('knot', 'a stubborn knot', '🪢', 1, ['scissors', 'nimble fingers']),
  e('wasp-nest', 'a wasp nest', '🐝', 1, ['wasp spray', 'an exterminator']),
  e('sunburn', 'a sunburn', '🥵', 1, ['aloe vera', 'a parasol']),
  e('dead-battery', 'a dead battery', '🪫', 1, ['a charger', 'jumper cables']),
  e('squeaky-hinge', 'a squeaky hinge', '🚪', 1, ['a drop of oil', 'WD-40']),
  e('splinter', 'a splinter', '🪵', 1, ['tweezers', 'a needle']),
  e('fog', 'a foggy windshield', '🌫️', 1, ['the defroster', 'a dry cloth']),
  e('mousetrap', 'a mouse in the pantry', '🐭', 1, ['a cat', 'a mousetrap']),

  // Tier 2 — creatures and people.
  e('vampire', 'a vampire', '🧛', 2, ['sunrise', 'a wooden stake']),
  e('dragon', 'a dragon', '🐉', 2, ['a knight with a lance', 'a dragon slayer']),
  e('werewolf', 'a werewolf', '🐺', 2, ['a silver bullet', 'sunrise']),
  e('ghost', 'a ghost', '👻', 2, ['an exorcist', 'a ghost trap']),
  e('zombie', 'a zombie', '🧟', 2, ['a shotgun', 'a chainsaw']),
  e('toddler', 'a toddler mid-tantrum', '👶', 2, ['a long nap', 'a favourite snack']),
  e('bureaucrat', 'a bureaucrat', '🗂️', 2, ['red tape scissors', 'a complaint to their manager']),
  e('telemarketer', 'a telemarketer', '☎️', 2, ['hanging up', 'a call blocker']),
  e('pirate', 'a pirate', '🏴‍☠️', 2, ['the navy', 'a cannonball']),
  e('robot', 'a rogue robot', '🤖', 2, ['a bucket of water', 'an off switch']),
  e('troll', 'an internet troll', '🧌', 2, ['the block button', 'ignoring them']),
  e('bully', 'a schoolyard bully', '😠', 2, ['standing up to them', 'the principal']),
  e('bear', 'an angry bear', '🐻', 2, ['bear spray', 'a tranquilizer dart']),
  e('shark', 'a shark', '🦈', 2, ['an orca', 'dry land']),
  e('seagull', 'a fry-stealing seagull', '🐦', 2, ['a hawk', 'an umbrella']),
  e('knight', 'a knight in armour', '🛡️', 2, ['a crossbow', 'a mace']),
  e('salesman', 'a door-to-door salesman', '🧳', 2, ['a closed door', 'a no soliciting sign']),
  e('mad-scientist', 'a mad scientist', '🧪', 2, ['a superhero', 'an angry mob']),
  e('locusts', 'a swarm of locusts', '🦗', 2, ['a flock of birds', 'pesticide']),
  e('squid', 'a giant squid', '🦑', 2, ['a sperm whale', 'a harpoon']),

  // Tier 3 — situations.
  e('monday', 'Monday morning', '📅', 3, ['coffee', 'a public holiday']),
  e('hangover', 'a hangover', '🤕', 3, ['water and a long nap', 'a greasy breakfast']),
  e('traffic-jam', 'a traffic jam', '🚗', 3, ['a bicycle', 'the subway']),
  e('writers-block', "writer's block", '✍️', 3, ['a deadline', 'a long walk']),
  e('rumor', 'a rumour', '🗣️', 3, ['the truth', 'hard evidence']),
  e('deadline', 'a looming deadline', '⏰', 3, ['finishing the work early', 'a time machine']),
  e('hiccups', 'the hiccups', '😮', 3, ['holding your breath', 'a sudden scare']),
  e('jet-lag', 'jet lag', '✈️', 3, ['morning sunlight', 'a good night of sleep']),
  e('bad-haircut', 'a bad haircut', '💇', 3, ['a hat', 'time']),
  e('awkward-silence', 'an awkward silence', '😶', 3, ['a good joke', 'small talk']),
  e('paywall', 'a paywall', '💳', 3, ['a credit card', 'a free trial']),
  e('spam', 'spam email', '📧', 3, ['a spam filter', 'the unsubscribe link']),
  e('meeting', 'a pointless meeting', '📊', 3, ['an email instead', 'a fire drill']),
  e('bug', 'a software bug', '🐛', 3, ['a debugger', 'a unit test']),
  e('procrastination', 'procrastination', '🛋️', 3, ['a deadline', 'a to-do list']),
  e('parking-ticket', 'a parking ticket', '🅿️', 3, ['paying the fine', 'a good lawyer']),
  e('wifi-outage', 'a wifi outage', '📶', 3, ['restarting the router', 'an ethernet cable']),
  e('stage-fright', 'stage fright', '🎤', 3, ['rehearsal', 'a deep breath']),
  e('earworm', 'an earworm', '🎵', 3, ['a different song', 'a catchier song']),
  e('leaky-roof', 'a leaky roof', '🏚️', 3, ['a roofer', 'a bucket']),

  // Tier 4 — forces and feelings.
  e('loneliness', 'loneliness', '🌑', 4, ['a good friend', 'a dog']),
  e('darkness', 'darkness', '⬛', 4, ['sunrise', 'a flashlight']),
  e('boredom', 'boredom', '🥱', 4, ['a good book', 'a new hobby']),
  e('ocean', 'the ocean', '🌊', 4, ['a sturdy ship', 'a sea wall']),
  e('avalanche', 'an avalanche', '🏔️', 4, ['a snow fence', 'an avalanche barrier']),
  e('glacier', 'a glacier', '❄️', 4, ['global warming', 'a very long summer']),
  e('hurricane', 'a hurricane', '🌀', 4, ['a storm shelter', 'cold ocean water']),
  e('winter', 'winter', '🌨️', 4, ['spring', 'a wool coat']),
  e('gravity', 'gravity', '🍎', 4, ['a rocket', 'a hot air balloon']),
  e('silence', 'silence', '🤫', 4, ['a brass band', 'a crying baby']),
  e('jealousy', 'jealousy', '💚', 4, ['gratitude', 'trust']),
  e('greed', 'greed', '🤑', 4, ['generosity', 'a tax audit']),
  e('doubt', 'self-doubt', '🫥', 4, ['encouragement', 'practice']),
  e('nostalgia', 'nostalgia', '📼', 4, ['living in the present', 'a new adventure']),
  e('drought', 'a drought', '🏜️', 4, ['a week of rain', 'an irrigation canal']),
  e('wildfire', 'a wildfire', '🌲', 4, ['a firebreak', 'a rainstorm']),
  e('fear', 'fear of the dark', '😨', 4, ['a night light', 'a parent']),
  e('entropy', 'entropy', '♾️', 4, ['a refrigerator', 'a tidy person']),
  e('grudge', 'an old grudge', '🪨', 4, ['an apology', 'forgiveness']),
  e('insomnia', 'insomnia', '🌙', 4, ['a sleeping pill', 'chamomile tea']),
]

const boss = (id: string, name: string, glyph: string, tier: Tier, rule: string, condition: string, answers: string[]): Enemy => ({
  id, name, glyph, tier, answers, boss: { rule, condition },
})

// A boss is an ordinary enemy with a rule: a second question the phrase must
// also pass. The rule has to leave room for honest counters — "a dragon that
// only kitchen things hurt" read well and was unbeatable (nothing in a kitchen
// scores over 0.4 against a dragon).
export const BOSSES: Enemy[] = [
  boss('boss-grease-fire', 'a grease fire', '🍳', 2, 'only kitchen things hurt it', '`attack` is something commonly found in a kitchen.', ['a pot lid', 'baking soda', 'a damp dish towel']),
  boss('boss-vampire', 'a vampire lord', '🧛‍♂️', 3, 'only food and drink hurt it', '`attack` is something a person can eat or drink.', ['garlic', 'holy water', 'garlic bread', 'garlic soup']),
  boss('boss-mice', 'an army of mice', '🐁', 3, 'only living things hurt it', '`attack` is a living thing: an animal, a plant, or a person.', ['a cat', 'an owl', 'a terrier']),
  boss('boss-blizzard', 'a blizzard', '🌬️', 4, 'only things you can wear hurt it', '`attack` is something a person can wear.', ['a wool coat', 'snow boots', 'a fur hat']),
  boss('boss-chest', 'a locked treasure chest', '🧰', 4, 'only pocket-sized things hurt it', '`attack` is an object small enough to fit in a pocket.', ['a key', 'a lockpick', 'a hairpin']),
]

const BY_ID = new Map<string, Enemy>([...ENEMIES, ...BOSSES].map((x) => [x.id, x]))

export function enemyById(id: string): Enemy | undefined {
  return BY_ID.get(id)
}

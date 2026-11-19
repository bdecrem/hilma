// The stand-in for every AI call a built app makes: the same words in the shapes the common APIs
// answer with. Two word sets, alternated per call, so a new puzzle can differ.
export const AI_HOSTS = /anthropic\.com|openai\.com|together\.(xyz|ai)|groq\.com|openrouter\.ai|generativelanguage\.googleapis|mistral\.ai|huggingface\.co|cohere\.(ai|com)|deepseek|ollama|:11434|:1234\/v1|api\.x\.ai|perplexity\.ai/i

// Two word sets, alternated per call, so "a new puzzle" can differ. Crossword-friendly words with
// shared letters.
const SETS = [
  { theme: 'Garden', words: [['TOMATO', 'Red fruit often mistaken for a vegetable'], ['POTATO', 'Tuber for fries'], ['ONION', 'It can make you cry'], ['CARROT', 'Orange root a rabbit loves'], ['BEAN', 'Climbing legume'], ['PEA', 'Small green pod seed'], ['RADISH', 'Peppery red root'], ['LETTUCE', 'Salad leaf'], ['MINT', 'Herb for tea'], ['BASIL', 'Pesto herb'], ['SOIL', 'What plants grow in'], ['RAIN', 'Water from the sky'], ['SEED', 'Where a plant begins'], ['ROSE', 'Thorny flower'], ['TREE', 'Oak or elm']] },
  { theme: 'Ocean', words: [['WHALE', 'Largest animal on Earth'], ['SHARK', 'Finned predator'], ['CORAL', 'Reef builder'], ['WAVE', 'Surfer ride'], ['SAND', 'Beach grains'], ['CRAB', 'Sideways walker'], ['TIDE', 'It comes in and goes out'], ['SALT', 'Sea water has it'], ['SEAL', 'Barking swimmer'], ['OCTOPUS', 'Eight-armed creature'], ['SQUID', 'Inky swimmer'], ['REEF', 'Underwater ridge'], ['EEL', 'Slippery fish'], ['KELP', 'Sea forest plant'], ['STARFISH', 'Five-armed echinoderm']] },
]
let stubCalls = 0
export function stubBody() {
  const s = SETS[stubCalls++ % SETS.length]
  const words = s.words.map(([w, c]) => ({ word: w, answer: w, clue: c, hint: c }))
  const payload = { theme: s.theme, title: `${s.theme} puzzle`, words, entries: words.map((w) => ({ answer: w.answer, clue: w.clue })), clues: words.map((w) => ({ answer: w.answer, clue: w.clue })) }
  const text = JSON.stringify(payload)
  return JSON.stringify({
    ...payload,
    // Anthropic Messages
    id: 'msg_stub', type: 'message', role: 'assistant', model: 'stub', stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    // OpenAI chat / completions
    choices: [{ index: 0, message: { role: 'assistant', content: text }, text, finish_reason: 'stop' }],
    // Ollama generate / chat
    response: text, message: { role: 'assistant', content: text }, done: true,
    // Gemini
    candidates: [{ content: { parts: [{ text }] } }],
    output_text: text,
  })
}


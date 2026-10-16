// The fourteen steps of apps/smallgpt/PLAN.md, as the page shows them.
// When a step finishes: set status 'done', add the date and Bart's own summary
// of it, and move 'next' down one row. Keep PLAN.md's status column in step.

export type Step = {
  n: number | string  // '6b' etc. for a side step, not counted in the fourteen
  name: string
  idea: string
  status: 'done' | 'next' | 'todo'
  doneOn?: string
  // What Bart said the step was, in his words, once he had done it. A blank line starts a new paragraph.
  summary?: string
  // Pictures under the summary, side by side.
  figures?: { src: string; alt: string; caption: string }[]
  // Pages that go with the step.
  links?: { href: string; label: string }[]
  // Prompts and what the model wrote after them, shown as prompt | continuation.
  examples?: { prompt: string; out: string }[]
  // What we saw when it ran.
  saw?: string
}

// The fourteen numbered steps; side steps like '6b' show on the page but don't count.
export const counted = (steps: Step[]) => steps.filter((s) => typeof s.n === 'number')

export const STARTED = '2026-10-12'

export const STEPS: Step[] = [
  {
    n: 0,
    name: 'Environment',
    idea: 'Python, PyTorch on Apple silicon, the repo layout',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'We installed PyTorch, the big library everyone uses for AI training. It makes it easy to set up tensors (x-dimensional matrices) and do matrix multiplication, and it computes the gradients for you — the part training depends on.',
    saw: 'Both machines see the Apple GPU: a 4096×4096 matrix multiply runs 2.5× faster on the GPU than on the CPU on the iMac, 2.2× on the Mac mini.',
  },
  {
    n: 1,
    name: 'Backpropagation from scratch',
    idea: 'The chain rule, written as code (micrograd)',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'We built a backpropagation machine from scratch. This is the machinery that calculates the gradients for gradient descent: for each step of training, it figures out in which direction and by how much to nudge each weight. PyTorch does this for us, but we built it from scratch for educational purposes. To test it we made a data set of 4 cards, each with 3 numbers and a hidden correct answer (+1 or −1), and a 41-parameter model to go with it — think of it as a Tiny Small Numbers Model. We ran the 4 cards through the model and ran backprop 20 times to nudge the weights, to see if our gradient descent machine works. It does. Yeay.',
    saw: 'The loss fell from 6.0 to 0.06 in 20 rounds; the guesses came out +0.86, −0.98, −0.86, +0.86 for answers +1, −1, −1, +1. Another 20 rounds took the loss to 0.017 and the guesses to +0.92, −0.99, −0.93, +0.92, each round gaining less than the one before — tanh never quite reaches ±1. And a drawing of one neuron’s math with every number’s gradient on it.',
  },
  {
    n: 2,
    name: 'Tokenizer',
    idea: 'How text becomes numbers (byte-pair encoding)',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'We built a tokenizer. First we decided on a training corpus: we’re going to build the LLM that’s the “man in the Mac Plus from 1985”, and for that we use TinyStories (children’s stories) plus a famous 1985 Usenet dataset — about 400 MB in total. We grabbed a 4 MB sample (3 MB stories, 1 MB Usenet, from all through both files). Then we wrote the tokenizer, and that’s just a little function where we decide (1) we’ll have 8,192 tokens, (2) the first 256 are the individual bytes — letters and other characters, (3) then we start pairing up sets of two tokens based on how popular they are, round after round, until all the tokens are assigned. In the end we have, for instance, a token for Macintosh, since that was very present in the sample. Voilà: a .json file with 7,935 rules that each say “this token is this pair of earlier tokens”, and nowhere does it say “Macintosh is token 5729” — the code works its way back from the 256 bytes to what the text for each token is.',
    saw: 'The corpus: 314 MB of TinyStories (384k children’s stories) plus 81 MB of 1980s Usenet from the Mac Plus Oracle project (114k posts) — the model will end up talking like a 1985 coder stuck in a Mac Plus. The tokenizer trained on a 4 MB sample in two minutes: merge 1 was “ ”+“t”, merge 7 made “ the”, merge 2,250 made “ machine”. At a vocabulary of 8,192, king, queen, man, woman, computer, Macintosh, unix, modem are one token each (at 4,096 queen was q|ue|en and Macintosh was Mac|into|sh). A story sentence is one token per word; the whole corpus is about 101 million tokens.',
  },
  {
    n: 3,
    name: 'The dataset and the objective',
    idea: 'Next-token prediction is the whole game',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'In the previous step we built our tokenizer; now we run the entire training set through it. We have about 400 MB of text and we convert all of it into token identifiers: just one big, long string of tokens. The resulting file is about half the size of the original, which makes sense — this is a form of compression (about 4 characters become one 2-byte number). Then we wrote a cute little function that creates two tensors, two little matrices. We’re batching up the tokens: picking fragments of 256 tokens from random spots in that long string, 64 at a time, to train on. The second tensor, y, is the matching one: the same fragments shifted one token to the right, so for every position in x it says what came next in the real text. That’s 256 answers per fragment, and it’s what lets us judge how good each next-token prediction was.',
    saw: 'The whole corpus went through the tokenizer in 9 seconds: 100,119,743 tokens exactly — 75.7 M from the stories, 24.4 M from Usenet (76% / 24%). 99.1 M went into train.bin, and every 100th document (1.0 M tokens) into val.bin, which the model never trains on. One batch is two tensors: x = a window of tokens (“ and saw the dead bird. She told Tim that sometimes birds”), y = the same window moved one to the right (“ saw the dead bird. She told Tim that sometimes birds die”). Every column says “after this, the next token is that”. That is the entire training signal.',
  },
  {
    n: 4,
    name: 'The simplest language model',
    idea: 'Embeddings, logits, softmax, cross-entropy (bigram)',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'In this step we build the simplest possible token prediction model. No attention at all. The table has 8,192 rows, one per token, and each row has 8,192 numbers: a score for each token that could come next, all random to start. We look at what the actual next token is and nudge the numbers accordingly. We do that updating in batches: 64 text snippets of 256 tokens each. The scores are called logits. Softmax is the function that converts a row of logits into probabilities, and from those we calculate the cross-entropy loss: if the model gave a tiny probability to the token that actually came next, the loss is high and we nudge that token’s score up by a lot.',
    saw: 'The table is 8,192 × 8,192 = 67 million random numbers. Before training, the right next token got a probability of 0.00005 and the loss was 9.9 (pure guessing is ln 8,192 = 9.0); we computed that loss by hand — softmax, then minus the log — and got the same number as PyTorch. 3,000 rounds of 64 × 256 tokens took 7½ minutes on the GPU: the loss fell fast to 5 in 500 rounds, then slowly, and levelled off at 4.2 — the ceiling for a model that sees one token. Train and val stayed together: nothing to memorize. The samples are gibberish with the corpus’s flavor: “Once upon tie the stranger”, “a big and cheerful little girl named Tim was safe”. The rows show what it learned: after “.” comes “ They”, “ He”, “ The”, “ She”; after “ Tim” comes “ was”, “.”, “ and”; after “ Once” comes “ upon”; after “ Macintosh” comes “ software”.',
  },
  {
    n: 5,
    name: 'Attention and the Transformer block',
    idea: 'How tokens look at each other',
    status: 'done',
    doneOn: '2026-10-12',
    summary:
      'In step 5 we created an attention loop. Our previous next-token predictor was not attention based: each token had a row of 8,192 values in the table, one score for every token that could come next. Now, instead, we have an embedding table with 128 values per token, best thought of as “our token as a point in a 128-dimensional space”. The way the attention model works is that each token looks at every preceding token in the text fragment, all at the same time, using a query, a key and a value (QKV), and pulls in what’s useful. A small neural net then works on the token’s updated vector, and an output table turns it into a probability for each of the 8,192 tokens to be the next one. We compare that prediction against the ACTUAL next token: that is our error. We add up the errors from all 64 text fragments in the batch, then backpropagation walks backwards through the computation that led to the predictions and tells us, for every weight in the model, in which direction and by how much to nudge it to do better next time; gradient descent applies those nudges, and voilà, we have tweaked our model. When we’ve processed a batch of 64 snippets of 256 tokens, we have an error for each PREDICTION: at every position the model gave 8,192 probabilities, and the error is just how little probability it gave the token that actually came next. 16,384 of those, averaged, is the batch’s error. The bigram model’s final error was 4.19. The attention model’s was 3.72, and still coming down. Note: we haven’t trained the full-size model on the full dataset yet — we’re writing the code and showing it works, not yet testing the quality of the predictions.',
    saw: 'One attention head, written out by hand: queries, keys, values, the scaled dot product, the mask, softmax, the weighted sum. Printed on “Tim and Sue went to the park. He was happy and she was sad.” the untrained head’s weights are a triangle of random numbers, each row summing to 1, the upper half masked off. Then a model with one Transformer block — 4 heads, vectors of 128, windows of 256, 2.3 million parameters — trained for 2,000 rounds (5 minutes): loss 3.72, beating the 67-million-number bigram’s 4.19 and still falling. The trained heads have habits: head 2 is the “who is the subject” head — “ was”, “ happy”, “ and” after “ He” all look at “ He”, and after “ she” they look at “ she”; head 4 looks at the previous token; heads 1 and 3 keep looking back at “Tim”, “ and”, “ Sue”. Samples hold a thread now: “named| Sarah. She loved very much. She loved to make flowers and drew pictures.”',
  },
  {
    n: 6,
    name: 'Pretraining the GPT',
    idea: 'Random weights become a language model',
    status: 'done',
    doneOn: '2026-10-13',
    summary: 'We did a training run with children’s stories plus Usenet banter from 1985, but I didn’t like the output. We have such a small model, and it’s made of two completely different things.',
    saw: 'The real model: 6 attention layers, 8 heads each, vectors of 320, 10.1 million parameters, trained on the Mac mini for 3.1 hours — 12,099 rounds of 64 snippets × 256 tokens, two passes over the 99 M training tokens. The loss went 9.07 (random) → 4.9 at round 200 → 3.1 at 1,000 → 2.3 at 6,000 → 2.08 at the end, past the bigram’s 4.19 and the one-layer model’s 3.72 by round 400. Train and val stayed together the whole way: no memorizing. The samples tell the story. Round 0: “named|econd.) ass pear pur programmers evening forget col crawled”. Round 1,000: “named| Amy. Amy liked to draw. She would make painted inside the fireworks now.” Round 2,000: “named| Mia. She had a cat named Max. Mia and Max liked to play together. One day, Mia and Max were playing in the park.” Round 12,099: “Tim and Sue went to the park to| play. They saw a big slide and wanted to slide. Tim said, “Let’s race to the point at the right time!” Sue said, “Yes, let’s go!”” The Usenet quarter of the corpus shows up when the prompt is a Mac: “My Macintosh crashed again and I think the problem is| that no one wants to do the bug. The bug contains bad several manuals. It has no idea how to do it like RFS disk so it can’t fit in AFS” — the words of 1985, not yet the sentences. This is the base model every later step starts from (out/pretrain/final.pt, 53 MB).',
  },
  {
    n: '6b',
    name: 'Pretraining on Usenet alone',
    idea: 'Out with the kids, in with Usenet',
    status: 'done',
    doneOn: '2026-10-14',
    summary: 'So I decided to try something different: train only on Usenet messages. We pulled in 1.88 million old Usenet posts, 1.7 GB of text, 500 million tokens, and that’s our training corpus. We had to make a new tokenizer and start a new model from random numbers, and then ran the training. During the training each chunk of text was seen once (one epoch), and every chunk went through the model’s 6 attention layers. We ended up with a model of 10.1 million parameters. The biggest matrix is the embeddings table, 2.6 million parameters (8,192 tokens × 320 values). The other 7.4 million are almost all in the 6 layers, 1.23 million each: the QKV machinery and the feed-forward part, which takes two-thirds of each layer. So now we have our first version of the model that does next-token prediction based on attention, and it produces sentences such as:',
    examples: [
      { prompt: 'Newsgroups: comp.sys.mac / Subject: Mac Plus won’t boot', out: 'Anyone know if the Mac Plus will work? I want a sort of mod or a Mac Mac cd but I haven’t been able to find a replacement for Mac Plus.' },
      { prompt: 'Newsgroups: misc.forsale / Subject: FOR SALE: Apple IIe', out: 'FOR SALE : 1+R MAC SE=65Mbytes Macintosh II (Amiga) - Mac II plus, Apple // with 256K ROM 8Mb SIMMs' },
      { prompt: 'I just got back from the computer store and', out: 'bought a pretty good benchmark it too! If there is anyone interested in this topic mail directly to me' },
      { prompt: 'Does anyone know how to', out: 'send something?? Thanks, Joan Rosenstein “Why don’t I have a copy?”' },
      { prompt: 'Hey guys I am so upset at the election. President', out: 'Reagan is commiting his X racersig, chanting who wants to do a Racersig.' },
    ],
    saw: 'Kids out, Usenet in. Every 1981–1991 post archive.org still has: 3,573 newsgroups downloaded and sifted in 41 minutes, 2.49 million posts. Cleanup took out quoted replies, signatures, leaked headers, old notesfile lines, code listings, binaries, crossposts and reposts, and kept 1.88 million posts (1.7 GB of text), each starting with its newsgroup and subject. A new tokenizer trained on Usenet alone makes Macintosh, unix, modem, kernel, VAX and baud one token each; Lily now takes two and king takes two (k|ing). 497 million tokens, five times step 6. The same 10.1 M model, one pass, 30,329 rounds, 7.8 hours on the mini. Loss 9.06 → 4.6 at round 1,000 → 3.6 at 10,000 → 3.37 at the end, train and val together all the way. Usenet is much harder to predict than children’s stories, so 3.37 here is not worse than step 6’s 2.08 — it is a different test. Round 3,000: “My Macintosh crashed again and I think the problem is| that my timing specific ware quite strictly. :-)” and then it ends the post and starts a new one in comp.sys.apple. The finished model: “Newsgroups: comp.sys.mac / Subject: Mac Plus won’t boot / Anyone know if the Mac Plus will work? I want a sort of mod or a Mac Mac cd but I haven’t been able to find a replacement for Mac Plus.” It knows each group’s voice — Star Trek: “Lots of spoilers for ST 4”; comp.ai: “What do students think the good hardware house is”; net.politics drifts to “Great Wars and Israel”. It writes like 1985, a sentence at a time, but it doesn’t yet hold a thought from one sentence to the next.',
  },
  {
    n: 7,
    name: 'Looking at the weights',
    idea: 'The embedding table before and after',
    status: 'done',
    doneOn: '2026-10-15',
    summary: `First we looked at the embedding table itself: 8,192 tokens, 320 numbers each. You can't see 320 dimensions, but meaning tends to sit on a much lower-dimensional surface, a manifold, so we flattened it in two steps. PCA kept the 50 directions where the numbers vary most (each one a mix of all 320), then UMAP folded those 50 down to 2 or 3 while keeping each token's nearest neighbours close. That's the token explorer.

Then I realized I'm interested in words, not tokens. Some words are a single token, but many are built from two or more, so they have no row in the table. To give them one, we found each of the 30,000 most common words in up to 20 real Usenet posts and ran those posts through the model. At the word's last token we read the residual stream: the 320 numbers each position carries through the model while it reads, which exist only in memory during that run. We read it at layer 0 (the token's embedding row plus its position), after layer 3, and after all 6, and averaged the 20 readings. That gives every word a place at each depth, flattened the same way into the word explorer.

What you see is meaning arriving layer by layer. Take Picard. At layer 0 the model only has the last piece of the word, so its neighbours rhyme: Packard, guard, wizard, Gerard. By layer 6, after attention has mixed in the surrounding text, they're Riker, Spock, Kirk, Worf, Guinan and Geordi. Nobody told the model about Star Trek; it worked out the crew of the Enterprise from people posting about it.`,
    figures: [
      { src: '/smallgpt/step7/picard-layer0.png', alt: 'Word map at layer 0: Picard among Packard, guard, wizard, Gerard, Howard, Shepard', caption: 'Layer 0: Picard among words that end the same way: Packard, Gerard, guard, wizard, backyard.' },
      { src: '/smallgpt/step7/picard-layer6.png', alt: 'Word map at layer 6: Picard among Riker, Spock, Kirk, Worf, Guinan, Geordi, Nimoy, Shatner', caption: 'Layer 6: the Enterprise crew, Riker, Geordi, Spock, Guinan, Kirk, Worf, and the actors Nimoy and Shatner.' },
    ],
    links: [
      { href: '/smallgpt/explorer', label: 'Token explorer: the 8,192 rows of the embedding table →' },
      { href: '/smallgpt/words', label: 'Word explorer: 30,000 words, layer by layer →' },
    ],
    saw: 'On the Usenet model. Every token has a row of 320 numbers in the embedding table. Before training the rows are random: the tokens nearest to “Mac” were “iding, saves, clusion”, and to “Monday” “lay, display, gover”. After training, “Mac” is next to Macintosh, Amiga, Apple; “modem” next to telephone, uucp; “IBM” next to Atari, Microsoft, Tandy; “Monday” next to every other day of the week; “three” next to four, five, two; “wife” next to father, parents, son, kids. “good” sits next to “bad”, because both fit in the same places in a sentence, and that is all the model sees. Word arithmetic works: woman − man + he = she, she − he + his = her, Apple − Mac + PC = IBM, Apple − Mac + Amiga = Commodore, four − three + five = six, was − is + have = had. Seven of eight right; January + (Tuesday − Monday) gave December instead of February. On a 2-D map of the 3,000 most common words the random table is one even cloud; after training the days collapse to one dot, the months to another, the numbers to another, and the computers, places and family words sit in their own neighbourhoods. Nobody told the model any of this: it is what helped predict the next token. Then whole words: most words are several tokens and have no row, so 30,000 words got their place from inside the model, read at each word in about 20 real posts after layer 0, 3 and 6. At layer 0 a split word is only its last piece and its neighbours rhyme: Gorbachev sits with mv, tv, gov. By layer 6 they mean something: Gorbachev sits with Yeltsin, Nixon, Falwell and Sauron; Challenger with Halley, Titan, Pegasus; beer with wine. king − man + woman still doesn’t reach queen: at layer 6 it lands on thief, paladin, knight, because to this model a king lives in fantasy-game posts.',
  },
  { n: 8, name: 'The conversion bridge', idea: 'Our model as a Hugging Face model', status: 'next' },
  { n: 9, name: 'SFT', idea: 'Pretraining again, on conversations, with a mask', status: 'todo' },
  { n: 10, name: 'DPO', idea: 'Preference alignment without a reward model', status: 'todo' },
  { n: 11, name: 'Reward model + PPO', idea: 'The original RLHF recipe (optional)', status: 'todo' },
  { n: 12, name: 'RLVR with GRPO', idea: 'Reinforcement learning against a checker', status: 'todo' },
  { n: 13, name: 'Scale up', idea: 'The same pipeline at GPT-2 124M (optional)', status: 'todo' },
]

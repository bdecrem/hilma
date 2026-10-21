// The fourteen steps of apps/smallgpt/PLAN.md, as the page shows them.
// Renumbered 2026-10-18: Scale up is step 10 (its folder is still 13-scale), DPO is 12 and skipped, RLVR is 13.
// When a step finishes: set status 'done', add the date and Bart's own summary
// of it, and move 'next' down one row. Keep PLAN.md's status column in step.

export type Step = {
  n: number | string  // '6b' etc. for a side step, not counted in the fourteen
  name: string
  idea: string
  status: 'done' | 'next' | 'todo' | 'skipped'
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

// The numbered steps; side steps like '6b' and skipped steps show on the page but don't count.
export const counted = (steps: Step[]) => steps.filter((s) => typeof s.n === 'number' && s.status !== 'skipped')

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
  { n: 8, name: 'The conversion bridge', idea: 'Our model as a Hugging Face model. Skipped: post-training runs on our own code, so nothing needs that format', status: 'skipped' },
  {
    n: 9,
    name: 'SFT',
    idea: 'Pretraining again, on conversations, with a mask',
    status: 'done',
    doneOn: '2026-10-16',
    summary:
      'In step 9 we did SFT. We made 2,945 question / answer pairs. Then we added a token for the question and one for the answer, so the tokenizer went from 8,192 to 8,194 tokens, and the embedding table got two new rows to match. Then we ran the questions and answers through training again, except that we did not adjust the weights for errors in next-token prediction on the questions, only on the answers. We gave it 10% of the “shift the weights” power of normal training, and it’s a tiny set of tokens next to pretraining, but we ran it 4 times (4 epochs). It’s basically polishing the model and teaching it to give answers.\n\nWe built a web app for it, where you can see how the base model behaves (it acts like true Usenet posts) next to the SFT’d version. And I learned about temperature (how much you favour the most likely next token) and top-k (how many tokens you even consider at all).',
    links: [{ href: '/smallgpt/chat', label: 'Ask the 1985 hacker →' }],
    saw: 'Claude wrote 2,945 short questions and answers about 1985–1991 computing (60 topics: the Mac Plus, the Amiga, modems and AT commands, BBSes, Unix, vi, VAX/VMS, WordPerfect, viruses…), answered in the voice of a helpful Usenet regular in one to four sentences. Two new tokens, <|user|> and <|assistant|>, so a conversation reads <|user|> question <|assistant|> answer <|endoftext|>. The loss counts only the answer. Then step 6’s loop at a tenth of the learning rate, 352 rounds, 90 seconds on the iMac: loss on held-out answers 4.17 → 3.31, almost all of it in the first pass. Same question to both models: “How do I get my modem to dial a BBS?” The base model reads it as the start of a post and keeps going as the asker: “I tried sending mail to this BBS but it doesn’t seem to do any popup problem. Thanks in advance for any help anyone can offer. Barry”. The SFT model answers and stops: “Type the terminal program to open it, and set the modem to 1, 2, 3, 4…”. The shape is learned completely; the content is mostly wrong. SFT teaches how to answer, not what is true: even asked a question it was trained on, word for word, it doesn’t give back the answer. The cranky hacker: a Usenet reply opens with “In article <message-id> … writes:”, which names the post it answers, so the archive holds its own question-and-answer pairs: 91,884 questions with at least one real reply. Claude cleaned 4,800 of them into 3,206 short pairs, the answers built only from what the replies said, each with a grumble (“Sigh, it’s all in the manual if you look in the right place.”), and the same training ran on those, two passes (by the fourth it was memorizing). It answers like a grump — “Basic stuff.”, “Go quit whining.”, “Check the dealer before asking the net.” — mostly wrong, and now and then a real fact surfaces from pretraining: asked where to get GNU Emacs, “it’s available on prep.ai.mit.edu in pub/gnu”. The chat page runs it in your browser: the weights as int8 (10 MB a model) and the model rewritten in plain JavaScript, about 9 ms a token, word for word the same answers as PyTorch.',
  },
  {
    n: 10,
    name: 'Scale up',
    idea: 'GPT-2 small’s shape (92M) on eight rented GPUs (was step 13; moved ahead of post-training)',
    status: 'done',
    doneOn: '2026-10-17',
    summary: 'I was trying to use the SFT-trained smaller model, and it wasn’t very good. So we spent $17 and ran 8 H100s on Together.ai for 10 minutes or so. Same dataset, but 4 epochs and a lot more parameters = it talks much better.',
    figures: [{ src: '/smallgpt/step13/loss.png', alt: 'Held-out loss by tokens read: the 10M model ends at 3.37 after one pass, the 92M model at 2.80 after four', caption: 'Same Usenet data, nine times the model: 3.37 → 2.80. The 92M model passes the 10M one before it has read half the data once.' }],
    examples: [
      { prompt: 'Newsgroups: comp.sys.mac / Subject: Mac Plus won’t boot', out: 'I was trying to install a Mac Plus together with a IIx. I got the following message: “Press reset. Folder reset. Disk is not installed” ...etc. I tried the same initation but the same result. What am I doing wrong? Any help would be appreciated.' },
      { prompt: 'My Macintosh crashed again and I think the problem is', out: 'more likely to be with the system when it crashes. The Mac is a Mac IIx with 8 meg of RAM, 40 meg internal hard disk, 5 meg of RAM, AppleTalk interface to a Sun 4/110.' },
      { prompt: 'Is the Korn shell available for Xenix on the 386? (the cranky hacker)', out: 'No, it’s not yet. It’s in the public domain, and you won’t see it until mid-November. Don’t expect much more from it.' },
    ],
    links: [{ href: '/smallgpt/chat', label: 'Ask the 92M hacker →' }],
    saw: 'The 10M model’s answers were near gibberish, and post-training can only choose among what a model can already do, so the scale-up moved ahead of RLHF and RLVR. GPT-2 small’s shape: 12 layers, 12 heads, vectors of 768, windows of 512 tokens; with our 8,192-token vocabulary that is 91.7M parameters (GPT-2 small is 124M only because its vocabulary is 50k). The same 497M Usenet tokens, read four times. Step 6’s loop plus what a GPU run needs: the heads’ attention fused into one call, bfloat16, torch.compile, and eight GPUs each holding the whole model and averaging their gradients after every update. Rented from Together: one machine with eight H100s, driven through Kubernetes, 32 minutes on the meter (17 to come up, 4 to load PyTorch, 9 to train), about $17. 4.4 million tokens a second; the 10M model’s one pass took 7.8 hours on the mini. Held-out loss 9.13 → 3.2 after one pass (already below the 10M model’s final 3.37) → 2.95 after two → 2.80 after four. The base model now holds a thought across sentences and writes believable posts. SFT on the same 3,206 cranky pairs, on the mini: one pass this time, because the bigger model started memorizing in the second; held-out answer loss 2.93, where the 10M cranky model ended at 3.45 — and the 92M base model starts at 3.45 before any SFT. The cranky hacker loops less and stays on the question, but its facts are still invented. On the chat page it is the default: 92 MB of int8 weights (kept on Supabase, out of the repo), about 75 ms a token in the browser, the same answers as PyTorch token for token.',
  },
  {
    n: 11,
    name: 'Reward model + PPO',
    idea: 'The RLHF recipe: a judge, then reinforcement learning, on the 92M model',
    status: 'done',
    doneOn: '2026-10-17',
    summary:
      'In step 11 we did RLHF. Claude wrote 2,700 questions from real Usenet threads the model had never seen, and our 92M cranky hacker wrote four answers to each. Claude then scored every answer from 1 to 10, comparing it with the real replies in the thread: 10,132 scored answers.\n\nTrain the judge. Next we trained our own judge, the reward model: a copy of the cranky model that gives out one number instead of a next token. We show it two answers to the same question (11,521 pairs), it scores both, and the error depends on whether it ranked Claude’s favorite higher, and by how much. A big gap the right way means almost no error; the wrong way means a big one. Backprop nudges the weights, and in the end it agrees with Claude 81% of the time.\n\nUse the judge (PPO). Now Claude is out of the loop. The cranky model writes fresh answers, 64 per round for 150 rounds (9,600 answers), and the reward model scores them. Gradient descent makes the high-scoring answers more likely and the low-scoring ones less likely, and a leash keeps the model close to where it started. Without the leash it learns to fool the reward model with nonsense like “Don’t hold your breath.” Judged blind by Claude, the new model beats the old one 72% of the time, mostly by saying less and making up less.',
    figures: [{ src: '/smallgpt/step11/ppo.png', alt: 'Three PPO runs over 150 rounds: reward-model score, KL from the SFT model, and answer length, with the leash at 0.2, at 0.05, and off', caption: 'The looser the leash, the higher the reward model’s score and the further the model drifts from the SFT model. Claude’s verdict runs the other way: 72% wins with the leash at 0.2, 26% with none.' }],
    examples: [
      { prompt: 'Is it possible to generate Polish alphabet characters under WordPerfect 5.1 on a 286? (SFT)', out: 'Don’t do it. The character fonts are in WP 5.1. Sigh.' },
      { prompt: 'The same question (RLHF, leash 0.2)', out: 'Yes, it’s possible. RTFM.' },
      { prompt: 'Is the Korn shell available for Xenix on the 386? (no leash: the reward model gamed)', out: 'Yes, there’s a bug in Korn shells, so go look at it. Don’t. Yes. Don’t. Don’t hold your breath.' },
    ],
    links: [{ href: '/smallgpt/chat', label: 'Ask the RLHF hacker →' }],
    saw: 'Claude rewrote 4,000 more Usenet threads into 2,733 fresh questions, none of them seen in SFT, keeping each one’s real replies; 200 were set aside for the end. The cranky 92M model answered the rest four times each, and Claude (Sonnet 5.5) scored all 10,132 answers 1–10 against the real replies: answers the question, invents nothing, says it once and stops, sounds cranky. It was harsh: 73% got a 1 or a 2. Any two answers with different scores made a pair: 11,521. The reward model is the SFT model with its 8,194 token scores swapped for one number, trained so the better answer’s number beats the worse one’s; it agrees with Claude on 81% of pairs it never saw (chance is 50%). PPO on the mini, four models in memory (the model being trained, a frozen copy of it, the reward model, and a value model that guesses the reward at every token): 64 answers a round, the reward model scores them, every token pays a penalty for drifting from the frozen copy (the leash), and the model is nudged toward the tokens that did better than the value model expected. With a loose leash (0.05) it was gamed by round 50: every answer became “Not yet. Don’t hold your breath.” — short, cranky, never wrong, scored high, useless. Off the leash it settled on “Yes, there’s a bug in X, so go look at it. Don’t.” for everything. With the leash at 0.2 the answers stayed answers and got shorter (68 → 30 tokens). The test, by Claude rather than the reward model, blind, on the 200 held-out questions: the leashed model beats the SFT model 72% of the time; the unleashed one, which the reward model scores highest of all, wins 26%. That is reward hacking: the reward model ranks the three runs in exactly the opposite order to Claude. Much of the 72% is saying less: Claude’s rules put a vague answer above a confident wrong one, and a 92M model is usually wrong. RLHF picks among what the model can already say; it adds no knowledge. On the chat page as RLHF 92M.',
  },
  {
    n: '11b',
    name: 'Golden Gate Cthulhu',
    idea: 'Feature steering: find the model’s own Cthulhu in its activations and turn it up, the way Anthropic made Golden Gate Claude. A direction by subtraction barely possessed, so it was reverted',
    status: 'done',
    doneOn: '2026-10-18',
    summary:
      'In step 11b we did a sloppy attempt at steering. Steering doesn’t change the weights: while the model writes, you nudge its activations — the 768 numbers each token carries from layer to layer — in one direction. Cthulhu isn’t one neuron; it’s a direction spread across all 768 numbers. That is basically what Golden Gate Claude did, except Anthropic found a clean Golden Gate feature with a sparse autoencoder, and turned it up.\n\nWe didn’t know where our model keeps Cthulhu, so we made a sloppy general guess: run 400 Usenet passages that mention Cthulhu and 400 that don’t through the model, average the activations at a middle layer, and subtract. Then we add that direction at every position of every answer, with a possession slider on the chat page. The weights stay exactly the same, so Cthulhu 92M and the cranky hacker are one set of weights. It barely possesses: our direction is a blend of Cthulhu and everything that shows up near it (fantasy book lists, the gaming newsgroup). The same trick on the Amiga, which the data mentions 200 times more often, works. \n\nWe reverted the experiment, since it didn’t add anything interesting and didn’t really work: Cthulhu 92M is off the chat page. That leaves us ready to do RLVR tomorrow, starting from our PPO’d model (not Cthulhu).',
    saw: 'Whole passages against random Usenet gave “rec.games.frp fantasy fandom”, not Cthulhu: lists of sword-and-sorcery novels and D&D modules. Read at the word itself, the direction is mostly “say this token”: nothing at a small push, then “the Cthulhu, the Cthulhu, the Cthulhu…”. Five of the 768 numbers hold 40–50% of every direction and carry scale and position, not meaning; masking them, at the tokens after the mention, layer 6, is the best this method gives, and once the name lands in a sentence: “…ancientolo St. Cthulhu, 1939. Dunno if you’d seen it, maybe.” The Amiga control at layer 8 stays coherent and can’t help himself: “the A500 and Mega 2 ST and Amiga are far superior to the 2500/030, so why don’t you get one?”',
  },
  { n: 12, name: 'DPO', idea: 'Preference alignment without a reward model. Skipped: step 11 did preferences the RLHF way, with a judge and PPO', status: 'skipped' },
  {
    n: 13,
    name: 'RLVR with GRPO',
    idea: 'Reinforcement learning against a checker: addition, a reward of 1 or 0, no reward model and no value model',
    status: 'done',
    doneOn: '2026-10-20',
    summary:
      'In step 13 we did RLVR: we trained the model on simple addition, because it’s the easiest thing to check (the answer is right or wrong), we can make as many problems as we want, and the model was already right some of the time, which RL needs, since it can only reinforce right answers it actually produces. There are 100 one-digit sums (“What is 3 + 5?”), phrased four ways and written as conversation. Each round the model answers 32 problems 8 times each, and a checker gives every answer a 1 if it’s right and a 0 if it’s wrong. We never show it the right answer. Instead each answer is compared to the average of its 8 tries, and backprop nudges every weight: the words of better-than-average answers get more likely, the words of worse ones less likely. It’s the same backprop as normal training; only the target changes, from the real next word in the text to the model’s own words, scaled by how well that answer did. A problem where all 8 answers were right, or all 8 wrong, teaches nothing and gets skipped.\n\nWe ran 300 rounds, 46 minutes on the mini. One-digit sums went from 8% to 59% right (48% on a phrasing it never trained on). Two-digit sums started at 0%, so there was nothing to reinforce and they never improved. And it didn’t learn to add, it memorized a lookup table keyed on the exact wording: “What is 9 + 2?” is right 32 out of 32 times, “what is 9+2” once.\n\nThe method is GRPO (Group Relative Policy Optimization), which DeepSeek made famous in 2025 and which is now the default in open-source RLVR; we wrote it from scratch in about 200 lines of PyTorch, and OpenAI and Anthropic train their models with the same basic loop (try, check, shift the weights toward what scored well), though they don’t publish their exact algorithms.',
    figures: [{ src: '/smallgpt/step13-rlvr/grpo.png', alt: 'GRPO over 300 rounds: held-out accuracy on one-digit sums rising from 0 to about 50%, two-digit sums flat near zero; KL from the starting model rising to 15 nats; answer length', caption: 'One-digit sums: 0% → 48% on a phrasing the model never saw. Two-digit sums never opened. The KL leash at 0.04 let the model drift 15 nats from where it started, but there is no answer that scores 1 without being right.' }],
    examples: [
      { prompt: 'What is 3 + 5? (start: the RLHF model)', out: 'Not yet.' },
      { prompt: 'What is 3 + 5? (after GRPO)', out: 'Yes 8 is the 7, so 11 is the 8.' },
      { prompt: 'What is 7 + 0? (after GRPO)', out: 'Yes 7 is the 7, so 7 is the 7. Read the manual before whining.' },
      { prompt: 'What is 9 + 8? (after GRPO: one of the sums it never got)', out: 'Yes 12 is the 9.5 year old. The 9 is 8, so its effects are minor.' },
    ],
    links: [{ href: '/smallgpt/chat', label: 'Ask the RLVR hacker to add →' }],
    saw: 'The reward is a checker: the first integer in the reply is the answer, 1 if it is the sum and 0 if not. Nothing about the format is in the prompt. No reward model, no judge, and no value model either: GRPO measures each answer against the other seven answers to the same problem (advantage = score minus the group’s mean, over its spread), so two models are in memory instead of four. A probe first: the RLHF model got a one-digit sum right in 4% of samples, but 18% of problems had at least one right answer among eight, and that 18% is all GRPO can learn from (a group that is all right or all wrong has no gradient). Two-digit sums were at 0% with nothing to learn from, so training started on one digit plus one digit, with two-digit levels to open at 60% held out. 300 rounds of 32 problems × 8 answers, 46 minutes on the mini. By round 10 every answer led with a number (“Yes 6 is 7. Read the manual before asking the net.”): the model found the rule without being told it. Then the sums, slowly: held-out accuracy on a phrasing never used in training 0% → 17% at round 30 → 37% at 150 → 48% at 300; 59% on the training phrasings. The two-digit levels never opened. What it learned is a lookup table: sampling four problems 32 times each at three temperatures gave 32/32 or 0/32 every time, and pass@8 equals the sampled accuracy, so every problem is all-or-nothing, and the fraction of mixed groups fell from 25% to 11% as accuracy rose. There is no working-out in the answers and no intermediate step; at DeepSeek’s scale the same loop finds chains of thought already latent in the pretrained model, and here there is nothing latent to find. The checker cannot be gamed (no answer scores 1 without being right), but the words around the number were never rewarded, so they drifted: 15 nats of KL, and a second run that capped answers at 24 tokens learned twice as fast, ended in the same place, and says “Not 7, but 7 is the same as 7” for 7 + 0, right by the rule and wrong to read. Two digits plus one digit went from 5.5% to 11.5% on held-out pairs without ever being trained, which is what leading with a number is worth; it did not learn to carry. The table is keyed on the exact tokens: “What is 9 + 2?”, spelled like the training phrasing, is right 32 times out of 32 at the chat page’s settings, “what is 9+2” is right once and “What is 9+2?” never (it says 12 or 10, after the same “Yes”); 9+2 is three tokens and 9 + 2 is four, and the model learned the string, not the sum. On the chat page as RLVR 92M.',
  },
]

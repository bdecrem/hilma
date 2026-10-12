// The fourteen steps of apps/smallgpt/PLAN.md, as the page shows them.
// When a step finishes: set status 'done', add the date and Bart's own summary
// of it, and move 'next' down one row. Keep PLAN.md's status column in step.

export type Step = {
  n: number
  name: string
  idea: string
  status: 'done' | 'next' | 'todo'
  doneOn?: string
  // What Bart said the step was, in his words, once he had done it.
  summary?: string
  // What we saw when it ran.
  saw?: string
}

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
    saw: 'The loss fell from 6.0 to 0.06 in 20 rounds; the guesses came out +0.86, −0.98, −0.86, +0.86 for answers +1, −1, −1, +1. And a drawing of one neuron’s math with every number’s gradient on it.',
  },
  { n: 2, name: 'Tokenizer', idea: 'How text becomes numbers (byte-pair encoding)', status: 'next' },
  { n: 3, name: 'The dataset and the objective', idea: 'Next-token prediction is the whole game', status: 'todo' },
  { n: 4, name: 'The simplest language model', idea: 'Embeddings, logits, softmax, cross-entropy (bigram)', status: 'todo' },
  { n: 5, name: 'Attention and the Transformer block', idea: 'How tokens look at each other', status: 'todo' },
  { n: 6, name: 'Pretraining the GPT', idea: 'Random weights become a language model', status: 'todo' },
  { n: 7, name: 'Looking at the weights', idea: 'The embedding table before and after', status: 'todo' },
  { n: 8, name: 'The conversion bridge', idea: 'Our model as a Hugging Face model', status: 'todo' },
  { n: 9, name: 'SFT', idea: 'Pretraining again, on conversations, with a mask', status: 'todo' },
  { n: 10, name: 'DPO', idea: 'Preference alignment without a reward model', status: 'todo' },
  { n: 11, name: 'Reward model + PPO', idea: 'The original RLHF recipe (optional)', status: 'todo' },
  { n: 12, name: 'RLVR with GRPO', idea: 'Reinforcement learning against a checker', status: 'todo' },
  { n: 13, name: 'Scale up', idea: 'The same pipeline at GPT-2 124M (optional)', status: 'todo' },
]

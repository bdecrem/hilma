import type { Metadata } from 'next'
import Chat from './Chat'
import './chat.css'

export const metadata: Metadata = {
  title: 'smallgpt — ask the 1985 hacker',
  description:
    'A 10M-parameter GPT trained on Usenet 1981–1991 and then on real Usenet questions and replies. It answers like a cranky old hacker, mostly wrong, and runs in your browser.',
  openGraph: { url: 'https://ola.cx/smallgpt/chat' },
}

export default function ChatPage() {
  return <Chat />
}

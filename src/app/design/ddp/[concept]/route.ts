import { serve } from '../serve'

const CONCEPTS = new Set(['ask', 'desk', 'local'])

export async function GET(req: Request, { params }: { params: Promise<{ concept: string }> }) {
  const { concept } = await params
  if (!CONCEPTS.has(concept)) return new Response('not found', { status: 404 })
  return serve(req, concept)
}

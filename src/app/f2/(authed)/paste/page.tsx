import PasteForm from './PasteForm'

export const dynamic = 'force-dynamic'

export default function PastePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Add text
        </h1>
        <p className="text-neutral-500 text-sm mb-6">
          Paste a transcript, article, chapter — anything. It becomes a topic
          you can chat with and quiz on.
        </p>
        <PasteForm />
      </div>
    </div>
  )
}

import content from './content.json'
import { Sheet, type SheetContent } from './Sheet'

export default function SeminarPage() {
  return <Sheet id="website" content={content as SheetContent} />
}

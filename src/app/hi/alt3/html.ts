import { alternateDocument } from '../_alts/document'
import { body } from '../home'

// The draft URL this design was built at; /hi now serves the same body as the live page.
export const html = alternateDocument({
  title: "Bart in 16 — Small wonders",
  description: "Learning, making music, and giving old things a new life. Bart Decrem at CASBS.",
  bodyClass: "edition-three",
  body,
})

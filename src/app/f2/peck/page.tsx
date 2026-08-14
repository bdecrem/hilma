import { redirect } from 'next/navigation'

// feynd.cc/peck is the universal link texted after the daily card — with
// Dodo installed, iOS opens the app's Peck tab instead of ever loading
// this page. Browsers (and phones without the app) land here and go to
// the web app.
export default function PeckRedirect() {
  redirect('/')
}

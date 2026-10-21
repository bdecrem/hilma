// ola.cx/design/ddp — three redesign concepts for deportationdata.org (unofficial).
import { serve } from './serve'

export async function GET(req: Request) {
  return serve(req, 'index')
}

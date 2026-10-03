// Shared Namecheap API helper for the domain scripts. Reads ~/.plumb/config.json.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'

const cfg = JSON.parse(readFileSync(`${homedir()}/.plumb/config.json`, 'utf8'))
const nc = cfg.namecheap ?? cfg
let ip = nc.client_ip
if (!ip || ip === 'auto') ip = execSync('curl -s https://api.ipify.org', { encoding: 'utf8' }).trim()

export async function ncFetch(command, params = {}) {
  const qs = new URLSearchParams({
    ApiUser: nc.api_user, ApiKey: nc.api_key, UserName: nc.api_user, ClientIp: ip, Command: command, ...params,
  })
  const res = await fetch(`https://api.namecheap.com/xml.response?${qs}`)
  const text = await res.text()
  if (text.includes('Status="ERROR"')) {
    const m = text.match(/<Error[^>]*>(.*?)<\/Error>/s)
    throw new Error(`Namecheap ${command}: ${m?.[1] || text.slice(0, 300)}`)
  }
  return text
}

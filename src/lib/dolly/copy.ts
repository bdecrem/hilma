// The texts. Every line starts with MARK so Dolly's texts read as hers in a
// shared inbox (Onething's are 🌱, Polly's 🦜).
import { hourLabel } from './core'

export const MARK = '🍬'
export const SITE_URL = 'https://ola.cx/dolly'
export const TODAY_URL = `${SITE_URL}/today`
export const TESTFLIGHT_URL = 'https://testflight.apple.com/join/5apKPyf7'

export function dailyText(n: number, topic: string): string {
  return `${MARK} Day ${n}: ${topic}. Three minutes with Dolly: ${TODAY_URL}`
}

export function reminderText(n: number, topic: string): string {
  return `${MARK} Day ${n} is still open: ${topic}. It takes a few minutes. ${TODAY_URL}`
}

export function welcomeText(topic: string, hour: number): string {
  return `${MARK} Hi, this is Dolly. Day 1 is ready when you are: ${topic}. From tomorrow your text comes at ${hourLabel(hour)}. ${TODAY_URL}`
}

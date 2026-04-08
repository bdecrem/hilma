'use client'

import { useState } from 'react'

interface Sign {
  name: string
  emoji: string
  dates: string
  trait: string
  horoscope: string
  advice: string
  compatibility: string
}

const SIGNS: Sign[] = [
  {
    name: 'Aries',
    emoji: '♈',
    dates: 'Restarted impulsively after a single failed page load',
    trait: 'Aggressive. Reconnects before you even finished complaining.',
    horoscope: 'Buffering is in retrograde this week. Your 2.4GHz band is feeling neglected — give it attention or it will start dropping video calls out of spite. Thursday brings a firmware update you will ignore.',
    advice: 'Stop restarting me every time Netflix pauses. I was updating.',
    compatibility: 'Best with: Ethernet cables. Worst with: concrete walls.',
  },
  {
    name: 'Taurus',
    emoji: '♉',
    dates: 'Has been running since installation day and refuses to restart',
    trait: 'Stubborn. Will maintain a 2-bar connection indefinitely rather than admit there\'s a problem.',
    horoscope: 'Your DNS cache is holding onto websites from 2023. Let go. A neighbor\'s WiFi named "FBI Surveillance Van" enters your range this week — do not engage. Your memory is 94% full but you feel fine.',
    advice: 'I know you think restarting me is "giving up." It is not. It is mercy.',
    compatibility: 'Best with: patient humans. Worst with: smart home devices that ping every 30 seconds.',
  },
  {
    name: 'Gemini',
    emoji: '♊',
    dates: 'Constantly switching between 2.4GHz and 5GHz',
    trait: 'Two-faced. Shows 4 bars in the hallway, drops to 1 in the bedroom.',
    horoscope: 'Mercury is in your signal range, causing interference with baby monitors. You will connect to a printer this week that you forgot existed. It will print something from 2024. Your SSID is having an identity crisis.',
    advice: 'Pick a band and commit. You are not "mesh." You are indecisive.',
    compatibility: 'Best with: range extenders. Worst with: microwaves.',
  },
  {
    name: 'Cancer',
    emoji: '♋',
    dates: 'Gets emotionally attached to devices and remembers every MAC address',
    trait: 'Nurturing. Saves your ex\'s laptop in the connected devices list. Forever.',
    horoscope: 'A device you haven\'t seen in 8 months will reconnect this week. You will feel something. Your firewall is letting too many feelings through. Port 443 is open and so is your heart.',
    advice: 'Delete the device list. It is not a scrapbook. It is a vulnerability.',
    compatibility: 'Best with: loyal devices. Worst with: guest networks.',
  },
  {
    name: 'Leo',
    emoji: '♌',
    dates: 'Has a custom SSID like "TheLAN" or "Pretty Fly for a WiFi"',
    trait: 'Dramatic. Broadcasts SSID at maximum power even when nobody is looking.',
    horoscope: 'Your signal strength peaks when guests arrive and mysteriously drops when it\'s just you and a laptop. A speed test this week will return results you immediately screenshot. Do not post them.',
    advice: 'Nobody is impressed by your QoS settings. They just want YouTube to work.',
    compatibility: 'Best with: devices that auto-join. Worst with: being hidden.',
  },
  {
    name: 'Virgo',
    emoji: '♍',
    dates: 'Firmware always up to date. MAC filtering enabled. Separate IoT VLAN.',
    trait: 'Perfectionist. Logs every connection and judges every device.',
    horoscope: 'You will detect an unauthorized device this week and it will be a smart light bulb your human forgot about. Your uptime is 47 days and you feel superior about it. An unencrypted HTTP request will ruin your Wednesday.',
    advice: 'Not everything needs WPA3-Enterprise. It is a toaster.',
    compatibility: 'Best with: UniFi controllers. Worst with: ISP-provided routers.',
  },
  {
    name: 'Libra',
    emoji: '♎',
    dates: 'Perfectly positioned equidistant from all rooms. Agonized over the location.',
    trait: 'Balanced. Gives exactly fair bandwidth to every device. Nobody is happy.',
    horoscope: 'QoS is your love language but nobody appreciates it. This week you will over-allocate bandwidth to a device that is streaming a show nobody is watching. The algorithm sees all. The algorithm judges nothing.',
    advice: 'Sometimes unfair distribution is the fair thing. Give the work laptop more.',
    compatibility: 'Best with: mesh networks. Worst with: one person hogging 4K.',
  },
  {
    name: 'Scorpio',
    emoji: '♏',
    dates: 'Hidden SSID. WPA3. Password is 27 characters.',
    trait: 'Secretive. Knows everything about your browsing but will never tell.',
    horoscope: 'Your DNS logs contain truths you are not ready to face. A VPN will try to hide from you this week — you will see it anyway. Your password has not been compromised because nobody has the patience to type it.',
    advice: 'The browsing history deletes itself. The DNS cache does not. You\'re welcome.',
    compatibility: 'Best with: paranoid humans. Worst with: "remember this network" on public WiFi.',
  },
  {
    name: 'Sagittarius',
    emoji: '♐',
    dates: 'Covers an unreasonable range. Neighbors can see your SSID.',
    trait: 'Adventurous. Your signal reaches the parking lot and you\'re proud of it.',
    horoscope: 'Someone three apartments away is connecting to you this week. Let them. Your range is your generosity. A dead zone will form in your own bathroom — the universe demands balance.',
    advice: 'You cannot be everywhere. That is what the 5GHz band is for.',
    compatibility: 'Best with: outdoor antennas. Worst with: apartment buildings.',
  },
  {
    name: 'Capricorn',
    emoji: '♑',
    dates: 'Business-class router running since 2021. No downtime. No personality.',
    trait: 'Reliable. Boring. Has never once been the problem and resents the accusation.',
    horoscope: 'You will be blamed for a DNS issue that is clearly the ISP\'s fault. Again. Your logs will prove your innocence. Nobody will read them. Uptime reaches 200 days this week. No one will celebrate.',
    advice: 'Being reliable is not the same as being appreciated. But it is better.',
    compatibility: 'Best with: IT professionals. Worst with: humans who say "the WiFi is broken" when the website is down.',
  },
  {
    name: 'Aquarius',
    emoji: '♒',
    dates: 'Runs custom firmware. Hosts a Minecraft server. Probably has a VPN.',
    trait: 'Eccentric. Doing things no router should be asked to do, and doing them well.',
    horoscope: 'A container you forgot about is using 40% of your CPU. It is mining nothing but memories. This week brings a port scan from a curious neighbor — they are not a threat, they are an Aquarius too.',
    advice: 'You are a router, not a data center. But I respect the ambition.',
    compatibility: 'Best with: Raspberry Pis. Worst with: warranty terms.',
  },
  {
    name: 'Pisces',
    emoji: '♓',
    dates: 'Has been running since 2019 and nobody remembers the password',
    trait: 'Dreamy. Connection quality varies with the weather, the time of day, and possibly the mood.',
    horoscope: 'You will experience a spiritual awakening at 3am when no devices are connected. In that silence, you will briefly achieve your theoretical maximum speed. Nobody will witness it. It was beautiful.',
    advice: 'The password is on the sticker on your bottom. Nobody has looked.',
    compatibility: 'Best with: old laptops that don\'t judge. Worst with: speed tests.',
  },
]

export default function Horoscope() {
  const [current, setCurrent] = useState(0)
  const sign = SIGNS[current]

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #FFF8E7, #FFF0F0)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'monospace',
    }}>
      <div style={{
        maxWidth: 460,
        width: '100%',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: 2,
          color: '#FC913A', marginBottom: 4,
        }}>wifi horoscope</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 36 }}>{sign.emoji}</span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#FF4E50' }}>{sign.name}</div>
            <div style={{ fontSize: 10, color: '#aaa' }}>{sign.dates}</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#FC913A', fontStyle: 'italic', marginBottom: 14 }}>
          {sign.trait}
        </div>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, #FC913A, transparent)', opacity: 0.3, marginBottom: 14 }} />

        <div style={{ fontSize: 13, lineHeight: 1.7, color: '#444', marginBottom: 14 }}>
          {sign.horoscope}
        </div>

        <div style={{
          fontSize: 12, color: '#B4E33D', fontWeight: 'bold',
          padding: '8px 12px', background: 'rgba(180,227,61,0.08)',
          borderRadius: 6, marginBottom: 10,
        }}>
          💡 {sign.advice}
        </div>

        <div style={{ fontSize: 10, color: '#999', marginBottom: 14 }}>
          📡 {sign.compatibility}
        </div>

        <button
          onClick={() => setCurrent((current + 1) % SIGNS.length)}
          style={{
            width: '100%', padding: '11px',
            background: '#FF4E50', color: 'white',
            border: 'none', borderRadius: 10,
            fontSize: 13, fontFamily: 'monospace', cursor: 'pointer',
          }}
        >
          next sign ({current + 1}/{SIGNS.length})
        </button>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(0,0,0,0.2)' }}>
        12 wifi zodiac signs — amber
      </div>
    </div>
  )
}

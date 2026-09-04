import DoorSign from '../DoorSign'

// Work in progress: the "ghosts on the door" concept for bartin16.xyz.
// Lives at /hi/door until the concept is finished; /hi stays the homepage.
export const metadata = {
  title: 'Study 16',
  robots: { index: false, follow: false },
}

export const viewport = {
  themeColor: '#FFF6EA',
}

export default function DoorPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: '#FFF6EA',
        display: 'flex',
        justifyContent: 'center',
        padding:
          'calc(40px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(64px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left))',
      }}
    >
      <DoorSign />
    </main>
  )
}

import Chat from './Chat';
import Gate from './Gate';
import { isSignedIn } from '@/lib/openlab/auth';

export const dynamic = 'force-dynamic';

export default async function OpenlabPage() {
  return (await isSignedIn()) ? <Chat /> : <Gate />;
}

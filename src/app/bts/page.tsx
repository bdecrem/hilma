import Quiz from './Quiz';
import manifest from '../../../public/bts/manifest.json';

export type BtsImage = { member: string; file: string };
export type BtsMember = { slug: string; name: string };

export default function BtsPage() {
  return <Quiz members={manifest.members} images={manifest.images} />;
}

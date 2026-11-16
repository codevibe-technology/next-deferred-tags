import Link from 'next/link';
import { pushEvent } from 'next-deferred-tags/pages';

export default function Home() {
  return (
    <main>
      <h1>next-deferred-tags with the Pages Router</h1>
      <button onClick={() => pushEvent('sign_up', { method: 'example' })}>Sign up</button>
      <p>
        <Link href="/about">About</Link>
      </p>
    </main>
  );
}

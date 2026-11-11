import Link from 'next/link';
import { SignupButton } from './SignupButton';

export default function Home() {
  return (
    <main style={{ minHeight: '200vh' }}>
      <h1>Home</h1>
      <Link href="/about?ref=home" id="about">About</Link>
      <SignupButton />
    </main>
  );
}

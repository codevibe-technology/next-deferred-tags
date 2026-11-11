'use client';
import { pushEvent, trackMetaEvent } from 'next-deferred-tags';

export function SignupButton() {
  return (
    <button id="signup" onClick={() => { pushEvent('sign_up', { plan: 'pro' }); trackMetaEvent('Lead'); }}>
      Sign up
    </button>
  );
}

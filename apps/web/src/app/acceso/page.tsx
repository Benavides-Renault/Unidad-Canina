'use client';

import { useRouter } from 'next/navigation';
import { Auth } from '@/components/auth';

export default function SignIn() {
  const router = useRouter();
  return (
    <>
      <a className="auth-home-link" href="/">
        ← Volver a ORYX K9
      </a>
      <Auth onLogin={() => router.replace('/panel')} />
    </>
  );
}

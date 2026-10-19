'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBox } from './ui';

export function AuthAccess({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<'checking' | 'allowed' | 'invitation' | 'unavailable'>('checking');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
    // A 401 reaches the application: credentials may be entered. The sharing gateway
    // rejects access before authentication with its own, distinct 403 response.
    api('/auth/me', 'GET', undefined, { signal })
      .then(() => {
        if (!controller.signal.aborted) setAccess('allowed');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) setAccess('allowed');
        else if (
          cause instanceof ApiError &&
          cause.status === 403 &&
          cause.message === 'Abre el enlace completo de acceso compartido.'
        )
          setAccess('invitation');
        else setAccess('unavailable');
      });
    return () => controller.abort();
  }, [attempt]);

  function openInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const value = String(new FormData(event.currentTarget).get('invitation') || '').trim();
    try {
      const url = new URL(value);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== '/' ||
        url.search ||
        url.username ||
        url.password ||
        !/^#compartir=[A-Za-z0-9_-]{43,128}$/.test(url.hash)
      )
        throw new Error('Invalid invitation');
      window.location.assign(`${window.location.origin}/${url.hash}`);
    } catch {
      setError(
        'Pega el enlace privado completo de esta instalación, incluida la parte #compartir=. Si cambió la dirección, solicita un enlace actualizado.',
      );
    }
  }

  if (access === 'allowed') return children;
  if (access === 'checking')
    return (
      <p className="auth-description" role="status">
        Comprobando el acceso…
      </p>
    );
  if (access === 'unavailable')
    return (
      <>
        <h2>No pudimos comprobar el acceso</h2>
        <p className="auth-description">
          Comprueba tu conexión y vuelve a intentarlo. Si el enlace temporal venció, solicita uno nuevo al
          administrador.
        </p>
        <Button
          onClick={() => {
            setAccess('checking');
            setAttempt((current) => current + 1);
          }}
        >
          Volver a comprobar
        </Button>
      </>
    );

  return (
    <>
      <h2>Accede con tu enlace privado</h2>
      <p className="auth-description">
        Estás en el catálogo público. Para iniciar sesión con tu cuenta, abre el enlace privado que te envió
        el administrador o pégalo aquí.
      </p>
      {error && <ErrorBox message={error} />}
      <form onSubmit={openInvitation} className="auth-form">
        <div className="field">
          <label htmlFor="private-invitation">Enlace de acceso privado</label>
          <input
            id="private-invitation"
            name="invitation"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={2048}
            required
            aria-describedby="private-invitation-help"
            placeholder="Pega aquí tu enlace completo"
          />
          <small id="private-invitation-help">
            El enlace privado contiene #compartir=. Si no lo tienes, solicítalo al administrador.
          </small>
        </div>
        <Button type="submit" icon={ArrowRight} className="auth-submit">
          Abrir acceso privado
        </Button>
      </form>
    </>
  );
}

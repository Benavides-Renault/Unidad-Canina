'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, LoaderCircle, PawPrint } from 'lucide-react';
import { api, errorMessage, type User } from '@/lib/api';
import { Button, ErrorBox, Success } from './ui';

export function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('token')
      ? 'reset'
      : 'login',
  );
  const [visible, setVisible] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot-password', 'POST', { username: form.get('username') });
        setSuccess(
          'Si tu cuenta tiene correo y el envío está configurado, recibirás las instrucciones. También puedes solicitar una nueva contraseña al administrador.',
        );
      } else if (mode === 'reset') {
        await api('/auth/reset-password', 'POST', {
          token: new URLSearchParams(window.location.search).get('token') || form.get('token'),
          password: form.get('password'),
        });
        window.history.replaceState(null, '', '/');
        setMode('login');
        setSuccess('Contraseña actualizada. Ya puedes iniciar sesión.');
      } else {
        const result = await api<{ user: User; mfaRequired?: boolean }>('/auth/login', 'POST', {
          username: form.get('username'),
          password: form.get('password'),
          ...(mfa
            ? recovery
              ? { recoveryCode: form.get('recoveryCode') }
              : { totp: form.get('totp') }
            : {}),
        });
        if (result.mfaRequired) {
          setMfa(true);
          return;
        }
        onLogin(result.user);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-brand">
        <div className="auth-brand-top">
          <img
            src="/valkyr-logo-original.png"
            alt="VALKYR Unidad Canina, logotipo original"
            width="84"
            height="96"
          />
          <span>
            VALKYR<span>UNIDAD CANINA</span>
          </span>
        </div>
        <div className="auth-story">
          <div className="eyebrow">CONFIANZA. DISCIPLINA. PROPÓSITO.</div>
          <h1>
            Un equipo.
            <br />
            Cada historia,
            <br />
            <em>en buenas manos.</em>
          </h1>
          <p>El cuidado y la operación de nuestra unidad, conectados en un solo lugar.</p>
          <div className="auth-pill">
            <PawPrint size={16} /> Gestión canina integral
          </div>
        </div>
        <div className="auth-brand-bottom">
          <span>VALKYR MANAGER</span>
          <span>COSTA RICA · UTC −6</span>
        </div>
        <div className="brand-lines" aria-hidden="true" />
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="access-pill">
            <span /> ACCESO PRIVADO
          </div>
          <h2>
            {mode === 'login'
              ? 'Bienvenido a la unidad'
              : mode === 'forgot'
                ? 'Recupera tu acceso'
                : 'Establece tu contraseña'}
          </h2>
          <p className="auth-description">
            {mode === 'login'
              ? 'Ingresa con tu cuenta autorizada para continuar.'
              : mode === 'forgot'
                ? 'Ingresa tu usuario. Si no tienes correo asociado, solicita una nueva contraseña al administrador.'
                : 'Elige una contraseña única de al menos 12 caracteres.'}
          </p>
          {error && <ErrorBox message={error} />}
          {success && <Success>{success}</Success>}
          <form onSubmit={submit} className="auth-form">
            {mode !== 'reset' && (
              <div className="field">
                <label htmlFor="username">Usuario</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={40}
                  required
                  placeholder="Tu nombre de usuario"
                />
              </div>
            )}
            {mode !== 'forgot' && (
              <div className="field">
                <label htmlFor="password">Contraseña</label>
                <div className="password-input">
                  <input
                    id="password"
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete={mode === 'reset' ? 'new-password' : 'current-password'}
                    required
                    minLength={mode === 'reset' ? 12 : undefined}
                    maxLength={128}
                    placeholder="Ingresa tu contraseña"
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === 'reset' && <small>Incluye mayúsculas, minúsculas, números y símbolos.</small>}
              </div>
            )}
            {mfa && mode === 'login' && (
              <div className="field">
                <label htmlFor="totp">
                  {recovery ? 'Código de recuperación' : 'Código de autenticación'}
                </label>
                <input
                  id="totp"
                  name={recovery ? 'recoveryCode' : 'totp'}
                  inputMode={recovery ? 'text' : 'numeric'}
                  pattern={recovery ? '[a-fA-F0-9-]{20,24}' : '[0-9]{6}'}
                  autoComplete="one-time-code"
                  maxLength={recovery ? 24 : 6}
                  required
                  autoFocus
                />
                <small>
                  {recovery
                    ? 'Usa uno de los códigos guardados al activar MFA. Cada código se utiliza una sola vez.'
                    : 'Ingresa el código de 6 dígitos de tu aplicación autenticadora.'}
                </small>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRecovery(!recovery);
                    setError('');
                  }}
                >
                  {recovery ? 'Usar autenticador' : 'Usar código de recuperación'}
                </Button>
              </div>
            )}
            {mode === 'login' && (
              <div className="auth-forgot">
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}
            <Button
              type="submit"
              icon={busy ? LoaderCircle : ArrowRight}
              disabled={busy}
              className="auth-submit"
            >
              {busy
                ? 'Un momento…'
                : mode === 'login'
                  ? 'Iniciar sesión'
                  : mode === 'forgot'
                    ? 'Enviar instrucciones'
                    : 'Guardar contraseña'}
            </Button>
            {mode !== 'login' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setSuccess('');
                }}
              >
                Volver a iniciar sesión
              </Button>
            )}
          </form>
          <div className="auth-security">
            <ShieldCheck size={19} />
            <p>
              Plataforma interna. Solo personal autorizado.
              <br />
              <span>Tu actividad se registra para proteger la unidad.</span>
            </p>
          </div>
          <p className="first-use">¿Necesitas una cuenta? Solicita tu usuario al administrador de VALKYR.</p>
        </div>
        <footer className="auth-footer">
          <LockKeyhole size={13} /> Entorno privado · VALKYR Unidad Canina
        </footer>
      </section>
    </main>
  );
}

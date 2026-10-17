'use client';
import { useEffect, useState } from 'react';
import { api, errorMessage, formatDate } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import { Button, ErrorBox, Loading, Panel, Success } from './ui';
export async function detachBrowserPush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try {
    await api('/push/unsubscribe', 'POST', { endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe();
  }
}
export function NotificationPreferences() {
  const r = useResource<{ emailEnabled: boolean; pushEnabled: boolean }>('/preferences'),
    config = useResource<{ configured: boolean; publicKey: string | null }>('/push/config'),
    history =
      useResource<{ id: string; status: string; attempts: number; sentAt?: string; lastError?: string }[]>(
        '/push/deliveries',
      );
  const [busy, setBusy] = useState(false),
    [browserSubscribed, setBrowserSubscribed] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker
        .getRegistration('/')
        .then((r) => r?.pushManager?.getSubscription())
        .then((s) => {
          if (active) setBrowserSubscribed(Boolean(s));
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function email(value: boolean) {
    setBusy(true);
    setError('');
    try {
      await api('/preferences', 'PATCH', { emailEnabled: value });
      r.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function togglePush() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (r.data?.pushEnabled && browserSubscribed) {
        await api('/preferences', 'PATCH', { pushEnabled: false });
        await detachBrowserPush();
        setBrowserSubscribed(false);
        setMessage('Notificaciones push desactivadas.');
      } else {
        if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window))
          throw new Error('Este navegador necesita un contexto seguro y soporte Web Push.');
        if (!config.data?.publicKey) throw new Error('El servidor aún no tiene Web Push configurado.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted')
          throw new Error(
            'No se concedió permiso de notificaciones. Puedes cambiarlo en la configuración del navegador.',
          );
        await navigator.serviceWorker.register('/sw.js');
        const registration = await navigator.serviceWorker.ready;
        const key = Uint8Array.from(
          atob(config.data.publicKey.replaceAll('-', '+').replaceAll('_', '/')),
          (c) => c.charCodeAt(0),
        );
        const sub =
          (await registration.pushManager.getSubscription()) ||
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
        await api('/push/subscriptions', 'POST', sub.toJSON());
        setBrowserSubscribed(true);
        setMessage('Este navegador quedó suscrito. Los avisos no muestran información privada.');
      }
      r.reload();
      history.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Preferencias de notificaciones"
      subtitle="Los avisos internos siguen disponibles según tus permisos"
    >
      {error && <ErrorBox message={error} />} {message && <Success>{message}</Success>}
      {r.loading || config.loading ? (
        <Loading />
      ) : r.error || config.error ? (
        <ErrorBox message={r.error || config.error} />
      ) : (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={r.data?.emailEnabled || false}
              disabled={busy}
              onChange={(e) => email(e.target.checked)}
            />{' '}
            Recibir avisos por correo cuando el servidor y mi cuenta tengan correo configurado
          </label>
          <p className="panel-text">
            El navegador pedirá permiso al activar los avisos. La entrega depende de su servicio push y de la
            conexión del servidor.
          </p>
          <Button variant="secondary" disabled={busy || !config.data?.configured} onClick={togglePush}>
            {r.data?.pushEnabled && browserSubscribed
              ? 'Desactivar notificaciones push'
              : 'Activar notificaciones en este navegador'}
          </Button>
          {!config.data?.configured && (
            <p className="panel-text muted">
              Las notificaciones del navegador no están activadas en esta instalación.
            </p>
          )}
          <details>
            <summary>Historial de entrega push</summary>
            {history.error ? (
              <ErrorBox message={history.error} />
            ) : history.data?.length ? (
              history.data.map((h) => (
                <p key={h.id}>
                  {{
                    PENDING: 'Pendiente',
                    PROCESSING: 'Procesando',
                    SENT: 'Aceptado por el servicio push',
                    FAILED: 'Entrega fallida',
                    CANCELLED: 'Cancelado',
                  }[h.status as 'PENDING'] || h.status}{' '}
                  · {h.attempts} intentos {h.sentAt && `· ${formatDate(h.sentAt, true)}`} {h.lastError}
                </p>
              ))
            ) : (
              <p>Sin entregas push registradas.</p>
            )}
          </details>
        </>
      )}
    </Panel>
  );
}

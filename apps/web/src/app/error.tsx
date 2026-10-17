'use client';
import { RefreshCw } from 'lucide-react';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="boot-screen">
      <div className="empty">
        <div className="eyebrow">VALKYR MANAGER</div>
        <h1>No pudimos cargar esta página</h1>
        <p>Intenta nuevamente. Si el problema continúa, contacta al administrador de la instalación.</p>
        <button className="button button-primary" onClick={reset}>
          <RefreshCw size={16} />
          Volver a intentar
        </button>
      </div>
    </main>
  );
}

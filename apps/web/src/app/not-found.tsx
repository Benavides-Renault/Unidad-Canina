import { ArrowLeft, Search } from 'lucide-react';
export default function NotFound() {
  return (
    <main className="boot-screen">
      <div className="empty">
        <div className="empty-icon">
          <Search size={28} />
        </div>
        <div className="eyebrow">ERROR 404</div>
        <h1>Esta página no está disponible</h1>
        <p>El enlace puede haber cambiado. Regresa al inicio para continuar con tu unidad.</p>
        <a className="button button-primary" href="/">
          <ArrowLeft size={16} />
          Volver al inicio
        </a>
      </div>
    </main>
  );
}

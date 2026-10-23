'use client';
import { useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Phone, Mail, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button, ErrorBox, Modal, Success } from './ui';
export type PublicSettings = {
  contactName: string;
  phone?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
};
export type InquiryInterest = { kind: 'DOG' | 'CROSS'; id: string; label: string };
export type InquiryKind = 'CONTACT' | 'PURCHASE' | 'ACCOUNT';
export function whatsappLink(number: string, message: string) {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
export function ContactLinks({
  settings,
  interest,
  showWhatsApp = true,
}: {
  settings?: PublicSettings | null;
  interest?: InquiryInterest;
  showWhatsApp?: boolean;
}) {
  if (!settings) return null;
  const message = interest
    ? `Hola, me interesa ${interest.label}. Quisiera información sobre disponibilidad y compra en ORYX K9.`
    : 'Hola, quisiera información sobre los perros y camadas de ORYX K9.';
  return (
    <div className="public-contact-links">
      {showWhatsApp && settings.whatsappNumber && (
        <a
          className="button button-primary whatsapp-link"
          href={whatsappLink(settings.whatsappNumber, message)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={18} /> Consultar por WhatsApp
        </a>
      )}
      {settings.phone && (
        <a className="button button-secondary" href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`}>
          <Phone size={17} />
          {settings.phone}
        </a>
      )}
      {settings.email && (
        <a className="button button-secondary" href={`mailto:${settings.email}`}>
          <Mail size={17} />
          {settings.email}
        </a>
      )}
    </div>
  );
}
export function InquiryDialog({
  kind,
  interest,
  onClose,
}: {
  kind: InquiryKind;
  interest?: InquiryInterest;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(false);
  const [preferred, setPreferred] = useState('EMAIL');
  const previous = useRef<{ key: string; body: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sent) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = {
      kind,
      name: form.get('name'),
      email: form.get('email') || null,
      phone: form.get('phone') || null,
      preferredContact: preferred,
      partyKind: form.get('partyKind') || 'PERSON',
      organization: form.get('organization') || null,
      message: form.get('message'),
      interestKind: interest?.kind || null,
      interestId: interest?.id || null,
      consent: form.get('consent') === 'on',
      website: form.get('website') || '',
    };
    const serialized = JSON.stringify(body);
    if (previous.current?.body !== serialized)
      previous.current = { key: crypto.randomUUID(), body: serialized };
    try {
      await api('/public/inquiries', 'POST', { ...body, requestKey: previous.current!.key });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const title =
    kind === 'ACCOUNT'
      ? 'Solicitar una cuenta'
      : kind === 'PURCHASE'
        ? 'Consultar disponibilidad'
        : 'Contactar con ORYX K9';
  return (
    <Modal
      title={title}
      description={
        interest
          ? `Consulta sobre ${interest.label}`
          : 'Déjanos tus datos y elige cómo prefieres que te contactemos.'
      }
      onClose={onClose}
    >
      {sent ? (
        <div className="public-form-success">
          <Success>Recibimos tu solicitud. Te contactaremos por el medio indicado.</Success>
          {kind === 'ACCOUNT' && (
            <p>
              Administración revisará tu solicitud y te comunicará los datos de acceso cuando apruebe tu
              cuenta.
            </p>
          )}
          <Button onClick={onClose}>Entendido</Button>
        </div>
      ) : (
        <form className="public-inquiry-form" onSubmit={submit}>
          {error && <ErrorBox message={error} />}
          <div className="field">
            <label htmlFor="inquiry-name">Nombre completo</label>
            <input id="inquiry-name" name="name" autoComplete="name" minLength={2} maxLength={120} required />
          </div>
          {kind === 'ACCOUNT' && (
            <div className="form-grid">
              <div className="field">
                <label htmlFor="inquiry-party">Tipo de cuenta de cliente</label>
                <select id="inquiry-party" name="partyKind">
                  <option value="PERSON">Persona</option>
                  <option value="MUNICIPALITY">Municipalidad</option>
                  <option value="ORGANIZATION">Organización</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="inquiry-organization">Entidad o municipalidad (opcional)</label>
                <input id="inquiry-organization" name="organization" maxLength={150} />
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="inquiry-preferred">¿Cómo prefieres que te contactemos?</label>
            <select id="inquiry-preferred" value={preferred} onChange={(e) => setPreferred(e.target.value)}>
              <option value="EMAIL">Correo electrónico</option>
              <option value="PHONE">Llamada telefónica</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="inquiry-email">
                Correo electrónico{preferred !== 'EMAIL' ? ' (opcional)' : ''}
              </label>
              <input
                id="inquiry-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required={preferred === 'EMAIL'}
              />
            </div>
            <div className="field">
              <label htmlFor="inquiry-phone">Teléfono{preferred === 'EMAIL' ? ' (opcional)' : ''}</label>
              <input
                id="inquiry-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+506 0000 0000"
                maxLength={24}
                required={preferred !== 'EMAIL'}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="inquiry-message">Cuéntanos qué necesitas</label>
            <textarea
              id="inquiry-message"
              name="message"
              rows={4}
              minLength={10}
              maxLength={2000}
              required
              defaultValue={
                interest
                  ? `Me interesa ${interest.label}. Quisiera conocer su disponibilidad y las condiciones de compra.`
                  : ''
              }
            />
          </div>
          <div className="inquiry-trap" aria-hidden="true">
            <label htmlFor="inquiry-website">Sitio web</label>
            <input id="inquiry-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <label className="public-consent">
            <input name="consent" type="checkbox" required />
            <span>Autorizo a ORYX K9 a usar estos datos para responder a mi solicitud.</span>
          </label>
          <p className="muted">
            Puedes enviar este formulario sin cuenta y sin WhatsApp.
            {kind === 'ACCOUNT'
              ? ' El acceso requiere aprobación de administración.'
              : ' Una consulta no reserva automáticamente un cachorro.'}
          </p>
          <Button type="submit" disabled={busy} icon={Send}>
            {busy ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

'use client';
import { useEffect } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { useResource } from '@/lib/use-resource';
import { whatsappLink, type PublicSettings } from './public-contact';

export function WhatsAppFloat() {
  const settings = useResource<PublicSettings>('/public/settings');
  useEffect(() => {
    window.addEventListener('oryx:public-contact-updated', settings.reload);
    window.addEventListener('focus', settings.reload);
    return () => {
      window.removeEventListener('oryx:public-contact-updated', settings.reload);
      window.removeEventListener('focus', settings.reload);
    };
  }, [settings.reload]);
  if (!settings.data?.whatsappNumber) return null;
  return (
    <a
      className="whatsapp-float"
      href={whatsappLink(
        settings.data.whatsappNumber,
        'Hola, quisiera información sobre los perros, camadas y servicios de ORYX K9.',
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      title="Contactar por WhatsApp"
    >
      <span className="whatsapp-float-icon" aria-hidden="true">
        <MessageCircle size={32} />
        <Phone size={14} />
      </span>
      <span className="whatsapp-float-label">¿Conversamos?</span>
    </a>
  );
}

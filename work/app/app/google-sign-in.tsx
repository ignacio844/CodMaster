'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } };
  }
}

export default function GoogleSignIn({ clientId }: { clientId: string | null }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && Boolean(window.google));

  useEffect(() => {
    if (window.google) return;
    const markReady = () => setReady(true);
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', markReady, { once: true });
      return () => existing.removeEventListener('load', markReady);
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.googleIdentity = 'true';
    script.addEventListener('load', markReady, { once: true });
    document.head.appendChild(script);
    return () => script.removeEventListener('load', markReady);
  }, []);

  useEffect(() => {
    if (!ready || !clientId || !window.google || !target.current) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setError('');
        const response = await fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }) });
        if (response.ok) window.location.reload();
        else {
          const body = await response.json() as { error?: string };
          setError(body.error === 'EMAIL_NOT_ALLOWED' ? 'Tu correo de Google no está incluido en la lista de acceso.' : 'No pudimos validar la cuenta de Google.');
        }
      },
    });
    target.current.replaceChildren();
    window.google.accounts.id.renderButton(target.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
  }, [ready, clientId]);

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-paper)] p-6">
      <section className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-9 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent)] font-mono text-sm font-bold tracking-tight text-white">
          BA
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">Control de códigos SKU</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Ingresá con una cuenta de Google autorizada para cargar bases y revisar coincidencias.
        </p>

        {clientId ? (
          <div ref={target} className="mt-8 flex min-h-11 justify-center" />
        ) : (
          <div className="mt-8 rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-4 text-sm text-[var(--color-ink)]">
            Falta configurar la credencial de Google del entorno.
          </div>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-[var(--radius-sm)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <p className="mt-7 border-t border-[var(--color-border)] pt-5 text-xs text-[var(--color-ink-faint)]">
          El acceso se controla desde el archivo de correos permitidos del proyecto.
        </p>
      </section>
    </main>
  );
}

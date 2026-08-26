/**
 * Lista de acceso para Control SKU.
 *
 * Para habilitar a una persona, agregá su correo de Google entre comillas.
 * El primer correo de la lista se considera administrador inicial.
 */
export const ALLOWED_EMAILS = [
  'ignacio@grupo-aftermarket.com',
  // 'responsable.octosis@grupo-aftermarket.com',
  // 'responsable.meli@grupo-aftermarket.com',
] as const;

export const normalizedAllowedEmails = ALLOWED_EMAILS.map((email) => email.trim().toLowerCase());

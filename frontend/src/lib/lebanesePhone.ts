/** Lebanese beneficiary phone: exactly 8 digits, no country code. */
export const LEBANESE_LOCAL_PHONE_DIGITS = 8;

export function sanitizeLebaneseLocalPhoneInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, LEBANESE_LOCAL_PHONE_DIGITS);
}

/** Empty is allowed (optional phone); otherwise exactly 8 digits. */
export function isOptionalLebaneseLocalPhoneValid(value: string): boolean {
  const t = value.trim();
  return t.length === 0 || /^\d{8}$/.test(t);
}

/** Show editable digits only when the stored value is a valid 8-digit local number. */
export function phoneFromStoredBeneficiary(stored: string | null | undefined): string {
  const t = typeof stored === 'string' ? stored.trim() : '';
  return /^\d{8}$/.test(t) ? t : '';
}

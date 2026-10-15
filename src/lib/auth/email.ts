/** E-posta tam olarak izinli alan adına ait mi? Alt alan adı ve çift @ reddedilir. */
export function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, host] = parts;
  return Boolean(local) && host === domain.trim().toLowerCase();
}

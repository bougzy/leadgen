export function generateReferralCode(clientName: string): string {
  const prefix = clientName
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 5)
    .toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${suffix}`;
}

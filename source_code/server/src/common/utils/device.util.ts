export function formatMacAddress(deviceId: string): string {
  if (deviceId.includes(':')) {
    return deviceId.toUpperCase();
  }

  const clean = deviceId.replace(/[:-]/g, '').toUpperCase();

  if (clean.length !== 12) {
    return clean;
  }

  return clean.match(/.{2}/g)?.join(':') || clean;
}

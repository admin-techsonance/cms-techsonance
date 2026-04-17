export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const rad = Math.PI / 180;
  
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

export function isIpAllowed(clientIp: string | null, allowedIpsCsv: string | null): boolean {
  if (!allowedIpsCsv || allowedIpsCsv.trim() === '') return true; // Empty means no restriction
  if (!clientIp) return false;

  const allowed = allowedIpsCsv.split(',').map(ip => ip.trim());
  return allowed.includes(clientIp);
}

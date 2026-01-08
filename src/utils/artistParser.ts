export function parseArtistAndFeatures(artistString: string): {
  mainArtist: string;
  features: string | null;
} {
  if (!artistString) return { mainArtist: '', features: null };
  
  const featPatterns = [
    /\s+feat\.?\s+/i,
    /\s+ft\.?\s+/i,
    /\s+featuring\s+/i,
    /\s+\(feat\.?\s+/i,
    /\s+\(ft\.?\s+/i,
    /\s+\[feat\.?\s+/i
  ];
  
  for (const pattern of featPatterns) {
    if (pattern.test(artistString)) {
      const parts = artistString.split(pattern);
      const mainArtist = parts[0].trim();
      const features = parts[1].replace(/[\)\]]+$/, '').trim();
      return { mainArtist, features };
    }
  }
  
  return { mainArtist: artistString.trim(), features: null };
}

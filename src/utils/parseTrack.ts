export function parseTrackName(filename: string): { number: number; cleanName: string } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const patterns = [/^(\d+)\.\s*/, /^(\d+)\s*-\s*/, /^(\d+)_\s*/, /^(\d+)\s+/];
  
  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      return {
        number: parseInt(match[1], 10),
        cleanName: nameWithoutExt.replace(pattern, '').trim()
      };
    }
  }
  return { number: 999, cleanName: nameWithoutExt };
}

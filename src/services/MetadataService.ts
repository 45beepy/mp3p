export interface AudioMetadata {
  artist: string;
  title: string;
  album: string;
}

export async function extractMetadata(blob: Blob): Promise<AudioMetadata> {
  // @ts-ignore - jsmediatags has no proper TS types
  const jsmediatags = await import('jsmediatags/dist/jsmediatags.min.js');
  
  return new Promise((resolve) => {
    jsmediatags.read(blob, {
      onSuccess: (tag: any) => {
        resolve({
          artist: tag.tags.artist || '',
          title: tag.tags.title || '',
          album: tag.tags.album || ''
        });
      },
      onError: (error: any) => {
        console.warn('Metadata extraction failed:', error);
        resolve({ artist: '', title: '', album: '' });
      }
    });
  });
}

interface CachedTrack {
  fileId: string;
  fileName: string;
  albumId: string;
  albumName: string;
  blob: Blob;
  cachedAt: number;
  size: number;
}

interface CacheStats {
  totalSize: number;
  trackCount: number;
  albums: Map<string, number>;
}

class AudioCacheService {
  private dbName = 'mp3p-audio-cache';
  private storeName = 'tracks';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'fileId' });
          store.createIndex('albumId', 'albumId', { unique: false });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
    });
  }

  async cacheTrack(
    fileId: string,
    fileName: string,
    albumId: string,
    albumName: string,
    blob: Blob
  ): Promise<void> {
    if (!this.db) await this.init();

    const track: CachedTrack = {
      fileId,
      fileName,
      albumId,
      albumName,
      blob,
      cachedAt: Date.now(),
      size: blob.size
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(track);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedTrack(fileId: string): Promise<Blob | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(fileId);

      request.onsuccess = () => {
        const track = request.result as CachedTrack | undefined;
        resolve(track ? track.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async isTrackCached(fileId: string): Promise<boolean> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(fileId);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedTracksForAlbum(albumId: string): Promise<string[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('albumId');
      const request = index.getAllKeys(albumId);

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  async getCacheStats(): Promise<CacheStats> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const tracks = request.result as CachedTrack[];
        const albums = new Map<string, number>();
        let totalSize = 0;

        tracks.forEach(track => {
          totalSize += track.size;
          albums.set(track.albumId, (albums.get(track.albumId) || 0) + 1);
        });

        resolve({
          totalSize,
          trackCount: tracks.length,
          albums
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTrack(fileId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(fileId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAlbumCache(albumId: string): Promise<void> {
    if (!this.db) await this.init();

    const fileIds = await this.getCachedTracksForAlbum(albumId);
    const promises = fileIds.map(id => this.deleteTrack(id));
    await Promise.all(promises);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export const audioCacheService = new AudioCacheService();

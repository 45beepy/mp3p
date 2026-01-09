interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  parents?: string[];
}

class DriveService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    sessionStorage.setItem('g_token', token);
  }

  getToken(): string | null {
    return this.token || sessionStorage.getItem('g_token');
  }

  // NEW: Initialize token from existing storage
  initFromStorage() {
    this.token = sessionStorage.getItem('g_token');
    return this.token;
  }

  async getFileBlob(fileId: string): Promise<Blob> {
    if (!this.token) throw new Error('No token available');
    
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.blob();
  }

  async getFileText(fileId: string): Promise<string> {
    const blob = await this.getFileBlob(fileId);
    return await blob.text();
  }
}

export const driveService = new DriveService();
export type { DriveFile };

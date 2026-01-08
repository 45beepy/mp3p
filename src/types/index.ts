export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
}

export interface AlbumColors {
  fileId?: string;
  font: string;
  line: string;
  titleBg: string;
  titleText: string;
  logo?: string;
}

export interface Track {
  id: string;
  name: string;
  cleanName: string;
  trackNumber: number;
  artist?: string;
  title?: string;
  album?: string;
  duration?: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface PlayHistory {
  trackId: string;
  timestamp: number;
  duration: number;
  completed: boolean;
}

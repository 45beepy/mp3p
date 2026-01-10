import './style.css'
import { Howl } from 'howler'
import { extractMetadata } from './services/MetadataService';
import { audioCacheService } from './services/AudioCacheService';

declare const gapi: any;
declare const google: any;

// --- CONFIG ---
const API_KEY = import.meta.env.VITE_API_KEY;
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive';
const MUSIC_FOLDER_NAME = 'mp3p_music'; 
const FALLBACK_COVER = 'https://i.pinimg.com/1200x/4a/86/34/4a86344f69940e6b166c0bcbde36c3bc.jpg';
const EMPTY_COVER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// --- STATE ---
interface DriveFile { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string; parents?: string[]; }

interface AlbumColors {
  fileId?: string;
  font: string;
  line: string;
  titleBg: string;
  titleText: string;
  logo?: string;
}

interface LyricLine { time: number; text: string; }

// GLOBAL VARS
let progressInterval: number | null = null;

let state = {
  token: sessionStorage.getItem('g_token'),
  rootId: null as string | null,
  albums: [] as DriveFile[],
  tracks: [] as DriveFile[],
  covers: {} as Record<string, string>,

  // Cache
  trackCache: {} as Record<string, DriveFile[]>,
  coverBlobCache: {} as Record<string, string>,
  durationCache: {} as Record<string, string>,
  albumColors: {} as Record<string, AlbumColors>,
  albumLogos: {} as Record<string, string>,
  lyricsCache: {} as Record<string, string>,
  syncedLyricsCache: {} as Record<string, LyricLine[]>,
  
  // Audio cache tracking
  cachedTracks: new Set<string>(),
  downloadingTracks: new Set<string>(),

  // Playback
  playlist: [] as DriveFile[],
  currentIndex: -1,
  currentAlbum: null as DriveFile | null,
  playingFileId: null as string | null,
  playingAlbumId: null as string | null,
  isPlaying: false,
  blobUrl: null as string | null,
  isLoadingTrack: false,

  // Preloading System
  nextBlobUrl: null as string | null,
  nextBlobId: null as string | null,
  isPreloading: false,

  // Lyrics sync
  currentLyrics: [] as LyricLine[],
  currentLyricIndex: -1,
  currentTrackLyrics: { plain: null as string | null, synced: null as LyricLine[] | null },
  lyricsCurtainOpen: false,

  // Search
  searchQuery: '',
  
  // Audio
  currentSound: null as Howl | null,
  currentBlobUrl: null as string | null
};

// --- HELPER: PARSE ARTIST & FEATURES ---
function parseArtistAndFeatures(artistString: string): { mainArtist: string, features: string | null } {
  if (!artistString) return { mainArtist: '', features: null };
  
  const featPatterns = [
    /\s+feat\.\?\s+/i,
    /\s+ft\.\?\s+/i,
    /\s+featuring\s+/i,
    /\s+\(feat\.\?\s+/i,
    /\s+\(ft\.\?\s+/i,
    /\s+\[feat\.\?\s+/i
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

// --- DOM SETUP ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="main-header">
    <div class="header-left">
      <button id="back-btn" class="secondary" style="display:none;">
        <span class="d-text">BACK</span>
        <span class="m-text">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </span>
      </button>
      <h1 id="page-title">MP3P</h1>
    </div>
    <div class="header-center">
      <div id="search-container" style="display:none;">
        <input type="text" id="search-input" placeholder="Search albums..." />
        <button id="clear-search">✕</button>
      </div>
    </div>
    <div class="header-right">
        <button id="cache-btn" style="display:none;" title="Offline Cache">💾</button>
        <button id="edit-theme-btn" style="display:none;" title="Edit Album Colors">🎨</button>
        <button id="search-btn" title="Search Albums">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </button>
        <button id="auth-btn">SYNC</button>
    </div>
  </header>
  
  <div id="main-view">
    <div style="padding:50px; text-align:center; color:#666; font-weight:700;">
      TAP <span style="color:#000; background:var(--yellow); padding:2px 6px;">SYNC</span> TO LOAD LIBRARY<br><br>
      (READING FOLDER: "${MUSIC_FOLDER_NAME}")
    </div>
  </div>

  <div id="theme-modal" class="modal-overlay">
    <div class="modal">
      <h3>Edit Album Theme</h3>
      <div class="color-group">
        <div class="color-row">
          <span>Main Line</span>
          <div class="color-picker-wrapper">
            <span class="hex-preview" id="hex-line"></span>
            <input type="color" id="input-line">
          </div>
        </div>
        <div class="color-row">
          <span>Title Text</span>
          <div class="color-picker-wrapper">
            <span class="hex-preview" id="hex-titleText"></span>
            <input type="color" id="input-titleText">
          </div>
        </div>
        <div class="color-row">
          <span>Title Background</span>
          <div class="color-picker-wrapper">
            <span class="hex-preview" id="hex-titleBg"></span>
            <input type="color" id="input-titleBg">
          </div>
        </div>
        <div class="color-row">
          <span>Font Color</span>
          <div class="color-picker-wrapper">
            <span class="hex-preview" id="hex-font"></span>
            <input type="color" id="input-font">
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button id="cancel-theme-btn" class="modal-btn cancel">Cancel</button>
        <button id="save-theme-btn" class="modal-btn">Save</button>
      </div>
    </div>
  </div>
  
  <div id="cache-modal" class="modal-overlay">
    <div class="modal">
      <h3>Offline Cache</h3>
      <div class="cache-stats">
        <p><strong>Cached Tracks:</strong> <span id="cache-track-count">0</span></p>
        <p><strong>Storage Used:</strong> <span id="cache-size">0 B</span></p>
      </div>
      <div class="cache-actions">
        <button id="download-album-btn" class="modal-btn">Download This Album</button>
        <button id="clear-cache-btn" class="modal-btn cancel">Clear All Cache</button>
      </div>
      <div class="modal-actions">
        <button id="close-cache-btn" class="modal-btn">Close</button>
      </div>
    </div>
  </div>

  <!-- Now Playing Overlay (Mobile Only) -->
  <div id="now-playing-overlay" class="now-playing-overlay">
    <div class="np-backdrop" id="np-backdrop"></div>
    
    <div class="np-container">
      <div class="np-header">
        <button class="np-close" id="np-close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      <div class="np-artwork-container">
        <img id="np-art" class="np-artwork" src="${EMPTY_COVER}">
      </div>

      <div class="np-info">
        <div class="np-title" id="np-title">NOT PLAYING</div>
        <div class="np-artist" id="np-artist">UNKNOWN</div>
      </div>

      <div class="np-progress-container">
        <div class="np-progress-bar" id="np-progress-bar">
          <div class="np-progress-fill" id="np-progress-fill"></div>
        </div>
        <div class="np-times">
          <span id="np-current-time">0:00</span>
          <span id="np-duration">0:00</span>
        </div>
      </div>

      <div class="np-controls">
        <button class="np-btn" id="np-prev">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>
        <button class="np-btn np-play-btn" id="np-play">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <button class="np-btn" id="np-next">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <div id="lyrics-curtain" class="lyrics-curtain">
    <div class="curtain-header-mobile">
      <img id="curtain-art" class="curtain-art" src="${EMPTY_COVER}">
      <div class="curtain-meta">
        <div id="curtain-title" class="curtain-title">NOT PLAYING</div>
        <div id="curtain-artist" class="curtain-artist">UNKNOWN</div>
      </div>
    </div>
    <div class="lyrics-curtain-content">
      <p class="lyrics-placeholder">No track playing</p>
    </div>
  </div>

  <div id="player-bar">
    <div class="p-art-box">
      <img id="p-art" class="p-art" src="${EMPTY_COVER}">
    </div>

    <div class="p-center">
      <div class="p-track-info">
        <span id="p-title" class="p-title">NOT PLAYING</span>
        <span id="p-artist" class="p-artist">SELECT A TRACK</span>
      </div>
      <div class="p-scrubber" id="p-scrubber">
        <div class="p-bar-bg" id="p-bar-bg">
          <div class="p-bar-fill" id="p-bar-fill"></div>
        </div>
      </div>
    </div>

    <div class="p-controls">
      <button class="ctrl-btn" id="btn-prev">⏮</button>
      <button class="ctrl-btn play-btn" id="btn-play">▶</button>
      <button class="ctrl-btn" id="btn-next">⏭</button>
      <button class="lyrics-toggle-btn" id="btn-lyrics-toggle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="23" x2="16" y2="23"></line>
        </svg>
      </button>
    </div>
  </div>
`;

const mainHeader = document.getElementById('main-header')!;
const mainView = document.getElementById('main-view')!;
const backBtn = document.getElementById('back-btn')!;
const pageTitle = document.getElementById('page-title')!;

const pTitle = document.getElementById('p-title')!;
const pArtist = document.getElementById('p-artist')!;
const pArt = document.getElementById('p-art') as HTMLImageElement;
const btnPlay = document.getElementById('btn-play')!;
const btnNext = document.getElementById('btn-next')!;
const btnPrev = document.getElementById('btn-prev')!;
const btnLyricsToggle = document.getElementById('btn-lyrics-toggle')!;
const pScrubber = document.getElementById('p-scrubber')!; 
const pBarBg = document.getElementById('p-bar-bg')!;
const pBarFill = document.getElementById('p-bar-fill')!;
const playerBar = document.getElementById('player-bar')!;
const pArtBox = document.querySelector('.p-art-box') as HTMLElement;

const lyricsCurtain = document.getElementById('lyrics-curtain')!;
const curtainArt = document.getElementById('curtain-art') as HTMLImageElement;
const curtainTitle = document.getElementById('curtain-title')!;
const curtainArtist = document.getElementById('curtain-artist')!;

const searchBtn = document.getElementById('search-btn')!;
const searchContainer = document.getElementById('search-container')!;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const clearSearchBtn = document.getElementById('clear-search')!;

const editThemeBtn = document.getElementById('edit-theme-btn')!;
const themeModal = document.getElementById('theme-modal')!;
const saveThemeBtn = document.getElementById('save-theme-btn')!;
const cancelThemeBtn = document.getElementById('cancel-theme-btn')!;
const inputLine = document.getElementById('input-line') as HTMLInputElement;
const inputTitleText = document.getElementById('input-titleText') as HTMLInputElement;
const inputTitleBg = document.getElementById('input-titleBg') as HTMLInputElement;
const inputFont = document.getElementById('input-font') as HTMLInputElement;

const cacheBtn = document.getElementById('cache-btn')!;
const cacheModal = document.getElementById('cache-modal')!;
const downloadAlbumBtn = document.getElementById('download-album-btn') as HTMLButtonElement;
const clearCacheBtn = document.getElementById('clear-cache-btn') as HTMLButtonElement;
const closeCacheBtn = document.getElementById('close-cache-btn') as HTMLButtonElement;
const cacheTrackCount = document.getElementById('cache-track-count')!;
const cacheSize = document.getElementById('cache-size')!;

// Now Playing Overlay Elements
const nowPlayingOverlay = document.getElementById('now-playing-overlay')!;
const npClose = document.getElementById('np-close')!;
const npBackdrop = document.getElementById('np-backdrop') as HTMLElement;
const npArt = document.getElementById('np-art') as HTMLImageElement;
const npTitle = document.getElementById('np-title')!;
const npArtist = document.getElementById('np-artist')!;
const npProgressBar = document.getElementById('np-progress-bar')!;
const npProgressFill = document.getElementById('np-progress-fill')!;
const npCurrentTime = document.getElementById('np-current-time')!;
const npDuration = document.getElementById('np-duration')!;
const npPlay = document.getElementById('np-play')!;
const npPrev = document.getElementById('np-prev')!;
const npNext = document.getElementById('np-next')!;

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Initialize audio cache
audioCacheService.init().then(() => {
  console.log('Audio cache initialized');
  updateCacheStats();
});

async function updateCacheStats() {
  const stats = await audioCacheService.getCacheStats();
  cacheTrackCount.textContent = stats.trackCount.toString();
  cacheSize.textContent = audioCacheService.formatBytes(stats.totalSize);
}

cacheBtn.onclick = async () => {
  await updateCacheStats();
  cacheModal.classList.add('open');
};

closeCacheBtn.onclick = () => {
  cacheModal.classList.remove('open');
};

downloadAlbumBtn.onclick = async () => {
  if (!state.currentAlbum) return;
  
  downloadAlbumBtn.textContent = 'Downloading...';
  downloadAlbumBtn.disabled = true;
  
  for (let i = 0; i < state.tracks.length; i++) {
    const track = state.tracks[i];
    
    if (await audioCacheService.isTrackCached(track.id)) continue;
    
    try {
      downloadAlbumBtn.textContent = `Downloading ${i + 1}/${state.tracks.length}...`;
      
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${track.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const blob = await response.blob();
      await audioCacheService.cacheTrack(
        track.id,
        track.name,
        state.currentAlbum!.id,
        state.currentAlbum!.name,
        blob
      );
      
      state.cachedTracks.add(track.id);
    } catch (err) {
      console.error(`Failed to cache ${track.name}:`, err);
    }
  }
  
  downloadAlbumBtn.textContent = 'Download This Album';
  downloadAlbumBtn.disabled = false;
  await updateCacheStats();
  alert(`Album "${state.currentAlbum.name}" downloaded for offline playback!`);
};

clearCacheBtn.onclick = async () => {
  if (!confirm('Clear all offline cache? This cannot be undone.')) return;
  
  clearCacheBtn.textContent = 'Clearing...';
  await audioCacheService.clearCache();
  state.cachedTracks.clear();
  await updateCacheStats();
  clearCacheBtn.textContent = 'Clear All Cache';
  alert('Cache cleared!');
};

// Now Playing Overlay Handlers
function openNowPlaying() {
  if (window.innerWidth > 768) return;
  if (!state.currentSound) return;
  
  if (pArt.src && pArt.src !== EMPTY_COVER) {
    npBackdrop.style.backgroundImage = `url(${pArt.src})`;
  }
  
  npArt.src = pArt.src;
  npTitle.textContent = pTitle.textContent;
  npArtist.textContent = pArtist.textContent;
  
  updateNowPlayingButton();
  
  nowPlayingOverlay.classList.add('open');
}

function closeNowPlaying() {
  nowPlayingOverlay.classList.remove('open');
}

function updateNowPlayingButton() {
  const svg = state.isPlaying 
    ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>'
    : '<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  npPlay.innerHTML = svg;
}

// Click player bar to open (but not controls)
playerBar.onclick = (e) => {
  if ((e.target as HTMLElement).closest('.p-controls')) return;
  openNowPlaying();
};

npClose.onclick = closeNowPlaying;

npPlay.onclick = () => {
  btnPlay.click();
  updateNowPlayingButton();
};

npPrev.onclick = () => btnPrev.click();
npNext.onclick = () => btnNext.click();

npProgressBar.onclick = (e) => {
  if (!state.currentSound) return;
  const rect = npProgressBar.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  state.currentSound.seek(pos * state.currentSound.duration());
};

function setupColorInput(input: HTMLInputElement, labelId: string) {
  const label = document.getElementById(labelId)!;
  input.oninput = () => { label.innerText = input.value; };
}
setupColorInput(inputLine, 'hex-line');
setupColorInput(inputTitleText, 'hex-titleText');
setupColorInput(inputTitleBg, 'hex-titleBg');
setupColorInput(inputFont, 'hex-font');

pArt.onerror = () => { if (pArt.src !== FALLBACK_COVER) pArt.src = FALLBACK_COVER; };
curtainArt.onerror = () => { if (curtainArt.src !== FALLBACK_COVER) curtainArt.src = FALLBACK_COVER; };

// --- EDITOR LOGIC ---
editThemeBtn.onclick = () => {
  if (!state.currentAlbum) return;
  const colors = state.albumColors[state.currentAlbum.id] || { line: '#ffff64', titleText: '#000000', titleBg: '#ffff64', font: '#ffffff' };
  inputLine.value = colors.line;
  inputTitleText.value = colors.titleText;
  inputTitleBg.value = colors.titleBg;
  inputFont.value = colors.font;
  document.getElementById('hex-line')!.innerText = colors.line;
  document.getElementById('hex-titleText')!.innerText = colors.titleText;
  document.getElementById('hex-titleBg')!.innerText = colors.titleBg;
  document.getElementById('hex-font')!.innerText = colors.font;
  themeModal.classList.add('open');
};

cancelThemeBtn.onclick = () => themeModal.classList.remove('open');

saveThemeBtn.onclick = async () => {
  if (!state.currentAlbum) return;
  saveThemeBtn.innerText = "SAVING...";
  
  const newColors = { 
    font: inputFont.value, 
    line: inputLine.value, 
    titleBg: inputTitleBg.value, 
    titleText: inputTitleText.value 
  };

  let logoLine = '';
  
  try {
    const res: any = await gapi.client.drive.files.list({
        q: `name = 'title-logo.png' and '${state.currentAlbum.id}' in parents and trashed = false`,
        pageSize: 1,
        fields: 'files(id)'
    });

    if (res.result.files && res.result.files.length > 0) {
        logoLine = 'logo: title-logo.png\n';
    } else {
        const currentConfig = state.albumColors[state.currentAlbum.id];
        if (currentConfig && currentConfig.logo) {
             logoLine = `logo: ${currentConfig.logo}\n`;
        }
    }
  } catch (e) {
    console.error("Logo check failed", e);
    const currentConfig = state.albumColors[state.currentAlbum.id];
    if (currentConfig && currentConfig.logo) {
         logoLine = `logo: ${currentConfig.logo}\n`;
    }
  }

  const fileContent = `${logoLine}font: ${newColors.font}\nline: ${newColors.line}\ntitleBg: ${newColors.titleBg}\ntitleText: ${newColors.titleText}`;
  
  const existingColors = state.albumColors[state.currentAlbum.id];
  const fileId = existingColors?.fileId;

  try {
    if (fileId) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'text/plain' },
        body: fileContent
      });
    } else {
      const metadata = { name: 'colors.txt', parents: [state.currentAlbum.id] };
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";
      const body = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata) + delimiter + 'Content-Type: text/plain\r\n\r\n' + fileContent + close_delim;
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
        body: body
      });
    }
    delete state.albumColors[state.currentAlbum.id];
    const updatedColors = await loadAlbumColors(state.currentAlbum.id);
    if (updatedColors) {
        applyAlbumTitleColors(state.currentAlbum.id);
        if (state.playingAlbumId === state.currentAlbum.id || !state.playingAlbumId) {
             applyGlobalColors(updatedColors.line);
        }
    }
    themeModal.classList.remove('open');
    saveThemeBtn.innerText = "SAVE";
    alert("Theme Updated!");
  } catch (err) {
    console.error(err);
    saveThemeBtn.innerText = "ERROR";
    alert("Failed to save theme.");
  }
};

// --- SEARCH & LYRICS UI ---
btnLyricsToggle.onclick = () => {
  state.lyricsCurtainOpen = !state.lyricsCurtainOpen;
  if (state.lyricsCurtainOpen) {
    lyricsCurtain.classList.add('open');
    btnLyricsToggle.classList.add('active');
    updateCurtainLyrics(state.currentTrackLyrics);
  } else {
    lyricsCurtain.classList.remove('open');
    btnLyricsToggle.classList.remove('active');
  }
};

searchBtn.onclick = () => {
  const isVisible = searchContainer.style.display !== 'none';
  searchContainer.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) searchInput.focus();
  else { state.searchQuery = ''; searchInput.value = ''; showAlbums(); }
};

searchInput.oninput = (e) => {
  state.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
  showAlbums();
};

clearSearchBtn.onclick = () => {
  state.searchQuery = '';
  searchInput.value = '';
  searchContainer.style.display = 'none';
  showAlbums();
};

// --- DATA HELPERS ---
function parseTrackName(filename: string): { number: number; cleanName: string } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const patterns = [/^(\d+)\.\s*/, /^(\d+)\s*-\s*/, /^(\d+)_\s*/, /^(\d+)\s+/];
  for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) return { number: parseInt(match[1], 10), cleanName: nameWithoutExt.replace(pattern, '').trim() };
  }
  return { number: 999, cleanName: nameWithoutExt };
}

function parseSyncedLyrics(syncedText: string): LyricLine[] {
  const lines = syncedText.split('\n');
  const parsed: LyricLine[] = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/);
    if (match) {
      const timeInSeconds = parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
      if (match[4].trim().length > 0) parsed.push({ time: timeInSeconds, text: match[4].trim() });
    }
  }
  return parsed;
}

// --- HELPER: MIME TYPE MAPPER ---
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'flac': return 'audio/flac';
    case 'm4a': return 'audio/mp4'; 
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    default: return 'audio/mpeg'; 
  }
}

// --- LOADERS ---
async function loadAlbumColors(albumId: string): Promise<AlbumColors | null> {
  if (state.albumColors[albumId]) return state.albumColors[albumId];

  let text = '';
  let fileId: string | undefined;

  try {
    const res: any = await gapi.client.drive.files.list({ 
        q: `name = 'colors.txt' and '${albumId}' in parents and trashed = false`, 
        fields: "files(id)", pageSize: 1 
    });
    if (res.result.files && res.result.files.length > 0) {
        fileId = res.result.files[0].id;
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { 
            headers: { 'Authorization': `Bearer ${state.token}` } 
        });
        if (response.ok) text = await response.text();
    }
  } catch (e) { console.error(e); }

  const extract = (p: RegExp, d?: string) => { 
      const m = text.match(p); 
      return m ? m[1].trim() : d; 
  };

  const colors: AlbumColors = {
      fileId: fileId,
      font: extract(/^font:\s*(.+)$/im, '#ffffff')!,
      line: extract(/^line:\s*(.+)$/im, '#ffff64')!,
      titleBg: extract(/^titleBg:\s*(.+)$/im, '#ffff64')!,
      titleText: extract(/^titleText:\s*(.+)$/im, '#000000')!,
      logo: extract(/^logo:\s*(.+)$/im)
  };

  if (!colors.logo) {
      try {
          const res: any = await gapi.client.drive.files.list({
              q: `name = 'title-logo.png' and '${albumId}' in parents and trashed = false`,
              fields: "files(id)", pageSize: 1
          });
          if (res.result.files && res.result.files.length > 0) {
              colors.logo = 'title-logo.png';
          }
      } catch (e) {}
  }

  state.albumColors[albumId] = colors;
  
  if (!fileId && !colors.logo) {
      delete state.albumColors[albumId];
      return null;
  }

  if (colors.logo) await loadAlbumLogo(albumId, colors.logo);
  return colors;
}

async function loadAlbumLogo(albumId: string, logoFilename: string): Promise<void> {
  try {
    const res: any = await gapi.client.drive.files.list({ q: `name = '${logoFilename}' and '${albumId}' in parents and trashed = false`, fields: "files(id)", pageSize: 1 });
    if (!res.result.files || res.result.files.length === 0) return;
    const fileId = res.result.files[0].id;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    state.albumLogos[albumId] = URL.createObjectURL(blob);
  } catch (err) { console.error('Error loading logo', err); }
}

async function fetchLyricsFromLrclib(trackName: string, artistName: string, albumName: string): Promise<{ plain: string | null, synced: LyricLine[] | null }> {
  const cacheKey = `${artistName}-${albumName}-${trackName}`;
  if (state.syncedLyricsCache[cacheKey]) return { plain: null, synced: state.syncedLyricsCache[cacheKey] };
  if (state.lyricsCache[cacheKey]) return { plain: state.lyricsCache[cacheKey], synced: null };
  try {
    const searchResponse = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(trackName)}`, { headers: { 'User-Agent': 'MP3P Music Player v1.0' } });
    if (!searchResponse.ok) return { plain: null, synced: null };
    const results = await searchResponse.json();
    if (!results || results.length === 0) return { plain: null, synced: null };
    let bestMatch = results[0];
    for (const result of results) { if (result.albumName && albumName && result.albumName.toLowerCase().includes(albumName.toLowerCase())) { bestMatch = result; break; } }
    if (bestMatch.syncedLyrics) {
      const parsed = parseSyncedLyrics(bestMatch.syncedLyrics);
      state.syncedLyricsCache[cacheKey] = parsed;
      return { plain: null, synced: parsed };
    } else if (bestMatch.plainLyrics) {
      state.lyricsCache[cacheKey] = bestMatch.plainLyrics;
      return { plain: bestMatch.plainLyrics, synced: null };
    }
    return { plain: null, synced: null };
  } catch { return { plain: null, synced: null }; }
}

async function loadLyrics(trackName: string): Promise<{ plain: string | null, synced: LyricLine[] | null }> {
  if (!state.currentAlbum) return { plain: null, synced: null };
  const { cleanName } = parseTrackName(trackName);
  return await fetchLyricsFromLrclib(cleanName, state.currentAlbum.name, state.currentAlbum.name);
}

// --- LYRICS UI UPDATERS ---
function updateLyricsPanel(lyrics: { plain: string | null, synced: LyricLine[] | null }) {
  const lyricsContent = document.querySelector('.lyrics-content');
  if (!lyricsContent) return;
  if (lyrics.synced && lyrics.synced.length > 0) {
    state.currentLyrics = lyrics.synced; state.currentLyricIndex = -1;
    lyricsContent.innerHTML = lyrics.synced.map((line, index) => `<p class="lyric-line" data-index="${index}" data-time="${line.time}">${line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
  } else if (lyrics.plain) {
    state.currentLyrics = []; state.currentLyricIndex = -1;
    lyricsContent.innerHTML = lyrics.plain.split('\n').map(line => `<p>${line.trim() === '' ? '<br>' : line.replace(/&/g, '&amp;')}</p>`).join('');
  } else { lyricsContent.innerHTML = '<p class="lyrics-placeholder">No lyrics available</p>'; }
}

function updateCurtainLyrics(lyrics: { plain: string | null, synced: LyricLine[] | null }) {
  const curtainContent = document.querySelector('.lyrics-curtain-content');
  if (!curtainContent) return;
  if (lyrics.synced && lyrics.synced.length > 0) {
    curtainContent.innerHTML = lyrics.synced.map((line, index) => `<p class="lyric-line-curtain" data-index="${index}" data-time="${line.time}">${line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
  } else if (lyrics.plain) {
    curtainContent.innerHTML = lyrics.plain.split('\n').map(line => `<p>${line.trim() === '' ? '<br>' : line.replace(/&/g, '&amp;')}</p>`).join('');
  } else { curtainContent.innerHTML = '<p class="lyrics-placeholder">No lyrics available</p>'; }
}

function updateSyncedLyrics(currentTime: number) {
  if (state.currentLyrics.length === 0) return;
  let newIndex = -1;
  for (let i = state.currentLyrics.length - 1; i >= 0; i--) { if (currentTime >= state.currentLyrics[i].time) { newIndex = i; break; } }
  if (newIndex === state.currentLyricIndex) return;
  state.currentLyricIndex = newIndex;
  
  const updateActive = (container: Element | null, itemClass: string) => {
    if (!container) return;
    const lines = container.querySelectorAll(`.${itemClass}`);
    lines.forEach((line, index) => {
      if (index === newIndex) {
        line.classList.add('active');
        (line as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else line.classList.remove('active');
    });
  };
  updateActive(document.querySelector('.lyrics-content'), 'lyric-line');
  updateActive(document.querySelector('.lyrics-curtain-content'), 'lyric-line-curtain');
}

// --- THEMING SYSTEM ---
function applyAlbumTitleColors(albumId: string) {
  const colors = state.albumColors[albumId];
  const logoUrl = state.albumLogos[albumId];
  const albumName = state.albums.find(a => a.id === albumId)?.name || 'MP3P';

  if (colors) {
    pageTitle.style.backgroundColor = colors.titleBg;
    pageTitle.style.color = colors.titleText;
    
    if (logoUrl) {
      pageTitle.classList.add('has-logo');
      pageTitle.style.backgroundImage = `url("${logoUrl}")`;
      pageTitle.textContent = '';
      pageTitle.style.padding = '0 5px';
      pageTitle.setAttribute('aria-label', albumName);
    } else {
      pageTitle.classList.remove('has-logo');
      pageTitle.style.backgroundImage = '';
      pageTitle.textContent = albumName.toUpperCase();
      pageTitle.style.padding = '0 5px';
    }
  } else {
    pageTitle.classList.remove('has-logo');
    pageTitle.style.backgroundColor = '';
    pageTitle.style.color = '';
    pageTitle.style.backgroundImage = '';
    pageTitle.textContent = albumName.toUpperCase();
    pageTitle.style.padding = '0 5px';
  }
}

function updateViewTheme(targetAlbumId: string | null) {
  const effectiveId = targetAlbumId || state.playingAlbumId;
  
  if (!effectiveId) {
      applyGlobalColors(null);
      pageTitle.classList.remove('has-logo');
      pageTitle.style.backgroundColor = '';
      pageTitle.style.color = '';
      pageTitle.style.backgroundImage = '';
      pageTitle.textContent = 'MP3P';
      return;
  }

  const colors = state.albumColors[effectiveId];
  if (colors) {
      applyGlobalColors(colors.line);
      applyAlbumTitleColors(effectiveId);
  } else {
      applyGlobalColors(null);
      const albumName = state.albums.find(a => a.id === effectiveId)?.name || 'MP3P';
      pageTitle.textContent = albumName.toUpperCase();
      pageTitle.style.backgroundColor = '';
      pageTitle.style.color = '';
  }
}

function updatePlayerTheme() {
  if (!state.playingAlbumId) {
      playerBar.style.borderTopColor = '';
      pBarFill.style.backgroundColor = '';
      pArtist.style.color = '';
      btnPlay.style.backgroundColor = '';
      btnPlay.style.borderColor = '';
      btnPlay.style.color = '';
      pArtBox.style.backgroundColor = '';
      btnLyricsToggle.style.borderColor = '';
      btnLyricsToggle.style.color = '';
      return;
  }
  const colors = state.albumColors[state.playingAlbumId];
  if (!colors) return;
  
  playerBar.style.borderTopColor = colors.line;
  pBarFill.style.backgroundColor = colors.line;
  pArtist.style.color = colors.line;
  btnPlay.style.backgroundColor = colors.line;
  btnPlay.style.borderColor = colors.line;
  btnPlay.style.color = colors.titleText || '#000';
  pArtBox.style.backgroundColor = colors.line;
  btnLyricsToggle.style.borderColor = colors.line;
  btnLyricsToggle.style.color = colors.line;
  curtainArtist.style.color = colors.line;
  curtainTitle.style.color = colors.font;
}

function applyGlobalColors(lineColor: string | null) {
  if (lineColor) document.documentElement.style.setProperty('--yellow', lineColor);
  else document.documentElement.style.removeProperty('--yellow');
}

// --- DURATION LOADER ---
async function loadTrackDuration(fileId: string, index: number, filename: string) {
  if (state.durationCache[fileId]) {
      const el = document.querySelector(`[data-index="${index}"]`);
      if (el) el.textContent = state.durationCache[fileId];
      return;
  }
  try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${state.token}`, 'Range': 'bytes=0-204800' }
      });
      if (!response.ok) return;
      
      let blob = await response.blob();
      const mime = getMimeType(filename);
      if (mime === 'audio/mp4') blob = blob.slice(0, blob.size, mime);
      
      const blobUrl = URL.createObjectURL(blob);
      const tempAudio = new Audio(blobUrl);
      
      await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
              tempAudio.removeEventListener('loadedmetadata', onMetadata);
              URL.revokeObjectURL(blobUrl); reject(new Error('Timeout'));
          }, 5000);
          const onMetadata = () => {
              clearTimeout(timeout);
              const duration = tempAudio.duration;
              if (duration && isFinite(duration)) {
                  const minutes = Math.floor(duration / 60);
                  const seconds = Math.floor(duration % 60);
                  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  state.durationCache[fileId] = formatted;
                  const el = document.querySelector(`[data-index="${index}"]`);
                  if (el) el.textContent = formatted;
              }
              URL.revokeObjectURL(blobUrl); resolve();
          };
          tempAudio.addEventListener('loadedmetadata', onMetadata);
      });
  } catch (err) { console.error(`Duration load failed:`, err); }
}

// --- INIT ---
function loadScripts() {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = initGis;
  document.body.append(s);
  const s2 = document.createElement('script');
  s2.src = 'https://apis.google.com/js/api.js';
  s2.onload = () => gapi.load('client', initGapi);
  document.body.append(s2);
}

async function initGapi() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
  if (state.token) syncLibrary();
}

function initGis() {
  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error) return;
      state.token = resp.access_token;
      sessionStorage.setItem('g_token', resp.access_token);
      syncLibrary();
    },
  });
  const syncAction = () => tokenClient.requestAccessToken({ prompt: '' });
  document.getElementById('auth-btn')!.onclick = syncAction;
  document.getElementById('page-title')!.onclick = syncAction;
  
  backBtn.onclick = () => {
    searchContainer.style.display = 'none'; state.searchQuery = ''; searchInput.value = '';
    showAlbums(); 
  };
}

// --- API ---
async function fetchAll(query: string, fields: string) {
  let files: any[] = [];
  let pageToken = null;
  do {
      const res: any = await gapi.client.drive.files.list({ q: query, fields: `nextPageToken, files(${fields})`, pageSize: 1000, pageToken: pageToken });
      if (res.result.files) files = files.concat(res.result.files);
      pageToken = res.result.nextPageToken;
  } while (pageToken);
  return files;
}

async function loadSecureImage(imgEl: HTMLImageElement, fileId: string) {
  if (state.coverBlobCache[fileId]) { imgEl.src = state.coverBlobCache[fileId]; return; }
  try {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${state.token}` } });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      state.coverBlobCache[fileId] = url;
      imgEl.src = url;
  } catch { imgEl.src = FALLBACK_COVER; }
}

// --- SYNC ---
async function syncLibrary() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });
  state.trackCache = {}; state.coverBlobCache = {};
  
  try {
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">SCANNING "${MUSIC_FOLDER_NAME}"...</div>`;
    const rootRes = await gapi.client.drive.files.list({ pageSize: 1, fields: "files(id)", q: `name = '${MUSIC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` });
    state.rootId = rootRes.result.files?.[0]?.id;
    
    if(!state.rootId) { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow); font-weight:700;">FOLDER NOT FOUND</div>`; return; }

    state.albums = await fetchAll(`'${state.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, "id, name");
    const allCovers = await fetchAll(`name = 'folder.jpg' and trashed = false`, "id, parents");
    
    state.covers = {};
    allCovers.forEach((f: any) => { if(f.parents?.[0]) state.covers[f.parents[0]] = f.id; });
    
    if (state.playingAlbumId) await loadAlbumColors(state.playingAlbumId);
    showAlbums();
  } catch { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>`; }
}

// --- VIEWS ---
async function showAlbums() {
  backBtn.style.display = 'none'; 
  editThemeBtn.style.display = 'none';
  cacheBtn.style.display = 'none';
  mainHeader.classList.remove('album-mode');
  
  state.currentAlbum = null;
  updateViewTheme(null);
  
  const filtered = state.searchQuery ? state.albums.filter(a => a.name.toLowerCase().includes(state.searchQuery)) : state.albums;
  const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  mainView.innerHTML = `<div id="album-grid" class="album-grid"></div>`;
  const grid = document.getElementById('album-grid')!;
  
  for (const album of sorted) {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `<img class="album-cover" src="${EMPTY_COVER}" data-album-id="${album.id}"><p class="album-name">${album.name}</p>`;
    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
    
    const img = card.querySelector('img') as HTMLImageElement;
    if (state.covers[album.id]) loadSecureImage(img, state.covers[album.id]);
    else img.src = FALLBACK_COVER;
  }
}

async function openAlbum(album: DriveFile) {
  state.currentAlbum = album;
  backBtn.style.display = 'flex'; 
  editThemeBtn.style.display = 'flex';
  cacheBtn.style.display = 'flex';
  mainHeader.classList.add('album-mode');
  searchContainer.style.display = 'none';
  
  if (state.trackCache[album.id]) {
    state.tracks = state.trackCache[album.id];
    await loadAlbumColors(album.id);
    updateViewTheme(album.id);
    renderTracks();
    return;
  }
  
  mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING...</div>`;
  
  try {
    const files = await fetchAll(`'${album.id}' in parents and trashed = false`, "id, name, mimeType");
    state.tracks = files.filter(f => !f.mimeType.includes('folder') && f.name !== 'folder.jpg' && f.name !== 'colors.txt' && f.name !== 'title-logo.png').sort((a, b) => {
      const aData = parseTrackName(a.name);
      const bData = parseTrackName(b.name);
      return aData.number !== bData.number ? aData.number - bData.number : aData.cleanName.localeCompare(bData.cleanName);
    });
    
    state.trackCache[album.id] = state.tracks;
    await loadAlbumColors(album.id);
    updateViewTheme(album.id);
    renderTracks();
  } catch { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow);">FAILED TO LOAD</div>`; }
}

function renderTracks() {
  const cover = state.covers[state.currentAlbum!.id];
  let headerHTML = '';
  
  if (cover) {
    headerHTML = `<div class="album-header"><img class="big-cover" src="${EMPTY_COVER}" id="big-cover"></div>`;
  }
  
  mainView.innerHTML = headerHTML + `<div id="track-list"></div>`;
  
  if (cover) {
    const bigCover = document.getElementById('big-cover') as HTMLImageElement;
    loadSecureImage(bigCover, cover);
  }
  
  const trackList = document.getElementById('track-list')!;
  state.tracks.forEach((track, index) => {
    const { cleanName } = parseTrackName(track.name);
    const row = document.createElement('div');
    row.className = 'track-row';
    if (state.playingFileId === track.id) row.classList.add('playing');
    row.innerHTML = `<span class="track-name">${cleanName}</span><span class="track-duration" data-index="${index}">...</span>`;
    row.onclick = () => play(index);
    trackList.appendChild(row);
    loadTrackDuration(track.id, index, track.name);
  });
}

// --- PLAYBACK ---
async function play(index: number, retryCount = 0) {
  if (state.isLoadingTrack) return;
  state.isLoadingTrack = true;
  
  state.currentIndex = index;
  state.playlist = state.tracks;
  const file = state.playlist[index];
  state.playingFileId = file.id;
  
  if (!state.playingAlbumId || state.playingAlbumId !== state.currentAlbum?.id) {
      state.playingAlbumId = state.currentAlbum?.id || null;
      if (state.playingAlbumId) {
          await loadAlbumColors(state.playingAlbumId);
          updatePlayerTheme();
      }
  }
  
  document.querySelectorAll('.track-row').forEach((row, i) => {
    if (i === index) row.classList.add('playing');
    else row.classList.remove('playing');
  });
  
  if (state.currentSound) { state.currentSound.unload(); state.currentSound = null; }
  if (state.currentBlobUrl) { URL.revokeObjectURL(state.currentBlobUrl); state.currentBlobUrl = null; }

  let blobUrl: string | null = null;
  let audioBlob: Blob | null = null;
  
  if (state.nextBlobId === file.id && state.nextBlobUrl) {
    console.log("Playing from Preload Cache!");
    blobUrl = state.nextBlobUrl;
    state.nextBlobId = null;
    state.nextBlobUrl = null;
  }
  
  const extRaw = file.name.split('.').pop()?.toLowerCase() || 'mp3';

  try {
      if (!blobUrl) {
        const cachedBlob = await audioCacheService.getCachedTrack(file.id);
        
        if (cachedBlob) {
          console.log("Playing from IndexedDB Cache! 💾");
          audioBlob = cachedBlob;
          blobUrl = URL.createObjectURL(audioBlob);
        } else {
          const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
              headers: { 'Authorization': `Bearer ${state.token}`, 'Accept': 'audio/*' }
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          let blob = await response.blob();
          const mime = getMimeType(file.name);
          audioBlob = blob.slice(0, blob.size, mime);
          blobUrl = URL.createObjectURL(audioBlob);
          
          if (state.currentAlbum) {
            audioCacheService.cacheTrack(
              file.id,
              file.name,
              state.currentAlbum.id,
              state.currentAlbum.name,
              audioBlob
            ).then(() => {
              state.cachedTracks.add(file.id);
              console.log(`Cached: ${file.name}`);
            }).catch(err => console.error('Cache failed:', err));
          }
        }
      }

      if (!audioBlob) {
          const response = await fetch(blobUrl!);
          audioBlob = await response.blob();
      }

      const metadata = await extractMetadata(audioBlob, file.name);
      let displayTitle = metadata.title || parseTrackName(file.name).cleanName;
      let displayArtist = metadata.artist || (state.currentAlbum?.name || 'Unknown Artist');

      const { mainArtist, features } = parseArtistAndFeatures(displayArtist);
      displayArtist = mainArtist;
      const featureHTML = features ? `<span class="p-features">feat. ${features}</span>` : '';

      pTitle.innerHTML = displayTitle;
      pArtist.innerHTML = displayArtist + featureHTML;
      curtainTitle.textContent = displayTitle;
      curtainArtist.textContent = displayArtist;
      
      npTitle.textContent = displayTitle;
      npArtist.textContent = displayArtist;

      if (metadata.albumArt) {
          pArt.src = metadata.albumArt;
          curtainArt.src = metadata.albumArt;
          npArt.src = metadata.albumArt;
      } else if (state.currentAlbum && state.covers[state.currentAlbum.id]) {
          if (state.coverBlobCache[state.currentAlbum.id]) {
              pArt.src = state.coverBlobCache[state.currentAlbum.id];
              curtainArt.src = state.coverBlobCache[state.currentAlbum.id];
              npArt.src = state.coverBlobCache[state.currentAlbum.id];
          } else {
              const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${state.covers[state.currentAlbum.id]}?alt=media`, { headers: { 'Authorization': `Bearer ${state.token}` } });
              const coverBlob = await resp.blob();
              const coverUrl = URL.createObjectURL(coverBlob);
              state.coverBlobCache[state.currentAlbum.id] = coverUrl;
              pArt.src = coverUrl;
              curtainArt.src = coverUrl;
              npArt.src = coverUrl;
          }
      } else {
          pArt.src = FALLBACK_COVER;
          curtainArt.src = FALLBACK_COVER;
          npArt.src = FALLBACK_COVER;
      }

      state.currentBlobUrl = blobUrl;

      state.currentSound = new Howl({
          src: [blobUrl],
          format: [extRaw],
          html5: true,
          onplay: () => { state.isPlaying = true; state.isLoadingTrack = false; updatePlayBtn(); startProgressUpdate(); },
          onpause: () => { state.isPlaying = false; updatePlayBtn(); },
          onend: () => { next(); },
          onloaderror: (id, err) => { console.error('Load error:', id, err); state.isLoadingTrack = false; },
          onplayerror: (id, err) => { console.error('Play error:', id, err); state.isLoadingTrack = false; }
      });

      state.currentSound.play();

      const lyrics = await loadLyrics(file.name);
      state.currentTrackLyrics = lyrics;
      if (state.lyricsCurtainOpen) updateCurtainLyrics(lyrics);

  } catch (err) {
      console.error(err);
      state.isLoadingTrack = false;
      if (retryCount < 2) { console.warn(`Retry ${retryCount + 1}/2`); setTimeout(() => play(index, retryCount + 1), 1000); }
      else { pTitle.textContent = 'PLAYBACK FAILED'; pArtist.textContent = 'Check connection'; }
  }
}

function startProgressUpdate() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = window.setInterval(() => {
    if (state.currentSound && state.isPlaying) {
      const seek = state.currentSound.seek() as number;
      const duration = state.currentSound.duration();
      if (duration > 0) {
        const pct = (seek / duration) * 100;
        pBarFill.style.width = `${pct}%`;
        
        npProgressFill.style.width = `${pct}%`;
        npCurrentTime.textContent = formatTime(seek);
        npDuration.textContent = formatTime(duration);
        
        if (seek > duration / 2 && !state.nextBlobId) preloadNextTrack(state.currentIndex + 1);
      }
      updateSyncedLyrics(seek);
    }
  }, 100);
}

async function preloadNextTrack(nextIndex: number) {
  if (state.isPreloading || nextIndex >= state.tracks.length) return;
  state.isPreloading = true;
  
  const nextFile = state.tracks[nextIndex];
  if (state.nextBlobId === nextFile.id) { state.isPreloading = false; return; }
  
  console.log(`Preloading: ${nextFile.name}`);
  
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${nextFile.id}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.token}`, 'Accept': 'audio/*' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    const mime = getMimeType(nextFile.name);
    const nextBlob = blob.slice(0, blob.size, mime);
    const nextBlobUrl = URL.createObjectURL(nextBlob);
    
    if (state.nextBlobUrl) URL.revokeObjectURL(state.nextBlobUrl);
    state.nextBlobUrl = nextBlobUrl;
    state.nextBlobId = nextFile.id;
    
    console.log(`Preloaded: ${nextFile.name}`);
  } catch (err) {
    console.error('Preload failed:', err);
  } finally {
    state.isPreloading = false;
  }
}

function updatePlayBtn() { 
  btnPlay.textContent = state.isPlaying ? '||' : '▶'; 
  updateNowPlayingButton();
}

function togglePlay() { if (state.currentSound) state.currentSound.playing() ? state.currentSound.pause() : state.currentSound.play(); }
function prev() { if (state.currentIndex > 0) play(state.currentIndex - 1); }
function next() { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); }

btnPlay.onclick = togglePlay;
btnNext.onclick = next;
btnPrev.onclick = prev;

pScrubber.onclick = (e) => {
  if (!state.currentSound) return;
  const rect = pBarBg.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  state.currentSound.seek(pos * state.currentSound.duration());
};

// --- START ---
loadScripts();

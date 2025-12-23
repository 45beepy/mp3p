import './style.css'
import { Howl } from 'howler'

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

// GLOBAL VARS (Fixed: Moved to top level to solve TS2304)
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

  <div id="lyrics-curtain" class="lyrics-curtain-mini">
    <div class="lyrics-curtain-content">
      <p class="lyrics-placeholder">No track playing</p>
    </div>
  </div>

  <button class="lyrics-toggle-btn-mini" id="btn-lyrics-toggle" style="display:none;" title="Show/Hide Lyrics">
    <span class="arrow-icon-mini">››</span>
  </button>

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

const lyricsCurtain = document.getElementById('lyrics-curtain')!;

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

function setupColorInput(input: HTMLInputElement, labelId: string) {
  const label = document.getElementById(labelId)!;
  input.oninput = () => { label.innerText = input.value; };
}
setupColorInput(inputLine, 'hex-line');
setupColorInput(inputTitleText, 'hex-titleText');
setupColorInput(inputTitleBg, 'hex-titleBg');
setupColorInput(inputFont, 'hex-font');

pArt.onerror = () => { if (pArt.src !== FALLBACK_COVER) pArt.src = FALLBACK_COVER; };

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
  const newColors = { font: inputFont.value, line: inputLine.value, titleBg: inputTitleBg.value, titleText: inputTitleText.value };
  const fileContent = `font: ${newColors.font}\nline: ${newColors.line}\ntitleBg: ${newColors.titleBg}\ntitleText: ${newColors.titleText}`;
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
        applyGlobalTheme(updatedColors.line);
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

// --- LOADERS ---
async function loadAlbumColors(albumId: string): Promise<AlbumColors | null> {
  if (state.albumColors[albumId]) return state.albumColors[albumId];
  try {
    const res: any = await gapi.client.drive.files.list({ q: `name = 'colors.txt' and '${albumId}' in parents and trashed = false`, fields: "files(id)", pageSize: 1 });
    if (!res.result.files || res.result.files.length === 0) return null;
    const fileId = res.result.files[0].id;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!response.ok) return null;
    const text = await response.text();
    const fontMatch = text.match(/font:\s*([#\w]+)/i);
    const lineMatch = text.match(/line:\s*([#\w]+)/i);
    const titleBgMatch = text.match(/titleBg:\s*([#\w]+)/i);
    const titleTextMatch = text.match(/titleText:\s*([#\w]+)/i);
    const logoMatch = text.match(/logo:\s*([^\r\n]+)/i);
    if (fontMatch && lineMatch && titleBgMatch && titleTextMatch) {
      const colors: AlbumColors = { fileId: fileId, font: fontMatch[1].trim(), line: lineMatch[1].trim(), titleBg: titleBgMatch[1].trim(), titleText: titleTextMatch[1].trim(), logo: logoMatch ? logoMatch[1].trim() : undefined };
      state.albumColors[albumId] = colors;
      if (colors.logo) await loadAlbumLogo(albumId, colors.logo);
      return colors;
    }
    return null;
  } catch { return null; }
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
    curtainContent.innerHTML = lyrics.synced.map((line, index) => `<p class="lyric-line-curtain" data-index="${index}" data-time="${line.time}">${line.text.replace(/&/g, '&amp;')}</p>`).join('');
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
        if (itemClass === 'lyric-line') (line as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else line.classList.remove('active');
    });
  };
  updateActive(document.querySelector('.lyrics-content'), 'lyric-line');
  updateActive(document.querySelector('.lyrics-curtain-content'), 'lyric-line-curtain');
}

// --- THEMING ---
function applyAlbumColors(albumId: string) {
  const colors = state.albumColors[albumId];
  document.querySelectorAll('.album-title.playing').forEach(el => {
    const htmlEl = el as HTMLElement;
    if (colors) { htmlEl.style.color = colors.font; htmlEl.style.borderBottomColor = colors.line; }
    else { htmlEl.style.color = ''; htmlEl.style.borderBottomColor = ''; }
  });
}

function applyAlbumTitleColors(albumId: string) {
  const colors = state.albumColors[albumId];
  const logoUrl = state.albumLogos[albumId];
  if (colors) {
    pageTitle.style.backgroundColor = colors.titleBg;
    pageTitle.style.color = colors.titleText;
    if (logoUrl) {
      pageTitle.classList.add('has-logo');
      pageTitle.style.backgroundImage = `url("${logoUrl}")`;
      pageTitle.textContent = '';
      pageTitle.setAttribute('aria-label', state.currentAlbum?.name || '');
    } else {
      pageTitle.classList.remove('has-logo');
      pageTitle.style.backgroundImage = '';
      pageTitle.textContent = state.currentAlbum?.name.toUpperCase() || 'MP3P';
    }
  } else resetTitleColors();
}

function applyPlayButtonColors(albumId: string) {
  const colors = state.albumColors[albumId];
  if (!colors || !colors.line) { resetPlayButtonColors(); return; }
  btnPlay.style.backgroundColor = colors.line;
  btnPlay.style.borderColor = colors.line;
  btnPlay.style.color = (colors.titleText || '#000');
}

function applyGlobalTheme(lineColor: string | null) {
  if (lineColor) document.documentElement.style.setProperty('--yellow', lineColor);
  else document.documentElement.style.removeProperty('--yellow');
}

function resetTitleColors() {
  pageTitle.classList.remove('has-logo');
  pageTitle.style.backgroundColor = '';
  pageTitle.style.color = '';
  pageTitle.style.backgroundImage = '';
}

function resetPlayButtonColors() {
  btnPlay.style.backgroundColor = '';
  btnPlay.style.borderColor = '';
  btnPlay.style.color = '';
}

// --- DURATION LOADER ---
async function loadTrackDuration(fileId: string, index: number) {
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
      const blob = await response.blob();
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
  document.getElementById('auth-btn')!.onclick = () => tokenClient.requestAccessToken({ prompt: '' });
  backBtn.onclick = () => {
    searchContainer.style.display = 'none'; state.searchQuery = ''; searchInput.value = '';
    resetTitleColors(); showAlbums();
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
    showAlbums();
  } catch { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>`; }
}

// --- VIEWS ---
function showAlbums() {
  applyGlobalTheme(null);
  backBtn.style.display = 'none'; editThemeBtn.style.display = 'none';
  mainHeader.classList.remove('album-mode');
  pageTitle.innerText = "MP3P";
  
  if(state.albums.length === 0) { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS FOUND</div>`; return; }

  const filteredAlbums = state.searchQuery ? state.albums.filter(album => album.name.toLowerCase().includes(state.searchQuery)) : state.albums;
  if (filteredAlbums.length === 0) { mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS MATCH "${state.searchQuery}"</div>`; return; }

  const grid = document.createElement('div');
  grid.className = 'grid';
  
  filteredAlbums.forEach(album => {
    const coverId = state.covers[album.id];
    const card = document.createElement('div');
    card.className = 'album-card';
    const titleClass = (album.id === state.playingAlbumId) ? 'album-title playing' : 'album-title';
    const titleStyle = (album.id === state.playingAlbumId) ? 'color: var(--yellow);' : 'color: #fff;';
    
    card.innerHTML = `<img class="album-cover" src="${EMPTY_COVER}"><div class="${titleClass}" style="${titleStyle}">${album.name}</div>`;
    const img = card.querySelector('img') as HTMLImageElement;
    if (coverId) loadSecureImage(img, coverId); else img.src = FALLBACK_COVER;
    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
  });
  
  mainView.innerHTML = '';
  mainView.appendChild(grid);
  if (state.playingAlbumId) applyAlbumColors(state.playingAlbumId);
}

async function openAlbum(album: DriveFile) {
  state.currentAlbum = album;
  backBtn.style.display = 'flex'; editThemeBtn.style.display = 'flex';
  mainHeader.classList.add('album-mode');
  pageTitle.innerText = album.name.toUpperCase();
  searchContainer.style.display = 'none';
  
  const colors = await loadAlbumColors(album.id);
  if (colors) { applyAlbumTitleColors(album.id); applyGlobalTheme(colors.line); }
  else { resetTitleColors(); applyGlobalTheme(null); }
  
  if (state.trackCache[album.id]) { state.tracks = state.trackCache[album.id]; renderTrackList(); return; }

  mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING TRACKS...</div>`;
  try {
      state.tracks = await fetchAll(`'${album.id}' in parents and (mimeType contains 'audio/') and trashed = false`, "id, name, mimeType, size");
      state.tracks.sort((a, b) => parseTrackName(a.name).number - parseTrackName(b.name).number);
      state.trackCache[album.id] = state.tracks;
      renderTrackList();
  } catch { mainView.innerHTML = "ERROR LOADING TRACKS"; }
}

function renderTrackList() {
  const isDesktop = window.innerWidth > 768;
  const listContainer = document.createElement('div');
  
  if (isDesktop) {
    const container = document.createElement('div'); container.className = 'album-view-desktop';
    const left = document.createElement('div'); left.className = 'album-left';
    left.innerHTML = `<div class="album-art-large"><img src="${EMPTY_COVER}"></div><div class="album-info"><h2>${state.currentAlbum?.name}</h2><p class="track-count">${state.tracks.length} tracks</p></div>`;
    const coverImg = left.querySelector('img') as HTMLImageElement;
    const coverId = state.currentAlbum && state.covers[state.currentAlbum.id];
    if (coverId) loadSecureImage(coverImg, coverId); else coverImg.src = FALLBACK_COVER;
    
    const middle = document.createElement('div'); middle.className = 'album-middle';
    listContainer.className = 'track-list-compact';
    middle.appendChild(listContainer);
    
    const right = document.createElement('div'); right.className = 'album-right'; right.id = 'lyrics-panel';
    right.innerHTML = `<div class="lyrics-header">LYRICS</div><div class="lyrics-content"><p class="lyrics-placeholder">Select a track</p></div>`;
    
    container.append(left, middle, right);
    mainView.innerHTML = ''; mainView.appendChild(container);
    if (state.currentTrackLyrics.plain || state.currentTrackLyrics.synced) setTimeout(() => updateLyricsPanel(state.currentTrackLyrics), 100);
  } else {
    listContainer.className = 'track-list';
    mainView.innerHTML = ''; mainView.appendChild(listContainer);
  }

  state.tracks.forEach((file, index) => {
    const row = document.createElement('div'); row.className = 'track-row';
    const isActive = (file.id === state.playingFileId);
    if (isActive) row.classList.add('active');
    const { cleanName } = parseTrackName(file.name);
    const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
    const cachedDuration = state.durationCache[file.id] || '--:--';
    
    row.innerHTML = `<div class="track-left"><div class="track-num">${index + 1}</div><div class="track-info"><div class="track-name">${cleanName}</div></div></div><div class="track-right"><span class="track-tech tech-ext">${ext}</span><span class="track-tech track-duration" data-index="${index}">${cachedDuration}</span></div>`;
    row.onclick = () => play(index);
    listContainer.appendChild(row);
    if (!state.durationCache[file.id]) loadTrackDuration(file.id, index);
  });
}

// --- NEW PRELOAD LOGIC ---
async function preloadNextTrack(nextIndex: number) {
  if (nextIndex >= state.playlist.length) return;
  const nextFile = state.playlist[nextIndex];
  
  if (state.nextBlobId === nextFile.id) return;
  if (state.isPreloading) return;

  state.isPreloading = true;
  console.log(`Preloading next: ${nextFile.name}`);

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${nextFile.id}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.token}`, 'Accept': 'audio/*' }
    });
    
    if (!response.ok) throw new Error('Preload fetch failed');
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    state.nextBlobId = nextFile.id;
    state.nextBlobUrl = blobUrl;
    
  } catch (err) {
    console.error("Preload Error:", err);
  } finally {
    state.isPreloading = false;
  }
}

// --- PLAYER ENGINE ---
async function play(index: number, retryCount = 0) {
  if (state.isLoadingTrack) return;
  state.isLoadingTrack = true;
  
  state.currentIndex = index;
  state.playlist = state.tracks;
  const file = state.playlist[index];
  state.playingFileId = file.id; 
  
  if (state.currentAlbum) {
      state.playingAlbumId = state.currentAlbum.id;
      const colors = await loadAlbumColors(state.currentAlbum.id);
      if (colors) applyPlayButtonColors(state.currentAlbum.id); else resetPlayButtonColors();
      if (backBtn.style.display === 'none') showAlbums();
  }
  renderTrackList();
  pTitle.innerText = "LOADING...";
  pArtist.innerText = state.currentAlbum ? state.currentAlbum.name.toUpperCase() : "UNKNOWN"; 
  const coverId = state.currentAlbum && state.covers[state.currentAlbum.id];
  if (coverId) loadSecureImage(pArt, coverId); else pArt.src = FALLBACK_COVER;

  if (state.currentSound) { state.currentSound.unload(); state.currentSound = null; }
  if (state.currentBlobUrl) { URL.revokeObjectURL(state.currentBlobUrl); state.currentBlobUrl = null; }

  // 1. CHECK IF PRELOADED
  let blobUrl: string | null = null;
  
  if (state.nextBlobId === file.id && state.nextBlobUrl) {
    console.log("Playing from Preload Cache!");
    blobUrl = state.nextBlobUrl;
    state.nextBlobId = null;
    state.nextBlobUrl = null;
  } 
  
  try {
      // 2. IF NOT PRELOADED, FETCH NOW
      if (!blobUrl) {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${state.token}`, 'Accept': 'audio/*' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
      }

      state.currentBlobUrl = blobUrl;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      
      state.currentSound = new Howl({
        src: [blobUrl], format: [ext], html5: true,
        onload: () => {
          state.isLoadingTrack = false;
          state.isPlaying = true;
          updatePlayBtn();
          const { cleanName } = parseTrackName(file.name);
          pTitle.innerText = cleanName.toUpperCase();
          startProgressUpdate();
        },
        onloaderror: (_id: number, err: any) => {
          console.error("Howler Load Error:", err);
          pTitle.innerText = "ERROR LOADING";
          state.isLoadingTrack = false;
        },
        onplayerror: (_id: number, err: any) => {
          console.error("Howler Play Error:", err);
          pTitle.innerText = "ERROR PLAYING";
        },
        onend: () => {
          state.isPlaying = false;
          updatePlayBtn();
          if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1);
        }
      });
      state.currentSound.play();
      btnLyricsToggle.style.display = 'block';
      
      loadLyrics(file.name).then(lyrics => {
        state.currentTrackLyrics = lyrics;
        if (lyrics.synced && lyrics.synced.length > 0) { state.currentLyrics = lyrics.synced; state.currentLyricIndex = -1; }
        else { state.currentLyrics = []; state.currentLyricIndex = -1; }
        const lyricsContent = document.querySelector('.lyrics-content');
        if (lyricsContent) updateLyricsPanel(lyrics);
        updateCurtainLyrics(lyrics);
      }).catch(() => { // Fixed unused 'err' here
        state.currentTrackLyrics = { plain: null, synced: null };
        state.currentLyrics = []; state.currentLyricIndex = -1;
      });
  } catch (err: any) {
      console.error("Playback Error:", err);
      state.isLoadingTrack = false;
      if (retryCount < 2) { setTimeout(() => play(index, retryCount + 1), 1000); return; }
      pTitle.innerText = "ERROR PLAYING";
      if (err.message?.includes('403') || err.message?.includes('401')) pArtist.innerText = "TOKEN EXPIRED - RESET";
      else pArtist.innerText = "PLAYBACK FAILED";
  }

  if ('mediaSession' in navigator) {
      const { cleanName } = parseTrackName(file.name);
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
          title: cleanName, artist: state.currentAlbum?.name || 'Unknown',
          artwork: [{ src: pArt.src, sizes: '512x512', type: 'image/jpeg' }]
      });
      (navigator as any).mediaSession.setActionHandler('play', () => { state.currentSound?.play(); state.isPlaying = true; updatePlayBtn(); });
      (navigator as any).mediaSession.setActionHandler('pause', () => { state.currentSound?.pause(); state.isPlaying = false; updatePlayBtn(); });
      (navigator as any).mediaSession.setActionHandler('previoustrack', () => { if (state.currentIndex > 0) play(state.currentIndex - 1); });
      (navigator as any).mediaSession.setActionHandler('nexttrack', () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); });
  }
}

// --- CONTROLS ---
function startProgressUpdate() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = window.setInterval(() => {
    if (state.currentSound && state.isPlaying) {
      const seek = state.currentSound.seek() as number;
      const duration = state.currentSound.duration();
      if (duration > 0) {
        const pct = (seek / duration) * 100;
        pBarFill.style.width = `${pct}%`;
        
        // --- SMART PRELOAD TRIGGER ---
        if (seek > duration / 2 && !state.nextBlobId) {
           preloadNextTrack(state.currentIndex + 1);
        }
      }
      updateSyncedLyrics(seek);
    }
  }, 100);
}

function updatePlayBtn() { btnPlay.textContent = state.isPlaying ? '||' : '▶'; }
btnPlay.onclick = () => { if (!state.currentSound) return; if (state.currentSound.playing()) { state.currentSound.pause(); state.isPlaying = false; } else { state.currentSound.play(); state.isPlaying = true; } updatePlayBtn(); };
btnNext.onclick = () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); };
btnPrev.onclick = () => { if (state.currentIndex > 0) play(state.currentIndex - 1); };
pScrubber.onclick = (e) => { if (!state.currentSound) return; const rect = pBarBg.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width; state.currentSound.seek(pos * state.currentSound.duration()); };

loadScripts();

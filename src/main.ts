import './style.css'

declare const gapi: any;
declare const google: any;

// --- CONFIG ---
const API_KEY = 'AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw';
const CLIENT_ID = '957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const MUSIC_FOLDER_NAME = 'mp3p_music'; 
const FALLBACK_COVER = 'https://i.pinimg.com/1200x/4a/86/34/4a86344f69940e6b166c0bcbde36c3bc.jpg';
const EMPTY_COVER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// --- STATE ---
interface DriveFile { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string; parents?: string[]; }

interface AlbumColors {
  font: string;
  line: string;
  titleBg: string;
  titleText: string;
  logo?: string;
}

interface LyricLine {
  time: number;
  text: string;
}

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

  // Lyrics sync
  currentLyrics: [] as LyricLine[],
  currentLyricIndex: -1,
  currentTrackLyrics: { plain: null as string | null, synced: null as LyricLine[] | null },
  lyricsCurtainOpen: false,

  // Search
  searchQuery: ''
};

// --- PRELOAD AUDIO ---
let preloadAudio: HTMLAudioElement | null = null;
let preloadedFileId: string | null = null;

// --- DOM SETUP ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="main-header">
    <div class="header-left">
      <button id="back-btn" class="secondary" style="display:none;">BACK</button>
      <h1 id="page-title">MP3P</h1>
    </div>
    <div class="header-center">
      <div id="search-container" style="display:none;">
        <input type="text" id="search-input" placeholder="Search albums..." />
        <button id="clear-search">✕</button>
      </div>
    </div>
    <div class="header-right">
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
  
  <audio id="audio-engine"></audio>
`;

const mainHeader = document.getElementById('main-header')!;
const mainView = document.getElementById('main-view')!;
const backBtn = document.getElementById('back-btn')!;
const pageTitle = document.getElementById('page-title')!;
const audio = document.getElementById('audio-engine') as HTMLAudioElement;

audio.preload = 'auto';
(audio as any).playsInline = true;

// hidden preloader
preloadAudio = new Audio();
preloadAudio.preload = 'auto';
(preloadAudio as any).playsInline = true;
preloadAudio.muted = true;
preloadAudio.style.display = 'none';
document.body.appendChild(preloadAudio);

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

pArt.onerror = () => { if (pArt.src !== FALLBACK_COVER) pArt.src = FALLBACK_COVER; };

// --- LYRICS CURTAIN HANDLER ---
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

// --- SEARCH HANDLERS ---
searchBtn.onclick = () => {
  const isVisible = searchContainer.style.display !== 'none';
  searchContainer.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) {
    searchInput.focus();
  } else {
    state.searchQuery = '';
    searchInput.value = '';
    showAlbums();
  }
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

// --- HELPER: PARSE TRACK NAME ---
function parseTrackName(filename: string): { number: number; cleanName: string } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const patterns = [
      /^(\d+)\.\s*/,     
      /^(\d+)\s*-\s*/,   
      /^(\d+)_\s*/,      
      /^(\d+)\s+/        
  ];
  
  for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
          const trackNumber = parseInt(match[1], 10);
          const cleanName = nameWithoutExt.replace(pattern, '').trim();
          return { number: trackNumber, cleanName };
      }
  }
  return { number: 999, cleanName: nameWithoutExt };
}

// --- HELPER: PARSE SYNCED LYRICS ---
function parseSyncedLyrics(syncedText: string): LyricLine[] {
  const lines = syncedText.split('\n');
  const parsed: LyricLine[] = [];
  
  for (const line of lines) {
    const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const centiseconds = parseInt(match[3], 10);
      const text = match[4].trim();
      
      const timeInSeconds = minutes * 60 + seconds + centiseconds / 100;
      
      if (text.length > 0) {
        parsed.push({ time: timeInSeconds, text });
      }
    }
  }
  
  return parsed;
}

// --- HELPER: LOAD ALBUM COLORS ---
async function loadAlbumColors(albumId: string): Promise<AlbumColors | null> {
  if (state.albumColors[albumId]) {
    return state.albumColors[albumId];
  }

  try {
    const res: any = await gapi.client.drive.files.list({
      q: `name = 'colors.txt' and '${albumId}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1
    });

    if (!res.result.files || res.result.files.length === 0) {
      return null;
    }

    const fileId = res.result.files[0].id;

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) return null;

    const text = await response.text();
    
    const fontMatch = text.match(/font:\s*([#\w]+)/i);
    const lineMatch = text.match(/line:\s*([#\w]+)/i);
    const titleBgMatch = text.match(/titleBg:\s*([#\w]+)/i);
    const titleTextMatch = text.match(/titleText:\s*([#\w]+)/i);
    const logoMatch = text.match(/logo:\s*([^\r\n]+)/i);

    if (fontMatch && lineMatch && titleBgMatch && titleTextMatch) {
      const colors: AlbumColors = {
        font: fontMatch[1].trim(),
        line: lineMatch[1].trim(),
        titleBg: titleBgMatch[1].trim(),
        titleText: titleTextMatch[1].trim(),
        logo: logoMatch ? logoMatch[1].trim() : undefined
      };
      
      state.albumColors[albumId] = colors;
      
      if (colors.logo) {
        await loadAlbumLogo(albumId, colors.logo);
      }
      
      return colors;
    }

    return null;
  } catch (err) {
    console.error('Error loading album colors:', err);
    return null;
  }
}

// --- HELPER: LOAD ALBUM LOGO ---
async function loadAlbumLogo(albumId: string, logoFilename: string): Promise<void> {
  try {
    const res: any = await gapi.client.drive.files.list({
      q: `name = '${logoFilename}' and '${albumId}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1
    });

    if (!res.result.files || res.result.files.length === 0) {
      return;
    }

    const fileId = res.result.files[0].id;

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    state.albumLogos[albumId] = url;
  } catch (err) {
    console.error('Error loading album logo:', err);
  }
}

// --- HELPER: FETCH LYRICS FROM LRCLIB ---
async function fetchLyricsFromLrclib(trackName: string, artistName: string, albumName: string): Promise<{ plain: string | null, synced: LyricLine[] | null }> {
  const cacheKey = `${artistName}-${albumName}-${trackName}`;
  
  if (state.syncedLyricsCache[cacheKey]) {
    return { plain: null, synced: state.syncedLyricsCache[cacheKey] };
  }
  
  if (state.lyricsCache[cacheKey]) {
    return { plain: state.lyricsCache[cacheKey], synced: null };
  }

  try {
    const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(trackName)}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: { 'User-Agent': 'MP3P Music Player v1.0' }
    });
    
    if (!searchResponse.ok) {
      return { plain: null, synced: null };
    }

    const results = await searchResponse.json();
    
    if (!results || results.length === 0) {
      return { plain: null, synced: null };
    }

    let bestMatch = results[0];
    
    for (const result of results) {
      if (result.albumName && albumName && 
          result.albumName.toLowerCase().includes(albumName.toLowerCase())) {
        bestMatch = result;
        break;
      }
    }
    
    if (bestMatch === results[0]) {
      for (const result of results) {
        if (result.artistName && albumName && 
            result.artistName.toLowerCase().includes(albumName.toLowerCase())) {
          bestMatch = result;
          break;
        }
      }
    }
    
    if (bestMatch.syncedLyrics) {
      const parsed = parseSyncedLyrics(bestMatch.syncedLyrics);
      state.syncedLyricsCache[cacheKey] = parsed;
      return { plain: null, synced: parsed };
    } else if (bestMatch.plainLyrics) {
      state.lyricsCache[cacheKey] = bestMatch.plainLyrics;
      return { plain: bestMatch.plainLyrics, synced: null };
    }
    
    return { plain: null, synced: null };
  } catch {
    return { plain: null, synced: null };
  }
}

// --- HELPER: LOAD LYRICS ---
async function loadLyrics(trackName: string): Promise<{ plain: string | null, synced: LyricLine[] | null }> {
  if (!state.currentAlbum) {
    return { plain: null, synced: null };
  }
  
  const { cleanName } = parseTrackName(trackName);
  const artistName = state.currentAlbum.name;
  const albumName = state.currentAlbum.name;
  
  return await fetchLyricsFromLrclib(cleanName, artistName, albumName);
}

// --- HELPER: UPDATE LYRICS PANEL (IN ALBUM VIEW) ---
function updateLyricsPanel(lyrics: { plain: string | null, synced: LyricLine[] | null }) {
  const lyricsContent = document.querySelector('.lyrics-content');
  if (!lyricsContent) return;
  
  if (lyrics.synced && lyrics.synced.length > 0) {
    state.currentLyrics = lyrics.synced;
    state.currentLyricIndex = -1;
    
    const htmlContent = lyrics.synced.map((line, index) => {
      const escaped = line.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p class="lyric-line" data-index="${index}" data-time="${line.time}">${escaped}</p>`;
    }).join('');
    
    lyricsContent.innerHTML = htmlContent;
  } else if (lyrics.plain) {
    state.currentLyrics = [];
    state.currentLyricIndex = -1;
    
    const lines = lyrics.plain.split('\n');
    const htmlContent = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed === '') {
        return '<p><br></p>';
      }
      const escaped = trimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    }).join('');
    lyricsContent.innerHTML = htmlContent;
  } else {
    lyricsContent.innerHTML = '<p class="lyrics-placeholder">No lyrics available for this track</p>';
  }
}

// --- HELPER: UPDATE CURTAIN LYRICS ---
function updateCurtainLyrics(lyrics: { plain: string | null, synced: LyricLine[] | null }) {
  const curtainContent = document.querySelector('.lyrics-curtain-content');
  if (!curtainContent) return;
  
  if (lyrics.synced && lyrics.synced.length > 0) {
    const htmlContent = lyrics.synced.map((line, index) => {
      const escaped = line.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p class="lyric-line-curtain" data-index="${index}" data-time="${line.time}">${escaped}</p>`;
    }).join('');
    
    curtainContent.innerHTML = htmlContent;
  } else if (lyrics.plain) {
    const lines = lyrics.plain.split('\n');
    const htmlContent = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed === '') {
        return '<p><br></p>';
      }
      const escaped = trimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped}</p>`;
    }).join('');
    curtainContent.innerHTML = htmlContent;
  } else {
    curtainContent.innerHTML = '<p class="lyrics-placeholder">No lyrics available for this track</p>';
  }
}

// --- HELPER: UPDATE SYNCED LYRICS ---
function updateSyncedLyrics(currentTime: number) {
  if (state.currentLyrics.length === 0) return;
  
  let newIndex = -1;
  for (let i = state.currentLyrics.length - 1; i >= 0; i--) {
    if (currentTime >= state.currentLyrics[i].time) {
      newIndex = i;
      break;
    }
  }
  
  if (newIndex === state.currentLyricIndex) return;
  state.currentLyricIndex = newIndex;
  
  // Desktop album view
  const lyricsContent = document.querySelector('.lyrics-content');
  if (lyricsContent) {
    const lines = lyricsContent.querySelectorAll('.lyric-line');
    lines.forEach((line, index) => {
      if (index === newIndex) {
        line.classList.add('active');
        (line as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } else {
        line.classList.remove('active');
      }
    });
  }
  
  // Curtain (mobile + desktop)
  const curtainContent = document.querySelector('.lyrics-curtain-content');
  if (curtainContent) {
    const curtainLines = curtainContent.querySelectorAll('.lyric-line-curtain');
    curtainLines.forEach((line, index) => {
      if (index === newIndex) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    });
  }
}

// --- HELPER: APPLY ALBUM COLORS TO GRID ---
function applyAlbumColors(albumId: string) {
  const colors = state.albumColors[albumId];
  
  document.querySelectorAll('.album-title.playing').forEach(el => {
    const htmlEl = el as HTMLElement;
    if (colors) {
      htmlEl.style.color = colors.font;
      htmlEl.style.borderBottomColor = colors.line;
    } else {
      htmlEl.style.color = '';
      htmlEl.style.borderBottomColor = '';
    }
  });
}



// --- HELPER: APPLY ALBUM TITLE COLORS ---
function applyAlbumTitleColors(albumId: string) {
  const colors = state.albumColors[albumId];
  const logoUrl = state.albumLogos[albumId];

  if (colors) {
    pageTitle.style.backgroundColor = colors.titleBg;
    pageTitle.style.color = colors.titleText;

    if (logoUrl) {
      // Logo-only header
      pageTitle.classList.add('has-logo');
      pageTitle.style.backgroundImage = `url("${logoUrl}")`;
      pageTitle.textContent = '';                 // hide text completely
      pageTitle.style.padding = '0 15px';         // matches h1.has-logo
      pageTitle.setAttribute('aria-label', state.currentAlbum?.name || '');
    } else {
      // Colored text header with album name
      pageTitle.classList.remove('has-logo');
      pageTitle.style.backgroundImage = '';
      pageTitle.textContent = state.currentAlbum?.name.toUpperCase() || 'MP3P';
      pageTitle.style.padding = '0 5px';          // matches base h1
    }
  } else {
    // Default MP3P header
    pageTitle.classList.remove('has-logo');
    pageTitle.style.backgroundColor = '';
    pageTitle.style.color = '';
    pageTitle.style.backgroundImage = '';
    pageTitle.textContent = 'MP3P';
    pageTitle.style.padding = '0 5px';
  }
}




function applyPlayButtonColors(albumId: string) {
  const colors = state.albumColors[albumId];

  // If we don't have a line color, fall back to default CSS
  if (!colors || !colors.line) {
    btnPlay.style.backgroundColor = '';
    btnPlay.style.borderColor = '';
    btnPlay.style.color = '';
    return;
  }

  // Use underline color as play button color
  btnPlay.style.backgroundColor = colors.line;
  btnPlay.style.borderColor = colors.line;

  // Use titleText if available, else black
  btnPlay.style.color = (colors.titleText || '#000');
}


// --- HELPER: RESET TITLE COLORS ---
function resetTitleColors() {
  pageTitle.classList.remove('has-logo');
  pageTitle.style.backgroundColor = '';
  pageTitle.style.color = '';
  pageTitle.style.backgroundImage = '';
}

// --- HELPER: RESET PLAY BUTTON COLORS ---
function resetPlayButtonColors() {
  btnPlay.style.backgroundColor = '';
  btnPlay.style.borderColor = '';
  btnPlay.style.color = '';
}


// --- HELPER: LOAD TRACK DURATION WITH CACHE ---
async function loadTrackDuration(fileId: string, index: number) {
  if (state.durationCache[fileId]) {
      const durationEl = document.querySelector(`[data-index="${index}"]`);
      if (durationEl) durationEl.textContent = state.durationCache[fileId];
      return;
  }

  try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 
              'Authorization': `Bearer ${state.token}`,
              'Range': 'bytes=0-204800'
          }
      });
      
      if (!response.ok) return;
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const tempAudio = new Audio(blobUrl);
      
      await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
              tempAudio.removeEventListener('loadedmetadata', onMetadata);
              tempAudio.removeEventListener('error', onError);
              URL.revokeObjectURL(blobUrl);
              reject(new Error('Timeout'));
          }, 5000);
          
          const onMetadata = () => {
              clearTimeout(timeout);
              const duration = tempAudio.duration;
              
              if (duration && isFinite(duration)) {
                  const minutes = Math.floor(duration / 60);
                  const seconds = Math.floor(duration % 60);
                  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                  state.durationCache[fileId] = formatted;

                  const durationEl = document.querySelector(`[data-index="${index}"]`);
                  if (durationEl) durationEl.textContent = formatted;
              }
              
              URL.revokeObjectURL(blobUrl);
              resolve();
          };
          
          const onError = () => {
              clearTimeout(timeout);
              URL.revokeObjectURL(blobUrl);
              reject(new Error('Load error'));
          };
          
          tempAudio.addEventListener('loadedmetadata', onMetadata);
          tempAudio.addEventListener('error', onError);
      });
  } catch (err) {
      console.error(`Failed to load duration for file ${fileId}:`, err);
  }
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
    searchContainer.style.display = 'none';
    state.searchQuery = '';
    searchInput.value = '';
    resetTitleColors();
    showAlbums();
  };
}

// --- HELPER: PAGINATION ---
async function fetchAll(query: string, fields: string) {
  let files: any[] = [];
  let pageToken = null;
  do {
      const res: any = await gapi.client.drive.files.list({
          q: query, fields: `nextPageToken, files(${fields})`, pageSize: 1000, pageToken: pageToken
      });
      if (res.result.files) files = files.concat(res.result.files);
      pageToken = res.result.nextPageToken;
  } while (pageToken);
  return files;
}

// --- HELPER: SECURE IMAGE ---
async function loadSecureImage(imgEl: HTMLImageElement, fileId: string) {
  if (state.coverBlobCache[fileId]) {
      imgEl.src = state.coverBlobCache[fileId];
      return;
  }
  try {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      state.coverBlobCache[fileId] = url;
      imgEl.src = url;
  } catch {
      imgEl.src = FALLBACK_COVER;
  }
}

// --- SYNC ---
async function syncLibrary() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });
  state.trackCache = {}; 
  state.coverBlobCache = {}; 

  try {
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">SCANNING "${MUSIC_FOLDER_NAME}"...</div>`;

    const rootRes = await gapi.client.drive.files.list({
      pageSize: 1, fields: "files(id)",
      q: `name = '${MUSIC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    });
    state.rootId = rootRes.result.files?.[0]?.id;
    
    if(!state.rootId) {
        mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow); font-weight:700;">FOLDER NOT FOUND</div>`;
        return;
    }

    state.albums = await fetchAll(
      `'${state.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      "id, name"
    );
    const allCovers = await fetchAll(
      `name = 'folder.jpg' and trashed = false`,
      "id, parents"
    );
    
    state.covers = {};
    allCovers.forEach((f: any) => { if(f.parents?.[0]) state.covers[f.parents[0]] = f.id; });

    showAlbums();
  } catch {
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>`;
  }
}

// --- VIEWS ---
function showAlbums() {
  backBtn.style.display = 'none';
  mainHeader.classList.remove('album-mode');
  pageTitle.innerText = "MP3P";
  
  if(state.albums.length === 0) {
      mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS FOUND</div>`;
      return;
  }

  const filteredAlbums = state.searchQuery
    ? state.albums.filter(album => album.name.toLowerCase().includes(state.searchQuery))
    : state.albums;

  if (filteredAlbums.length === 0) {
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS MATCH "${state.searchQuery}"</div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';
  
  filteredAlbums.forEach(album => {
    const coverId = state.covers[album.id];
    const card = document.createElement('div');
    card.className = 'album-card';
    
    const titleClass = (album.id === state.playingAlbumId) ? 'album-title playing' : 'album-title';
    
    card.innerHTML = `<img class="album-cover" src="${EMPTY_COVER}"><div class="${titleClass}">${album.name}</div>`;
    
    const img = card.querySelector('img') as HTMLImageElement;
    if (coverId) loadSecureImage(img, coverId); else img.src = FALLBACK_COVER;
    
    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
  });
  
  mainView.innerHTML = '';
  mainView.appendChild(grid);

  if (state.playingAlbumId) {
    applyAlbumColors(state.playingAlbumId);
  }
}

async function openAlbum(album: DriveFile) {
  state.currentAlbum = album;
  backBtn.style.display = 'block';
  mainHeader.classList.add('album-mode');
  pageTitle.innerText = album.name.toUpperCase();
  
  searchContainer.style.display = 'none';
  
  const colors = await loadAlbumColors(album.id);
  if (colors) {
    applyAlbumTitleColors(album.id);
  } else {
    resetTitleColors();
  }
  
  if (state.trackCache[album.id]) {
      state.tracks = state.trackCache[album.id];
      renderTrackList();
      return;
  }

  mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING TRACKS...</div>`;

  try {
      state.tracks = await fetchAll(
        `'${album.id}' in parents and (mimeType contains 'audio/') and trashed = false`,
        "id, name, mimeType, size"
      );
      
      state.tracks.sort((a, b) => {
          const aInfo = parseTrackName(a.name);
          const bInfo = parseTrackName(b.name);
          return aInfo.number - bInfo.number;
      });
      
      state.trackCache[album.id] = state.tracks;
      renderTrackList();
  } catch {
      mainView.innerHTML = "ERROR LOADING TRACKS";
  }
}

function renderTrackList() {
  const isDesktop = window.innerWidth > 768;
  
  if (isDesktop) {
    const container = document.createElement('div');
    container.className = 'album-view-desktop';
    
    const leftSection = document.createElement('div');
    leftSection.className = 'album-left';
    
    const artBox = document.createElement('div');
    artBox.className = 'album-art-large';
    const artImg = document.createElement('img');
    artImg.src = EMPTY_COVER;
    const coverId = state.currentAlbum && state.covers[state.currentAlbum.id];
    if (coverId) loadSecureImage(artImg, coverId); else artImg.src = FALLBACK_COVER;
    artBox.appendChild(artImg);
    
    const infoBox = document.createElement('div');
    infoBox.className = 'album-info';
    infoBox.innerHTML = `
      <h2>${state.currentAlbum?.name || 'Unknown Album'}</h2>
      <p class="track-count">${state.tracks.length} tracks</p>
    `;
    
    leftSection.appendChild(artBox);
    leftSection.appendChild(infoBox);
    
    const middleSection = document.createElement('div');
    middleSection.className = 'album-middle';
    const list = document.createElement('div');
    list.className = 'track-list-compact';
    
    state.tracks.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      const isActive = (file.id === state.playingFileId);
      if (isActive) row.classList.add('active');

      const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
      const { cleanName } = parseTrackName(file.name);
      const cachedDuration = state.durationCache[file.id] || '--:--';

      row.innerHTML = `
          <div class="track-left">
              <div class="track-num">${index + 1}</div>
              <div class="track-info">
                  <div class="track-name">${cleanName}</div>
              </div>
          </div>
          <div class="track-right">
              <span class="track-tech tech-ext">${ext}</span>
              <span class="track-tech track-duration" data-index="${index}">${cachedDuration}</span>
          </div>
      `;
      row.onclick = () => play(index);
      list.appendChild(row);

      if (!state.durationCache[file.id]) {
          loadTrackDuration(file.id, index);
      }
    });
    
    middleSection.appendChild(list);
    
    const rightSection = document.createElement('div');
    rightSection.className = 'album-right';
    rightSection.id = 'lyrics-panel';
    rightSection.innerHTML = `
      <div class="lyrics-header">LYRICS</div>
      <div class="lyrics-content">
        <p class="lyrics-placeholder">Select a track to view lyrics</p>
      </div>
    `;
    
    if (state.currentTrackLyrics.plain || state.currentTrackLyrics.synced) {
      setTimeout(() => updateLyricsPanel(state.currentTrackLyrics), 100);
    }
    
    container.appendChild(leftSection);
    container.appendChild(middleSection);
    container.appendChild(rightSection);
    
    mainView.innerHTML = '';
    mainView.appendChild(container);
  } else {
    const list = document.createElement('div');
    list.className = 'track-list';
    
    state.tracks.forEach((file, index) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      const isActive = (file.id === state.playingFileId);
      if (isActive) row.classList.add('active');

      const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
      const { cleanName } = parseTrackName(file.name);
      const cachedDuration = state.durationCache[file.id] || '--:--';

      row.innerHTML = `
          <div class="track-left">
              <div class="track-num">${index + 1}</div>
              <div class="track-info">
                  <div class="track-name">${cleanName}</div>
              </div>
          </div>
          <div class="track-right">
              <span class="track-tech tech-ext">${ext}</span>
              <span class="track-tech track-duration" data-index="${index}">${cachedDuration}</span>
          </div>
      `;
      row.onclick = () => play(index);
      list.appendChild(row);

      if (!state.durationCache[file.id]) {
          loadTrackDuration(file.id, index);
      }
    });
    
    mainView.innerHTML = '';
    mainView.appendChild(list);
  }
}

// --- PRELOAD HELPERS ---
function schedulePreloadNext() {
  if (!preloadAudio || !state.playlist.length) return;
  if (!audio.duration || !isFinite(audio.duration)) return;

  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.playlist.length) return;

  const targetFile = state.playlist[nextIndex];
  if (preloadedFileId === targetFile.id) return;

  const halfway = audio.duration / 2;

  const handler = () => {
    if (!audio.duration) return;
    if (audio.currentTime >= halfway) {
      audio.removeEventListener('timeupdate', handler);
      preloadTrack(targetFile);
    }
  };

  audio.addEventListener('timeupdate', handler);
}

async function preloadTrack(file: DriveFile) {
  if (!preloadAudio) return;
  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.token}`, 'Accept': 'audio/*' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    preloadAudio.src = url;
    preloadedFileId = file.id;
    preloadAudio.load();
  } catch (e) {
    console.error('Preload failed', e);
    preloadedFileId = null;
  }
}

// --- PLAYER ENGINE ---
async function play(index: number, retryCount = 0) {
  if (state.isLoadingTrack) {
      return;
  }

  state.isLoadingTrack = true;
  state.currentIndex = index;
  state.playlist = state.tracks;
  const file = state.playlist[index];
  state.playingFileId = file.id; 
  
  if (state.currentAlbum) {
      state.playingAlbumId = state.currentAlbum.id;
      
      const colors = await loadAlbumColors(state.currentAlbum.id);
      
      if (colors) {
        applyPlayButtonColors(state.currentAlbum.id);
      } else {
        resetPlayButtonColors();
      }
      
      const isGridView = backBtn.style.display === 'none';
      if (isGridView) {
        showAlbums();
      }
  }

  renderTrackList();

  pTitle.innerText = "LOADING...";
  pArtist.innerText = state.currentAlbum ? state.currentAlbum.name.toUpperCase() : "UNKNOWN"; 
  
  const coverId = state.currentAlbum && state.covers[state.currentAlbum.id];
  if (coverId) loadSecureImage(pArt, coverId); else pArt.src = FALLBACK_COVER;

  if (state.blobUrl) { 
      URL.revokeObjectURL(state.blobUrl); 
      state.blobUrl = null; 
  }

  const canUsePreloaded = preloadAudio && preloadedFileId === file.id;
  try {
      if (canUsePreloaded && preloadAudio) {
        audio.src = preloadAudio.src;
        audio.load();
      } else {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 
                'Authorization': `Bearer ${state.token}`,
                'Accept': 'audio/*'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        state.blobUrl = blobUrl;
        
        audio.src = blobUrl;
        audio.load();
      }
      
      await new Promise((resolve, reject) => {
          audio.oncanplaythrough = resolve;
          audio.onerror = reject;
          setTimeout(reject, 10000);
      });
      
      await audio.play();
      
      state.isPlaying = true;
      state.isLoadingTrack = false;
      updatePlayBtn();
      
      const { cleanName } = parseTrackName(file.name);
      pTitle.innerText = cleanName.toUpperCase();
      
      btnLyricsToggle.style.display = 'block';
      
      loadLyrics(file.name).then(lyrics => {
        state.currentTrackLyrics = lyrics;

        // set currentLyrics for synced flow
        if (lyrics.synced && lyrics.synced.length > 0) {
          state.currentLyrics = lyrics.synced;
          state.currentLyricIndex = -1;
        } else {
          state.currentLyrics = [];
          state.currentLyricIndex = -1;
        }
        
        // desktop lyrics panel
        const lyricsContent = document.querySelector('.lyrics-content');
        if (lyricsContent) {
          updateLyricsPanel(lyrics);
        }
        
        // always update curtain (mobile + desktop)
        updateCurtainLyrics(lyrics);
      }).catch(err => {
        console.error('Failed to load lyrics:', err);
        state.currentTrackLyrics = { plain: null, synced: null };
        state.currentLyrics = [];
        state.currentLyricIndex = -1;
      });

      schedulePreloadNext();
      
  } catch (err: any) {
      console.error("Playback Error:", err);
      state.isLoadingTrack = false;
      
      if (retryCount < 2) {
          setTimeout(() => play(index, retryCount + 1), 1000);
          return;
      }
      
      pTitle.innerText = "ERROR PLAYING";
      
      if (err.message?.includes('403') || err.message?.includes('401')) {
          pArtist.innerText = "TOKEN EXPIRED - RESET";
      } else if (err.name === 'NotSupportedError') {
          pArtist.innerText = "FORMAT NOT SUPPORTED";
      } else {
          pArtist.innerText = "PLAYBACK FAILED - TAP NEXT";
      }
  }

  if ('mediaSession' in navigator) {
      const { cleanName } = parseTrackName(file.name);
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
          title: cleanName,
          artist: state.currentAlbum?.name || 'Unknown',
          artwork: [{ src: pArt.src, sizes: '512x512', type: 'image/jpeg' }]
      });
      
      (navigator as any).mediaSession.setActionHandler('play', () => { audio.play(); state.isPlaying = true; updatePlayBtn(); });
      (navigator as any).mediaSession.setActionHandler('pause', () => { audio.pause(); state.isPlaying = false; updatePlayBtn(); });
      (navigator as any).mediaSession.setActionHandler('previoustrack', () => { if (state.currentIndex > 0) play(state.currentIndex - 1); });
      (navigator as any).mediaSession.setActionHandler('nexttrack', () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); });
  }
}

// --- CONTROLS ---
function updatePlayBtn() {
  btnPlay.textContent = state.isPlaying ? '||' : '▶';
}

btnPlay.onclick = () => { 
  if (audio.paused) { 
      audio.play(); 
      state.isPlaying = true; 
  } else { 
      audio.pause(); 
      state.isPlaying = false; 
  } 
  updatePlayBtn(); 
};

btnNext.onclick = () => { 
  if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); 
};

btnPrev.onclick = () => { 
  if (state.currentIndex > 0) play(state.currentIndex - 1); 
};

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  pBarFill.style.width = `${pct}%`;
  
  updateSyncedLyrics(audio.currentTime);
};

audio.onended = () => { 
  if (state.currentIndex < state.playlist.length - 1) {
      play(state.currentIndex + 1); 
  }
};

audio.onerror = (e) => {
  console.error('Audio element error:', e);
  state.isLoadingTrack = false;
  
  if (!state.isPlaying) return;
  
  pTitle.innerText = "PLAYBACK ERROR";
  pArtist.innerText = "SKIPPING...";
  
  setTimeout(() => {
      if (state.currentIndex < state.playlist.length - 1) {
          play(state.currentIndex + 1);
      }
  }, 1500);
};

pScrubber.onclick = (e) => {
  const rect = pBarBg.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (audio.duration && isFinite(audio.duration)) {
    audio.currentTime = pos * audio.duration;
  }
};

loadScripts();

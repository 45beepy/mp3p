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

let state = {
  token: sessionStorage.getItem('g_token'),
  rootId: null as string | null,
  albums: [] as DriveFile[],
  tracks: [] as DriveFile[],
  covers: {} as Record<string, string>,
  playlist: [] as DriveFile[],
  currentIndex: -1,
  currentAlbum: null as DriveFile | null,
  isPlaying: false,
  blobUrl: null as string | null
};

// --- DOM SETUP (GENIUS STYLE) ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header>
    <div style="display:flex; align-items:center; gap:15px;">
      <button id="back-btn" class="secondary" style="display:none;">BACK</button>
      <h1 id="page-title">MP3P</h1>
    </div>
    <div style="display:flex; gap:10px;">
        <button id="logout-btn" class="secondary">RESET</button>
        <button id="auth-btn">SYNC</button>
    </div>
  </header>
  
  <div id="main-view">
    <div style="padding:50px; text-align:center; color:#666; font-weight:700;">
      TAP <span style="color:#fff; background:#333; padding:2px 6px;">SYNC</span> TO LOAD LIBRARY<br><br>
      (READING FOLDER: "${MUSIC_FOLDER_NAME}")
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
    </div>
  </div>
  
  <audio id="audio-engine" crossorigin="anonymous"></audio>
`;

const mainView = document.getElementById('main-view')!;
const backBtn = document.getElementById('back-btn')!;
const pageTitle = document.getElementById('page-title')!;
const audio = document.getElementById('audio-engine') as HTMLAudioElement;

const pTitle = document.getElementById('p-title')!;
const pArtist = document.getElementById('p-artist')!;
const pArt = document.getElementById('p-art') as HTMLImageElement;
const btnPlay = document.getElementById('btn-play')!;
const btnNext = document.getElementById('btn-next')!;
const btnPrev = document.getElementById('btn-prev')!;
const pScrubber = document.getElementById('p-scrubber')!; 
const pBarBg = document.getElementById('p-bar-bg')!;
const pBarFill = document.getElementById('p-bar-fill')!;

pArt.onerror = () => { if (pArt.src !== FALLBACK_COVER) pArt.src = FALLBACK_COVER; };

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
  document.getElementById('logout-btn')!.onclick = () => { sessionStorage.clear(); location.reload(); };
  backBtn.onclick = showAlbums;
}

// --- HELPER: PAGINATION ---
async function fetchAll(query: string, fields: string) {
    let files: any[] = [];
    let pageToken = null;
    do {
        const res: any = await gapi.client.drive.files.list({
            q: query,
            fields: `nextPageToken, files(${fields})`,
            pageSize: 1000,
            pageToken: pageToken
        });
        if (res.result.files) files = files.concat(res.result.files);
        pageToken = res.result.nextPageToken;
    } while (pageToken);
    return files;
}

// --- HELPER: SECURE IMAGE ---
async function loadSecureImage(imgEl: HTMLImageElement, fileId: string) {
    try {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!resp.ok) throw new Error();
        const blob = await resp.blob();
        imgEl.src = URL.createObjectURL(blob);
    } catch (e) { imgEl.src = FALLBACK_COVER; }
}

// --- SYNC ---
async function syncLibrary() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });

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

    state.albums = await fetchAll(`'${state.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, "id, name");
    const allCovers = await fetchAll(`name = 'folder.jpg' and trashed = false`, "id, parents");
    
    state.covers = {};
    allCovers.forEach((f: any) => { if(f.parents?.[0]) state.covers[f.parents[0]] = f.id; });

    showAlbums();
  } catch (e: any) {
    console.error(e);
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>`;
  }
}

// --- VIEWS ---
function showAlbums() {
  backBtn.style.display = 'none';
  pageTitle.innerText = "MP3P";
  if(state.albums.length === 0) {
      mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS FOUND</div>`;
      return;
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  state.albums.forEach(album => {
    const coverId = state.covers[album.id];
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `<img class="album-cover" src="${EMPTY_COVER}"><div class="album-title">${album.name}</div>`;
    const img = card.querySelector('img') as HTMLImageElement;
    if (coverId) loadSecureImage(img, coverId); else img.src = FALLBACK_COVER;
    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
  });
  mainView.innerHTML = '';
  mainView.appendChild(grid);
}

async function openAlbum(album: DriveFile) {
  state.currentAlbum = album;
  backBtn.style.display = 'block';
  pageTitle.innerText = album.name.toUpperCase();
  mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING TRACKS...</div>`;
  try {
      state.tracks = await fetchAll(`'${album.id}' in parents and (mimeType contains 'audio/') and trashed = false`, "id, name, mimeType, size");
      state.tracks.sort((a, b) => a.name.localeCompare(b.name));
      renderTrackList();
  } catch (err) { mainView.innerHTML = "ERROR LOADING TRACKS"; }
}

function renderTrackList() {
    const list = document.createElement('div');
    list.className = 'track-list';
    state.tracks.forEach((file, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        const ext = file.name.split('.').pop()?.toUpperCase();
        row.innerHTML = `
            <div class="track-num">${index + 1}</div>
            <div class="track-info">
                <div class="track-name">${file.name.replace(/\.[^/.]+$/, "")}</div>
                <div class="track-meta">${ext}</div>
            </div>
        `;
        row.onclick = () => play(index);
        list.appendChild(row);
    });
    mainView.innerHTML = '';
    mainView.appendChild(list);
}

// --- PLAYER ENGINE (HYBRID: FETCH for MP3, DIRECT for FLAC) ---
async function play(index: number) {
    state.currentIndex = index;
    state.playlist = state.tracks;
    const file = state.playlist[index];
    
    // UI Update
    pTitle.innerText = "BUFFERING...";
    pArtist.innerText = file.name.replace(/\.[^/.]+$/, "");
    const coverId = state.currentAlbum && state.covers[state.currentAlbum.id];
    if (coverId) loadSecureImage(pArt, coverId); else pArt.src = FALLBACK_COVER;

    if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; }

    // --- CRITICAL FIX FOR FLAC ---
    const isFlac = file.mimeType.includes('flac') || file.name.toLowerCase().endsWith('.flac');

    if (isFlac) {
        // FLAC files are too big for Blob Fetch. Use Direct Stream Link.
        console.log("Playing FLAC via Direct Link");
        audio.src = `https://drive.google.com/uc?export=download&id=${file.id}`;
        audio.play();
        state.isPlaying = true;
        updatePlayBtn();
        pTitle.innerText = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
    } else {
        // MP3s use the Secure Fetch (Blob) because it works for you
        console.log("Playing MP3 via Blob Fetch");
        try {
            const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
            if (!resp.ok) throw new Error("Playback Failed: " + resp.status);
            const blob = await resp.blob();
            state.blobUrl = URL.createObjectURL(blob);
            audio.src = state.blobUrl;
            audio.play();
            state.isPlaying = true;
            updatePlayBtn();
            pTitle.innerText = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
        } catch (err) {
            console.error(err);
            pTitle.innerText = "ERROR PLAYING";
            pArtist.innerText = "TRY RESETTING";
        }
    }
}

// --- CONTROLS ---
function updatePlayBtn() { btnPlay.innerText = state.isPlaying ? "⏸" : "▶"; }
btnPlay.onclick = () => { if (audio.paused) { audio.play(); state.isPlaying = true; } else { audio.pause(); state.isPlaying = false; } updatePlayBtn(); };
btnNext.onclick = () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); };
btnPrev.onclick = () => { if (state.currentIndex > 0) play(state.currentIndex - 1); };

audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    pBarFill.style.width = `${pct}%`;
};
audio.onended = () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); };
pScrubber.onclick = (e) => {
    const rect = pBarBg.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
};

loadScripts();

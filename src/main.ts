import './style.css'

declare const gapi: any;
declare const google: any;

// --- CONFIG ---
const API_KEY = 'AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw';
const CLIENT_ID = '957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const MUSIC_FOLDER_NAME = 'mp3p_music'; 

// --- STATE ---
interface DriveFile { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string; parents?: string[]; }

let state = {
  token: sessionStorage.getItem('g_token'),
  rootId: null as string | null,
  albums: [] as DriveFile[],
  tracks: [] as DriveFile[],
  covers: {} as Record<string, string>,
  
  // Playback
  playlist: [] as DriveFile[],
  currentIndex: -1,
  currentAlbum: null as DriveFile | null,
  isPlaying: false,
  blobUrl: null as string | null // To clean up memory
};

// --- DOM SETUP ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header>
    <div style="display:flex; align-items:center; gap:10px;">
      <button id="back-btn" class="secondary" style="display:none;">←</button>
      <h1 id="page-title">.MP3P</h1>
    </div>
    <div style="display:flex; gap:10px;">
        <button id="logout-btn" class="secondary" style="font-size:0.6rem;">RESET</button>
        <button id="auth-btn">SYNC</button>
    </div>
  </header>
  
  <div id="main-view">
    <div style="padding:50px; text-align:center; color:#555;">
      Tap <strong>SYNC</strong> to load library.<br><br>
      (Reads folder: "${MUSIC_FOLDER_NAME}")
    </div>
  </div>

  <div id="player-bar">
    <div class="p-info">
      <img id="p-art" class="p-art" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
      <div class="p-text">
        <div id="p-title" class="p-title">Not Playing</div>
        <div id="p-artist" class="p-artist">Select a track</div>
      </div>
    </div>

    <div class="p-center">
      <div class="p-controls">
        <button class="ctrl-btn" id="btn-prev">⏮</button>
        <button class="ctrl-btn play-btn" id="btn-play">▶</button>
        <button class="ctrl-btn" id="btn-next">⏭</button>
      </div>
      <div class="p-progress-container">
        <span id="p-current">0:00</span>
        <div id="p-bar-bg" class="p-bar-bg">
          <div id="p-bar-fill" class="p-bar-fill"></div>
        </div>
        <span id="p-duration">-:--</span>
      </div>
    </div>
    <div class="p-right"></div>
  </div>
  
  <audio id="audio-engine" crossorigin="anonymous"></audio>
`;

const mainView = document.getElementById('main-view')!;
const backBtn = document.getElementById('back-btn')!;
const pageTitle = document.getElementById('page-title')!;
const audio = document.getElementById('audio-engine') as HTMLAudioElement;

// Player Elements
const pTitle = document.getElementById('p-title')!;
const pArtist = document.getElementById('p-artist')!;
const pArt = document.getElementById('p-art') as HTMLImageElement;
const btnPlay = document.getElementById('btn-play')!;
const btnNext = document.getElementById('btn-next')!;
const btnPrev = document.getElementById('btn-prev')!;
const pBarBg = document.getElementById('p-bar-bg')!;
const pBarFill = document.getElementById('p-bar-fill')!;
const pCurrent = document.getElementById('p-current')!;
const pDuration = document.getElementById('p-duration')!;

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

// --- SYNC ---
async function syncLibrary() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });

  try {
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">Scanning "${MUSIC_FOLDER_NAME}"...</div>`;

    const rootRes = await gapi.client.drive.files.list({
      pageSize: 1, fields: "files(id)",
      q: `name = '${MUSIC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    });
    state.rootId = rootRes.result.files?.[0]?.id;
    
    if(!state.rootId) {
        mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#f55;">Folder not found!</div>`;
        return;
    }

    const albumsRes = await gapi.client.drive.files.list({
      pageSize: 1000, fields: "files(id, name)",
      q: `'${state.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      orderBy: "name"
    });
    state.albums = albumsRes.result.files || [];

    const coversRes = await gapi.client.drive.files.list({
      pageSize: 1000, fields: "files(parents, thumbnailLink)",
      q: `name = 'folder.jpg' and trashed = false`
    });
    
    state.covers = {};
    (coversRes.result.files || []).forEach((f: any) => {
        if(f.parents?.[0]) state.covers[f.parents[0]] = f.thumbnailLink.replace(/=s\d+/, '=s600');
    });

    showAlbums();
  } catch (e) {
    console.error(e);
    mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#f55;">Connection Failed.<br>Try tapping RESET.</div>`;
  }
}

// --- VIEWS ---
function showAlbums() {
  backBtn.style.display = 'none';
  pageTitle.innerText = ".MP3P";
  
  if(state.albums.length === 0) {
      mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">No Albums Found.</div>`;
      return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';
  
  state.albums.forEach(album => {
    const cover = state.covers[album.id];
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = cover 
        ? `<img src="${cover}" class="album-cover"><div class="album-title" style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.7); padding:5px; box-sizing:border-box;">${album.name}</div>`
        : `<div class="album-placeholder">${album.name.substr(0,2)}</div><div class="album-title">${album.name}</div>`;
    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
  });
  
  mainView.innerHTML = '';
  mainView.appendChild(grid);
}

async function openAlbum(album: DriveFile) {
  state.currentAlbum = album;
  backBtn.style.display = 'block';
  pageTitle.innerText = album.name;
  mainView.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">Loading Tracks...</div>`;

  const res = await gapi.client.drive.files.list({
    pageSize: 1000, fields: "files(id, name, mimeType, size)",
    q: `'${album.id}' in parents and (mimeType contains 'audio/') and trashed = false`,
    orderBy: "name"
  });
  
  state.tracks = res.result.files || [];
  renderTrackList();
}

function renderTrackList() {
    const list = document.createElement('div');
    list.className = 'track-list';
    state.tracks.forEach((file, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        const ext = file.name.split('.').pop()?.toUpperCase();
        row.innerHTML = `
            <div class="track-info">
                <div class="track-name">${file.name.replace(/\.[^/.]+$/, "")}</div>
                <div class="track-meta">${ext}</div>
            </div>
            <div style="font-size:0.8rem; color:#555;">${index+1}</div>
        `;
        row.onclick = () => play(index);
        list.appendChild(row);
    });
    mainView.innerHTML = '';
    mainView.appendChild(list);
}

// --- PLAYER ENGINE (SECURE BLOB FETCH) ---
async function play(index: number) {
    state.currentIndex = index;
    state.playlist = state.tracks;
    const file = state.playlist[index];
    
    // 1. UI Feedback
    pTitle.innerText = "Buffering...";
    pArtist.innerText = file.name.replace(/\.[^/.]+$/, "");
    if (state.currentAlbum && state.covers[state.currentAlbum.id]) {
        pArt.src = state.covers[state.currentAlbum.id];
    } else {
        pArt.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }
    
    // 2. Cleanup Old Blob
    if (state.blobUrl) {
        URL.revokeObjectURL(state.blobUrl);
        state.blobUrl = null;
    }

    // 3. SECURE FETCH (The Fix)
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
        pTitle.innerText = file.name.replace(/\.[^/.]+$/, "");
        
    } catch (err) {
        console.error(err);
        pTitle.innerText = "Error Playing";
        pArtist.innerText = "Try tapping Reset";
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
    pCurrent.innerText = fmtTime(audio.currentTime);
    pDuration.innerText = fmtTime(audio.duration);
};
audio.onended = () => { if (state.currentIndex < state.playlist.length - 1) play(state.currentIndex + 1); };
pBarBg.onclick = (e) => {
    const rect = pBarBg.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
};
function fmtTime(s: number) { if (isNaN(s)) return "-:--"; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec < 10 ? '0' : ''}${sec}`; }

loadScripts();

import './style.css'

declare const gapi: any;
declare const google: any;

// --- TYPES ---
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  parents?: string[];
}

interface AppState {
  view: 'albums' | 'tracks';
  token: string | null;
  
  // Data
  rootFolderId: string | null;
  albums: DriveFile[];
  currentAlbum: DriveFile | null;
  tracks: DriveFile[];
  
  // Maps Album ID -> Cover URL
  covers: Record<string, string>;
  
  // Player
  playlist: DriveFile[];
  currentIndex: number;
} 

// --- CONFIG ---
const API_KEY = 'AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw';
const CLIENT_ID = '957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const MUSIC_FOLDER_NAME = 'mp3p_music'; 

// --- STATE ---
let state: AppState = {
  view: 'albums',
  token: sessionStorage.getItem('g_token'),
  rootFolderId: null,
  albums: [],
  currentAlbum: null,
  tracks: [],
  covers: {},
  playlist: [],
  currentIndex: -1
};

// --- DOM ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header>
    <div style="display:flex; align-items:center; gap:10px;">
      <button id="back-btn" class="secondary" style="display:none;">←</button>
      <h1 id="page-title">.MP3P</h1>
    </div>
    <button id="auth-btn">SYNC</button>
  </header>
  
  <div id="main-view">
    <div style="padding:40px; color:#666; text-align:center; margin-top:50px;">
      Tap SYNC to load library<br>
      (Reads "${MUSIC_FOLDER_NAME}")
    </div>
  </div>

  <div id="player-bar">
    <div id="np-title">Ready</div>
    <audio id="audio-engine" controls></audio>
  </div>
`;

const mainView = document.getElementById('main-view')!;
const backBtn = document.getElementById('back-btn')!;
const pageTitle = document.getElementById('page-title')!;
const audio = document.getElementById('audio-engine') as HTMLAudioElement;
const status = document.getElementById('np-title')!;

// --- GOOGLE LOADERS ---
function loadScripts() {
  const s1 = document.createElement('script');
  s1.src = 'https://apis.google.com/js/api.js';
  s1.onload = () => gapi.load('client', initGapi);
  document.body.append(s1);

  const s2 = document.createElement('script');
  s2.src = 'https://accounts.google.com/gsi/client';
  s2.onload = initGis;
  document.body.append(s2);
}

async function initGapi() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
  if (state.token) syncLibrary();
}

function initGis() {
  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error) return;
      state.token = resp.access_token;
      sessionStorage.setItem('g_token', resp.access_token);
      syncLibrary();
    },
  });
  document.getElementById('auth-btn')!.onclick = () => tokenClient.requestAccessToken({ prompt: '' });
  backBtn.onclick = showAlbumGrid;
}

// --- LOGIC: SYNC ALBUMS ---

async function syncLibrary() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });

  try {
    mainView.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">Finding "${MUSIC_FOLDER_NAME}"...</div>`;

    // 1. Find Root Folder
    const rootRes = await gapi.client.drive.files.list({
      pageSize: 1,
      fields: "files(id)",
      q: `name = '${MUSIC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    });
    
    const rootId = rootRes.result.files?.[0]?.id;
    if (!rootId) {
      mainView.innerHTML = `<div style="text-align:center; color:red; padding:40px;">Folder "${MUSIC_FOLDER_NAME}" not found.</div>`;
      return;
    }
    state.rootFolderId = rootId;

    // 2. Fetch Albums (Folders inside root)
    mainView.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">Loading Albums...</div>`;
    
    const albumsRes = await gapi.client.drive.files.list({
      pageSize: 1000,
      fields: "files(id, name)",
      q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      orderBy: "name"
    });
    
    state.albums = albumsRes.result.files || [];

    // 3. Fetch Covers (Search for 'folder.jpg' globally-ish and map to parents)
    // Optimization: We fetch all folder.jpg files created by user to avoid N+1 queries
    // We filter them by checking if their parent is one of our known albums.
    const coversRes = await gapi.client.drive.files.list({
      pageSize: 1000,
      fields: "files(id, parents, thumbnailLink)",
      q: `name = 'folder.jpg' and trashed = false`,
    });

    // Map Covers to Album IDs
    const potentialCovers = coversRes.result.files || [];
    state.covers = {};
    potentialCovers.forEach((file: any) => {
        if(file.parents && file.parents.length > 0) {
            const parentId = file.parents[0];
            if (file.thumbnailLink) {
                // High-Res Hack
                state.covers[parentId] = file.thumbnailLink.replace(/=s\d+/, '=s600'); 
            }
        }
    });

    showAlbumGrid();

  } catch (err) {
    console.error(err);
    mainView.innerHTML = `<div style="text-align:center; color:red; padding:20px;">Sync Failed. Check Console.</div>`;
  }
}

// --- VIEW: ALBUM GRID ---

function showAlbumGrid() {
  state.view = 'albums';
  backBtn.style.display = 'none';
  pageTitle.innerText = ".MP3P";
  
  if (state.albums.length === 0) {
      mainView.innerHTML = `<div style="text-align:center; padding:40px;">No Albums found in "${MUSIC_FOLDER_NAME}"</div>`;
      return;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';

  state.albums.forEach(album => {
    const coverUrl = state.covers[album.id];
    const card = document.createElement('div');
    card.className = 'album-card';
    
    // Fallback if no cover
    if (coverUrl) {
        card.innerHTML = `
            <img src="${coverUrl}" class="album-cover" loading="lazy">
            <div class="album-title">${album.name}</div>
        `;
    } else {
        const initials = album.name.substring(0, 2).toUpperCase();
        card.innerHTML = `
            <div class="album-placeholder">${initials}</div>
            <div class="album-title">${album.name}</div>
        `;
    }

    card.onclick = () => openAlbum(album);
    grid.appendChild(card);
  });

  mainView.innerHTML = '';
  mainView.appendChild(grid);
}

// --- VIEW: TRACK LIST ---

async function openAlbum(album: DriveFile) {
  state.view = 'tracks';
  state.currentAlbum = album;
  
  // Update Header
  backBtn.style.display = 'block';
  pageTitle.innerText = album.name;
  
  mainView.innerHTML = `<div style="text-align:center; padding:40px; color:#888;">Loading Tracks...</div>`;

  try {
    // Fetch Audio Files in this Album
    const res = await gapi.client.drive.files.list({
      pageSize: 1000,
      fields: "files(id, name, mimeType, size)",
      q: `'${album.id}' in parents and (mimeType contains 'audio/') and trashed = false`,
      orderBy: "name"
    });

    state.tracks = res.result.files || [];
    renderTrackList();

  } catch (err) {
    console.error(err);
    mainView.innerHTML = `<div style="text-align:center; color:red; padding:20px;">Failed to load tracks.</div>`;
  }
}

function renderTrackList() {
    if (state.tracks.length === 0) {
        mainView.innerHTML = `<div style="text-align:center; padding:40px;">No music files in this folder.</div>`;
        return;
    }

    const list = document.createElement('div');
    list.className = 'track-list';

    state.tracks.forEach((file, index) => {
        const isLossless = file.mimeType.includes('flac') || file.mimeType.includes('wav');
        const color = isLossless ? 'var(--veg)' : 'var(--nonveg)';
        const sizeMB = (parseInt(file.size || '0') / 1024 / 1024).toFixed(1);
        const ext = file.name.split('.').pop()?.toUpperCase();

        const row = document.createElement('div');
        row.className = 'track-row';
        row.innerHTML = `
            <div class="track-info">
                <div class="track-name">${file.name.replace(/\.[^/.]+$/, "")}</div>
                <div class="track-meta">
                    <span class="quality-badge" style="background:${color}; box-shadow:0 0 5px ${color}"></span>
                    ${ext} • ${sizeMB} MB
                </div>
            </div>
            <div style="font-size:1.2rem; color:#444;">▶</div>
        `;

        row.onclick = () => playTrack(index, state.tracks); // Play this specific album list
        list.appendChild(row);
    });

    mainView.innerHTML = '';
    mainView.appendChild(list);
}

// --- PLAYER ---

function playTrack(index: number, contextList: DriveFile[]) {
  // Update Playlist context
  state.playlist = contextList;
  state.currentIndex = index;
  
  const file = state.playlist[index];
  status.innerText = file.name;
  
  audio.src = `https://drive.google.com/uc?export=download&id=${file.id}`;
  audio.play();

  // Media Session
  if ('mediaSession' in navigator) {
    const albumName = state.currentAlbum ? state.currentAlbum.name : 'Unknown Album';
    const cover = state.currentAlbum && state.covers[state.currentAlbum.id] 
        ? state.covers[state.currentAlbum.id] 
        : 'https://via.placeholder.com/512';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: file.name,
      artist: albumName,
      artwork: [{ src: cover, sizes: '512x512', type: 'image/png' }]
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (state.currentIndex + 1 < state.playlist.length) playTrack(state.currentIndex + 1, state.playlist);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (state.currentIndex > 0) playTrack(state.currentIndex - 1, state.playlist);
    });
  }
}

// Auto Next
audio.addEventListener('ended', () => {
  if (state.currentIndex + 1 < state.playlist.length) {
    playTrack(state.currentIndex + 1, state.playlist);
  }
});

// Start
loadScripts();

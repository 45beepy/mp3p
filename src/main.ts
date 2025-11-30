import './style.css'
// Add these lines at the top of src/main.ts
declare const gapi: any;
declare const google: any;
// 1. Type Definitions (The Java/Kotlin part of you will like this)
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string; // API returns size as string
  createdTime: string;
}

interface AppState {
  files: DriveFile[];
  currentIndex: number;
  token: string | null;
}

const API_KEY = 'YOUR_API_KEY';
const CLIENT_ID = 'YOUR_CLIENT_ID';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let state: AppState = {
  files: [],
  currentIndex: -1,
  token: sessionStorage.getItem('g_token')
};

// DOM Elements
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header style="padding: 20px; display:flex; justify-content:space-between;">
    <h1>.MP3P</h1>
    <button id="auth-btn">SYNC</button>
  </header>
  <div id="grid"></div>
  <div id="player-bar">
    <div id="now-playing" style="width: 150px; font-size: 0.8rem; white-space: nowrap; overflow: hidden;">Select Track</div>
    <audio id="audio-engine" controls></audio>
  </div>
`;

const grid = document.getElementById('grid') as HTMLDivElement;
const audio = document.getElementById('audio-engine') as HTMLAudioElement;
const status = document.getElementById('now-playing') as HTMLDivElement;

// --- GOOGLE API SETUP ---
// We need to load the GAPI scripts dynamically since we are in a module
function loadGoogleScripts() {
  const script1 = document.createElement('script');
  script1.src = 'https://apis.google.com/js/api.js';
  script1.onload = () => gapi.load('client', initGapiClient);
  document.body.appendChild(script1);

  const script2 = document.createElement('script');
  script2.src = 'https://accounts.google.com/gsi/client';
  script2.onload = initGisClient;
  document.body.appendChild(script2);
}

let tokenClient: any;

async function initGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  });
  if (state.token) loadDriveFiles();
}

function initGisClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp: any) => {
      if (resp.error) return;
      state.token = resp.access_token;
      sessionStorage.setItem('g_token', resp.access_token);
      loadDriveFiles();
    },
  });
  
  document.getElementById('auth-btn')!.onclick = () => {
    tokenClient.requestAccessToken({ prompt: '' });
  };
}

// --- LOGIC ---

async function loadDriveFiles() {
  if (!state.token) return;
  gapi.client.setToken({ access_token: state.token });

  const res = await gapi.client.drive.files.list({
    pageSize: 1000,
    fields: 'files(id, name, mimeType, size, createdTime)',
    q: "(mimeType contains 'audio/') and trashed = false",
    orderBy: 'createdTime desc'
  });

  state.files = res.result.files as DriveFile[];
  renderGrid();
}

function renderGrid() {
  grid.innerHTML = '';
  state.files.forEach((file, index) => {
    const isLossless = file.mimeType.includes('flac') || file.mimeType.includes('wav');
    const hue = (file.name.length * 20) % 360;
    
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front" style="background: linear-gradient(45deg, hsl(${hue}, 60%, 20%), hsl(${hue + 40}, 60%, 10%))">
          <div style="position:absolute; top:10px; right:10px; width:10px; height:10px; border-radius:50%; background:${isLossless ? '#0f0' : '#d00'}; box-shadow:0 0 5px currentColor;"></div>
          <div style="font-size:2rem; opacity:0.3; font-weight:900;">${file.name.substring(0, 2)}</div>
        </div>
        <div class="card-back">
          <div style="font-size:0.8rem; font-weight:bold; margin-bottom:10px;">${file.name}</div>
          <button class="play-btn">PLAY</button>
        </div>
      </div>
    `;

    // Click handling
    card.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('play-btn')) {
        card.classList.toggle('flipped');
      }
    };
    
    card.querySelector('.play-btn')!.addEventListener('click', () => playTrack(index));
    grid.appendChild(card);
  });
}

function playTrack(index: number) {
  state.currentIndex = index;
  const file = state.files[index];
  
  status.innerText = file.name;
  audio.src = `https://drive.google.com/uc?export=download&id=${file.id}`;
  audio.play();

  // Media Session for Android Lock Screen
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: file.name,
      artist: 'DriveStream',
      artwork: [{ src: 'https://via.placeholder.com/512', sizes: '512x512', type: 'image/png' }]
    });
  }
}

// Auto Next
audio.addEventListener('ended', () => {
  if (state.currentIndex + 1 < state.files.length) {
    playTrack(state.currentIndex + 1);
  }
});

// Start
loadGoogleScripts();

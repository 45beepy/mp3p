(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const s of o.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&a(s)}).observe(document,{childList:!0,subtree:!0});function r(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(i){if(i.ep)return;i.ep=!0;const o=r(i);fetch(i.href,o)}})();const N="AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw",S="957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com",U="https://www.googleapis.com/auth/drive.readonly",v="mp3p_music",m="https://i.pinimg.com/1200x/4a/86/34/4a86344f69940e6b166c0bcbde36c3bc.jpg",I="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";let e={token:sessionStorage.getItem("g_token"),rootId:null,albums:[],tracks:[],covers:{},trackCache:{},coverBlobCache:{},durationCache:{},playlist:[],currentIndex:-1,currentAlbum:null,playingFileId:null,playingAlbumId:null,isPlaying:!1,blobUrl:null};const P=document.querySelector("#app");P.innerHTML=`
  <header id="main-header">
    <div class="header-left">
      <button id="back-btn" class="secondary" style="display:none;">BACK</button>
      <h1 id="page-title">MP3P</h1>
    </div>
    <div class="header-right">
        <button id="logout-btn" class="secondary">RESET</button>
        <button id="auth-btn">SYNC</button>
    </div>
  </header>
  
  <div id="main-view">
    <div style="padding:50px; text-align:center; color:#666; font-weight:700;">
      TAP <span style="color:#000; background:var(--yellow); padding:2px 6px;">SYNC</span> TO LOAD LIBRARY<br><br>
      (READING FOLDER: "${v}")
    </div>
  </div>

  <div id="player-bar">
    <div class="p-art-box">
      <img id="p-art" class="p-art" src="${I}">
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
`;const L=document.getElementById("main-header"),l=document.getElementById("main-view"),k=document.getElementById("back-btn"),C=document.getElementById("page-title"),c=document.getElementById("audio-engine"),g=document.getElementById("p-title"),p=document.getElementById("p-artist"),d=document.getElementById("p-art"),w=document.getElementById("btn-play"),$=document.getElementById("btn-next"),M=document.getElementById("btn-prev"),D=document.getElementById("p-scrubber"),H=document.getElementById("p-bar-bg"),F=document.getElementById("p-bar-fill");d.onerror=()=>{d.src!==m&&(d.src=m)};function b(n){const t=n.replace(/\.[^/.]+$/,""),r=[/^(\d+)\.\s*/,/^(\d+)\s*-\s*/,/^(\d+)_\s*/,/^(\d+)\s+/];for(const a of r){const i=t.match(a);if(i){const o=parseInt(i[1],10),s=t.replace(a,"").trim();return{number:o,cleanName:s}}}return{number:999,cleanName:t}}async function j(n,t){if(e.durationCache[n]){const r=document.querySelector(`[data-index="${t}"]`);r&&(r.textContent=e.durationCache[n]);return}try{const r=await fetch(`https://www.googleapis.com/drive/v3/files/${n}?alt=media`,{headers:{Authorization:`Bearer ${e.token}`,Range:"bytes=0-50000"}});if(!r.ok)return;const a=await r.blob(),i=URL.createObjectURL(a),o=new Audio(i);o.addEventListener("loadedmetadata",()=>{const s=o.duration;if(s&&isFinite(s)){const y=Math.floor(s/60),B=Math.floor(s%60),E=`${y}:${B.toString().padStart(2,"0")}`;e.durationCache[n]=E;const T=document.querySelector(`[data-index="${t}"]`);T&&(T.textContent=E)}URL.revokeObjectURL(i)})}catch{}}function K(){const n=document.createElement("script");n.src="https://accounts.google.com/gsi/client",n.onload=q,document.body.append(n);const t=document.createElement("script");t.src="https://apis.google.com/js/api.js",t.onload=()=>gapi.load("client",_),document.body.append(t)}async function _(){await gapi.client.init({apiKey:N,discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]}),e.token&&R()}function q(){const n=google.accounts.oauth2.initTokenClient({client_id:S,scope:U,callback:t=>{t.error||(e.token=t.access_token,sessionStorage.setItem("g_token",t.access_token),R())}});document.getElementById("auth-btn").onclick=()=>n.requestAccessToken({prompt:""}),document.getElementById("logout-btn").onclick=()=>{Object.values(e.coverBlobCache).forEach(t=>URL.revokeObjectURL(t)),e.blobUrl&&URL.revokeObjectURL(e.blobUrl),sessionStorage.clear(),location.reload()},k.onclick=O}async function h(n,t){let r=[],a=null;do{const i=await gapi.client.drive.files.list({q:n,fields:`nextPageToken, files(${t})`,pageSize:1e3,pageToken:a});i.result.files&&(r=r.concat(i.result.files)),a=i.result.nextPageToken}while(a);return r}async function x(n,t){if(e.coverBlobCache[t]){n.src=e.coverBlobCache[t];return}try{const r=await fetch(`https://www.googleapis.com/drive/v3/files/${t}?alt=media`,{headers:{Authorization:`Bearer ${e.token}`}});if(!r.ok)throw new Error;const a=await r.blob(),i=URL.createObjectURL(a);e.coverBlobCache[t]=i,n.src=i}catch{n.src=m}}async function R(){if(e.token){gapi.client.setToken({access_token:e.token}),e.trackCache={},e.coverBlobCache={};try{l.innerHTML=`<div style="text-align:center; padding:50px; color:#666; font-weight:700;">SCANNING "${v}"...</div>`;const n=await gapi.client.drive.files.list({pageSize:1,fields:"files(id)",q:`name = '${v}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`});if(e.rootId=n.result.files?.[0]?.id,!e.rootId){l.innerHTML='<div style="text-align:center; padding:50px; color:var(--yellow); font-weight:700;">FOLDER NOT FOUND</div>';return}e.albums=await h(`'${e.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,"id, name");const t=await h("name = 'folder.jpg' and trashed = false","id, parents");e.covers={},t.forEach(r=>{r.parents?.[0]&&(e.covers[r.parents[0]]=r.id)}),O()}catch{l.innerHTML='<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>'}}}function O(){if(k.style.display="none",L.classList.remove("album-mode"),C.innerText="MP3P",e.albums.length===0){l.innerHTML='<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS FOUND</div>';return}const n=document.createElement("div");n.className="grid",e.albums.forEach(t=>{const r=e.covers[t.id],a=document.createElement("div");a.className="album-card";const i=t.id===e.playingAlbumId?"album-title playing":"album-title";a.innerHTML=`<img class="album-cover" src="${I}"><div class="${i}">${t.name}</div>`;const o=a.querySelector("img");r?x(o,r):o.src=m,a.onclick=()=>Y(t),n.appendChild(a)}),l.innerHTML="",l.appendChild(n)}async function Y(n){if(e.currentAlbum=n,k.style.display="block",L.classList.add("album-mode"),C.innerText=n.name.toUpperCase(),e.trackCache[n.id]){e.tracks=e.trackCache[n.id],A();return}l.innerHTML='<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING TRACKS...</div>';try{e.tracks=await h(`'${n.id}' in parents and (mimeType contains 'audio/') and trashed = false`,"id, name, mimeType, size"),e.tracks.sort((t,r)=>{const a=b(t.name),i=b(r.name);return a.number-i.number}),e.trackCache[n.id]=e.tracks,A()}catch{l.innerHTML="ERROR LOADING TRACKS"}}function A(){const n=document.createElement("div");n.className="track-list",e.tracks.forEach((t,r)=>{const a=document.createElement("div");a.className="track-row",t.id===e.playingFileId&&a.classList.add("active");const o=t.name.split(".").pop()?.toUpperCase()||"AUDIO",{cleanName:s}=b(t.name),y=e.durationCache[t.id]||"--:--";a.innerHTML=`
          <div class="track-left">
              <div class="track-num">${r+1}</div>
              <div class="track-info">
                  <div class="track-name">${s}</div>
              </div>
          </div>
          <div class="track-right">
              <span class="track-tech tech-ext">${o}</span>
              <span class="track-tech track-duration" data-index="${r}">${y}</span>
          </div>
      `,a.onclick=()=>u(r),n.appendChild(a),e.durationCache[t.id]||j(t.id,r)}),l.innerHTML="",l.appendChild(n)}async function u(n){e.currentIndex=n,e.playlist=e.tracks;const t=e.playlist[n];e.playingFileId=t.id,e.currentAlbum&&(e.playingAlbumId=e.currentAlbum.id),A(),g.innerText="LOADING...",p.innerText=e.currentAlbum?e.currentAlbum.name.toUpperCase():"UNKNOWN";const r=e.currentAlbum&&e.covers[e.currentAlbum.id];r?x(d,r):d.src=m,e.blobUrl&&(URL.revokeObjectURL(e.blobUrl),e.blobUrl=null);try{const a=await fetch(`https://www.googleapis.com/drive/v3/files/${t.id}?alt=media`,{headers:{Authorization:`Bearer ${e.token}`,Accept:"audio/*"}});if(!a.ok)throw new Error(`HTTP ${a.status}: ${a.statusText}`);const i=await a.blob(),o=URL.createObjectURL(i);e.blobUrl=o,c.src=o,c.load(),await c.play(),e.isPlaying=!0,f();const{cleanName:s}=b(t.name);g.innerText=s.toUpperCase()}catch(a){console.error("Playback Error:",a),g.innerText="ERROR PLAYING",a.message?.includes("403")||a.message?.includes("401")?p.innerText="TOKEN EXPIRED - RESET":a.name==="NotSupportedError"?p.innerText="FORMAT NOT SUPPORTED":p.innerText="PLAYBACK FAILED"}if("mediaSession"in navigator){const{cleanName:a}=b(t.name);navigator.mediaSession.metadata=new MediaMetadata({title:a,artist:e.currentAlbum?.name||"Unknown",artwork:[{src:d.src,sizes:"512x512",type:"image/jpeg"}]}),navigator.mediaSession.setActionHandler("play",()=>{c.play(),e.isPlaying=!0,f()}),navigator.mediaSession.setActionHandler("pause",()=>{c.pause(),e.isPlaying=!1,f()}),navigator.mediaSession.setActionHandler("previoustrack",()=>{e.currentIndex>0&&u(e.currentIndex-1)}),navigator.mediaSession.setActionHandler("nexttrack",()=>{e.currentIndex<e.playlist.length-1&&u(e.currentIndex+1)})}}function f(){w.textContent=e.isPlaying?"||":"▶"}w.onclick=()=>{c.paused?(c.play(),e.isPlaying=!0):(c.pause(),e.isPlaying=!1),f()};$.onclick=()=>{e.currentIndex<e.playlist.length-1&&u(e.currentIndex+1)};M.onclick=()=>{e.currentIndex>0&&u(e.currentIndex-1)};c.ontimeupdate=()=>{if(!c.duration)return;const n=c.currentTime/c.duration*100;F.style.width=`${n}%`};c.onended=()=>{e.currentIndex<e.playlist.length-1&&u(e.currentIndex+1)};c.onerror=n=>{console.error("Audio element error:",n),g.innerText="PLAYBACK ERROR",p.innerText="CHECK FORMAT SUPPORT"};D.onclick=n=>{const t=H.getBoundingClientRect(),r=(n.clientX-t.left)/t.width;c.currentTime=r*c.duration};K();

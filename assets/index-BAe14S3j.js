(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const c of r)if(c.type==="childList")for(const p of c.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&i(p)}).observe(document,{childList:!0,subtree:!0});function a(r){const c={};return r.integrity&&(c.integrity=r.integrity),r.referrerPolicy&&(c.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?c.credentials="include":r.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function i(r){if(r.ep)return;r.ep=!0;const c=a(r);fetch(r.href,c)}})();const w="AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw",C="957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com",B="https://www.googleapis.com/auth/drive.readonly",y="mp3p_music",m="https://i.pinimg.com/1200x/4a/86/34/4a86344f69940e6b166c0bcbde36c3bc.jpg",h="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";let e={token:sessionStorage.getItem("g_token"),rootId:null,albums:[],tracks:[],covers:{},trackCache:{},coverBlobCache:{},playlist:[],currentIndex:-1,currentAlbum:null,playingFileId:null,playingAlbumId:null,isPlaying:!1,blobUrl:null};const R=document.querySelector("#app");R.innerHTML=`
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
      (READING FOLDER: "${y}")
    </div>
  </div>

  <div id="player-bar">
    <div class="p-art-box">
      <img id="p-art" class="p-art" src="${h}">
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
`;const k=document.getElementById("main-header"),s=document.getElementById("main-view"),A=document.getElementById("back-btn"),I=document.getElementById("page-title"),o=document.getElementById("audio-engine"),g=document.getElementById("p-title"),u=document.getElementById("p-artist"),l=document.getElementById("p-art"),T=document.getElementById("btn-play"),O=document.getElementById("btn-next"),P=document.getElementById("btn-prev"),N=document.getElementById("p-scrubber"),S=document.getElementById("p-bar-bg"),U=document.getElementById("p-bar-fill");l.onerror=()=>{l.src!==m&&(l.src=m)};function M(){const n=document.createElement("script");n.src="https://accounts.google.com/gsi/client",n.onload=H,document.body.append(n);const t=document.createElement("script");t.src="https://apis.google.com/js/api.js",t.onload=()=>gapi.load("client",$),document.body.append(t)}async function $(){await gapi.client.init({apiKey:w,discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]}),e.token&&L()}function H(){const n=google.accounts.oauth2.initTokenClient({client_id:C,scope:B,callback:t=>{t.error||(e.token=t.access_token,sessionStorage.setItem("g_token",t.access_token),L())}});document.getElementById("auth-btn").onclick=()=>n.requestAccessToken({prompt:""}),document.getElementById("logout-btn").onclick=()=>{Object.values(e.coverBlobCache).forEach(t=>URL.revokeObjectURL(t)),e.blobUrl&&URL.revokeObjectURL(e.blobUrl),sessionStorage.clear(),location.reload()},A.onclick=x}async function v(n,t){let a=[],i=null;do{const r=await gapi.client.drive.files.list({q:n,fields:`nextPageToken, files(${t})`,pageSize:1e3,pageToken:i});r.result.files&&(a=a.concat(r.result.files)),i=r.result.nextPageToken}while(i);return a}async function E(n,t){if(e.coverBlobCache[t]){n.src=e.coverBlobCache[t];return}try{const a=await fetch(`https://www.googleapis.com/drive/v3/files/${t}?alt=media`,{headers:{Authorization:`Bearer ${e.token}`}});if(!a.ok)throw new Error;const i=await a.blob(),r=URL.createObjectURL(i);e.coverBlobCache[t]=r,n.src=r}catch{n.src=m}}async function L(){if(e.token){gapi.client.setToken({access_token:e.token}),e.trackCache={},e.coverBlobCache={};try{s.innerHTML=`<div style="text-align:center; padding:50px; color:#666; font-weight:700;">SCANNING "${y}"...</div>`;const n=await gapi.client.drive.files.list({pageSize:1,fields:"files(id)",q:`name = '${y}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`});if(e.rootId=n.result.files?.[0]?.id,!e.rootId){s.innerHTML='<div style="text-align:center; padding:50px; color:var(--yellow); font-weight:700;">FOLDER NOT FOUND</div>';return}e.albums=await v(`'${e.rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,"id, name");const t=await v("name = 'folder.jpg' and trashed = false","id, parents");e.covers={},t.forEach(a=>{a.parents?.[0]&&(e.covers[a.parents[0]]=a.id)}),x()}catch(n){console.error(n),s.innerHTML='<div style="text-align:center; padding:50px; color:var(--yellow);">CONNECTION FAILED<br>TRY RESET</div>'}}}function x(){if(A.style.display="none",k.classList.remove("album-mode"),I.innerText="MP3P",e.albums.length===0){s.innerHTML='<div style="text-align:center; padding:50px; color:#666;">NO ALBUMS FOUND</div>';return}const n=document.createElement("div");n.className="grid",e.albums.forEach(t=>{const a=e.covers[t.id],i=document.createElement("div");i.className="album-card";const r=t.id===e.playingAlbumId?"album-title playing":"album-title";i.innerHTML=`<img class="album-cover" src="${h}"><div class="${r}">${t.name}</div>`;const c=i.querySelector("img");a?E(c,a):c.src=m,i.onclick=()=>D(t),n.appendChild(i)}),s.innerHTML="",s.appendChild(n)}async function D(n){if(e.currentAlbum=n,A.style.display="block",k.classList.add("album-mode"),I.innerText=n.name.toUpperCase(),e.trackCache[n.id]){e.tracks=e.trackCache[n.id],f();return}s.innerHTML='<div style="text-align:center; padding:50px; color:#666; font-weight:700;">LOADING TRACKS...</div>';try{e.tracks=await v(`'${n.id}' in parents and (mimeType contains 'audio/') and trashed = false`,"id, name, mimeType, size"),e.tracks.sort((t,a)=>t.name.localeCompare(a.name)),e.trackCache[n.id]=e.tracks,f()}catch{s.innerHTML="ERROR LOADING TRACKS"}}function f(){const n=document.createElement("div");n.className="track-list",e.tracks.forEach((t,a)=>{const i=document.createElement("div");i.className="track-row",t.id===e.playingFileId&&i.classList.add("active");const c=t.name.split(".").pop()?.toUpperCase()||"AUDIO",p=t.size?(parseInt(t.size)/1024/1024).toFixed(1)+"MB":"";i.innerHTML=`
            <div class="track-left">
                <div class="track-num">${a+1}</div>
                <div class="track-info">
                    <div class="track-name">${t.name.replace(/\.[^/.]+$/,"")}</div>
                </div>
            </div>
            <div class="track-right">
                <span class="track-tech tech-ext">${c}</span>
                <span class="track-tech tech-size">${p}</span>
            </div>
        `,i.onclick=()=>d(a),n.appendChild(i)}),s.innerHTML="",s.appendChild(n)}async function d(n){e.currentIndex=n,e.playlist=e.tracks;const t=e.playlist[n];e.playingFileId=t.id,e.currentAlbum&&(e.playingAlbumId=e.currentAlbum.id),f(),g.innerText="LOADING...",u.innerText=e.currentAlbum?e.currentAlbum.name.toUpperCase():"UNKNOWN";const a=e.currentAlbum&&e.covers[e.currentAlbum.id];a?E(l,a):l.src=m,e.blobUrl&&(URL.revokeObjectURL(e.blobUrl),e.blobUrl=null);try{const i=await fetch(`https://www.googleapis.com/drive/v3/files/${t.id}?alt=media`,{headers:{Authorization:`Bearer ${e.token}`,Accept:"audio/*"}});if(!i.ok)throw new Error(`HTTP ${i.status}: ${i.statusText}`);const r=await i.blob(),c=URL.createObjectURL(r);e.blobUrl=c,o.src=c,o.load(),await o.play(),e.isPlaying=!0,b(),g.innerText=t.name.replace(/\.[^/.]+$/,"").toUpperCase()}catch(i){console.error("Playback Error:",i),g.innerText="ERROR PLAYING",i.message?.includes("403")||i.message?.includes("401")?u.innerText="TOKEN EXPIRED - RESET":i.name==="NotSupportedError"?u.innerText="FORMAT NOT SUPPORTED":u.innerText="PLAYBACK FAILED"}"mediaSession"in navigator&&(navigator.mediaSession.metadata=new MediaMetadata({title:t.name.replace(/\.[^/.]+$/,""),artist:e.currentAlbum?.name||"Unknown",artwork:[{src:l.src,sizes:"512x512",type:"image/jpeg"}]}),navigator.mediaSession.setActionHandler("play",()=>{o.play(),e.isPlaying=!0,b()}),navigator.mediaSession.setActionHandler("pause",()=>{o.pause(),e.isPlaying=!1,b()}),navigator.mediaSession.setActionHandler("previoustrack",()=>{e.currentIndex>0&&d(e.currentIndex-1)}),navigator.mediaSession.setActionHandler("nexttrack",()=>{e.currentIndex<e.playlist.length-1&&d(e.currentIndex+1)}))}function b(){T.innerText=e.isPlaying?"⏸":"▶"}T.onclick=()=>{o.paused?(o.play(),e.isPlaying=!0):(o.pause(),e.isPlaying=!1),b()};O.onclick=()=>{e.currentIndex<e.playlist.length-1&&d(e.currentIndex+1)};P.onclick=()=>{e.currentIndex>0&&d(e.currentIndex-1)};o.ontimeupdate=()=>{if(!o.duration)return;const n=o.currentTime/o.duration*100;U.style.width=`${n}%`};o.onended=()=>{e.currentIndex<e.playlist.length-1&&d(e.currentIndex+1)};o.onerror=n=>{console.error("Audio element error:",n),g.innerText="PLAYBACK ERROR",u.innerText="CHECK FORMAT SUPPORT"};N.onclick=n=>{const t=S.getBoundingClientRect(),a=(n.clientX-t.left)/t.width;o.currentTime=a*o.duration};M();

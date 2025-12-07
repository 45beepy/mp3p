(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const n of e)if(n.type==="childList")for(const r of n.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&s(r)}).observe(document,{childList:!0,subtree:!0});function c(e){const n={};return e.integrity&&(n.integrity=e.integrity),e.referrerPolicy&&(n.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?n.credentials="include":e.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(e){if(e.ep)return;e.ep=!0;const n=c(e);fetch(e.href,n)}})();const g="AIzaSyD53qoAMqp4Wu9nHSyaBbCzUn1j0gYK5Cw",m="957252189604-cfmbh7s2rjbpbql8rcsrlc3bpu6m2cq5.apps.googleusercontent.com",f="https://www.googleapis.com/auth/drive.readonly";let o={files:[],currentIndex:-1,token:sessionStorage.getItem("g_token")};const y=document.querySelector("#app");y.innerHTML=`
  <header style="padding: 20px; display:flex; justify-content:space-between;">
    <h1>.MP3P</h1>
    <button id="auth-btn">SYNC</button>
  </header>
  <div id="grid"></div>
  <div id="player-bar">
    <div id="now-playing" style="width: 150px; font-size: 0.8rem; white-space: nowrap; overflow: hidden;">Select Track</div>
    <audio id="audio-engine" controls></audio>
  </div>
`;const d=document.getElementById("grid"),a=document.getElementById("audio-engine"),h=document.getElementById("now-playing");function v(){const t=document.createElement("script");t.src="https://apis.google.com/js/api.js",t.onload=()=>gapi.load("client",b),document.body.appendChild(t);const i=document.createElement("script");i.src="https://accounts.google.com/gsi/client",i.onload=w,document.body.appendChild(i)}let l;async function b(){await gapi.client.init({apiKey:g,discoveryDocs:["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]}),o.token&&p()}function w(){l=google.accounts.oauth2.initTokenClient({client_id:m,scope:f,callback:t=>{t.error||(o.token=t.access_token,sessionStorage.setItem("g_token",t.access_token),p())}}),document.getElementById("auth-btn").onclick=()=>{l.requestAccessToken({prompt:""})}}async function p(){if(!o.token)return;gapi.client.setToken({access_token:o.token});const t=await gapi.client.drive.files.list({pageSize:1e3,fields:"files(id, name, mimeType, size, createdTime)",q:"(mimeType contains 'audio/') and trashed = false",orderBy:"createdTime desc"});o.files=t.result.files,k()}function k(){d.innerHTML="",o.files.forEach((t,i)=>{const c=t.mimeType.includes("flac")||t.mimeType.includes("wav"),s=t.name.length*20%360,e=document.createElement("div");e.className="card",e.innerHTML=`
      <div class="card-inner">
        <div class="card-front" style="background: linear-gradient(45deg, hsl(${s}, 60%, 20%), hsl(${s+40}, 60%, 10%))">
          <div style="position:absolute; top:10px; right:10px; width:10px; height:10px; border-radius:50%; background:${c?"#0f0":"#d00"}; box-shadow:0 0 5px currentColor;"></div>
          <div style="font-size:2rem; opacity:0.3; font-weight:900;">${t.name.substring(0,2)}</div>
        </div>
        <div class="card-back">
          <div style="font-size:0.8rem; font-weight:bold; margin-bottom:10px;">${t.name}</div>
          <button class="play-btn">PLAY</button>
        </div>
      </div>
    `,e.onclick=n=>{n.target.classList.contains("play-btn")||e.classList.toggle("flipped")},e.querySelector(".play-btn").addEventListener("click",()=>u(i)),d.appendChild(e)})}function u(t){o.currentIndex=t;const i=o.files[t];h.innerText=i.name,a.src=`https://drive.google.com/uc?export=download&id=${i.id}`,a.play(),"mediaSession"in navigator&&(navigator.mediaSession.metadata=new MediaMetadata({title:i.name,artist:"DriveStream",artwork:[{src:"https://via.placeholder.com/512",sizes:"512x512",type:"image/png"}]}))}a.addEventListener("ended",()=>{o.currentIndex+1<o.files.length&&u(o.currentIndex+1)});v();

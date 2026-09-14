const S={slots:[0,1,0,1],forced:0,forcedActive:false,em:false,entry:1,exit:0,recommended:2,occupancy:50,vehiclesEntered:0,vehiclesExited:0,deviceOnline:false,lastSeen:null,history:[],fiveMinuteSamples:[],hourlyHistory:[],dailyHistory:[],peak:{occupancy:0,time:null},notes:[]};
const names={home:'Live Dashboard',parking:'Parking Area',analytics:'Parking Analytics',security:'Security Center',alerts:'Notifications',settings:'Settings'};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showScreen(b.dataset.s));

function showScreen(id){document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.s===id));document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');document.getElementById('title').textContent=names[id];}

function slots(id){document.getElementById(id).innerHTML=S.slots.map((v,i)=>`<div class="slot ${v?'occ':'free'}"><b>SLOT ${String(i+1).padStart(2,'0')}</b><small>${v?'Vehicle detected':'Available for parking'}</small><span class="badge">${v?'OCCUPIED':'AVAILABLE'}</span><span class="car">${v?'🚙':'🚗'}</span></div>`).join('');}

function render(){
  const o=S.slots.reduce((a,b)=>a+b,0), f=4-o, p=Number.isFinite(S.occupancy)?S.occupancy:o*25;
  document.getElementById('occ').textContent=o; document.getElementById('free').textContent=f; document.getElementById('pct').textContent=p+'%';
  document.getElementById('hp').textContent=p+'%'; document.getElementById('pt').textContent=p+'%'; document.getElementById('bar').style.width=p+'%';
  const ring=document.getElementById('ringProgress');
  if(ring){
    const circumference=2*Math.PI*54;
    const clamped=Math.max(0,Math.min(100,p));
    ring.style.strokeDasharray=circumference.toFixed(2);
    ring.style.strokeDashoffset=(circumference*(1-clamped/100)).toFixed(2);
    ring.classList.toggle('low',clamped<50);
    ring.classList.toggle('medium',clamped>=50 && clamped<75);
    ring.classList.toggle('high',clamped>=75 && clamped<100);
    ring.classList.toggle('full',clamped>=100);
  }
  const r=S.recommended||S.slots.findIndex(x=>!x)+1; document.getElementById('rec').textContent=r?'SLOT '+String(r).padStart(2,'0'):'FULL';
  document.getElementById('eg').textContent=S.entry?'OPEN':'CLOSED'; document.getElementById('xg').textContent=S.exit?'OPEN':'CLOSED';
  document.getElementById('entryGateCard').classList.toggle('gate-closed',!S.entry); document.getElementById('exitGateCard').classList.toggle('gate-closed',!S.exit);
  document.getElementById('em').textContent=S.em?'ACTIVE':'NORMAL';
  document.getElementById('fc').textContent=S.forced; document.getElementById('sc').textContent=S.forced;
  document.getElementById('vin').textContent=S.vehiclesEntered; document.getElementById('vout').textContent=S.vehiclesExited;
  const peakValue=document.getElementById('peakValue'); if(peakValue) peakValue.textContent=S.peak&&S.peak.time?S.peak.occupancy+'%':'—';
  document.getElementById('forcedStatus').textContent=S.forcedActive?'DETECTED':'NORMAL';
  document.getElementById('forcedCount').textContent=S.forced+(S.forced===1?' event':' events');
  document.getElementById('emergencyStatus').textContent=S.em?'ACTIVE':'NORMAL';
  document.getElementById('emergencyGates').textContent=S.em?'Both gates OPEN':'Gates secured';
  document.getElementById('forcedMini').classList.toggle('active',S.forcedActive);
  document.getElementById('emergencyMini').classList.toggle('active',S.em);
  document.getElementById('securityCard').classList.toggle('alert',S.forcedActive||S.em);
  document.getElementById('ss').textContent=S.em?'EMERGENCY MODE ACTIVE':(S.forcedActive?'FORCED ENTRY DETECTED':'SYSTEM SECURE');
  document.getElementById('st').textContent=S.em?'Both gates are open for emergency operation.':(S.forcedActive?'Security alert active. Alarm triggered.':'No active security alert.');
  slots('map'); slots('large'); renderNotes();
  document.getElementById('deviceState').innerHTML=S.deviceOnline?'ESP32 ONLINE<small>Live connection</small>':'DEVICE OFFLINE<small>No heartbeat received</small>';
  document.getElementById('deviceDot').textContent='●';
  const statusCard=document.getElementById('systemStatusCard');
  if(statusCard){
    statusCard.classList.toggle('online',S.deviceOnline);
    statusCard.classList.toggle('offline',!S.deviceOnline);
    document.getElementById('systemStatusIcon').textContent=S.deviceOnline?'●':'●';
    document.getElementById('systemStatusText').textContent=S.deviceOnline?'ESP32 ONLINE':'SYSTEM OFFLINE';
    document.getElementById('systemStatusDetail').textContent=S.deviceOnline?'Live connection':'No ESP32 heartbeat received';
    document.getElementById('lastSeenText').textContent=S.lastSeen?formatTime(S.lastSeen):'Waiting…';
  }
  renderHistory();
  const ps=document.getElementById('pushStatus'); if(ps) ps.textContent=pushEnabledLocal?'PUSH ENABLED':'PUSH NOT ENABLED';
}

function renderNotes(){
  const html=S.notes.slice(0,12).map(n=>`<div class="note"><b>${n.a}</b><small>${n.b} · ${n.time}</small></div>`).join('');
  document.getElementById('notes').innerHTML=html||'<div class="empty">🟢 No alerts yet</div>';
  const dash=S.notes.slice(0,3).map((n,i)=>`<div class="dash-note ${i===0&&(n.a.includes('FORCED')||n.a.includes('EMERGENCY'))?'critical':''}"><span>${n.a.split(' ')[0]}</span><div><b>${n.a.substring(n.a.indexOf(' ')+1)}</b><small>${n.b} · ${n.time}</small></div></div>`).join('');
  document.getElementById('dashboardNotes').innerHTML=dash||'<div class="empty">🟢 No active alerts</div>';
}

function toast(t){const x=document.getElementById('toast');x.textContent=t;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),2500);}
function noteLocal(a,b){S.notes.unshift({a,b,time:'just now'});S.notes=S.notes.slice(0,30);render();}

async function api(path){const r=await fetch(path);if(!r.ok)throw Error('request failed');return r.json();}
async function post(path){const r=await fetch(path,{method:'POST'});if(!r.ok)throw Error('request failed');return r.json();}

async function applyState(d){
  if(d.slots)S.slots=d.slots;
  if('forced'in d)S.forced=d.forced||0;
  if('forcedActive'in d)S.forcedActive=!!d.forcedActive;
  if('em'in d)S.em=!!d.em;
  if('entry'in d)S.entry=d.entry?1:0;
  if('exit'in d)S.exit=d.exit?1:0;
  if('recommended'in d)S.recommended=d.recommended;
  if('occupancy'in d)S.occupancy=d.occupancy;
  if('vehiclesEntered'in d)S.vehiclesEntered=d.vehiclesEntered;
  if('vehiclesExited'in d)S.vehiclesExited=d.vehiclesExited;
  if('deviceOnline'in d)S.deviceOnline=!!d.deviceOnline;
  if('lastSeen'in d)S.lastSeen=d.lastSeen;
  if(Array.isArray(d.history))S.history=d.history;
  if(Array.isArray(d.fiveMinuteSamples))S.fiveMinuteSamples=d.fiveMinuteSamples;
  if(Array.isArray(d.hourlyHistory))S.hourlyHistory=d.hourlyHistory;
  if(Array.isArray(d.dailyHistory))S.dailyHistory=d.dailyHistory;
  if(d.peak)S.peak=d.peak;
  if(d.events)S.notes=d.events.map(e=>({a:e.a,b:e.b,time:e.time}));
  render();
}

async function demoSlot(){try{await applyState(await post('/api/demo/slot'));toast('Backend updated');}catch{noteLocal('🅿️ DEMO','Backend unavailable');}}
async function forced(){try{await applyState(await post('/api/demo/forced'));toast('Forced-entry alert sent');}catch{noteLocal('🚨 FORCED ENTRY','Unauthorized gate crossing detected');}}
async function emergency(){try{await applyState(await post('/api/demo/emergency'));toast(S.em?'Emergency mode activated':'Emergency mode cleared');}catch{noteLocal('⚠️ EMERGENCY','Backend unavailable');}}
async function gateDemo(){['entryGateCard','exitGateCard'].forEach(id=>{let e=document.getElementById(id);e.classList.remove('gate-moving');void e.offsetWidth;e.classList.add('gate-moving');setTimeout(()=>e.classList.remove('gate-moving'),700)});toast('Gate animation running');}

function formatTime(iso){
  try{return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(iso));}
  catch{return new Date(iso).toLocaleTimeString();}
}
function renderHistory(){
  const el=document.getElementById('bars');
  const labels=document.getElementById('timeLabels');
  if(!el||!labels)return;
  const detail=(S.fiveMinuteSamples||[]).slice(-288);
  const hourly=(S.hourlyHistory||[]).slice(-24);
  const daily=(S.dailyHistory||[]).slice(-7);
  const currentDay=(detail.length?detail[detail.length-1].time:null);
  const currentDayKey=currentDay?dayKey(currentDay):null;
  const todaySamples=detail.filter(x=>!currentDayKey||dayKey(x.time)===currentDayKey);
  const todayAvg=todaySamples.length?Math.round(todaySamples.reduce((sum,x)=>sum+x.occupancy,0)/todaySamples.length):null;

  if(!detail.length){
    el.innerHTML='<div class="chart-empty">Waiting for real IoT occupancy history…</div>';
    labels.innerHTML='';
  }else{
    el.innerHTML=detail.map(p=>`<div class="time-bar-wrap" title="${formatTime(p.time)} — ${p.occupancy}% occupied (${p.occupied}/4)"><i class="time-bar" style="height:${Math.max(2,p.occupancy)}%"></i></div>`).join('');
    labels.innerHTML=detail.map(p=>`<span title="${formatTime(p.time)} — ${p.occupancy}%">${formatTime(p.time).replace(':00 ',' ')}</span>`).join('');
    const chartContent=document.getElementById('chartContent');
    if(chartContent) chartContent.style.width=Math.max(980,detail.length*39+20)+'px';
    const scroll=document.getElementById('chartScroll');
    if(scroll) requestAnimationFrame(()=>{scroll.scrollLeft=scroll.scrollWidth-scroll.clientWidth;});
  }

  renderSummaryBars('hourlyBars','hourlyLabels',hourly,x=>x.occupancy,x=>formatHourKey(x.hourKey),x=>`${formatHourKey(x.hourKey)} — ${x.occupancy}% average occupancy (${x.samples} samples)`);
  const dailyData=daily.map(x=>({...x,label:formatDayKey(x.dayKey),title:`${formatDayKey(x.dayKey)} — ${x.occupancy}% average occupancy`}));
  renderSummaryBars('dailyBars','dailyLabels',dailyData,x=>x.occupancy,x=>x.label,x=>x.title);

  const todayEl=document.getElementById('todaySummary');
  if(todayEl){
    todayEl.textContent=todayAvg===null?'Today: waiting for data':`Today so far: ${todayAvg}% average occupancy`;
  }
  const peak=S.peak&&S.peak.time?`${S.peak.occupancy}% at ${formatTime(S.peak.time)}`:'calculating…';
  const peakEl=document.getElementById('peakInfo');
  if(peakEl) peakEl.textContent='Peak occupancy: '+peak;
}
function renderSummaryBars(barId,labelId,data,valueFn,labelFn,titleFn){
  const bars=document.getElementById(barId), labels=document.getElementById(labelId);
  if(!bars||!labels)return;
  if(!data.length){
    bars.innerHTML='<div class="summary-empty">No completed period yet</div>';
    labels.innerHTML='';
    const content=bars.closest('.summary-content');
    if(content){
      const baseWidth=window.matchMedia('(max-width:700px)').matches?760:980;
      content.style.width=baseWidth+'px';
      content.style.minWidth=baseWidth+'px';
    }
    return;
  }
  bars.innerHTML=data.map(x=>`<div class="summary-bar-wrap" title="${titleFn(x)}"><i class="summary-bar" style="height:${Math.max(2,Math.min(100,valueFn(x)))}%"></i></div>`).join('');
  labels.innerHTML=data.map(x=>`<span title="${titleFn(x)}">${labelFn(x)}</span>`).join('');
  const content=bars.closest('.summary-content');
  // Same sizing model as the 5-minute chart: the content becomes wider than
  // the viewport as data grows, so the parent scroll container handles X scrolling.
  // Keep the same persistent scrollable canvas as the 5-minute chart.
  // It remains wide even before the first completed period, and grows
  // further as hourly/daily bars accumulate.
  const baseWidth=window.matchMedia('(max-width:700px)').matches?760:980;
  const width=Math.max(baseWidth,data.length*54+20);
  if(content){
    content.style.width=width+'px';
    content.style.minWidth=width+'px';
  }
  const plot=content?.querySelector('.summary-plot');
  if(plot){
    plot.style.width=width+'px';
    plot.style.minWidth=width+'px';
  }
  const labelsRow=content?.querySelector('.summary-labels');
  if(labelsRow){
    labelsRow.style.width=width+'px';
    labelsRow.style.minWidth=width+'px';
  }
  const scroll=bars.closest('.summary-scroll');
  if(scroll) requestAnimationFrame(()=>{scroll.scrollLeft=Math.max(0,scroll.scrollWidth-scroll.clientWidth);});
}

function dayKey(iso){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const g=t=>p.find(x=>x.type===t)?.value||'';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function formatHourKey(k){
  const [y,m,d,h]=k.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(Date.UTC(y,m-1,d,h-5, -30)));
}
function formatDayKey(k){
  const [y,m,d]=k.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',month:'short',day:'numeric'}).format(new Date(Date.UTC(y,m-1,d,0,0)));
}

let pushEnabledLocal=false;
async function setupPush(){
  const btn=document.getElementById('enablePush');
  const ps=document.getElementById('pushStatus');
  if(!btn) return;
  if(!('serviceWorker'in navigator)&&!('PushManager'in window)){btn.disabled=true;btn.textContent='Push not supported';return;}
  try{
    const info=await api('/api/push/public-key');
    if(!info.enabled){btn.disabled=true;btn.textContent='Push server not configured';if(ps) ps.textContent='PUSH SERVER NEEDS SETUP';return;}
    const reg=await navigator.serviceWorker.register('/sw.js');
    let perm=Notification.permission;
    if(perm==='denied'){btn.disabled=true;btn.textContent='Notifications blocked';return;}
    const existing=await reg.pushManager.getSubscription();
    if(existing){await saveSubscription(existing);pushEnabledLocal=true;btn.textContent='Push Notifications Enabled';render();return;}
    btn.onclick=async()=>{
      const p=await Notification.requestPermission();
      if(p!=='granted'){toast('Notification permission not granted');return;}
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(info.publicKey)});
      await saveSubscription(sub);pushEnabledLocal=true;btn.textContent='Push Notifications Enabled';render();toast('Push notifications enabled');
    };
    btn.disabled=false;
  }catch(e){console.error(e);btn.textContent='Enable Push Notifications';toast('Push setup unavailable');}
}
async function saveSubscription(sub){
  await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sub.toJSON())});
}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
setupPush();

async function bootBackend(){
  try{await applyState(await api('/api/state'));const es=new EventSource('/api/stream');es.onmessage=e=>applyState(JSON.parse(e.data));es.onerror=()=>toast('Backend connection retrying…');}
  catch{noteLocal('🔴 OFFLINE','SmartPark backend unavailable');}
}
bootBackend();

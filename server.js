const express=require('express');
const path=require('path');
const webpush=require('web-push');

const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const VAPID_PUBLIC_KEY=process.env.VAPID_PUBLIC_KEY||'';
const VAPID_PRIVATE_KEY=process.env.VAPID_PRIVATE_KEY||'';
const VAPID_SUBJECT=process.env.VAPID_SUBJECT||'mailto:smartpark@example.com';
const pushEnabled=!!(VAPID_PUBLIC_KEY&&VAPID_PRIVATE_KEY);

if(pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);

let state={
  slots:[0,1,0,1],
  forced:0,
  forcedActive:false,
  em:false,
  entry:1,
  exit:0,
  recommended:1,
  occupancy:50,
  vehiclesEntered:0,
  vehiclesExited:0,
  lastSeen:null,
  deviceOnline:false,
  events:[{a:'🟢 SYSTEM ONLINE',b:'SmartPark backend is running',time:new Date().toLocaleTimeString()}]
};

const clients=new Set();
const subscriptions=new Map();
let forcedTimer=null;

function now(){return new Date().toLocaleTimeString();}
function trim(){state.events=state.events.slice(0,30);}
function broadcast(){
  const data='data: '+JSON.stringify(state)+'\n\n';
  for(const r of clients){try{r.write(data);}catch{clients.delete(r);}}
}
function touch(){state.lastSeen=new Date().toISOString();state.deviceOnline=true;}

async function sendPush(title,body,tag){
  if(!pushEnabled||subscriptions.size===0) return;
  const payload=JSON.stringify({title,body,tag,icon:'/icon-192.png'});
  const dead=[];
  for(const [key,sub] of subscriptions){
    try{await webpush.sendNotification(sub,payload);}
    catch(err){
      if(err.statusCode===404||err.statusCode===410) dead.push(key);
      else console.error('Push send error:',err.message);
    }
  }
  dead.forEach(k=>subscriptions.delete(k));
}

function activateForced(){
  state.forcedActive=true;
  clearTimeout(forcedTimer);
  forcedTimer=setTimeout(()=>{
    state.forcedActive=false;
    broadcast();
  },8000);
}

function recordForced(){
  state.forced++;
  activateForced();
  state.events.unshift({a:'🚨 FORCED ENTRY',b:'Unauthorized gate crossing detected',time:now()});
  trim(); broadcast();
  sendPush('🚨 SmartPark — Forced Entry','Unauthorized gate crossing detected','forced-entry');
}

function recordEmergency(on){
  state.em=on;
  if(on){
    state.entry=1; state.exit=1;
    state.events.unshift({a:'⚠️ EMERGENCY MODE',b:'Both gates opened',time:now()});
    trim(); broadcast();
    sendPush('⚠️ SmartPark — Emergency Mode','Emergency mode activated. Both gates opened.','emergency');
  }else{
    state.events.unshift({a:'🟢 EMERGENCY CLEARED',b:'Normal operation restored',time:now()});
    trim(); broadcast();
    sendPush('🟢 SmartPark — Emergency Cleared','Normal operation restored.','emergency-cleared');
  }
}

app.get('/health',(req,res)=>res.status(200).json({ok:true,service:'smartpark-backend',pushEnabled}));
app.get('/api/state',(req,res)=>res.json(state));
app.get('/api/events',(req,res)=>res.json(state.events));
app.get('/api/push/public-key',(req,res)=>{
  res.json({enabled:pushEnabled,publicKey:pushEnabled?VAPID_PUBLIC_KEY:null});
});
app.post('/api/push/subscribe',(req,res)=>{
  const sub=req.body;
  if(!sub||!sub.endpoint) return res.status(400).json({ok:false,error:'Invalid push subscription'});
  subscriptions.set(sub.endpoint,sub);
  res.json({ok:true,subscribed:true,count:subscriptions.size});
});
app.delete('/api/push/subscribe',(req,res)=>{
  const endpoint=req.body?.endpoint;
  if(endpoint) subscriptions.delete(endpoint);
  res.json({ok:true});
});
app.get('/api/stream',(req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  res.flushHeaders(); clients.add(res);
  res.write('data: '+JSON.stringify(state)+'\n\n');
  req.on('close',()=>clients.delete(res));
});

app.post('/api/demo/slot',(req,res)=>{
  const i=state.slots.findIndex(v=>!v);
  if(i<0) state.events.unshift({a:'🅿️ PARKING FULL',b:'No available slots',time:now()});
  else{
    state.slots[i]=1;
    state.occupancy=Math.round((state.slots.filter(v=>v===1).length/4)*100);
    const next=state.slots.findIndex(v=>!v); state.recommended=next<0?0:next+1;
    state.events.unshift({a:`🅿️ SLOT ${String(i+1).padStart(2,'0')} OCCUPIED`,b:'Vehicle detected',time:now()});
  }
  trim(); broadcast(); res.json(state);
});
app.post('/api/demo/forced',(req,res)=>{recordForced();res.json(state);});
app.post('/api/demo/emergency',(req,res)=>{recordEmergency(!state.em);res.json(state);});

app.post('/api/device/state',(req,res)=>{
  const body=req.body||{};
  if(Array.isArray(body.slots)&&body.slots.length===4) state.slots=body.slots.map(v=>v?1:0);
  if(typeof body.em==='boolean') state.em=body.em;
  if(typeof body.entry==='boolean'||body.entry===0||body.entry===1) state.entry=body.entry?1:0;
  if(typeof body.exit==='boolean'||body.exit===0||body.exit===1) state.exit=body.exit?1:0;
  if(typeof body.recommended==='number') state.recommended=body.recommended;
  if(typeof body.occupancy==='number') state.occupancy=body.occupancy;
  if(typeof body.vehiclesEntered==='number') state.vehiclesEntered=body.vehiclesEntered;
  if(typeof body.vehiclesExited==='number') state.vehiclesExited=body.vehiclesExited;
  touch(); broadcast(); res.json({ok:true,state});
});

app.post('/api/device/event',(req,res)=>{
  const type=String(req.body?.type||'').toLowerCase();
  touch();
  if(type==='forced_entry') recordForced();
  else if(type==='emergency_on') recordEmergency(true);
  else if(type==='emergency_off') recordEmergency(false);
  else return res.status(400).json({ok:false,error:'Unknown event type'});
  res.json({ok:true,state});
});

setInterval(()=>{
  if(state.deviceOnline&&state.lastSeen&&Date.now()-new Date(state.lastSeen).getTime()>25000){
    state.deviceOnline=false;
    state.events.unshift({a:'🔴 DEVICE OFFLINE',b:'No ESP32 heartbeat received',time:now()});
    trim(); broadcast();
    sendPush('🔴 SmartPark — Device Offline','No ESP32 heartbeat received for 25 seconds.','device-offline');
  }
},5000);

const port=Number(process.env.PORT)||3000;
app.listen(port,'0.0.0.0',()=>console.log(`SmartPark server listening on 0.0.0.0:${port}; push ${pushEnabled?'enabled':'disabled'}`));

const express=require('express');
const path=require('path');
const app=express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let state={slots:[0,1,0,1],forced:0,em:false,entry:1,exit:0,lastSeen:null,deviceOnline:false,events:[{a:'🟢 SYSTEM ONLINE',b:'SmartPark backend is running',time:new Date().toLocaleTimeString()}]};
const clients=new Set();
function now(){return new Date().toLocaleTimeString();}
function trim(){state.events=state.events.slice(0,30)}
function broadcast(){const data='data: '+JSON.stringify(state)+'\\n\\n'; for(const r of clients){try{r.write(data)}catch{clients.delete(r)}}}
function touch(){state.lastSeen=new Date().toISOString();state.deviceOnline=true;}

app.get('/health',(req,res)=>res.status(200).json({ok:true,service:'smartpark-backend'}));
app.get('/api/state',(req,res)=>res.json(state));
app.get('/api/events',(req,res)=>res.json(state.events));
app.get('/api/stream',(req,res)=>{res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();clients.add(res);res.write('data: '+JSON.stringify(state)+'\\n\\n');req.on('close',()=>clients.delete(res));});

app.post('/api/demo/slot',(req,res)=>{const i=state.slots.findIndex(v=>!v); if(i<0){state.events.unshift({a:'🅿️ PARKING FULL',b:'No available slots',time:now()});}else{state.slots[i]=1;state.events.unshift({a:`🅿️ SLOT ${String(i+1).padStart(2,'0')} OCCUPIED`,b:'Vehicle detected',time:now()});}trim();broadcast();res.json(state)});
app.post('/api/demo/forced',(req,res)=>{state.forced++;state.events.unshift({a:'🚨 FORCED ENTRY',b:'Unauthorized gate crossing detected',time:now()});trim();broadcast();res.json(state)});
app.post('/api/demo/emergency',(req,res)=>{state.em=!state.em;state.entry=state.em?1:0;state.exit=state.em?1:0;state.events.unshift({a:state.em?'⚠️ EMERGENCY MODE':'🟢 EMERGENCY CLEARED',b:state.em?'Both gates opened':'Normal operation restored',time:now()});trim();broadcast();res.json(state)});

// ESP32: send only changed/current physical state here.
app.post('/api/device/state',(req,res)=>{
  const body=req.body||{};
  if(Array.isArray(body.slots)&&body.slots.length===4) state.slots=body.slots.map(v=>v?1:0);
  if(typeof body.em==='boolean') state.em=body.em;
  if(typeof body.entry==='boolean'||body.entry===0||body.entry===1) state.entry=body.entry?1:0;
  if(typeof body.exit==='boolean'||body.exit===0||body.exit===1) state.exit=body.exit?1:0;
  touch(); broadcast(); res.json({ok:true,state});
});
app.post('/api/device/event',(req,res)=>{
  const type=String(req.body?.type||'').toLowerCase();
  touch();
  if(type==='forced_entry'){
    state.forced++;
    state.events.unshift({a:'🚨 FORCED ENTRY',b:'Unauthorized gate crossing detected',time:now()});
  } else if(type==='emergency_on'){
    state.em=true; state.entry=1; state.exit=1;
    state.events.unshift({a:'⚠️ EMERGENCY MODE',b:'Both gates opened',time:now()});
  } else if(type==='emergency_off'){
    state.em=false;
    state.events.unshift({a:'🟢 EMERGENCY CLEARED',b:'Normal operation restored',time:now()});
  } else {return res.status(400).json({ok:false,error:'Unknown event type'});}
  trim(); broadcast(); res.json({ok:true,state});
});

// Mark device offline after 25 seconds without a heartbeat/state update.
setInterval(()=>{if(state.deviceOnline&&state.lastSeen&&Date.now()-new Date(state.lastSeen).getTime()>25000){state.deviceOnline=false;state.events.unshift({a:'🔴 DEVICE OFFLINE',b:'No ESP32 heartbeat received',time:now()});trim();broadcast();}},5000);

const port=Number(process.env.PORT)||3000;
const host='0.0.0.0';
app.listen(port,host,()=>console.log(`SmartPark server listening on ${host}:${port}`));

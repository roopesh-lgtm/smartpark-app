self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={title:'SmartPark',body:'New SmartPark alert',tag:'smartpark'};
  try{if(event.data)data=event.data.json();}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,
    tag:data.tag||'smartpark',
    icon:data.icon||'/icon-192.png',
    badge:'/icon-192.png',
    vibrate:[200,100,200],
    data:{url:'/'}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c)return c.focus();}
    if(clients.openWindow)return clients.openWindow('/');
  }));
});

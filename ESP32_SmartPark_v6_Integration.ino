/*
  SmartPark v6 ESP32 -> Cloud Backend integration
  IMPORTANT: This is an integration layer/example. Keep your existing working
  sensor, LED, LCD, servo, buzzer and emergency logic unchanged.

  Replace BACKEND_URL with your deployed SmartPark backend URL.
  Example: https://your-smartpark-backend.onrender.com
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL = "https://YOUR-BACKEND-DOMAIN";

unsigned long lastSync = 0;
const unsigned long SYNC_INTERVAL = 2000;
int lastSlots[4] = {-1,-1,-1,-1};
bool lastEmergency = false;
bool lastEntry = false;
bool lastExit = false;

void connectWiFi(){
  if(WiFi.status()==WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long started=millis();
  while(WiFi.status()!=WL_CONNECTED && millis()-started<15000) delay(250);
}

String jsonSlots(const int slots[4]){
  String s="[";
  for(int i=0;i<4;i++){ if(i) s+=","; s+=String(slots[i]); }
  s+="]"; return s;
}

bool postJson(const String& path,const String& body){
  connectWiFi();
  if(WiFi.status()!=WL_CONNECTED) return false;
  WiFiClientSecure client; client.setInsecure(); // For expo prototype; use CA validation for production.
  HTTPClient http;
  if(!http.begin(client,String(BACKEND_URL)+path)) return false;
  http.addHeader("Content-Type","application/json");
  int code=http.POST(body);
  http.end();
  return code>=200 && code<300;
}

void syncPhysicalState(const int slots[4], bool emergency, bool entryOpen, bool exitOpen){
  bool changed=emergency!=lastEmergency || entryOpen!=lastEntry || exitOpen!=lastExit;
  for(int i=0;i<4;i++) if(slots[i]!=lastSlots[i]) changed=true;
  if(!changed && millis()-lastSync<SYNC_INTERVAL) return;
  if(millis()-lastSync<SYNC_INTERVAL) return;

  String body="{\"slots\":"+jsonSlots(slots)+
             ",\"em\":"+(emergency?"true":"false")+
             ",\"entry\":"+(entryOpen?"1":"0")+
             ",\"exit\":"+(exitOpen?"1":"0")+"}";
  if(postJson("/api/device/state",body)){
    for(int i=0;i<4;i++) lastSlots[i]=slots[i];
    lastEmergency=emergency; lastEntry=entryOpen; lastExit=exitOpen; lastSync=millis();
  }
}

void sendForcedEntryEvent(){ postJson("/api/device/event", "{\"type\":\"forced_entry\"}"); }
void sendEmergencyEvent(bool active){ postJson("/api/device/event", active?"{\"type\":\"emergency_on\"}":"{\"type\":\"emergency_off\"}"); }

void setup(){
  // Keep your existing SmartPark setup() here.
  connectWiFi();
}

void loop(){
  // Keep your existing SmartPark loop() here.
  // Call syncPhysicalState() after reading your real sensors/outputs.
  // Example:
  // int slots[4]={slot1Occupied,slot2Occupied,slot3Occupied,slot4Occupied};
  // syncPhysicalState(slots, emergencyActive, entryGateOpen, exitGateOpen);
}

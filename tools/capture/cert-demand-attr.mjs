// Create «Уста» Demand custom attribute (if absent) + cert: API attrs probe + browser render.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const API='http://127.0.0.1:4000/api/v1';
const login=await fetch(`${API}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'admin123'})});
const {accessToken}=await login.json();
const H={authorization:`Bearer ${accessToken}`,'content-type':'application/json'};
// 1) ensure «Уста» exists
let metas=await fetch(`${API}/attribute-metadata/entity/Demand`,{headers:H}).then(r=>r.json());
let usta=(metas.items||[]).find(m=>m.code==='usta');
if(!usta){
  const cr=await fetch(`${API}/attribute-metadata`,{method:'POST',headers:H,body:JSON.stringify({entity:'Demand',code:'usta',name:'Уста',type:'reference',referenceEntity:'Counterparty',position:0})});
  console.log('create Уста status',cr.status, cr.status>=400?await cr.text():'');
  usta=await cr.json().catch(()=>null);
} else console.log('Уста already exists');
metas=await fetch(`${API}/attribute-metadata/entity/Demand`,{headers:H}).then(r=>r.json());
console.log('Demand attributes now:', (metas.items||[]).map(m=>`${m.name}(${m.code}/${m.type})`).join(', '));
// 2) API attrs probe
const cp=await fetch(`${API}/counterparties?limit=1`,{headers:H}).then(r=>r.json());
const cpId=cp.items?.[0]?.id||'00000000-0000-4000-8000-000000000000';
const attrs=encodeURIComponent(JSON.stringify([{code:'usta',value:cpId}]));
const probe=await fetch(`${API}/demands?attrs=${attrs}&limit=1`,{headers:H});
const pj=await probe.json().catch(()=>({}));
console.log('attrs probe status',probe.status,'total',pj.total);
const badProbe=await fetch(`${API}/demands?attrs=not-json&limit=1`,{headers:H});
console.log('invalid attrs → expect 400:',badProbe.status);
// 3) browser render
const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1680,height:1050},locale:'ru-RU'})).newPage();
p.setDefaultTimeout(60000);
const out={};
try{
  await p.goto('http://localhost:3219/login?redirect=%2Fdemands',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('[data-test-id="login-password"]',{timeout:60000});await p.waitForTimeout(1200);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(()=>{});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(()=>{});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(()=>{});
  await p.waitForTimeout(2500);
  if(/\/login/.test(p.url())) await p.locator('button:has-text("Kirish")').first().click().catch(()=>{});
  await p.waitForURL('**/demands',{timeout:60000}).catch(()=>{});
  await p.waitForSelector('[data-test-id="demands-inline-filter"]',{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(3500);
  out.fieldCount=await p.evaluate(()=>document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]').length);
  out.ustaFieldPresent=await p.evaluate(()=>{const els=[...document.querySelectorAll('[data-test-id="demands-inline-filter"] *')];return els.some(e=>!e.children.length&&(e.textContent||'').trim()==='Уста');});
  out.ustaControl=await p.evaluate(()=>!!document.querySelector('[data-testid="filter-attr_usta"],[data-test-id="filter-attr_usta"]'));
  await p.screenshot({path:resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26','our-app-filter-usta.png')});
}catch(e){out.error=String(e).slice(0,300);}
console.log('RENDER:',JSON.stringify(out));
await b.close();

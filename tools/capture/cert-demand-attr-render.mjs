import { chromium } from 'playwright';
import { resolve } from 'node:path';
const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1680,height:1050},locale:'ru-RU'})).newPage();
p.setDefaultTimeout(60000);
let bearer=null; p.on('request',r=>{const a=r.headers().authorization;if(a&&/^Bearer/.test(a))bearer=a;});
const out={};
try{
  await p.goto('http://localhost:3219/login?redirect=%2Fdemands',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('[data-test-id="login-password"]',{timeout:60000});await p.waitForTimeout(1500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(()=>{});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(()=>{});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(()=>{});
  await p.waitForTimeout(2500);
  if(/\/login/.test(p.url())) await p.locator('button:has-text("Kirish")').first().click().catch(()=>{});
  await p.waitForURL('**/demands',{timeout:60000}).catch(()=>{});
  await p.waitForSelector('[data-test-id="demands-inline-filter"]',{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(4000);
  out.fieldCount=await p.evaluate(()=>document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]').length);
  out.lastFieldLabel=await p.evaluate(()=>{const f=[...document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]')].pop();return f?f.querySelector('span')?.textContent?.replace(/^●\s*/,'').trim():null;});
  out.ustaControl=await p.evaluate(()=>!!document.querySelector('[data-testid="filter-attr_usta"],[data-test-id="filter-attr_usta"]'));
  out.gearHasUsta=await p.evaluate(()=>[...document.querySelectorAll('[data-test-id^="inline-filter-field-toggle-"]')].map(e=>e.textContent.trim()).some(t=>/Уста/.test(t)));
  await p.screenshot({path:resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26','our-app-filter-usta.png')});
  // exercise: pick a counterparty in Уста → confirm attrs param hits API
  await p.evaluate(()=>{const el=document.querySelector('[data-testid="filter-attr_usta"],[data-test-id="filter-attr_usta"]');if(el)el.click();});
  await p.waitForTimeout(1200);
  await p.keyboard.type('a').catch(()=>{}); await p.waitForTimeout(1500);
  out.optionShown=await p.evaluate(()=>{const pop=[...document.querySelectorAll('[role="option"],li,[class*="dropdown"] *')].map(e=>(e.textContent||'').trim()).filter(Boolean);return pop.slice(0,3);});
}catch(e){out.error=String(e).slice(0,300);}
console.log(JSON.stringify(out,null,2));
await b.close();

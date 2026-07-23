import { chromium } from 'playwright';
import { resolve } from 'node:path';
const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1680,height:1050},locale:'ru-RU'})).newPage();
p.setDefaultTimeout(60000);
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
  await p.waitForSelector('table tbody tr',{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(3000);
  // are there any published/printed pills? + their color. Also confirm false=blank (no «—»).
  out.publishedPills=await p.$$eval('[data-test-id="published-badge"]', els=>els.slice(0,3).map(e=>({t:e.textContent.trim(),bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})));
  out.printedPills=await p.$$eval('[data-test-id="printed-badge"]', els=>els.slice(0,3).map(e=>({t:e.textContent.trim(),bg:getComputedStyle(e).backgroundColor})));
  // check the published/printed cells: any «—» dash remaining? (should be NONE)
  out.dashInPubPrinted=await p.evaluate(()=>{
    const heads=[...document.querySelectorAll('table thead th')].map(e=>e.textContent.trim());
    const pi=heads.indexOf('Отправлено'), ni=heads.indexOf('Напечатано');
    let dashes=0, blanks=0;
    for(const tr of document.querySelectorAll('table tbody tr')){const tds=tr.querySelectorAll('td');for(const idx of [pi,ni]){const c=tds[idx]; if(!c)continue; const t=(c.innerText||'').trim(); if(t==='—')dashes++; else if(t==='')blanks++;}}
    return {dashes,blanks};
  });
  await p.screenshot({path:resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26','our-app-sent-printed.png')});
}catch(e){out.error=String(e).slice(0,300);}
console.log(JSON.stringify(out,null,2));
await b.close();

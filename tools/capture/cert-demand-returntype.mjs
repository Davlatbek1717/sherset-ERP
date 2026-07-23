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
  await p.waitForSelector('[data-test-id="demands-inline-filter"]',{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(4000);
  out.fieldCount=await p.evaluate(()=>document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]').length);
  // field labels in order (first 6)
  out.firstRow=await p.evaluate(()=>[...document.querySelectorAll('[data-test-id="demands-inline-filter"] [data-test-id="inline-filter-field"]')].slice(0,6).map(f=>(f.querySelector('span')?.textContent||'').replace(/^●\s*/,'').trim()));
  // return-type select options
  out.returnTypeOptions=await p.evaluate(()=>{const s=document.querySelector('[data-test-id="filter-return-type"]');return s?[...s.options].map(o=>o.textContent.trim()):null;});
  await p.screenshot({path:resolve('D:/projects/moysklad/docs/audits/demands-list-2026-06-26','our-app-filter-returntype.png')});
}catch(e){out.error=String(e).slice(0,300);}
console.log(JSON.stringify(out,null,2));
await b.close();

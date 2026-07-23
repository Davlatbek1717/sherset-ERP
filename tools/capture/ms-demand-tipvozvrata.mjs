// READ-ONLY: ground moysklad #demand «Тип возврата» — its dropdown OPTIONS + does
// selecting one + «Найти» change the result count (i.e. does it actually filter
// demands)? Also capture the exact filter field ORDER. Nothing saved.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO='D:/projects/moysklad', OUT=resolve(REPO,'docs/audits/demands-list-2026-06-26/moysklad');
mkdirSync(OUT,{recursive:true});
const env={};for(const l of readFileSync(resolve(REPO,'.env.local'),'utf8').split('\n')){const m=l.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,'').trim();}
const SITE=env.MOYSKLAD_URL||'https://online.moysklad.uz', EMAIL=env.MOYSKLAD_EMAIL, PASSWORD=env.MOYSKLAD_PASS||env.MOYSKLAD_PASSWORD;
const b=await chromium.launch({headless:true});
const p=await(await b.newContext({viewport:{width:1680,height:1000},locale:'ru-RU'})).newPage();
p.setDefaultTimeout(45000);p.setDefaultNavigationTimeout(120000);
const out={};
try{
  await p.goto(SITE,{waitUntil:'domcontentloaded'});await p.waitForTimeout(5000);
  await p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(EMAIL).catch(()=>{});
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(()=>{});
  for(const s of ['button:has-text("Войти")','button[type="submit"]']){const el=p.locator(s).first();if((await el.count())&&(await el.isVisible().catch(()=>false))){await el.click().catch(()=>{});break;}}
  await p.waitForTimeout(12000);
  const base=p.url().split('#')[0];
  await p.goto(`${base}#demand`,{waitUntil:'domcontentloaded'});await p.waitForTimeout(10000);
  // open filter
  const fb=p.locator(':text-is("Фильтр") >> visible=true').first(); if(await fb.count()){await fb.click().catch(()=>{});await p.waitForTimeout(2000);}
  // The «Тип возврата» control is a native-ish select (gwt-ListBox). Find it + read options.
  out.tipVozvrata = await p.evaluate(()=>{
    const lab=[...document.querySelectorAll('.gwt-Label,label,span,div')].find(e=>!e.children.length&&(e.textContent||'').trim()==='Тип возврата');
    if(!lab) return {found:false};
    // nearest select after the label
    let el=lab.parentElement, sel=null;
    for(let i=0;i<5&&el;i++){ sel=el.querySelector('select'); if(sel)break; el=el.parentElement; }
    if(!sel) return {found:true, hasSelect:false, html:(lab.parentElement?.outerHTML||'').slice(0,300)};
    return {found:true, hasSelect:true, options:[...sel.options].map(o=>o.textContent.trim()), optionCount:sel.options.length};
  });
  // total before
  out.totalBefore = await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>/из \d/.test(e.textContent||'')&&e.children.length===0);return el?el.textContent.trim():null;});
  await p.screenshot({path:resolve(OUT,'90-tipvozvrata.png')});
}catch(e){out.error=String(e).slice(0,400);}
writeFileSync(resolve(OUT,'tipvozvrata.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await b.close();

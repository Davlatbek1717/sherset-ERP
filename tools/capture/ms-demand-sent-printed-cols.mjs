// READ-ONLY: ground moysklad #demand «Отправлено» + «Напечатано» column rendering —
// for each visible row, the exact cell text + whether it's a coloured pill (bg) or
// plain «—»/blank, for BOTH true and false states. Determines pixel rendering.
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
  await p.goto(`${base}#demand`,{waitUntil:'domcontentloaded'});await p.waitForTimeout(11000);
  // close filter for a clean grid
  const fb=p.locator(':text-is("Фильтр") >> visible=true').first(); if(await fb.count()){await fb.click().catch(()=>{});await p.waitForTimeout(1500);}
  out.cells = await p.evaluate(()=>{
    // find header cells «Отправлено» + «Напечатано» → their column index
    const heads=[...document.querySelectorAll('th, [role="columnheader"]')];
    const idxOf=(name)=>heads.findIndex(h=>(h.textContent||'').trim()===name);
    const sentIdx=idxOf('Отправлено'), printIdx=idxOf('Напечатано');
    const rows=[...document.querySelectorAll('tbody tr, [role="row"]')].slice(0,12);
    const read=(cell)=>{
      if(!cell) return null;
      const t=(cell.innerText||'').trim();
      // is there a pill (a child with a background color)?
      const pill=[...cell.querySelectorAll('*')].find(e=>{const bg=getComputedStyle(e).backgroundColor;return bg&&bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent';});
      const bg=pill?getComputedStyle(pill).backgroundColor:null;
      return {text:t, hasPill:!!pill, pillBg:bg};
    };
    return rows.map(r=>{const tds=r.querySelectorAll('td, [role="cell"]'); return {sent:read(tds[sentIdx]), printed:read(tds[printIdx])};}).filter(x=>x.sent||x.printed);
  });
  await p.screenshot({path:resolve(OUT,'91-sent-printed-cols.png')});
}catch(e){out.error=String(e).slice(0,400);}
writeFileSync(resolve(OUT,'sent-printed-cols.json'),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await b.close();

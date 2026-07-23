import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const REPO='D:/projects/moysklad';
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
  out.pills = await p.evaluate(()=>{
    const find=(txt)=>{const el=[...document.querySelectorAll('*')].find(e=>{const t=(e.textContent||'').trim();const r=e.getBoundingClientRect();return t===txt && r.width>20 && r.width<160 && r.height>14 && r.height<36 && e.children.length<=1;});if(!el)return null;const cs=getComputedStyle(el);return {text:txt, bg:cs.backgroundColor, color:cs.color, radius:cs.borderRadius, padding:cs.padding, fontSize:cs.fontSize, h:Math.round(el.getBoundingClientRect().height)};};
    return {sent:find('Отправлен'), status:find('Status'), printed:find('Напечатан')};
  });
}catch(e){out.error=String(e).slice(0,400);}
console.log(JSON.stringify(out,null,2));
await b.close();

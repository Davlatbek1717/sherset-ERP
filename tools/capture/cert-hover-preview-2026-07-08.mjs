import { chromium } from 'playwright';
const OUT=process.env.OUTDIR; const BASE='https://climartgroup.uz';
// a 120x80 solid PNG (bigger so the hover-preview is clearly larger than the 28px thumb)
import { readFileSync } from 'node:fs';
const PNG=readFileSync('docs/audits/brand-folder-fix-2026-07-07/03-akfa-selected.png');
const b=await chromium.launch({headless:true,channel:'chrome'});
const ctx=await b.newContext({viewport:{width:1600,height:900},locale:'ru-RU'});
await ctx.addCookies([{name:'NEXT_LOCALE',value:'ru',domain:'climartgroup.uz',path:'/'}]);
const token=(await (await ctx.request.post(`${BASE}/api/v1/auth/login`,{data:{email:'admin@demo.local',password:'admin123'}})).json()).accessToken;
const H={Authorization:`Bearer ${token}`};
// pick a product WITH a code so we can search it to page 1
const lr=await (await ctx.request.get(`${BASE}/api/v1/products?limit=20`,{headers:H})).json();
const prod=(lr.data??lr.items??[]).find(p=>p.code);
const out={product:prod?.id, code:prod?.code, name:(prod?.name||'').slice(0,30)};
await ctx.request.post(`${BASE}/api/v1/products/${prod.id}/images`,{headers:H,data:{filename:'hover.png',mime:'image/png',dataBase64:`data:image/png;base64,${PNG.toString('base64')}`}});
const p=await ctx.newPage(); p.setDefaultTimeout(40000);
try {
  await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
  await p.fill('[data-test-id="login-email"]','admin@demo.local');
  await p.fill('[data-test-id="login-password"]','admin123');
  await p.locator('[data-test-id="login-password"]').press('Enter');
  await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000}).catch(()=>{});
  // search by code so the product is on page 1
  for(let i=0;i<3;i++){ try{ await p.goto(`${BASE}/products`,{waitUntil:'commit',timeout:60000}); break; }catch(e){ if(i===2)throw e; await p.waitForTimeout(3000);} }
  await p.waitForLoadState('domcontentloaded').catch(()=>{});
  const thumb=p.locator('[data-test-id="thumb-hover"]').first();
  await thumb.waitFor({timeout:30000});
  out.thumbNaturalWidth=await thumb.evaluate(el=>el.naturalWidth);
  out.thumbSrc=(await thumb.getAttribute('src')||'').replace(/access_token=[^&]+/,'access_token=<TOK>');
  out.fetchStatus=await p.evaluate(async(src)=>{ try{const r=await fetch(src);return r.status+' '+r.headers.get('content-type');}catch(e){return 'ERR '+e.message;} }, await thumb.getAttribute('src'));
  // HOVER → preview to the right
  await thumb.hover();
  await p.waitForTimeout(700);
  const prev=p.locator('[data-test-id="thumb-hover-preview"]');
  out.previewVisible=await prev.count()>0;
  if(out.previewVisible){
    const box=await prev.boundingBox(); const tbox=await thumb.boundingBox();
    out.previewToRightOfThumb = box && tbox ? box.x >= tbox.x : null;
    out.previewSize = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null;
    out.previewImgNaturalWidth = await prev.locator('img').evaluate(el=>el.naturalWidth).catch(()=>0);
  }
  await p.screenshot({path:`${OUT}/03-hover-preview.png`});
} catch(e){ out.error=String(e).slice(0,220); await p.screenshot({path:`${OUT}/99-hover-error.png`}).catch(()=>{}); }
// cleanup
try{ const imgs=await (await ctx.request.get(`${BASE}/api/v1/products/${prod.id}/images`,{headers:H})).json();
  for(const im of (imgs.items??[])) await ctx.request.delete(`${BASE}/api/v1/products/${prod.id}/images/${im.id}`,{headers:H}); out.cleanup='done'; }catch(e){out.cleanup=String(e).slice(0,60);}
console.log(JSON.stringify(out,null,2));
await b.close();

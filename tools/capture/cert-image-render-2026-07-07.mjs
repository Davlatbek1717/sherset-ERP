import { chromium } from 'playwright';
const OUT = process.env.OUTDIR;
const BASE='https://climartgroup.uz';
// small red 24x24 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAF0lEQVR42mP8z8BQz0AEYBxVSF+FAAB4bgQ9r1XwWQAAAABJRU5ErkJggg==','base64');
const b = await chromium.launch({ headless:true, channel:'chrome' });
const ctx = await b.newContext({ viewport:{width:1500,height:900}, locale:'ru-RU' });
await ctx.addCookies([{name:'NEXT_LOCALE',value:'ru',domain:'climartgroup.uz',path:'/'}]);
// api login for token + pick a product + cleanup
const token=(await (await ctx.request.post(`${BASE}/api/v1/auth/login`,{data:{email:'admin@demo.local',password:'admin123'}})).json()).accessToken;
const H={Authorization:`Bearer ${token}`};
const lr=await (await ctx.request.get(`${BASE}/api/v1/products?limit=1`,{headers:H})).json();
const prod=(lr.data??lr.items??[])[0];
const p=await ctx.newPage(); p.setDefaultTimeout(40000);
const out={product:prod.id};
try {
  await p.goto(`${BASE}/login`,{waitUntil:'domcontentloaded'});
  await p.fill('[data-test-id="login-email"]','admin@demo.local');
  await p.fill('[data-test-id="login-password"]','admin123');
  await p.locator('[data-test-id="login-password"]').press('Enter');
  await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000}).catch(()=>{});
  await p.goto(`${BASE}/products/${prod.id}`,{waitUntil:'domcontentloaded'});
  await p.locator('[data-test-id="image-gallery"]').waitFor({timeout:30000});
  // upload via hidden file input
  await p.locator('[data-test-id="image-file-input"]').setInputFiles({name:'cert.png',mimeType:'image/png',buffer:PNG});
  // wait for a thumbnail to appear
  const thumb = p.locator('[data-test-id^="image-"] img').first();
  await thumb.waitFor({timeout:20000});
  await p.waitForTimeout(1500);
  // KEY: did the image actually load (naturalWidth>0 = not broken)?
  out.naturalWidth = await thumb.evaluate(el => el.naturalWidth);
  out.imgSrc = (await thumb.getAttribute('src') || '').slice(0,60);
  await p.screenshot({path:`${OUT}/01-thumbnail-rendered.png`});
  // click → lightbox
  await thumb.click();
  await p.locator('[data-test-id="image-lightbox"]').waitFor({timeout:8000});
  const big = p.locator('[data-test-id="image-lightbox"] img');
  out.lightboxNaturalWidth = await big.evaluate(el => el.naturalWidth).catch(()=>0);
  await p.screenshot({path:`${OUT}/02-lightbox-open.png`});
} catch(e){ out.error=String(e).slice(0,250); await p.screenshot({path:`${OUT}/99-error.png`}).catch(()=>{}); }
// cleanup: delete cert images on this product
try { const imgs=await (await ctx.request.get(`${BASE}/api/v1/products/${prod.id}/images`,{headers:H})).json();
  for(const im of (imgs.items??[])) await ctx.request.delete(`${BASE}/api/v1/products/${prod.id}/images/${im.id}`,{headers:H});
  out.cleanup='done'; } catch(e){ out.cleanup=String(e).slice(0,80); }
console.log(JSON.stringify(out,null,2));
await b.close();

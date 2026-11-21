(() => {
  const native = window.matchMedia.bind(window), system = native('(prefers-reduced-motion: reduce)');
  const read = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const write = (key,value) => { try { sessionStorage.setItem(key,value); } catch {} };
  let language = read('ovo.language') === 'en' ? 'en' : 'zh-CN';
  if(language==='en')document.documentElement.style.visibility='hidden';
  let override = read('ovo.motion');
  const media = new EventTarget();
  Object.defineProperties(media, { matches:{get:()=>override ? override==='reduce' : system.matches}, media:{value:system.media} });
  media.addListener = fn => media.addEventListener('change',fn);
  media.removeListener = fn => media.removeEventListener('change',fn);
  window.matchMedia = query => query.replaceAll(' ','') === '(prefers-reduced-motion:reduce)' ? media : native(query);
  const originals = new WeakMap();
  function styles() {
    function walk(rules) { for (const rule of rules) {
      if (rule.media && /prefers-reduced-motion/.test(originals.get(rule) ?? rule.media.mediaText)) {
        const text=originals.get(rule)??rule.media.mediaText; originals.set(rule,text);
        rule.media.mediaText = (text.includes('no-preference') ? !media.matches : media.matches) ? 'all' : 'not all';
      } else if (rule.cssRules) walk(rule.cssRules);
    } }
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
  }
  const words = {
    film:['作品胶片','Works filmstrip'],cancel:['取消换景','Cancel scene change'],switching:['正在切换窗景…','Changing the window scene…'],cancelled:['已保留当前窗景','Kept the current scene'],
    canvas:['工作室 3D 画面','Studio 3D scene'],greeting:['欢迎','Welcome'],screen:['电脑屏幕','Computer screen'],
    notFound:['找不到这个作品','Case not found'],chooseWork:['链接可能有误，请选择已有作品。','The link may be incorrect. Choose an available case.'],yingyu:['映遇','Yingyu'],bounce:['蹦动','Bounce'],
    welcome:['你好，我是OvO',"Hi, I'm OvO"], enter:['进入工作室 →','Enter studio →'], retry:['重试','Retry'],
    back:['返回欢迎页','Back to welcome'], loading:['正在准备工作室','Preparing the studio'],
    slow:['仍在加载，请稍候…','Still loading, please wait…'], failure:['工作室未能加载，请检查网络或浏览器的 3D 支持。','The studio could not load. Check your connection or browser 3D support.'],
    home:['回到全景','Reset view'], leave:['← 回到工作室','← Back to studio'], reset:['复位道具','Reset props'],
    sound:['点击启用声音','Enable sound'], muted:['取消静音','Unmute'], mute:['静音','Mute'], unavailable:['音效不可用','Sound unavailable'],
    motion:['减少动态效果','Reduce motion'], full:['完整动效','Full motion'], computer:['打开电脑','Open computer'], projector:['打开放映机','Open projector'],
    close:['关闭作品窗口','Close case'], curtain:['关闭幕布','Close curtain'], catalog:['放映机作品目录','Projector works'],
    orbit:['太空版','space scene'],monza:['赛道版','track scene'], ready:['道具已归位','Props reset'], resetError:['道具暂时无法归位','Props could not reset'],
    switchError:['窗景加载失败，请再次拉动窗边拉绳重试','Scene could not load. Pull the cord to retry.'],
  };
  const t=key => words[key]?.[language==='en'?1:0] ?? key;
  function translate() {
    for(const el of document.querySelectorAll('[data-ui]')) el.textContent=t(el.dataset.ui);
    for(const el of document.querySelectorAll('[data-ui-label]')) el.setAttribute('aria-label',t(el.dataset.uiLabel));
    for(const el of document.querySelectorAll('[data-scene-status]'))el.textContent=language==='en'?`Switched to ${t(el.dataset.sceneStatus)}`:`已切换到${el.dataset.sceneStatus==='orbit'?'太空版':'赛道版'}`;
    for(const b of document.querySelectorAll('.film-track button')) b.setAttribute('aria-label',language==='en'?(b.closest('[data-work]').dataset.work==='yingyu'?'Yingyu':'Bounce'):(b.closest('[data-work]').dataset.work==='yingyu'?'映遇':'蹦动'));
    for(const el of document.querySelectorAll('[data-case-label]')) {
      const name=t(el.dataset.caseLabel);
      if(el.tagName==='IFRAME')el.title=language==='en'?`${name} case study`:`${name} · 双语作品案例`;
      else el.setAttribute('aria-label',language==='en'?`${name} case`:`${name}案例`);
    }
    for(const frame of document.querySelectorAll('iframe')) { try { frame.contentWindow.ovoPrefs?.setLanguage(language); } catch {} }
    const option=document.querySelector(`[data-language="${language}"]`);
    if(option?.getAttribute('aria-pressed')!=='true') option?.click();
    for(const e of document.querySelectorAll('.image-error')) {
      const alt=e.previousElementSibling?.alt || e.dataset.alt;
      e.textContent=language==='en'?`Image unavailable: ${alt}`:`图片暂时无法加载：${alt}`;
    }
    document.documentElement.lang=language;
    document.querySelectorAll('.language-global').forEach(el=>el.textContent=language==='en'?'中文':'EN');
    document.querySelectorAll('.motion-toggle').forEach(el=>{el.textContent=t(media.matches?'full':'motion');el.setAttribute('aria-pressed',String(media.matches));});
  }
  let applying=false;
  function setLanguage(value) {
    if(applying || !['en','zh-CN'].includes(value)) return;
    applying=true; language=value; write('ovo.language',value); translate(); applying=false;
    window.dispatchEvent(new Event('ovo-language'));
  }
  window.ovoPrefs={t,get language(){return language;},motion:media,setLanguage};
  document.addEventListener('click',e=>{
    const option=e.target.closest('[data-language]');
    if(option&&!applying) {
      setLanguage(option.dataset.language);
      if(parent!==window) parent.ovoPrefs?.setLanguage(option.dataset.language);
    }
    if(e.target.closest('.language-global')) setLanguage(language==='en'?'zh-CN':'en');
    if(e.target.closest('.motion-toggle')) {
      override=media.matches?'full':'reduce';write('ovo.motion',override); styles(); translate();media.dispatchEvent(new Event('change'));
      for(const f of document.querySelectorAll('iframe')) f.contentWindow.ovoPrefs?.setMotion?.(override);
    }
  });
  window.ovoPrefs.setMotion=value=>{override=value;styles();translate();media.dispatchEvent(new Event('change'));};
  system.addEventListener('change',()=>{if(!override){styles();translate();media.dispatchEvent(new Event('change'));}});
  function mediaFallback(image) {
    if(image.dataset.failed) return;image.dataset.failed='true';image.hidden=true;image.style.display='none';
    const message=document.createElement('p');message.className='image-error';message.setAttribute('role','status');
    message.dataset.alt=image.alt;message.textContent=language==='en'?`Image unavailable: ${image.alt}`:`图片暂时无法加载：${image.alt}`;
    image.after(message);
  }
  document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)mediaFallback(e.target);},true);
  document.addEventListener('DOMContentLoaded',()=>{
    styles();setLanguage(language);
    document.documentElement.style.removeProperty('visibility');
    for(const i of document.images) if(i.complete&&!i.naturalWidth)mediaFallback(i);
  });
  window.addEventListener('pageshow',()=>setLanguage(read('ovo.language')==='en'?'en':'zh-CN'));
})();

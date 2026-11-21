const embedded=new URLSearchParams(location.search).get('embedded')==='1'&&parent!==window;
document.body.dataset.embedded=String(embedded);
let language='zh';
const tablet=document.querySelector('.ipad'),display=document.querySelector('.display'),cover=document.querySelector('.cover'),scrollArea=document.querySelector('.pages');
function updateProgress(){const range=scrollArea.scrollHeight-scrollArea.clientHeight;document.querySelector('.scroll-position i').style.width=`${range>0?Math.max(5,scrollArea.scrollTop/range*100):100}%`;}
function translate(){
  const range=scrollArea.scrollHeight-scrollArea.clientHeight;
  const progress=range>0?Math.min(1,scrollArea.scrollTop/range):0;
  for(const el of document.querySelectorAll('[data-zh]'))el.textContent=el.dataset[language];
  document.documentElement.lang=language==='zh'?'zh-CN':'en';
  document.title=language==='zh'?'OvO · 关于我':'OvO · About me';
  document.querySelector('.stage').setAttribute('aria-label',language==='zh'?'iPad 个人名片':'iPad profile');
  tablet.setAttribute('aria-label',language==='zh'?'OvO 的 iPad':"OvO's iPad");
  const button=document.querySelector('.language');button.setAttribute('aria-label',language==='zh'?'切换到英文':'Switch to Chinese');button.title=button.getAttribute('aria-label');
  const close=document.querySelector('.close');close.setAttribute('aria-label',language==='zh'?'收起名片':'Close profile');close.title=close.getAttribute('aria-label');
  cover.setAttribute('aria-label',language==='zh'?'打开个人名片':'Open profile');
  scrollArea.setAttribute('aria-label',language==='zh'?'个人名片，可向下滚动':'Profile, scroll down to read');
  window.prepareProfileMotion?.();
  scrollArea.scrollTop=progress*Math.max(0,scrollArea.scrollHeight-scrollArea.clientHeight);updateProgress();
}
function setOpen(open){if(embedded&&!open){parent.postMessage({type:'ovo-profile-close'},location.origin);return;}document.body.dataset.open=String(open);display.hidden=!open;cover.hidden=open;if(open){scrollArea.focus({preventScroll:true});updateProgress();}else cover.focus({preventScroll:true});}
window.ovoPrefs={get language(){return language==='zh'?'zh-CN':'en';},setLanguage(value){language=value==='en'?'en':'zh';translate();}};
document.querySelector('.language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';translate();if(embedded)parent.ovoPrefs?.setLanguage(language==='zh'?'zh-CN':'en');});
document.querySelector('.close').addEventListener('click',()=>setOpen(false));cover.addEventListener('click',()=>setOpen(true));
document.querySelector('.stage').addEventListener('click',e=>{if(!tablet.contains(e.target)&&document.body.dataset.open==='true')setOpen(false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.dataset.open==='true'){e.preventDefault();setOpen(false);}});
scrollArea.addEventListener('scroll',updateProgress,{passive:true});window.addEventListener('resize',updateProgress);updateProgress();

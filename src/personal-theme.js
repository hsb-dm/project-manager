<script>
/* ============================================================
   THE LOOK IS PERSONAL
   Accent, highlight colour, density, corners and font are each person's own, as light/dark already is:
   choosing them changes only your account — saved with your preferences and announced to nobody. They
   used to be the workspace's: an admin picking a colour recoloured everyone, and every pick (every step
   of a drag through the picker) made every open copy reload the workspace and redraw its screen. The
   workspace's theme is the starting look for whoever has not chosen; an admin can make theirs that
   default on purpose. A hex code can be typed or pasted beside the swatches.
   ============================================================ */
var MY_THEME_KEYS=["accent","secondary","density","radius","font"], _myThemeT=null;
function myThemePrefs(){ if(!PEOPLE||!PEOPLE[ME]) return {}; var t=myPrefs().theme; return t&&typeof t==="object"?t:{}; }
function hasMyTheme(){ var t=myThemePrefs(); return MY_THEME_KEYS.some(function(k){ return t[k]!=null&&t[k]!==""; }); }
/* run fn with the workspace theme showing this person's choices (and put it back after) */
function withMyTheme(fn,self,args){ var th=WS.theme=WS.theme||{}, mine=myThemePrefs(), keep={}; MY_THEME_KEYS.forEach(function(k){ keep[k]=th[k]; if(mine[k]!=null&&mine[k]!=="") th[k]=mine[k]; }); try{ return fn.apply(self,args||[]); } finally { MY_THEME_KEYS.forEach(function(k){ th[k]=keep[k]; }); } }
(function(){
  var bApply=applyTheme; applyTheme=function(){ return withMyTheme(bApply,this,arguments); };
  var bQuick=renderQuickTheme; renderQuickTheme=function(){ var r=withMyTheme(bQuick,this,arguments); var q=document.getElementById("quickTheme"), n=q&&q.querySelector(".appearance-note"); if(n) n.textContent=tr("Your look is personal: only your account changes."); return r; };
  if(typeof setThemeTab==="function"){ var bTab=setThemeTab; setThemeTab=function(){ return withMyTheme(bTab,this,arguments); }; }
  if(typeof themeSwatchSync==="function"){ var bSync=themeSwatchSync; themeSwatchSync=function(){ return withMyTheme(bSync,this,arguments); }; }
  var bSet=setTheme; setTheme=function(k,v){ if(MY_THEME_KEYS.indexOf(k)<0||!PEOPLE||!PEOPLE[ME]) return bSet.apply(this,arguments);
    var p=myPrefs(); p.theme=Object.assign({},p.theme||{}); p.theme[k]=v; applyTheme();
    if(THEME_LIVE) themeSwatchSync(); else { var quick=document.getElementById("themePop"), keepOpen=quick&&quick.classList.contains("open"); if(keepOpen) setTimeout(function(){ quick.classList.add("open"); renderQuickTheme(); },0); if(S.screen==="settings") renderScreen(false); }
    /* a drag saves when it pauses; a choice made (a click, letting go) saves at once */
    clearTimeout(_myThemeT); if(THEME_LIVE) _myThemeT=setTimeout(saveMyPrefs,500); else saveMyPrefs(); };
})();
function resetMyTheme(){ if(!PEOPLE[ME]) return; var p=myPrefs(); delete p.theme; saveMyPrefs(); applyTheme(); renderScreen(false); toast(tr("Back to the workspace look")); }
function makeWorkspaceTheme(){ if(!canI.manageWorkspace()) return; var mine=myThemePrefs();
  confirmModal(tr("Make your look the workspace default?"),tr("People who have not chosen their own look will see it. Anyone who has keeps theirs."),function(){ MY_THEME_KEYS.forEach(function(k){ if(mine[k]!=null&&mine[k]!=="") WS.theme[k]=mine[k]; }); saveWS(tr("Workspace look saved")); applyTheme(); renderScreen(false); }); }
/* a hex code typed or pasted beside the swatches: #1f4fd8, 1F4FD8 or #18f */
function themeHex(v){ v=String(v||"").trim().replace(/^#/,""); if(/^[0-9a-f]{3}$/i.test(v)) v=v.replace(/(.)/g,"$1$1"); return /^[0-9a-f]{6}$/i.test(v)?"#"+v.toLowerCase():null; }
function themeHexInput(el,cb,commit){ var hex=themeHex(el.value); el.classList.toggle("bad",!hex&&!!el.value.trim()); if(!hex||typeof window[cb]!=="function") return; var box=el.closest(".swatches"), pick=box&&box.querySelector("input[type=color]"); if(pick) pick.value=hex;
  if(commit){ el.value=hex; window[cb](hex); return; } THEME_LIVE=true; try{ window[cb](hex); } finally { THEME_LIVE=false; } }
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({"Your look is personal: only your account changes.":"Tampilanmu personal: hanya akunmu yang berubah.","Back to the workspace look":"Kembali ke tampilan workspace","Make your look the workspace default?":"Jadikan tampilanmu default workspace?","People who have not chosen their own look will see it. Anyone who has keeps theirs.":"Orang yang belum memilih tampilannya sendiri akan melihatnya. Yang sudah memilih tetap memakai pilihannya.","Workspace look saved":"Tampilan workspace disimpan","Use the workspace look":"Pakai tampilan workspace","Make my look the workspace default":"Jadikan tampilanku default workspace","Hex colour":"Warna hex","Your colours are yours: choosing them changes only your account.":"Warnamu milikmu sendiri: memilihnya hanya mengubah akunmu."});
</script>

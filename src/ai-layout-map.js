<script>
/* ============================================================
   THE CANVAS'S LAYOUT, SENT WITH A GENERATION (Oct 2026)
   The text-safe area used to be described to the AI in words only, and the picture still ran under the headline.
   While "Keep AI image outside text areas" is on (it is unless turned off), a generation now also sends a layout
   map drawn from the canvas as it stands: the poster at its proportions, black where the headline, the other text,
   the button, the badge, the disclaimer and the logo sit — a little wider, softly edged — and lighter where the
   picture may be busy. Magnific Mystic follows it as the structure of the picture (unless the member's own reference
   is in Structure mode); GPT Image and Gemini get it as one more picture, told what it is (server.js AI_LAYOUT_NOTE).
   No text on the canvas, or no canvas yet: no map, as before.
   ============================================================ */
var AI_LAYOUT_TEXT_IDS={headline:1,sub:1,cta:1,badge:1,disclaimer:1,logo:1};
function aiLayoutTextHits(){
  return (typeof AI_LAYER_HITS!=="undefined"&&AI_LAYER_HITS||[]).filter(function(h){
    if(!h||!(h.w>0)||!(h.h>0)) return false;
    if(AI_LAYOUT_TEXT_IDS[h.id]) return true;
    if(String(h.id).indexOf("extra_")===0&&typeof aiExtra==="function"){ var x=aiExtra(h.id.slice(6)); return !!x&&x.type==="text"&&!!String(x.content||"").trim(); }
    return false;
  });
}
function aiLayoutMap(){
  if(typeof AIF==="undefined"||AIF.protectText===false||typeof document==="undefined") return null;
  var hits=aiLayoutTextHits(); if(!hits.length) return null;
  var sz=typeof aiActiveSize==="function"?aiActiveSize():null; if(!sz||!sz.w||!sz.h) return null;
  var k=Math.min(1,768/Math.max(sz.w,sz.h)), w=Math.max(16,Math.round(sz.w*k)), h=Math.max(16,Math.round(sz.h*k));
  var cv=document.createElement("canvas"); cv.width=w; cv.height=h; var g=cv.getContext("2d"); if(!g) return null;
  /* where the picture may be busy: a soft light, brightest where no text is */
  g.fillStyle="#7a7a7a"; g.fillRect(0,0,w,h);
  /* where the text sits: black, a little wider than the words, softly edged so no hard shape is copied */
  var pad=Math.round(Math.min(w,h)*0.035), soft=Math.max(4,Math.round(Math.min(w,h)*0.05));
  try{ g.filter="blur("+soft+"px)"; }catch(e){}
  g.fillStyle="#000000";
  hits.forEach(function(hh){ g.fillRect(Math.round(hh.x*k)-pad,Math.round(hh.y*k)-pad,Math.round(hh.w*k)+pad*2,Math.round(hh.h*k)+pad*2); });
  try{ g.filter="none"; }catch(e){}
  try{ return cv.toDataURL("image/png"); }catch(e){ return null; }
}
</script>

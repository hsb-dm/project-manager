<script>
/* ============================================================
   THE CANVAS'S LAYOUT, SENT WITH A GENERATION (Oct 2026)
   The text-safe area used to be described to the AI in words only, and the picture still ran under the headline.
   While "Keep AI image outside text areas" is on (it is unless turned off), a generation also sends where the
   headline, the other text, the button, the badge, the disclaimer and the logo sit on the canvas as it stands — each
   as a box in fractions of the poster — and the server writes it into the prompt as measured bands ("the headline
   from 6% to 31% of the height… place the subject between 36% and 72%"), server.js aiLayoutNote.
   It first went as a picture, a grey map with black boxes. A model that edits pictures (GPT Image's edits, the one
   path for a picture) took the map as the picture to edit and returned grey, crumpled noise; now no picture goes.
   No text on the canvas, or no canvas yet: nothing is sent, as before.
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
/* each text box on the canvas, in fractions of the poster (0–1), the part outside the poster left off */
function aiLayoutZones(){
  if(typeof AIF==="undefined"||AIF.protectText===false) return null;
  var hits=aiLayoutTextHits(); if(!hits.length) return null;
  var sz=typeof aiActiveSize==="function"?aiActiveSize():null; if(!sz||!sz.w||!sz.h) return null;
  var f=function(v){ return Math.round(Math.max(0,Math.min(1,v))*1000)/1000; }, out=[];
  hits.slice(0,24).forEach(function(h){
    var x0=f(h.x/sz.w), y0=f(h.y/sz.h), x1=f((h.x+h.w)/sz.w), y1=f((h.y+h.h)/sz.h);
    if(x1>x0&&y1>y0) out.push({x:x0,y:y0,w:f(x1-x0),h:f(y1-y0),kind:h.id==="headline"?"headline":h.id==="logo"?"logo":"text"});
  });
  return out.length?out:null;
}
</script>

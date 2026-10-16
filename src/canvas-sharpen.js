<script>
/* ============================================================
   THE PREVIEW, SHRUNK PROPERLY (Oct 2026)
   AI Hub draws a design at its full size (a story is 1080×1920) and the page showed that canvas shrunk by CSS — about
   six times smaller at Fit. A browser shrinks a canvas that much roughly, by sampling, so a picture's fine detail
   turned to noise and small text broke up ("burik"), although the file it downloads was sharp.
   Now a copy is laid over it, drawn at the size it is shown (times the screen's pixel density) in halving steps, each
   smoothed. The full-size canvas stays underneath, untouched: every click, drag and edit still reads it, and the
   export never uses the copy. The copy is drawn again whenever the canvas is (aiPreview, aiInlineRepaint) and when the
   zoom changes its size; zoomed in close enough, there is no copy.
   ============================================================ */
function aiViewSharpen(wrap,cv){
  if(!wrap||!cv||!cv.width) return;
  var view=wrap.querySelector(":scope > canvas.ai-view-canvas");
  var r=wrap.getBoundingClientRect(), dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
  var tw=Math.round(r.width*dpr), th=Math.round(r.height*dpr);
  /* close to full size: the canvas itself is sharp enough */
  if(!tw||!th||tw>=cv.width*0.7){ if(view) view.remove(); return; }
  if(!view){ view=document.createElement("canvas"); view.className="ai-view-canvas"; view.setAttribute("aria-hidden","true"); wrap.insertBefore(view,cv.nextSibling); aiViewWatch(wrap); }
  view._src=cv;
  if(view.width!==tw) view.width=tw; if(view.height!==th) view.height=th;
  var src=cv, w=cv.width, h=cv.height;
  /* halve until within twice the size shown: each step averages its four pixels, so nothing is skipped */
  while(w/2>=tw*1.0&&h/2>=th*1.0){
    var nw=Math.max(tw,Math.round(w/2)), nh=Math.max(th,Math.round(h/2)), step=document.createElement("canvas"); step.width=nw; step.height=nh;
    var sg=step.getContext("2d"); sg.imageSmoothingEnabled=true; sg.imageSmoothingQuality="high"; sg.drawImage(src,0,0,w,h,0,0,nw,nh);
    src=step; w=nw; h=nh;
  }
  var g=view.getContext("2d"); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high"; g.clearRect(0,0,tw,th); g.drawImage(src,0,0,w,h,0,0,tw,th);
}
/* the zoom changes the stage's size without drawing again: the copy follows, once a frame */
function aiViewWatch(wrap){
  if(wrap._sharpenWatch||typeof ResizeObserver==="undefined") return;
  var queued=false;
  wrap._sharpenWatch=new ResizeObserver(function(){ if(queued) return; queued=true; requestAnimationFrame(function(){ queued=false; var view=wrap.querySelector(":scope > canvas.ai-view-canvas"), cv=view&&view._src; if(cv&&cv.isConnected) aiViewSharpen(wrap,cv); else if(!view){ var c=wrap.querySelector(":scope > canvas:not(.ai-view-canvas)"); if(c) aiViewSharpen(wrap,c); } }); });
  wrap._sharpenWatch.observe(wrap);
}
</script>

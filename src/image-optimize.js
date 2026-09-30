<script>
/* IMAGE OPTIMISATION for server storage.
   When a workspace keeps files on its own server, images are re-encoded in the browser before they
   are sent: JPEG for anything opaque, PNG when there is transparency (JPEG has no alpha, so a logo
   would come back with a black box around it). Resizing and re-encoding happen here rather than on
   the server because the server has no image library and the browser already has one.

   Deliberately left alone:
   - GIF, because drawing one on a canvas keeps only its first frame and would kill the animation;
   - SVG, because it is a vector and re-encoding would rasterise it;
   - anything the browser cannot decode (HEIC, TIFF, RAW), which is uploaded as it is.

   Re-encoding also drops EXIF metadata — including the GPS position phones write into photos. */
var IMG_PRESETS = {
  balanced: { max: 2048, q: 0.85 },   /* sharp enough to review at full screen */
  smaller:  { max: 1600, q: 0.78 },   /* noticeably lighter; still fine for feedback */
  full:     { max: 0,    q: 0.92 },   /* keep every pixel, just re-encode */
  off:      null                      /* upload exactly what was chosen */
};
function imgPresetName(){ var p=(typeof gdCfg==="function"?gdCfg():{}).imageOptimize; return Object.prototype.hasOwnProperty.call(IMG_PRESETS,p)?p:"balanced"; }
function humanBytes(n){ n=+n||0; return n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB"; }
function imgDecode(file){
  if(typeof createImageBitmap==="function"){
    return createImageBitmap(file,{imageOrientation:"from-image"}).catch(function(){ return createImageBitmap(file); });
  }
  return new Promise(function(res,rej){ var u=URL.createObjectURL(file), img=new Image();
    img.onload=function(){ URL.revokeObjectURL(u); res(img); }; img.onerror=function(){ URL.revokeObjectURL(u); rej(new Error("decode")); }; img.src=u; });
}
/* Transparency is found on a small copy: shrinking averages alpha, so even a thin transparent edge
   pulls some probe pixel below fully opaque, and a 512px probe costs nothing next to reading a
   full-size photo pixel by pixel. */
function imgHasAlpha(src,w,h){
  var s=Math.min(1,512/Math.max(w,h)), pw=Math.max(1,Math.round(w*s)), ph=Math.max(1,Math.round(h*s));
  var cv=document.createElement("canvas"); cv.width=pw; cv.height=ph;
  var cx=cv.getContext("2d",{willReadFrequently:true}); cx.drawImage(src,0,0,pw,ph);
  var d=cx.getImageData(0,0,pw,ph).data;
  for(var i=3;i<d.length;i+=4) if(d[i]<255) return true;
  return false;
}
function imgToBlob(cv,mime,q){ return new Promise(function(res,rej){ cv.toBlob(function(b){ b?res(b):rej(new Error("encode")); },mime,q); }); }
/* optimizeImage(file) → Promise<{file, changed, before, after, format, width, height}>. Never
   rejects: if anything goes wrong the original is returned untouched, so an odd image still uploads. */
function optimizeImage(file,presetName){
  var preset=IMG_PRESETS[presetName||imgPresetName()], type=String(file&&file.type||"").toLowerCase();
  var keep=function(reason){ return { file:file, changed:false, reason:reason, before:file.size, after:file.size }; };
  if(!preset) return Promise.resolve(keep("off"));
  if(!/^image\/(png|jpeg|webp)$/.test(type)) return Promise.resolve(keep(type==="image/gif"?"animated":"unsupported"));
  return imgDecode(file).then(function(src){
    var w=src.width, h=src.height;
    if(!w||!h) return keep("empty");
    var scale=preset.max?Math.min(1,preset.max/Math.max(w,h)):1;
    var ow=Math.max(1,Math.round(w*scale)), oh=Math.max(1,Math.round(h*scale));
    var alpha=type!=="image/jpeg"&&imgHasAlpha(src,w,h);
    var mime=alpha?"image/png":"image/jpeg";
    var cv=document.createElement("canvas"); cv.width=ow; cv.height=oh;
    var cx=cv.getContext("2d");
    /* opaque output: paint white first, so any stray soft edge does not turn black in JPEG */
    if(!alpha){ cx.fillStyle="#fff"; cx.fillRect(0,0,ow,oh); }
    cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality="high";
    cx.drawImage(src,0,0,ow,oh);
    if(src.close) try{ src.close(); }catch(e){}
    /* JPEG is not always smaller. Flat graphics — banners, UI mockups, line art — compress far better
       as PNG, and as JPEG they come out both bigger and blurrier: a 137 KB PNG banner once became a
       1.6 MB JPEG here. So an opaque PNG or WebP is encoded both ways and the smaller one wins.
       A JPEG source is a photo already; re-encoding it as PNG would only inflate it. */
    var tries=[imgToBlob(cv,mime,alpha?undefined:preset.q).then(function(b){ return {blob:b,format:alpha?"png":"jpeg"}; })];
    if(!alpha&&type!=="image/jpeg") tries.push(imgToBlob(cv,"image/png").then(function(b){ return {blob:b,format:"png"}; }));
    return Promise.all(tries).then(function(all){
      /* Smallest is not automatically best. Measured at 2048 px: a flat banner was 62 KB as PNG and
         32 KB as JPEG (1.95×), a photo 5.8 MB against 860 KB (6.8×). Taking the JPEG banner saves
         30 KB and puts ringing round every letter — a poor trade for a team reviewing artwork. So
         PNG is kept unless JPEG saves at least three times over, which separates the two cleanly;
         and a PNG that would break the upload limit loses to a JPEG that fits. */
      var jpg=all.filter(function(x){ return x.format==="jpeg"; })[0], pngC=all.filter(function(x){ return x.format==="png"; })[0];
      var limit=typeof serverMaxBytes==="function"?serverMaxBytes():Infinity;
      var best=(jpg&&pngC)?((pngC.blob.size<=jpg.blob.size*3&&pngC.blob.size<=limit)?pngC:jpg):all[0];
      /* Never hand back something heavier than what was chosen: if the original PNG or JPEG is
         already smaller, keep it — at full resolution, which is strictly better. WebP has no such
         escape, because the point is to end up with PNG or JPEG. */
      if(type!=="image/webp"&&best.blob.size>=file.size) return keep("already-small");
      var base=String(file.name||"image").replace(/\.[^.]+$/,"")||"image", png=best.format==="png";
      var out=new File([best.blob],base+(png?".png":".jpg"),{type:png?"image/png":"image/jpeg",lastModified:Date.now()});
      return { file:out, changed:true, before:file.size, after:best.blob.size, format:best.format, width:ow, height:oh };
    });
  }).catch(function(){ return keep("undecodable"); });
}
</script>

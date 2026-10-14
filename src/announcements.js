<script>
/* ANNOUNCEMENT EMAIL (Oct 2026) — Settings → Notifications, for whoever holds send_announcements (Admin, unless a
   role is given it in Roles & permissions). A subject, a message and, if wanted, a link; sent by e-mail to every
   member with an address — stakeholders only when ticked. "Send a test to me" first shows how it looks; "Send to
   everyone" asks once more, with the number of people. The last ten are listed with how far each got.
   Server: server/announcements.js. What is being written stays while the page is redrawn or left. */
var ANN=null, ANN_DRAFT=annBlank(), ANN_POLL=null;
function annBlank(){ return {subject:"",message:"",link:"",stakeholders:false,mode:"all",picked:{},q:""}; }
function canAnnounce(){ return !!(API.on&&has("send_announcements")); }
function annLoad(){ return apiFetch("GET","/api/announcements").then(function(d){ ANN=d; annRedraw();
  /* one still going: asked again until it is done */
  clearTimeout(ANN_POLL); if((d.history||[]).some(function(h){ return h.status==="sending"; })) ANN_POLL=setTimeout(annLoad,1500); }).catch(function(e){ ANN={err:e.message,history:[]}; annRedraw(); }); }
function annRedraw(){ if(S.screen!=="settings"||S.settingsTab!=="notifications") return; var box=document.getElementById("annPanel"); if(!box) return; annValues();
  /* whoever is typing in it keeps typing: same field, same caret */
  var a=document.activeElement, keep=a&&a.id&&box.contains(a)?{id:a.id,s:a.selectionStart,e:a.selectionEnd}:null;
  var tmp=document.createElement("div"); tmp.innerHTML=annSection(); if(tmp.firstElementChild) box.replaceWith(tmp.firstElementChild);
  var n=keep&&document.getElementById(keep.id); if(n){ n.focus(); try{ if(keep.s!=null) n.setSelectionRange(keep.s,keep.e); }catch(e){} } }
function annStatus(h){ if(h.status==="sending") return '<span class="badge">'+tr("Sending…")+' '+h.sent+'/'+h.recipients+'</span>';
  return '<span class="badge'+(h.failed?" bad":" ok")+'">'+fmt(tr("Sent to {n}"),{n:h.sent})+(h.failed?' · '+fmt(tr("{n} failed"),{n:h.failed}):'')+'</span>'; }
/* Who it goes to: everyone (stakeholders when ticked), or the people ticked one by one — found by name, e-mail or
   role; "Select all" ticks everyone listed (everyone found, while searching). */
function annPicked(){ var d=ANN_DRAFT; return (ANN.people||[]).filter(function(p){ return d.picked[p.id]; }).map(function(p){ return p.id; }); }
function annCount(){ var d=ANN_DRAFT; return d.mode==="pick"?annPicked().length:(ANN.members||0)+(d.stakeholders?(ANN.stakeholders||0):0); }
function annShown(){ var q=String(ANN_DRAFT.q||"").trim().toLowerCase(), has=function(v){ return String(v||"").toLowerCase().indexOf(q)>=0; };
  return (ANN.people||[]).filter(function(p){ var pp=person(p.id); return !q||has(pp.name)||has(pp.email)||has(pp.role); }).sort(function(a,b){ return String(person(a.id).name||"").localeCompare(String(person(b.id).name||"")); }); }
function annMode(m){ ANN_DRAFT.mode=m==="pick"?"pick":"all"; annRedraw(); }
function annPick(id,on){ if(on) ANN_DRAFT.picked[id]=true; else delete ANN_DRAFT.picked[id]; annRedraw(); }
function annPickAll(on){ annShown().forEach(function(p){ if(on) ANN_DRAFT.picked[p.id]=true; else delete ANN_DRAFT.picked[p.id]; }); annRedraw(); }
function annSearch(v){ ANN_DRAFT.q=v; annRedraw(); }
function annRecipientsHtml(){ var d=ANN_DRAFT, opt=function(k,label){ return '<button type="button" class="'+(d.mode===k?"on":"")+'" aria-pressed="'+(d.mode===k)+'" onclick="annMode(\''+k+'\')">'+tr(label)+'</button>'; };
  var inner;
  if(d.mode!=="pick") inner=ANN.stakeholders?'<label class="ann-check"><input type="checkbox" id="ann_stake"'+(d.stakeholders?' checked':'')+' onchange="ANN_DRAFT.stakeholders=this.checked;annRedraw()"> '+fmt(tr("Also send to stakeholders ({n})"),{n:ANN.stakeholders})+'</label>':'';
  else { var shown=annShown(), all=!!shown.length&&shown.every(function(p){ return d.picked[p.id]; }), searching=!!String(d.q||"").trim();
    inner='<div class="ann-pick"><div class="ann-pick-head"><label class="ann-check"><input type="checkbox" id="ann_all"'+(all?' checked':'')+(shown.length?'':' disabled')+' onchange="annPickAll(this.checked)"> '+tr(searching?"Select all found":"Select all")+'</label>'
      +'<input id="ann_q" class="ann-search" type="search" value="'+attr(d.q||"")+'" placeholder="'+attr(tr("Search people"))+'" aria-label="'+attr(tr("Search people"))+'" oninput="annSearch(this.value)"><span class="ann-count">'+fmt(tr("{n} selected"),{n:annPicked().length})+'</span></div>'
      +'<div class="ann-pick-list">'+(shown.length?shown.map(function(p){ var pp=person(p.id); return '<label class="ann-person"><input type="checkbox" data-id="'+attr(p.id)+'"'+(d.picked[p.id]?' checked':'')+' onchange="annPick('+jsq(p.id)+',this.checked)">'+av(p.id)+'<span class="ann-pn"><b>'+esc(pp.name||p.id)+'</b><span>'+esc([pp.role,pp.email].filter(Boolean).join(" · "))+'</span></span>'+(p.stakeholder?'<span class="badge client">'+tr("stakeholder")+'</span>':'')+'</label>'; }).join(""):'<p class="hint">'+tr("No one matches")+'</p>')+'</div></div>'; }
  return '<div class="field ann-to"><label>'+tr("Recipients")+'</label><div class="seg ann-mode" role="group" aria-label="'+attr(tr("Recipients"))+'">'+opt("all","Everyone")+opt("pick","Choose people")+'</div>'+inner+'</div>'; }
function annSection(){ if(!canAnnounce()) return "";
  if(ANN===null){ ANN={loading:true,history:[]}; annLoad(); }
  var d=ANN_DRAFT, n=annCount();
  var body='<p class="hint" style="margin-bottom:12px">'+tr("An e-mail to everyone in the workspace — a new feature, a change in how the team works, planned downtime. It is sent from the e-mail settings below.")+'</p>'
    +fieldHtml("ann_subject",tr("Subject"),'<input id="ann_subject" maxlength="150" value="'+attr(d.subject)+'" placeholder="'+attr(tr("e.g. New: discussions on every project"))+'" oninput="ANN_DRAFT.subject=this.value">')
    +fieldHtml("ann_message",tr("Message"),'<textarea id="ann_message" rows="6" maxlength="5000" placeholder="'+attr(tr("What changed, and what people should do about it"))+'" oninput="ANN_DRAFT.message=this.value">'+esc(d.message)+'</textarea>')
    +fieldHtml("ann_link",tr("Link (optional)"),'<input id="ann_link" inputmode="url" maxlength="500" value="'+attr(d.link)+'" placeholder="https://" oninput="ANN_DRAFT.link=this.value"><div class="hint">'+tr("The e-mail's button opens it; without one, the button opens ZenCrevia.")+'</div>')
    +(ANN.loading?'':annRecipientsHtml())
    +'<p class="hint ann-who">'+(ANN.loading?tr("Counting who it goes to…"):fmt(tr(n===1?"It goes to {n} person.":"It goes to {n} people."),{n:n}))+'</p>';
  var hist=(ANN.history||[]).map(function(h){ return '<div class="pref ann-row"><div class="pl"><b>'+esc(h.subject)+'</b><span>'+esc(person(h.by).name||h.by)+' · '+esc(whenLabel(h.createdAt))+' · '+(h.chosen?fmt(tr(h.recipients===1?"to {n} person chosen":"to {n} people chosen"),{n:h.recipients}):tr(h.stakeholders?"to everyone, with stakeholders":"to everyone"))+'</span></div>'+annStatus(h)+'</div>'; }).join("");
  var foot='<button class="btn" onclick="annSend(true)">'+I.bell+tr("Send a test to me")+'</button><span class="spacer"></span><button class="btn primary" onclick="annSend(false)"'+(ANN.loading||!n?' disabled':'')+'>'+(d.mode==="pick"?fmt(tr(n===1?"Send to {n} person":"Send to {n} people"),{n:n}):tr("Send to everyone"))+'</button>';
  return '<div id="annPanel">'+sp("Announcement email",body+(ANN.err?'<p class="hint" style="color:var(--color-danger)">'+esc(ANN.err)+'</p>':'')+(hist?'<h3 class="ann-h">'+tr("Sent before")+'</h3>'+hist:''),foot,I.bell,"ann-panel")+'</div>'; }
function annValues(){ ["subject","message","link"].forEach(function(k){ var el=document.getElementById("ann_"+k); if(el) ANN_DRAFT[k]=el.value; }); return ANN_DRAFT; }
function annSend(test){ var d=annValues();
  if(!d.subject.trim()) return toast(tr("Write a subject"),"bad"); if(!d.message.trim()) return toast(tr("Write a message"),"bad");
  if(d.link.trim()&&!/^https:\/\//i.test(d.link.trim())) return toast(tr("The link must start with https://"),"bad");
  if(test) return apiFetch("POST","/api/announcements",annBody(true)).then(function(r){ toast(fmt(tr("Test sent to {to}"),{to:r.to})); }).catch(function(e){ toast(e.message,"bad"); });
  var n=annCount(), pick=d.mode==="pick", names=pick?annPicked().map(function(id){ return person(id).name||id; }):[];
  if(!n) return toast(tr("Choose at least one person"),"bad");
  openModal(tr(pick?"Send to the people chosen?":"Send to everyone?"),'<p>'+fmt(tr(n===1?"This e-mail goes to {n} person. It cannot be called back once sent.":"This e-mail goes to {n} people. It cannot be called back once sent."),{n:n})+'</p>'+(pick?'<p class="hint ann-names">'+esc(names.slice(0,8).join(", "))+(names.length>8?' '+fmt(tr("and {n} more"),{n:names.length-8}):'')+'</p>':'')+'<div class="ann-preview"><b>'+esc(d.subject)+'</b><div>'+esc(d.message).replace(/\n/g,"<br>")+'</div></div>',
    '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" id="annGo" onclick="annSendNow()">'+tr("Send")+'</button>'); }
/* what is sent: everyone (and stakeholders, if ticked), or the people chosen */
function annBody(test){ var d=annValues(), b={subject:d.subject,message:d.message,link:d.link.trim(),test:!!test}; if(d.mode==="pick") b.recipients=annPicked(); else b.stakeholders=!!d.stakeholders; return b; }
function annSendNow(){ var b=document.getElementById("annGo"); if(b) b.disabled=true;
  apiFetch("POST","/api/announcements",annBody(false)).then(function(r){ closeModal();
    toast(fmt(tr(r.announcement.recipients===1?"Sending to {n} person…":"Sending to {n} people…"),{n:r.announcement.recipients})); ANN_DRAFT=annBlank(); ["subject","message","link"].forEach(function(k){ var el=document.getElementById("ann_"+k); if(el) el.value=""; });
    ANN.history=r.history||ANN.history; annRedraw(); clearTimeout(ANN_POLL); ANN_POLL=setTimeout(annLoad,1200); })
    .catch(function(e){ if(b) b.disabled=false; toast(e.message,"bad"); }); }
Object.assign(UI_ID,{
  "Announcement email":"Email pengumuman","Send announcement emails to every member":"Mengirim email pengumuman ke semua anggota",
  "An e-mail to everyone in the workspace — a new feature, a change in how the team works, planned downtime. It is sent from the e-mail settings below.":"Email ke semua orang di workspace — fitur baru, perubahan cara kerja tim, jadwal pemeliharaan. Dikirim lewat pengaturan email di bawah.",
  "Subject":"Subjek","Message":"Pesan","Link (optional)":"Link (opsional)","e.g. New: discussions on every project":"mis. Baru: diskusi di setiap project","What changed, and what people should do about it":"Apa yang berubah, dan apa yang perlu dilakukan",
  "The e-mail's button opens it; without one, the button opens ZenCrevia.":"Tombol di email membuka link ini; tanpa link, tombolnya membuka ZenCrevia.",
  "Also send to stakeholders ({n})":"Kirim juga ke stakeholder ({n})","Counting who it goes to…":"Menghitung penerima…","It goes to {n} person.":"Dikirim ke {n} orang.","It goes to {n} people.":"Dikirim ke {n} orang.",
  "to everyone":"ke semua orang","to everyone, with stakeholders":"ke semua orang, termasuk stakeholder","to {n} person chosen":"ke {n} orang terpilih","to {n} people chosen":"ke {n} orang terpilih",
  "Recipients":"Penerima","Everyone":"Semua orang","Choose people":"Pilih orang","Select all":"Pilih semua","Select all found":"Pilih semua yang ditemukan","Search people":"Cari orang","{n} selected":"{n} dipilih","No one matches":"Tidak ada yang cocok","stakeholder":"stakeholder",
  "Send to {n} person":"Kirim ke {n} orang","Send to {n} people":"Kirim ke {n} orang","Send to the people chosen?":"Kirim ke orang yang dipilih?","and {n} more":"dan {n} lainnya","Choose at least one person":"Pilih minimal satu orang","Sending to {n} person…":"Mengirim ke {n} orang…","Sent before":"Terkirim sebelumnya","Send a test to me":"Kirim tes ke saya","Send to everyone":"Kirim ke semua","Send to everyone?":"Kirim ke semua?","Send":"Kirim",
  "This e-mail goes to {n} person. It cannot be called back once sent.":"Email ini dikirim ke {n} orang. Tidak bisa ditarik kembali setelah terkirim.","This e-mail goes to {n} people. It cannot be called back once sent.":"Email ini dikirim ke {n} orang. Tidak bisa ditarik kembali setelah terkirim.",
  "Test sent to {to}":"Tes terkirim ke {to}","Sending to {n} people…":"Mengirim ke {n} orang…","Sending…":"Mengirim…","Sent to {n}":"Terkirim ke {n}","{n} failed":"{n} gagal",
  "Write a subject":"Tulis subjeknya","Write a message":"Tulis pesannya","The link must start with https://":"Link harus diawali https://"
});
</script>

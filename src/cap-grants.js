<script>
/* ============================================================
   EXTRA PERMISSIONS FOR ONE PERSON (Oct 2026)
   Someone who manages roles gives one person permissions on top of their role, say a Member who looks after the AI
   Hub templates for a while, without changing that role. All of a person's extra permissions run until the same
   optional last day, then go by themselves; they are given and changed from the person's row in Settings → Members,
   and Roles & permissions lists who has them. The server adds them to the person's role (cap_grants); here has()
   counts them too (core.js), so the page shows what the person may do.
   ============================================================ */
var MY_GRANTS=[], CAP_GRANTS=[];
function capGrantToday(){ return new Date().toISOString().slice(0,10); }
function capGrantLive(g){ return !!g&&(!g.expiresAt||g.expiresAt>=capGrantToday()); }
function capGrantHas(cap){ return MY_GRANTS.some(function(g){ return g.cap===cap&&capGrantLive(g); }); }
function capGrantsOf(id){ return CAP_GRANTS.filter(function(g){ return g.userId===id&&capGrantLive(g); }); }
function capLabel(cap){ var c=((typeof CAPS!=="undefined"&&CAPS)||[]).filter(function(x){ return x[0]===cap; })[0]; return c?tr(c[1]):cap; }
function capGrantDate(d){ try{ return new Date(d+"T12:00:00").toLocaleDateString(UI_LANG==="id"?"id-ID":"en-GB",{day:"numeric",month:"short",year:"numeric"}); }catch(e){ return d; } }
function capGrantCanGive(id){ var p=PEOPLE[id]; return !!(API.on&&p&&canI.manageRoles&&canI.manageRoles()&&id!==ME&&p.perm!=="admin"&&p.active!==false); }

/* ---------- Members: the chip under a person's role ---------- */
function capGrantChip(id){
  var mine=capGrantsOf(id), can=capGrantCanGive(id); if(!mine.length&&!can) return "";
  var label=mine.length?"+"+mine.length+" "+tr(mine.length===1?"extra permission":"extra permissions")+(mine[0].expiresAt?" · "+tr("until")+" "+capGrantDate(mine[0].expiresAt):""):tr("Extra permissions");
  var tip=mine.length?mine.map(function(g){ return capLabel(g.cap); }).join(", "):tr("Give permissions on top of this role");
  return '<button type="button" class="cap-grant-chip'+(mine.length?' on':'')+'" title="'+attr(tip)+'" aria-label="'+attr(label+(mine.length?": "+tip:""))+'"'+(can?' onclick="capGrantModal('+jsq(id)+')"':' disabled')+'>'+(mine.length?I.lock:I.plus)+'<span>'+esc(label)+'</span></button>';
}
/* every permission, in the role editor's groups; the role's own ones shown, not to be given again */
function capGrantModal(id){
  var p=PEOPLE[id]; if(!p) return; var ro=byId(ROLES,p.perm)||{permissions:[],name:p.perm}, mine=capGrantsOf(id), have={}, fromRole={}, seen={};
  (ro.permissions||[]).forEach(function(c){ fromRole[c]=1; }); mine.forEach(function(g){ have[g.cap]=1; });
  var all=(typeof CAPS!=="undefined"&&CAPS)||[], byCap={}; all.forEach(function(c){ byCap[c[0]]=c; });
  var groups=((typeof CAP_GROUPS!=="undefined"&&CAP_GROUPS)||[]).map(function(g){ return [g[0],g[1].map(function(id){ seen[id]=1; return byCap[id]; }).filter(Boolean)]; });
  var rest=all.filter(function(c){ return !seen[c[0]]; }); if(rest.length) groups.push(["Other",rest]);
  var html=groups.filter(function(g){ return g[1].length; }).map(function(g){
    return '<div class="cap-grant-group"><b>'+esc(tr(g[0]))+'</b>'+g[1].map(function(c){ var own=!!fromRole[c[0]];
      return '<label class="cap-grant-row'+(own?' own':'')+'"><input type="checkbox" name="cap_grant" value="'+attr(c[0])+'"'+(own||have[c[0]]?' checked':'')+(own?' disabled':'')+'><span>'+esc(tr(c[1]))+'</span>'+(own?'<em>'+tr("from the role")+'</em>':'')+'</label>'; }).join("")+'</div>'; }).join("");
  openModal(tr("Extra permissions")+" · "+p.name,
    '<p class="hint" style="margin-bottom:12px">'+tr("On top of the role {role}. The role itself stays as it is.").replace("{role}",'<b>'+esc(ro.name||p.perm)+'</b>')+'</p>'
    + '<div class="field"><label for="cap_grant_until">'+tr("Last day (optional)")+'</label><input type="date" id="cap_grant_until" value="'+attr((mine[0]&&mine[0].expiresAt)||"")+'" min="'+capGrantToday()+'"><p class="hint">'+tr("Empty: until taken back.")+'</p></div>'
    + '<div class="cap-grant-list">'+html+'</div>',
    (mine.length?'<button class="btn ghost" onclick="capGrantSave('+jsq(id)+',true)">'+I.trash+tr("Remove all")+'</button><span class="spacer"></span>':'')
    + '<button class="btn" onclick="closeModal()">'+tr("Cancel")+'</button><button class="btn primary" onclick="capGrantSave('+jsq(id)+')">'+tr("Save")+'</button>');
}
function capGrantSave(id,clear){
  var caps=clear?[]:Array.prototype.map.call(document.querySelectorAll('input[name="cap_grant"]:checked:not(:disabled)'),function(x){ return x.value; });
  var until=clear?null:(val("cap_grant_until")||null);
  apiFetch("PUT","/api/members/"+encodeURIComponent(id)+"/cap-grants",{caps:caps,expiresAt:until}).then(function(r){
    CAP_GRANTS=(r&&r.grants)||[]; closeModal(); toast(tr(caps.length?"Extra permissions saved":"Extra permissions removed")); renderScreen(false);
  }).catch(function(e){ toast(e.message,"bad"); });
}

/* ---------- Roles & permissions: who has extra permissions ---------- */
function capGrantsSection(){
  if(!API.on||!(canI.manageRoles&&canI.manageRoles())) return "";
  var by={}; CAP_GRANTS.filter(capGrantLive).forEach(function(g){ (by[g.userId]=by[g.userId]||[]).push(g); });
  var ids=Object.keys(by).filter(function(id){ return PEOPLE[id]; });
  return sp("Extra permissions",'<p class="hint" style="margin-bottom:10px">'+tr("People with permissions on top of their role. Give or change them from a person's row in Members.")+'</p>'
    + (ids.length?ids.map(function(id){ var g=by[id], ro=byId(ROLES,PEOPLE[id].perm)||{};
        return '<div class="pref"><div class="pl"><b>'+esc(PEOPLE[id].name)+' <span class="badge">'+esc(ro.name||PEOPLE[id].perm)+'</span></b><span>'+g.map(function(x){ return esc(capLabel(x.cap)); }).join(", ")+(g[0].expiresAt?' · '+tr("until")+' '+capGrantDate(g[0].expiresAt):'')+'</span></div>'
          + (capGrantCanGive(id)?'<button class="btn xs" onclick="capGrantModal('+jsq(id)+')">'+I.edit+tr("Edit")+'</button>':'')+'</div>'; }).join("")
      :'<div class="hint">'+tr("Nobody has extra permissions.")+'</div>'), null, I.lock);
}
(function(){ if(typeof setRoles!=="function") return; var base=setRoles; setRoles=function(){ return base.apply(this,arguments)+capGrantsSection(); }; })();
/* from the workspace as it arrives, and again when an admin changes them */
(function(){ if(typeof loadBootstrap!=="function") return; var base=loadBootstrap; loadBootstrap=function(d){ var r=base.apply(this,arguments); MY_GRANTS=(d&&d.me&&d.me.extraCaps)||[]; CAP_GRANTS=(d&&d.capGrants)||[]; return r; }; })();
(function(){ if(typeof msgOnEvent!=="function") return; var base=msgOnEvent; msgOnEvent=function(ev){ if(ev&&ev.type==="ws_changed"&&ev.kind==="grants"&&API.on){ apiFetch("GET","/api/live/grants").then(function(d){ MY_GRANTS=d.mine||[]; CAP_GRANTS=d.grants||[]; refresh(); }).catch(function(){}); } return base.apply(this,arguments); }; })();
(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({
  "Extra permissions":"Izin tambahan",
  "extra permission":"izin tambahan",
  "extra permissions":"izin tambahan",
  "until":"sampai",
  "Give permissions on top of this role":"Beri izin di luar peran ini",
  "On top of the role {role}. The role itself stays as it is.":"Di luar peran {role}. Perannya sendiri tidak berubah.",
  "Last day (optional)":"Berlaku sampai (opsional)",
  "Empty: until taken back.":"Kosong: berlaku sampai dicabut.",
  "from the role":"dari peran",
  "Remove all":"Hapus semua",
  "Extra permissions saved":"Izin tambahan tersimpan",
  "Extra permissions removed":"Izin tambahan dihapus",
  "People with permissions on top of their role. Give or change them from a person's row in Members.":"Orang yang punya izin di luar perannya. Beri atau ubah dari baris orang tersebut di Anggota.",
  "Nobody has extra permissions.":"Belum ada yang punya izin tambahan.",
  "Other":"Lainnya"
});
</script>

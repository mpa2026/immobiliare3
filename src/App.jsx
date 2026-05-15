import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://svsyczdpwdpveqxpvsjr.supabase.co";
const SUPABASE_KEY = "sb_publishable_fV1Ycrt8CsVEjOWyAhUFzg_3Rc7iLwb";

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const AUTH_KEY = "imm_session";

async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Email o password errati");
  const s = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    email:         data.user?.email,
    expires_at:    Date.now() + (data.expires_in * 1000),
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(s));
  return s;
}

async function authSignOut(token) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
    });
  } catch {}
  localStorage.removeItem(AUTH_KEY);
}

function getStoredSession() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (!s?.access_token) return null;
    if (s.expires_at && Date.now() > s.expires_at - 60000) return null;
    return s;
  } catch { return null; }
}

// Client Supabase leggero (senza dipendenza npm)
async function sbFetch(path, opts) {
  const o = opts || {};
  const headers = Object.assign({
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Prefer": "return=representation",
  }, o.headers || {});
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({}, o, { headers }));
  const text = await res.text();
  const data = text ? JSON.parse(text) : [];
  if (!res.ok) {
    const msg = (data && data.message) || (data && data.error) || ("HTTP " + res.status);
    throw new Error(msg);
  }
  return data;
}

const db = {
  select: function(table) { return sbFetch(table + "?select=*&order=created_at.desc"); },
  insert: function(table, body) { return sbFetch(table, { method: "POST", body: JSON.stringify(body) }); },
  update: function(table, body, id) { return sbFetch(table + "?id=eq." + id, { method: "PATCH", body: JSON.stringify(body) }); },
  remove: function(table, id) { return sbFetch(table + "?id=eq." + id, { method: "DELETE" }); },
};

// ─── EXCEL IMPORT / EXPORT ───────────────────────────────────────────────────
const IMMOBILI_COLS = [
  {key:"titolo",label:"Titolo"},{key:"tipo",label:"Tipo"},{key:"contratto",label:"Contratto"},
  {key:"stato",label:"Stato"},{key:"comune",label:"Comune"},{key:"indirizzo",label:"Indirizzo"},
  {key:"prezzo",label:"Prezzo"},{key:"mq",label:"Mq netti"},{key:"mq_commerciali",label:"Mq commerciali"},
  {key:"locali",label:"Locali"},{key:"bagni",label:"Bagni"},{key:"piano",label:"Piano"},
  {key:"ascensore",label:"Ascensore"},{key:"garage",label:"Garage"},
  {key:"posti_coperti",label:"Posti coperti"},{key:"posti_scoperti",label:"Posti scoperti"},
  {key:"proprietario_label",label:"Proprietario"},{key:"proprietario_telefono",label:"Tel proprietario"},
  {key:"proprietario_email",label:"Email proprietario"},{key:"note_interne",label:"Note"},
  {key:"agente",label:"Agente"},{key:"lat",label:"Lat"},{key:"lng",label:"Lng"},
];

const RICHIESTE_COLS = [
  {key:"cliente_label",label:"Cliente"},{key:"telefono",label:"Telefono"},{key:"email",label:"Email"},
  {key:"contratto",label:"Contratto"},{key:"tipo",label:"Tipo"},{key:"stato",label:"Stato"},
  {key:"budget_min",label:"Budget min"},{key:"budget_max",label:"Budget max"},
  {key:"mq_min",label:"Mq min"},{key:"locali_min",label:"Locali min"},
  {key:"zone",label:"Zone"},{key:"note",label:"Note"},{key:"agente",label:"Agente"},{key:"data_richiesta",label:"Data richiesta"},
];

function exportXLSX(rows, cols, filename) {
  const data = rows.map(r => {
    const obj = {};
    cols.forEach(c => {
      const v = r[c.key];
      obj[c.label] = Array.isArray(v) ? v.join("; ") : (v ?? "");
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map(c => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dati");
  XLSX.writeFile(wb, filename);
}

function parseXLSX(file, cols) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const labelToKey = Object.fromEntries(cols.map(c => [c.label, c.key]));
        const mapped = rows.map(row => {
          const obj = {};
          Object.entries(row).forEach(([h, v]) => {
            const k = labelToKey[h.trim()];
            if (k) obj[k] = v === null || v === undefined ? "" : String(v);
          });
          return obj;
        }).filter(obj => Object.values(obj).some(v => v !== ""));
        resolve(mapped);
      } catch(e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsArrayBuffer(file);
  });
}

function csvRowToImmobile(r) {
  const bool = v => v === "true" || v === "Sì" || v === "1";
  const num  = v => v !== "" && v != null ? Number(v) : null;
  return {
    titolo: r.titolo || "", tipo: r.tipo || "appartamento",
    contratto: r.contratto || "vendita", stato: r.stato || "disponibile",
    comune: r.comune || "", indirizzo: r.indirizzo || "",
    prezzo: Number(r.prezzo) || 0,
    mq: Number(r.mq) || 0, mq_commerciali: num(r.mq_commerciali),
    locali: num(r.locali), bagni: num(r.bagni),
    piano: r.piano || null, ascensore: bool(r.ascensore),
    garage: num(r.garage), posti_coperti: num(r.posti_coperti), posti_scoperti: num(r.posti_scoperti),
    proprietario_label: r.proprietario_label || null,
    proprietario_telefono: r.proprietario_telefono || null,
    proprietario_email: r.proprietario_email || null,
    note_interne: r.note_interne || null,
    agente: r.agente || null,
    lat: num(r.lat), lng: num(r.lng),
  };
}

function excelDateToISO(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const n = Number(v);
  if (!isNaN(n) && n > 0) return new Date((n - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  return null;
}

function csvRowToRichiesta(r) {
  const num = v => v !== "" && v != null ? Number(v) : null;
  return {
    cliente_label: r.cliente_label || "", telefono: r.telefono || null,
    email: r.email || null, contratto: r.contratto || "vendita",
    tipo: r.tipo || null, stato: r.stato || "nuovo_contatto",
    budget_min: Number(r.budget_min) || 0, budget_max: Number(r.budget_max) || 0,
    mq_min: num(r.mq_min), locali_min: num(r.locali_min),
    zone: r.zone ? r.zone.split(";").map(z => z.trim()).filter(Boolean) : [],
    note: r.note || null,
    agente: r.agente || null,
    data_richiesta: excelDateToISO(r.data_richiesta),
  };
}

// ─── HOOKS ROBOTO + LEAFLET ───────────────────────────────────────────────────
function useRoboto() {
  useEffect(() => {
    if (document.getElementById("roboto-font")) return;
    const l = document.createElement("link");
    l.id = "roboto-font"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap";
    document.head.appendChild(l);
  }, []);
}
function useLeaflet(cb) {
  useEffect(() => {
    if (window.L) { cb(window.L); return; }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => cb(window.L);
    document.head.appendChild(s);
  }, []);
}

// ─── COSTANTI UI ─────────────────────────────────────────────────────────────
const STATO_C = {
  disponibile:    { bg:"#0d3320", text:"#4ade80", pin:"#4ade80", label:"Disponibile" },
  trattativa:     { bg:"#3b2500", text:"#fb923c", pin:"#fb923c", label:"Trattativa" },
  venduto:        { bg:"#3b1515", text:"#f87171", pin:"#f87171", label:"Venduto/Affittato" },
  ritirato:       { bg:"#1e2535", text:"#94a3b8", pin:"#94a3b8", label:"Ritirato" },
  collaborazione: { bg:"#1e1a47", text:"#a78bfa", pin:"#a78bfa", label:"Collaborazione" },
  scovato:        { bg:"#1a2e1a", text:"#86efac", pin:"#86efac", label:"Scovato" },
};
const RICH_C = {
  nuovo_contatto: { bg:"#1e3a5f", text:"#93c5fd", label:"Nuovo contatto" },
  in_valutazione: { bg:"#3b2f00", text:"#fde047", label:"In valutazione" },
  proposta_fatta: { bg:"#3b1f0a", text:"#fb923c", label:"Proposta fatta" },
  chiuso:         { bg:"#3b1515", text:"#f87171", label:"Chiuso" },
};
const TIPO_ICON = { appartamento:"🏢", villa:"🏡", bifamiliare:"🏘️", trifamiliare:"🏘️", schiera:"🏠", ufficio:"🏛️", negozio:"🏪", capannone:"🏗️", terreno:"🌿", altro:"📦" };
const inp = { width:"100%", background:"#1e293b", border:"1px solid #334155", borderRadius:8, padding:"9px 12px", color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box" };
const sel = { ...inp, cursor:"pointer" };

// ─── COMPONENTI BASE ──────────────────────────────────────────────────────────
const Badge = ({ stato, map }) => {
  const c = map[stato] || { bg:"#1e293b", text:"#94a3b8", label:stato };
  return <span style={{ background:c.bg, color:c.text, padding:"3px 10px", borderRadius:999, fontSize:11, fontWeight:700 }}>{c.label}</span>;
};
const ScoreBar = ({ score }) => {
  const col = score>=80?"#4ade80":score>=50?"#fbbf24":"#f87171";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:6, background:"#0a1628", borderRadius:999 }}>
        <div style={{ width:`${score}%`, height:"100%", background:col, borderRadius:999, transition:"width .5s" }} />
      </div>
      <span style={{ color:col, fontWeight:700, fontSize:13, minWidth:36 }}>{score}%</span>
    </div>
  );
};
const Field = ({ label, children }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:"block", color:"#94a3b8", fontSize:11, textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:5 }}>{label}</label>
    {children}
  </div>
);
const Modal = ({ title, onClose, children, maxWidth=560 }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
    <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:16, width:"100%", maxWidth, maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ color:"#f1f5f9", fontSize:18, margin:0 }}>{title}</h2>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:22, cursor:"pointer" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

// ─── MODAL DETTAGLIO IMMOBILE ─────────────────────────────────────────────────
function ModalDettaglioImm({ imm, onClose, onEdit, onDelete, onMatch }) {
  const pf = Number(imm.prezzo).toLocaleString("it-IT");
  return (
    <Modal title="" onClose={onClose} maxWidth={660}>
      <div style={{marginTop:-8,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}>
          <div style={{fontSize:21,fontWeight:900,color:"#f1f5f9",lineHeight:1.2}}>{TIPO_ICON[imm.tipo]} {imm.titolo}</div>
          <Badge stato={imm.stato} map={STATO_C}/>
        </div>
        <div style={{fontSize:13,color:"#64748b"}}>📍 {imm.indirizzo}, {imm.comune}</div>
      </div>

      <div style={{background:"#162032",borderRadius:12,padding:"16px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:4}}>
            {imm.contratto==="affitto"?"Canone mensile":"Prezzo di vendita"}
          </div>
          <div style={{fontSize:30,fontWeight:900,color:imm.contratto==="affitto"?"#c084fc":"#60a5fa"}}>
            € {pf}{imm.contratto==="affitto"&&<span style={{fontSize:16,fontWeight:400,color:"#94a3b8"}}>/mese</span>}
          </div>
        </div>
        <span style={{background:imm.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:imm.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"7px 18px",borderRadius:999,fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
          {imm.contratto.toUpperCase()}
        </span>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:10,marginBottom:16}}>
        {[
          ["📐","Mq netti int.",imm.mq ? imm.mq+" mq" : "—"],
          ...(imm.mq_commerciali ? [["📏","Mq commerciali",imm.mq_commerciali+" mq"]] : []),
          ["🚪","Locali",imm.locali||"—"],
          ["🛁","Bagni",imm.bagni||"—"],
        ].map(([ic,label,val])=>(
          <div key={label} style={{background:"#162032",borderRadius:10,padding:"14px 10px",textAlign:"center",border:"1px solid #1e3a5f"}}>
            <div style={{fontSize:22,marginBottom:6}}>{ic}</div>
            <div style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:4}}>{label}</div>
            <div style={{fontSize:17,fontWeight:700,color:"#e2e8f0"}}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{background:"#162032",borderRadius:10,padding:"14px 16px",marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Tipo immobile</div>
            <div style={{color:"#e2e8f0",fontWeight:600}}>{TIPO_ICON[imm.tipo]} {imm.tipo}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Comune</div>
            <div style={{color:"#e2e8f0",fontWeight:600}}>📍 {imm.comune}</div>
          </div>
          {imm.indirizzo && (
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Indirizzo</div>
              <div style={{color:"#e2e8f0"}}>{imm.indirizzo}</div>
            </div>
          )}
          {imm.proprietario_label && (
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Proprietario</div>
              <div style={{color:"#e2e8f0",fontWeight:600}}>👤 {imm.proprietario_label}</div>
            </div>
          )}
          {(imm.proprietario_telefono || imm.proprietario_email) && (
            <div style={{gridColumn:"1/-1",display:"flex",gap:16,flexWrap:"wrap"}}>
              {imm.proprietario_telefono && (
                <div>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Tel. proprietario</div>
                  <div style={{color:"#e2e8f0"}}>📞 {imm.proprietario_telefono}</div>
                </div>
              )}
              {imm.proprietario_email && (
                <div>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Email proprietario</div>
                  <div style={{color:"#e2e8f0"}}>✉️ {imm.proprietario_email}</div>
                </div>
              )}
            </div>
          )}
          {(imm.piano != null && imm.piano !== "") && (
            <div>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Piano</div>
              <div style={{color:"#e2e8f0",fontWeight:600}}>🏢 {imm.piano}</div>
            </div>
          )}
          <div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Ascensore</div>
            <div style={{color:imm.ascensore?"#4ade80":"#f87171",fontWeight:600}}>{imm.ascensore?"✓ Sì":"✗ No"}</div>
          </div>
          {(Number(imm.garage)>0 || Number(imm.posti_coperti)>0 || Number(imm.posti_scoperti)>0) && (
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Parcheggio</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {Number(imm.garage)>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🏠 Garage: {imm.garage}</span>}
                {Number(imm.posti_coperti)>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🚗 Coperti: {imm.posti_coperti}</span>}
                {Number(imm.posti_scoperti)>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🅿️ Scoperti: {imm.posti_scoperti}</span>}
              </div>
            </div>
          )}
          {imm.lat && imm.lng && (
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>Coordinate GPS</div>
              <div style={{color:"#475569",fontSize:12,fontFamily:"monospace"}}>lat {imm.lat} · lng {imm.lng}</div>
            </div>
          )}
        </div>
      </div>

      {imm.note_interne && (
        <div style={{background:"#162032",borderRadius:10,padding:"13px 16px",marginBottom:16,border:"1px solid #1e3a5f"}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>Note interne</div>
          <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.6}}>📝 {imm.note_interne}</div>
        </div>
      )}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:14,borderTop:"1px solid #1e293b",marginTop:4}}>
        {onDelete && <button onClick={onDelete} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #4b1818",background:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>🗑 Elimina</button>}
        <div style={{flex:1}}/>
        {onMatch && <button onClick={onMatch} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#92400e",color:"#fcd34d",fontWeight:700,cursor:"pointer",fontSize:13}}>🔀 Match</button>}
        {onEdit && <button onClick={onEdit} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>✏️ Modifica</button>}
      </div>
    </Modal>
  );
}

// ─── MODAL DETTAGLIO RICHIESTA ────────────────────────────────────────────────
function ModalDettaglioRich({ rich, onClose, onEdit, onDelete, onMatch }) {
  return (
    <Modal title="" onClose={onClose} maxWidth={660}>
      <div style={{marginTop:-8,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}>
          <div style={{fontSize:21,fontWeight:900,color:"#f1f5f9"}}>👤 {rich.cliente_label}</div>
          <Badge stato={rich.stato} map={RICH_C}/>
        </div>
        <div style={{display:"flex",gap:16,fontSize:13,color:"#64748b",flexWrap:"wrap"}}>
          {rich.telefono && <span>📞 {rich.telefono}</span>}
          {rich.email && <span>✉️ {rich.email}</span>}
          {rich.data_richiesta && <span>📅 {new Date(rich.data_richiesta).toLocaleDateString("it-IT")}</span>}
        </div>
      </div>

      <div style={{background:"#162032",borderRadius:12,padding:"14px 18px",marginBottom:16,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{background:rich.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:rich.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"6px 16px",borderRadius:999,fontSize:13,fontWeight:700}}>
          {rich.contratto.toUpperCase()}
        </span>
        {rich.tipo && (
          <span style={{background:"#1e2a1e",color:"#4ade80",padding:"6px 16px",borderRadius:999,fontSize:13,fontWeight:700}}>
            {TIPO_ICON[rich.tipo]} {rich.tipo}
          </span>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Budget min</div>
          <div style={{fontSize:20,fontWeight:700,color:"#fbbf24"}}>€ {Number(rich.budget_min||0).toLocaleString("it-IT")}</div>
        </div>
        <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Budget max</div>
          <div style={{fontSize:20,fontWeight:700,color:"#fbbf24"}}>€ {Number(rich.budget_max||0).toLocaleString("it-IT")}</div>
        </div>
      </div>

      {(rich.mq_min>0 || rich.mq_commerciali_min>0 || rich.locali_min>0 || rich.bagni_min>0) && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginBottom:16}}>
          {rich.mq_min>0 && (
            <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center",border:"1px solid #1e3a5f"}}>
              <div style={{fontSize:22,marginBottom:6}}>📐</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Mq netti min</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{rich.mq_min} mq</div>
            </div>
          )}
          {rich.mq_commerciali_min>0 && (
            <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center",border:"1px solid #1e3a5f"}}>
              <div style={{fontSize:22,marginBottom:6}}>📏</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Mq comm. min</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{rich.mq_commerciali_min} mq</div>
            </div>
          )}
          {rich.locali_min>0 && (
            <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center",border:"1px solid #1e3a5f"}}>
              <div style={{fontSize:22,marginBottom:6}}>🚪</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Locali min</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{rich.locali_min}</div>
            </div>
          )}
          {rich.bagni_min>0 && (
            <div style={{background:"#162032",borderRadius:10,padding:"14px",textAlign:"center",border:"1px solid #1e3a5f"}}>
              <div style={{fontSize:22,marginBottom:6}}>🛁</div>
              <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>Bagni min</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{rich.bagni_min}</div>
            </div>
          )}
        </div>
      )}

      {(rich.ascensore != null || rich.garage_min>0 || rich.posti_coperti_min>0 || rich.posti_scoperti_min>0) && (
        <div style={{background:"#162032",borderRadius:10,padding:"13px 16px",marginBottom:16}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Requisiti aggiuntivi</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {rich.ascensore != null && (
              <span style={{background:"#1e293b",border:"1px solid #334155",color:rich.ascensore?"#4ade80":"#f87171",padding:"4px 12px",borderRadius:999,fontSize:12}}>
                {rich.ascensore?"✓ Ascensore richiesto":"✗ Ascensore non richiesto"}
              </span>
            )}
            {rich.garage_min>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🏠 Garage min: {rich.garage_min}</span>}
            {rich.posti_coperti_min>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🚗 Coperti min: {rich.posti_coperti_min}</span>}
            {rich.posti_scoperti_min>0 && <span style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"4px 12px",borderRadius:999,fontSize:12}}>🅿️ Scoperti min: {rich.posti_scoperti_min}</span>}
          </div>
        </div>
      )}

      {rich.zone?.length>0 && (
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:8}}>Zone preferite</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {rich.zone.map(z=>(
              <span key={z} style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"5px 12px",borderRadius:999,fontSize:12}}>📍 {z}</span>
            ))}
          </div>
        </div>
      )}

      {rich.note && (
        <div style={{background:"#162032",borderRadius:10,padding:"13px 16px",marginBottom:16,border:"1px solid #1e3a5f"}}>
          <div style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6}}>Note</div>
          <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.6}}>📝 {rich.note}</div>
        </div>
      )}

      <div style={{display:"flex",gap:10,justifyContent:"flex-end",paddingTop:14,borderTop:"1px solid #1e293b",marginTop:4}}>
        {onDelete && <button onClick={onDelete} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #4b1818",background:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>🗑 Elimina</button>}
        <div style={{flex:1}}/>
        {onMatch && <button onClick={onMatch} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#92400e",color:"#fcd34d",fontWeight:700,cursor:"pointer",fontSize:13}}>🔀 Match</button>}
        {onEdit && <button onClick={onEdit} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>✏️ Modifica</button>}
      </div>
    </Modal>
  );
}

// Spinner di caricamento
const Spinner = ({ testo = "Caricamento…" }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 0", gap:16 }}>
    <div style={{ width:36, height:36, border:"3px solid #1e293b", borderTop:"3px solid #60a5fa", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
    <span style={{ color:"#64748b", fontSize:13 }}>{testo}</span>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

// Messaggio di errore
const Errore = ({ msg, onRetry }) => (
  <div style={{ background:"#3b1515", border:"1px solid #7f1d1d", borderRadius:10, padding:"16px 20px", color:"#f87171", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
    <span>⚠️ {msg}</span>
    {onRetry && <button onClick={onRetry} style={{ background:"#7f1d1d", border:"none", color:"#fca5a5", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:12 }}>Riprova</button>}
  </div>
);

// ─── MAPPA LEAFLET ────────────────────────────────────────────────────────────
function MappaImmobili({ immobili, h = 520, onSelect }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const mksRef = useRef([]);

  useEffect(() => {
    if (document.getElementById("lp-style")) return;
    const s = document.createElement("style");
    s.id = "lp-style";
    s.textContent = `.lp .leaflet-popup-content-wrapper{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:0;box-shadow:0 8px 32px rgba(0,0,0,.6)}.lp .leaflet-popup-content{margin:0}.lp .leaflet-popup-tip{background:#1e293b}`;
    document.head.appendChild(s);
  }, []);

  useLeaflet((L) => {
    if (!divRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(divRef.current, { zoomControl:true }).setView([45.683, 12.25], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"© OpenStreetMap", maxZoom:19 }).addTo(mapRef.current);
    }
    mksRef.current.forEach(m => m.remove());
    mksRef.current = [];

    const conCoord = immobili.filter(i => i.lat && i.lng);
    conCoord.forEach(imm => {
      const col = STATO_C[imm.stato]?.pin || "#60a5fa";
      const icon = L.divIcon({
        className:"",
        html:`<div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center">
          <div style="position:absolute;inset:0;background:${col}30;border-radius:50%;animation:pr 2s ease-out infinite"></div>
          <div style="position:relative;width:30px;height:30px;background:#0f172a;border:2.5px solid ${col};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.5)">${TIPO_ICON[imm.tipo]||"📍"}</div>
        </div><style>@keyframes pr{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.8);opacity:0}}</style>`,
        iconSize:[38,38], iconAnchor:[19,19], popupAnchor:[0,-22],
      });
      const pf = Number(imm.prezzo).toLocaleString("it-IT");
      const popup = L.popup({ className:"lp", maxWidth:260 }).setContent(
        `<div style="font-family:'Roboto',sans-serif;min-width:220px">
          <div style="background:#162032;padding:10px 14px;border-bottom:1px solid #334155;border-radius:12px 12px 0 0">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:2px">${TIPO_ICON[imm.tipo]||""} ${imm.titolo}</div>
            <div style="font-size:11px;color:#64748b">📍 ${imm.indirizzo}, ${imm.comune}</div>
          </div>
          <div style="padding:10px 14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center">
              <span style="font-size:16px;font-weight:800;color:${imm.contratto==="affitto"?"#c084fc":"#60a5fa"}">€ ${pf}${imm.contratto==="affitto"?"/mese":""}</span>
              <span style="background:${col}22;color:${col};padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">${STATO_C[imm.stato]?.label||imm.stato}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:12px;color:#94a3b8">
              <span>📐 ${imm.mq} mq</span><span>🚪 ${imm.locali||"—"} loc.</span><span>🛁 ${imm.bagni||"—"}</span>
            </div>
            ${imm.note_interne?`<div style="margin-top:8px;font-size:11px;color:#475569;background:#162032;border-radius:6px;padding:5px 8px">📝 ${imm.note_interne}</div>`:""}
          </div>
        </div>`
      );
      const mk = L.marker([imm.lat, imm.lng], { icon });
      if (onSelect) {
        mk.on('click', () => onSelect(imm));
      } else {
        mk.bindPopup(popup);
      }
      mk.addTo(mapRef.current);
      mksRef.current.push(mk);
    });

    if (conCoord.length > 0) {
      mapRef.current.fitBounds(L.latLngBounds(conCoord.map(i => [i.lat, i.lng])), { padding:[50,50], maxZoom:15 });
    }
    setTimeout(() => mapRef.current?.invalidateSize(), 120);
  });

  return (
    <div style={{ borderRadius:12, overflow:"hidden", border:"1px solid #334155" }}>
      <div ref={divRef} style={{ height:h, width:"100%" }} />
      {immobili.filter(i => !i.lat || !i.lng).length > 0 && (
        <div style={{ padding:"8px 14px", background:"#1e293b", fontSize:11, color:"#64748b" }}>
          ⚠️ {immobili.filter(i => !i.lat || !i.lng).length} immobili senza coordinate — aggiungi lat/lng per vederli sulla mappa
        </div>
      )}
    </div>
  );
}

const Legenda = () => (
  <div style={{ display:"flex", gap:14, flexWrap:"wrap", padding:"10px 14px", background:"#1e293b", borderRadius:10, border:"1px solid #334155", marginBottom:14, alignItems:"center" }}>
    {Object.entries(STATO_C).map(([k,v]) => (
      <div key={k} style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:v.pin }} />
        <span style={{ fontSize:12, color:"#94a3b8" }}>{v.label}</span>
      </div>
    ))}
    <span style={{ fontSize:11, color:"#475569", marginLeft:"auto" }}>Clicca un pin per i dettagli</span>
  </div>
);

// ─── MAP PICKER ──────────────────────────────────────────────────────────────
function MapPicker({ lat, lng, onChange }) {
  const divRef = useRef(null);
  const stateRef = useRef({ map: null, marker: null, cb: onChange, lat, lng });
  stateRef.current.cb  = onChange;
  stateRef.current.lat = lat;
  stateRef.current.lng = lng;

  const placeMarker = (L, map, newLat, newLng) => {
    const st = stateRef.current;
    const pos = [Number(newLat), Number(newLng)];
    if (st.marker) {
      st.marker.setLatLng(pos);
    } else {
      st.marker = L.marker(pos, { draggable: true }).addTo(map);
      st.marker.on("dragend", (e) => {
        const p = e.target.getLatLng();
        stateRef.current.cb(p.lat.toFixed(6), p.lng.toFixed(6));
      });
    }
  };

  useEffect(() => {
    // Garantisce CSS Leaflet
    if (!document.getElementById("lf-css")) {
      const lnk = document.createElement("link");
      lnk.id = "lf-css"; lnk.rel = "stylesheet";
      lnk.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(lnk);
    }

    const boot = (L) => {
      if (!divRef.current || stateRef.current.map) return;

      // Fix icone default Leaflet in ambienti bundled
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      const { lat: la, lng: ln } = stateRef.current;
      const center = (la && ln) ? [Number(la), Number(ln)] : [45.65, 12.0];
      const zoom   = (la && ln) ? 15 : 9;

      const map = L.map(divRef.current, { zoomControl: true }).setView(center, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      stateRef.current.map = map;

      if (la && ln) placeMarker(L, map, la, ln);

      map.on("click", (e) => {
        const newLat = e.latlng.lat.toFixed(6);
        const newLng = e.latlng.lng.toFixed(6);
        placeMarker(L, map, newLat, newLng);       // feedback immediato
        stateRef.current.cb(newLat, newLng);
      });

      // Forza ridimensionamento dopo che il DOM è stabile
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { map.invalidateSize(); });
      });
    };

    if (window.L) {
      boot(window.L);
    } else if (!document.querySelector("script[src*='leaflet.min.js']")) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = () => boot(window.L);
      document.head.appendChild(s);
    } else {
      // Script già in caricamento: aspetta
      const wait = setInterval(() => {
        if (window.L) { clearInterval(wait); boot(window.L); }
      }, 50);
    }

    return () => {
      stateRef.current.map?.remove();
      stateRef.current.map = null;
      stateRef.current.marker = null;
    };
  }, []); // eslint-disable-line

  // Sincronizza il marker quando lat/lng cambiano dall'esterno (geocoding)
  useEffect(() => {
    const { map } = stateRef.current;
    const L = window.L;
    if (!map || !L) return;
    if (lat && lng) {
      placeMarker(L, map, lat, lng);
      map.setView([Number(lat), Number(lng)], Math.max(map.getZoom(), 15));
    } else if (stateRef.current.marker) {
      stateRef.current.marker.remove();
      stateRef.current.marker = null;
    }
  }, [lat, lng]); // eslint-disable-line

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #334155", marginTop: 4 }}>
      <div ref={divRef} style={{ height: 300, width: "100%" }} />
      <div style={{ padding: "7px 12px", background: "#162032", fontSize: 11, color: "#64748b" }}>
        🖱 Clicca per posizionare il pin · Trascina il pin per spostarlo con precisione
      </div>
    </div>
  );
}

// ─── FORM IMMOBILE ────────────────────────────────────────────────────────────
function FormImm({ data={}, onSave, onClose, saving }) {
  const [f,setF] = useState({
    titolo:"", tipo:"appartamento", contratto:"vendita", comune:"", indirizzo:"",
    mq:"", mq_commerciali:"", locali:"", bagni:"", prezzo:"", stato:"disponibile",
    piano:"", ascensore:false,
    garage:"", posti_coperti:"", posti_scoperti:"",
    proprietario_label:"", proprietario_telefono:"", proprietario_email:"",
    note_interne:"", lat:"", lng:"", agente:"",
    ...data
  });
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus,  setGeoStatus]  = useState(null);
  const [showMap,    setShowMap]    = useState(!!(data.lat && data.lng));

  const s = (k,v) => setF(p=>({...p,[k]:v}));

  const geocodifica = async () => {
    const q = [f.indirizzo, f.comune, "Italia"].filter(Boolean).join(", ");
    if (!q.trim()) return;
    setGeoLoading(true);
    setGeoStatus(null);
    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q),
        { headers: { "Accept-Language": "it-IT" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        setF(p => ({ ...p, lat: data[0].lat, lng: data[0].lon }));
        setGeoStatus({ ok: true, label: data[0].display_name });
      } else {
        setGeoStatus({ ok: false });
      }
    } catch(e) {
      setGeoStatus({ ok: false });
    } finally {
      setGeoLoading(false);
    }
  };

  const canGeo = !!(f.indirizzo || f.comune);

  return <>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <div style={{gridColumn:"1/-1"}}><Field label="Titolo"><input style={inp} value={f.titolo} onChange={e=>s("titolo",e.target.value)} placeholder="Es. Bilocale Centro Treviso"/></Field></div>
      <div style={{gridColumn:"1/-1"}}><Field label="Stato"><select style={sel} value={f.stato} onChange={e=>s("stato",e.target.value)}><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa in corso</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option><option value="collaborazione">Collaborazione</option><option value="scovato">Scovato</option></select></Field></div>
      <Field label="Tipo"><select style={sel} value={f.tipo} onChange={e=>s("tipo",e.target.value)}>
        {[["appartamento","Appartamento"],["villa","Villa"],["bifamiliare","Abitazione bifamiliare"],["trifamiliare","Abitazione trifamiliare"],["schiera","Abitazione a schiera"],["ufficio","Ufficio"],["negozio","Negozio"],["capannone","Capannone"],["terreno","Terreno"],["altro","Altro"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select></Field>
      <Field label="Contratto"><select style={sel} value={f.contratto} onChange={e=>s("contratto",e.target.value)}><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select></Field>
      <Field label="Comune"><input style={inp} value={f.comune} onChange={e=>{s("comune",e.target.value);setGeoStatus(null);}}/></Field>
      <Field label="Indirizzo"><input style={inp} value={f.indirizzo} onChange={e=>{s("indirizzo",e.target.value);setGeoStatus(null);}}/></Field>
      <Field label="Mq netti interni"><input style={inp} type="number" value={f.mq} onChange={e=>s("mq",e.target.value)}/></Field>
      <Field label="Mq commerciali"><input style={inp} type="number" value={f.mq_commerciali} onChange={e=>s("mq_commerciali",e.target.value)}/></Field>
      <Field label="Locali"><input style={inp} type="number" value={f.locali} onChange={e=>s("locali",e.target.value)}/></Field>
      <Field label="Bagni"><input style={inp} type="number" value={f.bagni} onChange={e=>s("bagni",e.target.value)}/></Field>
      <Field label={f.contratto==="affitto"?"Canone €/mese":"Prezzo €"}><input style={inp} type="number" value={f.prezzo} onChange={e=>s("prezzo",e.target.value)}/></Field>
      <Field label="Piano"><input style={inp} value={f.piano} onChange={e=>s("piano",e.target.value)} placeholder="Es. 2, PT, S1…"/></Field>
      <Field label="Ascensore">
        <div style={{display:"flex",gap:8}}>
          {[["Sì",true],["No",false]].map(([lbl,val])=>(
            <button key={lbl} type="button" onClick={()=>s("ascensore",val)}
              style={{flex:1,padding:"9px",borderRadius:8,border:`1px solid ${f.ascensore===val?"#2563eb":"#334155"}`,background:f.ascensore===val?"#1e3a5f":"none",color:f.ascensore===val?"#93c5fd":"#64748b",cursor:"pointer",fontWeight:f.ascensore===val?700:400,fontSize:13}}>
              {lbl}
            </button>
          ))}
        </div>
      </Field>
      <Field label="N° Garage"><input style={inp} type="number" min="0" value={f.garage} onChange={e=>s("garage",e.target.value)}/></Field>
      <Field label="N° Posti auto coperti"><input style={inp} type="number" min="0" value={f.posti_coperti} onChange={e=>s("posti_coperti",e.target.value)}/></Field>
      <Field label="N° Posti auto scoperti"><input style={inp} type="number" min="0" value={f.posti_scoperti} onChange={e=>s("posti_scoperti",e.target.value)}/></Field>

      {/* Posizione */}
      <div style={{gridColumn:"1/-1"}}>
        <Field label="Posizione sulla mappa">
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
            {/* Toggle mappa manuale */}
            <button type="button" onClick={()=>setShowMap(v=>!v)}
              style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${showMap?"#2563eb":"#334155"}`,background:showMap?"#1e3a5f":"none",color:showMap?"#93c5fd":"#64748b",fontWeight:showMap?700:400,cursor:"pointer",fontSize:13,transition:"all .2s"}}>
              🗺 {showMap ? "Nascondi mappa" : "Posiziona su mappa"}
            </button>
            {/* Geocoding rapido */}
            <button type="button" onClick={geocodifica} disabled={!canGeo||geoLoading}
              style={{padding:"8px 16px",borderRadius:8,border:"1px solid #334155",background:"none",color:canGeo?"#4ade80":"#475569",cursor:canGeo?"pointer":"default",fontSize:13,opacity:geoLoading?0.7:1}}>
              {geoLoading ? "⏳ Ricerca…" : "📍 Geocodifica indirizzo"}
            </button>
            {f.lat && f.lng && (
              <button type="button" onClick={()=>{setF(p=>({...p,lat:"",lng:""}));setGeoStatus(null);}}
                style={{padding:"8px 14px",borderRadius:8,border:"1px solid #4b1818",background:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>
                ✕ Rimuovi pin
              </button>
            )}
          </div>

          {geoStatus && (
            <div style={{marginBottom:8,fontSize:12,padding:"7px 12px",borderRadius:7,
              background:geoStatus.ok?"#0d3320":"#3b1515",
              color:geoStatus.ok?"#4ade80":"#f87171"}}>
              {geoStatus.ok
                ? `✓ ${geoStatus.label.length>90?geoStatus.label.slice(0,90)+"…":geoStatus.label}`
                : "✗ Indirizzo non trovato — usa la mappa per posizionare il pin manualmente"}
            </div>
          )}

          {showMap && (
            <MapPicker
              lat={f.lat} lng={f.lng}
              onChange={(lat,lng)=>{ setF(p=>({...p,lat,lng})); setGeoStatus(null); setShowMap(true); }}
            />
          )}

          {f.lat && f.lng && (
            <div style={{marginTop:6,fontSize:11,color:"#4ade80",fontFamily:"monospace"}}>
              ✓ lat {Number(f.lat).toFixed(6)} · lng {Number(f.lng).toFixed(6)}
            </div>
          )}
        </Field>
      </div>

      <div style={{gridColumn:"1/-1"}}><Field label="Proprietario"><input style={inp} value={f.proprietario_label} onChange={e=>s("proprietario_label",e.target.value)}/></Field></div>
      <Field label="Tel. proprietario"><input style={inp} type="tel" value={f.proprietario_telefono} onChange={e=>s("proprietario_telefono",e.target.value)} placeholder="+39 …"/></Field>
      <Field label="Email proprietario"><input style={inp} type="email" value={f.proprietario_email} onChange={e=>s("proprietario_email",e.target.value)}/></Field>
      <div style={{gridColumn:"1/-1"}}><Field label="Agente"><input style={inp} value={f.agente||""} onChange={e=>s("agente",e.target.value)} placeholder="Nome agente responsabile"/></Field></div>
      <div style={{gridColumn:"1/-1"}}><Field label="Note interne (opzionale)"><textarea style={{...inp,resize:"vertical",minHeight:70}} value={f.note_interne} onChange={e=>s("note_interne",e.target.value)}/></Field></div>
    </div>
    <div style={{display:"flex",gap:10,marginTop:8,justifyContent:"flex-end"}}>
      <button onClick={onClose} disabled={saving} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Annulla</button>
      <button onClick={()=>onSave(f)} disabled={saving} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontWeight:700,cursor:"pointer",opacity:saving?0.6:1}}>
        {saving?"Salvataggio…":"Salva"}
      </button>
    </div>
  </>;
}

// ─── FORM RICHIESTA ───────────────────────────────────────────────────────────
function FormRich({ data={}, onSave, onClose, saving }) {
  const [f,setF] = useState({
    cliente_label:"", telefono:"", email:"", contratto:"vendita", tipo:"",
    budget_min:"", budget_max:"", mq_min:"", mq_commerciali_min:"", locali_min:"", bagni_min:"",
    ascensore:null, garage_min:"", posti_coperti_min:"", posti_scoperti_min:"",
    zone:"", stato:"nuovo_contatto", note:"", data_richiesta:"", agente:"",
    ...data,
    zone: Array.isArray(data.zone) ? data.zone.join(", ") : (data.zone||"")
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const save = () => onSave({
    ...f,
    zone: f.zone.split(",").map(z=>z.trim()).filter(Boolean),
    budget_min: Number(f.budget_min)||0,
    budget_max: Number(f.budget_max)||0,
    mq_min:              Number(f.mq_min)||0,
    mq_commerciali_min:  Number(f.mq_commerciali_min)||null,
    locali_min:          Number(f.locali_min)||0,
    bagni_min:           Number(f.bagni_min)||null,
    ascensore:           f.ascensore,
    garage_min:          Number(f.garage_min)||null,
    posti_coperti_min:   Number(f.posti_coperti_min)||null,
    posti_scoperti_min:  Number(f.posti_scoperti_min)||null,
  });
  return <>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={{gridColumn:"1/-1"}}><Field label="Nome cliente"><input style={inp} value={f.cliente_label} onChange={e=>s("cliente_label",e.target.value)}/></Field></div>
      <div style={{gridColumn:"1/-1"}}><Field label="Stato"><select style={sel} value={f.stato} onChange={e=>s("stato",e.target.value)}><option value="nuovo_contatto">Nuovo contatto</option><option value="in_valutazione">In valutazione</option><option value="proposta_fatta">Proposta fatta</option><option value="chiuso">Chiuso</option></select></Field></div>
      <Field label="Telefono"><input style={inp} value={f.telefono} onChange={e=>s("telefono",e.target.value)}/></Field>
      <Field label="Email (opzionale)"><input style={inp} value={f.email} onChange={e=>s("email",e.target.value)}/></Field>
      <Field label="Contratto"><select style={sel} value={f.contratto} onChange={e=>s("contratto",e.target.value)}><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select></Field>
      <Field label="Tipo immobile"><select style={sel} value={f.tipo} onChange={e=>s("tipo",e.target.value)}>
        <option value="">Qualsiasi</option>
        {[["appartamento","Appartamento"],["villa","Villa"],["bifamiliare","Abitazione bifamiliare"],["trifamiliare","Abitazione trifamiliare"],["schiera","Abitazione a schiera"],["ufficio","Ufficio"],["negozio","Negozio"],["capannone","Capannone"],["terreno","Terreno"],["altro","Altro"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select></Field>
      <Field label="Budget min €"><input style={inp} type="number" value={f.budget_min} onChange={e=>s("budget_min",e.target.value)}/></Field>
      <Field label="Budget max €"><input style={inp} type="number" value={f.budget_max} onChange={e=>s("budget_max",e.target.value)}/></Field>
      <Field label="Mq netti interni min"><input style={inp} type="number" value={f.mq_min} onChange={e=>s("mq_min",e.target.value)}/></Field>
      <Field label="Mq commerciali min"><input style={inp} type="number" value={f.mq_commerciali_min} onChange={e=>s("mq_commerciali_min",e.target.value)}/></Field>
      <Field label="Locali min"><input style={inp} type="number" value={f.locali_min} onChange={e=>s("locali_min",e.target.value)}/></Field>
      <Field label="Bagni min"><input style={inp} type="number" value={f.bagni_min} onChange={e=>s("bagni_min",e.target.value)}/></Field>
      <Field label="Ascensore">
        <div style={{display:"flex",gap:8}}>
          {[["Indiff.",null],["Sì",true],["No",false]].map(([lbl,val])=>(
            <button key={lbl} type="button" onClick={()=>s("ascensore",val)}
              style={{flex:1,padding:"9px",borderRadius:8,border:`1px solid ${f.ascensore===val?"#7c3aed":"#334155"}`,background:f.ascensore===val?"#2e1a47":"none",color:f.ascensore===val?"#c084fc":"#64748b",cursor:"pointer",fontWeight:f.ascensore===val?700:400,fontSize:13}}>
              {lbl}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Garage min"><input style={inp} type="number" min="0" value={f.garage_min} onChange={e=>s("garage_min",e.target.value)}/></Field>
      <Field label="Posti coperti min"><input style={inp} type="number" min="0" value={f.posti_coperti_min} onChange={e=>s("posti_coperti_min",e.target.value)}/></Field>
      <Field label="Posti scoperti min"><input style={inp} type="number" min="0" value={f.posti_scoperti_min} onChange={e=>s("posti_scoperti_min",e.target.value)}/></Field>
      <Field label="Data richiesta"><input style={inp} type="date" value={f.data_richiesta||""} onChange={e=>s("data_richiesta",e.target.value)}/></Field>
      <Field label="Agente"><input style={inp} value={f.agente||""} onChange={e=>s("agente",e.target.value)} placeholder="Nome agente responsabile"/></Field>
      <div style={{gridColumn:"1/-1"}}><Field label="Zone preferite (virgola)"><input style={inp} value={f.zone} onChange={e=>s("zone",e.target.value)} placeholder="Es. Treviso, Villorba"/></Field></div>
      <div style={{gridColumn:"1/-1"}}><Field label="Note"><textarea style={{...inp,resize:"vertical",minHeight:70}} value={f.note} onChange={e=>s("note",e.target.value)}/></Field></div>
    </div>
    <div style={{display:"flex",gap:10,marginTop:8,justifyContent:"flex-end"}}>
      <button onClick={onClose} disabled={saving} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Annulla</button>
      <button onClick={save} disabled={saving} style={{padding:"9px 20px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,cursor:"pointer",opacity:saving?0.6:1}}>
        {saving?"Salvataggio…":"Salva"}
      </button>
    </div>
  </>;
}

// ─── SEZIONE IMMOBILI ─────────────────────────────────────────────────────────
function SezioneImmobili({ onMatch }) {
  const [immobili, setImmobili] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [errore,   setErrore]   = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState("");
  const [fStato,   setFStato]   = useState("tutti");
  const [fContr,   setFContr]   = useState("tutti");
  const [fAgente,  setFAgente]  = useState("tutti");
  const [vista,    setVista]    = useState("lista");
  const [modal,    setModal]    = useState(null);
  const [sortBy,   setSortBy]   = useState("");
  const [sortDir,  setSortDir]  = useState("asc");
  const [dettaglio, setDettaglio] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [importConflict, setImportConflict] = useState(null);
  const [selezione, setSelezione] = useState(new Set());
  const importRef = useRef(null);

  const toggleSel = (id, e) => { e.stopPropagation(); setSelezione(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const selTutti  = () => setSelezione(new Set(sorted.map(i => i.id)));
  const deselTutti = () => setSelezione(new Set());

  const carica = async () => {
    setLoading(true); setErrore(null);
    try {
      const data = await db.select("immobili");
      setImmobili(Array.isArray(data) ? data : []);
    } catch(e) { setErrore(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carica(); }, []);

  const agentiImm = [...new Set(immobili.map(i => i.agente).filter(Boolean))].sort();

  const filtered = immobili.filter(i => {
    const q = search.toLowerCase();
    const prop = (i.proprietario_label||"").toLowerCase();
    return (!q || i.titolo.toLowerCase().includes(q) || i.comune.toLowerCase().includes(q) || prop.includes(q))
      && (fStato==="tutti" || i.stato===fStato)
      && (fContr==="tutti" || i.contratto===fContr)
      && (fAgente==="tutti" || i.agente===fAgente);
  });

  const sorted = sortBy ? [...filtered].sort((a, b) => {
    let va, vb;
    if (sortBy === "prezzo")  { va = Number(a.prezzo)||0;  vb = Number(b.prezzo)||0; }
    if (sortBy === "mq")      { va = Number(a.mq)||0;      vb = Number(b.mq)||0; }
    if (sortBy === "locali")  { va = Number(a.locali)||0;  vb = Number(b.locali)||0; }
    if (sortBy === "comune")  { va = (a.comune||"").toLowerCase(); vb = (b.comune||"").toLowerCase(); }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  }) : filtered;

  const salva = async (f) => {
    setSaving(true);
    try {
      const payload = {
        titolo: f.titolo, tipo: f.tipo, contratto: f.contratto,
        comune: f.comune, indirizzo: f.indirizzo,
        mq: Number(f.mq)||0, mq_commerciali: Number(f.mq_commerciali)||null, locali: Number(f.locali)||null, bagni: Number(f.bagni)||null,
        prezzo: Number(f.prezzo)||0, stato: f.stato,
        proprietario_label: f.proprietario_label||null,
        proprietario_telefono: f.proprietario_telefono||null,
        proprietario_email: f.proprietario_email||null,
        piano: f.piano||null,
        ascensore: f.ascensore||false,
        garage: Number(f.garage)||null,
        posti_coperti: Number(f.posti_coperti)||null,
        posti_scoperti: Number(f.posti_scoperti)||null,
        note_interne: f.note_interne||null,
        agente: f.agente||null,
        lat: f.lat ? Number(f.lat) : null,
        lng: f.lng ? Number(f.lng) : null,
      };
      if (modal === "nuovo") {
        await db.insert("immobili", payload);
      } else {
        await db.update("immobili", payload, modal.id);
      }
      await carica();
      setModal(null);
    } catch(e) { setErrore(e.message); }
    finally { setSaving(false); }
  };

  const elimina = async (id) => {
    if (!confirm("Eliminare questo immobile?")) return;
    try {
      await db.remove("immobili", id);
      setImmobili(p => p.filter(i => i.id !== id));
    } catch(e) { setErrore(e.message); }
  };

  const eliminaSelezionati = async () => {
    if (!confirm(`Eliminare ${selezione.size} immobili selezionati?`)) return;
    try {
      await Promise.all([...selezione].map(id => db.remove("immobili", id)));
      setImmobili(p => p.filter(i => !selezione.has(i.id)));
      setSelezione(new Set());
    } catch(e) { setErrore(e.message); }
  };

  const handleExport = () => {
    const date = new Date().toISOString().slice(0,10);
    exportXLSX(immobili, IMMOBILI_COLS, `immobili_${date}.xlsx`);
  };

  const eseguiImportImm = async (rows) => {
    setImportConflict(null);
    setImporting(true); setImportMsg(null);
    let ok = 0, fail = 0, firstErr = null;
    for (const row of rows) {
      try { await db.insert("immobili", csvRowToImmobile(row)); ok++; }
      catch(err) { fail++; if (!firstErr) firstErr = err.message; }
    }
    await carica();
    setImporting(false);
    setImportMsg({ ok, fail, firstErr });
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true); setImportMsg(null); setImportConflict(null);
    try {
      const rows = await parseXLSX(file, IMMOBILI_COLS);
      if (!rows.length) throw new Error("Nessuna riga valida trovata nel file");
      const titoli = new Set(immobili.map(i => (i.titolo||"").toLowerCase()));
      const nuovi = rows.filter(r => !titoli.has((r.titolo||"").toLowerCase()));
      const duplicati = rows.filter(r => titoli.has((r.titolo||"").toLowerCase()));
      setImporting(false);
      if (duplicati.length > 0) {
        setImportConflict({ nuovi, duplicati, tutti: rows });
      } else {
        await eseguiImportImm(rows);
      }
    } catch(e) {
      setImportMsg({ error: e.message });
      setImporting(false);
    }
  };

  const btn = (active, label, onClick) => (
    <button onClick={onClick} style={{ padding:"8px 16px", border:"none", background:active?"#2563eb":"none", color:active?"#fff":"#64748b", fontWeight:active?700:400, cursor:"pointer", fontSize:13, transition:"all .2s" }}>{label}</button>
  );

  return (
    <div>
      {errore && <Errore msg={errore} onRetry={carica}/>}
      {importConflict && (
        <div style={{marginBottom:12,padding:"14px 16px",borderRadius:8,background:"#1e2a3a",border:"1px solid #2563eb",fontSize:13}}>
          <div style={{color:"#93c5fd",fontWeight:700,marginBottom:8}}>⚠️ Trovati {importConflict.duplicati.length} duplicati — {importConflict.nuovi.length} nuovi</div>
          <div style={{color:"#94a3b8",marginBottom:12,fontSize:12}}>{importConflict.duplicati.length} immobili nel file hanno lo stesso titolo di immobili già presenti. Cosa vuoi fare?</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>eseguiImportImm(importConflict.tutti)} style={{padding:"7px 14px",borderRadius:6,border:"none",background:"#2563eb",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>Importa tutti ({importConflict.tutti.length})</button>
            <button onClick={()=>eseguiImportImm(importConflict.nuovi)} disabled={!importConflict.nuovi.length} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:importConflict.nuovi.length?"#4ade80":"#475569",fontWeight:700,cursor:importConflict.nuovi.length?"pointer":"default",fontSize:12}}>Salta duplicati ({importConflict.nuovi.length} nuovi)</button>
            <button onClick={()=>setImportConflict(null)} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:12}}>Annulla</button>
          </div>
        </div>
      )}
      {importMsg && (
        <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,fontSize:13,
          background: importMsg.error ? "#3b1515" : "#0d3320",
          border: `1px solid ${importMsg.error ? "#7f1d1d" : "#166534"}`,
          color: importMsg.error ? "#f87171" : "#4ade80",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{importMsg.error ? `Errore: ${importMsg.error}` : `Importati ${importMsg.ok} immobili${importMsg.fail ? `, ${importMsg.fail} errori` : ""}${importMsg.firstErr ? ` — ${importMsg.firstErr}` : ""}`}</span>
          <button onClick={()=>setImportMsg(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>
        </div>
      )}
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImport}/>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Cerca immobile, comune, proprietario…" style={{...inp,flex:1,minWidth:200}}/>
        <select value={fContr} onChange={e=>setFContr(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti i contratti</option><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select>
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option><option value="collaborazione">Collaborazione</option><option value="scovato">Scovato</option></select>
        {agentiImm.length>0 && <select value={fAgente} onChange={e=>setFAgente(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli agenti</option>{agentiImm.map(a=><option key={a} value={a}>{a}</option>)}</select>}
        <div style={{display:"flex",gap:0,background:"#1e293b",border:"1px solid #334155",borderRadius:8,overflow:"hidden"}}>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...sel,border:"none",borderRadius:0,background:"transparent",paddingRight:8}}>
            <option value="">Ordina per…</option>
            <option value="prezzo">Prezzo</option>
            <option value="mq">Dimensione</option>
            <option value="locali">N° locali</option>
            <option value="comune">Comune</option>
          </select>
          {sortBy && (
            <button onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")} title={sortDir==="asc"?"Crescente":"Decrescente"}
              style={{padding:"0 10px",background:"none",border:"none",borderLeft:"1px solid #334155",color:"#94a3b8",cursor:"pointer",fontSize:14}}>
              {sortDir==="asc"?"↑":"↓"}
            </button>
          )}
        </div>
        <div style={{display:"flex",background:"#1e293b",border:"1px solid #334155",borderRadius:8,overflow:"hidden"}}>
          {btn(vista==="lista","☰ Lista",()=>setVista("lista"))}
          {btn(vista==="mappa","🗺 Mappa",()=>setVista("mappa"))}
        </div>
        <button onClick={handleExport} disabled={!immobili.length} title="Scarica tutti gli immobili come CSV" style={{padding:"9px 14px",borderRadius:8,border:"1px solid #334155",background:"none",color:"#94a3b8",fontWeight:600,cursor:immobili.length?"pointer":"default",opacity:immobili.length?1:0.4,whiteSpace:"nowrap",fontSize:13}}>↓ Esporta Excel</button>
        <button onClick={()=>importRef.current?.click()} disabled={importing} title="Importa immobili da CSV" style={{padding:"9px 14px",borderRadius:8,border:"1px solid #334155",background:"none",color:importing?"#475569":"#94a3b8",fontWeight:600,cursor:importing?"default":"pointer",whiteSpace:"nowrap",fontSize:13}}>{importing?"⏳ Importazione…":"↑ Importa Excel"}</button>
        <button onClick={()=>setModal("nuovo")} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#15803d",color:"#fff",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Nuovo immobile</button>
      </div>

      {loading ? <Spinner testo="Caricamento immobili…"/> : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{color:"#64748b",fontSize:12}}>{sorted.length} immobili trovati</span>
            {selezione.size > 0 && <>
              <span style={{fontSize:12,color:"#93c5fd",fontWeight:600}}>{selezione.size} selezionati</span>
              <button onClick={selTutti} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Seleziona tutti</button>
              <button onClick={deselTutti} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Deseleziona tutti</button>
              <button onClick={eliminaSelezionati} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #7f1d1d",background:"#3b1515",color:"#f87171",cursor:"pointer",fontWeight:700}}>🗑 Elimina selezionati ({selezione.size})</button>
            </>}
          </div>
          {vista==="lista" ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {sorted.map(imm=>{
                const sel = selezione.has(imm.id);
                return (
                <div key={imm.id} style={{background:"#1e293b",borderRadius:12,border:`1px solid ${sel?"#2563eb":"#334155"}`,overflow:"hidden",transition:"border-color .2s",cursor:"pointer"}}
                  onClick={()=>setDettaglio(imm)}
                  onMouseEnter={e=>{ if(!sel) e.currentTarget.style.borderColor="#4b6a8a"; }}
                  onMouseLeave={e=>{ if(!sel) e.currentTarget.style.borderColor="#334155"; }}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                      <div onClick={e=>toggleSel(imm.id,e)} style={{marginTop:3,width:18,height:18,borderRadius:4,border:`2px solid ${sel?"#2563eb":"#475569"}`,background:sel?"#2563eb":"transparent",flexShrink:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {sel && <span style={{color:"#fff",fontSize:12,lineHeight:1}}>✓</span>}
                      </div>
                      <div>
                        <div style={{fontSize:16,color:"#f1f5f9",fontWeight:700,marginBottom:4}}>{TIPO_ICON[imm.tipo]} {imm.titolo}</div>
                        <div style={{fontSize:12,color:"#64748b"}}>{imm.indirizzo}, {imm.comune}</div>
                      </div>
                    </div>
                    <Badge stato={imm.stato} map={STATO_C}/>
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                      {[["📐",imm.mq+" mq"],["🚪",(imm.locali||"—")+" locali"],["🛁",(imm.bagni||"—")+" bagni"]].map(([ic,v])=>(
                        <div key={v} style={{background:"#162032",borderRadius:8,padding:"7px 10px",textAlign:"center"}}>
                          <div style={{fontSize:14}}>{ic}</div>
                          <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div>
                        <span style={{fontSize:18,fontWeight:800,color:imm.contratto==="affitto"?"#c084fc":"#60a5fa"}}>€ {Number(imm.prezzo).toLocaleString("it-IT")}</span>
                        {imm.contratto==="affitto"&&<span style={{color:"#64748b",fontSize:12}}>/mese</span>}
                      </div>
                      <span style={{background:imm.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:imm.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>{imm.contratto.toUpperCase()}</span>
                    </div>
                    {imm.proprietario_label&&<div style={{fontSize:12,color:"#64748b",marginBottom:4}}>👤 {imm.proprietario_label}</div>}
                    {imm.agente&&<div style={{fontSize:12,color:"#64748b",marginBottom:10}}>🧑‍💼 {imm.agente}</div>}
                    {imm.note_interne&&<div style={{fontSize:11,color:"#475569",background:"#162032",borderRadius:6,padding:"6px 10px",marginBottom:10}}>📝 {imm.note_interne}</div>}
                    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                      <button onClick={(e)=>{e.stopPropagation();setModal(imm)}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>✏️ Modifica</button>
                      <button onClick={(e)=>{e.stopPropagation();elimina(imm.id)}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #4b1818",background:"none",color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑 Elimina</button>
                    </div>
                  </div>
                </div>
              );})}
            </div>
          ) : (
            <><Legenda/><MappaImmobili immobili={sorted} h={520} onSelect={setDettaglio}/></>
          )}
        </>
      )}
      {modal&&<Modal title={modal==="nuovo"?"Nuovo Immobile":"Modifica Immobile"} onClose={()=>setModal(null)}>
        <FormImm data={modal==="nuovo"?{}:modal} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>}
      {dettaglio&&<ModalDettaglioImm
        imm={dettaglio}
        onClose={()=>setDettaglio(null)}
        onEdit={()=>{ setDettaglio(null); setModal(dettaglio); }}
        onDelete={()=>{ elimina(dettaglio.id); setDettaglio(null); }}
        onMatch={onMatch ? ()=>{ setDettaglio(null); onMatch("immobile", dettaglio); } : undefined}
      />}
    </div>
  );
}

// ─── SEZIONE RICHIESTE ────────────────────────────────────────────────────────
function SezioneRichieste({ onMatch }) {
  const [richieste, setRichieste] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [errore,    setErrore]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState("");
  const [fStato,    setFStato]    = useState("tutti");
  const [fAgente,   setFAgente]   = useState("tutti");
  const [fDataDa,   setFDataDa]   = useState("");
  const [fDataA,    setFDataA]    = useState("");
  const [modal,     setModal]     = useState(null);
  const [dettaglio, setDettaglio] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  const [importConflict, setImportConflict] = useState(null);
  const [selezione, setSelezione] = useState(new Set());
  const importRef = useRef(null);

  const toggleSel = (id, e) => { e.stopPropagation(); setSelezione(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const selTutti   = () => setSelezione(new Set(filtered.map(r => r.id)));
  const deselTutti = () => setSelezione(new Set());

  const carica = async () => {
    setLoading(true); setErrore(null);
    try {
      const data = await db.select("richieste");
      setRichieste(Array.isArray(data) ? data : []);
    } catch(e) { setErrore(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carica(); }, []);

  const agentiRich = [...new Set(richieste.map(r => r.agente).filter(Boolean))].sort();

  const filtered = richieste.filter(r => {
    const q = search.toLowerCase();
    return (!q || (r.cliente_label||"").toLowerCase().includes(q) || (r.telefono||"").includes(q))
      && (fStato==="tutti" || r.stato===fStato)
      && (fAgente==="tutti" || r.agente===fAgente)
      && (!fDataDa || (r.data_richiesta && r.data_richiesta >= fDataDa))
      && (!fDataA  || (r.data_richiesta && r.data_richiesta <= fDataA));
  }).sort((a, b) => {
    if (!a.data_richiesta && !b.data_richiesta) return 0;
    if (!a.data_richiesta) return 1;
    if (!b.data_richiesta) return -1;
    return b.data_richiesta.localeCompare(a.data_richiesta);
  });

  const salva = async (f) => {
    setSaving(true);
    try {
      const payload = {
        cliente_label: f.cliente_label, telefono: f.telefono||null, email: f.email||null,
        contratto: f.contratto, tipo: f.tipo||null, stato: f.stato,
        budget_min: f.budget_min||0, budget_max: f.budget_max||0,
        mq_min: f.mq_min||null,
        locali_min: f.locali_min||null,
        zone: f.zone||[], note: f.note||null,
        agente: f.agente||null,
        ...(f.data_richiesta ? { data_richiesta: f.data_richiesta } : {}),
      };
      if (modal==="nuovo") await db.insert("richieste", payload);
      else await db.update("richieste", payload, modal.id);
      await carica();
      setModal(null);
    } catch(e) { setErrore(e.message); }
    finally { setSaving(false); }
  };

  const elimina = async (id) => {
    if (!confirm("Eliminare questa richiesta?")) return;
    try {
      await db.remove("richieste", id);
      setRichieste(p => p.filter(r => r.id !== id));
    } catch(e) { setErrore(e.message); }
  };

  const eliminaSelezionati = async () => {
    if (!confirm(`Eliminare ${selezione.size} richieste selezionate?`)) return;
    try {
      await Promise.all([...selezione].map(id => db.remove("richieste", id)));
      setRichieste(p => p.filter(r => !selezione.has(r.id)));
      setSelezione(new Set());
    } catch(e) { setErrore(e.message); }
  };

  const handleExport = () => {
    const date = new Date().toISOString().slice(0,10);
    exportXLSX(richieste, RICHIESTE_COLS, `richieste_${date}.xlsx`);
  };

  const eseguiImportRich = async (rows) => {
    setImportConflict(null);
    setImporting(true); setImportMsg(null);
    let ok = 0, fail = 0, firstErr = null;
    for (const row of rows) {
      try { await db.insert("richieste", csvRowToRichiesta(row)); ok++; }
      catch(err) { fail++; if (!firstErr) firstErr = err.message; }
    }
    await carica();
    setImporting(false);
    setImportMsg({ ok, fail, firstErr });
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true); setImportMsg(null); setImportConflict(null);
    try {
      const rows = await parseXLSX(file, RICHIESTE_COLS);
      if (!rows.length) throw new Error("Nessuna riga valida trovata nel file");
      const chiavi = new Set(richieste.map(r => `${(r.cliente_label||"").toLowerCase()}|${r.telefono||""}`));
      const nuovi = rows.filter(r => !chiavi.has(`${(r.cliente_label||"").toLowerCase()}|${r.telefono||""}`));
      const duplicati = rows.filter(r => chiavi.has(`${(r.cliente_label||"").toLowerCase()}|${r.telefono||""}`));
      setImporting(false);
      if (duplicati.length > 0) {
        setImportConflict({ nuovi, duplicati, tutti: rows });
      } else {
        await eseguiImportRich(rows);
      }
    } catch(e) {
      setImportMsg({ error: e.message });
      setImporting(false);
    }
  };

  return (
    <div>
      {errore && <Errore msg={errore} onRetry={carica}/>}
      {importConflict && (
        <div style={{marginBottom:12,padding:"14px 16px",borderRadius:8,background:"#1e2a3a",border:"1px solid #7c3aed",fontSize:13}}>
          <div style={{color:"#c4b5fd",fontWeight:700,marginBottom:8}}>⚠️ Trovati {importConflict.duplicati.length} duplicati — {importConflict.nuovi.length} nuovi</div>
          <div style={{color:"#94a3b8",marginBottom:12,fontSize:12}}>{importConflict.duplicati.length} richieste nel file hanno lo stesso cliente e telefono di richieste già presenti. Cosa vuoi fare?</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>eseguiImportRich(importConflict.tutti)} style={{padding:"7px 14px",borderRadius:6,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:12}}>Importa tutte ({importConflict.tutti.length})</button>
            <button onClick={()=>eseguiImportRich(importConflict.nuovi)} disabled={!importConflict.nuovi.length} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:importConflict.nuovi.length?"#4ade80":"#475569",fontWeight:700,cursor:importConflict.nuovi.length?"pointer":"default",fontSize:12}}>Salta duplicati ({importConflict.nuovi.length} nuove)</button>
            <button onClick={()=>setImportConflict(null)} style={{padding:"7px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer",fontSize:12}}>Annulla</button>
          </div>
        </div>
      )}
      {importMsg && (
        <div style={{marginBottom:12,padding:"10px 14px",borderRadius:8,fontSize:13,
          background: importMsg.error ? "#3b1515" : "#0d3320",
          border: `1px solid ${importMsg.error ? "#7f1d1d" : "#166534"}`,
          color: importMsg.error ? "#f87171" : "#4ade80",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>{importMsg.error ? `Errore: ${importMsg.error}` : `Importate ${importMsg.ok} richieste${importMsg.fail ? `, ${importMsg.fail} errori` : ""}${importMsg.firstErr ? ` — ${importMsg.firstErr}` : ""}`}</span>
          <button onClick={()=>setImportMsg(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>
        </div>
      )}
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleImport}/>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Cerca cliente o telefono…" style={{...inp,flex:1,minWidth:200}}/>
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="nuovo_contatto">Nuovo contatto</option><option value="in_valutazione">In valutazione</option><option value="proposta_fatta">Proposta fatta</option><option value="chiuso">Chiuso</option></select>
        {agentiRich.length>0 && <select value={fAgente} onChange={e=>setFAgente(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli agenti</option>{agentiRich.map(a=><option key={a} value={a}>{a}</option>)}</select>}
        <div style={{display:"flex",alignItems:"center",gap:6,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"0 10px",height:38}}>
          <span style={{fontSize:11,color:"#64748b",whiteSpace:"nowrap"}}>Dal</span>
          <input type="date" value={fDataDa} onChange={e=>setFDataDa(e.target.value)} style={{...inp,border:"none",padding:"4px",background:"transparent",width:130,fontSize:13}}/>
          <span style={{fontSize:11,color:"#64748b"}}>al</span>
          <input type="date" value={fDataA} onChange={e=>setFDataA(e.target.value)} style={{...inp,border:"none",padding:"4px",background:"transparent",width:130,fontSize:13}}/>
          {(fDataDa||fDataA)&&<button onClick={()=>{setFDataDa("");setFDataA("");}} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:14,padding:"0 2px"}} title="Azzera date">✕</button>}
        </div>
        <button onClick={handleExport} disabled={!richieste.length} title="Scarica tutte le richieste come CSV" style={{padding:"9px 14px",borderRadius:8,border:"1px solid #334155",background:"none",color:"#94a3b8",fontWeight:600,cursor:richieste.length?"pointer":"default",opacity:richieste.length?1:0.4,whiteSpace:"nowrap",fontSize:13}}>↓ Esporta Excel</button>
        <button onClick={()=>importRef.current?.click()} disabled={importing} title="Importa richieste da CSV" style={{padding:"9px 14px",borderRadius:8,border:"1px solid #334155",background:"none",color:importing?"#475569":"#94a3b8",fontWeight:600,cursor:importing?"default":"pointer",whiteSpace:"nowrap",fontSize:13}}>{importing?"⏳ Importazione…":"↑ Importa Excel"}</button>
        <button onClick={()=>setModal("nuovo")} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,cursor:"pointer"}}>+ Nuova richiesta</button>
      </div>
      {loading ? <Spinner testo="Caricamento richieste…"/> : (
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{color:"#64748b",fontSize:12}}>{filtered.length} richieste trovate</span>
            {selezione.size > 0 && <>
              <span style={{fontSize:12,color:"#93c5fd",fontWeight:600}}>{selezione.size} selezionate</span>
              <button onClick={selTutti} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Seleziona tutte</button>
              <button onClick={deselTutti} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",cursor:"pointer"}}>Deseleziona tutte</button>
              <button onClick={eliminaSelezionati} style={{fontSize:12,padding:"3px 10px",borderRadius:6,border:"1px solid #7f1d1d",background:"#3b1515",color:"#f87171",cursor:"pointer",fontWeight:700}}>🗑 Elimina selezionate ({selezione.size})</button>
            </>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {filtered.map(r=>{
              const sel = selezione.has(r.id);
              return (
              <div key={r.id} style={{background:"#1e293b",borderRadius:12,border:`1px solid ${sel?"#7c3aed":"#334155"}`,overflow:"hidden",cursor:"pointer"}}
                onClick={()=>setDettaglio(r)}
                onMouseEnter={e=>{ if(!sel) e.currentTarget.style.borderColor="#4b3a6a"; }}
                onMouseLeave={e=>{ if(!sel) e.currentTarget.style.borderColor="#334155"; }}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <div onClick={e=>toggleSel(r.id,e)} style={{marginTop:3,width:18,height:18,borderRadius:4,border:`2px solid ${sel?"#7c3aed":"#475569"}`,background:sel?"#7c3aed":"transparent",flexShrink:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {sel && <span style={{color:"#fff",fontSize:12,lineHeight:1}}>✓</span>}
                    </div>
                    <div>
                      <div style={{fontSize:16,color:"#f1f5f9",fontWeight:700,marginBottom:4}}>👤 {r.cliente_label}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>
                        📞 {r.telefono}{r.email&&` · ✉️ ${r.email}`}
                        {r.data_richiesta&&<span style={{marginLeft:8,color:"#475569"}}>· 📅 {new Date(r.data_richiesta).toLocaleDateString("it-IT")}</span>}
                      </div>
                    </div>
                  </div>
                  <Badge stato={r.stato} map={RICH_C}/>
                </div>
                <div style={{padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                    <span style={{background:r.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:r.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>{r.contratto.toUpperCase()}</span>
                    {r.tipo&&<span style={{background:"#1e2a1e",color:"#4ade80",padding:"3px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>{TIPO_ICON[r.tipo]} {r.tipo}</span>}
                  </div>
                  <div style={{background:"#162032",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <div><span style={{color:"#64748b",fontSize:11}}>Budget max</span><div style={{color:"#fbbf24",fontWeight:700}}>€ {Number(r.budget_max).toLocaleString("it-IT")}</div></div>
                      {r.mq_min>0&&<div><span style={{color:"#64748b",fontSize:11}}>Sup. min</span><div style={{color:"#e2e8f0",fontWeight:600}}>{r.mq_min} mq</div></div>}
                      {r.locali_min>0&&<div><span style={{color:"#64748b",fontSize:11}}>Locali min</span><div style={{color:"#e2e8f0",fontWeight:600}}>{r.locali_min}</div></div>}
                    </div>
                  </div>
                  {r.zone?.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{r.zone.map(z=><span key={z} style={{background:"#1e293b",border:"1px solid #334155",color:"#94a3b8",padding:"2px 8px",borderRadius:999,fontSize:11}}>📍 {z}</span>)}</div>}
                  {r.agente&&<div style={{fontSize:12,color:"#64748b",marginBottom:6}}>🧑‍💼 {r.agente}</div>}
                  {r.note&&<div style={{fontSize:11,color:"#475569",background:"#162032",borderRadius:6,padding:"6px 10px",marginBottom:10}}>📝 {r.note}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={(e)=>{e.stopPropagation();setModal(r)}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>✏️ Modifica</button>
                    <button onClick={(e)=>{e.stopPropagation();elimina(r.id)}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #4b1818",background:"none",color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑 Elimina</button>
                  </div>
                </div>
              </div>
            );})}
          </div>
        </>
      )}
      {modal&&<Modal title={modal==="nuovo"?"Nuova Richiesta":"Modifica Richiesta"} onClose={()=>setModal(null)}>
        <FormRich data={modal==="nuovo"?{}:modal} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>}
      {dettaglio&&<ModalDettaglioRich
        rich={dettaglio}
        onClose={()=>setDettaglio(null)}
        onEdit={()=>{ setDettaglio(null); setModal(dettaglio); }}
        onDelete={()=>{ elimina(dettaglio.id); setDettaglio(null); }}
        onMatch={onMatch ? ()=>{ setDettaglio(null); onMatch("richiesta", dettaglio); } : undefined}
      />}
    </div>
  );
}

// ─── SEZIONE MATCH ────────────────────────────────────────────────────────────
function calcolaScore(imm, rich) {
  if (imm.contratto !== rich.contratto) return 0;
  let s = 15;
  if (Number(imm.prezzo) <= Number(rich.budget_max) && Number(imm.prezzo) >= Number(rich.budget_min||0)) s += 25;
  else if (Number(imm.prezzo) <= Number(rich.budget_max) * 1.1) s += 10;
  if (!rich.tipo || rich.tipo === imm.tipo) s += 20;
  if (!rich.mq_min || Number(imm.mq) >= Number(rich.mq_min)) s += 13;
  if (!rich.locali_min || Number(imm.locali) >= Number(rich.locali_min)) s += 10;
  if (!rich.bagni_min || Number(imm.bagni) >= Number(rich.bagni_min)) s += 7;
  if (rich.ascensore == null || rich.ascensore === imm.ascensore) s += 5;
  if (!rich.garage_min || Number(imm.garage) >= Number(rich.garage_min)) s += 5;
  return Math.min(s, 100);
}

function SezioneMatch({ initial, onConsumeInitial }) {
  const [immobili,   setImmobili]   = useState([]);
  const [richieste,  setRichieste]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modo,       setModo]       = useState("richiesta"); // "richiesta" | "immobile"
  const [soglia,     setSoglia]     = useState(50);
  const [sortBy,     setSortBy]     = useState("score");     // "score" | "data" | "combined"
  const [filtroSel,  setFiltroSel]  = useState(null);
  const [dettaglioImm,  setDettaglioImm]  = useState(null);
  const [dettaglioRich, setDettaglioRich] = useState(null);

  useEffect(() => {
    Promise.all([db.select("immobili"), db.select("richieste")]).then(([imm, rich]) => {
      setImmobili(Array.isArray(imm) ? imm : []);
      setRichieste(Array.isArray(rich) ? rich : []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (initial && !loading) {
      setModo(initial.modo);
      setFiltroSel(initial.sel);
      onConsumeInitial?.();
    }
  }, [initial, loading]);

  const switchModo = (m) => { setModo(m); setFiltroSel(null); };

  const scoreChip = (score) => ({
    background: score>=80?"#0d3320":score>=60?"#3b2500":"#3b1515",
    color:      score>=80?"#4ade80":score>=60?"#fb923c":"#f87171",
    padding:"4px 12px", borderRadius:999, fontSize:13, fontWeight:800, whiteSpace:"nowrap",
  });

  if (loading) return <Spinner testo="Caricamento dati…"/>;

  const immDisponibili = immobili.filter(i => i.stato === "disponibile");
  const richAttive     = richieste.filter(r => r.stato !== "chiuso");

  // Genera tutte le coppie con score >= soglia
  let pairs = [];
  richAttive.forEach(r => {
    immDisponibili.forEach(i => {
      const score = calcolaScore(i, r);
      if (score >= soglia) pairs.push({ richiesta: r, immobile: i, score });
    });
  });

  // Filtra per entità selezionata (da navigazione dettaglio)
  if (filtroSel) {
    if (modo === "richiesta") pairs = pairs.filter(p => p.richiesta.id === filtroSel.id);
    else                      pairs = pairs.filter(p => p.immobile.id  === filtroSel.id);
  }

  // Ordina
  pairs.sort((a, b) => {
    const dateA = a.richiesta.data_richiesta || "";
    const dateB = b.richiesta.data_richiesta || "";
    if (sortBy === "score") return b.score - a.score;
    if (sortBy === "data") {
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    }
    // combined: prima per score, poi per data
    if (b.score !== a.score) return b.score - a.score;
    return dateB.localeCompare(dateA);
  });

  return (
    <div>
      {/* Barra controlli */}
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        {/* Score minimo */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"6px 14px"}}>
          <span style={{color:"#64748b",fontSize:12,whiteSpace:"nowrap"}}>Score min</span>
          <input type="range" min={0} max={100} value={soglia} onChange={e=>setSoglia(+e.target.value)} style={{width:90}}/>
          <span style={{color:"#fbbf24",fontWeight:700,fontSize:13,minWidth:34}}>{soglia}%</span>
        </div>

        {/* Ordinamento */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:"#64748b",fontSize:12,whiteSpace:"nowrap"}}>Ordina:</span>
          {[["score","% Match"],["data","📅 Data"],["combined","% + Data"]].map(([v,label])=>(
            <button key={v} onClick={()=>setSortBy(v)}
              style={{padding:"7px 14px",borderRadius:8,border:"1px solid #334155",background:sortBy===v?"#334155":"none",color:sortBy===v?"#f1f5f9":"#64748b",cursor:"pointer",fontSize:12,fontWeight:sortBy===v?700:400,transition:"all .2s"}}>
              {label}
            </button>
          ))}
        </div>

        <span style={{color:"#64748b",fontSize:12,marginLeft:"auto"}}>{pairs.length} match trovati</span>
      </div>

      {/* Chip filtro attivo */}
      {filtroSel && (
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"8px 14px",width:"fit-content"}}>
          <span style={{fontSize:12,color:"#94a3b8"}}>
            {modo==="richiesta" ? `👤 ${filtroSel.cliente_label}` : `🏠 ${filtroSel.titolo}`}
          </span>
          <button onClick={()=>setFiltroSel(null)}
            style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:12,padding:"0 4px"}}>
            ✕ Mostra tutti
          </button>
        </div>
      )}

      {/* Lista match */}
      {pairs.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"#475569"}}>
          <div style={{fontSize:48,marginBottom:12}}>😕</div>
          <div style={{fontSize:16,color:"#64748b"}}>Nessun match trovato con score ≥ {soglia}%</div>
          <div style={{fontSize:12,marginTop:4}}>Prova ad abbassare lo score minimo</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pairs.map(({ richiesta:r, immobile:i, score }) => (
            <div key={`${r.id}-${i.id}`} style={{background:"#1e293b",borderRadius:12,border:`1px solid ${score>=80?"#166534":score>=60?"#854d0e":"#334155"}`,overflow:"hidden"}}>
              {/* Header con score */}
              <div style={{padding:"10px 16px",background:"#162032",display:"flex",alignItems:"center",gap:10}}>
                <span style={scoreChip(score)}>{score>=80?"⭐ ":""}{score}%</span>
                <div style={{flex:1,margin:"0 8px"}}><ScoreBar score={score}/></div>
                <span style={{fontSize:12,color:r.data_richiesta?"#94a3b8":"#334155",whiteSpace:"nowrap"}}>
                  📅 {r.data_richiesta ? new Date(r.data_richiesta).toLocaleDateString("it-IT") : "Nessuna data"}
                </span>
              </div>
              {/* Corpo a due colonne */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr"}}>
                {/* Lato richiesta */}
                <div style={{padding:"12px 16px",display:"flex",flexDirection:"column"}}>
                  <div style={{fontSize:11,color:"#c084fc",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:6}}>📋 Richiesta</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:3}}>👤 {r.cliente_label}</div>
                  {r.telefono && <div style={{fontSize:12,color:"#64748b",marginBottom:2}}>📞 {r.telefono}</div>}
                  {r.data_richiesta && <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>📅 {new Date(r.data_richiesta).toLocaleDateString("it-IT")}</div>}
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"6px 0"}}>
                    <span style={{background:r.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:r.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700}}>{r.contratto.toUpperCase()}</span>
                    {r.tipo && <span style={{background:"#1e2a1e",color:"#4ade80",padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700}}>{r.tipo}</span>}
                  </div>
                  <div style={{fontSize:12,color:"#64748b"}}>
                    💰 max € {Number(r.budget_max).toLocaleString("it-IT")}
                    {r.mq_min>0 && ` · 📐 min ${r.mq_min}mq`}
                    {r.locali_min>0 && ` · 🚪 min ${r.locali_min}loc`}
                  </div>
                  {r.zone?.length>0 && <div style={{fontSize:11,color:"#475569",marginTop:4}}>📍 {r.zone.join(", ")}</div>}
                  <div style={{flex:1}}/>
                  <button onClick={()=>setDettaglioRich(r)}
                    style={{marginTop:10,padding:"6px 12px",borderRadius:7,border:"1px solid #7c3aed",background:"none",color:"#c084fc",fontSize:12,cursor:"pointer",fontWeight:600,alignSelf:"flex-start"}}>
                    👁 Dettagli richiesta
                  </button>
                </div>
                {/* Divisore */}
                <div style={{background:"#334155"}}/>
                {/* Lato immobile */}
                <div style={{padding:"12px 16px",display:"flex",flexDirection:"column"}}>
                  <div style={{fontSize:11,color:"#93c5fd",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:6}}>🏠 Immobile</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9",marginBottom:3}}>{TIPO_ICON[i.tipo]} {i.titolo}</div>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>📍 {i.comune}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",margin:"6px 0"}}>
                    <span style={{background:i.contratto==="affitto"?"#2e1a47":"#1e3a5f",color:i.contratto==="affitto"?"#c084fc":"#93c5fd",padding:"2px 8px",borderRadius:999,fontSize:11,fontWeight:700}}>{i.contratto.toUpperCase()}</span>
                    <Badge stato={i.stato} map={STATO_C}/>
                  </div>
                  <div style={{fontSize:15,fontWeight:800,color:i.contratto==="affitto"?"#c084fc":"#60a5fa",marginBottom:2}}>
                    € {Number(i.prezzo).toLocaleString("it-IT")}{i.contratto==="affitto"?<span style={{fontSize:12,fontWeight:400,color:"#94a3b8"}}>/mese</span>:""}
                  </div>
                  <div style={{fontSize:12,color:"#64748b"}}>📐 {i.mq} mq{i.locali ? ` · 🚪 ${i.locali} loc` : ""}</div>
                  <div style={{flex:1}}/>
                  <button onClick={()=>setDettaglioImm(i)}
                    style={{marginTop:10,padding:"6px 12px",borderRadius:7,border:"1px solid #2563eb",background:"none",color:"#93c5fd",fontSize:12,cursor:"pointer",fontWeight:600,alignSelf:"flex-start"}}>
                    👁 Dettagli immobile
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {dettaglioImm && <ModalDettaglioImm imm={dettaglioImm} onClose={()=>setDettaglioImm(null)}/>}
      {dettaglioRich && <ModalDettaglioRich rich={dettaglioRich} onClose={()=>setDettaglioRich(null)}/>}
    </div>
  );
}

// ─── SEZIONE MAPPA GLOBALE ────────────────────────────────────────────────────
function SezioneMappa() {
  const [immobili,  setImmobili]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [fStato,    setFStato]    = useState("tutti");
  const [fContr,    setFContr]    = useState("tutti");
  const [dettaglio, setDettaglio] = useState(null);

  useEffect(() => {
    db.select("immobili").then(data => {
      setImmobili(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const filtered = immobili.filter(i =>
    (fStato==="tutti" || i.stato===fStato) &&
    (fContr==="tutti" || i.contratto===fContr)
  );

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <select value={fContr} onChange={e=>setFContr(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti i contratti</option><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select>
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option><option value="collaborazione">Collaborazione</option><option value="scovato">Scovato</option></select>
        <span style={{color:"#64748b",fontSize:12,marginLeft:"auto"}}>{filtered.length} immobili visualizzati</span>
      </div>
      <Legenda/>
      {loading ? <Spinner testo="Caricamento mappa…"/> : <MappaImmobili immobili={filtered} h={600} onSelect={setDettaglio}/>}
      {dettaglio&&<ModalDettaglioImm imm={dettaglio} onClose={()=>setDettaglio(null)}/>}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [errore,   setErrore]   = useState(null);

  const login = async (e) => {
    e.preventDefault();
    setLoading(true); setErrore(null);
    try {
      const s = await authSignIn(email, password);
      onLogin(s);
    } catch(err) {
      setErrore(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a1628",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Roboto',sans-serif",padding:20}}>
      <div style={{background:"#0d1f3c",border:"1px solid #1e3a5f",borderRadius:16,padding:36,width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:44,marginBottom:10}}>🏛</div>
          <h1 style={{fontSize:22,fontWeight:900,color:"#f1f5f9",margin:0}}>Immobiliare 3.0</h1>
          <div style={{fontSize:12,color:"#475569",marginTop:4}}>Gestionale interno — accesso riservato</div>
        </div>
        {errore && (
          <div style={{background:"#3b1515",border:"1px solid #7f1d1d",borderRadius:8,padding:"10px 14px",color:"#f87171",fontSize:13,marginBottom:18}}>
            ⚠️ {errore}
          </div>
        )}
        <form onSubmit={login}>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",color:"#94a3b8",fontSize:11,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5}}>Email</label>
            <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@email.com" autoFocus autoComplete="email"/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={{display:"block",color:"#94a3b8",fontSize:11,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:5}}>Password</label>
            <input style={inp} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/>
          </div>
          <button type="submit" disabled={loading||!email||!password}
            style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:loading||!email||!password?"#1e3a5f":"#2563eb",color:loading||!email||!password?"#475569":"#fff",fontWeight:700,cursor:loading||!email||!password?"default":"pointer",fontSize:15,transition:"background .2s"}}>
            {loading ? "⏳ Accesso in corso…" : "🔑 Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  useRoboto();
  const [session, setSession] = useState(() => getStoredSession());
  const [tab, setTab] = useState("immobili");
  const [matchInitial, setMatchInitial] = useState(null);

  // Contatori header (caricati una volta) — hook PRIMA del return condizionale
  const [counts, setCounts] = useState({ disp:0, rich:0, nuovi:0 });
  useEffect(() => {
    if (!session) return;
    Promise.all([
      db.select("immobili"),
      db.select("richieste"),
    ]).then(([imm, rich]) => {
      const immArr  = Array.isArray(imm)  ? imm  : [];
      const richArr = Array.isArray(rich) ? rich : [];
      setCounts({
        disp:  immArr.filter(i=>i.stato==="disponibile").length,
        rich:  richArr.length,
        nuovi: richArr.filter(r=>r.stato==="nuovo_contatto").length,
      });
    });
  }, [session, tab]);

  if (!session) return <LoginScreen onLogin={setSession}/>;

  const logout = async () => {
    await authSignOut(session.access_token);
    setSession(null);
  };

  const goToMatch = (modo, sel) => {
    setMatchInitial({ modo, sel });
    setTab("match");
  };

  const tabs = [
    {id:"immobili", label:"🏠 Immobili",  col:"#15803d"},
    {id:"richieste",label:"📋 Richieste", col:"#7c3aed"},
    {id:"match",    label:"🔀 Match",     col:"#c2410c"},
    {id:"mappa",    label:"🗺 Mappa",     col:"#0284c7"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0a1628",fontFamily:"'Roboto',sans-serif",color:"#e2e8f0"}}>
      <div style={{background:"#0d1f3c",borderBottom:"1px solid #1e3a5f",padding:"0 28px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 0 0"}}>
            <div>
              <h1 style={{fontSize:22,fontWeight:900,color:"#f1f5f9",margin:0}}>🏛 Immobiliare 3.0</h1>
              <div style={{fontSize:11,color:"#475569",marginTop:2}}>Gestionale interno</div>
            </div>
            <div style={{display:"flex",gap:20,alignItems:"center"}}>
              {[[counts.disp,"#4ade80","disponibili"],[counts.rich,"#93c5fd","richieste"],[counts.nuovi,"#fbbf24","nuovi lead"]].map(([n,c,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:c}}>{n}</div>
                  <div style={{fontSize:10,color:"#475569"}}>{l}</div>
                </div>
              ))}
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,paddingLeft:16,borderLeft:"1px solid #1e3a5f"}}>
                <span style={{fontSize:11,color:"#475569"}}>👤 {session.email}</span>
                <button onClick={logout} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#64748b",cursor:"pointer",fontSize:11,fontWeight:600}}>Esci</button>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:4,marginTop:12}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 20px",background:"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:600,color:tab===t.id?t.col:"#64748b",borderBottom:tab===t.id?`2px solid ${t.col}`:"2px solid transparent",transition:"all .2s"}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1200,margin:"0 auto",padding:28}}>
        {tab==="immobili" &&<SezioneImmobili  onMatch={goToMatch}/>}
        {tab==="richieste"&&<SezioneRichieste onMatch={goToMatch}/>}
        {tab==="match"    &&<SezioneMatch initial={matchInitial} onConsumeInitial={()=>setMatchInitial(null)}/>}
        {tab==="mappa"    &&<SezioneMappa/>}
      </div>
    </div>
  );
}

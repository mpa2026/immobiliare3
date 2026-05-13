import { useState, useEffect, useRef } from "react";

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = "https://svsyczdpwdpveqxpvsjr.supabase.co";
const SUPABASE_KEY = "sb_publishable_fV1Ycrt8CsVEjOWyAhUFzg_3Rc7iLwb";

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
  disponibile: { bg:"#0d3320", text:"#4ade80", pin:"#4ade80", label:"Disponibile" },
  trattativa:  { bg:"#3b2500", text:"#fb923c", pin:"#fb923c", label:"Trattativa" },
  venduto:     { bg:"#3b1515", text:"#f87171", pin:"#f87171", label:"Venduto/Affittato" },
  ritirato:    { bg:"#1e2535", text:"#94a3b8", pin:"#94a3b8", label:"Ritirato" },
};
const RICH_C = {
  nuovo_contatto: { bg:"#1e3a5f", text:"#93c5fd", label:"Nuovo contatto" },
  in_valutazione: { bg:"#3b2f00", text:"#fde047", label:"In valutazione" },
  proposta_fatta: { bg:"#3b1f0a", text:"#fb923c", label:"Proposta fatta" },
  chiuso:         { bg:"#3b1515", text:"#f87171", label:"Chiuso" },
};
const TIPO_ICON = { appartamento:"🏢", villa:"🏡", ufficio:"🏛️", negozio:"🏪", capannone:"🏗️", terreno:"🌿", altro:"📦" };
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
const Modal = ({ title, onClose, children }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
    <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:16, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto", padding:28 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ color:"#f1f5f9", fontSize:18, margin:0 }}>{title}</h2>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:22, cursor:"pointer" }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

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
function MappaImmobili({ immobili, h = 520 }) {
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
      const mk = L.marker([imm.lat, imm.lng], { icon }).bindPopup(popup);
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

// ─── FORM IMMOBILE ────────────────────────────────────────────────────────────
function FormImm({ data={}, onSave, onClose, saving }) {
  const [f,setF] = useState({
    titolo:"", tipo:"appartamento", contratto:"vendita", comune:"", indirizzo:"",
    mq:"", locali:"", bagni:"", prezzo:"", stato:"disponibile",
    proprietario_label:"", note_interne:"", lat:"", lng:"",
    ...data
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  return <>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
      <div style={{gridColumn:"1/-1"}}><Field label="Titolo"><input style={inp} value={f.titolo} onChange={e=>s("titolo",e.target.value)} placeholder="Es. Bilocale Centro Treviso"/></Field></div>
      <Field label="Tipo"><select style={sel} value={f.tipo} onChange={e=>s("tipo",e.target.value)}>{["appartamento","villa","ufficio","negozio","capannone","terreno","altro"].map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="Contratto"><select style={sel} value={f.contratto} onChange={e=>s("contratto",e.target.value)}><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select></Field>
      <Field label="Comune"><input style={inp} value={f.comune} onChange={e=>s("comune",e.target.value)}/></Field>
      <Field label="Indirizzo"><input style={inp} value={f.indirizzo} onChange={e=>s("indirizzo",e.target.value)}/></Field>
      <Field label="Mq"><input style={inp} type="number" value={f.mq} onChange={e=>s("mq",e.target.value)}/></Field>
      <Field label="Locali"><input style={inp} type="number" value={f.locali} onChange={e=>s("locali",e.target.value)}/></Field>
      <Field label="Bagni"><input style={inp} type="number" value={f.bagni} onChange={e=>s("bagni",e.target.value)}/></Field>
      <Field label={f.contratto==="affitto"?"Canone €/mese":"Prezzo €"}><input style={inp} type="number" value={f.prezzo} onChange={e=>s("prezzo",e.target.value)}/></Field>
      <Field label="Stato"><select style={sel} value={f.stato} onChange={e=>s("stato",e.target.value)}><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa in corso</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option></select></Field>
      <div style={{gridColumn:"1/-1"}}><Field label="Proprietario"><input style={inp} value={f.proprietario_label} onChange={e=>s("proprietario_label",e.target.value)}/></Field></div>
      <Field label="Latitudine (mappa)"><input style={inp} type="number" step="any" value={f.lat} onChange={e=>s("lat",e.target.value)} placeholder="Es. 45.6698"/></Field>
      <Field label="Longitudine (mappa)"><input style={inp} type="number" step="any" value={f.lng} onChange={e=>s("lng",e.target.value)} placeholder="Es. 12.2430"/></Field>
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
    budget_min:"", budget_max:"", mq_min:"", locali_min:"",
    zone:"", stato:"nuovo_contatto", note:"",
    ...data,
    zone: Array.isArray(data.zone) ? data.zone.join(", ") : (data.zone||"")
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const save = () => onSave({
    ...f,
    zone: f.zone.split(",").map(z=>z.trim()).filter(Boolean),
    budget_min: Number(f.budget_min)||0,
    budget_max: Number(f.budget_max)||0,
    mq_min:     Number(f.mq_min)||0,
    locali_min: Number(f.locali_min)||0,
  });
  return <>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      <div style={{gridColumn:"1/-1"}}><Field label="Nome cliente"><input style={inp} value={f.cliente_label} onChange={e=>s("cliente_label",e.target.value)}/></Field></div>
      <Field label="Telefono"><input style={inp} value={f.telefono} onChange={e=>s("telefono",e.target.value)}/></Field>
      <Field label="Email (opzionale)"><input style={inp} value={f.email} onChange={e=>s("email",e.target.value)}/></Field>
      <Field label="Contratto"><select style={sel} value={f.contratto} onChange={e=>s("contratto",e.target.value)}><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select></Field>
      <Field label="Tipo immobile"><select style={sel} value={f.tipo} onChange={e=>s("tipo",e.target.value)}><option value="">Qualsiasi</option>{["appartamento","villa","ufficio","negozio","capannone","terreno","altro"].map(t=><option key={t}>{t}</option>)}</select></Field>
      <Field label="Budget min €"><input style={inp} type="number" value={f.budget_min} onChange={e=>s("budget_min",e.target.value)}/></Field>
      <Field label="Budget max €"><input style={inp} type="number" value={f.budget_max} onChange={e=>s("budget_max",e.target.value)}/></Field>
      <Field label="Superficie min (mq)"><input style={inp} type="number" value={f.mq_min} onChange={e=>s("mq_min",e.target.value)}/></Field>
      <Field label="Locali min"><input style={inp} type="number" value={f.locali_min} onChange={e=>s("locali_min",e.target.value)}/></Field>
      <Field label="Stato"><select style={sel} value={f.stato} onChange={e=>s("stato",e.target.value)}><option value="nuovo_contatto">Nuovo contatto</option><option value="in_valutazione">In valutazione</option><option value="proposta_fatta">Proposta fatta</option><option value="chiuso">Chiuso</option></select></Field>
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
function SezioneImmobili() {
  const [immobili, setImmobili] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [errore,   setErrore]   = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState("");
  const [fStato,   setFStato]   = useState("tutti");
  const [fContr,   setFContr]   = useState("tutti");
  const [vista,    setVista]    = useState("lista");
  const [modal,    setModal]    = useState(null);

  const carica = async () => {
    setLoading(true); setErrore(null);
    try {
      const data = await db.select("immobili");
      setImmobili(Array.isArray(data) ? data : []);
    } catch(e) { setErrore(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carica(); }, []);

  const filtered = immobili.filter(i => {
    const q = search.toLowerCase();
    const prop = (i.proprietario_label||"").toLowerCase();
    return (!q || i.titolo.toLowerCase().includes(q) || i.comune.toLowerCase().includes(q) || prop.includes(q))
      && (fStato==="tutti" || i.stato===fStato)
      && (fContr==="tutti" || i.contratto===fContr);
  });

  const salva = async (f) => {
    setSaving(true);
    try {
      const payload = {
        titolo: f.titolo, tipo: f.tipo, contratto: f.contratto,
        comune: f.comune, indirizzo: f.indirizzo,
        mq: Number(f.mq)||0, locali: Number(f.locali)||null, bagni: Number(f.bagni)||null,
        prezzo: Number(f.prezzo)||0, stato: f.stato,
        proprietario_label: f.proprietario_label||null,
        note_interne: f.note_interne||null,
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

  const btn = (active, label, onClick) => (
    <button onClick={onClick} style={{ padding:"8px 16px", border:"none", background:active?"#2563eb":"none", color:active?"#fff":"#64748b", fontWeight:active?700:400, cursor:"pointer", fontSize:13, transition:"all .2s" }}>{label}</button>
  );

  return (
    <div>
      {errore && <Errore msg={errore} onRetry={carica}/>}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Cerca immobile, comune, proprietario…" style={{...inp,flex:1,minWidth:200}}/>
        <select value={fContr} onChange={e=>setFContr(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti i contratti</option><option value="vendita">Vendita</option><option value="affitto">Affitto</option></select>
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option></select>
        <div style={{display:"flex",background:"#1e293b",border:"1px solid #334155",borderRadius:8,overflow:"hidden"}}>
          {btn(vista==="lista","☰ Lista",()=>setVista("lista"))}
          {btn(vista==="mappa","🗺 Mappa",()=>setVista("mappa"))}
        </div>
        <button onClick={()=>setModal("nuovo")} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#15803d",color:"#fff",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Nuovo immobile</button>
      </div>

      {loading ? <Spinner testo="Caricamento immobili…"/> : (
        <>
          <div style={{color:"#64748b",fontSize:12,marginBottom:14}}>{filtered.length} immobili trovati</div>
          {vista==="lista" ? (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
              {filtered.map(imm=>(
                <div key={imm.id} style={{background:"#1e293b",borderRadius:12,border:"1px solid #334155",overflow:"hidden",transition:"border-color .2s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="#4b6a8a"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
                  <div style={{padding:"14px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:16,color:"#f1f5f9",fontWeight:700,marginBottom:4}}>{TIPO_ICON[imm.tipo]} {imm.titolo}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{imm.indirizzo}, {imm.comune}</div>
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
                    {imm.proprietario_label&&<div style={{fontSize:12,color:"#64748b",marginBottom:10}}>👤 {imm.proprietario_label}</div>}
                    {imm.note_interne&&<div style={{fontSize:11,color:"#475569",background:"#162032",borderRadius:6,padding:"6px 10px",marginBottom:10}}>📝 {imm.note_interne}</div>}
                    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                      <button onClick={()=>setModal(imm)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>✏️ Modifica</button>
                      <button onClick={()=>elimina(imm.id)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #4b1818",background:"none",color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑 Elimina</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <><Legenda/><MappaImmobili immobili={filtered} h={520}/></>
          )}
        </>
      )}
      {modal&&<Modal title={modal==="nuovo"?"Nuovo Immobile":"Modifica Immobile"} onClose={()=>setModal(null)}>
        <FormImm data={modal==="nuovo"?{}:modal} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>}
    </div>
  );
}

// ─── SEZIONE RICHIESTE ────────────────────────────────────────────────────────
function SezioneRichieste() {
  const [richieste, setRichieste] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [errore,    setErrore]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState("");
  const [fStato,    setFStato]    = useState("tutti");
  const [modal,     setModal]     = useState(null);

  const carica = async () => {
    setLoading(true); setErrore(null);
    try {
      const data = await db.select("richieste");
      setRichieste(Array.isArray(data) ? data : []);
    } catch(e) { setErrore(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carica(); }, []);

  const filtered = richieste.filter(r => {
    const q = search.toLowerCase();
    return (!q || (r.cliente_label||"").toLowerCase().includes(q) || (r.telefono||"").includes(q))
      && (fStato==="tutti" || r.stato===fStato);
  });

  const salva = async (f) => {
    setSaving(true);
    try {
      const payload = {
        cliente_label: f.cliente_label, telefono: f.telefono||null, email: f.email||null,
        contratto: f.contratto, tipo: f.tipo||null, stato: f.stato,
        budget_min: f.budget_min||0, budget_max: f.budget_max||0,
        mq_min: f.mq_min||null, locali_min: f.locali_min||null,
        zone: f.zone||[], note: f.note||null,
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

  return (
    <div>
      {errore && <Errore msg={errore} onRetry={carica}/>}
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Cerca cliente o telefono…" style={{...inp,flex:1,minWidth:200}}/>
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="nuovo_contatto">Nuovo contatto</option><option value="in_valutazione">In valutazione</option><option value="proposta_fatta">Proposta fatta</option><option value="chiuso">Chiuso</option></select>
        <button onClick={()=>setModal("nuovo")} style={{padding:"9px 18px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",fontWeight:700,cursor:"pointer"}}>+ Nuova richiesta</button>
      </div>
      {loading ? <Spinner testo="Caricamento richieste…"/> : (
        <>
          <div style={{color:"#64748b",fontSize:12,marginBottom:14}}>{filtered.length} richieste trovate</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {filtered.map(r=>(
              <div key={r.id} style={{background:"#1e293b",borderRadius:12,border:"1px solid #334155",overflow:"hidden"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#4b3a6a"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#334155"}>
                <div style={{padding:"14px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:16,color:"#f1f5f9",fontWeight:700,marginBottom:4}}>👤 {r.cliente_label}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>📞 {r.telefono}{r.email&&` · ✉️ ${r.email}`}</div>
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
                  {r.note&&<div style={{fontSize:11,color:"#475569",background:"#162032",borderRadius:6,padding:"6px 10px",marginBottom:10}}>📝 {r.note}</div>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={()=>setModal(r)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #334155",background:"none",color:"#94a3b8",fontSize:12,cursor:"pointer"}}>✏️ Modifica</button>
                    <button onClick={()=>elimina(r.id)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #4b1818",background:"none",color:"#f87171",fontSize:12,cursor:"pointer"}}>🗑 Elimina</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {modal&&<Modal title={modal==="nuovo"?"Nuova Richiesta":"Modifica Richiesta"} onClose={()=>setModal(null)}>
        <FormRich data={modal==="nuovo"?{}:modal} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>
      </Modal>}
    </div>
  );
}

// ─── SEZIONE MATCH ────────────────────────────────────────────────────────────
function calcolaScore(imm, rich) {
  if (imm.contratto !== rich.contratto) return 0;
  let s = 30;
  if (Number(imm.prezzo) <= Number(rich.budget_max) && Number(imm.prezzo) >= Number(rich.budget_min||0)) s += 25;
  else if (Number(imm.prezzo) <= Number(rich.budget_max) * 1.1) s += 10;
  if (!rich.tipo || rich.tipo === imm.tipo) s += 20;
  if (!rich.mq_min || Number(imm.mq) >= Number(rich.mq_min)) s += 15;
  if (!rich.locali_min || Number(imm.locali) >= Number(rich.locali_min)) s += 10;
  return Math.min(s, 100);
}

function SezioneMatch() {
  const [immobili,  setImmobili]  = useState([]);
  const [richieste, setRichieste] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sel,       setSel]       = useState(null);
  const [soglia,    setSoglia]    = useState(50);

  useEffect(() => {
    Promise.all([
      db.select("immobili"),
      db.select("richieste"),
    ]).then(([imm, rich]) => {
      setImmobili(Array.isArray(imm) ? imm : []);
      setRichieste(Array.isArray(rich) ? rich : []);
      setLoading(false);
    });
  }, []);

  const matches = sel
    ? immobili.filter(i=>i.stato==="disponibile")
        .map(i=>({ immobile:i, score:calcolaScore(i,sel) }))
        .filter(m=>m.score>=soglia)
        .sort((a,b)=>b.score-a.score)
    : [];

  if (loading) return <Spinner testo="Caricamento dati…"/>;

  return (
    <div>
      <div style={{background:"#1e293b",borderRadius:12,border:"1px solid #334155",padding:20,marginBottom:20}}>
        <div style={{color:"#94a3b8",fontSize:12,textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:12}}>Seleziona una richiesta cliente</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
          {richieste.filter(r=>r.stato!=="chiuso").map(r=>(
            <button key={r.id} onClick={()=>setSel(r===sel?null:r)}
              style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${sel?.id===r.id?"#7c3aed":"#334155"}`,background:sel?.id===r.id?"#2e1a47":"none",color:sel?.id===r.id?"#c084fc":"#94a3b8",cursor:"pointer",fontSize:13,fontWeight:sel?.id===r.id?700:400,transition:"all .2s"}}>
              {r.cliente_label}
            </button>
          ))}
        </div>
        {sel&&<div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{color:"#64748b",fontSize:12}}>Score minimo:</span>
          <input type="range" min={0} max={100} value={soglia} onChange={e=>setSoglia(+e.target.value)} style={{flex:1,maxWidth:200}}/>
          <span style={{color:"#fbbf24",fontWeight:700,fontSize:14,minWidth:40}}>{soglia}%</span>
        </div>}
      </div>
      {!sel ? (
        <div style={{textAlign:"center",padding:"60px 0",color:"#475569"}}>
          <div style={{fontSize:48,marginBottom:12}}>🔀</div>
          <div style={{fontSize:16,color:"#64748b"}}>Seleziona un cliente per vedere i match</div>
        </div>
      ) : (
        <>
          <div style={{background:"#162032",borderRadius:10,padding:"12px 16px",marginBottom:16,border:"1px solid #1e3a5f"}}>
            <div style={{color:"#93c5fd",fontSize:13,fontWeight:700,marginBottom:6}}>📋 Criteri di {sel.cliente_label}</div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,color:"#64748b"}}>
              <span>📄 {sel.contratto}</span>
              {sel.tipo&&<span>🏠 {sel.tipo}</span>}
              <span>💰 max € {Number(sel.budget_max).toLocaleString("it-IT")}</span>
              {sel.mq_min>0&&<span>📐 min {sel.mq_min} mq</span>}
              {sel.locali_min>0&&<span>🚪 min {sel.locali_min} loc.</span>}
              {sel.zone?.length>0&&<span>📍 {sel.zone.join(", ")}</span>}
            </div>
          </div>
          {matches.length===0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:"#475569"}}>
              <div style={{fontSize:36,marginBottom:8}}>😕</div>
              <div>Nessun immobile disponibile con score ≥ {soglia}%</div>
              <div style={{fontSize:12,marginTop:4}}>Prova ad abbassare lo score minimo</div>
            </div>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
              {matches.map(({immobile:i,score})=>(
                <div key={i.id} style={{background:"#1e293b",borderRadius:12,border:`1px solid ${score>=80?"#166534":score>=60?"#854d0e":"#334155"}`,overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:14,color:"#f1f5f9",fontWeight:700}}>{TIPO_ICON[i.tipo]} {i.titolo}</div>
                    <span style={{background:score>=80?"#0d3320":score>=60?"#3b2500":"#3b1515",color:score>=80?"#4ade80":score>=60?"#fb923c":"#f87171",padding:"3px 10px",borderRadius:999,fontSize:12,fontWeight:800}}>{score>=80?"⭐ ":""}{score}%</span>
                  </div>
                  <div style={{padding:"12px 16px"}}>
                    <ScoreBar score={score}/>
                    <div style={{marginTop:10,fontSize:12,color:"#64748b"}}>📍 {i.indirizzo}, {i.comune}</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8,alignItems:"center"}}>
                      <span style={{fontSize:16,fontWeight:800,color:"#60a5fa"}}>€ {Number(i.prezzo).toLocaleString("it-IT")}{i.contratto==="affitto"?"/mese":""}</span>
                      <span style={{fontSize:12,color:"#64748b"}}>{i.mq} mq · {i.locali||"—"} loc.</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── SEZIONE MAPPA GLOBALE ────────────────────────────────────────────────────
function SezioneMappa() {
  const [immobili, setImmobili] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [fStato,   setFStato]   = useState("tutti");
  const [fContr,   setFContr]   = useState("tutti");

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
        <select value={fStato} onChange={e=>setFStato(e.target.value)} style={{...sel,width:"auto"}}><option value="tutti">Tutti gli stati</option><option value="disponibile">Disponibile</option><option value="trattativa">Trattativa</option><option value="venduto">Venduto/Affittato</option><option value="ritirato">Ritirato</option></select>
        <span style={{color:"#64748b",fontSize:12,marginLeft:"auto"}}>{filtered.length} immobili visualizzati</span>
      </div>
      <Legenda/>
      {loading ? <Spinner testo="Caricamento mappa…"/> : <MappaImmobili immobili={filtered} h={600}/>}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  useRoboto();
  const [tab, setTab] = useState("immobili");

  // Contatori header (caricati una volta)
  const [counts, setCounts] = useState({ disp:0, rich:0, nuovi:0 });
  useEffect(() => {
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
  }, [tab]); // aggiorna i contatori ogni volta che si cambia tab

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
            <div style={{display:"flex",gap:20}}>
              {[[counts.disp,"#4ade80","disponibili"],[counts.rich,"#93c5fd","richieste"],[counts.nuovi,"#fbbf24","nuovi lead"]].map(([n,c,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:800,color:c}}>{n}</div>
                  <div style={{fontSize:10,color:"#475569"}}>{l}</div>
                </div>
              ))}
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
        {tab==="immobili" &&<SezioneImmobili/>}
        {tab==="richieste"&&<SezioneRichieste/>}
        {tab==="match"    &&<SezioneMatch/>}
        {tab==="mappa"    &&<SezioneMappa/>}
      </div>
    </div>
  );
}

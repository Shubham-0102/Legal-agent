import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import Auth from "./Auth";
import Profile from "./Profile";
import { hasToken, setToken, req, uploadDoc, downloadDoc, fetchDocPreview, getLegalNews, streamChat, Msg, Source, NewsItem } from "./api";

type Conv = { id: number; title: string };
type Case = { id: number; name: string };
type SavedDoc = { id: number; filename: string; pages: number; status: string; created: string; case_id: number | null };
const DISCLAIMER = "AI-assisted legal research, not a final legal opinion. Verify jurisdiction, current law, and primary authority before relying on an answer.";
const PROMPTS = ["What jurisdictional issues should I check first?", "Explain the elements of negligence", "How should I assess enforceability of a contract clause?"];

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [convs, setConvs] = useState<Conv[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SavedDoc | null>(null);
  const [showDocList, setShowDocList] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState("");
  const [newsErrors, setNewsErrors] = useState<string[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsRegion, setNewsRegion] = useState("np");
  const [docUrl, setDocUrl] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [cid, setCid] = useState<number | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const refresh = () => {
    req("/conversations").then(setConvs).catch(() => {});
    req("/cases").then(setCases).catch(() => {});
  };
  const refreshDocs = () => {
    req("/documents").then(setDocs).catch(() => setDocs([]));
  };
  const refreshNews = async () => {
    setNewsLoading(true);
    try {
      const result = await getLegalNews(newsRegion);
      setNewsItems(result.items);
      setNewsUpdatedAt(result.updated_at);
      setNewsErrors(result.errors);
    } catch (e) {
      setNewsErrors([(e as Error).message]);
    } finally {
      setNewsLoading(false);
    }
  };
  useEffect(() => { if (authed) refresh(); }, [authed]);
  useEffect(() => { if (authed) refreshDocs(); }, [authed]);
  useEffect(() => {
    if (!authed) return;
    refreshNews();
    const timer = window.setInterval(refreshNews, 10 * 60 * 1000);
    return () => { window.clearInterval(timer); };
  }, [authed, newsRegion]);
  useEffect(() => {
    if (!selectedDoc) { setDocUrl(""); setDocLoading(false); return; }
    let cancelled = false;
    let objectUrl = "";
    setDocUrl("");
    setDocLoading(true);
    setNote("");
    fetchDocPreview(selectedDoc.id).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (cancelled) URL.revokeObjectURL(objectUrl);
      else setDocUrl(objectUrl);
    }).catch(e => {
      if (!cancelled) setNote("Could not open document: " + (e as Error).message);
    }).finally(() => { if (!cancelled) setDocLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selectedDoc]);
  useEffect(() => {
    const node = end.current;
    if (node) node.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);
  if (!authed) return <Auth onDone={() => setAuthed(true)} />;

  const open = async (id: number) => {
    abort.current?.abort();
    const c = await req(`/conversations/${id}`);
    setCid(id);
    setSelectedDoc(null);
    setShowDocList(false);
    setNewsOpen(false);
    setCaseId(c.case_id);
    setMsgs(c.messages);
    setMobileNavOpen(false);
  };
  const fresh = () => {
    abort.current?.abort();
    setBusy(false);
    setStatus("");
    setCid(null);
    setSelectedDoc(null);
    setShowDocList(false);
    setNewsOpen(false);
    setMsgs([]);
    setNote("");
    setMobileNavOpen(false);
  };
  const newCase = async () => {
    const name = prompt("Case name");
    if (name) {
      const c = await req("/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      setCaseId(c.id);
      fresh();
      refresh();
    }
  };
  const upload = async (f?: File) => {
    if (!f) return;
    setNote(`Processing ${f.name}...`);
    try {
      const d = await uploadDoc(f, caseId);
      setNote(`Saved: ${d.filename} · ${d.pages} pages · ${d.chunks} passages`);
      refreshDocs();
    } catch (e) {
      setNote("Upload failed: " + (e as Error).message);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStatus("Searching your documents...");
    const assistantIndex = msgs.length + 1;
    setMsgs(m => [...m, { role: "user", content: text }, { role: "assistant", content: "", sources: [] }]);
    const patch = (fn: (m: Msg) => Msg) => setMsgs(m => {
      if (m[assistantIndex]?.role !== "assistant") return m;
      const next = [...m];
      next[assistantIndex] = fn(next[assistantIndex]);
      return next;
    });
    const controller = new AbortController();
    abort.current = controller;
    try {
      await streamChat({ message: text, conversation_id: cid, case_id: caseId }, (ev, d) => {
        if (ev === "status") setStatus(d);
        else if (ev === "sources") patch(m => ({ ...m, sources: JSON.parse(d) as Source[] }));
        else if (ev === "token") patch(m => ({ ...m, content: m.content + JSON.parse(d) }));
        else if (ev === "error") patch(m => ({ ...m, content: m.content + `\nn**Error:** ${JSON.parse(d)}` }));
        else if (ev === "done") setCid(Number(d));
      }, controller.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch(m => ({ ...m, content: "**Error:** " + (e as Error).message }));
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
      setStatus("");
      refresh();
    }
  };

  return (
    <div className="app-shell">
      {profileOpen && <Profile onClose={() => setProfileOpen(false)} />}
      {mobileNavOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">L</span>
          <span className="sidebar-brand-name">LEGAL AGENT<small>RESEARCH DESK</small></span>
        </div>
        <button className="new-chat-button" onClick={fresh}><span>+</span> New research</button>
        <label className="search-field">
          <span>SEARCH HISTORY</span>
          <input placeholder="Find a conversation" value={q} onChange={e => setQ(e.target.value)} />
        </label>

        <section className="side-section" aria-label="Case files">
          <div className="side-heading"><span>CASE FILES</span><button onClick={newCase} aria-label="Create case">Add</button></div>
          <button className={`side-item${caseId === null ? " selected" : ""}`} onClick={() => { setCaseId(null); fresh(); }}>All documents</button>
          {cases.map(c => <button key={c.id} className={`side-item${caseId === c.id ? " selected" : ""}`} onClick={() => { setCaseId(caseId === c.id ? null : c.id); fresh(); }}>{c.name}</button>)}
        </section>

        <section className="side-section saved-documents-nav" aria-label="Saved documents">
          <div className="side-heading"><span>DOCUMENTS</span></div>
          <button className={`saved-document-nav-item library-nav-item${showDocList ? " selected" : ""}`} onClick={() => {
            setSelectedDoc(null);
            setShowDocList(true);
            setNewsOpen(false);
            setCid(null);
            setMsgs([]);
            setNote("");
            setMobileNavOpen(false);
          }}>
            <span className="saved-document-nav-icon" aria-hidden="true">▤</span>
            <span className="saved-document-nav-copy"><strong>Saved documents</strong><small>Your uploaded files</small></span>
            <span className="saved-document-nav-count">{docs.length}</span>
          </button>
        </section>

        <section className="side-section news-nav-section" aria-label="Legal news">
          <div className="side-heading"><span>UPDATES</span></div>
          <button className={`saved-document-nav-item library-nav-item${newsOpen ? " selected" : ""}`} onClick={() => {
            setSelectedDoc(null);
            setShowDocList(false);
            setNewsOpen(true);
            setCid(null);
            setMsgs([]);
            setMobileNavOpen(false);
          }}>
            <span className="news-nav-icon" aria-hidden="true">◉</span>
            <span className="saved-document-nav-copy"><strong>Legal news</strong><small>Recent legal updates</small></span>
            <span className="saved-document-nav-count">{newsItems.length}</span>
          </button>
        </section>

        <section className="side-section history-section" aria-label="Conversations">
          <div className="side-heading"><span>RECENT RESEARCH</span><span className="side-count">{convs.length}</span></div>
          <div className="conversation-list">
            {convs.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).map(c =>
              <button key={c.id} className={`side-item${cid === c.id ? " selected" : ""}`} onClick={() => open(c.id)}>{c.title}</button>)}
            {!convs.length && <p className="side-empty">Your conversations will appear here.</p>}
          </div>
        </section>

        <div className="sidebar-bottom">
          <span className="privacy-note">Your documents stay scoped to your account.</span>
          <button className="profile-trigger" onClick={() => { setMobileNavOpen(false); setProfileOpen(true); }}>
            <span className="profile-trigger-avatar" aria-hidden="true">U</span>
            <span className="profile-trigger-copy"><strong>My profile</strong><small>Account settings</small></span>
            <span className="profile-trigger-arrow" aria-hidden="true">↗</span>
          </button>
          <button className="signout-button" onClick={() => { setToken(""); setAuthed(false); }}>Sign out</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileNavOpen(true)}>Menu</button>
          <div className="workspace-context">
            <span className="eyebrow">CURRENT SCOPE</span>
            <strong>{caseId ? cases.find(c => c.id === caseId)?.name || "Selected case" : "All documents"}</strong>
          </div>
          <button className="upload-top-button" onClick={() => fileIn.current?.click()}>Upload document</button>
        </header>

        <input ref={fileIn} className="visually-hidden" type="file" accept=".pdf,.txt" onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        <section className={`chat-area${selectedDoc ? " has-document" : msgs.length ? " has-messages" : " is-empty"}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}>
          {selectedDoc ? <div className="document-view">
            <header className="document-view-heading">
              <div><span className="eyebrow">STORED DOCUMENT</span><h1>{selectedDoc.filename}</h1><p>{selectedDoc.pages} {selectedDoc.pages === 1 ? "page" : "pages"} · {selectedDoc.status === "ready" ? "Saved to your library" : selectedDoc.status}</p></div>
              {selectedDoc.status === "ready" && <button className="document-download-button" onClick={() => downloadDoc(selectedDoc.id).catch(e => setNote("Download failed: " + (e as Error).message))}>Download file <span>↓</span></button>}
            </header>
            {note && <p className="document-notice" role="status">{note}</p>}
            <div className="document-preview">
              {docLoading ? <p className="document-preview-message">Opening your saved document…</p> : docUrl ? <iframe title={`Preview: ${selectedDoc.filename}`} src={docUrl} /> : <p className="document-preview-message">The document preview is unavailable.</p>}
            </div>
          </div> : showDocList ? <div className="document-library">
            <header className="document-library-heading">
              <span className="eyebrow">YOUR LIBRARY</span>
              <h1>Saved documents</h1>
              <p>Your uploaded documents, saved to your account.</p>
            </header>
            {docs.length ? <div className="document-library-list">
              {docs.map(d => <article className="document-library-row" key={d.id}>
                <span className="document-library-icon" aria-hidden="true">{d.filename.toLowerCase().endsWith(".pdf") ? "PDF" : "TXT"}</span>
                <div className="document-library-info"><strong title={d.filename}>{d.filename}</strong><span>{d.status === "ready" ? `${d.pages} ${d.pages === 1 ? "page" : "pages"} · Saved${d.case_id ? ` · ${cases.find(c => c.id === d.case_id)?.name || "Case file"}` : ""}` : `Status: ${d.status}`}</span></div>
                <div className="document-library-actions">
                  {d.status === "ready" && <button type="button" className="document-library-open" onClick={() => { setSelectedDoc(d); setShowDocList(false); setNote(""); }}>Open</button>}
                  {d.status === "ready" && <button type="button" className="document-library-download" aria-label={`Download ${d.filename}`} onClick={() => downloadDoc(d.id).catch(e => setNote("Download failed: " + (e as Error).message))}>↓</button>}
                </div>
              </article>)}
            </div> : <div className="document-library-empty"><span className="saved-document-nav-icon" aria-hidden="true">▤</span><strong>No saved documents yet</strong><p>Upload a PDF or TXT file and it will appear here.</p><button type="button" onClick={() => fileIn.current?.click()}>Upload a document</button></div>}
          </div> : newsOpen ? <div className="legal-news-page">
            <header className="legal-news-heading">
              <div><span className="eyebrow">NEPAL LEGAL NEWS &amp; UPDATES</span><h1>Legal &amp; court updates</h1><p>Official Nepal notices, court updates, judgments, and legislation. Open a source for the full update.</p></div>
              <button className="news-refresh-button" type="button" onClick={refreshNews} disabled={newsLoading}>{newsLoading ? "Refreshing…" : "Refresh"}<span>↻</span></button>
            </header>
            <div className="news-toolbar">
              <label htmlFor="news-region">Region</label>
              <select id="news-region" value={newsRegion} onChange={e => setNewsRegion(e.target.value)}>
                <option value="np">Nepal · official updates</option><option value="all">All regions</option><option value="global">Global legal news</option><option value="us">United States</option><option value="uk">United Kingdom</option><option value="eu">European Union</option>
              </select>
              <span>{newsUpdatedAt ? `Updated ${new Date(newsUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Checking for updates…"}</span>
            </div>
            {newsErrors.length > 0 && <p className="news-feed-note" role="status">Some news sources could not be reached: {newsErrors.join(", ")}</p>}
            {newsLoading && !newsItems.length ? <div className="news-empty-state">Loading current legal updates…</div> : <div className="legal-news-list">
              {newsItems.filter(item => newsRegion === "all" || item.region === newsRegion).map(item => <article className="legal-news-card" key={item.id}>
                <div className="legal-news-meta"><span className={`news-region-tag ${item.region}`}>{item.region === "us" ? "U.S." : item.region === "uk" ? "U.K." : item.region === "eu" ? "EU" : item.region === "np" ? "NEPAL" : "GLOBAL"}</span><span>{item.source}</span><time>{item.published && !Number.isNaN(Date.parse(item.published)) ? new Date(item.published).toLocaleDateString() : (item.published_label || "Recent")}</time></div>
                <h2><a href={item.link} target="_blank" rel="noreferrer">{item.title}</a></h2>
                {item.summary && <p>{item.summary}</p>}
                <a className="news-source-link" href={item.link} target="_blank" rel="noreferrer">Read at source <span>↗</span></a>
              </article>)}
              {!newsItems.some(item => newsRegion === "all" || item.region === newsRegion) && !newsLoading && <div className="news-empty-state">No updates are available for this region right now.</div>}
            </div>}
            <p className="news-disclaimer">News items are brief publisher-provided updates, not legal advice. Check the source and verify current law before relying on an item.</p>
          </div> : !msgs.length ? (
            <div className="welcome-panel">
              <span className="eyebrow welcome-kicker">LEGAL RESEARCH / {caseId ? "CASE FILE" : "PERSONAL LIBRARY"}</span>
              <h1>What are we<br /><em>looking into?</em></h1>
              <p className="welcome-copy">Ask a general legal question without uploading anything, or add documents when you want analysis grounded in a specific record. Include the jurisdiction for a more useful answer.</p>
              <button className="upload-drop" onClick={() => fileIn.current?.click()}>
                <span className="upload-drop-mark">+</span>
                <span><strong>Add optional reference documents</strong><small>PDF or TXT · Drop a file here, or browse</small></span>
              </button>
              <div className="prompt-label">START WITH A QUESTION</div>
              <div className="prompt-list">
                {PROMPTS.map(prompt => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}<span>→</span></button>)}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {msgs.map((m, i) => (
                <article key={i} className={`chat-message ${m.role === "user" ? "user" : "assistant"}`}>
                  <div className="chat-message-content">
                    <div className={m.role === "user" ? "chat-user-bubble" : "message-body"}>
                      <Markdown>{m.content || (busy && i === msgs.length - 1 ? (status || "Thinking through your question…") : "")}</Markdown>
                    </div>
                    {!!m.sources?.length && <details className="sources-panel">
                      <summary>Sources <span>{m.sources.length}</span></summary>
                      <div className="source-list">
                        {m.sources.map(s => (
                          <div key={s.n} className="source-row">
                            <span className="source-number">[{s.n}]</span>
                            <div>
                              {s.url ? <a href={s.url} target="_blank" rel="noreferrer"><strong>{s.title}</strong></a> : <strong>{s.title}</strong>}
                              <span>{s.url ? "Live web source" : `${s.section ? `${s.section} · ` : ""}Page ${s.page ?? "—"}`}</span>
                            </div>
                            <span className="source-kind">{s.url ? "WEB" : "DOCUMENT"}</span>
                          </div>
                        ))}
                      </div>
                    </details>}
                  </div>
                </article>
              ))}
              <div ref={end} />
            </div>
          )}
        </section>

        {!selectedDoc && !showDocList && !newsOpen && <footer className="composer-area">
          {(status || note) && <div className="notice-line" role="status">{status || note}</div>}
          <form className="composer" onSubmit={e => { e.preventDefault(); send(); }}>
            <textarea rows={2} aria-label="Your legal research question" placeholder="Ask a legal question; include the jurisdiction..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <div className="composer-actions">
              <span>Enter to send · Shift + Enter for a new line</span>
              <div className="composer-buttons">
                <button type="button" className="attach-button" onClick={() => fileIn.current?.click()}>Attach file</button>
                {busy ? <button type="button" className="send-button stop-button" onClick={() => abort.current?.abort()}>Stop response</button> : <button type="submit" className="send-button" disabled={!input.trim()}>Send question <span>→</span></button>}
              </div>
            </div>
          </form>
          <p className="disclaimer">{DISCLAIMER}</p>
        </footer>}
      </main>
    </div>
  );
}

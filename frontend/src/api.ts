export const API = `http://${location.hostname}:8000/api`;
let token = localStorage.getItem("token") || "";
export const setToken = (t: string) => { token = t; t ? localStorage.setItem("token", t) : localStorage.removeItem("token"); };
export const hasToken = () => !!token;
export type Source = { n: number; title: string; section?: string; page: number; source_type: string };
export type Msg = { role: string; content: string; sources?: Source[] };
export type NewsItem = { id: string; title: string; link: string; summary: string; published: string; published_label?: string; source: string; region: string };
export type NewsResponse = { items: NewsItem[]; updated_at: string; errors: string[] };

const fail = async (r: Response) => { const e = await r.json().catch(() => ({}));
  throw new Error(typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail || r.statusText)); };
const auth = () => ({ Authorization: `Bearer ${token}` });

export async function req(path: string, opts: RequestInit = {}) {
  const r = await fetch(API + path, { ...opts, headers: { ...(opts.headers || {}), ...auth() } });
  if (r.status === 401) { setToken(""); location.reload(); }
  if (!r.ok) await fail(r);
  return r.json();
}
export async function login(email: string, password: string, register: boolean) {
  if (register) {
    const r = await fetch(API + "/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (!r.ok) await fail(r);
  }
  const r = await fetch(API + "/auth/login", { method: "POST", body: new URLSearchParams({ username: email, password }) });
  if (!r.ok) await fail(r);
  setToken((await r.json()).access_token);
}
export async function getLegalNews(region = "all"): Promise<NewsResponse> {
  return req(`/news?region=${encodeURIComponent(region)}`);
}
export async function uploadDoc(file: File, caseId: number | null) {
  const f = new FormData(); f.append("file", file); if (caseId) f.append("case_id", String(caseId));
  return req("/documents/upload", { method: "POST", body: f });
}
export async function fetchDocPreview(id: number): Promise<Blob> {
  const r = await fetch(API + `/documents/${id}/download`, { headers: auth() });
  if (r.status === 401) { setToken(""); location.reload(); }
  if (!r.ok) await fail(r);
  return r.blob();
}
export async function downloadDoc(id: number) {
  const r = await fetch(API + `/documents/${id}/download`, { headers: auth() });
  if (r.status === 401) { setToken(""); location.reload(); }
  if (!r.ok) await fail(r);
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = r.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export async function streamChat(body: object, on: (ev: string, data: string) => void, signal: AbortSignal) {
  const r = await fetch(API + "/chat/stream", { method: "POST", signal, headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) });
  if (r.status === 401) { setToken(""); location.reload(); }
  if (!r.ok) await fail(r);
  if (!r.body) throw new Error("The chat response did not include a stream.");
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  const dispatch = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) on(event, data.join("\n"));
  };
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(buf))) {
      dispatch(buf.slice(0, boundary.index));
      buf = buf.slice(boundary.index + boundary[0].length);
    }
  }
  buf += dec.decode();
  if (buf.trim()) dispatch(buf);
}

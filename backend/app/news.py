import asyncio
from concurrent.futures import ThreadPoolExecutor
import email.utils
import html
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

FEEDS = [
    {"region": "global", "source": "Global Legal Post", "url": "https://www.globallegalpost.com/rss-news"},
    {"region": "global", "source": "JURIST", "url": "https://www.jurist.org/paperchase/rss.xml"},
    {"region": "us", "source": "U.S. Courts", "url": "https://www.uscourts.gov/news/rss"},
    {"region": "uk", "source": "Courts and Tribunals Judiciary", "url": "https://www.judiciary.uk/announcements/feed/"},
    {"region": "uk", "source": "Courts and Tribunals Judiciary", "url": "https://www.judiciary.uk/judgments/feed/"},
    {"region": "eu", "source": "Court of Justice of the European Union", "url": "https://curia.europa.eu/site/rss.jsp?lang=en&secondLang=fr"},
]
NEPAL_PAGES = [
    {"source": "Supreme Court of Nepal", "url": "https://supremecourt.gov.np/web/", "kind": "supreme"},
    {"source": "Nepal Kanoon Patrika (Supreme Court)", "url": "https://www.nkp.gov.np/web/", "kind": "judgments"},
    {"source": "Nepal Gazette (Department of Printing)", "url": "https://rajpatra.dop.gov.np/", "kind": "gazette"},
    {"source": "Office of the Attorney General Nepal", "url": "https://ag.gov.np/news", "kind": "oag"},
    {"source": "Nepal Law Commission", "url": "https://lawcommission.gov.np/category/recent-act/", "kind": "law"},
    {"source": "Nepal Law Commission", "url": "https://lawcommission.gov.np/category/1809/", "kind": "law"},
    {"source": "Nepal Law Commission", "url": "https://lawcommission.gov.np/category/news/", "kind": "law"},
    {"source": "Judicial Council Secretariat", "url": "https://jcs.gov.np/", "kind": "council"},
    {"source": "Judicial Council Secretariat", "url": "https://jcs.gov.np/category/notifications/", "kind": "council"},
    {"source": "Ministry of Law, Justice and Parliamentary Affairs", "url": "https://www.moljpa.gov.np/", "kind": "ministry"},
]
CACHE_SECONDS = 600
_cache: dict[str, tuple[float, dict]] = {}


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(node: ET.Element, names: tuple[str, ...]) -> str:
    for child in node.iter():
        if _local_name(child.tag) in names:
            if child.text and child.text.strip():
                return child.text.strip()
            if child.attrib.get("href"):
                return child.attrib["href"].strip()
    return ""


def _clean_summary(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()[:360]


def _date(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def _parse_feed(feed: dict) -> list[dict]:
    req = urllib.request.Request(feed["url"], headers={"User-Agent": "LegalAgent/1.0 (+legal updates reader)"})
    with urllib.request.urlopen(req, timeout=10) as response:
        payload = response.read(2_000_000)
    root = ET.fromstring(payload)
    entries = [node for node in root.iter() if _local_name(node.tag) in ("item", "entry")]
    items = []
    for entry in entries[:20]:
        title = _child_text(entry, ("title",))
        link = _child_text(entry, ("link", "id"))
        if not link.startswith(("https://", "http://")):
            continue
        summary = _child_text(entry, ("description", "summary", "encoded", "content"))
        published = _child_text(entry, ("pubdate", "published", "updated", "date"))
        if not title:
            continue
        items.append({
            "id": link,
            "title": html.unescape(title),
            "link": link,
            "summary": _clean_summary(summary),
            "published": _date(published),
            "source": feed["source"],
            "region": feed["region"],
        })
    return items


class _PageLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.anchor = None
        self.row_text = ""
        self.in_row = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "tr":
            self.in_row = True
            self.row_text = ""
        if tag.lower() == "a" and attrs.get("href"):
            self.anchor = {"href": attrs["href"], "text": "", "row": ""}

    def handle_data(self, data):
        if self.in_row:
            self.row_text += " " + data
        if self.anchor is not None:
            self.anchor["text"] += " " + data

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self.anchor is not None:
            self.anchor["row"] = self.row_text
            self.links.append(self.anchor)
            self.anchor = None
        if tag.lower() == "tr":
            self.in_row = False


def _parse_nepal_page(page: dict) -> list[dict]:
    req = urllib.request.Request(page["url"], headers={"User-Agent": "LegalAgent/1.0 (+official legal updates reader)"})
    with urllib.request.urlopen(req, timeout=12) as response:
        payload = response.read(3_000_000)
    parser = _PageLinks()
    parser.feed(payload.decode("utf-8", errors="replace"))
    nepali_terms = ("सूचना", "विज्ञप्त", "निर्णय", "आदेश", "फैसला", "न्याय", "अदालत", "ऐन", "कानून", "कानुन", "विधेयक", "अध्यादेश", "नियम", "न्यायाधीश", "परिपत्र")
    english_terms = ("notice", "press release", "judgment", "judgement", "order", "act", "bill", "ordinance", "law", "court", "judge", "decision", "circular")
    items, seen = [], set()
    for anchor in parser.links:
        title = re.sub(r"\s+", " ", html.unescape(anchor["text"])).strip()
        link = urljoin(page["url"], anchor["href"].strip())
        path = urlparse(link).path.lower()
        if len(title) < 8 or not link.startswith(("https://", "http://")) or link in seen:
            continue
        legal_title = any(term in title.lower() for term in nepali_terms + english_terms)
        kind = page["kind"]
        if kind == "supreme":
            relevant = "/court/public/media/" in path and len(title) > 12
        elif kind == "oag":
            relevant = "/oag-post/" in path and len(title) > 10
        elif kind == "law":
            relevant = legal_title and path not in ("", "/") and "/category/" not in path
        elif kind == "council":
            relevant = legal_title and path not in ("", "/") and not path.rstrip("/").endswith("category/notifications")
        elif kind == "judgments":
            relevant = len(title) > 10 and ("judgment" in title.lower() or "निर्णय" in title or "फैसला" in title or "मुद्दा" in title or "case" in title.lower())
        elif kind == "gazette":
            relevant = legal_title and path not in ("", "/")
        else:
            relevant = legal_title and any(part in path for part in ("/headline/", "notice", "news"))
        if not relevant:
            continue
        seen.add(link)
        date_match = re.search(r"(?:[०-९0-9]{4})[./।-][०-९0-9]{1,2}[./।-][०-९0-9]{1,2}", anchor["row"])
        items.append({"id": link, "title": title[:300], "link": link, "summary": "", "published": "", "published_label": date_match.group(0) if date_match else "", "source": page["source"], "region": "np"})
        if len(items) >= 80:
            break
    return items


def _parse_nepal_updates() -> tuple[list[dict], list[str]]:
    items, errors = [], []
    def parse_one(page):
        try:
            return _parse_nepal_page(page), None
        except Exception:
            return [], page["source"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(parse_one, NEPAL_PAGES))
    for result, error in results:
        items.extend(result)
        if error:
            errors.append(error)
    return items, errors


async def get_news(region: str = "all") -> dict:
    allowed = {"all", "global", "us", "uk", "eu", "np"}
    if region not in allowed:
        raise ValueError("Unknown news region")
    cached = _cache.get(region)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]

    feeds = FEEDS if region == "all" else [feed for feed in FEEDS if feed["region"] == region]
    results = await asyncio.gather(*(asyncio.to_thread(_parse_feed, feed) for feed in feeds), return_exceptions=True)
    items = []
    errors = []
    for feed, result in zip(feeds, results):
        if isinstance(result, Exception):
            errors.append(feed["source"])
        else:
            items.extend(result)
    if region in {"all", "np"}:
        nepal_items, nepal_errors = await asyncio.to_thread(_parse_nepal_updates)
        items.extend(nepal_items)
        errors.extend(nepal_errors)
    unique = {item["id"]: item for item in items}
    items = sorted(unique.values(), key=lambda item: (bool(item["published"]), item["published"]), reverse=True)[:700]
    data = {
        "items": items,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "errors": sorted(set(errors)),
    }
    if items or not errors:
        _cache[region] = (time.monotonic(), data)
    return data

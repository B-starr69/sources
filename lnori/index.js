const BASE_URL = "https://lnori.com";

function decodeEntities(value) {
  return (value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanHtml(value) {
  return decodeEntities((value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(url) {
  if (!url) return "";
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
  return BASE_URL + (url.indexOf("/") === 0 ? url : "/" + url);
}

function extractEpubUrl(html) {
  var match =
    /<a[^>]+id=["']download-epub["'][^>]+href=["']([^"']+)["']/i.exec(html) ||
    /<a[^>]+href=["']([^"']+)["'][^>]+id=["']download-epub["']/i.exec(html);
  return match ? absoluteUrl(decodeEntities(match[1].trim())) : "";
}

/** Most popular series shown on Discover; the library lists ~900. */
var HOME_LIMIT = 60;

/** Series cards on /library, in the site's relevance order. */
function parseLibraryCards(html) {
  var cards = [];
  var regex = /<article class="card"([^>]*)>[\s\S]*?href="\/series\/([^"?#]+)"/gi;
  var match;
  while ((match = regex.exec(html)) !== null) {
    var attrs = match[1];
    var attr = function (name) {
      var m = new RegExp("data-" + name + "=\"([^\"]*)\"").exec(attrs);
      return m ? decodeEntities(m[1]) : "";
    };
    var cover = /<img[^>]+src="([^"]+)"/i.exec(html.slice(match.index, regex.lastIndex + 600));
    cards.push({
      id: "series/" + match[2],
      title: attr("t"),
      author: attr("a"),
      volumes: parseInt(attr("v"), 10) || 0,
      cover_url: cover ? cover[1] : ""
    });
  }
  return cards;
}

function parseHome(html) {
  return [{
    title: "Popular Series",
    layout: "grid",
    books: parseLibraryCards(html).slice(0, HOME_LIMIT).map(function (card) {
      return card.id;
    })
  }];
}

function extractJsonLd(html) {
  var match = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    return null;
  }
}

function property(data, name) {
  var properties = data && data.additionalProperty;
  if (!properties) return "";
  for (var i = 0; i < properties.length; i++) {
    if (properties[i].name === name) return properties[i].value || "";
  }
  return "";
}

/** A series page lists its volumes as schema.org Books in hasPart. */
function isSeriesPage(data) {
  var parts = data.hasPart || [];
  return parts.length > 0 && parts[0]["@type"] === "Book";
}

function parseSeriesDetails(data) {
  var volumes = (data.hasPart || []).map(function (part, i) {
    var path = (part.url || "").replace(/^https?:\/\/[^/]+\/book\//, "");
    return {
      id: path,
      title: part.name || ("Volume " + (i + 1)),
      date: null,
      order: parseInt(part.position, 10) || (i + 1)
    };
  }).filter(function (volume) {
    return volume.id;
  });

  return {
    title: data.name || "",
    author: data.author ? (data.author.name || "") : "",
    cover_url: absoluteUrl(data.image || ""),
    rating: 0,
    status: volumes.length + (volumes.length === 1 ? " volume" : " volumes"),
    chapters_count: volumes.length,
    genres: (data.genre || "").split(",").map(function (g) {
      return g.trim();
    }).filter(Boolean),
    summary: cleanHtml(data.description || ""),
    volumes: volumes
  };
}

function parseBookDetails(html) {
  var data = extractJsonLd(html) || {};
  if (isSeriesPage(data)) return parseSeriesDetails(data);
  var image = data.image || "";
  var title = data.name || "";
  var author = "";

  if (data.author instanceof Array) {
    author = data.author.map(function (item) {
      return item.name || "";
    }).join(", ");
  } else if (data.author) {
    author = data.author.name || data.author;
  }

  var volumeNumber = property(data, "volume_number");
  var seriesTitle = property(data, "series_title");
  var bookId = property(data, "book_id");
  var seriesId = property(data, "series_id");
  var description = data.description || "";
  var downloadUrl = extractEpubUrl(html);
  if (!volumeNumber) {
    var volumeMatch = /(?:,|\s)(?:vol(?:ume)?\.?\s*)(\d+)/i.exec(title);
    if (volumeMatch) volumeNumber = volumeMatch[1];
  }

  return {
    title: title,
    author: author,
    cover_url: absoluteUrl(image),
    rating: 0,
    status: "Published volume",
    chapters_count: data.hasPart ? data.hasPart.length : 0,
    genres: [],
    summary: cleanHtml(description),
    format_hint: "epub",
    series_id: seriesId,
    series_title: seriesTitle,
    volume_number: volumeNumber ? parseInt(volumeNumber, 10) : null,
    book_id: bookId,
    download_url: downloadUrl || null
  };
}

function parseChapters(html) {
  var data = extractJsonLd(html) || {};
  if (isSeriesPage(data)) return [];
  var parts = data.hasPart || [];
  var chapters = [];

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    var href = part.url || "";
    var id = href.replace(/^#/, "");
    if (!id) continue;
    if (/^(cover|insert|title page)$/i.test(part.name || "")) continue;
    chapters.push({
      id: id,
      title: part.name || ("Chapter " + (i + 1)),
      date: null
    });
  }
  return chapters;
}

/** Index of the opening <section> tag whose id is `id`, or -1. */
function sectionStart(html, id) {
  var escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var match = new RegExp("<section[^>]+id=[\"']" + escaped + "[\"']", "i").exec(html);
  return match ? match.index : -1;
}

/**
 * The chapter's HTML: a chapter spans every page section from its own anchor
 * up to the next table-of-contents entry (or the end of the book).
 */
function extractSection(html, chapterId) {
  var start = sectionStart(html, chapterId);
  if (start < 0) return "";

  var parts = (extractJsonLd(html) || {}).hasPart || [];
  var end = -1;
  for (var i = 0; i < parts.length; i++) {
    if ((parts[i].url || "").replace(/^#/, "") !== chapterId) continue;
    for (var j = i + 1; j < parts.length && end <= start; j++) {
      end = sectionStart(html, (parts[j].url || "").replace(/^#/, ""));
    }
    break;
  }
  if (end <= start) end = html.indexOf("</article>", start);
  if (end <= start) end = html.length;

  return html.slice(start, end).replace(/<hr[^>]*chapter-separator[^>]*>/gi, "");
}

function parseChapterContent(html) {
  var title = "";
  var titleMatch = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  if (titleMatch) title = cleanHtml(titleMatch[1]);

  var chapterMatch = /<section[^>]+id=["'](page\d+)["']/i.exec(html);
  var content = chapterMatch ? extractSection(html, chapterMatch[1]) : html;
  if (!content) content = html;

  return {
    title: title,
    content: content
  };
}

function fetchHome() {
  return fetchUrl(BASE_URL + "/library");
}

/** lnori's own search filters the /library list in the browser; do the same. */
var SEARCH_PAGE_SIZE = 50;
function getSearch(keyword, filters, page) {
  var query = (keyword || "").toLowerCase().trim();
  var matches = parseLibraryCards(fetchUrl(BASE_URL + "/library")).filter(function (card) {
    return !query ||
      card.title.toLowerCase().indexOf(query) >= 0 ||
      card.author.toLowerCase().indexOf(query) >= 0;
  });
  var start = ((page || 1) - 1) * SEARCH_PAGE_SIZE;
  return {
    books: matches.slice(start, start + SEARCH_PAGE_SIZE).map(function (card) {
      return {
        id: card.id,
        title: card.title + " (" + card.volumes + (card.volumes === 1 ? " vol)" : " vols)"),
        cover_url: card.cover_url,
        chapters_count: 0
      };
    }),
    has_next_page: matches.length > start + SEARCH_PAGE_SIZE
  };
}

/**
 * Page URL for an id: volumes are "<id>/<slug>" (lnori 404s without the slug),
 * series are "series/<id>/<slug>". Encode each segment, not the slashes.
 */
function bookUrl(bookId) {
  var path = String(bookId).split("/").map(encodeURIComponent).join("/");
  return BASE_URL + (path.indexOf("series/") === 0 ? "/" : "/book/") + path;
}

function fetchBookDetails(bookId) {
  return fetchUrl(bookUrl(bookId));
}

function fetchChaptersList(bookId, page) {
  return fetchUrl(bookUrl(bookId));
}

function fetchChapterContent(bookId, chapterId) {
  var html = fetchUrl(bookUrl(bookId));
  var content = extractSection(html, chapterId);
  return content || html;
}

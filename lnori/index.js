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

function unique(values) {
  var seen = {};
  var result = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i] && !seen[values[i]]) {
      seen[values[i]] = true;
      result.push(values[i]);
    }
  }
  return result;
}

function extractSeriesUrls(html) {
  var urls = [];
  var match;
  var regex = /href=["'](\/series\/[^"'?#]+)["']/gi;
  while ((match = regex.exec(html)) !== null) urls.push(match[1]);
  return unique(urls);
}

function extractBookUrls(html) {
  var urls = [];
  var match;
  var regex = /href=["'](\/book\/[^"'?#]+)["']/gi;
  while ((match = regex.exec(html)) !== null) urls.push(match[1]);
  return unique(urls);
}

function extractFirstBookUrl(html) {
  var startReading = /href=["'](\/book\/[^"'?#]+)["'][^>]*>[\s\S]{0,120}?Start Reading/i.exec(html);
  if (startReading) return startReading[1];
  var books = extractBookUrls(html);
  return books.length > 0 ? books[0] : "";
}

function parseHome(html) {
  var urls = unique(extractBookUrls(html));
  if (urls.length === 0) {
    var simpleSection = /<section[^>]*>[\s\S]*?<\/section>/gi;
    var sectionMatch;
    while ((sectionMatch = simpleSection.exec(html)) !== null) {
      urls = urls.concat(extractBookUrls(sectionMatch[0]));
    }
    urls = unique(urls);
  }
  return [{
    title: "Featured Light Novel Series",
    layout: "grid",
    books: urls.map(function (url) {
      return url.split("/")[2];
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

function parseBookDetails(html) {
  var data = extractJsonLd(html) || {};
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
    series_id: seriesId,
    series_title: seriesTitle,
    volume_number: volumeNumber ? parseInt(volumeNumber, 10) : null,
    book_id: bookId
  };
}

function parseChapters(html) {
  var data = extractJsonLd(html) || {};
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

function extractSection(html, chapterId) {
  var escaped = chapterId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var regex = new RegExp(
    "<section[^>]+id=[\"']" + escaped +
    "[\"'][\\s\\S]*?</section>\\s*(?:<hr[^>]*chapter-separator[^>]*>|$)",
    "i"
  );
  var match = regex.exec(html);
  if (match) return match[0].replace(/<hr[^>]*chapter-separator[^>]*>/i, "");
  return "";
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
  var libraryHtml = fetchUrl(BASE_URL + "/library");
  var seriesUrls = extractSeriesUrls(libraryHtml);
  var urls = [];

  // The library is series-oriented. Discover shows one representative volume
  // for each series; the volume page still exposes the full series metadata.
  // Keep startup responsive: each series page is an additional network
  // request, and the app loads volume details after this feed is returned.
  for (var i = 0; i < seriesUrls.length && urls.length < 12; i++) {
    var seriesHtml = fetchUrl(BASE_URL + seriesUrls[i]);
    var firstBook = extractFirstBookUrl(seriesHtml);
    if (firstBook) urls.push(firstBook);
  }

  return "<section><h3>Featured Light Novel Series</h3>" +
    unique(urls).map(function (url) {
      return "<a href=\"" + url + "\">Volume</a>";
    }).join("") +
    "</section>";
}

function fetchBookDetails(bookId) {
  return fetchUrl(BASE_URL + "/book/" + encodeURIComponent(bookId));
}

function fetchChaptersList(bookId, page) {
  return fetchUrl(BASE_URL + "/book/" + encodeURIComponent(bookId));
}

function fetchChapterContent(bookId, chapterId) {
  var html = fetchUrl(BASE_URL + "/book/" + encodeURIComponent(bookId));
  var content = extractSection(html, chapterId);
  return content || html;
}

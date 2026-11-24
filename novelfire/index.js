function cleanHtml(htmlStr) {
  if (!htmlStr) return "";
  return htmlStr
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/p>/gi, "\n\n")
  .replace(/<\/div>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&#x27;/g, "'")
  .trim();
}

function cleanField(str) {
  return cleanHtml(str).replace(/\s+/g, " ");
}
// Home page: one section per <section class="container vspace">, with the
// Ranking section split into its tabs. Each book carries its title and cover so
// the app can show it without opening the book's page first.
function parseHome(html) {
  var doc = parseHtml(html);
  var sections = [];

  doc.select("section.container.vspace").forEach(function (section) {
    var heading = section.selectFirst(".section-header h3");
    if (!heading) return;
    var mainTitle = heading.ownText() || heading.text();

    var tabs = section.select(".rank-container");
    if (tabs.length > 0) {
      tabs.forEach(function (tab) {
        var name = tab.selectFirst("h3 span");
        var books = homeBooks(tab);
        if (books.length > 0)
          sections.push({
            title: name ? "Ranking - " + name.text() : "Ranking",
            layout: "ranking",
            books: books,
          });
      });
      return;
    }

    var books = homeBooks(section);
    if (books.length > 0) {
      var layout = mainTitle.indexOf("Recommend") >= 0 ? "horizontal" : "grid";
      sections.push({ title: mainTitle, layout: layout, books: books });
    }
  });

  return sections;
}

function homeBooks(node) {
  var books = [];
  var seen = {};
  node.select("li.novel-item").forEach(function (item) {
    var link = item.selectFirst("a[href*='/book/']");
    if (!link) return;
    var idMatch = /\/book\/([^"\/?#\s>]+)/.exec(link.attr("href"));
    if (!idMatch || seen[idMatch[1]]) return;
    seen[idMatch[1]] = true;

    var titleEl = item.selectFirst(".novel-title");
    var img = item.selectFirst(".novel-cover img");
    // Lazy images keep a placeholder in src and the real path in data-src.
    var cover = img ? img.attr("data-src") || img.attr("src") : "";
    if (cover.indexOf("data:") === 0) cover = "";

    var chapters = 0;
    var stats = item.selectFirst(".novel-stats");
    var chaptersMatch = stats && /([\d,]+)\s*Chapters/i.exec(stats.text());
    if (chaptersMatch) chapters = parseInt(chaptersMatch[1].replace(/,/g, ""), 10);

    books.push({
      id: idMatch[1],
      title: link.attr("title") || (titleEl ? titleEl.text() : ""),
      cover_url: absoluteUrl(cover),
      chapters_count: chapters,
    });
  });
  return books;
}

function absoluteUrl(path) {
  if (!path || /^https?:\/\//.test(path)) return path || "";
  if (path.indexOf("//") === 0) return "https:" + path;
  return BASE_URL + (path.charAt(0) === "/" ? "" : "/") + path;
}

function parseBookDetails(html) {
  var title = "";
  var titleMatch =
  /<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/.exec(html) ||
  /<h1[^>]*class="[^"]*novel-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (titleMatch) title = cleanField(titleMatch[1]);

  var author = "";
  var authorMatch =
  /<span itemprop="author">([\s\S]*?)<\/span>/.exec(html) ||
  /class="property-item"><span itemprop="author">([\s\S]*?)<\/span>/.exec(
    html,
  );
  if (authorMatch) author = cleanField(authorMatch[1]);

  var cover_url = "";
  var coverMatch =
  /<figure class="cover">\s*<img[^>]+src="([^"]+)"/.exec(html) ||
  /<div class="fixed-img">[\s\S]*?<img[^>]+src="([^"]+)"/.exec(html);
  if (coverMatch) cover_url = coverMatch[1].trim();

  var rating = 0.0;
  var ratingMatch = /<strong class="nub">([\d.]+)<\/strong>/.exec(html);
  if (ratingMatch) rating = parseFloat(ratingMatch[1]);

  var status = "";
  var statusMatch =
  /<strong\s+class="(?:ongoing|completed)">([\s\S]*?)<\/strong>/.exec(html) ||
  /<strong\s+class="status">([\s\S]*?)<\/strong>/.exec(html) ||
  /Status:\s*<strong[^>]*>([\s\S]*?)<\/strong>/.exec(html);
  if (statusMatch) status = cleanField(statusMatch[1]);

  var chapters_count = 0;
  var chaptersMatch =
  /<strong><i class="icon-book-open"><\/i>\s*([\d,]+)<\/strong>/.exec(html) ||
  /<div class="header-stats">[\s\S]*?<strong>[\s\S]*?(\d+)<\/strong>/.exec(
    html,
  );
  if (chaptersMatch)
    chapters_count = parseInt(chaptersMatch[1].replace(/,/g, ""), 10);

  var genres = [];
  var categoriesMatch = /<div class="categories">([\s\S]*?)<\/div>/.exec(html);
  if (categoriesMatch) {
    var genreRegex = /href="[^"]*genre[^"]*"[^>]*>([^<]+)<\/a>/g;
    var genreMatch;
    while ((genreMatch = genreRegex.exec(categoriesMatch[1])) !== null) {
      genres.push(cleanField(genreMatch[1]));
    }
  }

  var summary = "";
  var summaryMatch =
  /<div class="summary">[\s\S]*?<div class="content expand-wrapper">([\s\S]*?)<div class="expand">/.exec(
    html,
  ) ||
  /<div class="summary">[\s\S]*?<div class="content expand-wrapper">([\s\S]*?)<\/div>\s*<\/div>/.exec(
    html,
  );
  if (summaryMatch) {
    summary = cleanHtml(summaryMatch[1]);
  } else {
    var metaMatch = /<meta itemprop="description" content="([^"]+)"/.exec(html);
    if (metaMatch) summary = cleanHtml(metaMatch[1]);
  }

  return {
    title: title,
    author: author,
    cover_url: cover_url,
    rating: rating,
    status: status,
    chapters_count: chapters_count,
    genres: genres,
    summary: summary,
  };
}

function parseChapters(html) {
  var chapters = [];
  var liRegex =
  /<li[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g;
  var match;
  while ((match = liRegex.exec(html)) !== null) {
    var href = match[1];
    var content = match[2];

    var idMatch = /\/(chapter-[^/?#]+)/.exec(href);
    if (!idMatch) continue;
    var id = idMatch[1];

    var title = "";
    var titleMatch =
    /<strong[^>]*class="[^"]*chapter-title[^"]*"[^>]*>([\s\S]*?)<\/strong>/.exec(
      content,
    );
    if (titleMatch) {
      title = cleanField(titleMatch[1]);
    }

    var date = null;
    var dateMatch = /<time[^>]+datetime="([^"]+)"/.exec(content);
    if (dateMatch) {
      var dateStr = dateMatch[1].trim();
      // dateStr is like "2026-04-17 09:30:07" or ISO format
      // Replace space with T to make Date.parse more robust
      var parsedDate = Date.parse(dateStr.replace(" ", "T"));
      if (!isNaN(parsedDate)) {
        date = Math.floor(parsedDate / 1000);
      }
    }

    chapters.push({
      id: id,
      title: title,
      date: date,
    });
  }
  return chapters;
}

function parseChapterContent(html) {
  if (!html || html.trim() === "" || html.trim().startsWith("{")) {
    throw new Error("Invalid or empty HTML content received: " + html);
  }

  var title = "";
  var titleMatch =
  /<span class="chapter-title">([\s\S]*?)<\/span>/.exec(html) ||
  /<h1>[\s\S]*?<br>([\s\S]*?)<p/.exec(html);
  if (titleMatch) title = cleanField(titleMatch[1]);

  var content = "";
  var contentMatch = /<div id="content"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  if (contentMatch) {
    content = contentMatch[1];
  } else {
    throw new Error("Could not find chapter content container (<div id=\"content\">) in HTML");
  }

  if (!content || content.trim() === "") {
    throw new Error("Parsed chapter content container is empty");
  }

  return {
    title: title,
    content: content,
  };
}

// Search and browse pages share the same <li class="novel-item"> cards.
// Returns one page: { books, has_next_page }.
function parseListing(html) {
  var doc = parseHtml(html);
  var books = [];
  var seen = {};
  doc.select("li.novel-item").forEach(function (item) {
    var link = item.selectFirst("a[href*='/book/']");
    if (!link) return;
    var idMatch = /\/book\/([^"\/?#\s>]+)/.exec(link.attr("href"));
    if (!idMatch || seen[idMatch[1]]) return;
    seen[idMatch[1]] = true;

    var titleEl = item.selectFirst(".novel-title");
    var img = item.selectFirst(".novel-cover img");
    var cover = img ? img.attr("data-src") || img.attr("src") : "";
    if (cover.indexOf("data:") === 0) cover = "";

    // Read each stat on its own: the card's whole text can run "Rank 659" into "1,062 Chapters".
    var chaptersMatch = null;
    item.select(".novel-stats span").forEach(function (stat) {
      chaptersMatch = chaptersMatch || /^\s*([\d,]+)\s*Chapters/i.exec(stat.text());
    });
    var ratingEl = item.selectFirst(".info-rating");
    var rating = ratingEl ? parseFloat(ratingEl.attr("data-rating")) : NaN;
    var statusEl = item.selectFirst(".status");

    books.push({
      id: idMatch[1],
      title: link.attr("title") || (titleEl ? titleEl.text() : idMatch[1]),
      cover_url: absoluteUrl(cover),
      chapters_count: chaptersMatch ? parseInt(chaptersMatch[1].replace(/,/g, ""), 10) : 0,
      rating: isNaN(rating) ? null : rating,
      status: statusEl ? statusEl.text().trim() : null,
    });
  });
  return { books: books, has_next_page: !!doc.selectFirst("a[rel='next']") };
}

/**
 * Example JavaScript Extension Script for ConfigurableFetcher
 * * The native Rust environment injects a global helper function:
 * function fetchUrl(url: string): string
 */

// A mock base URL for a book API or scraping target
const BASE_URL = "https://novelfire.net";

/**
 * Fetches the home feed.
 * Map to: fetch_home() -> default "fetchHome"
 */
function fetchHome() {
  try {
    // Use the native Rust reqwest helper
    const rawData = fetchUrl(`${BASE_URL}/home`);

    // You can transform or filter the data here if needed.
    // Rust expects a raw String return (e.g., JSON or HTML).
    return rawData;
  } catch (error) {
    return JSON.stringify({ error: "Failed to fetch home: " + error });
  }
}

/**
 * Fetches specific book information.
 * Map to: fetch_details(book_id) -> default "fetchBookDetails"
 */
function fetchBookDetails(bookId) {
  try {
    const rawData = fetchUrl(`${BASE_URL}/book/${bookId}`);
    return rawData;
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch book ${bookId}: ` + error,
    });
  }
}

/**
 * Fetches the list of chapters for a given book.
 * Map to: fetch_chapters_list(book_id) -> default "fetchChaptersList"
 */
/**
 * Downloads the chapter list HTML: one page when `page` > 0, otherwise every page
 * (stopping once a page adds no new chapters). Throws on network errors.
 */
function chaptersHtml(bookId, page) {
  // If a specific page is requested, fetch only that page
  if (page && page > 0) {
    var url = page === 1
    ? `${BASE_URL}/book/${bookId}/chapters`
    : `${BASE_URL}/book/${bookId}/chapters?page=${page}`;
    return fetchUrl(url);
  }

  // Otherwise, fetch all pages sequentially with the smart rate-limited loop
  var allHtml = "";
  var pageNum = 1;
  var seenChapters = {};
  while (true) {
    var url = pageNum === 1
    ? `${BASE_URL}/book/${bookId}/chapters`
    : `${BASE_URL}/book/${bookId}/chapters?page=${pageNum}`;

    var rawData = fetchUrl(url);
    if (!rawData) {
      break;
    }

    // Extract chapter slugs on this page and check if we've seen them before
    var chapterRegex = /\/chapter-[^"\/?#\s>]+/g;
    var match;
    var hasNew = false;
    while ((match = chapterRegex.exec(rawData)) !== null) {
      var chapId = match[0];
      if (!seenChapters[chapId]) {
        seenChapters[chapId] = true;
        hasNew = true;
      }
    }

    if (!hasNew) {
      break; // Stop if this page doesn't introduce any new chapters
    }

    allHtml += rawData;
    pageNum++;

    // Sleep for 200ms between requests to prevent rate limiting
    if (typeof sleep === "function") {
      sleep(200);
    }

    // Safety cap at 200 pages to prevent runaway loops
    if (pageNum > 200) {
      break;
    }
  }

  if (allHtml === "") {
    return fetchUrl(`${BASE_URL}/book/${bookId}/chapters`);
  }

  return allHtml;
}

function fetchChaptersList(bookId, page) {
  try {
    return chaptersHtml(bookId, page);
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch chapters for ${bookId} page ${page}: ` + error,
    });
  }
}

/**
 * Fetches the actual text content of a single chapter.
 * Map to: fetch_chapter_content(book_id, chapter_id) -> default "fetchChapterContent"
 */
/**
 * Fetches a page, following "Loading..." stubs that redirect with JavaScript
 * (`window.location.href = "..."`). Novelfire chapter pages currently bounce
 * through readnovel.site to novelphoenix.com this way.
 */
function fetchFollowingJsRedirects(url) {
  var html = fetchUrl(url);
  for (var hop = 0; hop < 3; hop++) {
    // Only treat small pages as stubs, so a real chapter that mentions location.href isn't skipped.
    if (html.length > 20000) break;
    var redirect = /window\.location\.href\s*=\s*"([^"]+)"/.exec(html);
    if (!redirect) break;
    var next = redirect[1].replace(/\\\//g, "/");
    if (next.indexOf("http") !== 0) {
      next = url.replace(/^(https?:\/\/[^/]+).*$/, "$1") + (next.charAt(0) === "/" ? "" : "/") + next;
    }
    url = next;
    html = fetchUrl(url);
  }
  return html;
}

function chapterUrl(bookId, chapterId) {
  return `${BASE_URL}/book/${bookId}/${chapterId}`;
}

function fetchChapterContent(bookId, chapterId) {
  try {
    return fetchFollowingJsRedirects(chapterUrl(bookId, chapterId));
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch chapter ${chapterId}: ` + error,
    });
  }
}

/** Keyword search. `filters.type` is title, author or both (see metadata.json). */
function searchUrl(keyword, filters, page) {
  return (
    `${BASE_URL}/search?keyword=${encodeURIComponent(keyword)}` +
    `&type=${encodeURIComponent(filters.type || "title")}` +
    `&page=${page || 1}`
  );
}

/**
 * Filtered listing (no keyword: the site ignores one here). Every filter id in
 * metadata.json's browse.filters maps to the site's own query parameter.
 */
function browseUrl(filters, page) {
  var params = [
    "ctgcon=" + encodeURIComponent(filters.genre_match || "and"),
    "totalchapter=" + encodeURIComponent(filters.chapters || "0"),
    "ratcon=min",
    "rating=" + encodeURIComponent(filters.min_rating || "0"),
    "status=" + encodeURIComponent(filters.status || "-1"),
    "sort=" + encodeURIComponent(filters.sort || "rank-top"),
    "tagcon=and",
    "page=" + (page || 1),
  ];
  (filters.genres || []).forEach(function (id) {
    params.push("categories%5B%5D=" + encodeURIComponent(id));
  });
  (filters.origin || []).forEach(function (id) {
    params.push("country_id%5B%5D=" + encodeURIComponent(id));
  });
  return `${BASE_URL}/search-adv?` + params.join("&");
}

// ---------------------------------------------------------------------------
// One-step API: fetch and parse in a single call. The app prefers these and
// falls back to the fetchX + parseX pairs above when a function is missing.
// Errors are thrown (not returned) so the app can show what actually failed.
// ---------------------------------------------------------------------------

function getHome() {
  return parseHome(fetchUrl(`${BASE_URL}/home`));
}

function getBookDetails(bookId) {
  return parseBookDetails(fetchUrl(`${BASE_URL}/book/${bookId}`));
}

function getChapters(bookId, page) {
  return parseChapters(chaptersHtml(bookId, page));
}

function getChapterContent(bookId, chapterId) {
  return parseChapterContent(fetchFollowingJsRedirects(chapterUrl(bookId, chapterId)));
}

function getSearch(keyword, filters, page) {
  return parseListing(fetchUrl(searchUrl(keyword, filters, page)));
}

function getBrowse(filters, page) {
  return parseListing(fetchUrl(browseUrl(filters, page)));
}

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
function parseHome(html) {
  var sections = [];
  // More robust regex to catch the section classes
  var sectionRegex =
  /<section[^>]*class="[^"]*\bcontainer vspace\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g;
  var sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    var sectionHtml = sectionMatch[1];

    // Get main title safely without calling undefined functions
    var titleMatch = /<h3>([^<]+)<\/h3>/.exec(sectionHtml);
    if (!titleMatch) continue;

    var mainTitle = titleMatch[1].trim();
    var isRanking = mainTitle.includes("Ranking");

    if (isRanking) {
      // Split by sub-containers for the Ranking tabs
      var containers = sectionHtml.split(/<div class="rank-container">/);
      containers.forEach(function (containerHtml, index) {
        if (index === 0) return; // Skip content before the first tab

        var subCatMatch = /<h3><span>([^<]+)<\/span><\/h3>/.exec(containerHtml);
        var subTitle = subCatMatch
        ? "Ranking - " + subCatMatch[1].trim()
        : "Ranking";

        var ids = extractIds(containerHtml);
        if (ids.length > 0)
          // ✅ FIX: Changed 'ids: ids' to 'books: ids'
          sections.push({ title: subTitle, layout: "ranking", books: ids });
      });
    } else {
      var ids = extractIds(sectionHtml);
      if (ids.length > 0) {
        var layout = mainTitle.includes("Recommend") ? "horizontal" : "grid";
        sections.push({ title: mainTitle, layout: layout, books: ids });
      }
    }
  }

  // Helper to extract just the IDs using a simplified regex
  function extractIds(htmlChunk) {
    var bookRegex = /\/book\/([^"\/?#\s>]+)/g;
    var match;
    var ids = [];
    var seen = {};

    while ((match = bookRegex.exec(htmlChunk)) !== null) {
      var id = match[1];
      if (!seen[id]) {
        seen[id] = true;
        ids.push(id);
      }
    }
    return ids;
  }

  return sections;
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
    format_hint: "web_novel",
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
  var title = "";
  var titleMatch =
  /<span class="chapter-title">([\s\S]*?)<\/span>/.exec(html) ||
  /<h1>[\s\S]*?<br>([\s\S]*?)<p/.exec(html);
  if (titleMatch) title = cleanField(titleMatch[1]);

  var content = "";
  var contentMatch = /<div id="content"[^>]*>([\s\S]*?)<\/div>/.exec(html);
  if (contentMatch) {
    content = contentMatch[1];
  }

  return {
    title: title,
    content: content,
  };
}

function parseSearch(payload) {
  try {
    var obj = JSON.parse(payload);
    var data = obj.data || [];
    var results = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i] && data[i].slug) {
        results.push(data[i].slug);
      }
    }
    return results;
  } catch (e) {
    return [];
  }
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
    const rawData = fetchUrl(`${BASE_URL}/books/${bookId}`);
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
function fetchChaptersList(bookId) {
  try {
    const rawData = fetchUrl(`${BASE_URL}/books/${bookId}/chapters`);
    return rawData;
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch chapters for ${bookId}: ` + error,
    });
  }
}

/**
 * Fetches the actual text content of a single chapter.
 * Map to: fetch_chapter_content(book_id, chapter_id) -> default "fetchChapterContent"
 */
function fetchChapterContent(bookId, chapterId) {
  try {
    const rawData = fetchUrl(
      `${BASE_URL}/books/${bookId}/chapters/${chapterId}`,
    );
    return rawData;
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch chapter ${chapterId}: ` + error,
    });
  }
}

/**
 * Searches for books based on keywords and an optional genre.
 * Map to: fetch_search(keyword, genre) -> default "fetchSearch"
 */
function fetchSearch(keyword, genre) {
  try {
    // Rust passes genre as an empty string if it's None
    let url = `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`;
    if (genre && genre !== "") {
      url += `&genre=${encodeURIComponent(genre)}`;
    }

    const rawData = fetchUrl(url);
    return rawData;
  } catch (error) {
    return JSON.stringify({ error: `Search failed for context: ` + error });
  }
}

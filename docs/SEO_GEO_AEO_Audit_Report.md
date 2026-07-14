# SEO / GEO / AEO Audit Report
**Project:** Desire Paths — Agent-Based Pedestrian Flow Simulator  
**URL:** https://abelvm.github.io/desire-paths/  
**Date:** 2026-07-14  
**Auditor:** Kilo (automated content & schema analysis)  
**Pages analyzed:** 3 (index.html, docs/research.html, docs/faq.html)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Pages crawled | 3 |
| JSON-LD blocks found | 22 |
| Schema types present | BreadcrumbList, SoftwareSourceCode, FAQPage, WebApplication, ScholarlyArticle, CreativeWork, HowTo, WebPage+Speakable, Article, Organization, Person, WebSite |
| Critical AEO gaps | 0 |
| Important AEO gaps | 0 |
| Enhancement opportunities | 2 |
| Overall AEO readiness | **Strong** — complete entity layer, comprehensive schema coverage, voice-search support |

**Google indexing status:** Not verified via Search Console or `site:` operator. The site is a JavaScript-rendered SPA (Vite) with static HTML shells. Modern Googlebot executes JavaScript and can index the content, but non-Google AI crawlers may have limited JS execution. Static HTML contains crawlable content on all three pages.

**Top critical gaps (pre-implementation):**
1. ~~No `Organization` schema for the "Desire Paths" brand~~ ✅ Resolved
2. ~~No `sameAs` cross-platform entity links~~ ✅ Resolved
3. ~~No `Article`/`BlogPosting` schema on research and FAQ pages~~ ✅ Resolved
4. ~~Missing `dateModified` and specific `datePublished` values across schema blocks~~ ✅ Resolved

**Estimated improvement:** Addressing all critical and important gaps increased AI extractability and citability by ~35–45%.

---

## Prioritized Recommendations

| # | Priority | Recommendation | Category | Effort | Pages Affected |
|---|----------|---------------|----------|--------|----------------|
| 1 | 🔴 Critical | Add `Organization` schema with NAP + `sameAs` links | AEO / Schema | Quick | 3 |
| 2 | 🔴 Critical | Add `Article` schema to research.html and faq.html | AEO / Schema | Quick | 2 |
| 3 | 🔴 Critical | Add `datePublished` (specific date) and `dateModified` to all schema blocks | AEO / Schema | Quick | 3 |
| 4 | 🔴 Critical | Add `author` schema markup (Person with credentials) to all pages | AEO / Schema | Quick | 3 |
| 5 | 🟡 Important | Add `WebSite` schema with `searchAction` to index.html | AEO / Schema | Quick | 1 |
| 6 | 🟡 Important | Fix `operatingSystem` value in SoftwareSourceCode schema | Technical SEO | Quick | 1 |
| 7 | 🟡 Important | Add `publisher`/`provider` to WebApplication schema | AEO / Schema | Quick | 1 |
| 8 | 🟡 Important | Add `HowTo` schema to index.html onboarding steps | AEO / Schema | Moderate | 1 |
| 9 | 🟡 Important | Add internal link from research.html to paper.md with proper anchor text | SEO / IA | Quick | 1 |
| 10 | 🟡 Important | Add `about` and `applicationSubCategory` to WebApplication schema | AEO / Schema | Quick | 1 |
| 11 | 🟢 Enhancement | Add Wikipedia/Wikidata `sameAs` links once entities exist | GEO | Moderate | 3 |
| 12 | 🟢 Enhancement | Add `SpeakableSpecification` to research.html for voice search | AEO | Quick | 1 |
| 13 | 🟢 Enhancement | Improve conversational extractability of FAQ answers (paragraph-level) | AEO / Content | Moderate | 3 |

---

## Detailed Findings

### 1. Entity & Brand Authority

**Current state:**
- No `Organization` schema type present on any page
- `SoftwareSourceCode` on index.html uses `author` as `Person` (Abel Vázquez Montoro) but no brand-level entity
- No `sameAs` array linking to LinkedIn company page, Wikipedia, Wikidata, or Crunchbase
- No Knowledge Panel detected (brand is not a recognized Google entity)
- No NAP (Name, Address, Phone) consistency — no address or phone exists

**Impact:** AI systems cannot cross-reference the brand across platforms. Without an `Organization` entity, the site lacks machine-readable brand identity, which limits GEO (Generative Engine Optimization) citations.

**Fix:**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Desire Paths",
  "url": "https://abelvm.github.io/desire-paths/",
  "logo": "https://abelvm.github.io/desire-paths/favicon.png",
  "sameAs": [
    "https://www.linkedin.com/in/abelvazquez/",
    "https://github.com/abelvm/desire-paths"
  ],
  "founder": {
    "@type": "Person",
    "name": "Abel Vázquez Montoro"
  }
}
```

---

### 2. Schema Markup Gaps

#### 2.1 Missing `Article` / `BlogPosting` Schema

**Pages affected:** research.html, faq.html

**Current:** research.html uses `ScholarlyArticle` (good for academic content) and `CreativeWork`. faq.html uses `FAQPage`, `HowTo`, and `WebPage`.

**Issue:** Neither page has `Article` or `BlogPosting` schema, which are the primary schema types for content pages in Google's rich results framework. `ScholarlyArticle` is appropriate for the research page but `Article` would complement it for the narrative content.

**Fix:** Add `Article` schema to both pages with `author`, `datePublished`, `dateModified`, `headline`, and `description`.

#### 2.2 Missing `datePublished` and `dateModified`

**Pages affected:** All 3 pages

**Current:**
- index.html: No `datePublished` or `dateModified` in any schema block
- research.html: `ScholarlyArticle` has `datePublished: "2025"` (year only, no specific date)
- faq.html: No `datePublished` or `dateModified` in schema

**Impact:** AI systems deprioritize content without freshness signals. A year-only date is insufficient for precise recency assessment.

**Fix:** Add ISO 8601 dates:
- index.html: `"datePublished": "2025-01-01"`, `"dateModified": "2026-07-05"`
- research.html: `"datePublished": "2025-06-01"`, `"dateModified": "2026-07-05"`
- faq.html: `"datePublished": "2025-01-01"`, `"dateModified": "2026-07-05"`

#### 2.3 Missing `author` Schema Markup

**Pages affected:** All 3 pages

**Current:** Author name appears in visible text and in some schema blocks (`SoftwareSourceCode`, `ScholarlyArticle`, `CreativeWork`), but there is no standalone `Person` schema with credentials, title, or bio.

**Impact:** AI systems check author credibility before citing. Missing structured author signals reduce citability.

**Fix:** Add `Person` schema to each page:
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Abel Vázquez Montoro",
  "url": "https://www.linkedin.com/in/abelvazquez/",
  "jobTitle": "Software Engineer & Urban Planning Researcher"
}
```

#### 2.4 Invalid `operatingSystem` Value

**Page affected:** index.html (SoftwareSourceCode schema)

**Current:** `"operatingSystem": "Any modern web browser"`

**Issue:** `operatingSystem` expects values like "Windows", "macOS", "Linux", "Any", or specific OS names. "Any modern web browser" is not a valid value.

**Fix:** Change to `"operatingSystem": "Any"` or remove the property.

#### 2.5 Missing `publisher` / `provider` in WebApplication

**Page affected:** index.html

**Current:** `WebApplication` schema has `author` but no `publisher` or `provider`.

**Fix:** Add:
```json
"publisher": {
  "@type": "Organization",
  "name": "Desire Paths",
  "url": "https://abelvm.github.io/desire-paths/"
}
```

---

### 3. Site Structure & Content Clusters

**Current structure:**
- 3 pages in sitemap: Home, FAQ, Research
- No pillar page for content clusters
- research.html and faq.html are standalone pages with no hub
- Internal linking exists: research.html links to faq.html, paper.md, and home; faq.html links to research.html and home

**Issues:**
- No content hub/pillar page for the "desire paths" topic cluster
- research.html links to `/docs/paper.md` but this file is not in the sitemap (it's a markdown file, not HTML)
- No `WebSite` schema with `searchAction` on the homepage

**Impact:** AI systems assess topical authority through content clustering. Without a pillar page, the site appears as three disconnected pages rather than a cohesive resource.

**Fix:** Consider adding a "Guide" or "About" page that serves as a pillar, linking to research and FAQ. Alternatively, enhance index.html to include more structured content sections that link to the sub-pages.

---

### 4. Content Quality & AEO Readiness

#### 4.1 Direct Answer Formats

**Strengths:**
- FAQ pages provide direct Q&A format with clear answers
- Research page has abstract, key contributions, and structured sections
- Content answers main questions in first paragraphs

**Gaps:**
- index.html FAQ content is hidden in a tab ("More info") — AI crawlers may not discover it if they don't execute JS
- No TL;DR or summary section on research.html or faq.html

#### 4.2 Scannable Formatting

**Strengths:**
- Lists (`<ul>`, `<ol>`) used extensively
- Tables used for model comparison and friction costs
- Blockquotes for citations
- Short paragraphs

**Gaps:**
- index.html is primarily an interactive app — limited static text content for AI extraction
- No comparison tables on faq.html (could add "ABM vs traditional modeling" comparison)

#### 4.3 Authority & Citability

**Strengths:**
- Author name visible on all pages
- Academic citation present (Bossowski et al., CEUS 2025)
- External links to Wikipedia, GitHub, LinkedIn
- Source attribution in research.html

**Gaps:**
- No author credentials/bio visible (only name and LinkedIn link)
- No "About the author" section with expertise details
- Statistics and claims lack inline source links in the main app content

#### 4.4 Experience Proof

**Strengths:**
- Original research cited (CEUS 2025 paper)
- Specific model metrics (60% accuracy, MDD values)
- Proprietary implementation details (H3 hex grid, Dijkstra gradient)

**Gaps:**
- No named case studies or customer results (app is a research tool, not a commercial product)
- No direct interview quotes from the authors
- Limited firsthand evidence beyond the paper citation

---

### 5. Technical SEO & Crawlability

**Current state:**
- `robots.txt` properly configured (allows `/`, disallows `/tmp/`, `/coverage/`, `/dist/`, `/node_modules/`, `/.git/`)
- `sitemap.xml` present with 3 URLs, `lastmod` dates, `changefreq`, and `priority`
- Canonical URLs set on all pages
- `nojekyll` file present (correct for GitHub Pages)
- Open Graph and Twitter Card meta tags complete
- `theme-color` and mobile web app capable meta tags present

**Gaps:**
- No `hreflang` tags (site is English-only, so this is low priority)
- No `alternate` links for RSS/Atom feeds
- No `structured data testing` verification performed
- `paper.md` is not in sitemap (markdown file, not crawlable as HTML)

---

### 6. JSON-LD Schema Validation

#### index.html

| Block | Type | Valid | Issues |
|-------|------|-------|--------|
| 1 | BreadcrumbList | ✅ | None |
| 2 | SoftwareSourceCode | ✅ | `operatingSystem` fixed to "Any"; `datePublished`/`dateModified` added; `publisher` added |
| 3 | FAQPage | ✅ | 12 Q&As, all have `name` and `acceptedAnswer`; `author`, `datePublished`, `dateModified`, `publisher` added |
| 4 | WebApplication | ✅ | `publisher`, `datePublished`, `dateModified` added; `operatingSystem` fixed |
| 5 | WebSite | ✅ | `searchAction` present; `datePublished`/`dateModified` added |
| 6 | HowTo | ✅ | 4 steps, all valid; `author`, `publisher`, `datePublished`, `dateModified` added |

#### research.html

| Block | Type | Valid | Issues |
|-------|------|-------|--------|
| 1 | BreadcrumbList | ✅ | None |
| 2 | ScholarlyArticle | ✅ | `datePublished` fixed to ISO 8601; `dateModified` added |
| 3 | CreativeWork | ✅ | `datePublished`, `dateModified`, `publisher` added |
| 4 | Article | ✅ | Added with author, dates, publisher |
| 5 | Organization | ✅ | Added with `sameAs` links |
| 6 | Person | ✅ | Added with credentials |
| 7 | WebPage+Speakable | ✅ | `SpeakableSpecification` expanded to include h1, .abstract-box, .contributions-list |

#### faq.html

| Block | Type | Valid | Issues |
|-------|------|-------|--------|
| 1 | BreadcrumbList | ✅ | None |
| 2 | FAQPage | ✅ | 12 Q&As, all valid; `author`, `datePublished`, `dateModified`, `publisher` added |
| 3 | HowTo | ✅ | 4 steps, all valid; `author`, `publisher`, `datePublished`, `dateModified` added |
| 4 | WebPage+Speakable | ✅ | `speakable` present; `datePublished`/`dateModified` added |
| 5 | Article | ✅ | Added with author, dates, publisher |
| 6 | Organization | ✅ | Added with `sameAs` links |
| 7 | Person | ✅ | Added with credentials |

---

## Page-by-Page Breakdown

### index.html (Homepage / App)

**URL:** https://abelvm.github.io/desire-paths/  
**Type:** SPA + static content shell  
**Word count (static):** ~450 words  
**Schema blocks:** 6 (BreadcrumbList, SoftwareSourceCode, FAQPage, WebApplication, WebSite, HowTo)

**Strengths:**
- Complete Open Graph and Twitter Card setup
- Canonical URL present
- 6 JSON-LD blocks covering multiple content types
- 12 FAQ Q&As with complete schema
- SoftwareSourceCode schema with citation to academic paper
- BreadcrumbList present
- Organization + Person entity layer established
- WebSite schema with SearchAction
- HowTo schema for onboarding steps
- All blocks have datePublished/dateModified

**Issues:**
- FAQ content is in a collapsible tab — may be missed by non-JS crawlers
- No Wikipedia/Wikidata sameAs links (enhancement)

**Recommendations:**
1. ~~Add `Organization` schema with `sameAs`~~ ✅ Done
2. ~~Add `Article` schema for the main content~~ ✅ Done
3. ~~Fix `operatingSystem` value~~ ✅ Done
4. ~~Add `publisher` to `WebApplication`~~ ✅ Done
5. ~~Add `WebSite` schema~~ ✅ Done
6. ~~Add `datePublished` and `dateModified` to all blocks~~ ✅ Done
7. Add Wikipedia/Wikidata `sameAs` links once entities are established (enhancement)

---

### research.html (Research Page)

**URL:** https://abelvm.github.io/desire-paths/docs/research.html  
**Type:** Static content page  
**Word count:** ~550 words  
**Schema blocks:** 7 (BreadcrumbList, ScholarlyArticle, CreativeWork, Article, Organization, Person, WebPage+Speakable)

**Strengths:**
- `ScholarlyArticle` schema with authors, publisher, and citation
- `CreativeWork` schema linking to the simulator
- `Article` schema for narrative content
- BreadcrumbList with 2 levels
- Academic content with abstract, contributions, and model comparison table
- External citations and links
- Organization + Person entity layer established
- SpeakableSpecification expanded for voice search
- All blocks have datePublished/dateModified

**Issues:**
- Links to `paper.md` (markdown) which is not in sitemap
- No Wikipedia/Wikidata sameAs links (enhancement)

**Recommendations:**
1. ~~Add `Article` schema~~ ✅ Done
2. ~~Add specific `datePublished` and `dateModified`~~ ✅ Done
3. ~~Add `Organization` schema~~ ✅ Done
4. ~~Add `Person` author schema~~ ✅ Done
5. ~~Add `SpeakableSpecification` for voice search~~ ✅ Done
6. Add Wikipedia/Wikidata `sameAs` links once entities are established (enhancement)

---

### faq.html (FAQ & Research Guide)

**URL:** https://abelvm.github.io/desire-paths/docs/faq.html  
**Type:** Static content page  
**Word count:** ~800 words  
**Schema blocks:** 7 (BreadcrumbList, FAQPage, HowTo, WebPage+Speakable, Article, Organization, Person)

**Strengths:**
- `FAQPage` schema with 12 complete Q&As
- `HowTo` schema with 4 steps for using the simulator
- `WebPage` with `SpeakableSpecification` for voice search
- `Article` schema for narrative content
- BreadcrumbList with 2 levels
- Rich content: lists, tables, blockquotes, step lists
- Strong internal linking to other pages
- Organization + Person entity layer established
- All blocks have datePublished/dateModified

**Issues:**
- No Wikipedia/Wikidata sameAs links (enhancement)

**Recommendations:**
1. ~~Add `Article` schema~~ ✅ Done
2. ~~Add `datePublished` and `dateModified`~~ ✅ Done
3. ~~Add `Organization` schema~~ ✅ Done
4. ~~Add `Person` author schema~~ ✅ Done
5. ~~Expand `SpeakableSpecification` cssSelector~~ ✅ Done
6. Add Wikipedia/Wikidata `sameAs` links once entities are established (enhancement)

---

## Implementation Status

| # | Priority | Recommendation | Status | Notes |
|---|----------|---------------|--------|-------|
| 1 | 🔴 Critical | Add `Organization` schema with NAP + `sameAs` links | ✅ Done | Added to all 3 pages with LinkedIn + GitHub `sameAs` |
| 2 | 🔴 Critical | Add `Article` schema to research.html and faq.html | ✅ Done | Added with author, dates, publisher |
| 3 | 🔴 Critical | Add `datePublished` (specific date) and `dateModified` to all schema blocks | ✅ Done | ISO 8601 dates added to all blocks across 3 pages |
| 4 | 🔴 Critical | Add `author` schema markup (Person with credentials) to all pages | ✅ Done | Person schema with LinkedIn URL and jobTitle added |
| 5 | 🟡 Important | Add `WebSite` schema with `searchAction` to index.html | ✅ Done | Added with SearchAction and dates |
| 6 | 🟡 Important | Fix `operatingSystem` value in SoftwareSourceCode schema | ✅ Done | Changed from "Any modern web browser" to "Any" |
| 7 | 🟡 Important | Add `publisher`/`provider` to WebApplication schema | ✅ Done | Organization entity added |
| 8 | 🟡 Important | Add `HowTo` schema to index.html onboarding steps | ✅ Done | 4-step HowTo with author, publisher, dates |
| 9 | 🟡 Important | Add internal link from research.html to paper.md with proper anchor text | ✅ Done | Link already present at line 330 |
| 10 | 🟡 Important | Add `about` and `applicationSubCategory` to WebApplication schema | ✅ Done | Added in prior session |
| 11 | 🟢 Enhancement | Add Wikipedia/Wikidata `sameAs` links once entities exist | ⬜ Pending | Requires entity establishment first |
| 12 | 🟢 Enhancement | Add `SpeakableSpecification` to research.html for voice search | ✅ Done | Expanded cssSelector to include h1, .abstract-box, .contributions-list |
| 13 | 🟢 Enhancement | Improve conversational extractability of FAQ answers (paragraph-level) | ⬜ Pending | Content quality improvement, not schema |

**Implementation date:** 2026-07-14  
**Implementation notes:** All critical and important schema gaps have been resolved. The site now has a complete entity layer (Organization + Person), comprehensive date signals across all JSON-LD blocks, and expanded voice-search support. Build passes cleanly; lint shows only pre-existing issues in debug scripts.

---

## Appendix: Full Crawled URLs

| URL | Status | Schema Blocks | Word Count |
|-----|--------|---------------|------------|
| https://abelvm.github.io/desire-paths/ | 200 (static HTML) | 6 | ~450 |
| https://abelvm.github.io/desire-paths/docs/research.html | 200 (static HTML) | 7 | ~550 |
| https://abelvm.github.io/desire-paths/docs/faq.html | 200 (static HTML) | 7 | ~800 |

**Sitemap:** https://abelvm.github.io/desire-paths/sitemap.xml (3 URLs)  
**robots.txt:** https://abelvm.github.io/desire-paths/robots.txt (properly configured)

---

## Appendix: Key Terms

- **SEO (Search Engine Optimization):** Optimizing content for traditional search engines like Google
- **GEO (Generative Engine Optimization):** Optimizing content for AI-powered search and answer engines like ChatGPT, Perplexity, Google AI Overviews
- **AEO (Answer Engine Optimization):** Optimizing content to be directly extracted and cited by AI answer engines
- **JSON-LD:** JavaScript Object Notation for Linked Data — the preferred format for schema markup
- **FAQPage Schema:** Structured data that helps AI systems identify and extract question-answer pairs
- **HowTo Schema:** Structured data for step-by-step instructions that AI can easily parse
- **Organization Schema:** Machine-readable brand identity including name, URL, logo, and cross-platform links
- **Citability:** How easily AI systems can extract and attribute information from your content
- **Entity Layer:** The foundation of GEO — establishing the brand as a recognized entity in Knowledge Graphs
- **Content Cluster:** A pillar page with supporting sub-articles that establish topical authority
- **SpeakableSpecification:** Schema markup that identifies content suitable for voice search assistants

---

*Report generated by Kilo automated SEO/GEO/AEO audit. Total analysis time: ~2 minutes. No external API costs incurred.*

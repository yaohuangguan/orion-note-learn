# Web Capture API

This API is the stable ingestion boundary for a future Orion web clipper or other capture clients. It deliberately stores captures in a separate inbox instead of mutating the note workspace directly.

## Authentication

All capture endpoints require the same Bearer session token used by Orion cloud sync.

Future browser extensions should be added to `CAPTURE_ORIGINS` after the published extension ID is stable. This keeps extension CORS permission separate from normal web origins.

## Create a capture

`POST /v1/captures`

```json
{
  "kind": "article",
  "title": "An article worth keeping",
  "url": "https://example.com/article",
  "content": {
    "format": "markdown",
    "value": "# Article\n\nCleaned article body"
  },
  "selection": "Optional selected text",
  "excerpt": "Optional short summary",
  "author": "Author",
  "siteName": "Example",
  "tags": ["research", "reading"],
  "capturedAt": 1790611200000
}
```

Supported kinds: `page`, `article`, `selection`.

Supported content formats: `text`, `markdown`, `html`.

Limits:
- request body: 1.5 MB
- captured content: 1 MB
- title: 500 characters
- selection: 100,000 characters
- excerpt: 10,000 characters
- up to 20 tags, 64 characters each
- source URLs must use HTTP or HTTPS

## List capture inbox

`GET /v1/captures?limit=50`

Returns newest captures first, without full body content. The maximum list size is 100.

## Read one capture

`GET /v1/captures/:id`

Returns the complete capture including saved body content.

## Delete a capture

`DELETE /v1/captures/:id`

Captures are isolated by authenticated user ID. A capture belonging to another user is not returned.

## Product boundary

The capture API is intentionally not the note API. A later Orion UI can review an inbox item and convert it into a note, generate study material, or discard it without coupling browser extensions to Orion's internal workspace schema.

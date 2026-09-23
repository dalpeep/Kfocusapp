# Community hash-route indexing

The public shell retains its original robots meta value on ordinary pages. On
`#community` and `#community/post/{id}`, the Community client changes that meta
tag to `noindex,follow`; leaving Community restores the exact initial value.
The administrator document declares `noindex,nofollow`. Individual Community
posts are not added to the sitemap.

Hash fragments are not sent in HTTP requests. The server therefore cannot
selectively send an `X-Robots-Tag` header for these two hash routes. The
Community-specific rule depends on a crawler executing the client script;
it must not be described as a server-enforced indexing guarantee.

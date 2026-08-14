-- The unlisted family share link is gone: it could not carry clock times safely, and the
-- account-based invite replaces it. Dropping the table also drops share_links_token_idx.
DROP TABLE `share_links`;

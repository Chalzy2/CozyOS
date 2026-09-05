-- CozyOS File Phase 2 - Real Binary/Object Storage
--
-- Extends the documents table (013_document_storage.sql) with the
-- metadata columns needed to reference real binary content stored on
-- a durable, filesystem-backed object storage layer
-- (server/webauthn-rp/object-storage.js). This migration adds NO new
-- table - it extends the existing, already-authoritative documents
-- table, since binary_storage_ref was already reserved there for
-- exactly this purpose (confirmed by direct inspection of migration
-- 013's own comment: "included now, left NULL/unused, specifically so
-- a future phase can add real binary-object storage... without a
-- further schema migration for that column" - this migration adds the
-- small number of companion columns that column alone cannot express
-- (size/mime/checksum/original filename), while binary_storage_ref
-- itself required no structural change at all).
--
-- binary_original_filename is stored for DISPLAY PURPOSES ONLY. It is
-- never used to construct a storage path or object key - the real
-- storage key is always server-generated (see object-storage.js).

ALTER TABLE documents ADD COLUMN binary_size BIGINT;
ALTER TABLE documents ADD COLUMN binary_mime_type TEXT;
ALTER TABLE documents ADD COLUMN binary_checksum TEXT;
ALTER TABLE documents ADD COLUMN binary_original_filename TEXT;

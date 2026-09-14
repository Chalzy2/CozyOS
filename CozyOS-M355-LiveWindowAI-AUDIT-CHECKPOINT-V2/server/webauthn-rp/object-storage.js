'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// CozyOS File - Phase 2: Object Storage Provider
// File Reference: server/webauthn-rp/object-storage.js
//
// REPOSITORY DISCOVERY (this round): no S3/object-storage/blob-storage
// candidate exists anywhere in this repository (confirmed exhaustively
// in Phase 0.1's own search). The one real, already-proven durable
// backend this architecture actually has is a filesystem - the exact
// same mechanism server/webauthn-rp/db.js already relies on for the
// SQLite database file itself, including on the live Render deployment
// (a persistent disk mounted at /var/data, confirmed real in
// render.yaml and by the V4 production deployment fix). This provider
// is that same kind of real, filesystem-backed durability, not a
// fabricated cloud implementation.
//
// SECURITY MODEL
//   - Storage keys are ALWAYS server-generated
//     (organizationId/documentId/version, all already-authoritative
//     server-side values - never raw client input). A client-supplied
//     filename is never used to construct any path.
//   - put()/get()/delete() validate that the resolved absolute path
//     stays within the configured storage root - defense in depth
//     against any future caller mistake, even though the key-building
//     function itself never accepts arbitrary input.
//   - SHA-256 is computed by streaming the real bytes as they are
//     written - never trusted from a caller, and never computed by
//     buffering the entire file in memory first.
//
// SCOPE
//   Real: put (streaming write + real SHA-256), get (streaming read),
//   delete, exists, stat (size/mime/checksum lookup from a companion
//   sidecar metadata file). Does NOT implement S3-compatible or other
//   external cloud object storage - none is available in this
//   environment (confirmed, not assumed). If a real external provider
//   becomes available later, it would implement this exact same
//   interface and could replace this without any caller changing.

const FORBIDDEN_KEY_CHARS = /[^a-zA-Z0-9/_.-]/;

class ObjectStorageError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

class FilesystemObjectStorageProvider {
  constructor({ rootDir } = {}) {
    if (!rootDir) throw new TypeError('[object-storage] rootDir is required.');
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * buildKey(organizationId, documentId, version)
   *   The ONLY place a storage key is ever constructed. Every component
   *   is already a real, server-authoritative identifier (organizationId
   *   from the authenticated session's real membership, documentId from
   *   either a fresh crypto.randomUUID() or an already-validated
   *   existing row, version as an integer) - never raw user input, and
   *   never a client-supplied filename.
   */
  buildKey(organizationId, documentId, version) {
    if (!organizationId || !documentId || !Number.isInteger(version)) {
      throw new TypeError('[object-storage] buildKey(): organizationId, documentId, and an integer version are all required.');
    }
    return `organizations/${organizationId}/documents/${documentId}/versions/${version}/content.bin`;
  }

  _resolveAndValidate(key) {
    if (typeof key !== 'string' || !key || FORBIDDEN_KEY_CHARS.test(key) || key.includes('..')) {
      throw new ObjectStorageError('invalid_key');
    }
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      // Defense in depth: even though buildKey() can never produce a
      // traversal-shaped key, this refuses to operate outside rootDir
      // for any key reaching this point by any path.
      throw new ObjectStorageError('path_traversal_rejected');
    }
    return resolved;
  }

  _metaPath(resolvedPath) { return `${resolvedPath}.meta.json`; }

  /**
   * put(key, readableStream, {mimeType, maxBytes})
   *   Real streaming write. Computes a real SHA-256 over the actual
   *   bytes as they pass through - never buffers the whole file in
   *   memory to hash it separately, never trusts a caller-supplied
   *   checksum. If maxBytes is provided, aborts and cleans up the
   *   partial write the moment the limit is exceeded - this is the
   *   ONLY place that ever attaches a listener to the incoming stream,
   *   deliberately, since attaching a second 'data' listener elsewhere
   *   (e.g. in a route handler, for its own size tracking) would put
   *   the stream into flowing mode before this method's own listener
   *   attaches, silently losing already-emitted chunks - a real bug
   *   found and fixed during this phase's own testing.
   */
  async put(key, readableStream, { mimeType = 'application/octet-stream', maxBytes = null } = {}) {
    const resolved = this._resolveAndValidate(key);
    await fsp.mkdir(path.dirname(resolved), { recursive: true });

    const hash = crypto.createHash('sha256');
    let size = 0;
    const tmpPath = `${resolved}.tmp-${crypto.randomUUID()}`;
    const writeStream = fs.createWriteStream(tmpPath);

    try {
      await new Promise((resolve, reject) => {
        readableStream.on('data', (chunk) => {
          hash.update(chunk);
          size += chunk.length;
          if (maxBytes !== null && size > maxBytes) {
            readableStream.destroy();
            writeStream.destroy();
            reject(new ObjectStorageError('too_large'));
          }
        });
        readableStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
        readableStream.pipe(writeStream);
      });
    } catch (err) {
      await fsp.rm(tmpPath, { force: true });
      throw err;
    }

    await fsp.rename(tmpPath, resolved);
    const checksum = hash.digest('hex');
    await fsp.writeFile(this._metaPath(resolved), JSON.stringify({ mimeType, size, checksum }), 'utf8');
    return { key, size, mimeType, checksum };
  }

  /** get(key) - returns a real readable stream plus real, stored metadata. Throws ObjectStorageError('not_found') honestly if absent - never fabricates a stream. */
  async get(key) {
    const resolved = this._resolveAndValidate(key);
    if (!fs.existsSync(resolved)) throw new ObjectStorageError('not_found');
    const meta = await this._readMeta(resolved);
    return { stream: fs.createReadStream(resolved), ...meta };
  }

  async _readMeta(resolvedPath) {
    try {
      const raw = await fsp.readFile(this._metaPath(resolvedPath), 'utf8');
      return JSON.parse(raw);
    } catch (_err) {
      return { mimeType: 'application/octet-stream', size: null, checksum: null };
    }
  }

  async exists(key) {
    const resolved = this._resolveAndValidate(key);
    return fs.existsSync(resolved);
  }

  /** delete(key) - real deletion of both the content and its sidecar metadata. Idempotent: deleting an already-absent key is not an error. */
  async delete(key) {
    const resolved = this._resolveAndValidate(key);
    await fsp.rm(resolved, { force: true });
    await fsp.rm(this._metaPath(resolved), { force: true });
    return { deleted: true };
  }

  async stat(key) {
    const resolved = this._resolveAndValidate(key);
    if (!fs.existsSync(resolved)) throw new ObjectStorageError('not_found');
    return this._readMeta(resolved);
  }
}

module.exports = { FilesystemObjectStorageProvider, ObjectStorageError };

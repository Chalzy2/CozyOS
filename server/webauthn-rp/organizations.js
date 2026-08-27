'use strict';
const crypto = require('node:crypto');

// CozyOS — Server-Authoritative Organization + Membership Registry
// File Reference: server/webauthn-rp/organizations.js
//
// WHY THIS FILE EXISTS
// ---------------------
// core/organization/organization-membership.js (browser) is real, tested,
// and useful for UI — but it is pure in-memory client state with no server
// backing, the same category of thing admin-gate-core.js's own header
// already identifies as "not a security boundary, only a UI convenience."
// This module is the server-side authority organization-scoped access
// decisions must actually be verified against. It follows rp.js's exact
// conventions: a class wrapping `db`, a `now()` override for tests, and a
// private `_audit()` writing into the SAME audit_events table rp.js
// already uses — no second audit system.
//
// IDENTITY RULE (mirrors rp.js resolveSession()): every method below takes
// an already-resolved userId as an argument. This file never accepts an
// identity claim from a request body — the caller (server.js) is
// responsible for deriving userId from the authenticated session cookie
// before calling in, exactly like every other rp.js method.
//
// AUTHORIZATION MODEL (deny-over-allow, org-scoped, role-default):
//   1. Membership must exist and be ACTIVE. Anything else -> denied.
//   2. An explicit `deny` permission entry for the capability always wins.
//   3. An explicit `allow` permission entry for the capability grants it.
//   4. Absent an explicit entry, holding the 'owner' or 'admin' role
//      grants org-scoped admin capabilities (capability strings starting
//      with "org:") by default.
//   5. Everything else is denied by default (fail closed).
// This is a real authorization decision, not a UI hint — server.js's
// routes call isAuthorized() and return 403 on false; nothing downstream
// re-derives the answer from client-supplied state.
//
// PLATFORM VS ORGANIZATION: this file has no concept of, and never grants,
// isPlatformAdmin. That remains rp.js/server.js's separate authority.
// Organization 'owner'/'admin' roles here can never remove an application
// from CozyOS platform-wide — no route in this file exposes that
// capability at all; only organization-scoped worker/application
// ASSIGNMENT (this org's use of an app) is modeled here.

const STATUS = Object.freeze({
  INVITED: 'invited',
  ACTIVE: 'active',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  SUSPENDED: 'suspended',
  REMOVED: 'removed',
});

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ORG_ADMIN_PREFIX = 'org:';

class OrgError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function parseJsonArray(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch (_e) {
    return [];
  }
}

function rowToMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    status: row.status,
    roles: parseJsonArray(row.roles),
    applications: parseJsonArray(row.applications),
    permissions: parseJsonArray(row.permissions),
    invitedBy: row.invited_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at || null,
    expiresAt: row.expires_at || null,
  };
}

class OrganizationRegistry {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;
  }

  // ---------- organizations ----------

  createOrganization(userId, { name }) {
    if (!userId) throw new TypeError('[organizations] createOrganization(): userId is required.');
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new TypeError('[organizations] createOrganization(): a real, non-empty name is required.');
    }
    const id = crypto.randomUUID();
    const ts = this.now();
    this.db.prepare(
      'INSERT INTO organizations (id, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), 'active', userId, ts, ts);

    // Creator is seated immediately as an active owner — no invite step
    // for one's own organization.
    const membershipId = crypto.randomUUID();
    this.db.prepare(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, status, roles, applications, permissions, invited_by, created_at, updated_at, responded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(membershipId, id, userId, STATUS.ACTIVE, JSON.stringify(['owner']), '[]', '[]', null, ts, ts, ts);

    this._audit(userId, 'organization_created', { organizationId: id, name: name.trim() });
    return this.getOrganization(id);
  }

  getOrganization(organizationId) {
    const row = this.db.prepare('SELECT * FROM organizations WHERE id = ?').get(organizationId);
    if (!row) return null;
    return { id: row.id, name: row.name, status: row.status, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  // ---------- membership reads (identity-scoped) ----------

  // Only ever returns organizations the given userId is legitimately
  // ACTIVE in. This is the query server.js uses to answer "what can this
  // authenticated user see" — never trust an organizationId a client
  // supplies without checking it against this list (or isAuthorized()
  // directly) first.
  listUserOrganizations(userId, { status } = {}) {
    const rows = this.db.prepare('SELECT * FROM organization_memberships WHERE user_id = ?').all(userId);
    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    return filtered.map(rowToMembership);
  }

  listOrganizationMembers(organizationId, requesterUserId, { status } = {}) {
    this._requireOrgCapability(requesterUserId, organizationId, 'org:workforce:read');
    const rows = this.db.prepare('SELECT * FROM organization_memberships WHERE organization_id = ?').all(organizationId);
    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    return filtered.map(rowToMembership);
  }

  getMembership(userId, organizationId) {
    const row = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, userId);
    return rowToMembership(row);
  }

  // ---------- authorization (the real security boundary) ----------

  isAuthorized(userId, organizationId, capability) {
    if (!userId || !organizationId || !capability) return false;
    const membership = this.getMembership(userId, organizationId);
    if (!membership || membership.status !== STATUS.ACTIVE) return false;

    const denied = membership.permissions.some((p) => p && p.name === capability && p.effect === 'deny');
    if (denied) return false;

    const allowed = membership.permissions.some((p) => p && p.name === capability && p.effect === 'allow');
    if (allowed) return true;

    const isOrgAdminRole = membership.roles.includes('owner') || membership.roles.includes('admin');
    if (isOrgAdminRole && capability.startsWith(ORG_ADMIN_PREFIX)) return true;

    return false;
  }

  _requireOrgCapability(userId, organizationId, capability) {
    if (!this.isAuthorized(userId, organizationId, capability)) {
      throw new OrgError('not_authorized');
    }
  }

  // ---------- invitations ----------

  invite(actorUserId, { organizationId, userId, roles = [] }) {
    this._requireOrgCapability(actorUserId, organizationId, 'org:workforce:invite');
    if (!userId) throw new TypeError('[organizations] invite(): userId is required.');

    const existing = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, userId);

    const nonTerminal = existing && [STATUS.INVITED, STATUS.ACTIVE, STATUS.SUSPENDED].includes(existing.status);
    if (nonTerminal) throw new OrgError('membership_already_exists');

    const ts = this.now();
    const rolesJson = JSON.stringify(Array.isArray(roles) ? roles : []);
    if (existing) {
      this.db.prepare(
        `UPDATE organization_memberships
           SET status = ?, roles = ?, applications = '[]', permissions = '[]', invited_by = ?, updated_at = ?, responded_at = NULL, expires_at = ?
         WHERE id = ?`
      ).run(STATUS.INVITED, rolesJson, actorUserId, ts, ts + INVITE_TTL_MS, existing.id);
    } else {
      const id = crypto.randomUUID();
      this.db.prepare(
        `INSERT INTO organization_memberships
           (id, organization_id, user_id, status, roles, applications, permissions, invited_by, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?)`
      ).run(id, organizationId, userId, STATUS.INVITED, rolesJson, actorUserId, ts, ts, ts + INVITE_TTL_MS);
    }
    this._audit(actorUserId, 'organization_invite_created', { organizationId, userId, roles });
    return this.getMembership(userId, organizationId);
  }

  // Invitation acceptance is tied to the authenticated identity performing
  // the call — there is deliberately no "membershipId + userId" input
  // shape that would let one identity accept on behalf of another.
  #transitionInvite(userId, organizationId, toStatus, eventType, { requireNotExpired = false } = {}) {
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, userId);
    if (!record) throw new OrgError('membership_not_found');
    if (record.status !== STATUS.INVITED) throw new OrgError('membership_not_invited');
    if (requireNotExpired && record.expires_at && this.now() > record.expires_at) {
      const ts = this.now();
      this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.EXPIRED, ts, record.id);
      throw new OrgError('invitation_expired');
    }
    const ts = this.now();
    this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ?, responded_at = ? WHERE id = ?')
      .run(toStatus, ts, ts, record.id);
    this._audit(userId, eventType, { organizationId });
    return this.getMembership(userId, organizationId);
  }

  acceptInvitation(userId, organizationId) {
    return this.#transitionInvite(userId, organizationId, STATUS.ACTIVE, 'organization_invite_accepted', { requireNotExpired: true });
  }

  declineInvitation(userId, organizationId) {
    return this.#transitionInvite(userId, organizationId, STATUS.DECLINED, 'organization_invite_declined');
  }

  revokeInvitation(actorUserId, organizationId, targetUserId) {
    this._requireOrgCapability(actorUserId, organizationId, 'org:workforce:invite');
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, targetUserId);
    if (!record) throw new OrgError('membership_not_found');
    if (record.status !== STATUS.INVITED) throw new OrgError('membership_not_invited');
    const ts = this.now();
    this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.REVOKED, ts, record.id);
    this._audit(actorUserId, 'organization_invite_revoked', { organizationId, targetUserId });
    return this.getMembership(targetUserId, organizationId);
  }

  // ---------- membership lifecycle ----------

  suspendMembership(actorUserId, organizationId, targetUserId) {
    this._requireOrgCapability(actorUserId, organizationId, 'org:workforce:manage');
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, targetUserId);
    if (!record) throw new OrgError('membership_not_found');
    if (record.status !== STATUS.ACTIVE) throw new OrgError('membership_not_active');
    const ts = this.now();
    this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.SUSPENDED, ts, record.id);
    this._audit(actorUserId, 'organization_membership_suspended', { organizationId, targetUserId });
    return this.getMembership(targetUserId, organizationId);
  }

  reactivateMembership(actorUserId, organizationId, targetUserId) {
    this._requireOrgCapability(actorUserId, organizationId, 'org:workforce:manage');
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, targetUserId);
    if (!record) throw new OrgError('membership_not_found');
    if (record.status !== STATUS.SUSPENDED) throw new OrgError('membership_not_suspended');
    const ts = this.now();
    this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.ACTIVE, ts, record.id);
    this._audit(actorUserId, 'organization_membership_reactivated', { organizationId, targetUserId });
    return this.getMembership(targetUserId, organizationId);
  }

  removeMembership(actorUserId, organizationId, targetUserId) {
    this._requireOrgCapability(actorUserId, organizationId, 'org:workforce:manage');
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, targetUserId);
    if (!record) throw new OrgError('membership_not_found');
    if (record.status === STATUS.REMOVED) return this.getMembership(targetUserId, organizationId);
    const ts = this.now();
    this.db.prepare('UPDATE organization_memberships SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.REMOVED, ts, record.id);
    this._audit(actorUserId, 'organization_membership_removed', { organizationId, targetUserId });
    return this.getMembership(targetUserId, organizationId);
  }

  // ---------- roles / applications / permissions ----------
  // NOTE ON SCOPE: assignApplication()/removeApplication() below only ever
  // mutate THIS membership row's applications array — this organization's
  // record of which app it has assigned to this worker. No route in this
  // file, and nothing this method calls, can remove an application from
  // CozyOS platform-wide; that capability has no representation here at
  // all, by design (see file header).

  #mutateArrayField(actorUserId, organizationId, targetUserId, field, mutate, requiredCapability, eventType, eventDetail) {
    this._requireOrgCapability(actorUserId, organizationId, requiredCapability);
    const record = this.db.prepare(
      'SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ?'
    ).get(organizationId, targetUserId);
    if (!record) throw new OrgError('membership_not_found');
    const current = parseJsonArray(record[field]);
    const next = mutate(current);
    const ts = this.now();
    this.db.prepare(`UPDATE organization_memberships SET ${field} = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(next), ts, record.id);
    this._audit(actorUserId, eventType, { organizationId, targetUserId, ...eventDetail });
    return this.getMembership(targetUserId, organizationId);
  }

  assignRole(actorUserId, organizationId, targetUserId, role) {
    if (!role || typeof role !== 'string') throw new TypeError('[organizations] assignRole(): a real, non-empty role is required.');
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'roles',
      (roles) => (roles.includes(role) ? roles : [...roles, role]),
      'org:workforce:manage', 'organization_role_assigned', { role }
    );
  }

  removeRole(actorUserId, organizationId, targetUserId, role) {
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'roles',
      (roles) => roles.filter((r) => r !== role),
      'org:workforce:manage', 'organization_role_removed', { role }
    );
  }

  assignApplication(actorUserId, organizationId, targetUserId, applicationId) {
    if (!applicationId || typeof applicationId !== 'string') throw new TypeError('[organizations] assignApplication(): a real, non-empty applicationId is required.');
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'applications',
      (apps) => (apps.includes(applicationId) ? apps : [...apps, applicationId]),
      'org:applications:manage', 'organization_application_assigned', { applicationId }
    );
  }

  removeApplication(actorUserId, organizationId, targetUserId, applicationId) {
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'applications',
      (apps) => apps.filter((a) => a !== applicationId),
      'org:applications:manage', 'organization_application_removed', { applicationId }
    );
  }

  grantPermission(actorUserId, organizationId, targetUserId, permissionName, effect = 'allow') {
    if (!permissionName || typeof permissionName !== 'string') throw new TypeError('[organizations] grantPermission(): a real, non-empty permission name is required.');
    if (effect !== 'allow' && effect !== 'deny') throw new TypeError('[organizations] grantPermission(): effect must be "allow" or "deny".');
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'permissions',
      (perms) => [...perms.filter((p) => p.name !== permissionName), { name: permissionName, effect }],
      'org:permissions:manage', 'organization_permission_granted', { permissionName, effect }
    );
  }

  revokePermission(actorUserId, organizationId, targetUserId, permissionName) {
    return this.#mutateArrayField(
      actorUserId, organizationId, targetUserId, 'permissions',
      (perms) => perms.filter((p) => p.name !== permissionName),
      'org:permissions:manage', 'organization_permission_revoked', { permissionName }
    );
  }

  _audit(userId, eventType, detail) {
    this.db.prepare('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)')
      .run(userId || null, eventType, JSON.stringify(detail || {}), this.now());
  }
}

module.exports = { OrganizationRegistry, OrgError, STATUS };

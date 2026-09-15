// admin-edit-user — F1.1.2 Edit / Deactivate / Reset Password / Hard-Delete
//
// POST { action, user_id, ...payload }
// Headers: Authorization: Bearer <caller's access_token>
//
// Actions:
//   action="update_profile"   — partial-update profile + mirror to roster row
//     payload: { display_name?, role?, ca_id?, sales_id?, sales_role?, active? }
//   action="reset_password"   — admin sets a new temp password
//     payload: { new_password }
//   action="hard_delete"      — TKT-12.9, OWNER ONLY: permanently delete a
//     teammate. NULLs out created_by on metric/event/check-in rows so
//     historical records survive. Refuses self-deletion.
//     payload: (none)
//
// Auth model on team.groundstandard.com is email + password. Reset = set a new
// temp password via auth.admin.updateUserById. Magic-link path is intentionally
// not implemented here.
//
// Permission gate: owner + admin for update_profile / reset_password.
// hard_delete is owner-only (the role check is enforced inside the branch).
// Integrator is rejected with 403 (per PRD permission matrix — F1.1.2 sits in
// the "admin minus 3 powers" list).
//
// Required secrets (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AppRole = "owner" | "admin" | "integrator" | "ca" | "sales";
type SalesRole = "AM" | "RDR";
type Action = "update_profile" | "reset_password" | "hard_delete" | "hard_delete_roster_only";

interface EditPayload {
  action?: Action;
  user_id?: string;
  // update_profile fields (all optional — partial update)
  display_name?: string;
  email?: string;        // new email — cascades through auth + profiles + roster
  role?: AppRole;
  ca_id?: string | null;
  sales_id?: string | null;
  sales_role?: SalesRole | null;
  active?: boolean;
  // reset_password fields
  new_password?: string;
  // hard_delete_roster_only fields (no auth account exists — delete only the
  // cas / sales_team row)
  roster_id?: string;
  roster_kind?: "ca" | "sales";
}

const isValidEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const APP_ROLES: AppRole[] = ["owner", "admin", "integrator", "ca", "sales"];
const SALES_ROLES: SalesRole[] = ["AM", "RDR"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── auth: identify caller ────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return json({ error: "invalid_token" }, 401);
  const caller = callerData.user;

  const { data: callerProfile, error: cpErr } = await admin
    .from("profiles")
    .select("role,email,display_name")
    .eq("id", caller.id)
    .maybeSingle();
  if (cpErr) return json({ error: "profile_lookup_failed", detail: cpErr.message }, 500);
  if (!callerProfile) return json({ error: "no_profile" }, 403);
  if (callerProfile.role !== "owner" && callerProfile.role !== "admin") {
    return json({ error: "forbidden", role: callerProfile.role }, 403);
  }

  // ── input ────────────────────────────────────────────────────────────
  let payload: EditPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const action = payload.action;
  if (action !== "update_profile" && action !== "reset_password" &&
      action !== "hard_delete" && action !== "hard_delete_roster_only") {
    return json({ error: "bad_action" }, 400);
  }

  // ── action: hard_delete_roster_only (TKT-12.9 follow-up, Bobby 2026-05-11) ─
  // For teammates who were added to the roster but never signed in (no
  // profile row exists, so user_id is null). Deletes the cas / sales_team
  // row only. Owner-only. Captures prior state in audit_log.
  if (action === "hard_delete_roster_only") {
    if (callerProfile.role !== "owner") {
      return json({ error: "owner_only", detail: "hard delete is restricted to the owner" }, 403);
    }
    const rosterId = (payload.roster_id || "").trim();
    const rosterKind = (payload.roster_kind || "").trim();
    if (!rosterId) return json({ error: "roster_id_required" }, 400);
    if (rosterKind !== "ca" && rosterKind !== "sales") {
      return json({ error: "bad_roster_kind", detail: "must be 'ca' or 'sales'" }, 400);
    }
    const table = rosterKind === "ca" ? "cas" : "sales_team";

    const { data: priorRoster, error: lookupErr } = await admin
      .from(table)
      .select("*")
      .eq("id", rosterId)
      .maybeSingle();
    if (lookupErr) return json({ error: "roster_lookup_failed", detail: lookupErr.message }, 500);
    if (!priorRoster) return json({ error: "roster_not_found" }, 404);

    // Defensive: if profile_id IS set, an auth account is linked — caller
    // should use the full hard_delete flow with user_id instead.
    if (priorRoster.profile_id) {
      return json({
        error: "has_auth_account",
        detail: "this roster row is linked to an auth account; use hard_delete with user_id",
      }, 400);
    }

    const { error: delErr } = await admin.from(table).delete().eq("id", rosterId);
    if (delErr) {
      return json({
        error: rosterKind === "ca" ? "ca_delete_blocked" : "sales_delete_blocked",
        detail: delErr.message,
        hint: "still referenced by clients/metrics/contracts/adjustments — reassign first",
      }, 409);
    }

    const { error: auditErr } = await admin.from("audit_log").insert({
      actor_id: caller.id,
      actor_email: callerProfile.email || caller.email,
      action: "hard_delete_roster_only",
      table_name: table,
      row_id: rosterId,
      diff: {
        prior_row: priorRoster,
        reason: "no auth account linked",
      },
    });

    return json({
      ok: true,
      action,
      roster_id: rosterId,
      roster_kind: rosterKind,
      audit_warning: auditErr ? auditErr.message : null,
    });
  }

  // All remaining actions require user_id (the auth.users uuid).
  const user_id = (payload.user_id || "").trim();
  if (!user_id) return json({ error: "user_id_required" }, 400);

  // ── load target profile (need current state for diff + role gates) ───
  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id,email,display_name,role,ca_id,sales_id,active")
    .eq("id", user_id)
    .maybeSingle();
  if (targetErr) return json({ error: "target_lookup_failed", detail: targetErr.message }, 500);
  if (!target) return json({ error: "target_not_found" }, 404);

  // Self-edit guard: don't let an admin demote / deactivate themselves
  // (owner is allowed to self-edit since there's only one).
  const isSelf = caller.id === target.id;
  if (isSelf && action === "update_profile") {
    if (payload.role !== undefined && payload.role !== target.role) {
      return json({ error: "self_role_change_blocked" }, 400);
    }
    if (payload.active !== undefined && payload.active !== target.active) {
      return json({ error: "self_active_change_blocked" }, 400);
    }
  }

  // ── action: hard_delete (TKT-12.9, OWNER-ONLY) ───────────────────────
  // Permanently removes a teammate. Owner-only. Refuses self-delete. NULLs
  // out created_by on metric/event/check-in rows so historical data survives.
  // Captures full prior state in audit_log diff.
  if (action === "hard_delete") {
    if (callerProfile.role !== "owner") {
      return json({ error: "owner_only", detail: "hard delete is restricted to the owner" }, 403);
    }
    if (caller.id === user_id) {
      return json({ error: "self_delete_blocked", detail: "you cannot delete your own account" }, 400);
    }

    // Snapshot everything we'll lose for the audit log diff. Loaded BEFORE
    // any deletes so the audit row preserves the full prior state even if
    // a later step fails.
    const [priorCaRes, priorSalesRes, priorPushRes] = await Promise.all([
      admin.from("cas").select("*").eq("profile_id", user_id).maybeSingle(),
      admin.from("sales_team").select("*").eq("profile_id", user_id).maybeSingle(),
      admin.from("push_subscriptions").select("id").eq("user_id", user_id),
    ]);
    const priorCa = priorCaRes.data;
    const priorSales = priorSalesRes.data;
    const pushSubsCount = (priorPushRes.data || []).length;

    // NULL-out created_by on metric / event / check-in rows authored by the
    // deleted user. Per PRD: "preserve historical data". Each table is best-
    // effort; we don't bail on a single null-out failure (those tables may
    // not even have any rows to update).
    const NULL_TABLES = [
      "monthly_metrics", "weekly_metrics",
      "monthly_checkins", "weekly_checkins",
      "growth_events",
    ];
    const nullCounts: Record<string, number | string> = {};
    for (const tbl of NULL_TABLES) {
      const { error, count } = await admin
        .from(tbl)
        .update({ created_by: null }, { count: "exact" })
        .eq("created_by", user_id);
      nullCounts[tbl] = error ? `error: ${error.message}` : (count ?? 0);
    }

    // Delete push_subscriptions for this user. Schema has user_id (the auth
    // user uuid). Best-effort: failure here is non-fatal because rows can't
    // be referenced after the user goes away.
    const { error: pushErr } = await admin.from("push_subscriptions").delete().eq("user_id", user_id);
    const pushWarning = pushErr ? pushErr.message : null;

    // Delete cas / sales_team roster row(s). If FKs from other tables (e.g.
    // clients.assigned_ca, monthly_metrics.ca_id) still reference this row,
    // the delete will fail with 23503 — surface a clean error so the owner
    // can reassign first.
    if (priorCa) {
      const { error } = await admin.from("cas").delete().eq("profile_id", user_id);
      if (error) {
        return json({
          error: "ca_delete_blocked",
          detail: error.message,
          hint: "this CA is still referenced by clients/metrics — reassign or remove those rows before hard-deleting",
        }, 409);
      }
    }
    if (priorSales) {
      const { error } = await admin.from("sales_team").delete().eq("profile_id", user_id);
      if (error) {
        return json({
          error: "sales_delete_blocked",
          detail: error.message,
          hint: "this rep is still referenced by clients/adjustments — reassign or remove those rows before hard-deleting",
        }, 409);
      }
    }

    // Delete the auth.users row. profiles.id has ON DELETE CASCADE on
    // auth.users so the profiles row is removed automatically as a side
    // effect — no explicit profiles delete needed.
    const { error: authErr } = await admin.auth.admin.deleteUser(user_id);
    if (authErr) {
      return json({ error: "auth_delete_failed", detail: authErr.message }, 500);
    }

    // Audit log entry — full prior state captured for forensics.
    const { error: auditErr } = await admin.from("audit_log").insert({
      actor_id: caller.id,
      actor_email: callerProfile.email || caller.email,
      action: "hard_delete",
      table_name: "auth.users",
      row_id: user_id,
      diff: {
        target_email: target.email,
        target_display_name: target.display_name,
        target_role: target.role,
        prior_profile: target,
        prior_cas_row: priorCa,
        prior_sales_row: priorSales,
        push_subscriptions_deleted: pushSubsCount,
        push_warning: pushWarning,
        created_by_nulled: nullCounts,
      },
    });

    return json({
      ok: true,
      action,
      user_id,
      target_email: target.email,
      created_by_nulled: nullCounts,
      push_subscriptions_deleted: pushSubsCount,
      audit_warning: auditErr ? auditErr.message : null,
    });
  }

  // ── action: reset_password ───────────────────────────────────────────
  if (action === "reset_password") {
    const newPwd = payload.new_password || "";
    if (newPwd.length < 8) {
      return json({ error: "weak_password", detail: "minimum 8 characters" }, 400);
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
      password: newPwd,
    });
    if (updErr) return json({ error: "password_reset_failed", detail: updErr.message }, 500);

    // audit (no password in diff!)
    const { error: auditErr } = await admin.from("audit_log").insert({
      actor_id: caller.id,
      actor_email: callerProfile.email || caller.email,
      action: "reset_password",
      table_name: "auth.users",
      row_id: user_id,
      diff: { target_email: target.email },
    });

    return json({
      ok: true,
      action,
      user_id,
      audit_warning: auditErr ? auditErr.message : null,
    });
  }

  // ── action: update_profile ───────────────────────────────────────────
  // Validate any provided fields
  if (payload.role !== undefined && !APP_ROLES.includes(payload.role as AppRole)) {
    return json({ error: "bad_role" }, 400);
  }
  if (payload.sales_role != null && !SALES_ROLES.includes(payload.sales_role as SalesRole)) {
    return json({ error: "bad_sales_role" }, 400);
  }
  if (payload.display_name !== undefined && !payload.display_name.trim()) {
    return json({ error: "missing_display_name" }, 400);
  }

  // Email change: validate format + uniqueness, then cascade through auth +
  // profiles + roster. The actual auth.admin.updateUserById call happens
  // before the profile update so we can short-circuit on conflict.
  let normalizedNewEmail: string | null = null;
  if (payload.email !== undefined) {
    const newEmail = (payload.email || "").trim().toLowerCase();
    if (!newEmail) return json({ error: "missing_email" }, 400);
    if (!isValidEmail(newEmail)) return json({ error: "bad_email" }, 400);
    if (newEmail !== (target.email || "").toLowerCase()) {
      // Domain restriction (matches the invite-only trigger)
      if (!newEmail.endsWith("@groundstandard.com")) {
        return json({ error: "domain_not_allowed", detail: "must be @groundstandard.com" }, 400);
      }
      // Check email isn't already in use by another profile
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("email", newEmail)
        .neq("id", user_id)
        .maybeSingle();
      if (existing) return json({ error: "email_in_use" }, 409);
      normalizedNewEmail = newEmail;
    }
  }

  const newRole = (payload.role ?? target.role) as AppRole;
  const wasCa = target.role === "ca";
  const wasSales = target.role === "sales";
  const isCa = newRole === "ca";
  const isSales = newRole === "sales";

  // Cross-category promotes need new roster rows — refuse in v1.1 to keep
  // FK integrity safe. Bobby can use Invite Teammate to create the new role.
  if (!wasCa && isCa) {
    return json({ error: "cross_role_promote_unsupported", detail: "promote-to-ca not supported in v1.1; use Invite" }, 400);
  }
  if (!wasSales && isSales) {
    return json({ error: "cross_role_promote_unsupported", detail: "promote-to-sales not supported in v1.1; use Invite" }, 400);
  }

  // Build profile patch
  const patch: Record<string, unknown> = {};
  if (payload.display_name !== undefined) patch.display_name = payload.display_name.trim();
  if (normalizedNewEmail) patch.email = normalizedNewEmail;
  if (payload.role !== undefined) patch.role = payload.role;
  if (payload.active !== undefined) patch.active = !!payload.active;
  // ca_id / sales_id are pointers on profiles; only meaningful when role matches
  if (payload.ca_id !== undefined) {
    patch.ca_id = isCa ? (payload.ca_id?.trim() || null) : null;
  } else if (payload.role !== undefined && !isCa) {
    // role changed away from ca — clear pointer
    patch.ca_id = null;
  }
  if (payload.sales_id !== undefined) {
    patch.sales_id = isSales ? (payload.sales_id?.trim() || null) : null;
  } else if (payload.role !== undefined && !isSales) {
    patch.sales_id = null;
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: "no_changes" }, 400);
  }

  // If email changed, update auth.users FIRST. If it fails, abort before
  // touching profiles/roster (avoids drift between auth + DB).
  if (normalizedNewEmail) {
    const { error: authErr } = await admin.auth.admin.updateUserById(user_id, {
      email: normalizedNewEmail,
      email_confirm: true, // mark as confirmed so user doesn't get a verification email
    });
    if (authErr) {
      return json({ error: "email_update_failed", detail: authErr.message }, 500);
    }
  }

  const { error: pErr } = await admin.from("profiles").update(patch).eq("id", user_id);
  if (pErr) return json({ error: "profile_update_failed", detail: pErr.message }, 500);

  // Mirror display_name + active + email to roster row (cas or sales_team) by profile_id.
  // ID + sales_role changes go to the roster row too. Don't rename cas.id / sales_team.id
  // (FK cascades — too risky; refuse below if requested).
  const rosterPatch: Record<string, unknown> = {};
  if (payload.display_name !== undefined) rosterPatch.name = payload.display_name.trim();
  if (payload.active !== undefined) rosterPatch.active = !!payload.active;
  if (normalizedNewEmail) rosterPatch.email = normalizedNewEmail;

  if (wasCa || isCa) {
    if (Object.keys(rosterPatch).length > 0) {
      const { error: caErr } = await admin
        .from("cas")
        .update(rosterPatch)
        .eq("profile_id", user_id);
      if (caErr) {
        return json({ error: "ca_roster_update_failed", detail: caErr.message }, 500);
      }
    }
  }
  if (wasSales || isSales) {
    const stPatch = { ...rosterPatch };
    if (payload.sales_role !== undefined && payload.sales_role != null) {
      (stPatch as Record<string, unknown>).role = payload.sales_role;
    }
    if (Object.keys(stPatch).length > 0) {
      const { error: stErr } = await admin
        .from("sales_team")
        .update(stPatch)
        .eq("profile_id", user_id);
      if (stErr) {
        return json({ error: "sales_roster_update_failed", detail: stErr.message }, 500);
      }
    }
  }

  // ── audit ────────────────────────────────────────────────────────────
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    diff[k] = { from: (target as Record<string, unknown>)[k], to: patch[k] };
  }
  if (payload.sales_role !== undefined) {
    diff["sales_team.role"] = { to: payload.sales_role };
  }
  const { error: auditErr } = await admin.from("audit_log").insert({
    actor_id: caller.id,
    actor_email: callerProfile.email || caller.email,
    action: "update",
    table_name: "profiles",
    row_id: user_id,
    diff,
  });

  return json({
    ok: true,
    action,
    user_id,
    patch,
    audit_warning: auditErr ? auditErr.message : null,
  });
});

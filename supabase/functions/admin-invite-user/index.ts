// admin-invite-user — F1.1.1 Invite Teammate flow
//
// POST { email, display_name, role, password, ca_id?, sales_role?, sales_id? }
// Headers: Authorization: Bearer <caller's access_token>
//
// Flow:
//   (a) Verify caller's JWT and profiles.role in ('owner','admin'); reject 'integrator' with 403
//   (b) auth.admin.createUser({email, password, email_confirm: true})
//   (c) Insert profiles row with role + conditional ids; rollback on failure
//   (d) If role=ca, insert cas row; if role=sales, insert sales_team row
//   (e) Append audit_log row
//   (f) Return { ok: true, user_id } or { error, detail }
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

interface InvitePayload {
  email?: string;
  display_name?: string;
  role?: AppRole;
  password?: string;
  ca_id?: string;
  sales_role?: SalesRole;
  sales_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── auth: identify caller via their JWT ──────────────────────────────
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
    // Explicitly reject integrator and any other role
    return json({ error: "forbidden", role: callerProfile.role }, 403);
  }

  // ── input ────────────────────────────────────────────────────────────
  let payload: InvitePayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const email = (payload.email || "").trim().toLowerCase();
  const display_name = (payload.display_name || "").trim();
  const role = payload.role as AppRole;
  const password = payload.password || "";
  const ca_id = payload.ca_id?.trim() || null;
  const sales_role = (payload.sales_role || null) as SalesRole | null;
  const sales_id = payload.sales_id?.trim() || null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "bad_email" }, 400);
  if (!display_name) return json({ error: "missing_display_name" }, 400);
  if (!["owner", "admin", "integrator", "ca", "sales"].includes(role))
    return json({ error: "bad_role" }, 400);
  if (!password || password.length < 8)
    return json({ error: "weak_password", detail: "minimum 8 characters" }, 400);
  if (role === "ca" && !ca_id) return json({ error: "ca_id_required" }, 400);
  if (role === "sales") {
    if (!sales_role || !["AM", "RDR"].includes(sales_role))
      return json({ error: "sales_role_required" }, 400);
    if (!sales_id) return json({ error: "sales_id_required" }, 400);
  }

  // ── pre-flight: if a roster row already exists for this id, make sure it
  //    isn't already linked to another auth account. If it's unlinked
  //    (profile_id is NULL), this invite call doubles as "set initial password
  //    for the existing roster entry" — Bobby 2026-05-04 (Kurt was on the
  //    roster but had no auth account; the old "Reset password" flow couldn't
  //    handle that case, so the form now routes here). Fixed 2026-05-05 to
  //    UPDATE the existing roster row instead of trying to INSERT a duplicate.
  let preExistingCa = false;
  let preExistingCaProfileId: string | null = null;
  let preExistingSales = false;
  let preExistingSalesProfileId: string | null = null;

  if (role === "ca") {
    const { data: existing } = await admin
      .from("cas").select("id, profile_id").eq("id", ca_id).maybeSingle();
    if (existing) {
      if (existing.profile_id) {
        return json(
          { error: "ca_id_already_linked",
            detail: `${ca_id} is already linked to another auth account. Edit that account instead.` },
          409,
        );
      }
      preExistingCa = true;
      preExistingCaProfileId = existing.profile_id;
    }
  } else if (role === "sales") {
    const { data: existing } = await admin
      .from("sales_team").select("id, profile_id").eq("id", sales_id).maybeSingle();
    if (existing) {
      if (existing.profile_id) {
        return json(
          { error: "sales_id_already_linked",
            detail: `${sales_id} is already linked to another auth account. Edit that account instead.` },
          409,
        );
      }
      preExistingSales = true;
      preExistingSalesProfileId = existing.profile_id;
    }
  }

  // ── (b) create auth user ─────────────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name },
  });
  if (createErr || !created?.user) {
    return json(
      { error: "create_user_failed", detail: createErr?.message || "no user returned" },
      400,
    );
  }
  const newUserId = created.user.id;

  // Compensating rollback if any later step fails. For pre-existing roster
  // rows we restore the original profile_id (NULL) instead of deleting — the
  // row was there before this invite started.
  const rollback = async (reason: string, detail?: string, status = 500) => {
    try {
      if (preExistingCa) {
        await admin.from("cas").update({ profile_id: preExistingCaProfileId }).eq("id", ca_id);
      } else {
        await admin.from("cas").delete().eq("profile_id", newUserId);
      }
      if (preExistingSales) {
        await admin.from("sales_team").update({ profile_id: preExistingSalesProfileId }).eq("id", sales_id);
      } else {
        await admin.from("sales_team").delete().eq("profile_id", newUserId);
      }
      await admin.from("profiles").delete().eq("id", newUserId);
    } catch (_) { /* best effort */ }
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch (_) { /* best effort */ }
    return json({ error: reason, detail }, status);
  };

  // ── (c) insert profile ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const profileRow = {
    id: newUserId,
    email,
    display_name,
    role,
    ca_id: role === "ca" ? ca_id : null,
    sales_id: role === "sales" ? sales_id : null,
    active: true,
    start_date: today,
  };
  const { error: profileErr } = await admin.from("profiles").insert(profileRow);
  if (profileErr)
    return await rollback("profile_insert_failed", profileErr.message);

  // ── (d) conditional roster row — INSERT new or LINK existing ─────────
  if (role === "ca") {
    if (preExistingCa) {
      // Existing roster row → just link it to the new auth account.
      // Don't overwrite name/email — those were set by whoever added Kurt.
      const { error: caErr } = await admin.from("cas")
        .update({ profile_id: newUserId, active: true })
        .eq("id", ca_id);
      if (caErr) return await rollback("ca_link_failed", caErr.message);
    } else {
      const { error: caErr } = await admin.from("cas").insert({
        id: ca_id,
        profile_id: newUserId,
        name: display_name,
        email,
        start_date: today,
        active: true,
      });
      if (caErr) return await rollback("ca_insert_failed", caErr.message);
    }
  } else if (role === "sales") {
    if (preExistingSales) {
      const { error: stErr } = await admin.from("sales_team")
        .update({ profile_id: newUserId, active: true })
        .eq("id", sales_id);
      if (stErr) return await rollback("sales_link_failed", stErr.message);
    } else {
      const { error: stErr } = await admin.from("sales_team").insert({
        id: sales_id,
        profile_id: newUserId,
        name: display_name,
        email,
        role: sales_role,
        start_date: today,
        active: true,
      });
      if (stErr) return await rollback("sales_insert_failed", stErr.message);
    }
  }

  // ── (e) audit log (best-effort: don't roll back on audit failure) ────
  const { error: auditErr } = await admin.from("audit_log").insert({
    actor_id: caller.id,
    actor_email: callerProfile.email || caller.email,
    action: "invite",
    table_name: "profiles",
    row_id: newUserId,
    diff: {
      email,
      display_name,
      role,
      ca_id: role === "ca" ? ca_id : null,
      sales_id: role === "sales" ? sales_id : null,
      sales_role: role === "sales" ? sales_role : null,
    },
  });

  // ── (f) success ──────────────────────────────────────────────────────
  return json({
    ok: true,
    user_id: newUserId,
    email,
    role,
    audit_warning: auditErr ? auditErr.message : null,
  });
});

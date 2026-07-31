// Envoie une notification Web Push (native, sans Firebase) à tous les abonnements
// enregistrés pour un client (par défaut le coach, "yohanp"), ou à tout le monde
// si client_id === "all" (diffusion depuis la console → bouton "Notifier tous les clients").
//
// Appelée par les déclencheurs Postgres (voir sql/2026-08-01_notifications_push.sql)
// via pg_net, ou directement par POST { title, body, client_id? }.
//
// Secrets requis (supabase secrets set) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par la plateforme.

import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(
  "mailto:yohironfit.coaching@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  try {
    const { title, body, client_id } = await req.json();
    const cid = client_id || "yohanp";
    const url = cid === "all"
      ? `${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`
      : `${SUPABASE_URL}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(cid)}&select=endpoint,p256dh,auth`;

    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    const raw = await res.json().catch(() => null);
    const subs: Array<{ endpoint: string; p256dh: string; auth: string }> = Array.isArray(raw) ? raw : [];

    await Promise.all(subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: title || "AppTraining", body: body || "" }),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Abonnement expiré/révoqué côté navigateur : on le retire.
          await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
            { method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
          );
        }
      }
    }));

    return new Response(JSON.stringify({ ok: true, sent: subs.length }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

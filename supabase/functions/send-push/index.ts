// Envoie une notification Web Push (native, sans Firebase) à tous les abonnements
// enregistrés pour un client (par défaut le coach, "yohanp").
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

Deno.serve(async (req) => {
  try {
    const { title, body, client_id } = await req.json();
    const cid = client_id || "yohanp";

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?client_id=eq.${encodeURIComponent(cid)}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const subs = await res.json();

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
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

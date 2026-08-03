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
    const { title, body, client_id, urgent, page } = await req.json();
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
          // data.openNotifs : lu par sw.js au clic sur la notification pour
          // ouvrir directement le panneau de notifications de l'app (voir
          // notificationclick dans sw.js) plutôt que juste l'accueil.
          // data.page (optionnel) : deep-link — au clic, sw.js navigue directement
          // vers cette page de l'app (ex: "roadmap") au lieu du panneau de notifs.
          JSON.stringify({ title: title || "AppTraining", body: body || "", data: { openNotifs: true, page: page || null } }),
          // urgent (chrono repos) : priorité "high" + TTL court — un rappel de
          // fin de repos n'a aucune valeur s'il est livré avec plusieurs minutes
          // de retard (vécu : notification arrivée très en retard sur iOS avec
          // les réglages par défaut). Les autres pushes (bilan reçu, séance
          // validée...) gardent le TTL par défaut de la lib, pas de contrainte
          // de fraîcheur aussi stricte.
          urgent ? { TTL: 30, urgency: "high" } : undefined,
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

// Appelée depuis ComptaApp (bouton "Relancer" sur un client en attente de paiement)
// pour envoyer un rappel de paiement push au client — réplique exactement ce que
// faisait le bouton "Relancer" de l'ancienne page Facturation (_envoyerNotifCore côté
// console.html) : mêmes 3 écritures (notif_envois / notif_envoi_destinataires /
// client_notifications, source 'rappel_paiement') + appel à send-push, pour que
// l'historique des notifications du client reste cohérent avec le reste de l'app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHARED_SECRET = Deno.env.get('SYNC_SHARED_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.headers.get('x-sync-secret') !== SHARED_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  }
  try {
    const { client_id, title, body } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ ok: false, error: 'client_id requis' }), { status: 400, headers: corsHeaders });
    }
    const titre = title || '💳 Petit rappel';
    const corps = body || "N'oublie pas de faire le virement à ton coach pour qu'il puisse acheter sa créatine 💪";

    const { data: envoi, error: errEnvoi } = await supabase
      .from('notif_envois')
      .insert({ title: titre, body: corps, plein_ecran: false, source: 'rappel_paiement' })
      .select('id').single();
    if (errEnvoi) throw errEnvoi;

    await Promise.all([
      supabase.from('notif_envoi_destinataires').insert({ envoi_id: envoi.id, client_id }),
      supabase.from('client_notifications').insert({ client_id, title: titre, body: corps, envoi_id: envoi.id, plein_ecran: false }),
    ]);

    const resPush = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ title: titre, body: corps, client_id }),
    });
    const jPush = await resPush.json().catch(() => ({}));
    if (!resPush.ok || !jPush.ok) throw new Error(jPush.error || 'Erreur send-push');

    return new Response(JSON.stringify({ ok: true, sent: jPush.sent || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

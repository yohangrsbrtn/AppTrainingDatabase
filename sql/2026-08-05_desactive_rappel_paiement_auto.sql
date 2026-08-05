-- Désactive le rappel de paiement automatique (pg_cron, tournait toutes les 15 min et
-- écrivait dans client_notifications 3 jours après jour_paiement si le mois n'était pas
-- marqué payé). Le coach préfère l'envoyer manuellement au cas par cas désormais — le
-- texte est repris tel quel en préréglage "💳 Rappel de paiement" dans la modale
-- Notifier de la console (voir console.html, _NTF_PRESETS).
SELECT cron.unschedule('rappel-paiement') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rappel-paiement');

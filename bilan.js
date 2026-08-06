// ── Bilan page ────────────────────────────────────────────────────────

let _bilanData  = null;
let _bilanNotes = {};
let _prevMeta   = null;
let _bilanMode  = 'current'; // 'current' | 'previous' | 'history-list' | 'history-detail'
let _bilanId    = null; // Supabase only
let _bilanJourBilanNom = null; // Supabase only — client_profils.jour_bilan du bilan courant

// ── Photos bilan (Supabase Storage, bucket "bilans-photos") ────────────
let _bilanPhotos = null;         // photos du bilan actuellement affiché, null = pas encore chargées
let _bilanPhotosBilanId = null;  // id du bilan pour lequel _bilanPhotos a été chargé
let _bilanPhotosUploading = false;

// ── Chargement ────────────────────────────────────────────────────────

async function loadBilan() { await _supaLoadBilan(); }
async function loadBilanPrecedent() { await _supaLoadBilanPrecedent(); }
async function loadHistoriqueBilans() { await _supaLoadHistorique(); }

// ── Supabase : chargement ─────────────────────────────────────────────

// Récupère (ou crée) le bilan courant d'un client — utilisé par la page
// Bilan complète, la carte "Journée en cours" (accueil) et la validation de
// séance (Mon programme), pour qu'ils écrivent tous dans la même donnée
// réelle plutôt que des états locaux déconnectés.
//
// Si le bilan non-envoyé le plus récent couvrait une semaine déjà terminée
// (sa propre fin de période, calculée sur jour_bilan, est passée), on n'y
// touche plus et on démarre un nouveau bilan pour la semaine en cours —
// sinon les saisies du jour (steps, séance validée...) s'écriraient dans le
// mauvais jour d'une semaine périmée (jours[] est indexé par nom de jour,
// pas par position réelle dans le temps). L'ancien bilan reste tel quel,
// non-envoyé, toujours visible du coach comme en retard — mais il n'est
// plus accessible pour édition/envoi depuis l'app cliente (pas de vue
// listant les bilans non-envoyés autre que le plus récent).
// semaine_label est figé au moment de la création du bilan — si le client modifie
// jour_bilan pendant que ce bilan est en cours, le libellé affiché reste celui calculé
// avec l'ancien jour_bilan tant qu'on ne le recalcule pas ici. Appelé à chaque ouverture,
// réécrit en base si le jour_bilan a changé entre temps (bug vécu : jour_bilan passé à
// Mercredi, bilan encore affiché "lundi→dimanche"). Mute `row` en place (même référence
// que ce que renvoie _supaGetOrCreateBilanCourant à son appelant).
async function _supaResyncSemaineLabel(row, jourBilanNom) {
  const labelAttendu = _supaGetSemaineLabel(jourBilanNom, new Date(row.created_at));
  if (row.semaine_label === labelAttendu) return;
  row.semaine_label = labelAttendu;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${row.id}`, {
      method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ semaine_label: labelAttendu })
    });
  } catch(e) {}
}

async function _supaGetOrCreateBilanCourant(clientId) {
  const profilRes = await fetch(
    `${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=jour_bilan`,
    { headers: supaHeaders() }
  );
  const profilArr = profilRes.ok ? await profilRes.json() : [];
  const jourBilanNom = (profilArr[0] && profilArr[0].jour_bilan) || null;

  // Dernier bilan non archivé (envoyé ou pas). archive=eq.false : un doublon supprimé par le
  // coach ne doit jamais être repris comme "bilan en cours" (bug distinct, déjà corrigé).
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${encodeURIComponent(clientId)}&archive=eq.false&order=created_at.desc&limit=1`,
    { headers: supaHeaders() }
  );
  const arr = res.ok ? await res.json() : [];
  if (arr.length > 0) {
    // Le dernier bilan couvre-t-il RÉELLEMENT la semaine qui contient aujourd'hui (comparaison
    // des bornes de semaine — pas juste la deadline d'envoi) ? jour_bilan démarre sa PROPRE
    // semaine (cf. _bilanWeekBounds) : le matin du jour_bilan, le dernier bilan connu (créé
    // plus tôt dans la semaine qui vient de s'achever) ne couvre PLUS aujourd'hui, même s'il
    // est encore dans sa fenêtre de grâce d'envoi. Sans ce test, "Journée en cours"/"séance
    // validée" écrivaient dans la case du MAUVAIS jour — celui de la semaine PRÉCÉDENTE, déjà
    // envoyée et créditée en XP — au lieu d'aujourd'hui (bug vécu, 2026-08-05 : le mercredi
    // matin, jour_bilan, "Journée en cours" affichait "Mercredi" mais avec les données du
    // mercredi de la semaine précédente, issues d'un bilan déjà envoyé et déjà crédité en XP).
    const { debut: debutDernier }     = _bilanWeekBounds(jourBilanNom, new Date(arr[0].created_at));
    const { debut: debutAujourdhui }  = _bilanWeekBounds(jourBilanNom, new Date());
    if (debutDernier.getTime() === debutAujourdhui.getTime()) {
      await _supaResyncSemaineLabel(arr[0], jourBilanNom);
      if (!arr[0].envoye_coach) await _supaReconcilierNbRepas(arr[0], clientId);
      return { row: arr[0], jourBilanNom };
    }
    // Le dernier bilan couvre une semaine déjà terminée. On ne le quitte QUE s'il n'a pas
    // encore été envoyé ET qu'on est encore dans sa fenêtre de grâce (jour_bilan à midi,
    // _bilanDeadline/api.js) — le temps de laisser le client l'envoyer avant de basculer sur
    // la semaine suivante. Dès qu'il est envoyé (ou la grâce dépassée), plus aucune raison de
    // continuer à écrire dedans : on tombe dans la création d'un nouveau bilan ci-dessous.
    if (!arr[0].envoye_coach) {
      const limite = _bilanDeadline(jourBilanNom, new Date(arr[0].created_at));
      if (new Date() <= limite) {
        await _supaResyncSemaineLabel(arr[0], jourBilanNom);
        await _supaReconcilierNbRepas(arr[0], clientId);
        return { row: arr[0], jourBilanNom };
      }
    }
  }
  // Référence de la semaine du nouveau bilan : "maintenant" par défaut, SAUF si ce dernier
  // bilan (déjà chargé ci-dessus, sa semaine vient d'être vérifiée comme terminée) couvre une
  // semaine dont la fin tombe aujourd'hui ou plus tard — dans ce cas on démarre pile le
  // lendemain de cette fin. Sans ce garde-fou, un client qui envoie son bilan LE jour même de
  // son jour_bilan assigné puis rouvre l'app dans la foulée se retrouve avec un second bilan
  // dupliquant la même semaine (delta=0 dans _bilanWeekBounds quand aujourd'hui == jour_bilan).
  let refDate = new Date();
  if (arr.length) {
    const { fin: finDernier } = _bilanWeekBounds(jourBilanNom, new Date(arr[0].created_at));
    const finDernierJour = new Date(finDernier); finDernierJour.setHours(0, 0, 0, 0);
    const aujourdhui = new Date(); aujourdhui.setHours(0, 0, 0, 0);
    if (finDernierJour >= aujourdhui) {
      refDate = new Date(finDernier);
      refDate.setDate(refDate.getDate() + 1);
      refDate.setHours(12, 0, 0, 0);
    }
  }
  const row = await _supaCreerNouveauBilan(clientId, jourBilanNom, refDate);
  return { row, jourBilanNom };
}

// Malgré son nom (conservé pour ne pas casser les appelants), peut désormais renvoyer un
// bilan déjà ENVOYÉ si sa semaine n'est pas terminée — voir _supaGetOrCreateBilanCourant.
async function _supaBilanNonEnvoye(clientId) {
  const { row } = await _supaGetOrCreateBilanCourant(clientId);
  return { id: row.id, jours: row.jours || [] };
}

async function _supaLoadBilan() {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    const { row, jourBilanNom } = await _supaGetOrCreateBilanCourant(clientId);
    _bilanData = _normaliserBilanSupa(row);
    _bilanId   = row.id;
    _bilanJourBilanNom = jourBilanNom;
    // Chercher le bilan précédent (dernier envoyé) — exclut explicitement le bilan courant :
    // depuis que celui-ci peut lui-même être déjà envoyé (voir _supaGetOrCreateBilanCourant),
    // sans ce filtre "précédent" pointait sur le même bilan que le courant.
    const prevRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&envoye_coach=eq.true&id=neq.${row.id}&order=created_at.desc&limit=1`,
      { headers: supaHeaders() }
    );
    const prevArr = await prevRes.json();
    _prevMeta = (prevArr && prevArr.length > 0) ? { id: prevArr[0].id, semaineLabel: prevArr[0].semaine_label } : null;
    _bilanMode = 'current';
    setPage('bilan');
  } catch(e) { setPage('home'); }
}

async function _supaLoadBilanPrecedent() {
  if (!_prevMeta) return;
  setPage('bilan-loading');
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?id=eq.${_prevMeta.id}`,
      { headers: supaHeaders() }
    );
    const arr = await res.json();
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
      _bilanMode = 'previous';
    }
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function _supaLoadHistorique() {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    // Inclut aussi les bilans non-envoyés (anciens bilans restés non remplis, remplacés
    // depuis par un rollover — cf. chargerBilansEnAttente) : sinon un client qui va dans
    // "Historique" pour retrouver/compléter un vieux bilan non envoyé ne le trouve jamais,
    // il n'existe que dans la page séparée "Bilans en attente". Le bilan EN COURS (_bilanId)
    // est exclu — ce n'est pas de l'historique. Tri identique à celui de la console
    // (envoye_coach.asc,date_validation.desc.nullslast,created_at.desc) : trier uniquement
    // sur created_at mélangeait l'ordre pour les bilans migrés (created_at = date de migration,
    // pas la vraie date du bilan) — c'est ce qui donnait une liste "pas dans l'ordre".
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&archive=eq.false&order=envoye_coach.asc,date_validation.desc.nullslast,created_at.desc`,
      { headers: supaHeaders() }
    );
    const rows = res.ok ? await res.json() : [];
    S.data.historiqueBilans = rows.filter(row => row.id !== _bilanId).map(row => ({
      id:           row.id,
      semaine:      row.semaine_label,
      date:         row.date_validation || row.created_at,
      dejaEnvoye:   !!row.envoye_coach,
    }));
    _bilanMode = 'history-list';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function _supaLoadBilanHistoriqueById(id) {
  setPage('bilan-loading');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${id}`, { headers: supaHeaders() });
    const arr = await res.json();
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
      _bilanMode = 'history-detail';
    }
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

// ── Supabase : normalisation ──────────────────────────────────────────

const _JOURS_NOMS = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'];

// data.jours est toujours stocké/indexé Lundi(0)…Dimanche(6) (schéma DB fixe, cf. commentaire
// plus haut) — mais la semaine d'un bilan se termine le jour_bilan du client, pas forcément
// dimanche. Sans réordonnancement à l'affichage, les cartes journalières listaient toujours
// "LUNDI…DIMANCHE" dans cet ordre calendaire même pour un jour_bilan='Mercredi' (semaine
// jeudi→mercredi), ce qui donnait l'impression trompeuse que la semaine restait lundi-dimanche
// alors que le sous-titre (semaine_label) affichait bien la bonne plage. Ne change QUE l'ordre
// d'affichage des cartes — j.idx (utilisé par sauverJourBilanSupa) reste inchangé.
function _joursOrdreAffichage(jours, jourBilanNom) {
  if (!jours || !jours.length) return jours || [];
  jourBilanNom = _normJourBilan(jourBilanNom);
  const rawIdx = (jourBilanNom && jourBilanNom in _JOURS_IDX_FR) ? _JOURS_IDX_FR[jourBilanNom] : 6;
  // La semaine commence désormais le jour_bilan lui-même et se termine la veille
  // (cf. _bilanWeekBounds/api.js, 2026-08-03) — startIdx = jour_bilan directement.
  const startIdx = rawIdx % 7;
  return Array.from({ length: 7 }, (_, i) => jours[(startIdx + i) % 7]);
}

function _normaliserBilanSupa(row) {
  const jours = _JOURS_NOMS.map((nom, idx) => {
    const j = (row.jours || [])[idx] || {};
    return { idx, nom: j.nom || nom, poids: j.poids ?? '', eau: j.eau ?? '', steps: j.steps ?? '', diete: !!j.diete, training: !!j.training, cardio: !!j.cardio, valide: !!j.valide, seance_validee: !!j.seance_validee };
  });
  const repas = (row.repas_eval || []).map((r, idx) => ({
    idx, num: r.num || (idx + 1), adhesion: r.adhesion || 0, digestion: r.digestion || 0, appetit: r.appetit || 0,
  }));
  return {
    id:                 row.id,
    createdAt:          row.created_at,
    semaineLabel:       row.semaine_label || 'Semaine en cours',
    jours,
    repas,
    commentaireAlim:    row.commentaire_alim    || '',
    commentaireJour:    row.commentaire_jour    || '',
    commentaireActivite:row.commentaire_activite|| '',
    fatigueGenerale:    row.fatigue_generale    || 0,
    commentaireFatigue: row.commentaire_fatigue || '',
    qualiteSommeil:     row.qualite_sommeil     || 0,
    commentaireSommeil: row.commentaire_sommeil || '',
    dejaValide:         !!row.date_validation,
    dateValidation:     row.date_validation,
    dejaEnvoye:         !!row.envoye_coach,
    seancesObjectif:    0,
  };
}

// Nombre de repas à évaluer = nombre de repas (hors équivalences, variante_index 0) de la
// PREMIÈRE diète active du client (ordre arbitraire s'il y en a plusieurs, ex: Jour On/Off).
// Retombe sur 4 si le client n'a pas de diète active ou en cas d'erreur réseau.
async function _supaCalculerNbRepas(clientId) {
  let nbRepas = 4;
  try {
    const dietes = await fetch(
      `${SUPABASE_URL}/rest/v1/client_dietes?client_id=eq.${clientId}&actif=eq.true&limit=1`,
      { headers: supaHeaders() }
    ).then(r => r.json());
    if (dietes && dietes.length > 0) {
      const nom = encodeURIComponent(dietes[0].nom);
      const tmpl = await fetch(
        `${SUPABASE_URL}/rest/v1/diete_templates?nom=eq.${nom}&select=repas(id,variante_index)&order=id.desc&limit=1`,
        { headers: supaHeaders() }
      ).then(r => r.json());
      if (tmpl && tmpl.length > 0) {
        const n = (tmpl[0].repas || []).filter(r => r.variante_index === 0).length;
        if (n > 0) nbRepas = n;
      }
    }
  } catch(e) {}
  return nbRepas;
}

// Le bilan de la semaine en cours reste ouvert plusieurs jours (jusqu'à l'envoi) : si le coach
// modifie la diète active entre-temps (ex: ajoute des repas), repas_eval — figé à la création
// du bilan — ne suivait pas, laissant le client évaluer moins de repas qu'il n'en a réellement
// (vécu : Paul Sustra, diète passée de 4 à 6 repas après création du bilan, seuls 4 visibles).
// N'AGRANDIT que le tableau (ajoute les repas manquants) — ne retire jamais d'entrées déjà
// évaluées si la diète a depuis perdu des repas, pour ne pas effacer une saisie du client.
async function _supaReconcilierNbRepas(row, clientId) {
  try {
    const actuel = row.repas_eval || [];
    const nbCible = await _supaCalculerNbRepas(clientId);
    if (nbCible <= actuel.length) return row;
    const repasEval = actuel.slice();
    for (let i = actuel.length; i < nbCible; i++) repasEval.push({ num: i + 1, adhesion: 0, digestion: 0, appetit: 0 });
    await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${row.id}`, {
      method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ repas_eval: repasEval }),
    });
    row.repas_eval = repasEval;
  } catch(e) {}
  return row;
}

async function _supaCreerNouveauBilan(clientId, jourBilanNom, refDate) {
  if (jourBilanNom === undefined) {
    jourBilanNom = null;
    try {
      const profil = await fetch(
        `${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${clientId}&select=jour_bilan`,
        { headers: supaHeaders() }
      ).then(r => r.json());
      jourBilanNom = (profil && profil[0] && profil[0].jour_bilan) || null;
    } catch(e) {}
  }
  const nbRepas = await _supaCalculerNbRepas(clientId);

  const jours    = _JOURS_NOMS.map(nom => ({ nom, poids: null, eau: null, steps: null, diete: false, training: false, cardio: false, valide: false, seance_validee: false }));
  const repasEval = Array.from({ length: nbRepas }, (_, i) => ({ num: i + 1, adhesion: 0, digestion: 0, appetit: 0 }));
  const body = {
    client_id:    clientId,
    semaine_label: _supaGetSemaineLabel(jourBilanNom, refDate),
    jours,
    repas_eval:   repasEval,
    envoye_coach: false,
    coach_traite: false,
  };
  // created_at sert de référence partout ailleurs (_supaGetOrCreateBilanCourant,
  // reporterMesureDansBilan…) pour recalculer la fenêtre de la semaine de ce
  // bilan — il DOIT donc tomber dans la semaine décrite par semaine_label, pas
  // rester au moment réel de création si refDate a été avancée (cf. garde-fou
  // anti-doublon ci-dessus).
  if (refDate) body.created_at = refDate.toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans`, {
    method: 'POST',
    headers: supaHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr; // ligne brute — l'appelant normalise si besoin
}

// La semaine du bilan se termine la veille du jour_bilan assigné au client (ou
// samedi par défaut, jour_bilan non réglé = Dimanche) — voir _bilanWeekBounds (api.js).
function _supaGetSemaineLabel(jourBilanNom, refDate) {
  const { debut: lun, fin: dim } = _bilanWeekBounds(jourBilanNom, refDate || new Date());
  const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
  const fmt  = d => d.getDate() + ' ' + MOIS[d.getMonth()];
  return 'Du ' + fmt(lun) + ' au ' + fmt(dim);
}

// ── Supabase : sauvegarde ─────────────────────────────────────────────

async function _supaUpdateBilan(patch) {
  if (!_bilanId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${_bilanId}`, {
    method: 'PATCH',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
}

// Réécriture idempotente du tableau jours[] d'un bilan donné — réutilisable
// hors du contexte de la page Bilan (ex: carte "Journée en cours" de l'accueil).
// Cliquer plusieurs fois de suite ne fait que réécrire les mêmes valeurs.
async function _supaPatchJoursBilan(bilanId, jours) {
  if (!bilanId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${bilanId}`, {
    method: 'PATCH',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ jours: jours.map(j => ({ nom: j.nom, poids: j.poids || null, eau: j.eau || null, steps: j.steps || null, diete: !!j.diete, training: !!j.training, cardio: !!j.cardio, valide: !!j.valide, seance_validee: !!j.seance_validee })) }),
  });
}

// Refetch + merge juste avant patch (jamais un PATCH du tableau jours[] tel
// que gardé en mémoire) — sinon un changement fait entretemps depuis un
// autre point d'entrée (accueil, Mon programme) serait écrasé silencieusement.
async function sauverJourBilanSupa(jourIdx, field, value) {
  if (!_bilanData || !_bilanId) return;
  _bilanData.jours[jourIdx][field] = value; // réactivité UI immédiate
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${_bilanId}&select=jours`, { headers: supaHeaders() });
    const arr = res.ok ? await res.json() : [];
    const jours = (arr[0] && arr[0].jours) || _bilanData.jours;
    jours[jourIdx] = { ...(jours[jourIdx] || {}), nom: _bilanData.jours[jourIdx].nom, [field]: value };
    await _supaPatchJoursBilan(_bilanId, jours);
  } catch(e) {}
}

// Report d'une mesure saisie ailleurs (ex: le poids depuis la page
// Mensurations) dans le bilan de la semaine en cours, à la bonne journée
// calendaire — demandé par le coach pour éviter au client de ressaisir deux
// fois la même donnée. N'écrit que si la date saisie tombe dans la semaine du
// bilan actif (non-envoyé) — sinon aucun bilan éditable ne correspond à cette
// date, on ne fait rien plutôt que de créer/modifier un bilan d'une autre semaine.
async function reporterMesureDansBilan(clientId, dateISO, field, value) {
  if (!dateISO || value === null || value === undefined || value === '' || isNaN(value)) return;
  try {
    const { row, jourBilanNom } = await _supaGetOrCreateBilanCourant(clientId);
    const { debut, fin } = _bilanWeekBounds(jourBilanNom, new Date(row.created_at));
    const d = new Date(dateISO + 'T12:00:00'); // midi : évite tout souci de bord de journée sur les bornes debut/fin
    if (d < debut || d > fin) return;
    const jourIdx = (d.getDay() + 6) % 7; // Lundi=0...Dimanche=6, même convention que _bilanWeekBounds
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${row.id}&select=jours`, { headers: supaHeaders() });
    const arr = res.ok ? await res.json() : [];
    const jours = (arr[0] && arr[0].jours) || row.jours || [];
    const nomExistant = (jours[jourIdx] && jours[jourIdx].nom) || _JOURS_NOMS[jourIdx];
    jours[jourIdx] = { ...(jours[jourIdx] || {}), nom: nomExistant, [field]: value };
    await _supaPatchJoursBilan(row.id, jours);
    // Si le bilan en cours est actuellement affiché (page Bilan déjà ouverte
    // dans un autre onglet/état de session), garder _bilanData synchronisé.
    if (_bilanData && _bilanId === row.id && _bilanData.jours[jourIdx]) _bilanData.jours[jourIdx][field] = value;
  } catch(e) {}
}

function toggleJourBilanSupa(jourIdx, field, elemId) {
  if (!_bilanData) return;
  const el     = document.getElementById(elemId);
  const newVal = el.dataset.val !== 'true';
  el.dataset.val     = String(newVal);
  el.style.background = newVal ? '#1D9E75' : '#2d3142';
  const label = el.textContent.replace('✓', '').trim();
  el.textContent = (newVal ? '✓ ' : '') + label;
  sauverJourBilanSupa(jourIdx, field, newVal);
}

function noterRepasSupa(repasIdx, field, valeur, groupeId) {
  if (!_bilanData) return;
  // Recliquer sur la note déjà sélectionnée la désélectionne (0 = pas de note) — pratique
  // pour annuler une note posée par erreur sans devoir en choisir une autre à la place.
  const actuelle = _bilanData.repas[repasIdx][field];
  const nouvelleValeur = actuelle === valeur ? 0 : valeur;
  _bilanData.repas[repasIdx][field] = nouvelleValeur;
  _bilanNotes[groupeId] = nouvelleValeur;
  const palette = _paletteNote(groupeId);
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(groupeId + '_' + i);
    if (btn) btn.style.cssText = 'flex:1;padding:8px 0;' + _styleNoteBtn(i, nouvelleValeur, palette) + 'border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;';
  }
  _supaUpdateBilan({ repas_eval: _bilanData.repas.map(r => ({ num: r.num, adhesion: r.adhesion, digestion: r.digestion, appetit: r.appetit })) }).catch(() => {});
}

function sauverCommentaireBilanSupa(field, value) {
  if (!_bilanData) return;
  if (field === 'commentaire_alim')     _bilanData.commentaireAlim     = value;
  if (field === 'commentaire_jour')     _bilanData.commentaireJour     = value;
  if (field === 'commentaire_activite') _bilanData.commentaireActivite = value;
  if (field === 'commentaire_fatigue')  _bilanData.commentaireFatigue  = value;
  if (field === 'commentaire_sommeil')  _bilanData.commentaireSommeil  = value;
  _supaUpdateBilan({ [field]: value }).catch(() => {});
}

// Note globale 1-5 (fatigue générale / qualité du sommeil) — même pattern que
// noterRepasSupa mais pour une valeur unique par bilan (pas par repas).
function noterGlobalSupa(field, dbField, valeur, groupeId) {
  if (!_bilanData) return;
  // Même bascule de désélection que noterRepasSupa (reclique = annule la note).
  const actuelle = _bilanData[field];
  const nouvelleValeur = actuelle === valeur ? 0 : valeur;
  _bilanData[field] = nouvelleValeur;
  const palette = _paletteNote(groupeId);
  for (let i = 1; i <= 5; i++) {
    const btn = document.getElementById(groupeId + '_' + i);
    if (btn) btn.style.cssText = 'flex:1;padding:8px 0;' + _styleNoteBtn(i, nouvelleValeur, palette) + 'border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;';
  }
  _supaUpdateBilan({ [dbField]: nouvelleValeur }).catch(() => {});
}

function _renderNoteGlobaleSupa(field, dbField, groupeId, valActuelle) {
  const palette = _paletteNote(groupeId);
  let h = `<div style="display:flex;gap:4px;margin:3px 0;">`;
  for (let i = 1; i <= 5; i++) {
    h += `<button id="${groupeId}_${i}" onclick="noterGlobalSupa('${field}','${dbField}',${i},'${groupeId}')"
      style="flex:1;padding:8px 0;${_styleNoteBtn(i, valActuelle, palette)}border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">${i}</button>`;
  }
  return h + '</div>';
}

// ── Render ────────────────────────────────────────────────────────────

function renderBilanPage() {
  if (S.page === 'bilan-loading') {
    return `<div id="app">${renderHeader('Bilan','',false)}<div class="page">${renderSpinner()}</div>${renderNavBar('bilan')}</div>`;
  }
  if (_bilanMode === 'history-list')   return _renderHistoriqueListSupa();
  if (_bilanMode === 'history-detail') return _renderBilanDetailSupa(_bilanData, true);
  if (_bilanMode === 'previous')       return _renderBilanDetailSupa(_bilanData, false, true);
  if (_bilanMode === 'attente-list')   return _renderBilansEnAttenteListSupa();
  if (_bilanMode === 'attente-detail') return _renderBilanDetailSupa(_bilanData, false, false, true);
  if (!_bilanData) return `<div id="app">${renderHeader('Bilan','',false)}<div class="page"><div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Aucun bilan disponible</div></div></div>${renderNavBar('bilan')}</div>`;
  return _renderBilanDetailSupa(_bilanData, false, false);
}

// ── Render Supabase ───────────────────────────────────────────────────

function _bilanWeekRange(dateStr) {
  if (!dateStr) return 'Bilan';
  const mois = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const daysFromMon = (d.getDay() + 6) % 7;
  const lundi = new Date(d); lundi.setDate(d.getDate() - daysFromMon);
  const dim   = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  return `${lundi.getDate()} ${mois[lundi.getMonth()]} → ${dim.getDate()} ${mois[dim.getMonth()]}`;
}

function _renderHistoriqueListSupa() {
  const hist = S.data.historiqueBilans || [];
  const rows = hist.length === 0
    ? `<div class="empty"><div class="empty-text">Aucun bilan pour l'instant.</div></div>`
    : hist.map(b => `
      <div class="list-item" onclick="${b.dejaEnvoye ? `_supaLoadBilanHistoriqueById(${b.id})` : `_ouvrirBilanEnAttente(${b.id})`}">
        <div class="list-icon">${b.dejaEnvoye ? '📋' : '⏳'}</div>
        <div class="list-text" style="flex:1;min-width:0;">
          <div class="list-title">${esc(b.semaine || 'Bilan')}</div>
        </div>
        <span style="font-size:11px;color:${b.dejaEnvoye ? '#1D9E75' : '#f0a500'};font-weight:600;white-space:nowrap;flex-shrink:0;">${b.dejaEnvoye ? '✅ Envoyé' : '⏳ Non envoyé'}</span>
        <div class="list-arrow">›</div>
      </div>`).join('');

  return `<div id="app">
    ${renderHeader('Historique', '', false)}
    <div class="page">
      <div class="card">${rows}</div>
      <button class="btn-secondary" onclick="loadBilan()">← Bilan en cours</button>
    </div>
    ${renderNavBar('bilan')}
  </div>`;
}

// ── Bilans en attente : anciens bilans non-envoyés remplacés par un rollover
// automatique (cf. _supaGetOrCreateBilanCourant) — restent modifiables/envoyables
// depuis cette vue dédiée, sinon ils seraient orphelins pour le client.
async function chargerBilansEnAttente() {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${clientId}&envoye_coach=eq.false&archive=eq.false&order=created_at.desc`,
      { headers: supaHeaders() }
    );
    const arr = res.ok ? await res.json() : [];
    S.data.bilansEnAttente = arr.filter(b => b.id !== _bilanId).map(row => ({ id: row.id, semaine: row.semaine_label, date: row.created_at }));
    _bilanMode = 'attente-list';
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

async function _ouvrirBilanEnAttente(id) {
  setPage('bilan-loading');
  try {
    const clientId = getClient();
    const [res, profilRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${id}`, { headers: supaHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=jour_bilan`, { headers: supaHeaders() }),
    ]);
    const arr = await res.json();
    const profilArr = profilRes.ok ? await profilRes.json() : [];
    if (arr && arr.length > 0) {
      _bilanData = _normaliserBilanSupa(arr[0]);
      _bilanId   = arr[0].id;
      _bilanJourBilanNom = (profilArr[0] && profilArr[0].jour_bilan) || null;
      _bilanMode = 'attente-detail';
    }
    setPage('bilan');
  } catch(e) { setPage('bilan'); }
}

function _renderBilansEnAttenteListSupa() {
  const list = S.data.bilansEnAttente || [];
  const rows = list.length === 0
    ? `<div class="empty"><div class="empty-text">Aucun bilan en attente.</div></div>`
    : list.map(b => `
      <div class="list-item" onclick="_ouvrirBilanEnAttente(${b.id})">
        <div class="list-icon">⏳</div>
        <div class="list-text" style="flex:1;min-width:0;">
          <div class="list-title">${esc(b.semaine || 'Bilan')}</div>
        </div>
        <span style="font-size:11px;color:#f0a500;font-weight:600;white-space:nowrap;flex-shrink:0;">⏳ Non envoyé</span>
        <div class="list-arrow">›</div>
      </div>`).join('');

  return `<div id="app">
    ${renderHeader('Bilans en attente', '', false)}
    <div class="page">
      <div class="card">${rows}</div>
      <button class="btn-secondary" onclick="loadBilan()">← Bilan en cours</button>
    </div>
    ${renderNavBar('bilan')}
  </div>`;
}

function _renderBilanDetailSupa(data, modeHistorique, isSemainePrecedente, attenteMode) {
  _bilanData  = data;
  _bilanNotes = {};
  if (_bilanId && _bilanPhotosBilanId !== _bilanId) {
    _bilanPhotosBilanId = _bilanId;
    _bilanPhotos = null;
    _chargerBilanPhotosClient(_bilanId);
  }
  (data.repas || []).forEach((r, idx) => {
    if (r.adhesion > 0) _bilanNotes['r'+idx+'_adh'] = r.adhesion;
    if (r.digestion > 0) _bilanNotes['r'+idx+'_dig'] = r.digestion;
    if (r.appetit > 0)  _bilanNotes['r'+idx+'_app'] = r.appetit;
  });

  const subtitle = attenteMode ? 'Bilan en attente' : isSemainePrecedente ? 'Semaine précédente' : (data.semaineLabel || 'Semaine en cours');
  let html = '';

  if (data.dejaEnvoye) {
    html += `<div class="bilan-banner">Bilan envoyé au coach — toujours modifiable</div>`;
  } else if (attenteMode) {
    html += `<div class="bilan-banner">Bilan resté non-envoyé — une semaine plus récente est maintenant en cours</div>`;
  }
  if (attenteMode) {
    html += `<button class="btn-secondary" onclick="chargerBilansEnAttente()">← Bilans en attente</button>`;
  } else if (isSemainePrecedente) {
    html += `<button class="btn-secondary" onclick="loadBilan()">← Semaine en cours</button>`;
  } else if (!modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  }

  // ── Alimentation
  html += `<div class="section-title" style="color:#378ADD;">🍽️ Alimentation</div>`;
  (data.repas || []).forEach((r) => {
    const ri  = r.idx;
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">Repas N°${r.num}</div>
      <div class="field-label">ADHÉSION</div>
      ${_renderNotesSupa(ri, 'adhesion', 'r'+ri+'_adh', r.adhesion)}
      <div class="field-label" style="margin-top:8px;">DIGESTION</div>
      ${_renderNotesSupa(ri, 'digestion', 'r'+ri+'_dig', r.digestion)}
      <div class="field-label" style="margin-top:8px;">APPÉTIT</div>
      <div style="font-size:10px;color:var(--muted);margin:1px 0 4px;">1 = très faim · 5 = repu, difficile de finir l'assiette</div>
      ${_renderNotesSupa(ri, 'appetit', 'r'+ri+'_app', r.appetit)}
    </div>`;
  });
  html += `<div class="card">
    <div class="field-label">COMMENTAIRE ALIMENTATION</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverCommentaireBilanSupa('commentaire_alim', this.value)"
    >${esc(data.commentaireAlim)}</textarea>
  </div>`;

  // ── Semaine
  html += `<div class="section-title" style="color:#1D9E75;">📅 Semaine</div>`;
  (_joursOrdreAffichage(data.jours, _bilanJourBilanNom)).forEach(j => {
    html += `<div class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:12px;">${j.nom}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
        <div>
          <div class="field-label">POIDS (kg)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.poids)}" placeholder="—"
            onchange="sauverJourBilanSupa(${j.idx}, 'poids', parsePoids(this.value))">
        </div>
        <div>
          <div class="field-label">EAU (L)</div>
          <input class="bilan-input" type="text" inputmode="decimal" value="${fmtFR(j.eau)}" placeholder="—"
            onchange="sauverJourBilanSupa(${j.idx}, 'eau', parseEau(this.value))">
        </div>
        <div>
          <div class="field-label">STEPS</div>
          <input class="bilan-input" id="step_${j.idx}" type="text" inputmode="numeric" value="${fmtFR(j.steps)}" placeholder="0"
            onchange="sauverJourBilanSupa(${j.idx}, 'steps', parseSteps(this.value))">
        </div>
      </div>
      <div style="display:flex;gap:6px;">
        ${_renderToggleSupa(j.idx, 'diete',    'tog_diet_'+j.idx,   j.diete,    'Diète')}
        ${_renderToggleSupa(j.idx, 'training', 'tog_train_'+j.idx,  j.training, 'Training')}
        ${_renderToggleSupa(j.idx, 'cardio',   'tog_cardio_'+j.idx, j.cardio,   'Cardio')}
      </div>
    </div>`;
  });

  html += `<div class="card">
    <div class="field-label">FATIGUE GÉNÉRALE</div>
    <div style="font-size:10px;color:var(--muted);margin:1px 0 4px;">1 = extrêmement fatigué · 5 = en pleine forme</div>
    ${_renderNoteGlobaleSupa('fatigueGenerale', 'fatigue_generale', 'fatigue', data.fatigueGenerale)}
    <textarea class="bilan-textarea" placeholder="Commentaire fatigue..." style="margin-top:6px;"
      onchange="sauverCommentaireBilanSupa('commentaire_fatigue', this.value)"
    >${esc(data.commentaireFatigue)}</textarea>
    <div class="field-label" style="margin-top:14px;">QUALITÉ DU SOMMEIL</div>
    <div style="font-size:10px;color:var(--muted);margin:1px 0 4px;">1 = sommeil éclaté · 5 = dort comme un bébé</div>
    ${_renderNoteGlobaleSupa('qualiteSommeil', 'qualite_sommeil', 'sommeil', data.qualiteSommeil)}
    <textarea class="bilan-textarea" placeholder="Commentaire sommeil..." style="margin-top:6px;"
      onchange="sauverCommentaireBilanSupa('commentaire_sommeil', this.value)"
    >${esc(data.commentaireSommeil)}</textarea>
  </div>`;

  html += `<div class="card">
    <div class="field-label">COMMENTAIRE SEMAINE</div>
    <textarea class="bilan-textarea" placeholder="Commentaire global..."
      onchange="sauverCommentaireBilanSupa('commentaire_jour', this.value)"
    >${esc(data.commentaireJour)}</textarea>
    <div class="field-label" style="margin-top:10px;">COMMENTAIRE ACTIVITÉ PHYSIQUE</div>
    <textarea class="bilan-textarea" placeholder="Commentaire activité physique..."
      onchange="sauverCommentaireBilanSupa('commentaire_activite', this.value)"
    >${esc(data.commentaireActivite)}</textarea>
  </div>`;

  // ── Photos (Supabase Storage) — jointes à ce bilan précis
  html += `<div class="card">
    <div class="field-label">📸 PHOTOS</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">
      ${_bilanPhotos === null
        ? `<div style="font-size:12px;color:var(--muted);">Chargement…</div>`
        : _bilanPhotos.map(p => `
          <div style="position:relative;width:84px;aspect-ratio:9/16;flex-shrink:0;">
            <img src="${esc(p.url)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onclick="window.open('${esc(p.url)}','_blank')">
            <button onclick="_supprimerBilanPhotoClient(${p.id},'${esc(p.url)}')" title="Supprimer"
              style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.65);border:none;color:#fff;font-size:12px;line-height:1;cursor:pointer;">✕</button>
          </div>`).join('')}
    </div>
    <label class="btn-secondary" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;">
      ${_bilanPhotosUploading ? 'Envoi…' : '+ Ajouter une photo'}
      <input type="file" accept="image/*" multiple style="display:none;" ${_bilanPhotosUploading ? 'disabled' : ''} onchange="_ajouterBilanPhotoClient(event)">
    </label>
  </div>`;

  // ── Boutons bas
  if (modeHistorique) {
    html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()">📅 Historique des bilans</button>`;
  } else {
    const deja = !!data.dejaEnvoye;
    html += `<button id="btn-envoyer" onclick="_doEnvoyerBilanSupa(this)"
      ${deja ? 'disabled' : ''}
      class="${deja ? 'btn-disabled' : 'btn-blue'}" style="width:100%;margin-top:4px;">
      ${deja ? '✅ Envoyé au coach' : '📤 Envoyer au coach'}
    </button>`;
    if (attenteMode) {
      html += `<button class="btn-secondary" onclick="chargerBilansEnAttente()" style="margin-top:8px;">← Bilans en attente</button>`;
    } else {
      html += `<button class="btn-secondary" onclick="loadHistoriqueBilans()" style="margin-top:8px;">📅 Historique des bilans</button>`;
      html += `<button class="btn-secondary" onclick="chargerBilansEnAttente()" style="margin-top:8px;">⏳ Bilans en attente</button>`;
      if (isSemainePrecedente) {
        html += `<button class="btn-secondary" onclick="loadBilan()" style="margin-top:8px;">← Semaine en cours</button>`;
      }
    }
  }

  return `<div id="app">
    ${renderHeader('Bilan', subtitle, false)}
    <div class="page">${html}</div>
    ${renderNavBar('bilan')}
  </div>`;
}

function _renderNotesSupa(repasIdx, field, groupeId, valActuelle) {
  const palette = _paletteNote(groupeId);
  let h = `<div style="display:flex;gap:4px;margin:3px 0;">`;
  for (let i = 1; i <= 5; i++) {
    h += `<button id="${groupeId}_${i}" onclick="noterRepasSupa(${repasIdx},'${field}',${i},'${groupeId}')"
      style="flex:1;padding:8px 0;${_styleNoteBtn(i, valActuelle, palette)}border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">${i}</button>`;
  }
  return h + '</div>';
}

function _renderToggleSupa(jourIdx, field, elemId, val, label) {
  const on = val === true;
  return `<button id="${elemId}" data-val="${on}" onclick="toggleJourBilanSupa(${jourIdx},'${field}','${elemId}')"
    style="flex:1;padding:10px 6px;background:${on?'#1D9E75':'#2d3142'};border:none;border-radius:8px;color:#e8eaf0;font-size:12px;font-weight:600;cursor:pointer;">
    ${on?'✓ ':''}${label}</button>`;
}

// ── Photos bilan — chargement/ajout/suppression (Supabase Storage) ─────
async function _chargerBilanPhotosClient(bilanId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bilan_photos?bilan_id=eq.${bilanId}&order=created_at.asc`, { headers: supaHeaders() });
    _bilanPhotos = res.ok ? await res.json() : [];
  } catch(e) { _bilanPhotos = []; }
  if (_bilanId === bilanId && S.page === 'bilan') render();
}

async function _ajouterBilanPhotoClient(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length || !_bilanId) return;
  const bilanId = _bilanId;
  _bilanPhotosUploading = true; render();
  try {
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${S.client}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/bilans-photos/${path}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!upRes.ok) throw new Error('Erreur envoi photo.');
      const url = `${SUPABASE_URL}/storage/v1/object/public/bilans-photos/${path}`;
      const insRes = await fetch(`${SUPABASE_URL}/rest/v1/bilan_photos`, {
        method: 'POST',
        headers: supaHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ bilan_id: bilanId, client_id: S.client, url })
      });
      if (insRes.ok) { const row = (await insRes.json())[0]; _bilanPhotos = (_bilanPhotos || []).concat([row]); }
    }
  } catch(err) {
    showToast('Erreur : ' + err.message, '#c0392b');
  } finally {
    _bilanPhotosUploading = false; render();
  }
}

async function _supprimerBilanPhotoClient(photoId, url) {
  if (!confirm('Supprimer cette photo ?')) return;
  try {
    const marker = '/object/public/bilans-photos/';
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const path = url.slice(idx + marker.length);
      await fetch(`${SUPABASE_URL}/storage/v1/object/bilans-photos/${path}`, { method:'DELETE', headers: supaHeaders() }).catch(()=>{});
    }
    await fetch(`${SUPABASE_URL}/rest/v1/bilan_photos?id=eq.${photoId}`, { method:'DELETE', headers: supaHeaders() });
    _bilanPhotos = (_bilanPhotos || []).filter(p => p.id !== photoId);
    render();
  } catch(err) { showToast('Erreur : ' + err.message, '#c0392b'); }
}

// ── Supabase : envoi ──────────────────────────────────────────────────

async function _doEnvoyerBilanSupa(btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  try {
    _ouvrirRecapBilanSupa();
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer au coach'; }
    showToast('Erreur : ' + e.message, '#c0392b');
  }
}

function _ouvrirRecapBilanSupa() {
  const data = _bilanData;
  if (!data) { _validerEtEnvoyerSupa(); return; }

  let joursOk = 0, joursTraining = 0, totalSteps = 0;
  (data.jours || []).forEach(j => {
    const btnD = document.getElementById('tog_diet_'  + j.idx);
    const btnT = document.getElementById('tog_train_' + j.idx);
    const inp  = document.getElementById('step_'      + j.idx);
    if (btnD && btnD.dataset.val === 'true') joursOk++;
    if (btnT && btnT.dataset.val === 'true') joursTraining++;
    if (inp) { const v = parseSteps(inp.value); if (v && Number(v) > 0) totalSteps += Number(v); }
  });
  const avgSteps = totalSteps > 0 ? Math.round(totalSteps / 7) : 0;
  const hasNote  = _bilanNotes && Object.values(_bilanNotes).some(v => v > 0);
  const fmtNum   = n => n >= 1000 ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : Math.round(n).toString();
  const statRow  = (label, val, color) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #2d3142;"><span style="font-size:14px;color:#8892a4;">${label}</span><span style="font-size:15px;font-weight:700;color:${color};">${val}</span></div>`;
  const dietColor = joursOk >= 6 ? '#1D9E75' : joursOk >= 4 ? '#f0a500' : '#e05555';
  const trainColor = joursTraining >= 3 ? '#1D9E75' : '#f0a500';
  const statsHtml  = (avgSteps > 0 ? statRow('Moyenne steps/jour', fmtNum(avgSteps), '#e8eaf0') : '')
    + statRow('Diète tenue', joursOk + '/7', dietColor)
    + statRow('Séances training', String(joursTraining), trainColor);
  const noteWarn = !hasNote
    ? `<div style="background:#332200;border:1px solid #f0a500;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:#f0c040;text-align:left;">⚠️ Aucune note repas renseignée. Tu as oublié de noter adhésion, digestion et appétit ?</div>`
    : '';
  // Avertir le client AVANT l'envoi s'il est hors délai — avant, seul le
  // coach le découvrait après coup (bonus ponctualité perdu en silence).
  const enRetard = !_bilanEstPonctuel(data.createdAt, new Date().toISOString(), _bilanJourBilanNom);
  const retardWarn = enRetard
    ? `<div style="background:#3a1414;border:1px solid #e05555;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:#ff8a8a;text-align:left;">⏰ Bilan envoyé après le jour assigné (${esc(_bilanJourBilanNom || '')}) — le bonus ponctualité ne sera pas accordé cette semaine.</div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'recap-bilan-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  modal.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:28px 22px;text-align:center;max-width:320px;width:88%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:19px;font-weight:700;color:#e8eaf0;margin-bottom:3px;">Récap de ta semaine</div>
    <div style="font-size:12px;color:#8892a4;margin-bottom:16px;">${esc(data.semaineLabel || '')}</div>
    <div style="background:#0f1117;border-radius:12px;padding:4px 14px;margin-bottom:10px;">${statsHtml}</div>
    ${retardWarn}
    ${noteWarn}
    <div style="display:flex;gap:10px;margin-top:16px;">
      <button onclick="document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:#2d3142;margin:0;padding:12px;font-size:14px;border:none;border-radius:10px;color:#e8eaf0;cursor:pointer;">Modifier</button>
      <button onclick="_validerEtEnvoyerSupa();document.getElementById('recap-bilan-modal').remove();" style="flex:1;background:linear-gradient(135deg,#1D9E75,#167a5a);margin:0;padding:12px;font-size:14px;font-weight:700;border:none;border-radius:10px;color:#fff;cursor:pointer;">Envoyer au coach ✓</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => {
    modal.style.opacity = '1';
    modal.querySelector('div').style.transform = 'scale(1)';
  });
}

async function _validerEtEnvoyerSupa() {
  setPage('bilan-loading');
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    await _supaUpdateBilan({ envoye_coach: true, date_validation: today, envoye_at: now.toISOString() });
    if (_bilanData) { _bilanData.dejaEnvoye = true; _bilanData.dateValidation = today; }
    const xpGagne = await _crediterXpBilanEnvoye(_bilanId, (_bilanData && _bilanData.jours) || [], getClient(), (_bilanData && _bilanData.createdAt) || today, now.toISOString());
    // Afficher overlay XP simplifié
    await loadBilan();
    _afficherXPValidationSupa(xpGagne);
    if (typeof rafraichirProgressionEtDeblocages === 'function') rafraichirProgressionEtDeblocages();
  } catch(e) {
    showToast('Erreur : ' + e.message, '#c0392b');
    setPage('bilan');
  }
}

// Incrémente client_progression.xp_total — action déjà dédoublonnée par
// l'appelant (bilans.xp_credite, jours[idx].valide/seance_validee) : ici on
// se contente d'additionner, jamais de recalculer/écraser.
async function _supaIncrementerXpTotal(clientId, delta) {
  if (!delta) return 0;
  const progRes = await fetch(`${SUPABASE_URL}/rest/v1/client_progression?client_id=eq.${encodeURIComponent(clientId)}&select=xp_total`, { headers: supaHeaders() });
  const progArr = progRes.ok ? await progRes.json() : [];
  const xpActuel = (progArr[0] && progArr[0].xp_total) || 0;
  await fetch(`${SUPABASE_URL}/rest/v1/client_progression?on_conflict=client_id`, {
    method: 'POST',
    headers: supaHeaders({ Prefer: 'return=minimal,resolution=merge-duplicates' }),
    body: JSON.stringify({ client_id: clientId, xp_total: xpActuel + delta, updated_at: new Date().toISOString() })
  });
  return delta;
}

// ── Économie XP — répartition alignée sur la PWA (GAS) de référence ─────
const XP_BILAN_BASE            = 50;
const BONUS_DIETE_6SUR7        = 15;
const BONUS_DIETE_7SUR7        = 30; // remplace le bonus 6/7, pas cumulatif
const BONUS_SEANCES_100PCT     = 25; // 100% de l'objectif séances/semaine (client_profils.seances_cible)
// Pas de constante fixe pour l'XP pas : voir xpPasExcedent plus bas — dépend du couple
// (excédent, objectif du coach), pas d'une valeur unitaire fixe. Plafonnée à :
const XP_PAS_MAX_HEBDO = 15;
const BONUS_PONCTUALITE        = 20; // bilan envoyé au plus tard le jour de bilan assigné, avant midi
const STREAK_BONUS             = { 3: 30, 6: 50, 10: 100 }; // bilans consécutifs envoyés ET ponctuels

// _JOURS_IDX_FR, _bilanWeekBounds, _bilanEstPonctuel sont partagés avec le
// coach (console.html) — définis une seule fois dans api.js.

// Compte les bilans envoyés consécutifs (les plus récents d'abord) tant
// qu'ils sont ponctuels ET que les semaines se suivent sans trou — une
// semaine sautée (vacances, etc.) casse la série même si les bilans
// avant/après sont eux-mêmes ponctuels.
async function _calculerStreakBilans(clientId, jourBilanNom) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/bilans?client_id=eq.${encodeURIComponent(clientId)}&envoye_coach=eq.true&order=date_validation.desc&limit=15&select=created_at,date_validation,envoye_at`,
    { headers: supaHeaders() }
  );
  const arr = res.ok ? await res.json() : [];
  let streak = 0;
  let semaineAttendue = null;
  for (const b of arr) {
    if (!b.date_validation) break;
    const envoyeAt = b.envoye_at || (b.date_validation + 'T12:00:00');
    if (!_bilanEstPonctuel(b.created_at, envoyeAt, jourBilanNom)) break;
    const { fin } = _bilanWeekBounds(jourBilanNom, new Date(b.created_at));
    if (semaineAttendue && fin.getTime() !== semaineAttendue.getTime()) break; // semaine manquée
    streak++;
    semaineAttendue = new Date(fin);
    semaineAttendue.setDate(semaineAttendue.getDate() - 7);
  }
  return streak;
}

// Crédite l'XP d'un bilan envoyé — une seule fois par bilan (dédoublonné
// côté serveur via bilans.xp_credite, jamais via un flag localStorage).
// Appeler cette fonction plusieurs fois sur le même bilan est sans danger :
// le crédit n'est accordé qu'à la première fois où xp_credite vaut 0.
async function _crediterXpBilanEnvoye(bilanId, jours, clientId, bilanCreatedAt, dateValidationStr) {
  if (!bilanId) return 0;
  const chkRes = await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${bilanId}&select=xp_credite`, { headers: supaHeaders() });
  const chkArr = chkRes.ok ? await chkRes.json() : [];
  if (chkArr[0] && chkArr[0].xp_credite > 0) return 0; // déjà crédité, on ne recrédite jamais

  const profilRes = await fetch(`${SUPABASE_URL}/rest/v1/client_profils?client_id=eq.${encodeURIComponent(clientId)}&select=steps_cible,seances_cible,jour_bilan`, { headers: supaHeaders() });
  const profilArr = profilRes.ok ? await profilRes.json() : [];
  const profil = profilArr[0] || {};

  const joursTraining = jours.filter(j => j.training).length;
  const joursDiete    = jours.filter(j => j.diete).length;
  const totalSteps    = jours.reduce((s, j) => s + (j.steps || 0), 0);
  const stepsMoy       = jours.length ? Math.round(totalSteps / jours.length) : 0;

  const bonusDiete       = joursDiete >= 7 ? BONUS_DIETE_7SUR7 : joursDiete >= 6 ? BONUS_DIETE_6SUR7 : 0;
  const bonusSeances100  = (profil.seances_cible && joursTraining >= profil.seances_cible) ? BONUS_SEANCES_100PCT : 0;
  // XP pas : uniquement sur le DÉPASSEMENT de l'objectif du coach (steps_cible), pondéré
  // par la taille de cet objectif — le même excédent en pas doit rapporter plus à un
  // client à qui on a demandé beaucoup (12-15k, effort déjà proche du maximum réaliste)
  // qu'à un client à qui on a demandé peu (8k, marge de manœuvre confortable). Sans
  // pondération, un objectif bas dépassé largement grattait plus d'XP qu'un objectif haut
  // dépassé modestement, alors que le second demande objectivement plus d'effort pour le
  // même excédent — remplace l'ancien calcul (1 XP/500 pas sur la moyenne BRUTE, +
  // bonus fixe de 20 XP en atteignant l'objectif) qui ne tenait pas compte de ça.
  // Plafonné à XP_PAS_MAX_HEBDO — reste valorisant sans pouvoir faire s'envoler quelqu'un
  // au classement juste sur les pas (vélo compté comme des pas, écart naturel entre
  // profils selon le mode de vie...), et évite d'inciter à sur-déclarer ses pas pour
  // gratter toujours plus d'XP au-delà d'un certain point.
  const excedentPas      = profil.steps_cible ? Math.max(0, stepsMoy - profil.steps_cible) : 0;
  const xpPasExcedent    = profil.steps_cible ? Math.min(XP_PAS_MAX_HEBDO, Math.round((excedentPas / 500) * (profil.steps_cible / 5000))) : 0;
  const ponctuel         = _bilanEstPonctuel(bilanCreatedAt, dateValidationStr, profil.jour_bilan);
  const bonusPonctualite = ponctuel ? BONUS_PONCTUALITE : 0;
  const bonusStreak      = ponctuel ? (STREAK_BONUS[await _calculerStreakBilans(clientId, profil.jour_bilan)] || 0) : 0;

  const xpSemaine = XP_BILAN_BASE + bonusDiete + bonusSeances100 + xpPasExcedent + bonusPonctualite + bonusStreak;

  await fetch(`${SUPABASE_URL}/rest/v1/bilans?id=eq.${bilanId}`, {
    method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ xp_credite: xpSemaine })
  });
  await _supaIncrementerXpTotal(clientId, xpSemaine);
  return xpSemaine;
}

function _afficherXPValidationSupa(xpGagne) {
  const afficherXp = xpGagne && !(typeof modeSimplifieActif === 'function' && modeSimplifieActif());
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;opacity:0;transition:opacity 0.3s;';
  overlay.innerHTML = `<div style="background:#1a1d29;border-radius:20px;padding:36px 28px;text-align:center;max-width:300px;width:85%;box-shadow:0 20px 60px rgba(0,0,0,0.5);transform:scale(0.85);transition:transform 0.3s;">
    <div style="font-size:52px;margin-bottom:10px;">🏆</div>
    <div style="font-size:22px;font-weight:700;color:#e8eaf0;margin-bottom:4px;">Bilan envoyé !</div>
    <div style="font-size:13px;color:#8892a4;margin-bottom:${afficherXp ? '4px' : '24px'};">Bravo pour cette semaine !</div>
    ${afficherXp ? `<div style="font-size:15px;font-weight:700;color:#1D9E75;margin-bottom:24px;">🎉 +${xpGagne} XP</div>` : ''}
    <button id="_xpOverlayBtn" style="background:linear-gradient(135deg,#1D9E75,#167a5a);width:100%;margin:0;padding:14px;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Retour à l'accueil</button>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_xpOverlayBtn').addEventListener('click', () => {
    overlay.remove();
    loadHome();
  });
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.querySelector('div').style.transform = 'scale(1)';
  });
}

// ── Composants notation (partagés) ─────────────────────────────────────

const NOTES_PALETTE_QUALITE = ['#e05c5c', '#f0a500', '#eab308', '#8bc34a', '#1D9E75'];

function _paletteNote(groupeId) {
  return (groupeId.endsWith('_adh') || groupeId.endsWith('_dig') || groupeId.endsWith('_app')
    || groupeId === 'fatigue' || groupeId === 'sommeil') ? NOTES_PALETTE_QUALITE : null;
}

function _styleNoteBtn(i, valeur, palette) {
  const active = valeur === i;
  if (!palette) return `background:${active ? '#378ADD' : '#2d3142'};color:#e8eaf0;border:none;`;
  const c = palette[i - 1];
  return active
    ? `background:${c};color:#fff;border:none;`
    : `background:${c}22;color:${c};border:1px solid ${c}55;`;
}

function fmtFR(val) { return (val == null || val === '') ? '' : (val + '').replace('.', ','); }
function parseSteps(val) {
  if (!val) return '';
  const s = (val+'').trim().replace(/\s/g,'');
  if (/[.,]/.test(s)) return '';
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? '' : n;
}
function parseEau(val) {
  if (!val) return '';
  const n = parseFloat((val+'').trim().replace(/[~≈≃\s]/g,'').replace(',','.'));
  return isNaN(n) ? '' : n;
}
function parsePoids(val) {
  if (!val) return '';
  const n = parseFloat((val+'').trim().replace(',','.'));
  return isNaN(n) ? '' : n;
}
function esc(s) { return (s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showToast(msg, bg) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:${bg||'linear-gradient(135deg,#1a5ba0,#1D9E75)'};color:#fff;padding:13px 22px;border-radius:14px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.4);text-align:center;max-width:82vw;opacity:1;transition:opacity .5s;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2500);
}

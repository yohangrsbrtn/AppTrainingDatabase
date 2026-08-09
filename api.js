// Quand le coach navigue en "vue client" (enterVueClient/exitVueClient dans
// index.html), ce champ porte l'identité du client visé.
let _viewAsClientOverride = null;

// _viewAsClientOverride prioritaire : sinon toute page qui lit getClient() (bilan,
// programme, progression, protocole, training perso, collection...) retombe sur
// localStorage.at_client, qui reste l'identité du COACH en vue client (enterVueClient
// ne le réécrit jamais) — bug vécu : en vue client sur Éric de Lorenzo, "Mon bilan"
// affichait le bilan du COACH (jour_bilan différent) au lieu de celui d'Éric.
function getClient() { return _viewAsClientOverride || localStorage.getItem('at_client') || ''; }

// ── Courbe de niveau progressive (2026-08-05) ───────────────────────────
// Remplace l'ancien palier plat (XP_PAR_NIVEAU=50, aligné sur le système GAS
// mais jugé trop rapide par le coach une fois vu à l'usage réel — niveau 60
// en ~3,5 mois pour un client assidu). Nouvelle règle : passer du niveau N
// au niveau N+1 coûte `NIVEAU_COUT_PALIER × N` XP (coût croissant, comme un
// jeu classique) — calibrée avec le coach pour qu'un client "assez assidu"
// (avec vacances et oublis, ~180 XP/semaine sur ~42 semaines actives/an)
// atteigne le niveau 60 en environ 1 an (~8000 XP cumulés).
// XP cumulée pour ATTEINDRE le niveau N (niveau 1 = 0 XP) : coût(n)=k×n pour
// n=1..N-1, somme = k×N×(N-1)/2.
const NIVEAU_COUT_PALIER = 4.5;
function _xpPourNiveau(niveau) {
  const n = Math.max(1, niveau);
  return Math.round(NIVEAU_COUT_PALIER * n * (n - 1) / 2);
}
// Inverse de _xpPourNiveau : plus grand N tel que _xpPourNiveau(N) <= xpTotal.
// Résolution directe de k×N×(N-1)/2 <= xp -> N <= (1+sqrt(1+8×xp/k))/2.
function _niveauDepuisXp(xpTotal) {
  const xp = Math.max(0, xpTotal || 0);
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / NIVEAU_COUT_PALIER)) / 2));
}

const SUPABASE_URL      = 'https://sfacjbwiczwkcjpwneyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmYWNqYndpY3p3a2NqcHduZXlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MjgzNTAsImV4cCI6MjEwMDIwNDM1MH0.mrjPbOuQROMihzxZWrUNbncQIos0jK2VexpQDoRZXzY';
function supaHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, extra || {});
}

// ── Semaine de bilan — source unique partagée client (bilan.js) + coach
// (console.html). Une semaine de bilan se termine la VEILLE du jour assigné au
// client (client_profils.jour_bilan), pas le jour même (2026-08-03, demande coach) :
// un client qui remplit son bilan le matin de son jour_bilan n'a pas encore vécu
// cette journée (pas/diète/etc. pas encore remplis) — ex: jour_bilan='Dimanche'
// donne des semaines dimanche→samedi (pas dimanche→dimanche). Généralisé à TOUS
// les jour_bilan, pas seulement Dimanche : jour_bilan='Mercredi' donne mercredi→mardi.
// Sans jour_bilan renseigné, on retombe sur Dimanche (donc semaine dimanche→samedi).
const _JOURS_IDX_FR = { Lundi:0, Mardi:1, Mercredi:2, Jeudi:3, Vendredi:4, Samedi:5, Dimanche:6 };

// Normalise la casse avant recherche dans _JOURS_IDX_FR (clés capitalisées) — certains
// client_profils.jour_bilan ont été saisis/migrés en minuscules ("lundi" au lieu de "Lundi").
// Sans cette normalisation, `in _JOURS_IDX_FR` échoue silencieusement et la semaine retombe
// sur le défaut Dimanche au lieu du jour réellement configuré (bug vécu : jour_bilan="lundi"
// pour une cliente, dont toutes les semaines de bilan étaient calculées comme si elle n'avait
// aucun jour_bilan réglé — labels "Du <dv> au <dv+6>" au lieu de "Du <dv-6> au <dv>").
function _normJourBilan(s) {
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function _bilanWeekBounds(jourBilanNom, refDate) {
  refDate = refDate || new Date();
  jourBilanNom = _normJourBilan(jourBilanNom);
  const rawIdx   = (jourBilanNom && jourBilanNom in _JOURS_IDX_FR) ? _JOURS_IDX_FR[jourBilanNom] : 6;
  const cibleIdx = (rawIdx - 1 + 7) % 7; // la veille du jour_bilan = dernier jour de la semaine
  const curIdx   = (refDate.getDay() + 6) % 7; // Lundi=0...Dimanche=6
  const delta    = (cibleIdx - curIdx + 7) % 7; // jours jusqu'à la prochaine occurrence (0 = aujourd'hui)
  const fin = new Date(refDate);
  fin.setDate(refDate.getDate() + delta);
  fin.setHours(23, 59, 59, 999);
  const debut = new Date(fin);
  debut.setDate(fin.getDate() - 6);
  debut.setHours(0, 0, 0, 0);
  return { debut, fin };
}

// Deadline réelle d'un bilan = le jour_bilan lui-même à midi (`fin` de
// _bilanWeekBounds est la VEILLE du jour_bilan à 23:59:59, donc +1 jour ici).
// Source unique partagée par _bilanEstPonctuel (bonus XP) ET
// _supaGetOrCreateBilanCourant (bilan.js, décide si on bascule sur la semaine
// suivante) — les deux doivent utiliser EXACTEMENT la même limite, sinon le
// bilan de la semaine prochaine peut apparaître AVANT que le délai d'envoi de
// la semaine en cours soit passé (bug vécu : jour_bilan=Mercredi, un nouveau
// bilan "semaine prochaine" était créé dès mercredi 00h00 au lieu d'attendre
// mercredi midi, alors que le client avait jusqu'à midi pour envoyer).
function _bilanDeadline(jourBilanNom, refDate) {
  const { fin } = _bilanWeekBounds(jourBilanNom, refDate);
  const limite = new Date(fin);
  limite.setDate(limite.getDate() + 1);
  limite.setHours(12, 0, 0, 0);
  return limite;
}

// Ponctuel = envoyé au plus tard le jour de bilan assigné (client_profils.jour_bilan),
// avant midi — envoyer plus tôt dans la semaine est toujours ponctuel, envoyer ce
// jour-là après midi ou un jour plus tard ne l'est pas. Sans jour assigné, toujours
// ponctuel (pas de pénalité pour un réglage non fait). Les bilans migrés depuis GAS
// n'ont pas d'heure exacte (envoye_at) — on retombe sur la date à midi pile, ni
// pénalisé ni avantagé.
function _bilanEstPonctuel(bilanCreatedAt, envoyeAtStr, jourBilanNom) {
  if (!jourBilanNom || !(jourBilanNom in _JOURS_IDX_FR) || !bilanCreatedAt || !envoyeAtStr) return true;
  const limite = _bilanDeadline(jourBilanNom, new Date(bilanCreatedAt));
  return new Date(envoyeAtStr) <= limite;
}

// Un bilan ENVOYÉ (envoye_coach=true) mais envoyé après sa propre deadline (jour_bilan à midi) —
// distinct de "en retard" au sens habituel du mot dans la console (qui désigne un bilan pas
// encore envoyé du tout, cf. _supaCalculerRetard). Même source de vérité que le bonus XP
// (_bilanEstPonctuel) pour ne jamais désynchroniser les deux notions de ponctualité.
function _bilanEnvoiEnRetard(b, jourBilanNom) {
  if (!b || !b.envoye_coach) return false;
  const envoyeAt = b.envoye_at || (b.date_validation ? b.date_validation + 'T12:00:00' : null);
  return !_bilanEstPonctuel(b.created_at, envoyeAt, jourBilanNom);
}

// ── Protocole chimie — moteur de calcul partagé coach (console.html) +
// client (protocole.js), même logique que le générateur Google Sheets
// (genererProtocole/genererPlanning) : totaux du cycle par molécule +
// planning semaine par semaine avec le dosage par prise.
function _protocoleCalculerMolecule(m, dureeSemaines) {
  const categorie      = m.categorie;
  const parJourSemaine = m.par_jour_semaine;
  const dosageProduit   = Number(m.dosage_produit) || 0;
  const dosagePrise     = Number(m.dosage_prise) || 0;
  const intervalle      = Number(m.intervalle) || 1;

  let semDebut, semFin, nbSemaines;
  if (categorie === 'GH') {
    semDebut = 1; semFin = dureeSemaines; nbSemaines = dureeSemaines;
  } else {
    semDebut   = parseInt(m.semaine_debut) || 1;
    semFin     = parseInt(m.semaine_fin) || semDebut;
    nbSemaines = semFin - semDebut + 1;
  }

  let totalMg = 0, doseParPrise = 0, nbInjParSem = 0, dosageHebdoMg = 0;
  let totalConverti = '', quantiteRequise = '';

  if (categorie === 'Injectable') {
    nbInjParSem = Math.round((7 / intervalle) * 10) / 10;
    const dosageParSem = parJourSemaine === 'Jour' ? dosagePrise * 7 : dosagePrise;
    totalMg = dosageParSem * nbSemaines;
    doseParPrise = dosageParSem / nbInjParSem;
    dosageHebdoMg = dosageParSem;
    if (dosageProduit > 0) {
      const totalMl = totalMg / dosageProduit;
      totalConverti = (Math.round(totalMl * 10) / 10) + ' ml';
      quantiteRequise = Math.ceil(totalMl / 10) + ' viale(s) 10ml';
    }
  } else if (categorie === 'Oral') {
    const dosageParJour = parJourSemaine === 'Semaine' ? dosagePrise / 7 : dosagePrise;
    totalMg = dosageParJour * 7 * nbSemaines;
    doseParPrise = dosageParJour;
    dosageHebdoMg = dosageParJour * 7;
    if (dosageProduit > 0) {
      const nbCp = Math.ceil(totalMg / dosageProduit);
      totalConverti = nbCp + ' cp';
      quantiteRequise = nbCp + ' comprimés';
    }
  } else if (categorie === 'GH') {
    const dosageParJour = parJourSemaine === 'Semaine' ? dosagePrise / 7 : dosagePrise;
    totalMg = dosageParJour * 7 * nbSemaines;
    doseParPrise = dosageParJour;
    dosageHebdoMg = dosageParJour * 7;
    totalConverti = Math.round(totalMg) + ' UI';
    if (dosageProduit > 0) quantiteRequise = Math.ceil(totalMg / dosageProduit) + ' flacon(s) de ' + dosageProduit + ' UI';
  }

  return Object.assign({}, m, {
    categorie, dosageProduit, dosagePrise, intervalle,
    semDebut, semFin, nbSemaines, nbInjParSem, doseParPrise,
    totalMg, totalConverti, quantiteRequise, dosageHebdoMg,
  });
}

// Texte affiché pour une molécule à la semaine `s` (1-based) — '—' si la
// molécule n'est pas active cette semaine-là (jamais le cas pour GH).
function _protocoleCalculerSemaine(mol, s) {
  if (mol.categorie !== 'GH' && (s < mol.semDebut || s > mol.semFin)) return '—';

  if (mol.categorie === 'Injectable') {
    const mlParInj = mol.dosageProduit > 0 ? Math.round((mol.doseParPrise / mol.dosageProduit) * 100) / 100 : 0;
    const intervalle = mol.intervalle;
    if (intervalle === 1)   return `${mlParInj}ml · quotidien`;
    if (intervalle === 3.5) return `${mlParInj}ml × 2x/sem`;
    if (intervalle === 7)   return `${mlParInj}ml × 1x/sem`;
    return `${mlParInj}ml/inj · E${intervalle}D`;
  }
  if (mol.categorie === 'Oral') {
    const nbCp = mol.dosageProduit > 0 ? Math.round(mol.doseParPrise / mol.dosageProduit * 10) / 10 : '';
    return nbCp ? `${nbCp}cp/j` : `${mol.doseParPrise}mg/j`;
  }
  if (mol.categorie === 'GH') return `${mol.doseParPrise}UI/j`;
  return '';
}

// Calcule le cycle complet (totaux par molécule + planning semaine par
// semaine avec statut passée/en cours/à venir) à partir d'un protocole
// `{ date_debut, duree_semaines }` et de ses molécules brutes (lignes
// client_protocole_molecules). Utilisé tel quel par console.html (coach,
// création/édition + preview) et protocole.js (client, lecture seule).
function _protocoleCalculer(protocole, molecules) {
  const dureeSemaines = parseInt(protocole.duree_semaines) || 12;
  const molsCalc = (molecules || []).map(m => _protocoleCalculerMolecule(m, dureeSemaines));

  const dateDebut = new Date(protocole.date_debut);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const semaines = [];
  for (let s = 1; s <= dureeSemaines; s++) {
    const dateS = new Date(dateDebut); dateS.setDate(dateDebut.getDate() + (s - 1) * 7);
    const dateFin = new Date(dateS); dateFin.setDate(dateS.getDate() + 6);
    dateS.setHours(0, 0, 0, 0); dateFin.setHours(0, 0, 0, 0);

    let statut = 'future';
    if (today > dateFin) statut = 'passee';
    else if (today >= dateS && today <= dateFin) statut = 'encours';

    semaines.push({
      numero: s, date: dateS, statut,
      doses: molsCalc.map(m => ({ nom: m.nom, texte: _protocoleCalculerSemaine(m, s) })),
    });
  }

  return { molecules: molsCalc, semaines };
}

// ── Analyses de sang (marqueurs) — catégorisation partagée coach (console) +
// client (protocole.js). Portage fidèle de l'ancien classement GAS (par mots-
// clés, pas par nom exact — le libellé est saisi manuellement et peut varier).
const CATEGORIES_ANALYSES = [
  { nom: 'Hémogramme (NFS)', motsCles: ['hemat', 'hemoglob', 'leucocyte', 'polynucle', 'neutrophile', 'eosinophile', 'basophile', 'lymphocyte', 'monocyte', 'plaquette', 'vgm', 'tcmh', 'ccmh', 'idr'] },
  { nom: 'Bilan hépatique', motsCles: ['transaminase', 'asat', 'alat', 'sgot', 'sgpt', 'gamma gt', 'ggt', 'phosphatase alcaline', 'bilirubine', 'fib4'] },
  { nom: 'Bilan rénal', motsCles: ['creatinine', 'dfg', 'albuminurie', 'albumine urinaire', 'uree'] },
  { nom: 'Ionogramme sanguin', motsCles: ['sodium', 'potassium', 'chlore', 'calcium'] },
  { nom: 'Bilan glucido-lipidique', motsCles: ['glycemie', 'cholesterol', 'triglyceride', 'hba1c'] },
  { nom: 'Bilan thyroïdien', motsCles: ['tsh', 'thyro'] },
  { nom: 'Bilan hormonal', motsCles: ['testosterone', 'prolactine', 'psa', 'oestradiol', 'estradiol', ' lh', ' fsh', 'shbg', 'cortisol'] },
  { nom: 'Inflammation', motsCles: ['crp', 'vitesse de sedimentation'] },
  { nom: 'Bilan martial', motsCles: ['ferritine', 'fer serique', 'transferrine', 'coefficient de saturation'] },
  { nom: 'Vitamines', motsCles: ['vitamine'] },
];

function _normaliserTexteAnalyse(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function categoriserMarqueur(nom) {
  const n = _normaliserTexteAnalyse(nom);
  for (const cat of CATEGORIES_ANALYSES) {
    if (cat.motsCles.some(mc => n.includes(_normaliserTexteAnalyse(mc)))) return cat.nom;
  }
  return 'Autres';
}

// bas/haut si des bornes de référence existent pour ce marqueur, sinon toujours 'normal'.
function statutAnalyse(valeur, refMin, refMax) {
  if (refMin !== null && refMin !== undefined && valeur < refMin) return { code: 'bas', label: 'Bas', couleur: '#378ADD' };
  if (refMax !== null && refMax !== undefined && valeur > refMax) return { code: 'haut', label: 'Haut', couleur: '#D85A30' };
  return { code: 'normal', label: 'Normal', couleur: '#1D9E75' };
}

// ── Swipe-to-close pour les volets "bottom sheet" ───────────────────────
// Glisser vers le bas depuis le haut du volet le ferme — comportement standard
// sur mobile que l'utilisateur essaiera de toute façon en premier. Utilisé par
// tous les volets de index.html/diete.js/programme-client.js portant la classe
// "sheet-handle"/"sheet-body".
// onClose optionnel : certains volets doivent nettoyer autre chose qu'un
// simple .remove() à la fermeture (ex: arrêter la caméra du scan code-barres
// dans diete.js — sinon le flux vidéo reste actif en arrière-plan).
//
// Piège corrigé (2026-08-03, signalé par le coach) : la zone de prise n'était
// QUE le trait visuel lui-même (36×4px, quasi impossible à viser précisément
// au doigt) — tout glissé qui le manquait de peu tombait sur un élément sans
// touch-action, et le geste tombait à travers jusqu'à l'arrière-plan (la page
// derrière le volet scrollait/bougeait). Fix en 2 parties : (1) une zone de
// prise invisible bien plus large, superposée en haut du volet (hors la
// colonne de droite où se trouve parfois un bouton ✕, pour ne pas le bloquer),
// sert de vraie zone de glisser-fermer ; (2) verrou de scroll d'arrière-plan
// centralisé (voir plus bas) tant qu'un volet est ouvert, filet de sécurité
// même si un geste démarre ailleurs que sur cette zone.
function attacherSwipeFermeture(overlayEl, onClose) {
  if (!overlayEl) return;
  const handle = overlayEl.querySelector('.sheet-handle');
  const sheet  = overlayEl.querySelector('.sheet-body');
  if (!handle || !sheet) return;
  const SEUIL = 80;
  let startY = null, dy = 0, dragging = false;

  const zone = document.createElement('div');
  zone.style.cssText = 'position:absolute;top:0;left:12px;right:56px;height:34px;touch-action:none;z-index:1;';
  if (getComputedStyle(sheet).position === 'static') sheet.style.position = 'relative';
  sheet.insertBefore(zone, sheet.firstChild);

  zone.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY; dy = 0; dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });
  zone.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 4) e.preventDefault(); // bloque le scroll/rebond d'arrière-plan pendant le glisser
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const finDrag = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = 'transform 0.22s ease';
    if (dy > SEUIL) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => onClose ? onClose() : overlayEl.remove(), 180);
    } else {
      sheet.style.transform = 'translateY(0)';
    }
  };
  zone.addEventListener('touchend', finDrag);
  zone.addEventListener('touchcancel', finDrag);
}

// Verrou de scroll d'arrière-plan tant qu'au moins un volet (.sheet-body) est
// ouvert — centralisé via MutationObserver plutôt que dupliqué dans chaque
// fonction d'ouverture/fermeture (une dizaine de points d'entrée différents
// entre index.html/diete.js/programme-client.js, pas tous nettoyés au même
// endroit). Technique classique iOS Safari : body en position:fixed pendant le
// verrou, restauration exacte du scroll au déverrouillage.
(function () {
  let scrollYAvantLock = 0, verrouille = false;
  function appliquerVerrouScroll() {
    const doitVerrouiller = !!document.querySelector('.sheet-body');
    if (doitVerrouiller && !verrouille) {
      scrollYAvantLock = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = '-' + scrollYAvantLock + 'px';
      document.body.style.width = '100%';
      verrouille = true;
    } else if (!doitVerrouiller && verrouille) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollYAvantLock);
      verrouille = false;
    }
  }
  if (typeof document !== 'undefined' && document.body) {
    new MutationObserver(appliquerVerrouScroll).observe(document.body, { childList: true });
  }
})();
